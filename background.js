// Импорт утилит
import { DEBUG, log } from './src/shared/debug.js';
import { parseActiveBookmarkTitle, parseCompletedBookmarkTitle, createCompletedBookmarkTitle } from './src/shared/bookmarkParser.js';
import { notifyPanelUpdate } from './src/shared/notifications.js';
import { initializeBookmarksFolder, getFolderIds } from './src/background/folderManager.js';
import { getActivePages, getCompletedPages, addPageToActive, removePage } from './src/background/bookmarkOperations.js';
import { startTimeChecker, initAlarmListener, checkAndRestoreOldPages } from './src/background/scheduler.js';
import { 
  restoreCycleState, 
  movePageToCompleted, 
  setPageInterval, 
  startTasksCycle, 
  handleTabRemove,
  openSinglePage,
  getTabStatus
} from './src/background/cycle.js';

chrome.runtime.onInstalled.addListener(async () => {
  // Создаем контекстное меню для добавления страниц в панель
  chrome.contextMenus.create({
    id: "addToPanel",
    title: "Add to 00 UTC | Daily Task Tracker",
    contexts: ["page"]
  });
  
  // Отключаем автоматическое открытие панели по клику (обрабатываем вручную)
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error) => console.error(error));
  
  // Создаём или находим папки в закладках
  await initializeBookmarksFolder();
  
  // Запускаем периодическую проверку времени
  await startTimeChecker();
});

// Запускаем проверку времени при старте service worker
chrome.runtime.onStartup.addListener(async () => {
  await initializeBookmarksFolder();
  await startTimeChecker();
});

// ВАЖНО: В Manifest V3 глобальные переменные НЕ персистентны!
// Service worker засыпает через 30 секунд → все let/const обнуляются
// Используем chrome.storage.session для хранения данных между пробуждениями

// Слушаем подключения от sidepanel (для отслеживания активных соединений)
let sidePanelConnections = 0;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    sidePanelConnections++;
    
    port.onDisconnect.addListener(() => {
      sidePanelConnections--;
      if (sidePanelConnections <= 0) {
        sidePanelConnections = 0;
      }
    });
  }
});

// Инициализация слушателя alarm
initAlarmListener();

// Восстановление состояния цикла
restoreCycleState();

// Обработчик закрытия вкладок
chrome.tabs.onRemoved.addListener(handleTabRemove);

// Обработчик клика по контекстному меню
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "addToPanel") {
    try {
      // Добавляем страницу и получаем результат
      const result = await addPageToActive(tab);
      
      if (result && result.exists) {
        // Страница уже добавлена
        chrome.tabs.sendMessage(tab.id, { 
          action: 'showAlreadyAddedNotification',
          title: tab.title 
        }).catch(() => {});
      } else {
        // Страница успешно добавлена
        chrome.tabs.sendMessage(tab.id, { 
          action: 'showAddedNotification',
          title: tab.title 
        }).catch(() => {
          // Игнорируем ошибки (страница может не поддерживать content scripts)
        });
      }
    } catch (error) {
      console.error('Error adding page from context menu:', error);
    }
  }
});

// Обработчик сообщений от popup, боковой панели и content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openSinglePage') {
    // Открытие ОДНОЙ страницы БЕЗ прерывания активного цикла
    openSinglePage(request.url, request.bookmarkId);
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'getActivePages') {
    getActivePages().then(pages => sendResponse({ pages }));
    return true; // Асинхронный ответ
  } else if (request.action === 'getCompletedPages') {
    getCompletedPages().then(pages => sendResponse({ pages }));
    return true; // Асинхронный ответ
  } else if (request.action === 'moveToCompleted') {
    movePageToCompleted(request.bookmarkId).then(() => {
      sendResponse({ success: true });
    });
    return true; // Асинхронный ответ
  } else if (request.action === 'setPageInterval') {
    setPageInterval(request.bookmarkId, request.intervalHours).then(() => {
      sendResponse({ success: true });
    });
    return true; // Асинхронный ответ
  } else if (request.action === 'removePage') {
    removePage(request.bookmarkId).then(() => {
      sendResponse({ success: true });
    });
    return true; // Асинхронный ответ
  } else if (request.action === 'restorePage') {
    // Перемещаем из Completed в Active
    (async () => {
      const ids = await getFolderIds();
      await chrome.bookmarks.move(request.bookmarkId, { parentId: ids.active });
      // Парсим метаданные Completed и создаём метаданные Active
      const bookmark = await chrome.bookmarks.get(request.bookmarkId);
      const parsed = parseCompletedBookmarkTitle(bookmark[0].title);
      // Восстанавливаем с тем же resetType, что был
      const newTitle = `${parsed.title} [${parsed.resetType}]`;
      
      await chrome.bookmarks.update(request.bookmarkId, { 
        title: newTitle,
        url: bookmark[0].url
      });
      notifyPanelUpdate();
      sendResponse({ success: true });
    })();
    return true; // Асинхронный ответ
  } else if (request.action === 'openNextPage') {
    // Запуск цикла (используется кнопкой "Запустить задачи" в панели)
    startTasksCycle();
    sendResponse({ success: true });
  } else if (request.action === 'continueAfterInterval') {
    // УСТАРЕЛО: цикл продолжается автоматически при закрытии диалога
    sendResponse({ success: true });
  } else if (request.action === 'clearAll') {
    // Удаляем все страницы из Active
    (async () => {
      const pages = await getActivePages();
      for (const page of pages) {
        await removePage(page.id);
      }
      sendResponse({ success: true });
    })();
    return true; // Асинхронный ответ
  } else if (request.action === 'setResetType') {
    // Обновляем resetType в метаданных закладки Active
    (async () => {
      try {
        const bookmark = await chrome.bookmarks.get(request.bookmarkId);
        if (bookmark && bookmark[0]) {
          const parsed = parseActiveBookmarkTitle(bookmark[0].title);
          const newTitle = `${parsed.title} [${request.resetType}]`;
          await chrome.bookmarks.update(request.bookmarkId, { title: newTitle });
          notifyPanelUpdate();
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error setting reset type:', error);
        sendResponse({ success: false });
      }
    })();
    return true; // Асинхронный ответ
  } else if (request.action === 'moveToCompletedWithInterval') {
    // УСТАРЕЛО: обратная совместимость, просто обновляем интервал
    (async () => {
      await setPageInterval(request.bookmarkId, request.intervalHours);
      sendResponse({ success: true });
    })();
    return true;
  } else if (request.action === 'restoreAllAndStart') {
    // Восстановить все из Completed в Active и запустить
    (async () => {
      // Отправляем сообщение боковой панели закрыться
      chrome.runtime.sendMessage({ action: 'closeSidePanel' }).catch(() => {});
      
      // Небольшая задержка для закрытия панели
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const completedPages = await getCompletedPages();
      
      if (completedPages.length === 0) {
        sendResponse({ success: false, message: 'No completed pages' });
        return;
      }
      
      // Переносим все страницы из Completed в Active
      for (const page of completedPages) {
        const ids = await getFolderIds();
        await chrome.bookmarks.move(page.id, { parentId: ids.active });
        
        const newTitle = `${page.title} [${page.resetType}]`;
        
        await chrome.bookmarks.update(page.id, { 
          title: newTitle,
          url: page.url
        });
      }
      
      notifyPanelUpdate();
      
      // Запускаем цикл
      await startTasksCycle();
      
      sendResponse({ success: true });
    })();
    return true;
  } else if (request.action === 'startStealthMode') {
    (async () => {
      chrome.runtime.sendMessage({ action: 'closeSidePanel' }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 100));
      await startTasksCycle();
      sendResponse({ success: true });
    })();
    return true;
  } else if (request.action === 'startDailyTasks') {
    startTasksCycle();
    sendResponse({ success: true });
  } else if (request.action === 'getMyTabStatus') {
    // Content script спрашивает: "Я задача? Я из цикла?"
    const tabId = sender.tab?.id;
    const status = getTabStatus(tabId);
    sendResponse(status);
    return true;
  } else if (request.action === 'toggleBanner') {
    // Уведомляем все вкладки об изменении настройки баннера
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'bannerSettingChanged', 
          enabled: request.enabled 
        }).catch(() => {
          // Игнорируем ошибки (вкладки без content script)
        });
      });
    });
    sendResponse({ success: true });
  } else if (request.action === 'checkRestore') {
    // Sidepanel запрашивает немедленную проверку восстановления (когда таймер достиг нуля)
    checkAndRestoreOldPages();
    sendResponse({ status: 'checking' });
  } else if (request.action === 'addCurrentTab') {
    // Добавление текущей вкладки в активные задачи
    (async () => {
      try {
        const tab = request.tab;
        if (tab && tab.url && !tab.url.startsWith('chrome://')) {
          const result = await addPageToActive(tab);
          notifyPanelUpdate();
          sendResponse({ 
            success: true, 
            exists: result?.exists || false,
            location: result?.location
          });
        } else {
          sendResponse({ success: false, message: 'Invalid tab' });
        }
      } catch (error) {
        console.error('Error adding current tab:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
});

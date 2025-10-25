// Импорт утилит
import { DEBUG, log } from './src/shared/debug.js';
import { parseActiveBookmarkTitle, parseCompletedBookmarkTitle, createCompletedBookmarkTitle } from './src/shared/bookmarkParser.js';
import { notifyPanelUpdate } from './src/shared/notifications.js';
import { initializeBookmarksFolder, getFolderIds } from './src/background/folderManager.js';
import { getActivePages, getCompletedPages, addPageToActive, removePage } from './src/background/bookmarkOperations.js';
import { startTimeChecker, initAlarmListener, checkAndRestoreOldPages } from './src/background/scheduler.js';

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

// Слушаем закрытие вкладок для автоматического открытия следующей
// Хранилище для отслеживания открытых вкладок из панели
// Структура: tabId -> {bookmarkId, fromCycle, isIntervalDialog, dialogFromCycle}
const openedTabs = new Map();
let isCycleMode = false; // Флаг режима автоматической отработки цикла
let currentWindowId = null; // Сохраняем windowId для открытия панели в конце
let cycleQueue = []; // Очередь страниц для цикла
let currentCycleIndex = 0; // Текущий индекс в очереди
let isProcessingNext = false; // Флаг блокировки параллельного открытия следующей страницы

// Восстановление состояния из session storage при старте SW
(async function restoreCycleState() {
  const { cycleState } = await chrome.storage.session.get('cycleState');
  if (cycleState) {
    isCycleMode = cycleState.isCycleMode || false;
    currentWindowId = cycleState.currentWindowId || null;
    cycleQueue = cycleState.cycleQueue || [];
    currentCycleIndex = cycleState.currentCycleIndex || 0;
    isProcessingNext = cycleState.isProcessingNext || false;
    
    // Восстанавливаем openedTabs с метаданными
    if (cycleState.openedTabs) {
      Object.entries(cycleState.openedTabs).forEach(([tabId, info]) => {
        openedTabs.set(Number(tabId), info);
      });
    }
  }
})();

// Сохранение состояния в session storage
async function saveCycleState() {
  await chrome.storage.session.set({
    cycleState: {
      isCycleMode,
      currentWindowId,
      cycleQueue,
      currentCycleIndex,
      isProcessingNext,
      openedTabs: Object.fromEntries(openedTabs)
    }
  });
}

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  // Получаем информацию о вкладке
  const tabInfo = openedTabs.get(tabId);
  if (!tabInfo) return;
  
  // Проверяем, не диалог ли интервала закрылся
  if (tabInfo.isIntervalDialog) {
    // Проверяем, есть ли сохраненный интервал в session storage
    const storageKey = `intervalDialog_${tabInfo.bookmarkId}`;
    chrome.storage.session.get(storageKey, async (result) => {
      if (result[storageKey]) {
        const { intervalHours } = result[storageKey];
        
        // Обновляем только интервал (страница уже в Completed)
        await setPageInterval(tabInfo.bookmarkId, intervalHours);
        notifyPanelUpdate();
        
        // Очищаем из storage
        chrome.storage.session.remove(storageKey);
      }
    });
    
    openedTabs.delete(tabId);
    await saveCycleState();
    
    // Продолжаем цикл ТОЛЬКО если диалог был для вкладки из цикла
    if (tabInfo.dialogFromCycle && isCycleMode) {
      currentCycleIndex++;
      await saveCycleState();
      openNextInCycle();
    }
    return;
  }
  
  if (!removeInfo.isWindowClosing) {
    const bookmarkId = tabInfo.bookmarkId;
    const wasFromCycle = tabInfo.fromCycle;
    
    openedTabs.delete(tabId);
    await saveCycleState();
    
    try {
      // Проверяем, что закладка всё ещё существует
      const bookmark = await chrome.bookmarks.get(bookmarkId);
      if (!bookmark || !bookmark[0]) return;
      
      const page = bookmark[0];
      const parsed = parseActiveBookmarkTitle(page.title);
      
      // Удаляем все вкладки с этим bookmarkId из openedTabs (на случай дубликатов)
      for (const [tId, info] of openedTabs.entries()) {
        if (info.bookmarkId === bookmarkId) {
          openedTabs.delete(tId);
        }
      }
      
      // Если тип = interval, перемещаем в Completed с интервалом по умолчанию и открываем диалог
      if (parsed.resetType === 'interval') {
        // Сразу перемещаем в Completed с интервалом 24 часа
        await movePageToCompleted(bookmarkId);
        await setPageInterval(bookmarkId, 24);
        
        // Получаем favicon
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(page.url).hostname}&sz=32`;
        
        // Открываем диалог для изменения интервала
        const dialogUrl = chrome.runtime.getURL('src/sidepanel/intervalDialog.html') + 
          `?bookmarkId=${bookmarkId}` +
          `&title=${encodeURIComponent(parsed.title)}` +
          `&url=${encodeURIComponent(page.url)}` +
          `&favicon=${encodeURIComponent(faviconUrl)}` +
          `&interval=24`;
        
        chrome.tabs.create({ url: dialogUrl }, async (dialogTab) => {
          if (dialogTab) {
            // Создаём запись для диалога с метаданными
            openedTabs.set(dialogTab.id, {
              bookmarkId: bookmarkId,
              fromCycle: false,
              isIntervalDialog: true,
              dialogFromCycle: wasFromCycle
            });
            
            await saveCycleState();
          }
        });
        // Цикл продолжится когда диалог закроется (если был из цикла)
        
      } else {
        // Тип midnight - сразу перемещаем в Completed
        await movePageToCompleted(bookmarkId);
        
        // Продолжаем цикл ТОЛЬКО если это была вкладка из цикла
        if (wasFromCycle && isCycleMode) {
          currentCycleIndex++;
          await saveCycleState();
          // Используем немедленный вызов вместо setTimeout для быстрого закрытия
          openNextInCycle();
        }
      }
    } catch (error) {
      console.error('Error handling tab close:', error);
    }
  }
});

// Функция перемещения страницы из Active в Completed
async function movePageToCompleted(bookmarkId) {
  try {
    const ids = await getFolderIds();
    const bookmark = await chrome.bookmarks.get(bookmarkId);
    
    if (!bookmark || !bookmark[0]) {
      console.error('Bookmark not found:', bookmarkId);
      return;
    }
    
    const page = bookmark[0];
    
    // Парсим метаданные из Active
    const parsed = parseActiveBookmarkTitle(page.title);
    
    // Создаём метаданные для Completed
    const completedAt = new Date().toISOString();
    const metadata = [
      completedAt,
      '', // restoreAt будет установлен позже для interval
      parsed.resetType,
      24, // resetInterval по умолчанию
      page.dateAdded ? new Date(page.dateAdded).toISOString() : new Date().toISOString()
    ].join('|');
    
    const newTitle = `${parsed.title} [${metadata}]`;
    
    // Перемещаем в Completed
    await chrome.bookmarks.move(bookmarkId, { parentId: ids.completed });
    await chrome.bookmarks.update(bookmarkId, { title: newTitle });
    
    notifyPanelUpdate();
    
    // Если interval - откроем диалог (сейчас всегда midnight из Active)
  } catch (error) {
    console.error('Error moving to completed:', error);
  }
}

// Функция установки интервала для отработанной страницы
async function setPageInterval(bookmarkId, intervalHours) {
  try {
    const bookmark = await chrome.bookmarks.get(bookmarkId);
    if (!bookmark || !bookmark[0]) return;
    
    const page = bookmark[0];
    const parsed = parseCompletedBookmarkTitle(page.title);
    
    const now = new Date();
    const restoreAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
    
    // Обновляем метаданные с новым restoreAt
    const metadata = [
      parsed.completedAt || now.toISOString(),
      restoreAt.toISOString(),
      'interval',
      intervalHours,
      parsed.addedAt
    ].join('|');
    
    const newTitle = `${parsed.title} [${metadata}]`;
    
    await chrome.bookmarks.update(bookmarkId, { title: newTitle });
    notifyPanelUpdate();
  } catch (error) {
    console.error('Error setting interval:', error);
  }
}

// Универсальная функция запуска цикла задач
async function startTasksCycle() {
  // Получаем все активные страницы
  const pages = await getActivePages();
  if (pages.length === 0) return;
  
  // Сохраняем очередь страниц и включаем режим цикла
  cycleQueue = pages;
  currentCycleIndex = 0;
  isCycleMode = true;
  await saveCycleState();
  
  // Открываем первую страницу
  openNextInCycle();
}

// Функция открытия следующей страницы из очереди
async function openNextInCycle() {
  if (!isCycleMode) return;
  
  // Блокировка параллельных вызовов при быстром закрытии вкладок
  if (isProcessingNext) {
    return;
  }
  
  isProcessingNext = true;
  await saveCycleState();
  
  try {
    // Проверка актуальности: ищем следующую задачу, которая ещё в Active
    const currentActivePages = await getActivePages();
    let nextPage = null;
    
    while (currentCycleIndex < cycleQueue.length) {
      const page = cycleQueue[currentCycleIndex];
      
      // Проверяем: эта задача ещё в Active?
      const stillActive = currentActivePages.some(active => active.id === page.id);
      
      if (stillActive) {
        // Нашли задачу, которая ещё не выполнена
        nextPage = page;
        break;
      } else {
        // Задача уже в Completed или удалена → пропускаем
        currentCycleIndex++;
      }
    }
    
    if (!nextPage) {
      // Все задачи завершены
      isCycleMode = false;
      cycleQueue = [];
      currentCycleIndex = 0;
      isProcessingNext = false;
      await saveCycleState();
      
      // Открываем страницу завершения
      if (currentWindowId) {
        const completedUrl = chrome.runtime.getURL('src/sidepanel/completed.html');
        chrome.tabs.create({ url: completedUrl, windowId: currentWindowId });
        currentWindowId = null;
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/completed.html') });
      }
      return;
    }
    
    // Открываем задачу
    chrome.tabs.create({ url: nextPage.url }, async (tab) => {
      if (tab) {
        // Создаём запись с полными метаданными для вкладки цикла
        openedTabs.set(tab.id, {
          bookmarkId: nextPage.id,
          fromCycle: true,
          isIntervalDialog: false,
          dialogFromCycle: false
        });
        
        if (!currentWindowId) {
          currentWindowId = tab.windowId;
        }
        // Разблокируем после успешного открытия вкладки
        isProcessingNext = false;
        await saveCycleState();
      }
    });
  } catch (error) {
    console.error('Error in openNextInCycle:', error);
    isProcessingNext = false;
    await saveCycleState();
  }
}

// Обработчик сообщений от popup, боковой панели и content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openSinglePage') {
    // Открытие ОДНОЙ страницы БЕЗ прерывания активного цикла
    // НЕ меняем isCycleMode - цикл продолжит работать независимо
    chrome.tabs.create({ url: request.url }, async (tab) => {
      if (tab && request.bookmarkId) {
        // Создаём запись с метаданными для одиночной вкладки
        openedTabs.set(tab.id, {
          bookmarkId: request.bookmarkId,
          fromCycle: false,
          isIntervalDialog: false,
          dialogFromCycle: false
        });
        await saveCycleState();
      }
      sendResponse({ success: true });
    });
    return true; // Асинхронный ответ
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
    if (tabId) {
      const tabInfo = openedTabs.get(tabId);
      if (tabInfo) {
        sendResponse({ 
          isTask: true, 
          fromCycle: tabInfo.fromCycle,
          isIntervalDialog: tabInfo.isIntervalDialog,
          dialogFromCycle: tabInfo.dialogFromCycle
        });
      } else {
        sendResponse({ isTask: false, fromCycle: false });
      }
    } else {
      sendResponse({ isTask: false, fromCycle: false });
    }
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

// Модуль обработки сообщений от popup, sidepanel и content scripts
import { getActivePages, getCompletedPages, addPageToActive, removePage } from './bookmarkOperations.js';
import { getFolderIds } from './folderManager.js';
import { movePageToCompleted, setPageInterval, startTasksCycle, openSinglePage, getTabStatus } from './cycle.js';
import { checkAndRestoreOldPages } from './scheduler.js';
import { parseActiveBookmarkTitle, parseCompletedBookmarkTitle } from '../shared/bookmarkParser.js';
import { notifyPanelUpdate } from '../shared/notifications.js';

export function initMessageHandler() {
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
}

// Модуль обработки сообщений от popup, sidepanel и content scripts
import { getActivePages, getCompletedPages, addPageToActive, removePage } from './bookmarkOperations.js';
import { getFolderIds } from './folderManager.js';
import { movePageToCompleted, movePageToActive, startTasksCycle, openSinglePage, getTabStatus } from './cycle.js';
import { checkAndRestoreOldPages } from './scheduler.js';
import { parseActiveBookmarkTitle, parseCompletedBookmarkTitle } from '../shared/bookmarkParser.js';
import { notifyPanelUpdate } from '../shared/notifications.js';
import { logError, logInfo } from '../shared/errorHandler.js';
import { ACTIONS } from '../shared/constants.js';

export function initMessageHandler() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    logInfo('messageHandler', `Received: ${request.action}`);
    
    if (request.action === ACTIONS.OPEN_SINGLE_PAGE) {
      // Открытие ОДНОЙ страницы БЕЗ прерывания активного цикла
      openSinglePage(request.url, request.bookmarkId);
      sendResponse({ success: true });
      return true;
    } else if (request.action === ACTIONS.GET_ACTIVE_PAGES) {
      getActivePages().then(pages => {
        logInfo('messageHandler', `Returning ${pages.length} active pages`);
        sendResponse({ pages });
      });
      return true; // Асинхронный ответ
    } else if (request.action === ACTIONS.GET_COMPLETED_PAGES) {
      getCompletedPages().then(pages => {
        logInfo('messageHandler', `Returning ${pages.length} completed pages`);
        sendResponse({ pages });
      });
      return true; // Асинхронный ответ
    } else if (request.action === ACTIONS.MOVE_TO_COMPLETED) {
      movePageToCompleted(request.bookmarkId).then(() => {
        sendResponse({ success: true });
      });
      return true; // Асинхронный ответ
    } else if (request.action === ACTIONS.REMOVE_PAGE) {
      removePage(request.bookmarkId).then(() => {
        sendResponse({ success: true });
      });
      return true; // Асинхронный ответ
    } else if (request.action === ACTIONS.ADD_PAGE) {
      // Добавление страницы в активные задачи (как из контекстного меню)
      (async () => {
        try {
          const tab = request.tab;
          logInfo('messageHandler', `Adding page: ${tab.title}`);
          const result = await addPageToActive(tab);
          sendResponse(result || { exists: false, added: false });
        } catch (error) {
          logError('addPage', error);
          sendResponse({ exists: false, added: false, error: error.message });
        }
      })();
      return true;
    } else if (request.action === ACTIONS.RESTORE_PAGE) {
      // Перемещаем из Completed в Active
      movePageToActive(request.bookmarkId).then(() => {
        sendResponse({ success: true });
      });
      return true; // Асинхронный ответ
    } else if (request.action === ACTIONS.OPEN_NEXT_PAGE) {
      // Запуск цикла (используется кнопкой "Запустить задачи" в панели)
      startTasksCycle();
      sendResponse({ success: true });
    } else if (request.action === ACTIONS.SET_RESET_TYPE) {
      // Обновляем resetType в метаданных закладки Active
      (async () => {
        try {
          const bookmark = await chrome.bookmarks.get(request.bookmarkId);
          if (bookmark && bookmark[0]) {
            const parsed = parseActiveBookmarkTitle(bookmark[0].title);
            
            logInfo('messageHandler', `Setting reset type to ${request.resetType} for: ${parsed.title}`);
            const newTitle = `${parsed.title} [${request.resetType}]`;
            await chrome.bookmarks.update(request.bookmarkId, { title: newTitle });
            notifyPanelUpdate();
          }
          sendResponse({ success: true });
        } catch (error) {
          logError('setResetType', error);
          sendResponse({ success: false });
        }
      })();
      return true; // Асинхронный ответ
    } else if (request.action === ACTIONS.RESTORE_ALL_AND_START) {
      // Восстановить все из Completed в Active и запустить
      (async () => {
        const completedPages = await getCompletedPages();
        
        if (completedPages.length === 0) {
          sendResponse({ success: false, message: 'No completed pages' });
          return;
        }
        
        logInfo('messageHandler', `Restoring all ${completedPages.length} completed pages and starting cycle`);
        
        // Отправляем сообщение боковой панели закрыться
        chrome.runtime.sendMessage({ action: ACTIONS.CLOSE_SIDE_PANEL }).catch(() => {});
        
        // Небольшая задержка для закрытия панели
        await new Promise(resolve => setTimeout(resolve, 100));
        
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
    } else if (request.action === ACTIONS.GET_TAB_STATUS) {
      // Content script спрашивает: "Я задача? Я из цикла?"
      const tabId = sender.tab?.id;
      const status = getTabStatus(tabId);
      sendResponse(status);
      return true;
    } else if (request.action === ACTIONS.TOGGLE_BANNER) {
      // Уведомляем все вкладки об изменении настройки баннера
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
            action: ACTIONS.BANNER_SETTING_CHANGED, 
            enabled: request.enabled 
          }).catch(() => {
            // Игнорируем ошибки (вкладки без content script)
          });
        });
      });
      sendResponse({ success: true });
    } else if (request.action === ACTIONS.CHECK_RESTORE) {
      // Sidepanel запрашивает немедленную проверку восстановления (когда таймер достиг нуля)
      logInfo('messageHandler', 'Manual restore check requested');
      checkAndRestoreOldPages();
      sendResponse({ status: 'checking' });
    }
  });
}

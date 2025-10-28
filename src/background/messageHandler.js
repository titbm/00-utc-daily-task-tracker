// Message handler module for popup, sidepanel, and content scripts
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
  // Open a SINGLE page WITHOUT interrupting the active cycle
      openSinglePage(request.url, request.bookmarkId);
      sendResponse({ success: true });
      return true;
    } else if (request.action === ACTIONS.GET_ACTIVE_PAGES) {
      getActivePages().then(pages => {
        logInfo('messageHandler', `Returning ${pages.length} active pages`);
        sendResponse({ pages });
      }).catch((error) => {
        logError('getActivePages', error);
        sendResponse({ pages: [] });
      });
  return true; // Async response
    } else if (request.action === ACTIONS.GET_COMPLETED_PAGES) {
      getCompletedPages().then(pages => {
        logInfo('messageHandler', `Returning ${pages.length} completed pages`);
        sendResponse({ pages });
      }).catch((error) => {
        logError('getCompletedPages', error);
        sendResponse({ pages: [] });
      });
  return true; // Async response
    } else if (request.action === ACTIONS.MOVE_TO_COMPLETED) {
      movePageToCompleted(request.bookmarkId).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        logError('moveToCompleted', error);
        sendResponse({ success: false, error: error.message });
      });
  return true; // Async response
    } else if (request.action === ACTIONS.REMOVE_PAGE) {
      removePage(request.bookmarkId).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        logError('removePage', error);
        sendResponse({ success: false, error: error.message });
      });
  return true; // Async response
    } else if (request.action === ACTIONS.ADD_PAGE) {
  // Add a page to active tasks (as from context menu)
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
  // Move from Completed to Active
      movePageToActive(request.bookmarkId).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        logError('restorePage', error);
        sendResponse({ success: false, error: error.message });
      });
  return true; // Async response
    } else if (request.action === ACTIONS.OPEN_NEXT_PAGE) {
  // Start the cycle (used by the "Start Tasks" button in the panel)
      startTasksCycle();
      sendResponse({ success: true });
    } else if (request.action === ACTIONS.SET_RESET_TYPE) {
  // Update resetType in Active bookmark metadata
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
  return true; // Async response
    } else if (request.action === ACTIONS.RESTORE_ALL_AND_START) {
  // Restore all from Completed to Active and start
      (async () => {
        const completedPages = await getCompletedPages();
        
        if (completedPages.length === 0) {
          sendResponse({ success: false, message: 'No completed pages' });
          return;
        }
        
        logInfo('messageHandler', `Restoring all ${completedPages.length} completed pages and starting cycle`);
        
  // Send message to side panel to close
        chrome.runtime.sendMessage({ action: ACTIONS.CLOSE_SIDE_PANEL }).catch(() => {});
        
  // Small delay to allow panel to close
        await new Promise(resolve => setTimeout(resolve, 100));
        
  // Move all pages from Completed to Active
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
        
  // Start the cycle
        await startTasksCycle();
        
        sendResponse({ success: true });
      })();
      return true;
    } else if (request.action === ACTIONS.GET_TAB_STATUS) {
  // Content script asks: "Am I a task? Am I from the cycle?"
      const tabId = sender.tab?.id;
      const status = getTabStatus(tabId);
      sendResponse(status);
      return true;
    } else if (request.action === ACTIONS.TOGGLE_BANNER) {
  // Notify all tabs about banner setting change
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
            action: ACTIONS.BANNER_SETTING_CHANGED, 
            enabled: request.enabled 
          }).catch(() => {
            // Ignore errors (tabs without content script)
          });
        });
      });
      sendResponse({ success: true });
    } else if (request.action === ACTIONS.CHECK_RESTORE) {
  // Sidepanel requests immediate restore check (when timer reaches zero)
      logInfo('messageHandler', 'Manual restore check requested');
      checkAndRestoreOldPages();
      sendResponse({ status: 'checking' });
    } else if (request.action === ACTIONS.IMPORT_DATA) {
  // Import tasks from JSON file
      (async () => {
        try {
          const importData = request.data;
          const ids = await getFolderIds();
          
          // Get existing pages to check for duplicates
          const existingActive = await getActivePages();
          const existingCompleted = await getCompletedPages();
          
          // Combine all existing URLs from both Active and Completed folders
          const allExistingUrls = new Set([
            ...existingActive.map(p => p.url),
            ...existingCompleted.map(p => p.url)
          ]);
          
          let importedCount = 0;
          let skippedCount = 0;
          
          // Import active tasks
          if (importData.active && Array.isArray(importData.active)) {
            for (const task of importData.active) {
              // Check if URL exists in EITHER Active or Completed
              if (!allExistingUrls.has(task.url)) {
                const title = `${task.title} [${task.resetType || 'midnight'}]`;
                await chrome.bookmarks.create({
                  parentId: ids.active,
                  title: title,
                  url: task.url
                });
                importedCount++;
                allExistingUrls.add(task.url); // Add to set to prevent duplicates within import
                logInfo('importData', `Imported active: ${task.title}`);
              } else {
                skippedCount++;
                logInfo('importData', `Skipped duplicate active: ${task.title}`);
              }
            }
          }
          
          // Import completed tasks
          if (importData.completed && Array.isArray(importData.completed)) {
            for (const task of importData.completed) {
              // Check if URL exists in EITHER Active or Completed
              if (!allExistingUrls.has(task.url)) {
                // Build completed bookmark title with metadata
                const parts = [
                  task.completedAt || '',
                  task.restoreAt || '',
                  task.resetType || 'midnight',
                  task.resetInterval || '',
                  task.addedAt || ''
                ];
                const title = `${task.title} [${parts.join('|')}]`;
                
                await chrome.bookmarks.create({
                  parentId: ids.completed,
                  title: title,
                  url: task.url
                });
                importedCount++;
                allExistingUrls.add(task.url); // Add to set to prevent duplicates within import
                logInfo('importData', `Imported completed: ${task.title}`);
              } else {
                skippedCount++;
                logInfo('importData', `Skipped duplicate completed: ${task.title}`);
              }
            }
          }
          
          notifyPanelUpdate();
          
          sendResponse({ 
            success: true, 
            imported: importedCount,
            skipped: skippedCount
          });
        } catch (error) {
          logError('importData', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    }
  });
}

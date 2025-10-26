// Модуль планировщика - проверка времени и восстановление задач
import { getFolderIds } from './folderManager.js';
import { getCompletedPages } from './bookmarkOperations.js';
import { notifyPanelUpdate } from '../shared/notifications.js';
import { logError, logInfo } from '../shared/errorHandler.js';
import { RESET_TYPES, TIMINGS } from '../shared/constants.js';

// Функция запуска периодической проверки
export async function startTimeChecker() {
  await checkAndRestoreOldPages();
  
  await chrome.alarms.clear('checkPages');
  
  chrome.alarms.create('checkPages', { periodInMinutes: TIMINGS.ALARM_INTERVAL });
}

// Инициализация слушателя alarm
export function initAlarmListener() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkPages') {
      logInfo('scheduler', 'Alarm triggered - checking pages');
      checkAndRestoreOldPages();
    }
  });
}

// Функция проверки и восстановления старых страниц
export async function checkAndRestoreOldPages() {
  try {
    logInfo('checkAndRestoreOldPages', 'Running scheduled check...');
    
    const ids = await getFolderIds();
    const completedPages = await getCompletedPages();
    
    if (completedPages.length === 0) {
      logInfo('checkAndRestoreOldPages', 'No completed pages to check');
      return;
    }
    
    logInfo('checkAndRestoreOldPages', `Checking ${completedPages.length} completed pages`);
    
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    let restoredCount = 0;
    
    for (const page of completedPages) {
      let shouldRestore = false;
      
      if (page.resetType === RESET_TYPES.INTERVAL && page.restoreAt) {
        const restoreDate = new Date(page.restoreAt);
        shouldRestore = now >= restoreDate;
      } else {
        const completedDate = new Date(page.completedAt);
        shouldRestore = completedDate < todayStart;
      }
      
      if (shouldRestore) {
        await chrome.bookmarks.move(page.id, { parentId: ids.active });
        
        const newTitle = `${page.title} [${page.resetType}]`;
        
        await chrome.bookmarks.update(page.id, { 
          title: newTitle,
          url: page.url
        });
        
        restoredCount++;
        logInfo('checkAndRestoreOldPages', `Restored: ${page.title} (${page.resetType})`);
      }
    }
    
    if (restoredCount > 0) {
      logInfo('checkAndRestoreOldPages', `Total restored: ${restoredCount} tasks`);
      notifyPanelUpdate();
    } else {
      logInfo('checkAndRestoreOldPages', 'Check complete - no tasks to restore yet');
    }
  } catch (error) {
    logError('checkAndRestoreOldPages', error);
  }
}

// Модуль планировщика - проверка времени и восстановление задач
import { getFolderIds } from './folderManager.js';
import { getCompletedPages } from './bookmarkOperations.js';
import { notifyPanelUpdate } from '../shared/notifications.js';
import { logError } from '../shared/errorHandler.js';

// Функция запуска периодической проверки
export async function startTimeChecker() {
  await checkAndRestoreOldPages();
  
  await chrome.alarms.clear('checkPages');
  
  chrome.alarms.create('checkPages', { periodInMinutes: 1 });
}

// Инициализация слушателя alarm
export function initAlarmListener() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkPages') {
      checkAndRestoreOldPages();
    }
  });
}

// Функция проверки и восстановления старых страниц
export async function checkAndRestoreOldPages() {
  try {
    const ids = await getFolderIds();
    const completedPages = await getCompletedPages();
    
    if (completedPages.length === 0) return;
    
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    
    for (const page of completedPages) {
      let shouldRestore = false;
      
      if (page.resetType === 'interval' && page.restoreAt) {
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
      }
    }
    
    notifyPanelUpdate();
  } catch (error) {
    logError('checkAndRestoreOldPages', error);
  }
}

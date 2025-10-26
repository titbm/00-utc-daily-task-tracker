// Scheduler module - time checking and task restoration
import { getFolderIds } from './folderManager.js';
import { getCompletedPages } from './bookmarkOperations.js';
import { movePageToActive } from './cycle.js';
import { notifyPanelUpdate } from '../shared/notifications.js';
import { logError, logInfo } from '../shared/errorHandler.js';
import { RESET_TYPES, TIMINGS } from '../shared/constants.js';

// Function to start periodic check
export async function startTimeChecker() {
  await checkAndRestoreOldPages();
  
  // Schedule the next check based on analysis of Completed tasks
  await scheduleNextCheck();
}

// Dynamic scheduling of the next check
export async function scheduleNextCheck() {
  try {
    const completedPages = await getCompletedPages();
    
  // Clear previous alarm
    await chrome.alarms.clear('checkPages');
    
    if (completedPages.length === 0) {
  // No tasks - check every hour
      chrome.alarms.create('checkPages', { periodInMinutes: 60 });
      logInfo('scheduler', 'No completed tasks - next check in 60 minutes');
      return;
    }
    
    const now = Date.now();
    const todayStart = new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
      0, 0, 0, 0
    )).getTime();
    
    let nextCheckMs = 60 * 60 * 1000; // default 1 час
    
    for (const page of completedPages) {
      if (page.resetType === RESET_TYPES.INTERVAL && page.restoreAt) {
  // Interval tasks - check by restoreAt
        const restoreMs = new Date(page.restoreAt).getTime();
        const timeUntilRestore = restoreMs - now;
        
        if (timeUntilRestore > 0 && timeUntilRestore < nextCheckMs) {
          nextCheckMs = timeUntilRestore;
        }
      } else if (page.resetType === RESET_TYPES.MIDNIGHT) {
  // Midnight tasks - check at midnight
        const tomorrowStart = todayStart + 86400000; // следующая полночь
        const timeUntilMidnight = tomorrowStart - now;
        
        if (timeUntilMidnight > 0 && timeUntilMidnight < nextCheckMs) {
          nextCheckMs = timeUntilMidnight;
        }
      }
    }
    
  // Convert to minutes (min 1, max 60)
    const intervalMinutes = Math.max(1, Math.min(60, Math.ceil(nextCheckMs / 60000)));
    
    chrome.alarms.create('checkPages', { periodInMinutes: intervalMinutes });
    logInfo('scheduler', `Next check scheduled in ${intervalMinutes} minutes`);
    
  } catch (error) {
    logError('scheduleNextCheck', error);
  // Fallback to default interval
    chrome.alarms.create('checkPages', { periodInMinutes: TIMINGS.ALARM_INTERVAL });
  }
}

// Initialize alarm listener
export function initAlarmListener() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkPages') {
      logInfo('scheduler', 'Alarm triggered - checking pages');
      checkAndRestoreOldPages().then(() => {
  // After check, reschedule the next one
        scheduleNextCheck();
      });
    }
  });
}

// Function to check and restore old pages
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
        await movePageToActive(page.id);
        restoredCount++;
        logInfo('checkAndRestoreOldPages', `Restored: ${page.title} (${page.resetType})`);
      }
    }
    
    if (restoredCount > 0) {
      logInfo('checkAndRestoreOldPages', `Total restored: ${restoredCount} tasks`);
  // notifyPanelUpdate is already called inside movePageToActive
    } else {
      logInfo('checkAndRestoreOldPages', 'Check complete - no tasks to restore yet');
    }
  } catch (error) {
    logError('checkAndRestoreOldPages', error);
  }
}

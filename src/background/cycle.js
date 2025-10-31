// Task cycle management module
import { getFolderIds } from './folderManager.js';
import { getActivePages } from './bookmarkOperations.js';
import { scheduleNextCheck } from './scheduler.js';
import { parseActiveBookmarkTitle, parseCompletedBookmarkTitle, createCompletedBookmarkTitle, getFaviconUrl } from '../shared/bookmarkParser.js';
import { notifyPanelUpdate } from '../shared/notifications.js';
import { RESET_TYPES, TIMINGS } from '../shared/constants.js';
import { logError, logInfo } from '../shared/errorHandler.js';

// Global cycle state
const openedTabs = new Map();
let isCycleMode = false;
let currentWindowId = null;
let cycleQueue = [];
let currentCycleIndex = 0;
let isProcessingNext = false;

// Keep-alive mechanism (official Google recommendation)
let keepAliveInterval = null;
let keepAliveTimeout = null;

// Restore state from session storage on service worker startup
export async function restoreCycleState() {
  const { cycleState } = await chrome.storage.session.get('cycleState');
  if (cycleState) {
    // If cycle data exists, it means SW was killed unexpectedly
    // (normal cycle completion clears the data)
    logInfo('restoreCycleState', 'Found stale cycle data - clearing (SW was killed)');
    
    // Notify all tabs that cycle has ended (remove moon indicators)
    if (cycleState.openedTabs) {
      for (const [tabId, info] of Object.entries(cycleState.openedTabs)) {
        if (info.fromCycle) {
          chrome.tabs.sendMessage(Number(tabId), { 
            action: 'cycleEnded' 
          }).catch(() => {
            // Ignore errors (tab may be closed or not have content script)
          });
        }
      }
    }
    
    // Clear stale data
    await chrome.storage.session.remove('cycleState');
    
    // DO NOT restore cycle or openedTabs - cycle was interrupted
  }
}

// Save state to session storage
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

// Start keep-alive to prevent SW from sleeping during cycle
// Official Google recommendation: https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers
// Timer resets after each completed task via resetKeepAlive()
function startKeepAlive() {
  if (keepAliveInterval) return; // Already active
  
  logInfo('keepAlive', 'Starting keep-alive for 30 minutes (resets after each task)');
  
  // Periodically call chrome API to reset SW idle timer
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // This simple API call keeps SW alive
    });
  }, TIMINGS.KEEPALIVE_INTERVAL); // Every 25 seconds (less than 30s SW timeout)
  
  // Auto-stop cycle after 30 minutes
  if (keepAliveTimeout) {
    clearTimeout(keepAliveTimeout);
  }
  
  keepAliveTimeout = setTimeout(() => {
    logInfo('keepAlive', 'Keep-alive timeout - force stopping cycle');
    forceStopCycle();
  }, TIMINGS.KEEPALIVE_DURATION);
}

// Stop keep-alive
function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  
  if (keepAliveTimeout) {
    clearTimeout(keepAliveTimeout);
    keepAliveTimeout = null;
  }
  
  logInfo('keepAlive', 'Stopped keep-alive');
}

// Reset keep-alive timer (restart the 30-minute timeout)
// Called after each task completion to keep SW alive during entire cycle
function resetKeepAlive() {
  if (!keepAliveInterval) {
    // Keep-alive is not active, don't restart
    return;
  }
  
  // Clear existing timeout
  if (keepAliveTimeout) {
    clearTimeout(keepAliveTimeout);
  }
  
  // Restart 30-minute timeout
  keepAliveTimeout = setTimeout(() => {
    logInfo('keepAlive', 'Keep-alive timeout - force stopping cycle');
    forceStopCycle();
  }, TIMINGS.KEEPALIVE_DURATION);
  
  logInfo('keepAlive', 'Reset keep-alive timer - restarted 30-minute timeout');
}

// Force stop cycle after timeout
async function forceStopCycle() {
  logInfo('forceStopCycle', 'Force stopping cycle due to timeout');
  
  isCycleMode = false;
  cycleQueue = [];
  currentCycleIndex = 0;
  isProcessingNext = false;
  
  // Notify all open cycle tabs that cycle has ended
  for (const [tabId, info] of openedTabs.entries()) {
    if (info.fromCycle) {
      chrome.tabs.sendMessage(tabId, { 
        action: 'cycleEnded' 
      }).catch(() => {
        // Ignore errors (tab may be closed or not have content script)
      });
      // Remove cycle tabs from tracking
      openedTabs.delete(tabId);
    }
  }
  // Keep tabs opened from panel (fromCycle: false) in openedTabs
  
  currentWindowId = null;
  
  stopKeepAlive();
  
  // Clear cycle state from storage (cycle is completely stopped)
  await chrome.storage.session.remove('cycleState');
  
  notifyPanelUpdate();
}

// Move page from Active to Completed
export async function movePageToCompleted(bookmarkId) {
  try {
    const ids = await getFolderIds();
    const bookmark = await chrome.bookmarks.get(bookmarkId);
    
    if (!bookmark || !bookmark[0]) {
      logError('movePageToCompleted', `Bookmark not found: ${bookmarkId}`);
      return;
    }
    
    const page = bookmark[0];
    
    // Check if already in Completed folder - skip if so
    if (page.parentId === ids.completed) {
      logInfo('movePageToCompleted', `Page already in Completed: ${page.title}`);
      return;
    }
    
    const parsed = parseActiveBookmarkTitle(page.title);
    
    const completedAt = new Date().toISOString();
    const metadata = [
      completedAt,
      '',
      parsed.resetType,
      24,
      page.dateAdded ? new Date(page.dateAdded).toISOString() : new Date().toISOString()
    ].join('|');
    
    const newTitle = `${parsed.title} [${metadata}]`;
    
    await chrome.bookmarks.move(bookmarkId, { parentId: ids.completed });
    await chrome.bookmarks.update(bookmarkId, { title: newTitle });
    
    logInfo('movePageToCompleted', `Moved to completed: ${parsed.title}`);
    notifyPanelUpdate();
    
  // Schedule the next check
    scheduleNextCheck();
  } catch (error) {
    logError('movePageToCompleted', error);
  }
}

// Move page from Completed to Active
export async function movePageToActive(bookmarkId) {
  try {
    const ids = await getFolderIds();
    const bookmark = await chrome.bookmarks.get(bookmarkId);
    
    if (!bookmark || !bookmark[0]) {
      logError('movePageToActive', `Bookmark not found: ${bookmarkId}`);
      return;
    }
    
    const parsed = parseCompletedBookmarkTitle(bookmark[0].title);
    const newTitle = `${parsed.title} [${parsed.resetType}]`;
    
    await chrome.bookmarks.move(bookmarkId, { parentId: ids.active });
    await chrome.bookmarks.update(bookmarkId, { title: newTitle });
    
    logInfo('movePageToActive', `Restored to active: ${parsed.title}`);
    notifyPanelUpdate();
    
  // Schedule the next check
    scheduleNextCheck();
  } catch (error) {
    logError('movePageToActive', error);
  }
}

// Universal function to update a Completed page
export async function updateCompletedPage(bookmarkId, resetType, intervalHours = null) {
  try {
    const bookmark = await chrome.bookmarks.get(bookmarkId);
    if (!bookmark || !bookmark[0]) {
      logError('updateCompletedPage', `Bookmark not found: ${bookmarkId}`);
      return;
    }
    
    const page = bookmark[0];
    const parsed = parseCompletedBookmarkTitle(page.title);
    
    let metadata;
    
    if (resetType === RESET_TYPES.MIDNIGHT) {
  // For midnight: restoreAt and resetInterval are empty
      metadata = [
        parsed.completedAt,
  '',  // restoreAt is empty
        RESET_TYPES.MIDNIGHT,
  '',  // resetInterval is empty
        parsed.addedAt
      ].join('|');
      
    } else if (resetType === RESET_TYPES.INTERVAL) {
  // For interval: calculate restoreAt
      const now = new Date();
      const restoreAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
      
      metadata = [
        parsed.completedAt || now.toISOString(),
        restoreAt.toISOString(),
        RESET_TYPES.INTERVAL,
        intervalHours,
        parsed.addedAt
      ].join('|');
    }
    
    const newTitle = `${parsed.title} [${metadata}]`;
    
  // Remove and recreate the bookmark
    const ids = await getFolderIds();
    await chrome.bookmarks.remove(bookmarkId);
    await chrome.bookmarks.create({
      parentId: ids.completed,
      title: newTitle,
      url: page.url
    });
    
    logInfo('updateCompletedPage', `Updated to ${resetType}: ${parsed.title}`);
    scheduleNextCheck();
    
  } catch (error) {
    logError('updateCompletedPage', error);
  }
}

// Universal function to start the task cycle
export async function startTasksCycle() {
  const pages = await getActivePages();
  if (pages.length === 0) return;
  
  logInfo('startTasksCycle', `Starting cycle with ${pages.length} tasks`);
  
  // Close all completed.html tabs before starting new cycle
  const completedUrl = chrome.runtime.getURL('src/pages/completed.html');
  const allTabs = await chrome.tabs.query({});
  for (const tab of allTabs) {
    if (tab.url && tab.url.startsWith(completedUrl)) {
      chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
  
  // Clean up any previous cycle data before starting new one
  if (isCycleMode) {
    logInfo('startTasksCycle', 'Stopping previous cycle before starting new one');
    stopKeepAlive();
    
    // Notify all tabs from previous cycle that it ended
    for (const [tabId, info] of openedTabs.entries()) {
      if (info.fromCycle) {
        chrome.tabs.sendMessage(tabId, { 
          action: 'cycleEnded' 
        }).catch(() => {});
        openedTabs.delete(tabId);
      }
    }
  }
  
  cycleQueue = pages;
  currentCycleIndex = 0;
  isCycleMode = true;
  
  // Start keep-alive to prevent SW from sleeping
  startKeepAlive();
  
  await saveCycleState();
  
  openNextInCycle();
}

// Function to open the next page in the queue
async function openNextInCycle() {
  if (!isCycleMode) {
    logInfo('openNextInCycle', 'Cycle mode is OFF, exiting');
    return;
  }
  
  if (isProcessingNext) {
    logInfo('openNextInCycle', 'Already processing next, exiting');
    return;
  }
  
  logInfo('openNextInCycle', `Starting: currentCycleIndex=${currentCycleIndex}, cycleQueue.length=${cycleQueue.length}`);
  
  isProcessingNext = true;
  await saveCycleState();
  
  try {
    const currentActivePages = await getActivePages();
    let nextPage = null;
    
    while (currentCycleIndex < cycleQueue.length) {
      const page = cycleQueue[currentCycleIndex];
      
      const stillActive = currentActivePages.some(active => active.id === page.id);
      
      logInfo('openNextInCycle', `Checking page at index ${currentCycleIndex}: ${page.title}, stillActive: ${stillActive}`);
      
      if (stillActive) {
        nextPage = page;
        break;
      } else {
        logInfo('openNextInCycle', `Page not active, skipping to next`);
        currentCycleIndex++;
      }
    }
    
    if (!nextPage) {
      logInfo('openNextInCycle', 'No more active pages in queue - cycle completed');
      isCycleMode = false;
      cycleQueue = [];
      currentCycleIndex = 0;
      isProcessingNext = false;
      
      // Remove only cycle tabs from tracking, keep panel tabs
      for (const [tabId, info] of openedTabs.entries()) {
        if (info.fromCycle) {
          openedTabs.delete(tabId);
        }
      }
      
      // Stop keep-alive when cycle completes normally
      stopKeepAlive();
      
      // Clear cycle state from storage (cycle is completely finished)
      await chrome.storage.session.remove('cycleState');
      
      // Open completed page in the same window as cycle
      const completedUrl = chrome.runtime.getURL('src/pages/completed.html');
      if (currentWindowId) {
        chrome.tabs.create({ url: completedUrl, windowId: currentWindowId });
      } else {
        chrome.tabs.create({ url: completedUrl });
      }
      
      currentWindowId = null;
      return;
    }
    
    chrome.tabs.create({ url: nextPage.url }, async (tab) => {
      if (tab) {
        logInfo('openNextInCycle', `Opening task ${currentCycleIndex + 1}/${cycleQueue.length}: ${nextPage.title}`);
        openedTabs.set(tab.id, {
          bookmarkId: nextPage.id,
          fromCycle: true,
          isIntervalDialog: false,
          dialogFromCycle: false,
          cycleIndex: currentCycleIndex
        });
        
        if (!currentWindowId) {
          currentWindowId = tab.windowId;
        }
        
        isProcessingNext = false;
        await saveCycleState();
      }
    });
  } catch (error) {
    logError('openNextInCycle', error);
    isProcessingNext = false;
    await saveCycleState();
  }
}

// Tab close handler
export async function handleTabRemove(tabId, removeInfo) {
  const tabInfo = openedTabs.get(tabId);
  if (!tabInfo) return;
  
  logInfo('handleTabRemove', `Tab closed: ${tabInfo.fromCycle ? 'from cycle' : 'single page'}, bookmarkId: ${tabInfo.bookmarkId}, isCycleMode: ${isCycleMode}`);
  
  if (tabInfo.isIntervalDialog) {
    const storageKey = `intervalDialog_${tabInfo.bookmarkId}`;
    
    chrome.storage.session.get(storageKey, async (result) => {
      if (result[storageKey]) {
        const data = result[storageKey];
        
  // Update the page depending on the type
        if (data.resetType === 'midnight') {
          await updateCompletedPage(tabInfo.bookmarkId, 'midnight');
        } else if (data.resetType === 'interval') {
          await updateCompletedPage(tabInfo.bookmarkId, 'interval', data.intervalHours);
        }
        
        notifyPanelUpdate();
        chrome.storage.session.remove(storageKey);
      }
    });
    
    openedTabs.delete(tabId);
    await saveCycleState();
    
    if (tabInfo.dialogFromCycle && isCycleMode) {
      currentCycleIndex++;
      await saveCycleState();
      
      // Reset keep-alive timer to keep SW active during cycle
      resetKeepAlive();
      
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
      const ids = await getFolderIds();
      
      let bookmark;
      try {
        bookmark = await chrome.bookmarks.get(bookmarkId);
      } catch (error) {
        logInfo('handleTabRemove', `Bookmark not found (already deleted?): ${bookmarkId}`);
        
        // If bookmark not found and this was from cycle, continue cycle
        if (wasFromCycle && isCycleMode) {
          logInfo('handleTabRemove', `Continuing cycle despite missing bookmark`);
          currentCycleIndex++;
          await saveCycleState();
          openNextInCycle();
        }
        return;
      }
      
      if (!bookmark || !bookmark[0]) {
        logInfo('handleTabRemove', `Bookmark not found: ${bookmarkId}`);
        
        if (wasFromCycle && isCycleMode) {
          currentCycleIndex++;
          await saveCycleState();
          openNextInCycle();
        }
        return;
      }
      
      const page = bookmark[0];
      
      logInfo('handleTabRemove', `Bookmark folder: ${page.parentId}, Active: ${ids.active}, Completed: ${ids.completed}`);
      
      // Check if page is already in Completed - skip dialog/move and continue cycle
      if (page.parentId === ids.completed) {
        logInfo('handleTabRemove', `Page already completed, wasFromCycle: ${wasFromCycle}, isCycleMode: ${isCycleMode}`);
        
        // Remove other non-cycle tabs with same bookmarkId
        for (const [tId, info] of openedTabs.entries()) {
          if (info.bookmarkId === bookmarkId && !info.fromCycle) {
            openedTabs.delete(tId);
          }
        }
        
        // Continue cycle if this was a cycle tab
        if (wasFromCycle && isCycleMode) {
          logInfo('handleTabRemove', `Continuing cycle: incrementing index from ${currentCycleIndex} to ${currentCycleIndex + 1}`);
          currentCycleIndex++;
          await saveCycleState();
          
          // Reset keep-alive timer to keep SW active during cycle
          resetKeepAlive();
          
          openNextInCycle();
        }
        return;
      }
      
      const parsed = parseActiveBookmarkTitle(page.title);
      
      logInfo('handleTabRemove', `Parsed title: resetType=${parsed.resetType}, title="${parsed.title}"`);
      
      // Remove other tabs with same bookmarkId, but NOT from cycle
      // Cycle tabs should be handled by their own close event
      for (const [tId, info] of openedTabs.entries()) {
        if (info.bookmarkId === bookmarkId && !info.fromCycle) {
          openedTabs.delete(tId);
        }
      }
      
      if (parsed.resetType === RESET_TYPES.INTERVAL) {
  // Move to Completed, but DO NOT update metadata - dialog will do it on close
        await movePageToCompleted(bookmarkId);
        
        const faviconUrl = getFaviconUrl(page.url);
        
        const dialogUrl = chrome.runtime.getURL('src/pages/intervalDialog.html') + 
          `?bookmarkId=${bookmarkId}` +
          `&title=${encodeURIComponent(parsed.title)}` +
          `&url=${encodeURIComponent(page.url)}` +
          `&favicon=${encodeURIComponent(faviconUrl)}` +
          `&interval=24`;
        
        chrome.tabs.create({ url: dialogUrl }, async (dialogTab) => {
          if (dialogTab) {
            openedTabs.set(dialogTab.id, {
              bookmarkId: bookmarkId,
              fromCycle: false,
              isIntervalDialog: true,
              dialogFromCycle: wasFromCycle
            });
            
            await saveCycleState();
          }
        });
        
      } else {
        await movePageToCompleted(bookmarkId);
        
        if (wasFromCycle && isCycleMode) {
          currentCycleIndex++;
          await saveCycleState();
          
          // Reset keep-alive timer to keep SW active during cycle
          resetKeepAlive();
          
          openNextInCycle();
        }
      }
    } catch (error) {
      logError('handleTabRemove', error);
    }
  }
}

// Open a single page (not from cycle)
export async function openSinglePage(url, bookmarkId) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url }, async (tab) => {
      if (tab && bookmarkId) {
        openedTabs.set(tab.id, {
          bookmarkId,
          fromCycle: false,
          isIntervalDialog: false,
          dialogFromCycle: false
        });
        await saveCycleState();
      }
      resolve({ success: true });
    });
  });
}

// Get tab status
export function getTabStatus(tabId) {
  const tabInfo = openedTabs.get(tabId);
  if (tabInfo) {
    return { 
      isTask: true, 
      fromCycle: tabInfo.fromCycle,
      isIntervalDialog: tabInfo.isIntervalDialog,
      dialogFromCycle: tabInfo.dialogFromCycle,
      cycleIndex: tabInfo.cycleIndex !== undefined ? tabInfo.cycleIndex : -1
    };
  }
  return { isTask: false, fromCycle: false, cycleIndex: -1 };
}

// Register interval dialog tab (used when opening dialog from banner or other sources)
export async function registerIntervalDialog(tabId, bookmarkId, dialogFromCycle) {
  openedTabs.set(tabId, {
    bookmarkId,
    fromCycle: false,
    isIntervalDialog: true,
    dialogFromCycle
  });
  await saveCycleState();
  logInfo('registerIntervalDialog', `Registered interval dialog tab ${tabId} for bookmark ${bookmarkId}`);
}

// Reset tasks that will restore within 24 hours
export async function resetTasksWithin24Hours() {
  try {
    const completedPages = await chrome.bookmarks.getChildren((await getFolderIds()).completed);
    const now = Date.now();
    const in24Hours = now + 24 * 60 * 60 * 1000; // 24 hours from now
    
    // Calculate today's midnight UTC and tomorrow's midnight UTC
    const todayMidnight = new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
      0, 0, 0, 0
    )).getTime();
    const tomorrowMidnight = todayMidnight + 86400000;
    
    let resetCount = 0;
    const tasksToReset = [];
    
    for (const bookmark of completedPages) {
      if (!bookmark.url) continue;
      
      const parsed = parseCompletedBookmarkTitle(bookmark.title);
      let shouldReset = false;
      
      if (parsed.resetType === RESET_TYPES.MIDNIGHT) {
        // For midnight tasks: check if completed today (will restore tomorrow at 00:00 UTC)
        // If completed today, time until restore = tomorrowMidnight - now
        const completedAt = new Date(parsed.completedAt).getTime();
        
        // If completed today (after today's midnight), it will restore tomorrow
        if (completedAt >= todayMidnight && completedAt < tomorrowMidnight) {
          const timeUntilRestore = tomorrowMidnight - now;
          if (timeUntilRestore > 0 && timeUntilRestore <= 24 * 60 * 60 * 1000) {
            shouldReset = true;
          }
        }
      } else if (parsed.resetType === RESET_TYPES.INTERVAL && parsed.restoreAt) {
        // For interval tasks: check if restoreAt is within 24 hours
        const restoreAt = new Date(parsed.restoreAt).getTime();
        if (restoreAt <= in24Hours && restoreAt > now) {
          shouldReset = true;
        }
      }
      
      if (shouldReset) {
        tasksToReset.push(bookmark.id);
      }
    }
    
    // Reset all identified tasks
    for (const bookmarkId of tasksToReset) {
      await movePageToActive(bookmarkId);
      resetCount++;
    }
    
    logInfo('resetTasksWithin24Hours', `Reset ${resetCount} task(s)`);
    
    // Update scheduler after resetting tasks
    await scheduleNextCheck();
    
    return { success: true, count: resetCount };
  } catch (error) {
    logError('resetTasksWithin24Hours', error);
    return { success: false, error: error.message, count: 0 };
  }
}


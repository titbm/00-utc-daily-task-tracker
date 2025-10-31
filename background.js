// Import constants
import { ACTIONS } from './src/shared/constants.js';

// Import modules
import { initializeBookmarksFolder } from './src/background/folderManager.js';
import { addPageToActive, getActivePages } from './src/background/bookmarkOperations.js';
import { startTimeChecker, initAlarmListener } from './src/background/scheduler.js';
import { restoreCycleState, handleTabRemove } from './src/background/cycle.js';
import { initMessageHandler } from './src/background/messageHandler.js';
import { logError, logInfo } from './src/shared/errorHandler.js';

chrome.runtime.onInstalled.addListener(async (details) => {
  logInfo('runtime', 'Extension installed/updated');
  
  // Reset central banner flag on install or enable
  if (details.reason === 'install' || details.reason === 'update') {
    await chrome.storage.local.set({ centralBannerShown: false });
    logInfo('runtime', 'Central banner flag reset');
  }
  
  // Create context menu for adding pages to panel
  chrome.contextMenus.create({
    id: "addToPanel",
    title: "Add to 00 UTC | Daily Task Tracker",
    contexts: ["page"]
  });
  
  // Disable automatic panel opening on click (handle manually)
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error) => {
    logError('setPanelBehavior', error);
  });
  
  // Create or find folders in bookmarks
  await initializeBookmarksFolder();
  
  // Start periodic time checks
  await startTimeChecker();
});

// Start time checker when service worker starts
chrome.runtime.onStartup.addListener(async () => {
  logInfo('runtime', 'Extension startup');
  await initializeBookmarksFolder();
  await startTimeChecker();
});

// IMPORTANT: In Manifest V3 global variables are NOT persistent!
// Service worker sleeps after 30 seconds → all let/const are reset
// Use chrome.storage.session to store data between wake-ups

// Listen to connections from sidepanel (for tracking active connections)
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

// Initialize alarm listener
initAlarmListener();

// Async initialization
(async () => {
  // Restore cycle state (may start keep-alive if cycle was active)
  await restoreCycleState();
  
  // Tab close handler
  chrome.tabs.onRemoved.addListener(handleTabRemove);
  
  // Initialize message handler
  initMessageHandler();
})();

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "addToPanel") {
    logInfo('contextMenuHandler', `Adding page via context menu: ${tab.title}`);
    try {
      // Add page and get result
      const result = await addPageToActive(tab);
      
      if (result && result.exists) {
        // Page already added
        logInfo('contextMenuHandler', `Page already exists: ${tab.title}`);
        chrome.tabs.sendMessage(tab.id, { 
          action: ACTIONS.SHOW_ALREADY_ADDED_NOTIFICATION,
          title: tab.title 
        }).catch(() => {});
      } else if (result && result.added) {
        // Page successfully added - bookmarkId is already in result
        logInfo('contextMenuHandler', `Page added successfully: ${tab.title}`);
        
        chrome.tabs.sendMessage(tab.id, { 
          action: ACTIONS.SHOW_ADDED_NOTIFICATION,
          title: tab.title,
          bookmarkId: result.bookmarkId
        }).catch(() => {
          // Ignore errors (page may not support content scripts)
        });
      }
    } catch (error) {
      logError('contextMenuHandler', error);
    }
  }
});

// Handle extension installation and updates
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // First installation - show central banner on first cycle
    chrome.storage.local.set({ centralBannerShown: false });
    logInfo('runtime', 'Extension installed - central banner will be shown on first cycle');
  }
  // On update - don't reset the flag (user already saw the banner)
});

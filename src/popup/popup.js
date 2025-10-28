// Import constants
import { ACTIONS, BUTTON_STATES } from '../shared/constants.js';

// Load counters and banner state
(async () => {
  // Load counters
  const activeResponse = await chrome.runtime.sendMessage({ action: ACTIONS.GET_ACTIVE_PAGES });
  const completedResponse = await chrome.runtime.sendMessage({ action: ACTIONS.GET_COMPLETED_PAGES });
  
  const activePages = activeResponse.pages || [];
  const completedPages = completedResponse.pages || [];
  
  document.getElementById('activeCount').textContent = activePages.length;
  document.getElementById('completedCount').textContent = completedPages.length;
  
  // Load banner state
  const { bannerEnabled = true } = await chrome.storage.local.get('bannerEnabled');
  document.getElementById('bannerToggle').checked = bannerEnabled;
  
  // Setup START/REPEAT ALL button
  const stealthBtn = document.getElementById('stealthMode');
  
  if (activePages.length === 0 && completedPages.length > 0) {
  // No active tasks, but there are completed - show REPEAT ALL button
    stealthBtn.innerHTML = '<span class="material-symbols-outlined">refresh</span>Repeat all';
    stealthBtn.addEventListener('click', async () => {
  // Restore all from Completed and start cycle (ready handler)
      await chrome.runtime.sendMessage({ action: ACTIONS.RESTORE_ALL_AND_START });
      window.close();
    });
  } else if (activePages.length === 0 && completedPages.length === 0) {
  // No active or completed tasks - disable button
    stealthBtn.disabled = true;
    stealthBtn.style.opacity = BUTTON_STATES.DISABLED.opacity;
    stealthBtn.style.cursor = BUTTON_STATES.DISABLED.cursor;
  } else {
  // There are active tasks - START button works
    stealthBtn.addEventListener('click', async () => {
  // Close sidepanel (if open)
      chrome.runtime.sendMessage({ action: ACTIONS.CLOSE_SIDE_PANEL }).catch(() => {});
      
  // Small delay for panel closing
      await new Promise(resolve => setTimeout(resolve, 100));
      
  // Start task cycle
      chrome.runtime.sendMessage({ action: ACTIONS.OPEN_NEXT_PAGE });
      window.close();
    });
  }
})();

// Banner toggle handler
document.getElementById('bannerToggle').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  await chrome.storage.local.set({ bannerEnabled: enabled });
  
  // Send message to background to notify all content scripts
  chrome.runtime.sendMessage({ 
    action: ACTIONS.TOGGLE_BANNER,
    enabled: enabled
  });
});

document.getElementById('openPanel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.sidePanel.open({ windowId: tab.windowId });
  window.close();
});

document.getElementById('addCurrentTab').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (tab) {
  // Add current tab to active tasks
    const response = await chrome.runtime.sendMessage({ 
      action: ACTIONS.ADD_PAGE,
      tab: {
        id: tab.id,
        url: tab.url,
        title: tab.title
      }
    });
    
  // Show notification depending on result
    if (response && response.exists) {
  // Page was already added
      chrome.tabs.sendMessage(tab.id, { 
        action: ACTIONS.SHOW_ALREADY_ADDED_NOTIFICATION,
        title: tab.title 
      }).catch(() => {});
    } else if (response && response.added) {
  // Page successfully added
      chrome.tabs.sendMessage(tab.id, { 
        action: ACTIONS.SHOW_ADDED_NOTIFICATION,
        title: tab.title 
      }).catch(() => {});
    }
    
    window.close();
  }
});

// Import button handler
document.getElementById('importData').addEventListener('click', async () => {
  console.log('Import clicked - to be implemented');
  // TODO: Implement import functionality
});

// Export button handler
document.getElementById('exportData').addEventListener('click', async () => {
  console.log('Export clicked - to be implemented');
  // TODO: Implement export functionality
});

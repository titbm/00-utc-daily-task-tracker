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
  // Trigger file input
  document.getElementById('importFileInput').click();
});

// File input change handler
document.getElementById('importFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    // Read file
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validate JSON structure
    if (!data.version || !data.active || !data.completed) {
      alert('Invalid file format. Please select a valid Daily Panel export file.');
      return;
    }
    
    // Send import request to background
    const response = await chrome.runtime.sendMessage({
      action: ACTIONS.IMPORT_DATA,
      data: data
    });
    
    if (response.success) {
      // Show success message
      alert(`Import complete!\n\nImported: ${response.imported}\nSkipped (duplicates): ${response.skipped}`);
      
      // Reload popup to show updated counts
      window.location.reload();
    } else {
      alert(`Import failed: ${response.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error('Import error:', error);
    alert(`Import failed: ${error.message}`);
  } finally {
    // Reset file input
    e.target.value = '';
  }
});

// Export button handler
document.getElementById('exportData').addEventListener('click', async () => {
  try {
    // Get all tasks from background
    const activeResponse = await chrome.runtime.sendMessage({ action: ACTIONS.GET_ACTIVE_PAGES });
    const completedResponse = await chrome.runtime.sendMessage({ action: ACTIONS.GET_COMPLETED_PAGES });
    
    const activePages = activeResponse.pages || [];
    const completedPages = completedResponse.pages || [];
    
    // Prepare export data
    const exportData = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      active: activePages.map(page => ({
        title: page.title,
        url: page.url,
        resetType: page.resetType
      })),
      completed: completedPages.map(page => ({
        title: page.title,
        url: page.url,
        resetType: page.resetType,
        resetInterval: page.resetInterval,
        completedAt: page.completedAt,
        restoreAt: page.restoreAt,
        addedAt: page.addedAt
      }))
    };
    
    // Create JSON blob
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Generate filename with current date
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const filename = `daily-panel-tasks-${dateStr}.json`;
    
    // Download file
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });
    
    // Clean up blob URL
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
  } catch (error) {
    console.error('Export failed:', error);
  }
});

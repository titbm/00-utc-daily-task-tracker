// Import constants
import { ACTIONS } from '../shared/constants.js';

// RoughNotation animation for striking through the word "not"
if (typeof RoughNotation !== 'undefined') {
  const strikethroughElement = document.getElementById('strikethrough');
  if (strikethroughElement) {
    const annotation = RoughNotation.annotate(strikethroughElement, {
      type: 'crossed-off',
      color: '#8B0000',
      iterations: 2,
      animationDuration: 800,
      strokeWidth: 2
    });
    
    // Show animation with delay after bounce
    setTimeout(() => {
      annotation.show();
    }, 1000);
  }
}

document.getElementById('openPanelBtn').addEventListener('click', async () => {
  // Open panel and switch to Completed
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    // Save flag that we need to open on Completed tab
    await chrome.storage.session.set({ openOnCompleted: true });
    
    // Open panel (if already open - just activates)
    await chrome.sidePanel.open({ windowId: tabs[0].windowId });
    
    // Send message ALWAYS (for both open and closed panel)
    // For closed panel - it will load within 200ms
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: ACTIONS.PAGES_UPDATED }).catch(() => {});
      
      // Close tab after sending message
      setTimeout(() => {
        chrome.tabs.remove(tabs[0].id);
      }, 100);
    }, 200);
  }
});

// Handle Enter - pressing Enter opens panel, Esc - closes tab
document.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    document.getElementById('openPanelBtn').click();
  } else if (e.key === 'Escape') {
    // Close current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      chrome.tabs.remove(tabs[0].id);
    }
  }
});

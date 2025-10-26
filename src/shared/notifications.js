// Utility for notifying the panel and content scripts about updates
import { ACTIONS } from './constants.js';

export function notifyPanelUpdate() {
  // Notify the side panel
  chrome.runtime.sendMessage({ action: ACTIONS.PAGES_UPDATED }).catch(() => {});
  
  // Notify all content scripts (for banners)
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: ACTIONS.PAGES_UPDATED }).catch(() => {});
    });
  });
}

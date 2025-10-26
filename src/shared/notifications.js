// Утилита для уведомления панели и content scripts об обновлениях
import { ACTIONS } from './constants.js';

export function notifyPanelUpdate() {
  // Уведомляем боковую панель
  chrome.runtime.sendMessage({ action: ACTIONS.PAGES_UPDATED }).catch(() => {});
  
  // Уведомляем все content scripts (для баннеров)
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: ACTIONS.PAGES_UPDATED }).catch(() => {});
    });
  });
}

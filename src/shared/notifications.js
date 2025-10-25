// Утилита для уведомления панели и content scripts об обновлениях

export function notifyPanelUpdate() {
  // Уведомляем боковую панель
  chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
  
  // Уведомляем все content scripts (для баннеров)
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'pagesUpdated' }).catch(() => {});
    });
  });
}

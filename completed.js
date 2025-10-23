document.getElementById('openPanelBtn').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    // Сначала отправляем сообщение (панель может быть уже открыта)
    chrome.runtime.sendMessage({ action: 'showCompleted' }).catch(() => {});
    
    // Открываем панель
    await chrome.sidePanel.open({ windowId: tabs[0].windowId });
    
    // Закрываем эту вкладку
    chrome.tabs.remove(tabs[0].id);
  }
});

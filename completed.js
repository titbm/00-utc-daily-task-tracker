document.getElementById('openPanelBtn').addEventListener('click', async () => {
  // Открываем панель на вкладке "Отработанные"
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    await chrome.sidePanel.open({ windowId: tabs[0].windowId });
    // Отправляем сообщение панели переключиться на completed
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'showCompleted' }).catch(() => {});
    }, 500);
    // Закрываем эту вкладку
    chrome.tabs.remove(tabs[0].id);
  }
});

document.getElementById('stealthMode').addEventListener('click', async () => {
  chrome.runtime.sendMessage({ action: 'startDailyTasks' });
  window.close();
});

document.getElementById('openPanel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.sidePanel.open({ windowId: tab.windowId });
  window.close();
});

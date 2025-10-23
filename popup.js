// Проверяем наличие активных задач при загрузке
(async () => {
  const response = await chrome.runtime.sendMessage({ action: 'getActivePages' });
  const activePages = response.pages || [];
  
  const stealthBtn = document.getElementById('stealthMode');
  
  if (activePages.length === 0) {
    // Нет активных задач - заменяем кнопку на надпись
    const completedText = document.createElement('div');
    completedText.style.cssText = `
      width: 100%;
      padding: 12px;
      margin-bottom: 8px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      background: white;
      color: #28a745;
      text-align: center;
      box-sizing: border-box;
    `;
    completedText.textContent = '✓ All completed';
    stealthBtn.replaceWith(completedText);
  } else {
    // Есть активные задачи - кнопка работает
    stealthBtn.addEventListener('click', async () => {
      chrome.runtime.sendMessage({ action: 'startDailyTasks' });
      window.close();
    });
  }
})();

document.getElementById('openPanel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.sidePanel.open({ windowId: tab.windowId });
  window.close();
});

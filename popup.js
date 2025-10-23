// Проверяем наличие активных задач при загрузке
(async () => {
  const response = await chrome.runtime.sendMessage({ action: 'getActivePages' });
  const activePages = response.pages || [];
  
  const stealthBtn = document.getElementById('stealthMode');
  
  if (activePages.length === 0) {
    // Нет активных задач - показываем кнопку REPEAT ALL
    stealthBtn.textContent = '🔄 REPEAT ALL';
    stealthBtn.addEventListener('click', async () => {
      // Переносим все из Completed в Active и запускаем
      await chrome.runtime.sendMessage({ action: 'restoreAllAndStart' });
      window.close();
    });
  } else {
    // Есть активные задачи - кнопка START работает
    stealthBtn.addEventListener('click', async () => {
      // Отправляем команду на закрытие панели и запуск задач
      chrome.runtime.sendMessage({ action: 'startStealthMode' });
      window.close();
    });
  }
})();

document.getElementById('openPanel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.sidePanel.open({ windowId: tab.windowId });
  window.close();
});

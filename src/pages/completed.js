// Анимация RoughNotation зачеркивания слова "not"
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
    
    // Показываем анимацию с задержкой после bounce
    setTimeout(() => {
      annotation.show();
    }, 1000);
  }
}

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

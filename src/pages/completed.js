// Импорт констант
import { ACTIONS } from '../shared/constants.js';

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
  // Открываем панель и переключаем на Completed
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    // Сохраняем флаг что нужно открыть на вкладке Completed
    await chrome.storage.session.set({ openOnCompleted: true });
    
    // Открываем панель (если уже открыта - просто активирует)
    await chrome.sidePanel.open({ windowId: tabs[0].windowId });
    
    // Отправляем сообщение ВСЕГДА (для открытой и закрытой панели)
    // Для закрытой панели - она успеет загрузиться за 200ms
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: ACTIONS.PAGES_UPDATED }).catch(() => {});
      
      // Закрываем вкладку после отправки сообщения
      setTimeout(() => {
        chrome.tabs.remove(tabs[0].id);
      }, 100);
    }, 200);
  }
});

// Обработка Enter - нажатие Enter открывает панель
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('openPanelBtn').click();
  }
});

// Импорт констант
import { ACTIONS, BUTTON_STATES } from '../shared/constants.js';

// Загрузка счетчиков и состояния баннера
(async () => {
  // Загрузка счетчиков
  const activeResponse = await chrome.runtime.sendMessage({ action: ACTIONS.GET_ACTIVE_PAGES });
  const completedResponse = await chrome.runtime.sendMessage({ action: ACTIONS.GET_COMPLETED_PAGES });
  
  const activePages = activeResponse.pages || [];
  const completedPages = completedResponse.pages || [];
  
  document.getElementById('activeCount').textContent = activePages.length;
  document.getElementById('completedCount').textContent = completedPages.length;
  
  // Загрузка состояния баннера
  const { bannerEnabled = true } = await chrome.storage.local.get('bannerEnabled');
  document.getElementById('bannerToggle').checked = bannerEnabled;
  
  // Настройка кнопки START/REPEAT ALL
  const stealthBtn = document.getElementById('stealthMode');
  
  if (activePages.length === 0 && completedPages.length > 0) {
    // Нет активных задач, но есть completed - показываем кнопку REPEAT ALL
    stealthBtn.innerHTML = '<span class="material-symbols-outlined">refresh</span>Repeat all';
    stealthBtn.addEventListener('click', async () => {
      // Восстанавливаем все из Completed и запускаем цикл (готовый обработчик)
      await chrome.runtime.sendMessage({ action: ACTIONS.RESTORE_ALL_AND_START });
      window.close();
    });
  } else if (activePages.length === 0 && completedPages.length === 0) {
    // Нет ни активных, ни completed задач - отключаем кнопку
    stealthBtn.disabled = true;
    stealthBtn.style.opacity = BUTTON_STATES.DISABLED.opacity;
    stealthBtn.style.cursor = BUTTON_STATES.DISABLED.cursor;
  } else {
    // Есть активные задачи - кнопка START работает
    stealthBtn.addEventListener('click', async () => {
      // Закрываем sidepanel (если открыт)
      chrome.runtime.sendMessage({ action: ACTIONS.CLOSE_SIDE_PANEL }).catch(() => {});
      
      // Небольшая задержка для закрытия панели
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Запускаем цикл задач
      chrome.runtime.sendMessage({ action: ACTIONS.OPEN_NEXT_PAGE });
      window.close();
    });
  }
})();

// Обработчик переключателя баннера
document.getElementById('bannerToggle').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  await chrome.storage.local.set({ bannerEnabled: enabled });
  
  // Отправляем сообщение background для уведомления всех content scripts
  chrome.runtime.sendMessage({ 
    action: ACTIONS.TOGGLE_BANNER,
    enabled: enabled
  });
});

document.getElementById('openPanel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.sidePanel.open({ windowId: tab.windowId });
  window.close();
});

document.getElementById('addCurrentTab').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (tab) {
    // Добавляем текущую вкладку в активные задачи
    const response = await chrome.runtime.sendMessage({ 
      action: ACTIONS.ADD_PAGE,
      tab: {
        id: tab.id,
        url: tab.url,
        title: tab.title
      }
    });
    
    // Показываем уведомление в зависимости от результата
    if (response && response.exists) {
      // Страница уже была добавлена
      chrome.tabs.sendMessage(tab.id, { 
        action: ACTIONS.SHOW_ALREADY_ADDED_NOTIFICATION,
        title: tab.title 
      }).catch(() => {});
    } else if (response && response.added) {
      // Страница успешно добавлена
      chrome.tabs.sendMessage(tab.id, { 
        action: ACTIONS.SHOW_ADDED_NOTIFICATION,
        title: tab.title 
      }).catch(() => {});
    }
    
    window.close();
  }
});

// Загрузка счетчиков и состояния баннера
(async () => {
  // Загрузка счетчиков
  const activeResponse = await chrome.runtime.sendMessage({ action: 'getActivePages' });
  const completedResponse = await chrome.runtime.sendMessage({ action: 'getCompletedPages' });
  
  const activePages = activeResponse.pages || [];
  const completedPages = completedResponse.pages || [];
  
  document.getElementById('activeCount').textContent = activePages.length;
  document.getElementById('completedCount').textContent = completedPages.length;
  
  // Загрузка состояния баннера
  const { bannerEnabled = true } = await chrome.storage.local.get('bannerEnabled');
  document.getElementById('bannerToggle').checked = bannerEnabled;
  
  // Настройка кнопки START/REPEAT ALL
  const stealthBtn = document.getElementById('stealthMode');
  
  if (activePages.length === 0) {
    // Нет активных задач - показываем кнопку REPEAT ALL
    stealthBtn.innerHTML = '<span class="material-symbols-outlined">refresh</span>Repeat all';
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

// Обработчик переключателя баннера
document.getElementById('bannerToggle').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  await chrome.storage.local.set({ bannerEnabled: enabled });
  
  // Уведомляем background script об изменении
  chrome.runtime.sendMessage({ 
    action: 'toggleBanner', 
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
      action: 'addCurrentTab',
      tab: {
        id: tab.id,
        url: tab.url,
        title: tab.title
      }
    });
    
    // Показываем уведомление в зависимости от результата
    if (response.success) {
      if (response.exists) {
        // Страница уже была добавлена
        chrome.tabs.sendMessage(tab.id, { 
          action: 'showAlreadyAddedNotification',
          title: tab.title 
        }).catch(() => {});
      } else {
        // Страница успешно добавлена
        chrome.tabs.sendMessage(tab.id, { 
          action: 'showAddedNotification',
          title: tab.title 
        }).catch(() => {});
      }
    }
    
    window.close();
  }
});

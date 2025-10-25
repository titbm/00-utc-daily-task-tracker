// Content script для отображения баннера с активными задачами

let banner = null;

// Проверка, является ли текущая вкладка задачей (по URL параметру)
function isTaskTab() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('daily_panel_task');
}

// Создание баннера
async function createBanner() {
  if (banner || isTaskTab()) return; // Не показываем баннер во вкладках с отработкой
  
  // Проверяем настройку баннера
  const { bannerEnabled = true } = await chrome.storage.local.get('bannerEnabled');
  if (!bannerEnabled) return; // Баннер отключен в настройках
  
  banner = document.createElement('div');
  banner.id = 'daily-panel-banner';
  banner.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #ffffff;
      border-bottom: 1px solid #e5e5e5;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 999999;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <span style="font-weight: 400; color: #000000; font-size: 14px;">
        Daily tasks are not completed
      </span>
      <button id="daily-panel-start-btn" style="
        background: #000000;
        color: #ffffff;
        border: 1px solid #000000;
        padding: 6px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        font-family: 'Inter', sans-serif;
      ">
        Start
      </button>
    </div>
  `;
  
  document.body.prepend(banner);
  
  // Добавляем отступ для body чтобы контент не перекрывался
  document.body.style.paddingTop = '36px';
  
  // Обработчик кнопки
  const startBtn = banner.querySelector('#daily-panel-start-btn');
  startBtn.addEventListener('mouseenter', () => {
    startBtn.style.background = '#333333';
  });
  startBtn.addEventListener('mouseleave', () => {
    startBtn.style.background = '#000000';
  });
  startBtn.addEventListener('click', () => {
    // Отправляем сообщение background script для запуска цикла
    chrome.runtime.sendMessage({ action: 'startDailyTasks' });
  });
}

// Удаление баннера
function removeBanner() {
  if (banner) {
    banner.remove();
    banner = null;
    document.body.style.paddingTop = '';
  }
}

// Проверка наличия активных страниц
async function checkActiveTasks() {
  // Если это вкладка с задачей (проверяем URL) - не показываем баннер
  if (isTaskTab()) {
    removeBanner();
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getActivePages' });
    const activePages = response.pages || [];
    
    if (activePages.length > 0) {
      createBanner();
    } else {
      removeBanner();
    }
  } catch (error) {
    console.error('Error checking active tasks:', error);
  }
}

// Инициализация
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkActiveTasks);
} else {
  checkActiveTasks();
}

// Слушаем обновления от background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'pagesUpdated') {
    checkActiveTasks();
  } else if (message.action === 'bannerSettingChanged') {
    // Настройка баннера изменилась
    if (message.enabled) {
      checkActiveTasks(); // Проверяем и показываем баннер если нужно
    } else {
      removeBanner(); // Скрываем баннер
    }
  } else if (message.action === 'showAddedNotification') {
    showNotification('Page added to Daily Panel', message.title, 'success');
  } else if (message.action === 'showAlreadyAddedNotification') {
    showNotification('Page already in Daily Panel', message.title, 'info');
  }
});

// Функция для показа уведомления
function showNotification(text, title, type) {
  // Удаляем предыдущее уведомление если есть
  const existing = document.getElementById('daily-panel-notification');
  if (existing) {
    existing.remove();
  }

  // Создаём уведомление
  const notification = document.createElement('div');
  notification.id = 'daily-panel-notification';
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #ffffff;
    color: #000000;
    padding: 20px;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    z-index: 1000000;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    width: 480px;
    max-width: 90vw;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;

  // Заголовок с иконкой
  const headerContainer = document.createElement('div');
  headerContainer.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-bottom: 24px;
  `;

  // Иконка schedule (без фона)
  const icon = document.createElement('div');
  icon.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  `;
  icon.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 5V19M5 12H19" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;

  // Заголовок
  const header = document.createElement('h1');
  header.style.cssText = `
    font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 20px;
    font-weight: 500;
    color: #000000;
    margin: 0;
    line-height: 1.2;
  `;
  
  if (type === 'success') {
    header.innerHTML = 'Task <span id="notification-highlight">added</span>';
  } else {
    header.textContent = 'Task already added';
  }

  headerContainer.appendChild(icon);
  headerContainer.appendChild(header);

  // Контейнер для страницы (стиль как .page-item)
  const pageContainer = document.createElement('div');
  pageContainer.style.cssText = `
    display: flex;
    align-items: center;
    padding: 16px;
    background: #ffffff;
    border-radius: 8px;
    border: 1px solid #e5e5e5;
    gap: 12px;
  `;

  // Фавикон
  const favicon = document.createElement('img');
  const domain = new URL(window.location.href).hostname;
  favicon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  favicon.style.cssText = `
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  `;
  favicon.onerror = function() {
    this.style.display = 'none';
  };

  // Контейнер для текста (название + URL)
  const textContainer = document.createElement('div');
  textContainer.style.cssText = `
    flex: 1;
    overflow: hidden;
  `;

  // Название страницы
  const titleText = document.createElement('div');
  titleText.style.cssText = `
    font-size: 14px;
    font-weight: 500;
    color: #000000;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 4px;
  `;
  titleText.textContent = title;

  // URL
  const urlText = document.createElement('div');
  urlText.style.cssText = `
    font-size: 12px;
    font-weight: 400;
    color: #999999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `;
  urlText.textContent = window.location.href;

  textContainer.appendChild(titleText);
  textContainer.appendChild(urlText);

  pageContainer.appendChild(favicon);
  pageContainer.appendChild(textContainer);

  notification.appendChild(headerContainer);
  notification.appendChild(pageContainer);

  document.body.appendChild(notification);

  // Анимация появления
  requestAnimationFrame(() => {
    notification.style.opacity = '1';
    
    // Применяем RoughNotation подчёркивание на "added"
    if (type === 'success' && typeof RoughNotation !== 'undefined') {
      const highlightElement = document.getElementById('notification-highlight');
      if (highlightElement) {
        const annotation = RoughNotation.annotate(highlightElement, {
          type: 'highlight',
          color: '#FFC107',
          iterations: 2,
          animationDuration: 600,
          padding: 2
        });
        
        setTimeout(() => {
          annotation.show();
        }, 100);
      }
    }
  });

  // Автоматическое скрытие через 3 секунды
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

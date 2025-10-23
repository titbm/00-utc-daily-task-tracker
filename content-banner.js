// Content script для отображения баннера с активными задачами

let banner = null;
let isTaskTab = false; // Флаг для вкладок, открытых из Daily Panel

// Создание баннера
function createBanner() {
  if (banner || isTaskTab) return; // Не показываем баннер во вкладках с отработкой
  
  banner = document.createElement('div');
  banner.id = 'daily-panel-banner';
  banner.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      padding: 8px 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <span style="font-weight: 600; color: #212529; font-size: 13px;">
        Daily tasks are not completed
      </span>
      <button id="daily-panel-start-btn" style="
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 6px 20px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
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
    startBtn.style.transform = 'translateY(-1px)';
    startBtn.style.boxShadow = '0 3px 8px rgba(102, 126, 234, 0.3)';
  });
  startBtn.addEventListener('mouseleave', () => {
    startBtn.style.transform = 'translateY(0)';
    startBtn.style.boxShadow = 'none';
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
  } else if (message.action === 'markAsTaskTab') {
    // Эта вкладка открыта для отработки задачи - не показываем баннер
    isTaskTab = true;
    removeBanner();
  }
});

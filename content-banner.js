// Content script для отображения баннера с активными задачами

let banner = null;

// Минимальная реализация RoughNotation underline (извлечено из rough-notation.iife.js)
// Только необходимый функционал для анимированного подчёркивания

// Random number generator с seed для консистентности
class RoughRandomizer {
  constructor(seed) {
    this.seed = seed;
  }
  next() {
    return this.seed
      ? (2 ** 31 - 1 & (this.seed = Math.imul(48271, this.seed))) / 2 ** 31
      : Math.random();
  }
}

// Получить случайное число из randomizer'а
function getRandomNumber(config) {
  if (!config.randomizer) {
    config.randomizer = new RoughRandomizer(config.seed || 0);
  }
  return config.randomizer.next();
}

// Случайное смещение в диапазоне
function offsetValue(min, max, config, roughnessGain = 1) {
  return config.roughness * roughnessGain * (getRandomNumber(config) * (max - min) + min);
}

// Случайное смещение от 0
function offset(x, config, roughnessGain = 1) {
  return offsetValue(-x, x, config, roughnessGain);
}

// Рисование линии с roughness эффектом
function drawRoughLine(x1, y1, x2, y2, config) {
  const lengthSq = Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2);
  const length = Math.sqrt(lengthSq);
  
  let roughnessGain = 1;
  if (length < 200) roughnessGain = 1;
  else if (length > 500) roughnessGain = 0.4;
  else roughnessGain = -0.0016668 * length + 1.233334;
  
  let maxOffset = config.maxRandomnessOffset || 0;
  if (maxOffset * maxOffset * 100 > lengthSq) {
    maxOffset = length / 10;
  }
  
  const divergePoint = 0.2 + 0.2 * getRandomNumber(config);
  
  let controlPoint1X = config.bowing * config.maxRandomnessOffset * (y2 - y1) / 200;
  let controlPoint1Y = config.bowing * config.maxRandomnessOffset * (x1 - x2) / 200;
  controlPoint1X = offset(controlPoint1X, config, roughnessGain);
  controlPoint1Y = offset(controlPoint1Y, config, roughnessGain);
  
  const ops = [];
  
  // Move to start
  ops.push({
    op: 'move',
    data: [x1 + offset(maxOffset, config, roughnessGain), y1 + offset(maxOffset, config, roughnessGain)]
  });
  
  // Bezier curve to end
  ops.push({
    op: 'bcurveTo',
    data: [
      controlPoint1X + x1 + (x2 - x1) * divergePoint + offset(maxOffset, config, roughnessGain),
      controlPoint1Y + y1 + (y2 - y1) * divergePoint + offset(maxOffset, config, roughnessGain),
      controlPoint1X + x1 + 2 * (x2 - x1) * divergePoint + offset(maxOffset, config, roughnessGain),
      controlPoint1Y + y1 + 2 * (y2 - y1) * divergePoint + offset(maxOffset, config, roughnessGain),
      x2 + offset(maxOffset, config, roughnessGain),
      y2 + offset(maxOffset, config, roughnessGain)
    ]
  });
  
  return ops;
}

// Конвертация операций в SVG path
function opsToPath(ops) {
  let path = '';
  for (const op of ops) {
    const data = op.data;
    switch (op.op) {
      case 'move':
        path += `M${data[0]} ${data[1]} `;
        break;
      case 'bcurveTo':
        path += `C${data[0]} ${data[1]}, ${data[2]} ${data[3]}, ${data[4]} ${data[5]} `;
        break;
      case 'lineTo':
        path += `L${data[0]} ${data[1]} `;
        break;
    }
  }
  return path.trim();
}

// Создание highlight анимации (как в RoughNotation) - эффект маркера-выделителя
function createHighlightAnimation(element, options = {}) {
  const color = options.color || '#FFC107';
  const duration = options.animationDuration || 600;
  const iterations = 2; // Количество линий
  const padding = [5, 5, 5, 5]; // top, right, bottom, left
  
  // Получаем размеры элемента
  const rect = element.getBoundingClientRect();
  
  // Для highlight используется особый конфиг с roughness: 3
  const config = {
    maxRandomnessOffset: 2,
    roughness: 3, // Больше roughness для эффекта маркера
    bowing: 1,
    stroke: color,
    strokeWidth: 0.95 * rect.height, // Толстая линия = 95% высоты
    seed: Math.floor(Math.random() * 2 ** 31)
  };
  
  const strokeWidth = 0.95 * rect.height; // Толстая линия для заполнения фона
  
  // Создаём SVG контейнер
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'rough-annotation');
  svg.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    overflow: visible;
    pointer-events: none;
    width: 100px;
    height: 100px;
    z-index: -1;
  `;
  
  // Вставляем SVG перед элементом (как в оригинале для highlight)
  element.insertAdjacentElement('beforebegin', svg);
  
  // Позиция линии highlight (посередине высоты элемента)
  const svgRect = svg.getBoundingClientRect();
  const lineY = (rect.top || rect.y) + rect.height / 2 - (svgRect.top || svgRect.y);
  const lineX1 = (rect.left || rect.x) - (svgRect.left || svgRect.x);
  const lineX2 = lineX1 + rect.width;
  
  // Генерируем несколько линий (iterations)
  const paths = [];
  for (let i = 0; i < iterations; i++) {
    const ops = i % 2 
      ? drawRoughLine(lineX2, lineY, lineX1, lineY, config) // справа налево
      : drawRoughLine(lineX1, lineY, lineX2, lineY, config); // слева направо
    
    const pathString = opsToPath(ops);
    paths.push(pathString);
  }
  
  // Создаём path элементы с анимацией
  const pathElements = [];
  let totalLength = 0;
  
  for (const pathString of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathString);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', String(strokeWidth));
    
    svg.appendChild(path);
    
    const length = path.getTotalLength();
    totalLength += length;
    
    pathElements.push({ path, length });
  }
  
  return {
    show: () => {
      // Добавляем keyframe анимацию если ещё нет
      if (!window.__rno_kf_s) {
        const style = document.createElement('style');
        style.textContent = '@keyframes rough-notation-dash { to { stroke-dashoffset: 0; } }';
        document.head.appendChild(style);
        window.__rno_kf_s = true;
      }
      
      // Анимируем каждый path
      let delay = 0;
      for (const { path, length } of pathElements) {
        const animDuration = totalLength ? duration * (length / totalLength) : 0;
        
        path.style.strokeDashoffset = String(length);
        path.style.strokeDasharray = String(length);
        path.style.animation = `rough-notation-dash ${animDuration}ms ease-out ${delay}ms forwards`;
        
        delay += animDuration;
      }
    },
    remove: () => {
      svg.remove();
    }
  };
}

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
    gap: 8px;
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
    header.textContent = 'Task added';
    header.id = 'notification-highlight'; // ID на весь заголовок
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
    
    // Применяем минимальную highlight анимацию
    if (type === 'success') {
      const highlightElement = document.getElementById('notification-highlight');
      if (highlightElement) {
        const annotation = createHighlightAnimation(highlightElement, {
          color: '#FFC107',
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

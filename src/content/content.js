// Content script для отображения баннера с активными задачами

// Константы actions (дублируются из constants.js, т.к. content script не поддерживает ES6 modules)
const ACTIONS = {
  GET_ACTIVE_PAGES: 'getActivePages',
  GET_TAB_STATUS: 'getMyTabStatus',
  PAGES_UPDATED: 'pagesUpdated',
  BANNER_SETTING_CHANGED: 'bannerSettingChanged',
  SHOW_ADDED_NOTIFICATION: 'showAddedNotification',
  SHOW_ALREADY_ADDED_NOTIFICATION: 'showAlreadyAddedNotification'
};

let banner = null;

// Загружаем Material Symbols если ещё нет
if (!document.getElementById('daily-panel-material-symbols')) {
  const link = document.createElement('link');
  link.id = 'daily-panel-material-symbols';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined';
  document.head.appendChild(link);
}

// Загружаем Outfit шрифт для заголовков
if (!document.getElementById('daily-panel-outfit-font')) {
  const link = document.createElement('link');
  link.id = 'daily-panel-outfit-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap';
  document.head.appendChild(link);
}

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
  const lineX1 = (rect.left || rect.x) - (svgRect.left || svgRect.x) - 4; // Немного левее
  const lineX2 = lineX1 + rect.width + 16; // Добавляем 16px к ширине для полного покрытия
  
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

// Проверка статуса текущей вкладки (задача из цикла, задача из панели, или обычная страница)
async function getTabStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: ACTIONS.GET_TAB_STATUS
    });
    return response || { isTask: false, fromCycle: false };
  } catch (error) {
    return { isTask: false, fromCycle: false };
  }
}

// Создание баннера
async function createBanner() {
  if (banner) return;
  
  // Получаем статус вкладки
  const tabStatus = await getTabStatus();
  
  // Определяем тип баннера
  let bannerType = 'normal'; // normal | cycle | panel
  let bannerText = 'Daily tasks are not completed';
  let bannerIcon = 'sync'; // sync или bedtime
  let bannerColor = '#000000';
  
  if (tabStatus.isTask && tabStatus.fromCycle) {
    // Вкладка из цикла - черная луна на белом фоне
    bannerType = 'cycle';
    bannerIcon = 'bedtime';
    bannerColor = '#000000'; // Черный цвет
  } else if (tabStatus.isTask && !tabStatus.fromCycle) {
    // Вкладка открыта вручную из панели - не показываем иконку
    return;
  }
  // else - обычная страница, показываем normal баннер
  
  // Проверяем настройку баннера ТОЛЬКО для обычного баннера
  if (bannerType === 'normal') {
    const { bannerEnabled = true } = await chrome.storage.local.get('bannerEnabled');
    if (!bannerEnabled) return; // Баннер отключен в настройках
  }
  
  banner = document.createElement('div');
  banner.id = 'daily-panel-banner';
  
  if (bannerType === 'cycle') {
    // Квадратная иконка с закругленными углами для цикла
    banner.innerHTML = `
      <div style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #ffffff;
        border-radius: 8px;
        width: 56px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 2147483647;
        cursor: default;
        animation: cycleBounce 0.6s ease-out;
      " id="cycle-indicator">
        <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="#000000" style="animation: moonRotate 3s linear infinite;">
          <path d="M376-140q140.07 0 238.53-98Q713-336 713-480t-99.5-242Q514-820 374-820q-20 0-41 2t-32 5q64 72 98 157t34 176q0 91-34 176.5T302-148q11 3 31 5.5t43 2.5Zm5 60q-54.38 0-106.19-13Q223-106 188-126q88-66 136.5-158T373-479.5Q373-583 324-676T187-833q35-20 87.47-33.5T382-880q80.83 0 151.91 30.5Q605-819 658.5-765.5t84 126.5Q773-566 773-481t-30.95 158.29q-30.94 73.28-84 127.5Q605-141 533.59-110.5 462.19-80 381-80Zm52-399Z"/>
        </svg>
      </div>
      <style>
        @keyframes cycleBounce {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes moonRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      </style>
    `;
    
    document.body.appendChild(banner);
    
    // Hover эффект (только увеличение)
    const indicator = banner.querySelector('#cycle-indicator');
    
    indicator.addEventListener('mouseenter', () => {
      indicator.style.transform = 'scale(1.1)';
    });
    indicator.addEventListener('mouseleave', () => {
      indicator.style.transform = 'scale(1)';
    });
    
    // Tooltip при наведении
    indicator.title = 'Task cycle is running';
    
  } else {
    // Обычный баннер сверху для normal режима (без кнопки)
    banner.innerHTML = `
      <div id="normal-banner-content" style="
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
        transition: transform 0.3s ease, opacity 0.3s ease;
      ">
        <span style="font-weight: 400; color: ${bannerColor}; font-size: 14px;">
          ${bannerText}
        </span>
      </div>
    `;
    
    document.body.prepend(banner);
    
    // Добавляем отступ для body чтобы контент не перекрывался
    document.body.style.paddingTop = '36px';
    
    // Скрытие баннера когда курсор на баннере (0-36px)
    const bannerContent = banner.querySelector('#normal-banner-content');
    let isHidden = false;
    
    document.addEventListener('mousemove', (e) => {
      // Если курсор на баннере (0-36px) - скрываем
      if (e.clientY < 36 && !isHidden) {
        isHidden = true;
        bannerContent.style.transform = 'translateY(-100%)';
        bannerContent.style.opacity = '0';
      }
      // Если курсор ниже баннера (36px+) - показываем
      else if (e.clientY >= 36 && isHidden) {
        isHidden = false;
        bannerContent.style.transform = 'translateY(0)';
        bannerContent.style.opacity = '1';
      }
    });
  }
  
  // Добавляем keyframes для анимации
  if (!document.getElementById('daily-panel-banner-animations')) {
    const style = document.createElement('style');
    style.id = 'daily-panel-banner-animations';
    style.textContent = `
      @keyframes rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

// Удаление баннера
function removeBanner() {
  if (banner) {
    banner.remove();
    banner = null;
    // Убираем отступ только если это был баннер сверху
    document.body.style.paddingTop = '';
  }
}

// Проверка наличия активных страниц
async function checkActiveTasks() {
  try {
    const response = await chrome.runtime.sendMessage({ action: ACTIONS.GET_ACTIVE_PAGES });
    const activePages = response.pages || [];
    
    if (activePages.length > 0) {
      createBanner();
    } else {
      removeBanner();
    }
  } catch (error) {
    // Тихо игнорируем ошибки в content script
    // (может быть недоступен runtime при закрытии расширения)
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
  if (message.action === ACTIONS.PAGES_UPDATED) {
    checkActiveTasks();
  } else if (message.action === ACTIONS.BANNER_SETTING_CHANGED) {
    // Настройка баннера изменилась
    if (message.enabled) {
      checkActiveTasks(); // Проверяем и показываем баннер если нужно
    } else {
      removeBanner(); // Скрываем баннер
    }
  } else if (message.action === ACTIONS.SHOW_ADDED_NOTIFICATION) {
    showNotification('Page added to Daily Panel', message.title, 'success');
  } else if (message.action === ACTIONS.SHOW_ALREADY_ADDED_NOTIFICATION) {
    showNotification('Page already in Daily Panel', message.title, 'info');
  }
});

// Функция для показа уведомления
function showNotification(text, title, type) {
  // Загружаем Outfit шрифт если ещё не загружен
  if (!document.getElementById('daily-panel-outfit-font')) {
    const style = document.createElement('style');
    style.id = 'daily-panel-outfit-font';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap');
    `;
    document.head.appendChild(style);
  }
  
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
    padding: 24px 20px 20px 20px;
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
    margin-bottom: 16px;
  `;
  
  // Внутренний контейнер для иконки и текста (только они подсвечиваются)
  const highlightWrapper = document.createElement('div');
  highlightWrapper.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  if (type === 'success') {
    highlightWrapper.id = 'notification-highlight'; // ID только на иконку + текст
  }

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
    font-weight: 400;
    color: #000000;
    margin: 0;
    line-height: 1.2;
  `;
  
  if (type === 'success') {
    header.textContent = 'Task added';
  } else {
    header.textContent = 'Task already added';
  }

  highlightWrapper.appendChild(icon);
  highlightWrapper.appendChild(header);
  headerContainer.appendChild(highlightWrapper);

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
    
    // Применяем минимальную highlight анимацию на весь контейнер (иконка + заголовок)
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

// ============================================================================
// НОВЫЙ ЦЕНТРАЛЬНЫЙ БАННЕР - НЕ ТРОГАЕТ СУЩЕСТВУЮЩИЙ КОД
// ============================================================================

let centralBanner = null;

function createCentralBanner() {
  if (centralBanner) return; // Уже создан
  
  centralBanner = document.createElement('div');
  centralBanner.id = 'daily-panel-central-banner';
  centralBanner.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #ffffff;
    border-radius: 8px;
    border: 1px solid #e5e5e5;
    padding: 32px 28px 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    z-index: 2147483646;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 500px;
    width: 100%;
    text-align: center;
    animation: centralBannerFadeIn 0.4s ease-out;
  `;
  
  centralBanner.innerHTML = `
    <style>
      @keyframes centralBannerFadeIn {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      
      @keyframes iconBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-20px); }
      }
      
      #daily-panel-central-banner-close:hover {
        background: #333333;
      }
    </style>
    
    <!-- Иконка -->
    <div style="
      margin-bottom: 16px;
      animation: iconBounce 1s ease-in-out;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <img src="${chrome.runtime.getURL('assets/icons/local_fire_department-cropped.svg')}" width="80" height="80" style="filter: grayscale(1) brightness(0.6);">
    </div>
    
    <!-- Заголовок с подсветкой -->
    <div style="margin-bottom: 12px;">
      <div style="display: inline-block; position: relative;">
        <h1 id="central-banner-highlight" style="
          margin: 0;
          font-size: 28px;
          font-weight: 500;
          font-family: 'Outfit', 'Inter', sans-serif;
          color: #000000;
          position: relative;
          z-index: 1;
        ">Work Faster</h1>
      </div>
    </div>
    
    <!-- Текст -->
    <p style="
      margin: 0 0 24px 0;
      font-size: 16px;
      color: #666666;
    ">Use Ctrl+W to close tabs quickly and complete your tasks faster.</p>
    
    <!-- Кнопка закрытия -->
    <button id="daily-panel-central-banner-close" style="
      background: #000000;
      color: #ffffff;
      border: 1px solid #000000;
      padding: 14px 28px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: 'Inter', sans-serif;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    ">
      <img src="${chrome.runtime.getURL('assets/icons/check.svg')}" width="20" height="20" style="filter: brightness(0) invert(1);">
      Got it
    </button>
    
    <!-- Helper text -->
    <p style="
      font-size: 12px;
      color: #999999;
      margin-top: 16px;
      margin-bottom: 0;
    ">Press Esc or Enter to close</p>
  `;
  
  document.body.appendChild(centralBanner);
  
  // Применяем highlight анимацию на заголовок (как в уведомлении "Task added")
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const highlightElement = document.getElementById('central-banner-highlight');
      if (highlightElement) {
        // Добавляем небольшой padding слева и справа для полного покрытия
        const rect = highlightElement.getBoundingClientRect();
        highlightElement.style.paddingLeft = '4px';
        highlightElement.style.paddingRight = '4px';
        
        const annotation = createHighlightAnimation(highlightElement, {
          color: '#FFC107',
          animationDuration: 600,
          padding: 2
        });
        
        // Увеличиваем задержку чтобы элемент успел полностью отрендериться
        setTimeout(() => {
          annotation.show();
        }, 200);
      }
    });
  });
  
  // Обработчик кнопки закрытия
  const closeButton = centralBanner.querySelector('#daily-panel-central-banner-close');
  closeButton.addEventListener('click', () => {
    centralBanner.style.opacity = '0';
    centralBanner.style.transform = 'translate(-50%, -50%) scale(0.9)';
    setTimeout(() => {
      centralBanner.remove();
      centralBanner = null;
    }, 300);
  });
  
  // Закрытие по Esc и Enter
  const handleKeyPress = (e) => {
    if ((e.key === 'Escape' || e.key === 'Enter') && centralBanner) {
      closeButton.click();
      document.removeEventListener('keydown', handleKeyPress);
    }
  };
  document.addEventListener('keydown', handleKeyPress);
  
  // Добавляем transition для плавного закрытия
  centralBanner.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
}

// Проверка и показ центрального баннера только на первой странице первого цикла
async function checkAndShowCentralBanner() {
  try {
    // Получаем статус вкладки
    const tabStatus = await getTabStatus();
    
    // Показываем баннер только если:
    // 1. Это задача из цикла (fromCycle === true)
    // 2. Это первая задача (cycleIndex === 0)
    // 3. Баннер еще не показывался после установки/включения
    if (tabStatus.isTask && tabStatus.fromCycle && tabStatus.cycleIndex === 0) {
      // Проверяем флаг в local storage (сохраняется между перезапусками браузера)
      const { centralBannerShown } = await chrome.storage.local.get('centralBannerShown');
      
      if (!centralBannerShown) {
        // Ждем загрузки шрифтов перед показом баннера
        if (document.fonts) {
          await document.fonts.ready;
        } else {
          // Fallback для старых браузеров - просто ждем 500ms
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Показываем баннер
        createCentralBanner();
        
        // Устанавливаем флаг, что баннер показан
        await chrome.storage.local.set({ centralBannerShown: true });
      }
    }
  } catch (error) {
    // Тихо игнорируем ошибки
  }
}

// Показываем центральный баннер при загрузке страницы (только для первой страницы цикла)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAndShowCentralBanner);
} else {
  checkAndShowCentralBanner();
}

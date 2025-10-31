// Content script for displaying the banner with active tasks

// Action constants (duplicated from constants.js, since content script does not support ES6 modules)
const ACTIONS = {
  GET_ACTIVE_PAGES: 'getActivePages',
  GET_TAB_STATUS: 'getMyTabStatus',
  PAGES_UPDATED: 'pagesUpdated',
  BANNER_SETTING_CHANGED: 'bannerSettingChanged',
  SHOW_ADDED_NOTIFICATION: 'showAddedNotification',
  SHOW_ALREADY_ADDED_NOTIFICATION: 'showAlreadyAddedNotification',
  CYCLE_ENDED: 'cycleEnded',
  MOVE_TO_COMPLETED: 'moveToCompleted'
};

let banner = null;

// Load Material Symbols if not already loaded
if (!document.getElementById('extension-material-symbols')) {
  const link = document.createElement('link');
  link.id = 'extension-material-symbols';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined';
  document.head.appendChild(link);
}// Load Outfit font for headers
if (!document.getElementById('extension-outfit-font')) {
  const link = document.createElement('link');
  link.id = 'extension-outfit-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap';
  document.head.appendChild(link);
}

// Minimal implementation of RoughNotation underline (extracted from rough-notation.iife.js)
// Only the necessary functionality for animated underlining

// Random number generator with seed for consistency
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

// Get a random number from the randomizer
function getRandomNumber(config) {
  if (!config.randomizer) {
    config.randomizer = new RoughRandomizer(config.seed || 0);
  }
  return config.randomizer.next();
}

// Random offset within a range
function offsetValue(min, max, config, roughnessGain = 1) {
  return config.roughness * roughnessGain * (getRandomNumber(config) * (max - min) + min);
}

// Random offset from 0
function offset(x, config, roughnessGain = 1) {
  return offsetValue(-x, x, config, roughnessGain);
}

// Draw a line with roughness effect
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

// Convert operations to SVG path
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

// Create highlight animation (like in RoughNotation) - marker highlight effect
function createHighlightAnimation(element, options = {}) {
  const color = options.color || '#FFC107';
  const duration = options.animationDuration || 600;
  const iterations = 2; // Количество линий
  const padding = [5, 5, 5, 5]; // top, right, bottom, left
  
  // Get element dimensions
  const rect = element.getBoundingClientRect();
  
  // For highlight, use a special config with roughness: 3
  const config = {
    maxRandomnessOffset: 2,
    roughness: 3, // Больше roughness для эффекта маркера
    bowing: 1,
    stroke: color,
    strokeWidth: 0.95 * rect.height, // Толстая линия = 95% высоты
    seed: Math.floor(Math.random() * 2 ** 31)
  };
  
  const strokeWidth = 0.95 * rect.height; // Толстая линия для заполнения фона
  
  // Create SVG container
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
  
  // Insert SVG before the element (as in the original for highlight)
  element.insertAdjacentElement('beforebegin', svg);
  
  // Highlight line position (middle of the element height)
  const svgRect = svg.getBoundingClientRect();
  const lineY = (rect.top || rect.y) + rect.height / 2 - (svgRect.top || svgRect.y);
  const lineX1 = (rect.left || rect.x) - (svgRect.left || svgRect.x) - 4; // Немного левее
  const lineX2 = lineX1 + rect.width + 16; // Добавляем 16px к ширине для полного покрытия
  
  // Generate several lines (iterations)
  const paths = [];
  for (let i = 0; i < iterations; i++) {
    const ops = i % 2 
      ? drawRoughLine(lineX2, lineY, lineX1, lineY, config) // справа налево
      : drawRoughLine(lineX1, lineY, lineX2, lineY, config); // слева направо
    
    const pathString = opsToPath(ops);
    paths.push(pathString);
  }
  
  // Create path elements with animation
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
  // Add keyframe animation if not already present
      if (!window.__rno_kf_s) {
        const style = document.createElement('style');
        style.textContent = '@keyframes rough-notation-dash { to { stroke-dashoffset: 0; } }';
        document.head.appendChild(style);
        window.__rno_kf_s = true;
      }
      
  // Animate each path
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

// Check the status of the current tab (task from cycle, task from panel, or regular page)
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

// Create banner
async function createBanner() {
  if (banner) return;
  
  // Get tab status
  const tabStatus = await getTabStatus();
  
  // Determine banner type
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
  
  // Check banner setting ONLY for normal banner
  if (bannerType === 'normal') {
    const { bannerEnabled = true } = await chrome.storage.local.get('bannerEnabled');
  if (!bannerEnabled) return; // Banner is disabled in settings
  }
  
  banner = document.createElement('div');
  banner.id = 'extension-banner';
  
  if (bannerType === 'cycle') {
    // Square icon with rounded corners for cycle
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
    
  // Hover effect (only scaling up)
    const indicator = banner.querySelector('#cycle-indicator');
    
    indicator.addEventListener('mouseenter', () => {
      indicator.style.transform = 'scale(1.1)';
    });
    indicator.addEventListener('mouseleave', () => {
      indicator.style.transform = 'scale(1)';
    });
    
  // Tooltip on hover
    indicator.title = 'Task cycle is running';
    
  } else {
  // Regular banner at the top for normal mode (no button)
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
    
  // Add padding to body so content is not overlapped
    document.body.style.paddingTop = '36px';
    
  // Hide banner when cursor is over the banner area (0-36px)
    const bannerContent = banner.querySelector('#normal-banner-content');
    let isHidden = false;
    
    document.addEventListener('mousemove', (e) => {
  // If cursor is over the banner (0-36px) - hide
      if (e.clientY < 36 && !isHidden) {
        isHidden = true;
        bannerContent.style.transform = 'translateY(-100%)';
        bannerContent.style.opacity = '0';
      }
  // If cursor is below the banner (36px+) - show
      else if (e.clientY >= 36 && isHidden) {
        isHidden = false;
        bannerContent.style.transform = 'translateY(0)';
        bannerContent.style.opacity = '1';
      }
    });
  }
  
  // Add keyframes for animation
  if (!document.getElementById('extension-banner-animations')) {
    const style = document.createElement('style');
    style.id = 'extension-banner-animations';
    style.textContent = `
      @keyframes rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

// Remove cycle indicator with animation
function removeCycleIndicator(callback) {
  const indicator = document.getElementById('cycle-indicator');
  if (indicator) {
    indicator.style.transition = 'opacity 0.3s, transform 0.3s';
    indicator.style.opacity = '0';
    indicator.style.transform = 'scale(0)';
    setTimeout(() => {
      indicator.remove();
      // Remove the entire banner after moon disappears
      if (banner) {
        banner.remove();
        banner = null;
      }
      // Call callback after animation completes
      if (callback) callback();
    }, 300);
  } else {
    // If no indicator, call callback immediately
    if (callback) callback();
  }
}

// Remove banner
function removeBanner() {
  if (banner) {
    banner.remove();
    banner = null;
  // Remove padding only if it was the top banner
    document.body.style.paddingTop = '';
  }
}

// Check for active pages
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
  // Silently ignore errors in content script
  // (runtime may be unavailable when extension is closed)
  }
}

// Initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkActiveTasks);
} else {
  checkActiveTasks();
}

// Listen for updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === ACTIONS.PAGES_UPDATED) {
    checkActiveTasks();
  } else if (message.action === ACTIONS.BANNER_SETTING_CHANGED) {
  // Banner setting changed
    if (message.enabled) {
  checkActiveTasks(); // Check and show banner if needed
    } else {
  removeBanner(); // Hide banner
    }
  } else if (message.action === ACTIONS.SHOW_ADDED_NOTIFICATION) {
    showNotification('Page added to Extension', message.title, 'success', message.bookmarkId);
  } else if (message.action === ACTIONS.SHOW_ALREADY_ADDED_NOTIFICATION) {
    showNotification('Page already in Extension', message.title, 'info', null);
  } else if (message.action === ACTIONS.CYCLE_ENDED) {
    removeCycleIndicator(() => {
      // After moon animation completes, check if we need normal banner
      checkActiveTasks();
    });
  }
});

// Function to show notification
function showNotification(text, title, type, bookmarkId = null) {
  // Load Outfit font if not already loaded
  if (!document.getElementById('extension-outfit-font')) {
    const style = document.createElement('style');
    style.id = 'extension-outfit-font';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap');
    `;
    document.head.appendChild(style);
  }
  
  // Remove previous notification if exists
  const existing = document.getElementById('extension-notification');
  if (existing) {
    existing.remove();
  }

  // Create notification
  const notification = document.createElement('div');
  notification.id = 'extension-notification';
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #ffffff;
    color: #000000;
    padding: 24px 20px;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    z-index: 1000000;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    width: 480px;
    max-width: 90vw;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;

  // Header with icon
  const headerContainer = document.createElement('div');
  headerContainer.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  `;
  
  // Inner container for icon and text (only these are highlighted)
  const highlightWrapper = document.createElement('div');
  highlightWrapper.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  if (type === 'success') {
    highlightWrapper.id = 'notification-highlight'; // ID только на иконку + текст
  }

  // Schedule icon (no background)
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

  // Header
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

  // Container for page (styled like .page-item)
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

  // Favicon
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

  // Container for text (title + URL)
  const textContainer = document.createElement('div');
  textContainer.style.cssText = `
    flex: 1;
    overflow: hidden;
  `;

  // Page title
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

  // Show animation
  requestAnimationFrame(() => {
    notification.style.opacity = '1';
    
  // Apply minimal highlight animation to the whole container (icon + header)
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

  // Helper function to setup button styles and hover effects
  function setupButton(btn) {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#f5f5f5';
      btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#ffffff';
      btn.style.boxShadow = 'none';
    });
    
    btn.addEventListener('mousedown', () => {
      btn.style.background = '#e8e8e8';
      btn.style.transform = 'scale(0.98)';
      btn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)';
    });
    
    btn.addEventListener('mouseup', () => {
      btn.style.background = '#f5f5f5';
      btn.style.transform = 'scale(1)';
    });
  }

  // Add buttons for notification
  if (type === 'success') {
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `
      display: flex;
      gap: 8px;
      margin-top: 16px;
    `;

    // Button style template
    const buttonBaseStyle = `
      flex: 1;
      padding: 12px;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      background: #ffffff;
      color: #000000;
      transition: all 0.2s;
      font-family: 'Inter', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin: 0;
    `;

    // First button - "Start tomorrow (00 UTC)"
    const btn1 = document.createElement('button');
    btn1.style.cssText = buttonBaseStyle;
    
    const icon1 = document.createElement('img');
    icon1.src = chrome.runtime.getURL('assets/icons/bedtime.svg');
    icon1.style.cssText = 'width: 15px; height: 15px; flex-shrink: 0;';
    
    const text1 = document.createElement('span');
    text1.textContent = 'Start tomorrow';
    
    btn1.appendChild(icon1);
    btn1.appendChild(text1);
    setupButton(btn1);
    
    btn1.addEventListener('click', async () => {
      // Move page to Completed (like closing tab for midnight task)
      if (bookmarkId) {
        try {
          console.log('[00-UTC-content.js] Moving to completed, bookmarkId:', bookmarkId);
          const response = await chrome.runtime.sendMessage({
            action: ACTIONS.MOVE_TO_COMPLETED,
            bookmarkId: bookmarkId
          });
          console.log('[00-UTC-content.js] Move response:', response);
        } catch (error) {
          console.error('[00-UTC-content.js] Error moving to completed:', error);
        }
      } else {
        console.error('[00-UTC-content.js] No bookmarkId provided');
      }
      
      notification.style.opacity = '0';
      setTimeout(() => {
        notification.remove();
      }, 300);
    });

    // Second button - "Start after time"
    const btn2 = document.createElement('button');
    btn2.style.cssText = buttonBaseStyle;
    
    const icon2 = document.createElement('img');
    icon2.src = chrome.runtime.getURL('assets/icons/schedule.svg');
    icon2.style.cssText = 'width: 15px; height: 15px; flex-shrink: 0;';
    
    const text2 = document.createElement('span');
    text2.textContent = 'Start after time';
    
    btn2.appendChild(icon2);
    btn2.appendChild(text2);
    setupButton(btn2);

    btn2.addEventListener('click', async () => {
      // Trigger interval dialog flow (change type, move to completed, open dialog)
      if (bookmarkId) {
        try {
          console.log('[00-UTC-content.js] Triggering interval setup, bookmarkId:', bookmarkId);
          
          const response = await chrome.runtime.sendMessage({
            action: 'setupInterval',
            bookmarkId: bookmarkId
          });
          
          console.log('[00-UTC-content.js] Setup interval response:', response);
        } catch (error) {
          console.error('[00-UTC-content.js] Error with interval setup:', error);
        }
      } else {
        console.error('[00-UTC-content.js] No bookmarkId provided');
      }
      
      notification.style.opacity = '0';
      setTimeout(() => {
        notification.remove();
      }, 300);
    });

    buttonsContainer.appendChild(btn1);
    buttonsContainer.appendChild(btn2);
    notification.appendChild(buttonsContainer);
  }

  // Auto-hide after 3 seconds, but not while hovering (only for 'success' type with buttons)
  let autoHideTimer = null;
  
  const startAutoHideTimer = () => {
    autoHideTimer = setTimeout(() => {
      if (notification && notification.parentNode) {
        notification.style.opacity = '0';
        setTimeout(() => {
          if (notification && notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, 3000);
  };
  
  const cancelAutoHideTimer = () => {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
  };
  
  // Start the timer
  startAutoHideTimer();
  
  // Pause timer on hover only for 'success' type (has buttons)
  if (type === 'success') {
    notification.addEventListener('mouseenter', () => {
      cancelAutoHideTimer();
    });
    
    notification.addEventListener('mouseleave', () => {
      startAutoHideTimer();
    });
  }
}

// ============================================================================
// NEW CENTRAL BANNER - DOES NOT TOUCH EXISTING CODE
// ============================================================================

let centralBanner = null;

function createCentralBanner() {
  if (centralBanner) return; // Уже создан
  
  centralBanner = document.createElement('div');
  centralBanner.id = 'extension-central-banner';
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
      
      #extension-central-banner-close:hover {
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
    <button id="extension-central-banner-close" style="
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
  const closeButton = centralBanner.querySelector('#extension-central-banner-close');
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

// Check and show central banner only on the first page of the first cycle
async function checkAndShowCentralBanner() {
  try {
  // Get tab status
    const tabStatus = await getTabStatus();
    
  // Show banner only if:
  // 1. This is a task from the cycle (fromCycle === true)
  // 2. This is the first task (cycleIndex === 0)
  // 3. The banner has not yet been shown after install/enable
    if (tabStatus.isTask && tabStatus.fromCycle && tabStatus.cycleIndex === 0) {
  // Check flag in local storage (persists between browser restarts)
      const { centralBannerShown } = await chrome.storage.local.get('centralBannerShown');
      
      if (!centralBannerShown) {
  // Wait for fonts to load before showing banner
        if (document.fonts) {
          await document.fonts.ready;
        } else {
          // Fallback for old browsers - just wait 500ms
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
  // Show banner
        createCentralBanner();
        
  // Set flag that banner has been shown
        await chrome.storage.local.set({ centralBannerShown: true });
      }
    }
  } catch (error) {
  // Silently ignore errors
  }
}

// Show central banner on page load (only for the first page of the cycle)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAndShowCentralBanner);
} else {
  checkAndShowCentralBanner();
}

// Импорт констант
import { ACTIONS } from './src/shared/constants.js';

// Импорт модулей
import { initializeBookmarksFolder } from './src/background/folderManager.js';
import { addPageToActive } from './src/background/bookmarkOperations.js';
import { startTimeChecker, initAlarmListener } from './src/background/scheduler.js';
import { restoreCycleState, handleTabRemove } from './src/background/cycle.js';
import { initMessageHandler } from './src/background/messageHandler.js';
import { logError, logInfo } from './src/shared/errorHandler.js';

chrome.runtime.onInstalled.addListener(async (details) => {
  logInfo('runtime', 'Extension installed/updated');
  
  // Сбрасываем флаг показа центрального баннера при установке или включении
  if (details.reason === 'install' || details.reason === 'update') {
    await chrome.storage.local.set({ centralBannerShown: false });
    logInfo('runtime', 'Central banner flag reset');
  }
  
  // Создаем контекстное меню для добавления страниц в панель
  chrome.contextMenus.create({
    id: "addToPanel",
    title: "Add to 00 UTC | Daily Task Tracker",
    contexts: ["page"]
  });
  
  // Отключаем автоматическое открытие панели по клику (обрабатываем вручную)
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error) => {
    logError('setPanelBehavior', error);
  });
  
  // Создаём или находим папки в закладках
  await initializeBookmarksFolder();
  
  // Запускаем периодическую проверку времени
  await startTimeChecker();
});

// Запускаем проверку времени при старте service worker
chrome.runtime.onStartup.addListener(async () => {
  logInfo('runtime', 'Extension startup');
  await initializeBookmarksFolder();
  await startTimeChecker();
});

// ВАЖНО: В Manifest V3 глобальные переменные НЕ персистентны!
// Service worker засыпает через 30 секунд → все let/const обнуляются
// Используем chrome.storage.session для хранения данных между пробуждениями

// Слушаем подключения от sidepanel (для отслеживания активных соединений)
let sidePanelConnections = 0;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    sidePanelConnections++;
    
    port.onDisconnect.addListener(() => {
      sidePanelConnections--;
      if (sidePanelConnections <= 0) {
        sidePanelConnections = 0;
      }
    });
  }
});

// Инициализация слушателя alarm
initAlarmListener();

// Асинхронная инициализация
(async () => {
  // Восстановление состояния цикла (может запустить keep-alive если цикл был активен)
  await restoreCycleState();
  
  // Обработчик закрытия вкладок
  chrome.tabs.onRemoved.addListener(handleTabRemove);
  
  // Инициализация обработчика сообщений
  initMessageHandler();
})();

// Обработчик клика по контекстному меню
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "addToPanel") {
    logInfo('contextMenuHandler', `Adding page via context menu: ${tab.title}`);
    try {
      // Добавляем страницу и получаем результат
      const result = await addPageToActive(tab);
      
      if (result && result.exists) {
        // Страница уже добавлена
        logInfo('contextMenuHandler', `Page already exists: ${tab.title}`);
        chrome.tabs.sendMessage(tab.id, { 
          action: ACTIONS.SHOW_ALREADY_ADDED_NOTIFICATION,
          title: tab.title 
        }).catch(() => {});
      } else {
        // Страница успешно добавлена
        logInfo('contextMenuHandler', `Page added successfully: ${tab.title}`);
        chrome.tabs.sendMessage(tab.id, { 
          action: ACTIONS.SHOW_ADDED_NOTIFICATION,
          title: tab.title 
        }).catch(() => {
          // Игнорируем ошибки (страница может не поддерживать content scripts)
        });
      }
    } catch (error) {
      logError('contextMenuHandler', error);
    }
  }
});

// Отслеживаем включение расширения для сброса флага баннера
chrome.management.getSelf((info) => {
  // При старте service worker проверяем, было ли расширение только что включено
  // Если это первый запуск после включения, сбрасываем флаг
  chrome.storage.local.get('extensionEnabled', (result) => {
    if (result.extensionEnabled === false && info.enabled) {
      // Расширение было выключено, а теперь включено - сбрасываем флаг баннера
      chrome.storage.local.set({ centralBannerShown: false });
      logInfo('runtime', 'Extension enabled - central banner flag reset');
    }
    // Сохраняем текущее состояние
    chrome.storage.local.set({ extensionEnabled: info.enabled });
  });
});

// Отслеживаем изменения состояния расширения
chrome.management.onEnabled.addListener((info) => {
  if (info.id === chrome.runtime.id) {
    chrome.storage.local.set({ 
      centralBannerShown: false,
      extensionEnabled: true
    });
    logInfo('runtime', 'Extension enabled - central banner flag reset');
  }
});

chrome.management.onDisabled.addListener((info) => {
  if (info.id === chrome.runtime.id) {
    chrome.storage.local.set({ extensionEnabled: false });
    logInfo('runtime', 'Extension disabled');
  }
});

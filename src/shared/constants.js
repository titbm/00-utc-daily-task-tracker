// Общие константы для всего расширения

// Debug режим - установите true для включения логирования в консоль
export const DEBUG = false;

// Имя папки в закладках
export const FOLDER_NAME = '00 UTC | Daily Task Tracker';

// Названия подпапок
export const FOLDER_NAMES = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed'
};

// Типы сброса задач
export const RESET_TYPES = {
  MIDNIGHT: 'midnight',
  INTERVAL: 'interval'
};

// Таймауты и интервалы (мс)
export const TIMINGS = {
  DEBOUNCE_DELAY: 500,        // Задержка для батчинга restore запросов
  TIMER_INTERVAL: 1000,       // Обновление таймеров каждую секунду
  ROUGH_NOTATION_RETRY: 100,  // Повтор инициализации RoughNotation
  ALARM_INTERVAL: 1           // Проверка через alarms API (минуты)
};

// Стили для кнопок
export const BUTTON_STATES = {
  ENABLED: {
    opacity: '1',
    cursor: 'pointer'
  },
  DISABLED: {
    opacity: '0.5',
    cursor: 'not-allowed'
  }
};

// Названия actions для chrome.runtime.sendMessage
export const ACTIONS = {
  GET_ACTIVE_PAGES: 'getActivePages',
  GET_COMPLETED_PAGES: 'getCompletedPages',
  ADD_PAGE: 'addPage',
  REMOVE_PAGE: 'removePage',
  RESTORE_PAGE: 'restorePage',
  RESTORE_ALL_AND_START: 'restoreAllAndStart',
  SET_RESET_TYPE: 'setResetType',
  MOVE_TO_COMPLETED: 'moveToCompleted',
  OPEN_NEXT_PAGE: 'openNextPage',
  OPEN_SINGLE_PAGE: 'openSinglePage',
  CHECK_RESTORE: 'checkRestore',
  TOGGLE_BANNER: 'toggleBanner',
  BANNER_SETTING_CHANGED: 'bannerSettingChanged',
  SHOW_ADDED_NOTIFICATION: 'showAddedNotification',
  SHOW_ALREADY_ADDED_NOTIFICATION: 'showAlreadyAddedNotification',
  PAGES_UPDATED: 'pagesUpdated',
  CLOSE_SIDE_PANEL: 'closeSidePanel',
  GET_TAB_STATUS: 'getMyTabStatus'
};

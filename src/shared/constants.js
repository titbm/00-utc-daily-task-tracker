// Common constants for the entire extension

// Debug mode - set to true to enable console logging
export const DEBUG = false;

// Name of the bookmarks folder
export const FOLDER_NAME = '00 UTC | Daily Task Tracker';

// Subfolder names
export const FOLDER_NAMES = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed'
};

// Task reset types
export const RESET_TYPES = {
  MIDNIGHT: 'midnight',
  INTERVAL: 'interval'
};

// Timeouts and intervals (ms)
export const TIMINGS = {
  DEBOUNCE_DELAY: 500,        // Delay for batching restore requests
  TIMER_INTERVAL: 1000,       // Update timers every second
  ROUGH_NOTATION_RETRY: 100,  // Retry RoughNotation initialization
  ALARM_INTERVAL: 1,          // Check via alarms API (minutes)
  KEEPALIVE_DURATION: 15 * 60 * 1000, // 30 minutes - auto-stop cycle to prevent resource leaks
  KEEPALIVE_INTERVAL: 25 * 1000 // 25 seconds - keep service worker alive during cycle
};

// Button styles
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

// Action names for chrome.runtime.sendMessage
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
  GET_TAB_STATUS: 'getMyTabStatus',
  CYCLE_ENDED: 'cycleEnded'
};

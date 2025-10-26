import { ACTIONS, TIMINGS } from '../shared/constants.js';
import { logInfo, logWarning } from '../shared/errorHandler.js';

/**
 * TimerManager - manages timers for restoring completed tasks
 * 
 * Responsible for:
 * - Global interval for updating timers every N seconds
 * - Checking tasks for restoration on schedule (UTC midnight)
 * - Debouncing restoration requests
 * - Cleanup of resources on close
 */
export class TimerManager {
  constructor(onRestoreCheck) {
    this._globalTimerInterval = null;
    this._midnightCheckTimeout = null;
    this._restoreCheckTimeout = null;
    
    // Callback function for restoration request
    this._onRestoreCheck = onRestoreCheck;
    
    // pageId -> { element, restoreAtMs }
    this._timerElements = {};
  }

  /**
   * Add timer element for tracking
   */
  addTimerElement(pageId, element, restoreAtMs) {
    this._timerElements[pageId] = { element, restoreAtMs };
  }

  /**
   * Remove timer element
   */
  removeTimerElement(pageId) {
    delete this._timerElements[pageId];
  }

  /**
   * Clear all timers
   */
  clearAllTimers() {
    const count = Object.keys(this._timerElements).length;
    this._timerElements = {};
    return count;
  }

  /**
   * Get count of active timers
   */
  getTimerCount() {
    return Object.keys(this._timerElements).length;
  }

  /**
   * Start global timer (updates all elements every N seconds)
   */
  startGlobalTimer() {
    // Prevent creation of duplicate timers
    if (this._globalTimerInterval) {
      clearInterval(this._globalTimerInterval);
      this._globalTimerInterval = null;
      logWarning('TimerManager', 'Cleared existing timer before starting new one');
    }

    // First, update all timers immediately
    this.updateAllTimers();

    // Then start the interval
    this._globalTimerInterval = setInterval(() => {
      this.updateAllTimers();
    }, TIMINGS.TIMER_INTERVAL);

    logInfo('TimerManager', `Global timer started (${this.getTimerCount()} active timers)`);
  }

  /**
   * Stop global timer
   */
  stopGlobalTimer() {
    if (this._globalTimerInterval) {
      clearInterval(this._globalTimerInterval);
      this._globalTimerInterval = null;
      logInfo('TimerManager', 'Global timer stopped');
    }
  }

  /**
   * Update all timers (called every N seconds)
   */
  updateAllTimers() {
    const nowMs = Date.now();
    let hasExpired = false;

    for (const [pageId, data] of Object.entries(this._timerElements)) {
      const { element, restoreAtMs } = data;
      const t = Math.max(0, restoreAtMs - nowMs);

      // Format time: HH:MM:SS
      const hours = Math.floor(t / 3600000);
      const minutes = Math.floor((t % 3600000) / 60000);
      const seconds = Math.floor((t % 60000) / 1000);

      element.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // If time is up, mark for restoration
      if (t <= 0) {
        delete this._timerElements[pageId];
        hasExpired = true;
      }
    }

    // If at least one timer expired, request restoration check (debounced)
    if (hasExpired) {
      this.requestRestoreCheck();
    }
  }

  /**
   * Request restoration check (debounced to avoid spam)
   */
  requestRestoreCheck() {
    if (this._restoreCheckTimeout) {
      clearTimeout(this._restoreCheckTimeout);
    }

    this._restoreCheckTimeout = setTimeout(() => {
      chrome.runtime.sendMessage({ action: ACTIONS.CHECK_RESTORE });
      this._restoreCheckTimeout = null;
    }, TIMINGS.DEBOUNCE_DELAY);
  }

  /**
   * Schedule task restoration check at UTC midnight
   */
  scheduleMidnightCheck() {
    // Clear previous timer if it existed
    if (this._midnightCheckTimeout) {
      clearTimeout(this._midnightCheckTimeout);
    }

    // Calculate time until next UTC midnight
    const now = new Date();
    const tomorrow = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    ));
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    // Schedule check at midnight
    this._midnightCheckTimeout = setTimeout(() => {
      this.requestRestoreCheck();
      // Schedule next check for the following midnight
      this.scheduleMidnightCheck();
    }, msUntilMidnight);

    logInfo('TimerManager', `Midnight check scheduled in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`);
  }

  /**
   * Clean up all timers and resources
   */
  cleanup() {
    logInfo('TimerManager', 'Starting cleanup...');

    // Stop global timer
    if (this._globalTimerInterval) {
      clearInterval(this._globalTimerInterval);
      this._globalTimerInterval = null;
      logInfo('TimerManager', 'Global timer cleared');
    }

    // Stop midnight check
    if (this._midnightCheckTimeout) {
      clearTimeout(this._midnightCheckTimeout);
      this._midnightCheckTimeout = null;
      logInfo('TimerManager', 'Midnight check timeout cleared');
    }

    // Stop restoration check debounce
    if (this._restoreCheckTimeout) {
      clearTimeout(this._restoreCheckTimeout);
      this._restoreCheckTimeout = null;
      logInfo('TimerManager', 'Restore check timeout cleared');
    }

    // Clear timer cache
    const timerCount = this.clearAllTimers();
    logInfo('TimerManager', `Cleared ${timerCount} timer elements`);

    logInfo('TimerManager', 'Cleanup completed successfully');
  }
}

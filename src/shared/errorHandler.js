// Centralized error handling system
// Allows easy switching between debug and production modes

import { DEBUG } from './constants.js';

// Variable for runtime switching of DEBUG mode
let runtimeDebug = DEBUG;

/**
 * Universal DEBUG mode switcher
 * debug() - toggle
 * debug(true/false) - set
 * debug('?') - show status
 */
export function debug(state) {
  if (state === '?') {
    console.log(`🔍 DEBUG mode is currently ${runtimeDebug ? 'ENABLED ✅' : 'DISABLED ❌'}`);
    console.log(`📌 Default from constants.js: ${DEBUG ? 'ENABLED' : 'DISABLED'}`);
    return runtimeDebug;
  }
  
  if (typeof state === 'boolean') {
    runtimeDebug = state;
  } else {
    runtimeDebug = !runtimeDebug;
  }
  
  console.log(`🔧 DEBUG mode ${runtimeDebug ? 'ENABLED ✅' : 'DISABLED ❌'}`);
  return runtimeDebug;
}

// Make only debug() available globally
if (typeof globalThis !== 'undefined') {
  globalThis.debug = debug; // The only global switcher
}

/**
 * Logs an error with context
 * @param {string} context - Context/location of the error (e.g., 'getActivePages')
 * @param {Error|string} error - Error object or message
 * @param {Object} additionalData - Additional debug data (optional)
 */
export function logError(context, error, additionalData = null) {
  if (runtimeDebug) {
    console.error(`[${context}]`, error);
    if (additionalData) {
      console.error('Additional data:', additionalData);
    }
  }
  
  // In the future, error reporting to Sentry/Google Analytics can be added here
  // if (ENABLE_REPORTING) {
  //   sendErrorToAnalytics(context, error, additionalData);
  // }
}

/**
 * Logs a warning with context
 * @param {string} context - Warning context
 * @param {string} message - Warning message
 */
export function logWarning(context, message) {
  if (runtimeDebug) {
    console.warn(`[${context}]`, message);
  }
}

/**
 * Logs an informational message (only in debug mode)
 * @param {string} context - Context
 * @param {string} message - Message
 */
export function logInfo(context, message) {
  if (runtimeDebug) {
    console.log(`[${context}]`, message);
  }
}

// Централизованная система обработки ошибок
// Позволяет легко переключаться между debug и production режимами

import { DEBUG } from './constants.js';

// Переменная для runtime переключения DEBUG режима
let runtimeDebug = DEBUG;

/**
 * Универсальный переключатель DEBUG режима
 * debug() - переключить
 * debug(true/false) - установить
 * debug('?') - показать статус
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

// Делаем только debug() доступной глобально
if (typeof globalThis !== 'undefined') {
  globalThis.debug = debug; // Единственный глобальный переключатель
}

/**
 * Логирует ошибку с контекстом
 * @param {string} context - Контекст/место возникновения ошибки (например, 'getActivePages')
 * @param {Error|string} error - Объект ошибки или сообщение
 * @param {Object} additionalData - Дополнительные данные для отладки (опционально)
 */
export function logError(context, error, additionalData = null) {
  if (runtimeDebug) {
    console.error(`[${context}]`, error);
    if (additionalData) {
      console.error('Additional data:', additionalData);
    }
  }
  
  // В будущем здесь можно добавить отправку в Sentry/Google Analytics
  // if (ENABLE_REPORTING) {
  //   sendErrorToAnalytics(context, error, additionalData);
  // }
}

/**
 * Логирует предупреждение с контекстом
 * @param {string} context - Контекст предупреждения
 * @param {string} message - Сообщение предупреждения
 */
export function logWarning(context, message) {
  if (runtimeDebug) {
    console.warn(`[${context}]`, message);
  }
}

/**
 * Логирует информационное сообщение (только в debug режиме)
 * @param {string} context - Контекст
 * @param {string} message - Сообщение
 */
export function logInfo(context, message) {
  if (runtimeDebug) {
    console.log(`[${context}]`, message);
  }
}

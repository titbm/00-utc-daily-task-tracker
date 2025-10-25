// Централизованная система обработки ошибок
// Позволяет легко переключаться между debug и production режимами

import { DEBUG } from './constants.js';

/**
 * Логирует ошибку с контекстом
 * @param {string} context - Контекст/место возникновения ошибки (например, 'getActivePages')
 * @param {Error|string} error - Объект ошибки или сообщение
 * @param {Object} additionalData - Дополнительные данные для отладки (опционально)
 */
export function logError(context, error, additionalData = null) {
  if (DEBUG) {
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
  if (DEBUG) {
    console.warn(`[${context}]`, message);
  }
}

/**
 * Логирует информационное сообщение (только в debug режиме)
 * @param {string} context - Контекст
 * @param {string} message - Сообщение
 */
export function logInfo(context, message) {
  if (DEBUG) {
    console.log(`[${context}]`, message);
  }
}

/**
 * Обёртка для async функций с автоматической обработкой ошибок
 * @param {string} context - Контекст операции
 * @param {Function} fn - Асинхронная функция
 * @param {*} defaultValue - Значение по умолчанию при ошибке
 * @returns {Promise<*>}
 */
export async function withErrorHandler(context, fn, defaultValue = null) {
  try {
    return await fn();
  } catch (error) {
    logError(context, error);
    return defaultValue;
  }
}

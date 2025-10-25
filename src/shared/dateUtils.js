// Утилиты для работы с датами и временем

/**
 * Проверяет, нужно ли восстанавливать midnight задачу
 * @param {string} completedAt - ISO timestamp когда задача была завершена
 * @returns {boolean}
 */
export function shouldRestoreMidnightTask(completedAt) {
  if (!completedAt) return false;
  
  const completed = new Date(completedAt);
  const now = new Date();
  
  // Получаем сегодняшнюю полночь UTC
  const todayMidnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  
  // Если задача завершена до сегодняшней полуночи - восстанавливаем
  return completed < todayMidnight;
}

/**
 * Проверяет, нужно ли восстанавливать interval задачу
 * @param {string} restoreAt - ISO timestamp когда нужно восстановить
 * @returns {boolean}
 */
export function shouldRestoreIntervalTask(restoreAt) {
  if (!restoreAt) return false;
  
  const restore = new Date(restoreAt);
  const now = new Date();
  
  return now >= restore;
}

/**
 * Форматирует оставшееся время до восстановления
 * @param {string} restoreAt - ISO timestamp
 * @returns {string} - "2h 30m" или "45m" или "Ready"
 */
export function formatCountdown(restoreAt) {
  if (!restoreAt) return '';
  
  const restore = new Date(restoreAt);
  const now = new Date();
  const diffMs = restore - now;
  
  if (diffMs <= 0) return 'Ready';
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

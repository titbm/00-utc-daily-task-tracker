// Утилиты для парсинга и создания заголовков закладок

/**
 * Парсит заголовок активной закладки
 * Формат: "Title [resetType]"
 */
export function parseActiveBookmarkTitle(title) {
  const match = title.match(/^(.+?)\s*\[(midnight|interval)\]$/);
  if (match) {
    return {
      title: match[1],
      resetType: match[2]
    };
  }
  return {
    title: title,
    resetType: 'midnight'
  };
}

/**
 * Парсит заголовок завершенной закладки
 * Формат: "Title [completedAt|restoreAt|resetType|resetInterval|addedAt]"
 */
export function parseCompletedBookmarkTitle(title) {
  const match = title.match(/^(.+?)\s*\[([^\]]+)\]$/);
  if (match) {
    const parts = match[2].split('|');
    return {
      title: match[1],
      completedAt: parts[0] || null,
      restoreAt: parts[1] || null,
      resetType: parts[2] || 'midnight',
      resetInterval: parts[3] ? parseInt(parts[3]) : null,
      addedAt: parts[4] || null
    };
  }
  return {
    title: title,
    completedAt: null,
    restoreAt: null,
    resetType: 'midnight',
    resetInterval: null,
    addedAt: null
  };
}

/**
 * Создает заголовок для завершенной закладки
 */
export function createCompletedBookmarkTitle(title, completedAt, restoreAt, resetType, resetInterval, addedAt) {
  const parts = [
    completedAt || '',
    restoreAt || '',
    resetType || 'midnight',
    resetInterval || '',
    addedAt || ''
  ];
  return `${title} [${parts.join('|')}]`;
}

/**
 * Получает URL фавиконки для домена
 */
export function getFaviconUrl(url) {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return '';
  }
}

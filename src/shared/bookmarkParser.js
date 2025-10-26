// Utilities for parsing and creating bookmark titles
import { RESET_TYPES } from './constants.js';

/**
 * Parses the title of an active bookmark
 * Format: "Title [resetType]"
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
    resetType: RESET_TYPES.MIDNIGHT
  };
}

/**
 * Parses the title of a completed bookmark
 * Format: "Title [completedAt|restoreAt|resetType|resetInterval|addedAt]"
 */
export function parseCompletedBookmarkTitle(title) {
  const match = title.match(/^(.+?)\s*\[([^\]]+)\]$/);
  if (match) {
    const parts = match[2].split('|');
    return {
      title: match[1],
      completedAt: parts[0] || null,
      restoreAt: parts[1] || null,
      resetType: parts[2] || RESET_TYPES.MIDNIGHT,
      resetInterval: parts[3] ? parseInt(parts[3]) : null,
      addedAt: parts[4] || null
    };
  }
  return {
    title: title,
    completedAt: null,
    restoreAt: null,
    resetType: RESET_TYPES.MIDNIGHT,
    resetInterval: null,
    addedAt: null
  };
}

/**
 * Creates a title for a completed bookmark
 */
export function createCompletedBookmarkTitle(title, completedAt, restoreAt, resetType, resetInterval, addedAt) {
  const parts = [
    completedAt || '',
    restoreAt || '',
    resetType || RESET_TYPES.MIDNIGHT,
    resetInterval || '',
    addedAt || ''
  ];
  return `${title} [${parts.join('|')}]`;
}

/**
 * Gets the favicon URL for a domain
 */
export function getFaviconUrl(url) {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return '';
  }
}

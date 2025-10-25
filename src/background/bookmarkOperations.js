// Модуль операций с закладками (CRUD)
import { getFolderIds } from './folderManager.js';
import { parseActiveBookmarkTitle, parseCompletedBookmarkTitle } from '../shared/bookmarkParser.js';
import { notifyPanelUpdate } from '../shared/notifications.js';

// Функция чтения активных страниц из закладок
export async function getActivePages() {
  try {
    const ids = await getFolderIds();
    if (!ids.active) return [];
    
    const bookmarks = await chrome.bookmarks.getChildren(ids.active);
    const pages = [];
    
    for (const bookmark of bookmarks) {
      if (bookmark.url) {
        const parsed = parseActiveBookmarkTitle(bookmark.title);
        pages.push({
          id: bookmark.id,
          title: parsed.title,
          url: bookmark.url,
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=32`,
          addedAt: bookmark.dateAdded ? new Date(bookmark.dateAdded).toISOString() : new Date().toISOString(),
          resetType: parsed.resetType,
          resetInterval: 24
        });
      }
    }
    
    return pages;
  } catch (error) {
    console.error('Error getting active pages:', error);
    return [];
  }
}

// Функция чтения отработанных страниц из закладок
export async function getCompletedPages() {
  try {
    const ids = await getFolderIds();
    if (!ids.completed) return [];
    
    const bookmarks = await chrome.bookmarks.getChildren(ids.completed);
    const pages = [];
    
    for (const bookmark of bookmarks) {
      if (bookmark.url) {
        const parsed = parseCompletedBookmarkTitle(bookmark.title);
        pages.push({
          id: bookmark.id,
          title: parsed.title,
          url: bookmark.url,
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=32`,
          addedAt: parsed.addedAt,
          completedAt: parsed.completedAt,
          restoreAt: parsed.restoreAt,
          resetType: parsed.resetType,
          resetInterval: parsed.resetInterval
        });
      }
    }
    
    return pages;
  } catch (error) {
    console.error('Error getting completed pages:', error);
    return [];
  }
}

// Функция добавления страницы в Active
export async function addPageToActive(tab) {
  try {
    const ids = await getFolderIds();
    if (!ids.active) {
      console.error('Active folder not found');
      return;
    }
    
    const activePages = await getActivePages();
    const existsInActive = activePages.some(p => p.url === tab.url);
    if (existsInActive) return { exists: true, location: 'active' };
    
    const completedPages = await getCompletedPages();
    const existsInCompleted = completedPages.some(p => p.url === tab.url);
    if (existsInCompleted) return { exists: true, location: 'completed' };
    
    const titleWithMetadata = `${tab.title} [midnight]`;
    
    await chrome.bookmarks.create({
      parentId: ids.active,
      title: titleWithMetadata,
      url: tab.url
    });
    
    notifyPanelUpdate();
    return { exists: false, added: true };
  } catch (error) {
    console.error('Error adding page to Active:', error);
    return { exists: false, added: false, error: error.message };
  }
}

// Функция удаления страницы по ID закладки
export async function removePage(bookmarkId) {
  try {
    await chrome.bookmarks.remove(bookmarkId);
    notifyPanelUpdate();
  } catch (error) {
    console.error('Error removing bookmark:', error);
  }
}

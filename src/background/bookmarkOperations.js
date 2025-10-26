// Bookmarks operations module (CRUD)
import { getFolderIds } from './folderManager.js';
import { parseActiveBookmarkTitle, parseCompletedBookmarkTitle, getFaviconUrl } from '../shared/bookmarkParser.js';
import { notifyPanelUpdate } from '../shared/notifications.js';
import { logError, logInfo } from '../shared/errorHandler.js';

// Function to read active pages from bookmarks
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
          favicon: getFaviconUrl(bookmark.url),
          addedAt: bookmark.dateAdded ? new Date(bookmark.dateAdded).toISOString() : new Date().toISOString(),
          resetType: parsed.resetType,
          resetInterval: 24
        });
      }
    }
    
    return pages;
  } catch (error) {
    logError('getActivePages', error);
    return [];
  }
}

// Function to read completed pages from bookmarks
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
          favicon: getFaviconUrl(bookmark.url),
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
    logError('getCompletedPages', error);
    return [];
  }
}

// Function to add a page to Active
export async function addPageToActive(tab) {
  try {
    const ids = await getFolderIds();
    if (!ids.active) {
      logError('addPageToActive', 'Active folder not found');
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
    
    logInfo('addPageToActive', `Added: ${tab.title}`);
    notifyPanelUpdate();
    return { exists: false, added: true };
  } catch (error) {
    logError('addPageToActive', error);
    return { exists: false, added: false, error: error.message };
  }
}

// Function to remove a page by bookmark ID
export async function removePage(bookmarkId) {
  try {
    await chrome.bookmarks.remove(bookmarkId);
    logInfo('removePage', `Removed bookmark: ${bookmarkId}`);
    notifyPanelUpdate();
  } catch (error) {
    logError('removePage', error);
  }
}

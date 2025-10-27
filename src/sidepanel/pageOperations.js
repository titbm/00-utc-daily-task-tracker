import { ACTIONS, RESET_TYPES } from '../shared/constants.js';
import { logInfo } from '../shared/errorHandler.js';

/**
 * PageOperations - manages page-related operations
 * 
 * Responsible for:
 * - Opening individual pages
 * - Restoring completed pages
 * - Removing pages
 * - Managing task cycles
 * - Toggling reset types
 */
export class PageOperations {
  constructor(uiState, onPagesChanged = null) {
    this.uiState = uiState;
    this.onPagesChanged = onPagesChanged; // Callback to refresh UI after operations
  }

  /**
   * Shorten URL for display
   */
  shortenUrl(url) {
    try {
      const urlObj = new URL(url);
      let shortened = urlObj.hostname;
      if (urlObj.pathname !== '/') {
        shortened += urlObj.pathname;
      }
      if (shortened.length > 50) {
        shortened = shortened.substring(0, 47) + '...';
      }
      return shortened;
    } catch {
      return url.length > 50 ? url.substring(0, 47) + '...' : url;
    }
  }

  /**
   * Open single page without cycle
   */
  async openPage(url, bookmarkId) {
    try {
      await chrome.runtime.sendMessage({
        action: ACTIONS.OPEN_SINGLE_PAGE,
        url: url,
        bookmarkId: bookmarkId
      });
    } catch (error) {
      console.error('Error opening page:', error);
    }
  }

  /**
   * Restore single completed page to active
   */
  async restoreCompletedPage(bookmarkId) {
    try {
      await chrome.runtime.sendMessage({
        action: ACTIONS.RESTORE_PAGE,
        bookmarkId: bookmarkId
      });

      // Check if anything remains in completed
      const completedResponse = await chrome.runtime.sendMessage({ action: ACTIONS.GET_COMPLETED_PAGES });
      const completedPages = completedResponse.pages || [];

      // Switch to active section only if it was the last completed
      if (this.uiState.getCurrentSection() === 'completed' && completedPages.length === 0) {
        this.uiState.toggleSection();
      }
    } catch (error) {
      console.error('Error restoring page:', error);
    }
  }

  /**
   * Remove page from active list
   */
  async removePage(bookmarkId) {
    try {
      await chrome.runtime.sendMessage({
        action: ACTIONS.REMOVE_PAGE,
        bookmarkId: bookmarkId
      });
    } catch (error) {
      console.error('Error removing page:', error);
    }
  }

  /**
   * Restore all completed pages to active
   */
  async restoreAllCompleted() {
    try {
      const completedResponse = await chrome.runtime.sendMessage({ action: ACTIONS.GET_COMPLETED_PAGES });
      const completedPages = completedResponse.pages || [];

      if (completedPages.length === 0) {
        return;
      }

      // Restore all pages
      for (const page of completedPages) {
        await chrome.runtime.sendMessage({
          action: ACTIONS.RESTORE_PAGE,
          bookmarkId: page.id
        });
      }

      // Switch to active section
      if (this.uiState.getCurrentSection() === 'completed') {
        this.uiState.toggleSection();
      }
    } catch (error) {
      console.error('Error restoring all completed:', error);
    }
  }

  /**
   * Start processing all active tasks
   */
  async startAllTasks() {
    try {
      // Start processing all tasks via background
      await chrome.runtime.sendMessage({ action: ACTIONS.OPEN_NEXT_PAGE });
    } catch (error) {
      console.error('Error starting all tasks:', error);
    }
  }

  /**
   * Toggle reset type between midnight and interval
   */
  async toggleResetType(page, iconElement) {
    const currentType = page.resetType || RESET_TYPES.MIDNIGHT;
    const newType = currentType === RESET_TYPES.MIDNIGHT ? RESET_TYPES.INTERVAL : RESET_TYPES.MIDNIGHT;

    // Update icon
    iconElement.textContent = newType === RESET_TYPES.MIDNIGHT ? 'bedtime' : 'schedule';
    const button = iconElement.parentElement;
    button.title = newType === RESET_TYPES.MIDNIGHT ? 'At midnight (click to change)' : 'After interval (click to change)';

    // Update locally in object
    page.resetType = newType;

    // Send to background for saving
    try {
      await chrome.runtime.sendMessage({
        action: ACTIONS.SET_RESET_TYPE,
        bookmarkId: page.id,
        resetType: newType,
        resetInterval: page.resetInterval || 24
      });
    } catch (error) {
      console.error('Error setting reset type:', error);
    }
  }

  /**
   * Reorder pages via drag-and-drop
   */
  async reorderPages(draggedElement, targetElement) {
    const draggedId = draggedElement.dataset.pageId;
    const targetId = targetElement.dataset.pageId;

    if (draggedId === targetId) return;

    try {
      logInfo('pageOperations:reorderPages', `Moving ${draggedId} to position of ${targetId}`);
      // Get current list of active pages
      const response = await chrome.runtime.sendMessage({ action: ACTIONS.GET_ACTIVE_PAGES });
      const pages = response.pages || [];

      // Find indexes
      const draggedIndex = pages.findIndex(p => p.id === draggedId);
      const targetIndex = pages.findIndex(p => p.id === targetId);

      if (draggedIndex === -1 || targetIndex === -1) {
        logInfo('pageOperations:reorderPages', `Page not found - draggedIndex: ${draggedIndex}, targetIndex: ${targetIndex}`);
        return;
      }

      // Move bookmark in Chrome Bookmarks
      const targetPage = pages[targetIndex];

      // Get parent folder
      const draggedBookmark = await chrome.bookmarks.get(draggedId);
      const parentId = draggedBookmark[0].parentId;

      // Move bookmark
      await chrome.bookmarks.move(draggedId, {
        parentId: parentId,
        index: targetIndex
      });

      logInfo('pageOperations:reorderPages', `Success! New order: ${draggedIndex} → ${targetIndex}`);
      // Reload pages via background check
      await chrome.runtime.sendMessage({ action: ACTIONS.CHECK_RESTORE });
      
      // Refresh UI after reordering
      if (this.onPagesChanged) {
        await this.onPagesChanged();
      }
    } catch (error) {
      logInfo('pageOperations:reorderPages', `Error: ${error.message}`);
    }
  }
}

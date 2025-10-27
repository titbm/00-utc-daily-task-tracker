// Page rendering for sidepanel
import { RESET_TYPES } from '../shared/constants.js';

/**
 * PageRenderer - manages DOM creation and rendering of page elements
 * 
 * Responsible for:
 * - Creating page item DOM elements
 * - Handling page info (title, URL, favicon)
 * - Building action buttons (active/completed states)
 * - Managing timer indicators for interval tasks
 */
export class PageRenderer {
  constructor(eventManager, pageOperations, timerScheduler) {
    this.eventManager = eventManager;
    this.pageOperations = pageOperations;
    this.timerScheduler = timerScheduler;
  }

  /**
   * Create a single page element DOM
   */
  createPageElement(page, index, isCompleted = false) {
    const div = document.createElement('div');
    div.className = 'page-item';
    div.dataset.pageId = page.id;
    div.dataset.index = index;

    // Add drag & drop only for active tasks
    if (!isCompleted) {
      div.draggable = true;
      console.log(`[pageRenderer:createPageElement] Setting up drag handlers for: ${page.id}`);
      this.eventManager.setupDragHandlers(div);
    }

    const favicon = document.createElement('img');
    favicon.src = page.favicon;
    favicon.className = 'page-favicon';
    favicon.alt = '';
    favicon.onerror = function() {
      this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23ddd"/></svg>';
    };

    const info = document.createElement('div');
    info.className = 'page-info';

    const title = document.createElement('div');
    title.className = 'page-title';
    title.textContent = page.title;
    title.title = page.title;

    const url = document.createElement('div');
    url.className = 'page-url';
    url.textContent = this.pageOperations.shortenUrl(page.url);
    url.title = page.url;

    info.appendChild(title);
    info.appendChild(url);

    div.appendChild(favicon);
    div.appendChild(info);

    // Container for action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'page-actions';

    if (!isCompleted) {
      this._buildActivePageActions(actionsDiv, page);
    } else {
      this._buildCompletedPageActions(actionsDiv, page);
    }

    div.appendChild(actionsDiv);

    // Handler for clicking on page
    div.addEventListener('click', (e) => {
      if (!e.target.closest('.page-actions')) {
        if (isCompleted) {
          this.pageOperations.restoreCompletedPage(page.id);
        } else {
          this.pageOperations.openPage(page.url, page.id);
        }
      }
    });

    return div;
  }

  /**
   * Build action buttons for active pages (reset type + delete)
   */
  _buildActivePageActions(actionsDiv, page) {
    // Reset type button
    const resetTypeBtn = document.createElement('button');
    resetTypeBtn.className = 'action-icon-btn reset-type-btn';
    const resetType = page.resetType || RESET_TYPES.MIDNIGHT;
    resetTypeBtn.title = resetType === RESET_TYPES.MIDNIGHT ? 'At midnight (click to change)' : 'After interval (click to change)';

    const resetIcon = document.createElement('span');
    resetIcon.className = 'material-symbols-outlined';
    resetIcon.textContent = resetType === RESET_TYPES.MIDNIGHT ? 'bedtime' : 'schedule';
    resetTypeBtn.appendChild(resetIcon);

    // Delete button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'action-icon-btn delete-btn';
    removeBtn.title = 'Delete';

    const deleteIcon = document.createElement('span');
    deleteIcon.className = 'material-symbols-outlined';
    deleteIcon.textContent = 'delete';
    removeBtn.appendChild(deleteIcon);

    actionsDiv.appendChild(resetTypeBtn);
    actionsDiv.appendChild(removeBtn);

    // Handler for switching type
    resetTypeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pageOperations.toggleResetType(page, resetIcon);
    });

    // Handler for deleting page
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pageOperations.removePage(page.id);
    });
  }

  /**
   * Build action buttons for completed pages (indicator + restore)
   */
  _buildCompletedPageActions(actionsDiv, page) {
    const resetType = page.resetType || RESET_TYPES.MIDNIGHT;

    // Wrapper container for indicator and button
    const switchContainer = document.createElement('div');
    switchContainer.className = 'switch-container';

    // Container for indicator (moon or timer)
    const indicator = document.createElement('div');
    indicator.className = 'completed-indicator';

    if (resetType === RESET_TYPES.MIDNIGHT) {
      this._buildMidnightIndicator(indicator);
    } else {
      this._buildTimerIndicator(indicator, page);
    }

    // Restore button
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'action-icon-btn restore-btn';
    restoreBtn.title = 'Return to active';

    const restoreIcon = document.createElement('span');
    restoreIcon.className = 'material-symbols-outlined';
    restoreIcon.textContent = 'refresh';
    restoreBtn.appendChild(restoreIcon);

    switchContainer.appendChild(indicator);
    switchContainer.appendChild(restoreBtn);
    actionsDiv.appendChild(switchContainer);

    restoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pageOperations.restoreCompletedPage(page.id);
    });
  }

  /**
   * Build midnight indicator (moon icon)
   */
  _buildMidnightIndicator(indicator) {
    const moonBtn = document.createElement('button');
    moonBtn.className = 'action-icon-btn indicator-btn';
    moonBtn.disabled = true;
    moonBtn.title = 'Returns at midnight (00:00 UTC)';

    const moonIcon = document.createElement('span');
    moonIcon.className = 'material-symbols-outlined';
    moonIcon.textContent = 'bedtime';
    moonBtn.appendChild(moonIcon);

    indicator.appendChild(moonBtn);
  }

  /**
   * Build timer indicator (countdown badge)
   */
  _buildTimerIndicator(indicator, page) {
    const timerBadge = document.createElement('div');
    timerBadge.className = 'countdown-badge';
    timerBadge.textContent = '--:--:--';
    timerBadge.title = 'Time until restore';

    // Calculate next restore time
    let restoreAtMs = null;
    if (page.restoreAt) {
      restoreAtMs = Date.parse(page.restoreAt);
    } else if (page.completedAt && page.resetInterval) {
      const completedMs = Date.parse(page.completedAt);
      if (!isNaN(completedMs)) {
        restoreAtMs = completedMs + Math.round((page.resetInterval || 0) * 3600 * 1000);
      }
    }

    // Save element and restore time for global timer
    if (restoreAtMs) {
      this.timerScheduler.addTimerElement(page.id, timerBadge, restoreAtMs);
    }

    indicator.appendChild(timerBadge);
  }
}

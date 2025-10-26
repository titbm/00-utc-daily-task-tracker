// Import constants
import { ACTIONS, RESET_TYPES, TIMINGS, BUTTON_STATES } from '../shared/constants.js';
import { logInfo, logWarning } from '../shared/errorHandler.js';
import { TimerScheduler } from './timerScheduler.js';
import { UIState } from './uiState.js';
import { PageOperations } from './pageOperations.js';

class DailyPanel {
  constructor() {
  // Sections
    this.activeSection = document.getElementById('activeSection');
    this.completedSection = document.getElementById('completedSection');
    
  // Page lists
    this.activePagesList = document.getElementById('activePagesList');
    this.completedPagesList = document.getElementById('completedPagesList');
    
  // Empty states
    this.emptyStateActive = document.getElementById('emptyStateActive');
    this.emptyStateCompleted = document.getElementById('emptyStateCompleted');
    
  // Tabs
    this.activeTab = document.getElementById('activeTab');
    this.completedTab = document.getElementById('completedTab');
    
  // Buttons and controls
    this.restoreCompletedBtn = document.getElementById('restoreAllCompleted');
    this.startTasksBtn = document.getElementById('startAllTasks');
    
  // Counters
    this.activeCount = document.getElementById('activeCount');
    this.completedCount = document.getElementById('completedCount');
    
  // Timer Manager for handling countdown timers
  this.timerScheduler = new TimerScheduler(() => {
    chrome.runtime.sendMessage({ action: ACTIONS.CHECK_RESTORE });
  });

  // UI Manager for handling UI state
  this.uiState = new UIState({
    activeSection: this.activeSection,
    completedSection: this.completedSection,
    activeTab: this.activeTab,
    completedTab: this.completedTab,
    startTasksBtn: this.startTasksBtn,
    restoreCompletedBtn: this.restoreCompletedBtn,
    activeCount: this.activeCount,
    completedCount: this.completedCount
  });

  // Page Operations for managing pages
  this.pageOperations = new PageOperations(this.uiState);
    
  // Cache for render optimization
    this._cachedActivePages = null;
    this._cachedCompletedPages = null;

    this.init();
    this.setupCleanup();
  }
  
  // Cleanup resources when closing the panel
  setupCleanup() {
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
  }
  
  cleanup() {
    logInfo('sidepanel:cleanup', 'Starting cleanup...');
    
  // Clean up timer scheduler
    if (this.timerScheduler) {
      this.timerScheduler.cleanup();
    }
    
  // Close the connection to the background script
    if (this.port) {
      this.port.disconnect();
      this.port = null;
      logInfo('sidepanel:cleanup', 'Port connection closed');
    }
    
    logInfo('sidepanel:cleanup', 'Cleanup completed successfully');
  }
  
  init() {
    this.loadPages();
    this.setupEventListeners();
    this.uiState.initTabHighlighter();
    
  // Schedule midnight task check at UTC midnight
    this.timerScheduler.scheduleMidnightCheck();
    
  // Start the global timer immediately when the panel opens
    if (this.timerScheduler.getTimerCount() > 0) {
      this.timerScheduler.startGlobalTimer();
    }
    
  // Connect to background for fast checks
    this.port = chrome.runtime.connect({ name: 'sidepanel' });
    
  // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === ACTIONS.PAGES_UPDATED) {
  // Check the openOnCompleted flag (for already opened panel)
        chrome.storage.session.get('openOnCompleted', async ({ openOnCompleted }) => {
          await this.loadPages();
          
          if (openOnCompleted) {
            if (this.uiState.getCurrentSection() === 'active') {
              this.uiState.toggleSection();
            }
            chrome.storage.session.remove('openOnCompleted');
          }
        });
      } else if (message.action === ACTIONS.CLOSE_SIDE_PANEL) {
  // Close the side panel
        window.close();
      }
    });
  }
  
  setupEventListeners() {
  // Tabs for switching sections
    if (this.activeTab) {
      this.activeTab.addEventListener('click', () => {
        if (this.uiState.getCurrentSection() !== 'active') {
          this.uiState.toggleSection();
        }
      });
    }
    
    if (this.completedTab) {
      this.completedTab.addEventListener('click', () => {
        if (this.uiState.getCurrentSection() !== 'completed') {
          this.uiState.toggleSection();
        }
      });
    }
    
    if (this.restoreCompletedBtn) {
      this.restoreCompletedBtn.addEventListener('click', () => {
        if (!this.restoreCompletedBtn.disabled) {
          this.pageOperations.restoreAllCompleted();
        }
      });
    }
    
  // "Start All Tasks" button
    if (this.startTasksBtn) {
      this.startTasksBtn.addEventListener('click', () => {
        if (!this.startTasksBtn.disabled) {
          this.pageOperations.startAllTasks();
        }
      });
    }
    
  // Link "Go to Completed section"
    const goToCompletedLink = document.getElementById('goToCompleted');
    if (goToCompletedLink) {
      goToCompletedLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.uiState.getCurrentSection() === 'active') {
          this.uiState.toggleSection();
        }
      });
    }
    
  // Link "Go to Active section"
    const goToActiveLink = document.getElementById('goToActive');
    if (goToActiveLink) {
      goToActiveLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.uiState.getCurrentSection() === 'completed') {
          this.uiState.toggleSection();
        }
      });
    }
    
  // Clicks on counters to switch sections
    this.activeCount.addEventListener('click', () => {
      if (this.uiState.getCurrentSection() !== 'active') {
        this.uiState.toggleSection();
      }
    });
    
    this.completedCount.addEventListener('click', () => {
      if (this.uiState.getCurrentSection() !== 'completed') {
        this.uiState.toggleSection();
      }
    });
  }
  
  async loadPages() {
    try {
  // Request data from background
      const activeResponse = await chrome.runtime.sendMessage({ action: ACTIONS.GET_ACTIVE_PAGES });
      const completedResponse = await chrome.runtime.sendMessage({ action: ACTIONS.GET_COMPLETED_PAGES });
      
      const activePages = activeResponse.pages || [];
      const completedPages = completedResponse.pages || [];
      
  // Check if data has changed
      const activePagesChanged = !this._arePagesEqual(this._cachedActivePages, activePages);
      const completedPagesChanged = !this._arePagesEqual(this._cachedCompletedPages, completedPages);
      
  // Render only if there are changes
      if (activePagesChanged) {
        this.renderPages(activePages, this.activePagesList, this.emptyStateActive);
        this._cachedActivePages = structuredClone(activePages);
      }
      
      if (completedPagesChanged) {
        this.renderPages(completedPages, this.completedPagesList, this.emptyStateCompleted, true);
        this._cachedCompletedPages = structuredClone(completedPages);
        
  // Start timer if there are completed tasks and it's not running yet
        if (this.timerScheduler.getTimerCount() > 0 && !this._globalTimerInterval) {
          this.timerScheduler.startGlobalTimer();
        }
      }
      
  // Update counters and buttons only if something changed
      if (activePagesChanged || completedPagesChanged) {
        this.uiState.updateCounters(activePages.length, completedPages.length);
      }
      
  // Manage button states
      this.uiState.setButtonState(this.startTasksBtn, activePages.length > 0);
      this.uiState.setButtonState(this.restoreCompletedBtn, completedPages.length > 0);
    } catch (error) {
      console.error('Error loading pages:', error);
    }
  }
  
  _arePagesEqual(pages1, pages2) {
    if (!pages1 || !pages2) return false;
    if (pages1.length !== pages2.length) return false;
    
  // Compare JSON representation for simplicity
    return JSON.stringify(pages1) === JSON.stringify(pages2);
  }
  
  // Utility for managing button state
  
  renderPages(pages, listElement, emptyStateElement, isCompleted = false) {
  // Stop global timer if it was running and rendering completed pages
    if (isCompleted) {
      this.timerScheduler.stopGlobalTimer();
      this.timerScheduler.clearAllTimers();
    }

    listElement.innerHTML = '';
    
    if (pages.length === 0) {
      emptyStateElement.classList.remove('hidden');
      return;
    }
    
    emptyStateElement.classList.add('hidden');
    
    pages.forEach((page, index) => {
      const pageElement = this.createPageElement(page, index, isCompleted);
      listElement.appendChild(pageElement);
    });
  }
  
  createPageElement(page, index, isCompleted = false) {
    const div = document.createElement('div');
    div.className = 'page-item';
    div.dataset.pageId = page.id;
    div.dataset.index = index;
    
  // Add drag & drop only for active tasks
    if (!isCompleted) {
      div.draggable = true;
      this.setupDragHandlers(div);
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
    
  // For active tabs - reset type and delete buttons
    if (!isCompleted) {
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
    } else {
  // For completed tabs - indicator and restore button in one place
      const resetType = page.resetType || RESET_TYPES.MIDNIGHT;
      
  // Wrapper container for indicator and button (they will be in one place)
      const switchContainer = document.createElement('div');
      switchContainer.className = 'switch-container';
      
  // Container for indicator (moon or timer)
      const indicator = document.createElement('div');
      indicator.className = 'completed-indicator';
      
      if (resetType === RESET_TYPES.MIDNIGHT) {
  // Moon icon
        const moonBtn = document.createElement('button');
        moonBtn.className = 'action-icon-btn indicator-btn';
        moonBtn.disabled = true;
        moonBtn.title = 'Returns at midnight (00:00 UTC)';
        
        const moonIcon = document.createElement('span');
        moonIcon.className = 'material-symbols-outlined';
        moonIcon.textContent = 'bedtime';
        moonBtn.appendChild(moonIcon);
        
        indicator.appendChild(moonBtn);
      } else {
  // Countdown timer
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
      
  // Restore button (shown on hover instead of indicator)
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
  
  setupDragHandlers(element) {
    let draggedElement = null;
    
    element.addEventListener('dragstart', (e) => {
      draggedElement = element;
      element.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', element.innerHTML);
    });
    
    element.addEventListener('dragend', (e) => {
      element.classList.remove('dragging');
  // Remove all drag-over indicators
      document.querySelectorAll('.page-item.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
    });
    
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const dragging = document.querySelector('.dragging');
      if (dragging && dragging !== element) {
        element.classList.add('drag-over');
      }
    });
    
    element.addEventListener('dragleave', (e) => {
      element.classList.remove('drag-over');
    });
    
    element.addEventListener('drop', async (e) => {
      e.preventDefault();
      element.classList.remove('drag-over');
      
      const dragging = document.querySelector('.dragging');
      if (dragging && dragging !== element) {
        await this.reorderPages(dragging, element);
      }
    });
  }
  
  async reorderPages(draggedElement, targetElement) {
    const draggedId = draggedElement.dataset.pageId;
    const targetId = targetElement.dataset.pageId;
    
    if (draggedId === targetId) return;
    
    try {
  // Get current list of active pages
      const response = await chrome.runtime.sendMessage({ action: ACTIONS.GET_ACTIVE_PAGES });
      const pages = response.pages || [];
      
  // Find indexes
      const draggedIndex = pages.findIndex(p => p.id === draggedId);
      const targetIndex = pages.findIndex(p => p.id === targetId);
      
      if (draggedIndex === -1 || targetIndex === -1) return;
      
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
      
  // Update UI
      this.loadPages();
      
    } catch (error) {
      console.error('Error reordering pages:', error);
    }
  }
}

// Initialize panel on load
document.addEventListener('DOMContentLoaded', () => {
  new DailyPanel();
});

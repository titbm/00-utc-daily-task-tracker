// Import constants
import { ACTIONS, RESET_TYPES, TIMINGS, BUTTON_STATES } from '../shared/constants.js';
import { logInfo, logWarning } from '../shared/errorHandler.js';
import { TimerScheduler } from './timerScheduler.js';
import { UIState } from './uiState.js';
import { PageOperations } from './pageOperations.js';
import { EventManager } from './eventManager.js';
import { PageRenderer } from './pageRenderer.js';

class TaskSidepanel {
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

  // Event Manager for handling user interactions
  this.eventManager = new EventManager({
    activeTab: this.activeTab,
    completedTab: this.completedTab,
    restoreCompletedBtn: this.restoreCompletedBtn,
    startTasksBtn: this.startTasksBtn,
    activeCount: this.activeCount,
    completedCount: this.completedCount
  }, this.uiState, this.pageOperations, this.timerScheduler);

  // Page Renderer for creating page elements
  this.pageRenderer = new PageRenderer(this.eventManager, this.pageOperations, this.timerScheduler);
    
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
    this.eventManager.setupEventListeners();
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
      const pageElement = this.pageRenderer.createPageElement(page, index, isCompleted);
      listElement.appendChild(pageElement);
    });
  }
}

// Initialize panel on load
document.addEventListener('DOMContentLoaded', () => {
  new TaskSidepanel();
});

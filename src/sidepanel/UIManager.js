import { BUTTON_STATES, TIMINGS } from '../shared/constants.js';

/**
 * UIManager - manages UI state and interactions
 * 
 * Responsible for:
 * - Toggling between Active and Completed sections
 * - Managing tab highlighting with RoughNotation
 * - Button state management
 * - Counter updates
 */
export class UIManager {
  constructor(uiElements) {
    // DOM elements
    this.activeSection = uiElements.activeSection;
    this.completedSection = uiElements.completedSection;
    this.activeTab = uiElements.activeTab;
    this.completedTab = uiElements.completedTab;
    this.startTasksBtn = uiElements.startTasksBtn;
    this.restoreCompletedBtn = uiElements.restoreCompletedBtn;
    this.activeCount = uiElements.activeCount;
    this.completedCount = uiElements.completedCount;

    // Current active section state
    this.currentSection = 'active'; // 'active' or 'completed'

    // RoughNotation annotations
    this.activeTabAnnotation = null;
    this.completedTabAnnotation = null;
  }

  /**
   * Initialize tab highlighter with RoughNotation
   */
  initTabHighlighter() {
    const tryInit = () => {
      if (window.RoughNotation) {
        if (!this.activeTab || !this.completedTab) {
          console.error('Tab elements not found!');
          return;
        }

        this.activeTabAnnotation = window.RoughNotation.annotate(this.activeTab, {
          type: 'underline',
          color: '#FFC107',
          strokeWidth: 2,
          padding: 2,
          iterations: 2,
          animationDuration: 600
        });

        this.completedTabAnnotation = window.RoughNotation.annotate(this.completedTab, {
          type: 'underline',
          color: '#FFC107',
          strokeWidth: 2,
          padding: 2,
          iterations: 2,
          animationDuration: 600
        });

        // Show underline for active tab
        this.activeTabAnnotation.show();
      } else {
        // If the library is not loaded yet, try again later
        setTimeout(tryInit, TIMINGS.ROUGH_NOTATION_RETRY);
      }
    };

    tryInit();
  }

  /**
   * Update tab underline highlighting
   */
  updateTabHighlighter() {
    if (this.activeTabAnnotation && this.completedTabAnnotation) {
      if (this.currentSection === 'active') {
        this.completedTabAnnotation.hide();
        this.activeTabAnnotation.show();
      } else {
        this.activeTabAnnotation.hide();
        this.completedTabAnnotation.show();
      }
    }
  }

  /**
   * Toggle between Active and Completed sections
   */
  toggleSection() {
    if (this.currentSection === 'active') {
      this.currentSection = 'completed';
      this.activeSection.classList.remove('active');
      this.completedSection.classList.add('active');

      // Update tabs
      if (this.activeTab) this.activeTab.classList.remove('active');
      if (this.completedTab) this.completedTab.classList.add('active');

      // Show Reset button, hide Start button in header
      if (this.startTasksBtn) this.startTasksBtn.style.display = 'none';
      if (this.restoreCompletedBtn) this.restoreCompletedBtn.style.display = 'flex';
    } else {
      this.currentSection = 'active';
      this.completedSection.classList.remove('active');
      this.activeSection.classList.add('active');

      // Update tabs
      if (this.completedTab) this.completedTab.classList.remove('active');
      if (this.activeTab) this.activeTab.classList.add('active');

      // Show Start button, hide Reset button in header
      if (this.startTasksBtn) this.startTasksBtn.style.display = 'flex';
      if (this.restoreCompletedBtn) this.restoreCompletedBtn.style.display = 'none';
    }

    // Update underline
    this.updateTabHighlighter();
  }

  /**
   * Set button state (enabled/disabled)
   */
  setButtonState(button, enabled) {
    if (!button) return;

    button.disabled = !enabled;
    const state = enabled ? BUTTON_STATES.ENABLED : BUTTON_STATES.DISABLED;
    button.style.opacity = state.opacity;
    button.style.cursor = state.cursor;
  }

  /**
   * Update activity counters
   */
  updateCounters(activeCount, completedCount) {
    this.activeCount.textContent = `Active: ${activeCount}`;
    this.completedCount.textContent = `Completed: ${completedCount}`;
  }

  /**
   * Get current section state
   */
  getCurrentSection() {
    return this.currentSection;
  }
}

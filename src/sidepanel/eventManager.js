// Event handling for sidepanel interactions
export class EventManager {
  constructor(uiElements, uiState, pageOperations, timerScheduler) {
    this.activeTab = uiElements.activeTab;
    this.completedTab = uiElements.completedTab;
    this.restoreCompletedBtn = uiElements.restoreCompletedBtn;
    this.startTasksBtn = uiElements.startTasksBtn;
    this.activeCount = uiElements.activeCount;
    this.completedCount = uiElements.completedCount;
    
    this.uiState = uiState;
    this.pageOperations = pageOperations;
    this.timerScheduler = timerScheduler;
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

  setupDragHandlers(element) {
    let draggedElement = null;
    
    element.addEventListener('dragstart', (e) => {
      draggedElement = element;
      element.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', element.innerHTML);
      console.log(`[eventManager:dragstart] Started dragging: ${element.dataset.pageId}`);
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
        console.log(`[eventManager:dragover] Dragging over: ${element.dataset.pageId}`);
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
        console.log(`[eventManager:drop] Dropped: ${dragging.dataset.pageId} → ${element.dataset.pageId}`);
        await this.pageOperations.reorderPages(dragging, element);
      }
    });
  }
}

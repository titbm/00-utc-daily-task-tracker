class DailyPanel {
  constructor() {
    // Секции
    this.activeSection = document.getElementById('activeSection');
    this.completedSection = document.getElementById('completedSection');
    
    // Списки страниц
    this.activePagesList = document.getElementById('activePagesList');
    this.completedPagesList = document.getElementById('completedPagesList');
    
    // Пустые состояния
    this.emptyStateActive = document.getElementById('emptyStateActive');
    this.emptyStateCompleted = document.getElementById('emptyStateCompleted');
    
    // Табы
    this.activeTab = document.getElementById('activeTab');
    this.completedTab = document.getElementById('completedTab');
    
    // Кнопки и элементы управления
    this.restoreCompletedBtn = document.getElementById('restoreAllCompleted');
    this.startTasksBtn = document.getElementById('startAllTasks');
    
    // Счетчики
    this.activeCount = document.getElementById('activeCount');
    this.completedCount = document.getElementById('completedCount');
    
    // Текущая активная секция
    this.currentSection = 'active'; // 'active' или 'completed'
    
    // Словарь таймеров для отработанных элементов (по id)
    this._completedTimers = {};
    
    // Кеш для оптимизации перерисовки
    this._cachedActivePages = null;
    this._cachedCompletedPages = null;

    this.init();
  }
  
  init() {
    this.loadPages();
    this.setupEventListeners();
    this.initTabHighlighter();
    
    // Подключаемся к background для включения быстрых проверок
    this.port = chrome.runtime.connect({ name: 'sidepanel' });
    
    // Слушаем сообщения от background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'pageAdded' || message.action === 'pagesUpdated') {
        this.loadPages();
      } else if (message.action === 'showCompleted') {
        // Переключаемся на вкладку "Отработанные"
        if (this.currentSection === 'active') {
          this.toggleSection();
        }
      } else if (message.action === 'closeSidePanel') {
        // Закрываем боковую панель
        window.close();
      }
    });
  }
  
  setupEventListeners() {
    // Табы переключения разделов
    if (this.activeTab) {
      this.activeTab.addEventListener('click', () => {
        if (this.currentSection !== 'active') {
          this.toggleSection();
        }
      });
    }
    
    if (this.completedTab) {
      this.completedTab.addEventListener('click', () => {
        if (this.currentSection !== 'completed') {
          this.toggleSection();
        }
      });
    }
    
    if (this.restoreCompletedBtn) {
      this.restoreCompletedBtn.addEventListener('click', () => {
        if (!this.restoreCompletedBtn.disabled) {
          this.restoreAllCompleted();
        }
      });
    }
    
    // Кнопка "Start All Tasks"
    if (this.startTasksBtn) {
      this.startTasksBtn.addEventListener('click', () => {
        if (!this.startTasksBtn.disabled) {
          this.startAllTasks();
        }
      });
    }
    
    // Ссылка "Перейти в раздел Завершенные"
    const goToCompletedLink = document.getElementById('goToCompleted');
    if (goToCompletedLink) {
      goToCompletedLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.currentSection === 'active') {
          this.toggleSection();
        }
      });
    }
    
    // Ссылка "Перейти в раздел Активные"
    const goToActiveLink = document.getElementById('goToActive');
    if (goToActiveLink) {
      goToActiveLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.currentSection === 'completed') {
          this.toggleSection();
        }
      });
    }
    
    // Клики по счётчикам для переключения разделов
    this.activeCount.addEventListener('click', () => {
      if (this.currentSection !== 'active') {
        this.toggleSection();
      }
    });
    
    this.completedCount.addEventListener('click', () => {
      if (this.currentSection !== 'completed') {
        this.toggleSection();
      }
    });
  }
  
  initTabHighlighter() {
    // Инициализация подчеркивания с помощью RoughNotation
    // Ждем загрузки библиотеки
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
        
        // Показываем подчеркивание для активной вкладки
        this.activeTabAnnotation.show();
      } else {
        // Если библиотека еще не загружена, попробуем через 100мс
        setTimeout(tryInit, 100);
      }
    };
    
    tryInit();
  }
  
  updateTabHighlighter() {
    // Обновляем подчеркивание при переключении вкладок
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
  
  toggleSection() {
    if (this.currentSection === 'active') {
      this.currentSection = 'completed';
      this.activeSection.classList.remove('active');
      this.completedSection.classList.add('active');
      
      // Обновляем табы
      if (this.activeTab) this.activeTab.classList.remove('active');
      if (this.completedTab) this.completedTab.classList.add('active');
      
      // Показываем кнопку Reset, скрываем кнопку Start в шапке
      if (this.startTasksBtn) this.startTasksBtn.style.display = 'none';
      if (this.restoreCompletedBtn) this.restoreCompletedBtn.style.display = 'flex';
    } else {
      this.currentSection = 'active';
      this.completedSection.classList.remove('active');
      this.activeSection.classList.add('active');
      
      // Обновляем табы
      if (this.completedTab) this.completedTab.classList.remove('active');
      if (this.activeTab) this.activeTab.classList.add('active');
      
      // Показываем кнопку Start, скрываем кнопку Reset в шапке
      if (this.startTasksBtn) this.startTasksBtn.style.display = 'flex';
      if (this.restoreCompletedBtn) this.restoreCompletedBtn.style.display = 'none';
    }
    
    // Обновляем подчеркивание
    this.updateTabHighlighter();
  }
  
  async loadPages() {
    try {
      // Запрашиваем данные у background
      const activeResponse = await chrome.runtime.sendMessage({ action: 'getActivePages' });
      const completedResponse = await chrome.runtime.sendMessage({ action: 'getCompletedPages' });
      
      const activePages = activeResponse.pages || [];
      const completedPages = completedResponse.pages || [];
      
      // Проверяем, изменились ли данные
      const activePagesChanged = !this._arePagesEqual(this._cachedActivePages, activePages);
      const completedPagesChanged = !this._arePagesEqual(this._cachedCompletedPages, completedPages);
      
      // Рендерим только если есть изменения
      if (activePagesChanged) {
        this.renderPages(activePages, this.activePagesList, this.emptyStateActive);
        this._cachedActivePages = JSON.parse(JSON.stringify(activePages)); // Deep copy
      }
      
      if (completedPagesChanged) {
        this.renderPages(completedPages, this.completedPagesList, this.emptyStateCompleted, true);
        this._cachedCompletedPages = JSON.parse(JSON.stringify(completedPages)); // Deep copy
      }
      
      // Обновляем счетчики и кнопки только если что-то изменилось
      if (activePagesChanged || completedPagesChanged) {
        this.updateCounters(activePages.length, completedPages.length);
      }
      
      // Управляем состоянием кнопки запуска
      if (activePages.length === 0) {
        this.startTasksBtn.disabled = true;
        this.startTasksBtn.style.opacity = '0.5';
        this.startTasksBtn.style.cursor = 'not-allowed';
      } else {
        this.startTasksBtn.disabled = false;
        this.startTasksBtn.style.opacity = '1';
        this.startTasksBtn.style.cursor = 'pointer';
      }
      
      // Управляем состоянием кнопки восстановления
      if (completedPages.length === 0) {
        this.restoreCompletedBtn.disabled = true;
        this.restoreCompletedBtn.style.opacity = '0.5';
        this.restoreCompletedBtn.style.cursor = 'not-allowed';
      } else {
        this.restoreCompletedBtn.disabled = false;
        this.restoreCompletedBtn.style.opacity = '1';
        this.restoreCompletedBtn.style.cursor = 'pointer';
      }
    } catch (error) {
      console.error('Error loading pages:', error);
    }
  }
  
  _arePagesEqual(pages1, pages2) {
    if (!pages1 || !pages2) return false;
    if (pages1.length !== pages2.length) return false;
    
    // Сравниваем JSON-представление для простоты
    return JSON.stringify(pages1) === JSON.stringify(pages2);
  }
  
  updateCounters(activeCount, completedCount) {
    this.activeCount.textContent = `Active: ${activeCount}`;
    this.completedCount.textContent = `Completed: ${completedCount}`;
  }
  
  renderPages(pages, listElement, emptyStateElement, isCompleted = false) {
    // Очищаем любые таймеры перед перерендером списка
    if (isCompleted) {
      Object.values(this._completedTimers).forEach(t => clearInterval(t));
      this._completedTimers = {};
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
    
    // Добавляем drag & drop только для активных задач
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
    url.textContent = this.shortenUrl(page.url);
    url.title = page.url;
    
    info.appendChild(title);
    info.appendChild(url);
    
    div.appendChild(favicon);
    div.appendChild(info);
    
    // Контейнер для кнопок действий
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'page-actions';
    
    // Для активных вкладок - кнопка типа сброса и удаления
    if (!isCompleted) {
      // Кнопка типа сброса
      const resetTypeBtn = document.createElement('button');
      resetTypeBtn.className = 'action-icon-btn reset-type-btn';
      const resetType = page.resetType || 'midnight';
      resetTypeBtn.title = resetType === 'midnight' ? 'At midnight (click to change)' : 'After interval (click to change)';
      
      const resetIcon = document.createElement('span');
      resetIcon.className = 'material-symbols-outlined';
      resetIcon.textContent = resetType === 'midnight' ? 'bedtime' : 'schedule';
      resetTypeBtn.appendChild(resetIcon);
      
      // Кнопка удаления
      const removeBtn = document.createElement('button');
      removeBtn.className = 'action-icon-btn delete-btn';
      removeBtn.title = 'Delete';
      
      const deleteIcon = document.createElement('span');
      deleteIcon.className = 'material-symbols-outlined';
      deleteIcon.textContent = 'delete';
      removeBtn.appendChild(deleteIcon);
      
      actionsDiv.appendChild(resetTypeBtn);
      actionsDiv.appendChild(removeBtn);
      
      // Обработчик переключения типа
      resetTypeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleResetType(page, resetIcon);
      });
      
      // Обработчик удаления страницы
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removePage(page.id);
      });
    } else {
      // Для завершенных вкладок - индикатор и кнопка восстановления в одном месте
      const resetType = page.resetType || 'midnight';
      
      // Контейнер-обертка для индикатора и кнопки (они будут в одном месте)
      const switchContainer = document.createElement('div');
      switchContainer.className = 'switch-container';
      
      // Контейнер для индикатора (луна или таймер)
      const indicator = document.createElement('div');
      indicator.className = 'completed-indicator';
      
      if (resetType === 'midnight') {
        // Иконка луны
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
        // Таймер обратного отсчета
        const timerBadge = document.createElement('div');
        timerBadge.className = 'countdown-badge';
        timerBadge.textContent = '--:--:--';
        timerBadge.title = 'Time until restore';
        
        // Вычисляем время следующего восстановления
        let restoreAtMs = null;
        if (page.restoreAt) {
          restoreAtMs = Date.parse(page.restoreAt);
        } else if (page.completedAt && page.resetInterval) {
          const completedMs = Date.parse(page.completedAt);
          if (!isNaN(completedMs)) {
            restoreAtMs = completedMs + Math.round((page.resetInterval || 0) * 3600 * 1000);
          }
        }
        
        const updateBadge = () => {
          const nowMs = Date.now();
          const t = restoreAtMs ? Math.max(0, restoreAtMs - nowMs) : 0;
          const hours = Math.floor(t / 3600000);
          const minutes = Math.floor((t % 3600000) / 60000);
          const seconds = Math.floor((t % 60000) / 1000);
          timerBadge.textContent = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
        };
        
        updateBadge();
        this._completedTimers[page.id] = setInterval(updateBadge, 1000);
        
        indicator.appendChild(timerBadge);
      }
      
      // Кнопка восстановления (показывается при hover вместо индикатора)
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
        this.restoreCompletedPage(page.id);
      });
    }
    
    div.appendChild(actionsDiv);
    
    // Обработчик клика по странице
    div.addEventListener('click', (e) => {
      if (!e.target.closest('.page-actions')) {
        if (isCompleted) {
          this.restoreCompletedPage(page.id);
        } else {
          this.openPage(page.url, page.id);
        }
      }
    });
    
    return div;
  }
  
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
  
  async openPage(url, bookmarkId) {
    try {
      // Используем openSinglePage чтобы открыть ТОЛЬКО эту страницу без цикла
      await chrome.runtime.sendMessage({
        action: 'openSinglePage',
        url: url,
        bookmarkId: bookmarkId
      });
    } catch (error) {
      console.error('Error opening page:', error);
    }
  }
  
  async restoreCompletedPage(bookmarkId) {
    try {
      await chrome.runtime.sendMessage({
        action: 'restorePage',
        bookmarkId: bookmarkId
      });
      
      // Проверяем, осталось ли что-то в отработанных
      const completedResponse = await chrome.runtime.sendMessage({ action: 'getCompletedPages' });
      const completedPages = completedResponse.pages || [];
      
      // Переключаемся на раздел активных только если это была последняя отработанная
      if (this.currentSection === 'completed' && completedPages.length === 0) {
        this.toggleSection();
      }
    } catch (error) {
      console.error('Error restoring page:', error);
    }
  }
  
  async removePage(bookmarkId) {
    try {
      await chrome.runtime.sendMessage({
        action: 'removePage',
        bookmarkId: bookmarkId
      });
    } catch (error) {
      console.error('Error removing page:', error);
    }
  }
  
  async restoreAllCompleted() {
    try {
      const completedResponse = await chrome.runtime.sendMessage({ action: 'getCompletedPages' });
      const completedPages = completedResponse.pages || [];
      
      if (completedPages.length === 0) {
        return;
      }
      
      // Восстанавливаем все страницы
      for (const page of completedPages) {
        await chrome.runtime.sendMessage({
          action: 'restorePage',
          bookmarkId: page.id
        });
      }
      
      // Переключаемся на раздел активных
      if (this.currentSection === 'completed') {
        this.toggleSection();
      }
    } catch (error) {
      console.error('Error restoring all completed:', error);
    }
  }
  
  async startAllTasks() {
    try {
      // Запускаем отработку всех задач через background
      await chrome.runtime.sendMessage({ action: 'openNextPage' });
    } catch (error) {
      console.error('Error starting all tasks:', error);
    }
  }
  
  async toggleResetType(page, iconElement) {
    const currentType = page.resetType || 'midnight';
    const newType = currentType === 'midnight' ? 'interval' : 'midnight';
    
    // Обновляем иконку
    iconElement.textContent = newType === 'midnight' ? 'bedtime' : 'schedule';
    const button = iconElement.parentElement;
    button.title = newType === 'midnight' ? 'At midnight (click to change)' : 'After interval (click to change)';
    
    // Обновляем локально в объекте
    page.resetType = newType;
    
    // Отправляем в background для сохранения
    try {
      await chrome.runtime.sendMessage({
        action: 'setResetType',
        bookmarkId: page.id,
        resetType: newType,
        resetInterval: page.resetInterval || 24
      });
    } catch (error) {
      console.error('Error setting reset type:', error);
    }
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
      // Убираем все индикаторы drag-over
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
      // Получаем текущий список активных страниц
      const response = await chrome.runtime.sendMessage({ action: 'getActivePages' });
      const pages = response.pages || [];
      
      // Находим индексы
      const draggedIndex = pages.findIndex(p => p.id === draggedId);
      const targetIndex = pages.findIndex(p => p.id === targetId);
      
      if (draggedIndex === -1 || targetIndex === -1) return;
      
      // Перемещаем закладку в Chrome Bookmarks
      const targetPage = pages[targetIndex];
      
      // Получаем родительскую папку
      const draggedBookmark = await chrome.bookmarks.get(draggedId);
      const parentId = draggedBookmark[0].parentId;
      
      // Перемещаем закладку
      await chrome.bookmarks.move(draggedId, {
        parentId: parentId,
        index: targetIndex
      });
      
      // Обновляем UI
      this.loadPages();
      
    } catch (error) {
      console.error('Error reordering pages:', error);
    }
  }
}

// Инициализируем панель при загрузке
document.addEventListener('DOMContentLoaded', () => {
  new DailyPanel();
});

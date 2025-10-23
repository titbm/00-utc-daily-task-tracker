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
    
    // Кнопки и элементы управления
    this.restoreCompletedBtn = document.getElementById('restoreCompleted');
    this.startTasksBtn = document.getElementById('startTasks');
    this.sectionTitle = document.getElementById('sectionTitle');
    
    // Счетчики
    this.activeCount = document.getElementById('activeCount');
    this.completedCount = document.getElementById('completedCount');
    
    // Текущая активная секция
    this.currentSection = 'active'; // 'active' или 'completed'
    
    // Словарь таймеров для отработанных элементов (по id)
    this._completedTimers = {};

    this.init();
  }
  
  init() {
    this.loadPages();
    this.setupEventListeners();
    
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
    this.sectionTitle.addEventListener('click', () => {
      this.toggleSection();
    });
    
    this.restoreCompletedBtn.addEventListener('click', () => {
      this.restoreAllCompleted();
    });
    
    this.startTasksBtn.addEventListener('click', () => {
      this.startAllTasks();
    });
    
    // Ссылка "Перейти в раздел Выполненные"
    const goToCompletedLink = document.getElementById('goToCompleted');
    if (goToCompletedLink) {
      goToCompletedLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.currentSection === 'active') {
          this.toggleSection();
        }
      });
    }
  }
  
  toggleSection() {
    const titleText = this.sectionTitle.querySelector('.title-text');
    
    if (this.currentSection === 'active') {
      this.currentSection = 'completed';
      this.activeSection.classList.remove('active');
      this.completedSection.classList.add('active');
      titleText.textContent = 'Completed';
      // Показываем кнопку восстановления, скрываем кнопку запуска
      this.startTasksBtn.style.display = 'none';
      this.restoreCompletedBtn.style.display = 'flex';
    } else {
      this.currentSection = 'active';
      this.completedSection.classList.remove('active');
      this.activeSection.classList.add('active');
      titleText.textContent = 'Active';
      // Показываем кнопку запуска, скрываем кнопку восстановления
      this.startTasksBtn.style.display = 'flex';
      this.restoreCompletedBtn.style.display = 'none';
    }
  }
  
  async loadPages() {
    try {
      // Запрашиваем данные у background
      const activeResponse = await chrome.runtime.sendMessage({ action: 'getActivePages' });
      const completedResponse = await chrome.runtime.sendMessage({ action: 'getCompletedPages' });
      
      const activePages = activeResponse.pages || [];
      const completedPages = completedResponse.pages || [];
      
      console.log('Active pages loaded:', activePages);
      console.log('Completed pages loaded:', completedPages);
      
      this.renderPages(activePages, this.activePagesList, this.emptyStateActive);
      this.renderPages(completedPages, this.completedPagesList, this.emptyStateCompleted, true);
      this.updateCounters(activePages.length, completedPages.length);
    } catch (error) {
      console.error('Error loading pages:', error);
    }
  }
  
  updateCounters(activeCount, completedCount) {
    this.activeCount.textContent = `Активных: ${activeCount}`;
    this.completedCount.textContent = `Отработанных: ${completedCount}`;
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
    
  // Только для активных вкладок добавляем кнопку удаления
  if (!isCompleted) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '🗑️';
    removeBtn.title = 'Удалить';
    
    const resetTypeBtn = document.createElement('button');
    resetTypeBtn.className = 'page-reset-type-btn';
    const resetType = page.resetType || 'midnight';
    resetTypeBtn.classList.add(`type-${resetType}`);
    resetTypeBtn.textContent = resetType === 'midnight' ? '🌙' : '⏰';
    resetTypeBtn.title = resetType === 'midnight' ? 'В полночь (клик для смены)' : 'Через время (клик для смены)';
    
    div.appendChild(resetTypeBtn);
    div.appendChild(removeBtn);
    
    // Обработчик переключения типа
    resetTypeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleResetType(page, resetTypeBtn);
    });
    
    // Обработчик удаления страницы
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removePage(page.id);
    });
  }    // Обработчик клика по странице
    div.addEventListener('click', (e) => {
      if (!e.target.classList.contains('remove-btn') && !e.target.classList.contains('page-reset-type-btn')) {
        if (isCompleted) {
          this.restoreCompletedPage(page.id);
        } else {
          this.openPage(page.url, page.id);
        }
      }
    });
    
    // Если элемент отработанный — добавляем индикатор справа: 🌙 или таймер
    if (isCompleted) {
      const indicator = document.createElement('div');
      indicator.className = 'completed-indicator';

      const resetType = page.resetType || 'midnight';
      if (resetType === 'midnight') {
        const moon = document.createElement('div');
        moon.className = 'moon-indicator';
        moon.textContent = '🌙';
        moon.title = 'Вернётся в полночь (00:00 UTC)';
        indicator.appendChild(moon);
      } else {
        const badge = document.createElement('div');
        badge.className = 'countdown-badge';
        badge.textContent = '--:--:--';
        badge.title = 'Осталось до восстановления';
        indicator.appendChild(badge);

        // Вычисляем время следующего восстановления
        // Если задано поле restoreAt используем его, иначе вычисляем от completedAt + resetInterval часов
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
          badge.textContent = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
        };

        updateBadge();
        // Запускаем интервал и сохраняем его, чтобы очистить при следующем рендере
        this._completedTimers[page.id] = setInterval(updateBadge, 1000);
      }

      div.appendChild(indicator);
    }
    
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
      await chrome.runtime.sendMessage({
        action: 'openPage',
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
  
  async toggleResetType(page, button) {
    const currentType = page.resetType || 'midnight';
    const newType = currentType === 'midnight' ? 'interval' : 'midnight';
    
    // Обновляем иконку
    button.className = 'page-reset-type-btn';
    button.classList.add(`type-${newType}`);
    button.textContent = newType === 'midnight' ? '🌙' : '⏰';
    button.title = newType === 'midnight' ? 'В полночь (клик для смены)' : 'Через время (клик для смены)';
    
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
}

// Инициализируем панель при загрузке
document.addEventListener('DOMContentLoaded', () => {
  new DailyPanel();
});

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
    this.toggleSectionBtn = document.getElementById('toggleSection');
    this.restoreCompletedBtn = document.getElementById('restoreCompleted');
    this.sectionTitle = document.getElementById('sectionTitle');
    
    // Счетчики
    this.activeCount = document.getElementById('activeCount');
    this.completedCount = document.getElementById('completedCount');
    
    // Текущая активная секция
    this.currentSection = 'active'; // 'active' или 'completed'
    
    this.init();
  }
  
  init() {
    this.loadPages();
    this.setupEventListeners();
    
    // Слушаем сообщения от background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'pageAdded' || message.action === 'pagesUpdated') {
        this.loadPages();
      }
    });
    
    // Обновляем список при изменении хранилища
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && (changes.panelPages || changes.completedPages)) {
        this.loadPages();
      }
    });
  }
  
  setupEventListeners() {
    this.toggleSectionBtn.addEventListener('click', () => {
      this.toggleSection();
    });
    
    this.restoreCompletedBtn.addEventListener('click', () => {
      this.restoreAllCompleted();
    });
  }
  
  toggleSection() {
    if (this.currentSection === 'active') {
      this.currentSection = 'completed';
      this.activeSection.classList.remove('active');
      this.completedSection.classList.add('active');
      this.sectionTitle.textContent = '✓ Отработанные';
      this.toggleSectionBtn.textContent = '📋';
      this.toggleSectionBtn.title = 'Активные';
    } else {
      this.currentSection = 'active';
      this.completedSection.classList.remove('active');
      this.activeSection.classList.add('active');
      this.sectionTitle.textContent = '📋 Активные';
      this.toggleSectionBtn.textContent = '✓';
      this.toggleSectionBtn.title = 'Отработанные сегодня';
    }
  }
  
  loadPages() {
    chrome.storage.local.get(['panelPages', 'completedPages'], (result) => {
      const activePages = result.panelPages || [];
      const completedPages = result.completedPages || [];
      
      this.renderPages(activePages, this.activePagesList, this.emptyStateActive);
      this.renderPages(completedPages, this.completedPagesList, this.emptyStateCompleted, true);
      this.updateCounters(activePages.length, completedPages.length);
    });
  }
  
  updateCounters(activeCount, completedCount) {
    this.activeCount.textContent = `Активных: ${activeCount}`;
    this.completedCount.textContent = `Отработанных: ${completedCount}`;
  }
  
  renderPages(pages, listElement, emptyStateElement, isCompleted = false) {
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
      removeBtn.textContent = '×';
      removeBtn.title = 'Удалить';
      div.appendChild(removeBtn);
      
      // Обработчик удаления страницы
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removePage(page.id);
      });
    }
    
    // Обработчик клика по странице
    div.addEventListener('click', (e) => {
      if (!e.target.classList.contains('remove-btn')) {
        if (isCompleted) {
          this.restoreCompletedPage(page.id);
        } else {
          this.openPage(page.url, index);
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
  
  openPage(url, index) {
    chrome.storage.local.get(['panelPages'], (result) => {
      const pages = result.panelPages || [];
      const page = pages[index];
      
      chrome.runtime.sendMessage({
        action: 'openPage',
        url: url,
        index: index,
        pageId: page ? page.id : null
      });
    });
  }
  
  restoreCompletedPage(pageId) {
    chrome.storage.local.get(['panelPages', 'completedPages'], (result) => {
      const activePages = result.panelPages || [];
      const completedPages = result.completedPages || [];
      
      const pageToRestore = completedPages.find(p => p.id === pageId);
      if (!pageToRestore) return;
      
      // Удаляем дату завершения
      const { completedAt, ...restoredPage } = pageToRestore;
      
      // Обновляем списки
      const updatedActivePages = [...activePages, restoredPage];
      const updatedCompletedPages = completedPages.filter(p => p.id !== pageId);
      
      chrome.storage.local.set({ 
        panelPages: updatedActivePages,
        completedPages: updatedCompletedPages
      });
      
      // Переключаемся на раздел активных только если это была последняя отработанная
      if (this.currentSection === 'completed' && updatedCompletedPages.length === 0) {
        this.toggleSection();
      }
    });
  }
  
  removePage(pageId) {
    chrome.runtime.sendMessage({
      action: 'removePage',
      pageId: pageId
    });
  }
  
  restoreAllCompleted() {
    chrome.storage.local.get(['panelPages', 'completedPages'], (result) => {
      const activePages = result.panelPages || [];
      const completedPages = result.completedPages || [];
      
      if (completedPages.length === 0) {
        return;
      }
      
      // Удаляем дату завершения и добавляем обратно в активные
      const restoredPages = completedPages.map(page => {
        const { completedAt, ...pageWithoutDate } = page;
        return pageWithoutDate;
      });
      
      const updatedActivePages = [...activePages, ...restoredPages];
      
      chrome.storage.local.set({ 
        panelPages: updatedActivePages,
        completedPages: []
      });
      
      // Переключаемся на раздел активных
      if (this.currentSection === 'completed') {
        this.toggleSection();
      }
    });
  }
}

// Инициализируем панель при загрузке
document.addEventListener('DOMContentLoaded', () => {
  new DailyPanel();
});

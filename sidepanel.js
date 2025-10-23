class DailyPanel {
  constructor() {
    this.pagesList = document.getElementById('pagesList');
    this.emptyState = document.getElementById('emptyState');
    this.clearAllBtn = document.getElementById('clearAll');
    this.pageCount = document.getElementById('pageCount');
    
    this.init();
  }
  
  init() {
    this.loadPages();
    this.setupEventListeners();
    
    // Слушаем сообщения от background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'pageAdded') {
        this.loadPages();
      }
    });
    
    // Обновляем список при изменении хранилища
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.panelPages) {
        this.loadPages();
      }
    });
  }
  
  setupEventListeners() {
    this.clearAllBtn.addEventListener('click', () => {
      this.clearAllPages();
    });
  }
  
  loadPages() {
    chrome.storage.local.get(['panelPages'], (result) => {
      const pages = result.panelPages || [];
      this.renderPages(pages);
      this.updateCounter(pages.length);
    });
  }
  
  updateCounter(count) {
    this.pageCount.textContent = count;
  }
  
  renderPages(pages) {
    this.pagesList.innerHTML = '';
    
    if (pages.length === 0) {
      this.emptyState.classList.remove('hidden');
      return;
    }
    
    this.emptyState.classList.add('hidden');
    
    pages.forEach((page, index) => {
      const pageElement = this.createPageElement(page, index);
      this.pagesList.appendChild(pageElement);
    });
  }
  
  createPageElement(page, index) {
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
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.title = 'Удалить';
    
    div.appendChild(favicon);
    div.appendChild(info);
    div.appendChild(removeBtn);
    
    // Обработчик клика по странице
    div.addEventListener('click', (e) => {
      if (!e.target.classList.contains('remove-btn')) {
        this.openPage(page.url, index);
      }
    });
    
    // Обработчик удаления страницы
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removePage(page.id);
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
    chrome.runtime.sendMessage({
      action: 'openPage',
      url: url,
      index: index
    });
  }
  
  removePage(pageId) {
    chrome.runtime.sendMessage({
      action: 'removePage',
      pageId: pageId
    });
  }
  
  clearAllPages() {
    if (confirm('Вы уверены, что хотите удалить все страницы из панели?')) {
      chrome.runtime.sendMessage({
        action: 'clearAll'
      });
    }
  }
}

// Инициализируем панель при загрузке
document.addEventListener('DOMContentLoaded', () => {
  new DailyPanel();
});

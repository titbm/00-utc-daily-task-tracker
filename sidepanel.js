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
    
    // Диалоги
    this.settingsDialog = document.getElementById('settingsDialog');
    this.intervalDialog = document.getElementById('intervalDialog');
    this.currentEditingPage = null;
    this.currentIntervalPage = null;
    
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
    
    // Диалог настроек
    document.getElementById('resetTypeSelect').addEventListener('change', (e) => {
      const intervalGroup = document.getElementById('intervalGroup');
      intervalGroup.style.display = e.target.value === 'interval' ? 'block' : 'none';
    });
    
    document.getElementById('cancelSettings').addEventListener('click', () => {
      this.closeSettingsDialog();
    });
    
    document.getElementById('saveSettings').addEventListener('click', () => {
      this.savePageSettings();
    });
    
    // Диалог интервала
    document.getElementById('confirmInterval').addEventListener('click', () => {
      this.confirmInterval();
    });
    
    // Слушаем сообщения от background для показа диалога
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'showIntervalDialog') {
        this.showIntervalDialog(message.page);
      }
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
    
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'page-settings-btn';
    settingsBtn.textContent = '⚙';
    settingsBtn.title = 'Настройки';
    
    div.appendChild(settingsBtn);
    div.appendChild(removeBtn);
    
    // Обработчик настроек страницы
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openSettingsDialog(page);
    });
    
    // Обработчик удаления страницы
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removePage(page.id);
    });
  }    // Обработчик клика по странице
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
  
  openSettingsDialog(page) {
    this.currentEditingPage = page;
    
    document.getElementById('dialogPageTitle').textContent = page.title;
    document.getElementById('resetTypeSelect').value = page.resetType || 'midnight';
    document.getElementById('resetIntervalInput').value = page.resetInterval || 24;
    
    const intervalGroup = document.getElementById('intervalGroup');
    intervalGroup.style.display = (page.resetType === 'interval') ? 'block' : 'none';
    
    this.settingsDialog.classList.add('show');
  }
  
  closeSettingsDialog() {
    this.settingsDialog.classList.remove('show');
    this.currentEditingPage = null;
  }
  
  savePageSettings() {
    if (!this.currentEditingPage) return;
    
    const resetType = document.getElementById('resetTypeSelect').value;
    const resetInterval = parseInt(document.getElementById('resetIntervalInput').value) || 24;
    
    chrome.runtime.sendMessage({
      action: 'updatePageSettings',
      pageId: this.currentEditingPage.id,
      settings: {
        resetType: resetType,
        resetInterval: resetInterval
      }
    });
    
    this.closeSettingsDialog();
  }
  
  showIntervalDialog(page) {
    this.currentIntervalPage = page;
    
    document.getElementById('intervalDialogPageTitle').textContent = page.title;
    document.getElementById('intervalHoursInput').value = page.resetInterval || 24;
    
    this.intervalDialog.classList.add('show');
  }
  
  confirmInterval() {
    if (!this.currentIntervalPage) return;
    
    const hours = parseInt(document.getElementById('intervalHoursInput').value) || 24;
    
    chrome.runtime.sendMessage({
      action: 'moveToCompletedWithInterval',
      pageId: this.currentIntervalPage.id,
      intervalHours: hours
    });
    
    this.intervalDialog.classList.remove('show');
    this.currentIntervalPage = null;
    
    // Открываем следующую страницу
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'openNextPage' });
    }, 200);
  }
}

// Инициализируем панель при загрузке
document.addEventListener('DOMContentLoaded', () => {
  new DailyPanel();
});

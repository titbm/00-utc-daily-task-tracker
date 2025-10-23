chrome.runtime.onInstalled.addListener(() => {
  // Создаем контекстное меню для добавления страниц в панель
  chrome.contextMenus.create({
    id: "addToPanel",
    title: "Добавить в Daily Panel",
    contexts: ["page"]
  });

  // Инициализируем хранилище
  chrome.storage.local.get(['panelPages', 'completedPages'], (result) => {
    if (!result.panelPages) {
      chrome.storage.local.set({ panelPages: [] });
    }
    if (!result.completedPages) {
      chrome.storage.local.set({ completedPages: [] });
    }
  });
  
  // Включаем боковую панель для всех вкладок
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
  
  // Запускаем периодическую проверку времени
  startTimeChecker();
});

// Запускаем проверку времени при старте service worker
chrome.runtime.onStartup.addListener(() => {
  startTimeChecker();
});

// Функция запуска периодической проверки
function startTimeChecker() {
  // Проверяем сразу при запуске
  checkAndRestoreOldPages();
  
  // Устанавливаем интервал проверки каждые 5 секунд
  setInterval(() => {
    checkAndRestoreOldPages();
  }, 5000);
}

// Функция проверки и восстановления старых страниц
function checkAndRestoreOldPages() {
  chrome.storage.local.get(['panelPages', 'completedPages', 'lastCheckDate'], (result) => {
    const activePages = result.panelPages || [];
    const completedPages = result.completedPages || [];
    
    if (completedPages.length === 0) return;
    
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    
    // Разделяем на старые и сегодняшние
    const oldPages = [];
    const todayPages = [];
    
    completedPages.forEach(page => {
      const completedDate = new Date(page.completedAt);
      if (completedDate < todayStart) {
        oldPages.push(page);
      } else {
        todayPages.push(page);
      }
    });
    
    // Если есть старые страницы, восстанавливаем их
    if (oldPages.length > 0) {
      const restoredPages = oldPages.map(page => {
        const { completedAt, ...pageWithoutDate } = page;
        return pageWithoutDate;
      });
      
      const updatedActivePages = [...activePages, ...restoredPages];
      
      chrome.storage.local.set({ 
        panelPages: updatedActivePages,
        completedPages: todayPages,
        lastCheckDate: now.toISOString()
      });
      
      // Уведомляем панель об обновлении
      chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
    }
  });
}

// Обработчик клика по контекстному меню
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "addToPanel") {
    addPageToPanel(tab);
  }
});

// Функция добавления страницы в панель
function addPageToPanel(tab) {
  const pageData = {
    id: Date.now(),
    title: tab.title,
    url: tab.url,
    favicon: tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23ddd"/></svg>',
    addedAt: new Date().toISOString()
  };

  chrome.storage.local.get(['panelPages'], (result) => {
    const pages = result.panelPages || [];
    
    // Проверяем, не добавлена ли уже эта страница
    const exists = pages.some(page => page.url === pageData.url);
    if (!exists) {
      pages.push(pageData);
      chrome.storage.local.set({ panelPages: pages });
      
      // Уведомляем боковую панель об обновлении
      chrome.runtime.sendMessage({ action: 'pageAdded', page: pageData }).catch(() => {
        // Боковая панель может быть не открыта
      });
    }
  });
}

// Слушаем закрытие вкладок для автоматического открытия следующей
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (!removeInfo.isWindowClosing) {
    // Проверяем, была ли закрыта вкладка из нашего списка
    chrome.storage.local.get(['panelPages', 'currentTabId', 'autoOpenEnabled', 'openedPageId'], (result) => {
      const autoOpenEnabled = result.autoOpenEnabled !== false;
      
      if (autoOpenEnabled && result.currentTabId === tabId) {
        // Перемещаем страницу в отработанные по ID
        movePageToCompletedById(result.openedPageId, result.panelPages);
        
        // Небольшая задержка перед открытием следующей
        setTimeout(() => {
          openNextPageFromPanel();
        }, 100);
      }
    });
  }
});

// Функция перемещения страницы в отработанные по ID
function movePageToCompletedById(pageId, allPages) {
  if (!pageId || !allPages) {
    return;
  }
  
  const page = allPages.find(p => p.id === pageId);
  if (!page) {
    return;
  }
  
  const completedPage = {
    ...page,
    completedAt: new Date().toISOString()
  };
  
  chrome.storage.local.get(['panelPages', 'completedPages'], (result) => {
    const activePagesUpdated = (result.panelPages || []).filter(p => p.id !== pageId);
    const completedPages = result.completedPages || [];
    completedPages.push(completedPage);
    
    chrome.storage.local.set({ 
      panelPages: activePagesUpdated,
      completedPages: completedPages
    });
    
    // Уведомляем панель об обновлении
    chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
  });
}

// Функция открытия следующей страницы из панели
function openNextPageFromPanel() {
  chrome.storage.local.get(['panelPages'], (result) => {
    const pages = result.panelPages || [];
    
    // Открываем первую страницу из оставшихся
    if (pages.length > 0) {
      const nextPage = pages[0];
      
      chrome.tabs.create({ url: nextPage.url }, (tab) => {
        chrome.storage.local.set({ 
          currentIndex: 0,
          currentTabId: tab.id,
          openedPageId: nextPage.id
        });
      });
    } else {
      // Достигли конца списка, сбрасываем состояние
      chrome.storage.local.set({ 
        currentIndex: -1,
        currentTabId: null,
        autoOpenEnabled: false,
        openedPageId: null
      });
    }
  });
}

// Обработчик клика по иконке расширения
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Обработчик сообщений от боковой панели
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPage') {
    chrome.tabs.create({ url: request.url }, (tab) => {
      chrome.storage.local.set({ 
        currentIndex: request.index,
        currentTabId: tab.id,
        autoOpenEnabled: true,
        openedPageId: request.pageId
      });
    });
  } else if (request.action === 'removePage') {
    chrome.storage.local.get(['panelPages'], (result) => {
      const pages = result.panelPages || [];
      const updatedPages = pages.filter(page => page.id !== request.pageId);
      chrome.storage.local.set({ panelPages: updatedPages });
    });
  } else if (request.action === 'clearAll') {
    chrome.storage.local.set({ 
      panelPages: [],
      currentIndex: -1,
      currentTabId: null
    });
  }
});

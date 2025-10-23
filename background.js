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
  
  // Создаём или находим папку в закладках
  initializeBookmarksFolder();
  
  // Запускаем периодическую проверку времени
  startTimeChecker();
});

// Запускаем проверку времени при старте service worker
chrome.runtime.onStartup.addListener(() => {
  startTimeChecker();
  initializeBookmarksFolder();
});

// Функция инициализации папки закладок
async function initializeBookmarksFolder() {
  try {
    const bookmarkTreeNodes = await chrome.bookmarks.getTree();
    const bookmarksBar = bookmarkTreeNodes[0].children.find(node => node.id === '1');
    
    if (!bookmarksBar) return;
    
    // Ищем существующую папку Daily Panel
    let dailyPanelFolder = bookmarksBar.children.find(node => node.title === 'Daily Panel');
    
    if (!dailyPanelFolder) {
      // Создаём новую папку
      dailyPanelFolder = await chrome.bookmarks.create({
        parentId: bookmarksBar.id,
        title: 'Daily Panel'
      });
    }
    
    // Сохраняем ID папки
    chrome.storage.local.set({ bookmarksFolderId: dailyPanelFolder.id });
    
    // Синхронизируем существующие страницы
    syncPagesToBookmarks();
  } catch (error) {
    console.error('Error initializing bookmarks folder:', error);
  }
}

// Функция синхронизации страниц в закладки
async function syncPagesToBookmarks() {
  try {
    const result = await chrome.storage.local.get(['panelPages', 'bookmarksFolderId']);
    const pages = result.panelPages || [];
    const folderId = result.bookmarksFolderId;
    
    if (!folderId) return;
    
    // Получаем текущие закладки в папке
    const folderBookmarks = await chrome.bookmarks.getChildren(folderId);
    
    // Удаляем все существующие закладки
    for (const bookmark of folderBookmarks) {
      await chrome.bookmarks.remove(bookmark.id);
    }
    
    // Добавляем текущие страницы
    for (const page of pages) {
      await chrome.bookmarks.create({
        parentId: folderId,
        title: page.title,
        url: page.url
      });
    }
  } catch (error) {
    console.error('Error syncing pages to bookmarks:', error);
  }
}

// Функция добавления закладки
async function addBookmark(page) {
  try {
    const result = await chrome.storage.local.get(['bookmarksFolderId']);
    const folderId = result.bookmarksFolderId;
    
    if (!folderId) return;
    
    await chrome.bookmarks.create({
      parentId: folderId,
      title: page.title,
      url: page.url
    });
  } catch (error) {
    console.error('Error adding bookmark:', error);
  }
}

// Функция удаления закладки по URL
async function removeBookmarkByUrl(url) {
  try {
    const result = await chrome.storage.local.get(['bookmarksFolderId']);
    const folderId = result.bookmarksFolderId;
    
    if (!folderId) return;
    
    const folderBookmarks = await chrome.bookmarks.getChildren(folderId);
    const bookmark = folderBookmarks.find(b => b.url === url);
    
    if (bookmark) {
      await chrome.bookmarks.remove(bookmark.id);
    }
  } catch (error) {
    console.error('Error removing bookmark:', error);
  }
}

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
      
      // Синхронизируем с закладками (восстанавливаем страницы в закладки)
      syncPagesToBookmarks();
      
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
      
      // Добавляем в закладки
      addBookmark(pageData);
      
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
    
    // Удаляем из закладок (страница переместилась в отработанные)
    removeBookmarkByUrl(page.url);
    
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
      const pageToRemove = pages.find(page => page.id === request.pageId);
      const updatedPages = pages.filter(page => page.id !== request.pageId);
      
      chrome.storage.local.set({ panelPages: updatedPages });
      
      // Удаляем из закладок
      if (pageToRemove) {
        removeBookmarkByUrl(pageToRemove.url);
      }
    });
  } else if (request.action === 'clearAll') {
    chrome.storage.local.set({ 
      panelPages: [],
      currentIndex: -1,
      currentTabId: null
    });
  }
});

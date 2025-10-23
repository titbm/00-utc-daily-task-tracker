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
    
    // Проверяем, существует ли папка
    let folderBookmarks;
    try {
      folderBookmarks = await chrome.bookmarks.getChildren(folderId);
    } catch (e) {
      // Папка не существует - пересоздаём
      console.log('Bookmarks folder not found, reinitializing...');
      await initializeBookmarksFolder();
      return;
    }
    
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
    
    try {
      await chrome.bookmarks.create({
        parentId: folderId,
        title: page.title,
        url: page.url
      });
    } catch (e) {
      // Папка не существует - пересоздаём
      console.log('Bookmarks folder not found, reinitializing...');
      await initializeBookmarksFolder();
    }
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
    
    let folderBookmarks;
    try {
      folderBookmarks = await chrome.bookmarks.getChildren(folderId);
    } catch (e) {
      // Папка не существует - пересоздаём
      console.log('Bookmarks folder not found, reinitializing...');
      await initializeBookmarksFolder();
      return;
    }
    
    const bookmark = folderBookmarks.find(b => b.url === url);
    
    if (bookmark) {
      await chrome.bookmarks.remove(bookmark.id);
    }
  } catch (error) {
    console.error('Error removing bookmark:', error);
  }
}

// Функция синхронизации закладок в панель (обратная синхронизация)
async function syncBookmarksToPages() {
  try {
    const result = await chrome.storage.local.get(['bookmarksFolderId', 'panelPages']);
    const folderId = result.bookmarksFolderId;
    const currentPages = result.panelPages || [];
    
    if (!folderId) return;
    
    // Получаем все закладки из папки
    let folderBookmarks;
    try {
      folderBookmarks = await chrome.bookmarks.getChildren(folderId);
    } catch (e) {
      // Папка не существует - пересоздаём
      console.log('Bookmarks folder not found, reinitializing...');
      await initializeBookmarksFolder();
      return;
    }
    
    // Создаём Set URL текущих страниц для быстрой проверки
    const currentUrls = new Set(currentPages.map(p => p.url));
    
    // Добавляем новые закладки в панель
    const newPages = [];
    for (const bookmark of folderBookmarks) {
      if (bookmark.url && !currentUrls.has(bookmark.url)) {
        newPages.push({
          id: Date.now() + Math.random(), // Уникальный ID
          title: bookmark.title,
          url: bookmark.url,
          favicon: `chrome://favicon/${bookmark.url}`,
          addedAt: new Date().toISOString()
        });
      }
    }
    
    if (newPages.length > 0) {
      const updatedPages = [...currentPages, ...newPages];
      await chrome.storage.local.set({ panelPages: updatedPages });
      
      // Уведомляем панель об обновлении
      chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
    }
    
    // Проверяем удалённые закладки
    const bookmarkUrls = new Set(folderBookmarks.filter(b => b.url).map(b => b.url));
    const pagesToRemove = currentPages.filter(p => !bookmarkUrls.has(p.url));
    
    if (pagesToRemove.length > 0) {
      const updatedPages = currentPages.filter(p => bookmarkUrls.has(p.url));
      await chrome.storage.local.set({ panelPages: updatedPages });
      
      // Уведомляем панель об обновлении
      chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
    }
  } catch (error) {
    console.error('Error syncing bookmarks to pages:', error);
  }
}

// Слушаем создание закладок
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  const result = await chrome.storage.local.get(['bookmarksFolderId']);
  const folderId = result.bookmarksFolderId;
  
  // Проверяем, что закладка создана в нашей папке
  if (bookmark.parentId === folderId && bookmark.url) {
    await syncBookmarksToPages();
  }
});

// Слушаем удаление закладок
chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  const result = await chrome.storage.local.get(['bookmarksFolderId']);
  const folderId = result.bookmarksFolderId;
  
  // Если удалили саму папку Daily Panel - восстанавливаем её
  if (id === folderId) {
    console.log('Daily Panel folder was deleted, recreating...');
    await initializeBookmarksFolder();
    return;
  }
  
  // Проверяем, что закладка удалена из нашей папки
  if (removeInfo.parentId === folderId) {
    await syncBookmarksToPages();
  }
});

// Слушаем изменение закладок (например, изменение URL или названия)
chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  const result = await chrome.storage.local.get(['bookmarksFolderId']);
  const folderId = result.bookmarksFolderId;
  
  // Получаем информацию о закладке
  const bookmark = await chrome.bookmarks.get(id);
  if (bookmark[0] && bookmark[0].parentId === folderId) {
    await syncBookmarksToPages();
  }
});

// Функция запуска периодической проверки
let fastCheckInterval = null;
let sidePanelConnections = 0;

function startTimeChecker() {
  // Проверяем сразу при запуске
  checkAndRestoreOldPages();
  
  // Создаём alarm для фоновых проверок (каждую минуту)
  chrome.alarms.create('checkPages', { periodInMinutes: 1 });
}

// Слушаем срабатывание alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkPages') {
    checkAndRestoreOldPages();
  }
});

// Функция для быстрых проверок когда панель открыта
function startFastChecks() {
  if (fastCheckInterval) return; // Уже запущен
  
  fastCheckInterval = setInterval(() => {
    checkAndRestoreOldPages();
  }, 5000); // Каждые 5 секунд
}

function stopFastChecks() {
  if (fastCheckInterval) {
    clearInterval(fastCheckInterval);
    fastCheckInterval = null;
  }
}

// Слушаем подключения от sidepanel
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    sidePanelConnections++;
    startFastChecks();
    
    port.onDisconnect.addListener(() => {
      sidePanelConnections--;
      if (sidePanelConnections <= 0) {
        sidePanelConnections = 0;
        stopFastChecks();
      }
    });
  }
});

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
      let shouldRestore = false;
      
      // Проверяем тип восстановления
      if (page.resetType === 'interval' && page.restoreAt) {
        // Восстановление по времени
        const restoreDate = new Date(page.restoreAt);
        shouldRestore = now >= restoreDate;
      } else {
        // Восстановление в полночь (по умолчанию)
        const completedDate = new Date(page.completedAt);
        shouldRestore = completedDate < todayStart;
      }
      
      if (shouldRestore) {
        oldPages.push(page);
      } else {
        todayPages.push(page);
      }
    });
    
    // Если есть старые страницы, восстанавливаем их
    if (oldPages.length > 0) {
      const restoredPages = oldPages.map(page => {
        const { completedAt, restoreAt, ...pageWithoutDate } = page;
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
    addedAt: new Date().toISOString(),
    resetType: 'midnight', // 'midnight' или 'interval'
    resetInterval: 24 // часов (по умолчанию 24)
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
        const page = result.panelPages ? result.panelPages.find(p => p.id === result.openedPageId) : null;
        
        // Перемещаем страницу в отработанные по ID
        movePageToCompletedById(result.openedPageId);
        
        // Если тип НЕ 'interval', открываем следующую страницу
        // Для 'interval' следующая откроется после закрытия диалога
        if (!page || page.resetType !== 'interval') {
          setTimeout(() => {
            openNextPageFromPanel();
          }, 100);
        }
      }
    });
  }
});

// Функция перемещения страницы в отработанные по ID
function movePageToCompletedById(pageId, allPages) {
  if (!pageId) {
    return;
  }
  
  // Читаем свежие данные из storage
  chrome.storage.local.get(['panelPages', 'completedPages'], (result) => {
    const pages = result.panelPages || [];
    const page = pages.find(p => p.id === pageId);
    
    if (!page) {
      return;
    }
    
    const completedPage = {
      ...page,
      completedAt: new Date().toISOString()
    };
    
    // Удаляем из активных
    const activePagesUpdated = pages.filter(p => p.id !== pageId);
    const completedPages = result.completedPages || [];
    completedPages.push(completedPage);
    
    chrome.storage.local.set({ 
      panelPages: activePagesUpdated,
      completedPages: completedPages
    }, () => {
      // Уведомляем панель об обновлении
      chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
      
      // Если тип resetType = 'interval', открываем диалог в новой вкладке
      if (page.resetType === 'interval') {
        const dialogUrl = chrome.runtime.getURL('interval-dialog.html') + 
          `?pageId=${page.id}` +
          `&title=${encodeURIComponent(page.title)}` +
          `&url=${encodeURIComponent(page.url)}` +
          `&interval=${page.resetInterval || 24}`;
        
        chrome.tabs.create({ url: dialogUrl });
      }
    });
  });
}

// Функция перемещения страницы с интервалом в отработанные
function movePageToCompletedWithInterval(pageId, intervalHours) {
  chrome.storage.local.get(['panelPages', 'completedPages'], (result) => {
    const allPages = result.panelPages || [];
    const page = allPages.find(p => p.id === pageId);
    
    if (!page) return;
    
    const now = new Date();
    const restoreAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
    
    const completedPage = {
      ...page,
      completedAt: now.toISOString(),
      restoreAt: restoreAt.toISOString()
    };
    
    const activePagesUpdated = allPages.filter(p => p.id !== pageId);
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
  } else if (request.action === 'moveToCompletedWithInterval') {
    movePageToCompletedWithInterval(request.pageId, request.intervalHours);
  } else if (request.action === 'updatePageSettings') {
    chrome.storage.local.get(['panelPages'], (result) => {
      const pages = result.panelPages || [];
      const pageIndex = pages.findIndex(p => p.id === request.pageId);
      
      if (pageIndex !== -1) {
        pages[pageIndex] = { ...pages[pageIndex], ...request.settings };
        chrome.storage.local.set({ panelPages: pages });
        
        // Уведомляем панель об обновлении
        chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
      }
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
  } else if (request.action === 'openNextPage') {
    openNextPageFromPanel();
  } else if (request.action === 'clearAll') {
    chrome.storage.local.set({ 
      panelPages: [],
      currentIndex: -1,
      currentTabId: null
    });
  }
});

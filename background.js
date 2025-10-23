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
      
      console.log('Created new Daily Panel folder');
      
      // Сохраняем ID папки
      await chrome.storage.local.set({ bookmarksFolderId: dailyPanelFolder.id });
      
      // Синхронизируем существующие страницы из панели в новую папку
      await syncPagesToBookmarks();
    } else {
      console.log('Found existing Daily Panel folder');
      
      // Сохраняем ID папки
      await chrome.storage.local.set({ bookmarksFolderId: dailyPanelFolder.id });
      
      // ПЕРВАЯ УСТАНОВКА: импортируем закладки из папки в панель
      const result = await chrome.storage.local.get(['panelPages']);
      const currentPages = result.panelPages || [];
      
      if (currentPages.length === 0) {
        // Панель пустая - импортируем из папки
        const folderBookmarks = await chrome.bookmarks.getChildren(dailyPanelFolder.id);
        const importedPages = [];
        
        for (const bookmark of folderBookmarks) {
          if (bookmark.url) {
            importedPages.push({
              id: Date.now() + Math.random(),
              title: bookmark.title,
              url: bookmark.url,
              favicon: `chrome://favicon/${bookmark.url}`,
              addedAt: new Date().toISOString(),
              resetType: 'midnight',
              resetInterval: 24
            });
          }
        }
        
        if (importedPages.length > 0) {
          console.log(`Imported ${importedPages.length} bookmarks from existing folder`);
          await chrome.storage.local.set({ panelPages: importedPages });
        }
      } else {
        // Панель уже есть - синхронизируем панель в закладки
        await syncPagesToBookmarks();
      }
    }
  } catch (error) {
    console.error('Error initializing bookmarks folder:', error);
  }
}

// Функция синхронизации страниц из панели в закладки (панель -> закладки)
async function syncPagesToBookmarks() {
  try {
    const result = await chrome.storage.local.get(['panelPages', 'bookmarksFolderId']);
    const pages = result.panelPages || [];
    const folderId = result.bookmarksFolderId;
    
    if (!folderId) {
      console.log('No folder ID, reinitializing...');
      await initializeBookmarksFolder();
      return;
    }
    
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
    
    // Создаём карту существующих закладок по URL
    const bookmarkMap = new Map();
    for (const bookmark of folderBookmarks) {
      if (bookmark.url) {
        bookmarkMap.set(bookmark.url, bookmark.id);
      }
    }
    
    // Создаём карту страниц панели по URL
    const pageUrls = new Set(pages.map(p => p.url));
    
    // Удаляем закладки, которых нет в панели
    for (const [url, bookmarkId] of bookmarkMap) {
      if (!pageUrls.has(url)) {
        console.log('Removing bookmark not in panel:', url);
        await chrome.bookmarks.remove(bookmarkId);
      }
    }
    
    // Добавляем закладки, которых нет в папке
    for (const page of pages) {
      if (!bookmarkMap.has(page.url)) {
        console.log('Adding bookmark from panel:', page.title);
        await chrome.bookmarks.create({
          parentId: folderId,
          title: page.title,
          url: page.url
        });
      }
    }
  } catch (error) {
    console.error('Error syncing pages to bookmarks:', error);
  }
}

// Функция добавления закладки (вызывается при добавлении страницы в панель)
async function addBookmark(page) {
  try {
    const result = await chrome.storage.local.get(['bookmarksFolderId']);
    const folderId = result.bookmarksFolderId;
    
    if (!folderId) {
      await initializeBookmarksFolder();
      return;
    }
    
    try {
      console.log('Adding bookmark:', page.title);
      await chrome.bookmarks.create({
        parentId: folderId,
        title: page.title,
        url: page.url
      });
    } catch (e) {
      console.log('Error adding bookmark, reinitializing folder...');
      await initializeBookmarksFolder();
    }
  } catch (error) {
    console.error('Error adding bookmark:', error);
  }
}

// Функция удаления закладки по URL (вызывается при удалении страницы из панели)
async function removeBookmarkByUrl(url) {
  try {
    const result = await chrome.storage.local.get(['bookmarksFolderId']);
    const folderId = result.bookmarksFolderId;
    
    if (!folderId) return;
    
    let folderBookmarks;
    try {
      folderBookmarks = await chrome.bookmarks.getChildren(folderId);
    } catch (e) {
      // Папка не существует - ничего не делаем
      return;
    }
    
    const bookmark = folderBookmarks.find(b => b.url === url);
    
    if (bookmark) {
      console.log('Removing bookmark:', url);
      await chrome.bookmarks.remove(bookmark.id);
    }
  } catch (error) {
    console.error('Error removing bookmark:', error);
  }
}

// Функция добавления закладки из папки в панель
async function addBookmarkToPanel(bookmark) {
  try {
    const result = await chrome.storage.local.get(['panelPages']);
    const currentPages = result.panelPages || [];
    
    // Проверяем, нет ли уже такой страницы
    const exists = currentPages.some(p => p.url === bookmark.url);
    if (exists) {
      console.log('Bookmark already in panel:', bookmark.url);
      return;
    }
    
    const newPage = {
      id: Date.now() + Math.random(),
      title: bookmark.title,
      url: bookmark.url,
      favicon: `chrome://favicon/${bookmark.url}`,
      addedAt: new Date().toISOString(),
      resetType: 'midnight',
      resetInterval: 24
    };
    
    console.log('Adding bookmark to panel:', bookmark.title);
    const updatedPages = [...currentPages, newPage];
    await chrome.storage.local.set({ panelPages: updatedPages });
    
    // Уведомляем панель об обновлении
    chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
  } catch (error) {
    console.error('Error adding bookmark to panel:', error);
  }
}

// Слушаем создание закладок (пользователь добавил в папку)
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  try {
    const result = await chrome.storage.local.get(['bookmarksFolderId']);
    const folderId = result.bookmarksFolderId;
    
    // Если закладка это папка (нет url), проверяем не наша ли это папка
    if (!bookmark.url && bookmark.title === 'Daily Panel') {
      console.log('Daily Panel folder created by user, updating ID');
      await chrome.storage.local.set({ bookmarksFolderId: bookmark.id });
      await syncPagesToBookmarks();
      return;
    }
    
    // Проверяем, что закладка создана в нашей папке
    if (bookmark.parentId === folderId && bookmark.url) {
      console.log('User added bookmark to folder:', bookmark.title);
      await addBookmarkToPanel(bookmark);
    }
  } catch (error) {
    console.error('Error in onCreated listener:', error);
  }
});

// Слушаем удаление закладок
chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  try {
    const result = await chrome.storage.local.get(['bookmarksFolderId']);
    const folderId = result.bookmarksFolderId;
    
    // Если удалили саму папку Daily Panel - восстанавливаем её
    if (id === folderId) {
      console.log('Daily Panel folder was deleted, restoring...');
      await initializeBookmarksFolder();
      return;
    }
    
    // Проверяем, что закладка удалена из нашей папки - восстанавливаем её
    if (removeInfo.parentId === folderId) {
      console.log('Bookmark removed from folder, restoring...');
      // Восстанавливаем удаленную закладку из панели
      await syncPagesToBookmarks();
    }
  } catch (error) {
    console.error('Error in onRemoved listener:', error);
  }
});

// Слушаем изменение закладок - не реагируем, панель главнее
chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  // Игнорируем изменения закладок, панель - источник правды
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

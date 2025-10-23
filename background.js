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

// Функция инициализации папки закладок (с двумя подпапками)
async function initializeBookmarksFolder() {
  try {
    const bookmarkTreeNodes = await chrome.bookmarks.getTree();
    const bookmarksBar = bookmarkTreeNodes[0].children.find(node => node.id === '1');
    
    if (!bookmarksBar) return;
    
    // Ищем или создаём главную папку Daily Panel
    let dailyPanelFolder = bookmarksBar.children.find(node => node.title === 'Daily Panel');
    
    if (!dailyPanelFolder) {
      dailyPanelFolder = await chrome.bookmarks.create({
        parentId: bookmarksBar.id,
        title: 'Daily Panel'
      });
      console.log('Created Daily Panel folder');
    }
    
    // Получаем подпапки (или создаём их)
    const dailyPanelChildren = await chrome.bookmarks.getChildren(dailyPanelFolder.id);
    
    let activeFolder = dailyPanelChildren.find(node => node.title === 'Active' && !node.url);
    let completedFolder = dailyPanelChildren.find(node => node.title === 'Completed' && !node.url);
    
    if (!activeFolder) {
      activeFolder = await chrome.bookmarks.create({
        parentId: dailyPanelFolder.id,
        title: 'Active'
      });
      console.log('Created Active subfolder');
    }
    
    if (!completedFolder) {
      completedFolder = await chrome.bookmarks.create({
        parentId: dailyPanelFolder.id,
        title: 'Completed'
      });
      console.log('Created Completed subfolder');
    }
    
    // Сохраняем ID папок
    await chrome.storage.local.set({ 
      bookmarksFolderId: dailyPanelFolder.id,
      activeFolderId: activeFolder.id,
      completedFolderId: completedFolder.id
    });
    
    // Импортируем закладки из папок в панель (если панель пустая)
    const result = await chrome.storage.local.get(['panelPages', 'completedPages']);
    const currentActive = result.panelPages || [];
    const currentCompleted = result.completedPages || [];
    
    if (currentActive.length === 0 && currentCompleted.length === 0) {
      console.log('Panel is empty, importing from bookmarks...');
      await importBookmarksToPanel(activeFolder.id, completedFolder.id);
    } else {
      console.log('Panel has data, syncing to bookmarks...');
      await syncPagesToBookmarks();
    }
  } catch (error) {
    console.error('Error initializing bookmarks folder:', error);
  }
}

// Функция импорта закладок из папок в панель
async function importBookmarksToPanel(activeFolderId, completedFolderId) {
  try {
    const activeBookmarks = await chrome.bookmarks.getChildren(activeFolderId);
    const completedBookmarks = await chrome.bookmarks.getChildren(completedFolderId);
    
    const importedActive = [];
    const importedCompleted = [];
    
    // Импортируем активные
    for (const bookmark of activeBookmarks) {
      if (bookmark.url) {
        importedActive.push({
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
    
    // Импортируем отработанные (парсим метаданные из названия)
    for (const bookmark of completedBookmarks) {
      if (bookmark.url) {
        const parsed = parseCompletedBookmarkTitle(bookmark.title);
        importedCompleted.push({
          id: Date.now() + Math.random(),
          title: parsed.title,
          url: bookmark.url,
          favicon: `chrome://favicon/${bookmark.url}`,
          addedAt: parsed.addedAt || new Date().toISOString(),
          completedAt: parsed.completedAt,
          restoreAt: parsed.restoreAt,
          resetType: parsed.resetType || 'midnight',
          resetInterval: parsed.resetInterval || 24
        });
      }
    }
    
    console.log(`Imported ${importedActive.length} active + ${importedCompleted.length} completed bookmarks`);
    
    await chrome.storage.local.set({ 
      panelPages: importedActive,
      completedPages: importedCompleted
    });
    
    // Уведомляем панель
    chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
  } catch (error) {
    console.error('Error importing bookmarks to panel:', error);
  }
}

// Парсинг метаданных из названия закладки completed
// Формат: "Title [completedAt|restoreAt|resetType|resetInterval]"
function parseCompletedBookmarkTitle(fullTitle) {
  const match = fullTitle.match(/^(.+?)\s*\[([^\]]+)\]$/);
  
  if (!match) {
    return {
      title: fullTitle,
      completedAt: new Date().toISOString(),
      resetType: 'midnight',
      resetInterval: 24
    };
  }
  
  const title = match[1];
  const metadata = match[2].split('|');
  
  return {
    title: title,
    completedAt: metadata[0] || new Date().toISOString(),
    restoreAt: metadata[1] || null,
    resetType: metadata[2] || 'midnight',
    resetInterval: parseInt(metadata[3]) || 24,
    addedAt: metadata[4] || new Date().toISOString()
  };
}

// Создание названия закладки с метаданными для completed
function createCompletedBookmarkTitle(page) {
  const metadata = [
    page.completedAt || new Date().toISOString(),
    page.restoreAt || '',
    page.resetType || 'midnight',
    page.resetInterval || 24,
    page.addedAt || new Date().toISOString()
  ].join('|');
  
  return `${page.title} [${metadata}]`;
}

// Функция синхронизации страниц из панели в закладки (панель -> закладки в две папки)
async function syncPagesToBookmarks() {
  try {
    const result = await chrome.storage.local.get(['panelPages', 'completedPages', 'activeFolderId', 'completedFolderId']);
    const activePages = result.panelPages || [];
    const completedPages = result.completedPages || [];
    const activeFolderId = result.activeFolderId;
    const completedFolderId = result.completedFolderId;
    
    if (!activeFolderId || !completedFolderId) {
      console.log('Folder IDs missing, reinitializing...');
      await initializeBookmarksFolder();
      return;
    }
    
    // Синхронизируем активные
    await syncFolderWithPages(activeFolderId, activePages, false);
    
    // Синхронизируем отработанные (с метаданными)
    await syncFolderWithPages(completedFolderId, completedPages, true);
    
    console.log(`Synced ${activePages.length} active + ${completedPages.length} completed to bookmarks`);
  } catch (error) {
    console.error('Error syncing pages to bookmarks:', error);
  }
}

// Вспомогательная функция синхронизации одной папки
async function syncFolderWithPages(folderId, pages, isCompleted) {
  try {
    // Получаем закладки из папки
    let folderBookmarks;
    try {
      folderBookmarks = await chrome.bookmarks.getChildren(folderId);
    } catch (e) {
      console.log('Folder not found, reinitializing...');
      await initializeBookmarksFolder();
      return;
    }
    
    // Карта закладок по URL
    const bookmarkMap = new Map();
    for (const bookmark of folderBookmarks) {
      if (bookmark.url) {
        const cleanTitle = isCompleted ? parseCompletedBookmarkTitle(bookmark.title).title : bookmark.title;
        bookmarkMap.set(bookmark.url, { id: bookmark.id, title: cleanTitle });
      }
    }
    
    // Карта страниц по URL
    const pageUrls = new Set(pages.map(p => p.url));
    
    // Удаляем закладки, которых нет в панели
    for (const [url, data] of bookmarkMap) {
      if (!pageUrls.has(url)) {
        await chrome.bookmarks.remove(data.id);
      }
    }
    
    // Добавляем/обновляем закладки из панели
    for (const page of pages) {
      const existing = bookmarkMap.get(page.url);
      const bookmarkTitle = isCompleted ? createCompletedBookmarkTitle(page) : page.title;
      
      if (!existing) {
        // Добавляем новую
        await chrome.bookmarks.create({
          parentId: folderId,
          title: bookmarkTitle,
          url: page.url
        });
      } else if (existing.title !== page.title || isCompleted) {
        // Обновляем название (для completed всегда обновляем метаданные)
        await chrome.bookmarks.update(existing.id, { title: bookmarkTitle });
      }
    }
  } catch (error) {
    console.error('Error syncing folder:', error);
  }
}

// Функция добавления закладки в Active (вызывается при добавлении страницы в панель)
async function addBookmark(page) {
  try {
    const result = await chrome.storage.local.get(['activeFolderId']);
    const folderId = result.activeFolderId;
    
    if (!folderId) {
      await initializeBookmarksFolder();
      return;
    }
    
    try {
      console.log('Adding bookmark to Active:', page.title);
      await chrome.bookmarks.create({
        parentId: folderId,
        title: page.title,
        url: page.url
      });
    } catch (e) {
      console.log('Error adding bookmark, reinitializing...');
      await initializeBookmarksFolder();
    }
  } catch (error) {
    console.error('Error adding bookmark:', error);
  }
}

// Функция удаления закладки по URL из обеих папок
async function removeBookmarkByUrl(url) {
  try {
    const result = await chrome.storage.local.get(['activeFolderId', 'completedFolderId']);
    const activeFolderId = result.activeFolderId;
    const completedFolderId = result.completedFolderId;
    
    if (!activeFolderId || !completedFolderId) return;
    
    // Проверяем обе папки
    for (const folderId of [activeFolderId, completedFolderId]) {
      try {
        const folderBookmarks = await chrome.bookmarks.getChildren(folderId);
        const bookmark = folderBookmarks.find(b => b.url === url);
        
        if (bookmark) {
          console.log('Removing bookmark:', url);
          await chrome.bookmarks.remove(bookmark.id);
          return;
        }
      } catch (e) {
        // Папка не существует - продолжаем
      }
    }
  } catch (error) {
    console.error('Error removing bookmark:', error);
  }
}

// Функция добавления закладки из Active в панель
async function addBookmarkToPanel(bookmark, isCompleted = false) {
  try {
    const storageKey = isCompleted ? 'completedPages' : 'panelPages';
    const result = await chrome.storage.local.get([storageKey]);
    const currentPages = result[storageKey] || [];
    
    // Проверяем, нет ли уже такой страницы
    const exists = currentPages.some(p => p.url === bookmark.url);
    if (exists) {
      console.log('Bookmark already in panel:', bookmark.url);
      return;
    }
    
    let newPage;
    if (isCompleted) {
      // Парсим метаданные из названия
      const parsed = parseCompletedBookmarkTitle(bookmark.title);
      newPage = {
        id: Date.now() + Math.random(),
        title: parsed.title,
        url: bookmark.url,
        favicon: `chrome://favicon/${bookmark.url}`,
        addedAt: parsed.addedAt,
        completedAt: parsed.completedAt,
        restoreAt: parsed.restoreAt,
        resetType: parsed.resetType,
        resetInterval: parsed.resetInterval
      };
    } else {
      newPage = {
        id: Date.now() + Math.random(),
        title: bookmark.title,
        url: bookmark.url,
        favicon: `chrome://favicon/${bookmark.url}`,
        addedAt: new Date().toISOString(),
        resetType: 'midnight',
        resetInterval: 24
      };
    }
    
    console.log(`Adding bookmark to ${isCompleted ? 'completed' : 'active'}:`, newPage.title);
    const updatedPages = [...currentPages, newPage];
    await chrome.storage.local.set({ [storageKey]: updatedPages });
    
    // Уведомляем панель об обновлении
    chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
  } catch (error) {
    console.error('Error adding bookmark to panel:', error);
  }
}

// Функция удаления закладки из панели по URL
async function removePageFromPanel(url, fromCompleted = false) {
  try {
    const result = await chrome.storage.local.get(['panelPages', 'completedPages']);
    let activePages = result.panelPages || [];
    let completedPages = result.completedPages || [];
    
    const activeLength = activePages.length;
    const completedLength = completedPages.length;
    
    activePages = activePages.filter(p => p.url !== url);
    completedPages = completedPages.filter(p => p.url !== url);
    
    if (activePages.length < activeLength || completedPages.length < completedLength) {
      console.log('Removed page from panel:', url);
      await chrome.storage.local.set({ 
        panelPages: activePages,
        completedPages: completedPages
      });
      
      // Уведомляем панель
      chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
    }
  } catch (error) {
    console.error('Error removing page from panel:', error);
  }
}

// Слушаем создание закладок
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  try {
    const result = await chrome.storage.local.get(['bookmarksFolderId', 'activeFolderId', 'completedFolderId']);
    
    // Если создана главная папка Daily Panel
    if (!bookmark.url && bookmark.title === 'Daily Panel') {
      console.log('Daily Panel folder created, reinitializing...');
      await initializeBookmarksFolder();
      return;
    }
    
    // Если создана в Active - добавляем в панель
    if (bookmark.parentId === result.activeFolderId && bookmark.url) {
      console.log('User added bookmark to Active:', bookmark.title);
      await addBookmarkToPanel(bookmark, false);
    }
    
    // Если создана в Completed - добавляем в отработанные
    if (bookmark.parentId === result.completedFolderId && bookmark.url) {
      console.log('User added bookmark to Completed:', bookmark.title);
      await addBookmarkToPanel(bookmark, true);
    }
  } catch (error) {
    console.error('Error in onCreated listener:', error);
  }
});

// Слушаем удаление закладок
chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  try {
    const result = await chrome.storage.local.get(['bookmarksFolderId', 'activeFolderId', 'completedFolderId']);
    
    // Если удалили главную папку Daily Panel - восстанавливаем всё
    if (id === result.bookmarksFolderId || id === result.activeFolderId || id === result.completedFolderId) {
      console.log('Daily Panel folder/subfolder deleted, restoring...');
      setTimeout(() => initializeBookmarksFolder(), 100);
      return;
    }
    
    // Если удалили закладку из наших папок - восстанавливаем из панели
    if (removeInfo.parentId === result.activeFolderId || removeInfo.parentId === result.completedFolderId) {
      console.log('Bookmark removed, restoring from panel...');
      setTimeout(() => syncPagesToBookmarks(), 100);
    }
  } catch (error) {
    console.error('Error in onRemoved listener:', error);
  }
});

// Слушаем перемещение закладок
chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  try {
    const result = await chrome.storage.local.get(['activeFolderId', 'completedFolderId']);
    const activeFolderId = result.activeFolderId;
    const completedFolderId = result.completedFolderId;
    
    // Если переместили между Active и Completed - синхронизируем
    const fromActive = moveInfo.oldParentId === activeFolderId;
    const fromCompleted = moveInfo.oldParentId === completedFolderId;
    const toActive = moveInfo.parentId === activeFolderId;
    const toCompleted = moveInfo.parentId === completedFolderId;
    
    if ((fromActive && toCompleted) || (fromCompleted && toActive)) {
      console.log('Bookmark moved between Active/Completed, re-syncing...');
      setTimeout(() => syncPagesToBookmarks(), 100);
    }
  } catch (error) {
    console.error('Error in onMoved listener:', error);
  }
});

// Слушаем изменение закладок - игнорируем, панель главнее
chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  // Панель - источник правды, игнорируем ручные изменения названий
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
    }, async () => {
      // Уведомляем панель об обновлении
      chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
      
      // Синхронизируем с закладками (перемещаем из Active в Completed)
      await syncPagesToBookmarks();
      
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
    }, async () => {
      // Уведомляем панель об обновлении
      chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
      
      // Синхронизируем с закладками
      await syncPagesToBookmarks();
    });
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
        chrome.storage.local.set({ panelPages: pages }, async () => {
          // Уведомляем панель об обновлении
          chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
          
          // Синхронизируем с закладками
          await syncPagesToBookmarks();
        });
      }
    });
  } else if (request.action === 'syncBookmarks') {
    // Запрос на синхронизацию с закладками
    syncPagesToBookmarks();
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

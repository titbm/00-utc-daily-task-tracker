chrome.runtime.onInstalled.addListener(async () => {
  // Создаем контекстное меню для добавления страниц в панель
  chrome.contextMenus.create({
    id: "addToPanel",
    title: "Добавить в Daily Panel",
    contexts: ["page"]
  });
  
  // Включаем боковую панель для всех вкладок
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
  
  // Создаём или находим папки в закладках
  await initializeBookmarksFolder();
  
  // Запускаем периодическую проверку времени
  startTimeChecker();
});

// Запускаем проверку времени при старте service worker
chrome.runtime.onStartup.addListener(async () => {
  await initializeBookmarksFolder();
  startTimeChecker();
});

// Глобальные переменные для хранения ID папок (только ID, не данные)
let FOLDER_IDS = {
  main: null,
  active: null,
  completed: null
};

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
    
    // Сохраняем ID папок в глобальную переменную
    FOLDER_IDS = {
      main: dailyPanelFolder.id,
      active: activeFolder.id,
      completed: completedFolder.id
    };
    
    console.log('Folder IDs initialized:', FOLDER_IDS);
  } catch (error) {
    console.error('Error initializing bookmarks folder:', error);
  }
}

// Функция получения ID папок (с инициализацией если нужно)
async function getFolderIds() {
  if (!FOLDER_IDS.active || !FOLDER_IDS.completed) {
    await initializeBookmarksFolder();
  }
  return FOLDER_IDS;
}

// Функция чтения активных страниц из закладок
async function getActivePages() {
  try {
    const ids = await getFolderIds();
    if (!ids.active) return [];
    
    const bookmarks = await chrome.bookmarks.getChildren(ids.active);
    const pages = [];
    
    for (const bookmark of bookmarks) {
      if (bookmark.url) {
        const parsed = parseActiveBookmarkTitle(bookmark.title);
        pages.push({
          id: bookmark.id,
          title: parsed.title,
          url: bookmark.url,
          favicon: `chrome://favicon/${bookmark.url}`,
          addedAt: bookmark.dateAdded ? new Date(bookmark.dateAdded).toISOString() : new Date().toISOString(),
          resetType: parsed.resetType,
          resetInterval: 24 // По умолчанию для UI
        });
      }
    }
    
    return pages;
  } catch (error) {
    console.error('Error getting active pages:', error);
    return [];
  }
}

// Парсинг метаданных из Active: "Title [resetType]"
function parseActiveBookmarkTitle(fullTitle) {
  const match = fullTitle.match(/^(.+?)\s*\[([^\]]+)\]$/);
  
  if (!match) {
    return {
      title: fullTitle,
      resetType: 'midnight'
    };
  }
  
  const title = match[1];
  const resetType = match[2];
  
  return {
    title: title,
    resetType: resetType === 'interval' ? 'interval' : 'midnight'
  };
}

// Функция чтения отработанных страниц из закладок
async function getCompletedPages() {
  try {
    const ids = await getFolderIds();
    if (!ids.completed) return [];
    
    const bookmarks = await chrome.bookmarks.getChildren(ids.completed);
    const pages = [];
    
    for (const bookmark of bookmarks) {
      if (bookmark.url) {
        const parsed = parseCompletedBookmarkTitle(bookmark.title);
        pages.push({
          id: bookmark.id, // Используем ID закладки как ID страницы
          title: parsed.title,
          url: bookmark.url,
          favicon: `chrome://favicon/${bookmark.url}`,
          addedAt: parsed.addedAt,
          completedAt: parsed.completedAt,
          restoreAt: parsed.restoreAt,
          resetType: parsed.resetType,
          resetInterval: parsed.resetInterval
        });
      }
    }
    
    return pages;
  } catch (error) {
    console.error('Error getting completed pages:', error);
    return [];
  }
}

// Функция импорта закладок из папок в панель
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
  
  const parsed = {
    title: title,
    completedAt: metadata[0] || new Date().toISOString(),
    restoreAt: (metadata[1] && metadata[1] !== '') ? metadata[1] : null,
    resetType: metadata[2] || 'midnight',
    resetInterval: parseInt(metadata[3]) || 24,
    addedAt: metadata[4] || new Date().toISOString()
  };
  
  console.log('Parsed completed bookmark:', parsed);
  return parsed;
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
  
  const title = `${page.title} [${metadata}]`;
  console.log('Created bookmark title:', title, 'from page:', page);
  return title;
}

// Функция добавления страницы в Active
async function addPageToActive(tab) {
  try {
    const ids = await getFolderIds();
    if (!ids.active) {
      console.error('Active folder not found');
      return;
    }
    
    // Проверяем дубликаты
    const activePages = await getActivePages();
    const exists = activePages.some(p => p.url === tab.url);
    if (exists) {
      console.log('Page already exists:', tab.url);
      return;
    }
    
    // Создаём закладку с метаданными [resetType]
    const titleWithMetadata = `${tab.title} [midnight]`;
    
    await chrome.bookmarks.create({
      parentId: ids.active,
      title: titleWithMetadata,
      url: tab.url
    });
    
    console.log('Added page to Active:', tab.title);
    notifyPanelUpdate();
  } catch (error) {
    console.error('Error adding page to Active:', error);
  }
}

// Функция удаления страницы по ID закладки
async function removePage(bookmarkId) {
  try {
    await chrome.bookmarks.remove(bookmarkId);
    console.log('Removed bookmark:', bookmarkId);
    notifyPanelUpdate();
  } catch (error) {
    console.error('Error removing bookmark:', error);
  }
}

// Вспомогательная функция уведомления панели об обновлении
function notifyPanelUpdate() {
  chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
}

// Слушаем создание закладок
// Слушаем изменения закладок для уведомления панели
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  try {
    const ids = await getFolderIds();
    
    // Если создана в Active или Completed - уведомляем панель
    if (bookmark.parentId === ids.active || bookmark.parentId === ids.completed) {
      console.log('Bookmark created:', bookmark.title);
      notifyPanelUpdate();
    }
  } catch (error) {
    console.error('Error in onCreated listener:', error);
  }
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  try {
    const ids = await getFolderIds();
    
    // Если удалили из Active или Completed - уведомляем панель
    if (removeInfo.parentId === ids.active || removeInfo.parentId === ids.completed) {
      console.log('Bookmark removed');
      notifyPanelUpdate();
    }
  } catch (error) {
    console.error('Error in onRemoved listener:', error);
  }
});

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  try {
    const ids = await getFolderIds();
    
    // Если переместили в/из Active или Completed - уведомляем панель
    if (moveInfo.oldParentId === ids.active || moveInfo.oldParentId === ids.completed ||
        moveInfo.parentId === ids.active || moveInfo.parentId === ids.completed) {
      console.log('Bookmark moved');
      notifyPanelUpdate();
    }
  } catch (error) {
    console.error('Error in onMoved listener:', error);
  }
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  try {
    const bookmark = await chrome.bookmarks.get(id);
    const ids = await getFolderIds();
    
    // Если изменили закладку в Active или Completed - уведомляем панель
    if (bookmark[0].parentId === ids.active || bookmark[0].parentId === ids.completed) {
      console.log('Bookmark changed');
      notifyPanelUpdate();
    }
  } catch (error) {
    console.error('Error in onChanged listener:', error);
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
async function checkAndRestoreOldPages() {
  try {
    const ids = await getFolderIds();
    const completedPages = await getCompletedPages();
    
    if (completedPages.length === 0) return;
    
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    
    // Проверяем каждую отработанную страницу
    for (const page of completedPages) {
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
      
      // Если нужно восстановить - перемещаем из Completed в Active
      if (shouldRestore) {
        console.log('Restoring page:', page.title);
        await chrome.bookmarks.move(page.id, { parentId: ids.active });
        // Создаём метаданные для Active с сохранением resetType
        const newTitle = `${page.title} [${page.resetType}]`;
        await chrome.bookmarks.update(page.id, { title: newTitle });
      }
    }
    
    notifyPanelUpdate();
  } catch (error) {
    console.error('Error checking and restoring old pages:', error);
  }
}

// Обработчик клика по контекстному меню
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "addToPanel") {
    try {
      // Проверяем, не добавлена ли уже эта страница
      const pages = await getActivePages();
      const exists = pages.some(page => page.url === tab.url);
      
      if (!exists) {
        await addPageToActive(tab);
      }
    } catch (error) {
      console.error('Error adding page from context menu:', error);
    }
  }
});

// Слушаем закрытие вкладок для автоматического открытия следующей
// Хранилище для отслеживания открытых вкладок из панели
const openedTabs = new Map(); // tabId -> bookmarkId

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  if (!removeInfo.isWindowClosing && openedTabs.has(tabId)) {
    const bookmarkId = openedTabs.get(tabId);
    openedTabs.delete(tabId);
    
    try {
      // Получаем закладку и читаем resetType из метаданных
      const bookmark = await chrome.bookmarks.get(bookmarkId);
      if (!bookmark || !bookmark[0]) return;
      
      const page = bookmark[0];
      const parsed = parseActiveBookmarkTitle(page.title);
      
      // Перемещаем в Completed
      await movePageToCompleted(bookmarkId);
      
      // Если тип = interval, открываем диалог
      if (parsed.resetType === 'interval') {
        const dialogUrl = chrome.runtime.getURL('interval-dialog.html') + 
          `?bookmarkId=${bookmarkId}` +
          `&title=${encodeURIComponent(parsed.title)}` +
          `&url=${encodeURIComponent(page.url)}` +
          `&interval=24`;
        
        chrome.tabs.create({ url: dialogUrl });
      } else {
        // Для midnight сразу открываем следующую
        setTimeout(() => {
          openNextPageFromPanel();
        }, 100);
      }
    } catch (error) {
      console.error('Error handling tab close:', error);
    }
  }
});

// Функция перемещения страницы из Active в Completed
async function movePageToCompleted(bookmarkId) {
  try {
    const ids = await getFolderIds();
    const bookmark = await chrome.bookmarks.get(bookmarkId);
    
    if (!bookmark || !bookmark[0]) {
      console.error('Bookmark not found:', bookmarkId);
      return;
    }
    
    const page = bookmark[0];
    
    // Парсим метаданные из Active
    const parsed = parseActiveBookmarkTitle(page.title);
    
    // Создаём метаданные для Completed
    const completedAt = new Date().toISOString();
    const metadata = [
      completedAt,
      '', // restoreAt будет установлен позже для interval
      parsed.resetType,
      24, // resetInterval по умолчанию
      page.dateAdded ? new Date(page.dateAdded).toISOString() : new Date().toISOString()
    ].join('|');
    
    const newTitle = `${parsed.title} [${metadata}]`;
    
    // Перемещаем в Completed
    await chrome.bookmarks.move(bookmarkId, { parentId: ids.completed });
    await chrome.bookmarks.update(bookmarkId, { title: newTitle });
    
    console.log('Moved to Completed:', parsed.title);
    notifyPanelUpdate();
    
    // Если interval - откроем диалог (сейчас всегда midnight из Active)
  } catch (error) {
    console.error('Error moving to completed:', error);
  }
}

// Функция установки интервала для отработанной страницы
async function setPageInterval(bookmarkId, intervalHours) {
  try {
    const bookmark = await chrome.bookmarks.get(bookmarkId);
    if (!bookmark || !bookmark[0]) return;
    
    const page = bookmark[0];
    const parsed = parseCompletedBookmarkTitle(page.title);
    
    const now = new Date();
    const restoreAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
    
    // Обновляем метаданные с новым restoreAt
    const metadata = [
      parsed.completedAt || now.toISOString(),
      restoreAt.toISOString(),
      'interval',
      intervalHours,
      parsed.addedAt
    ].join('|');
    
    const newTitle = `${parsed.title} [${metadata}]`;
    
    await chrome.bookmarks.update(bookmarkId, { title: newTitle });
    console.log('Updated interval for:', parsed.title, intervalHours, 'hours');
    notifyPanelUpdate();
  } catch (error) {
    console.error('Error setting interval:', error);
  }
}

// Функция открытия следующей страницы из панели
async function openNextPageFromPanel() {
  try {
    const pages = await getActivePages();
    
    // Открываем первую страницу из оставшихся
    if (pages.length > 0) {
      const nextPage = pages[0];
      chrome.tabs.create({ url: nextPage.url });
    }
  } catch (error) {
    console.error('Error opening next page:', error);
  }
}

// Обработчик клика по иконке расширения
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Обработчик сообщений от боковой панели
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPage') {
    chrome.tabs.create({ url: request.url }, (tab) => {
      // Сохраняем связь вкладки с закладкой
      if (request.bookmarkId) {
        openedTabs.set(tab.id, request.bookmarkId);
      }
      sendResponse({ success: true });
    });
    return true; // Асинхронный ответ
  } else if (request.action === 'getActivePages') {
    getActivePages().then(pages => sendResponse({ pages }));
    return true; // Асинхронный ответ
  } else if (request.action === 'getCompletedPages') {
    getCompletedPages().then(pages => sendResponse({ pages }));
    return true; // Асинхронный ответ
  } else if (request.action === 'moveToCompleted') {
    movePageToCompleted(request.bookmarkId).then(() => {
      sendResponse({ success: true });
    });
    return true; // Асинхронный ответ
  } else if (request.action === 'setPageInterval') {
    setPageInterval(request.bookmarkId, request.intervalHours).then(() => {
      sendResponse({ success: true });
    });
    return true; // Асинхронный ответ
  } else if (request.action === 'removePage') {
    removePage(request.bookmarkId).then(() => {
      sendResponse({ success: true });
    });
    return true; // Асинхронный ответ
  } else if (request.action === 'restorePage') {
    // Перемещаем из Completed в Active
    (async () => {
      const ids = await getFolderIds();
      await chrome.bookmarks.move(request.bookmarkId, { parentId: ids.active });
      // Парсим метаданные Completed и создаём метаданные Active
      const bookmark = await chrome.bookmarks.get(request.bookmarkId);
      const parsed = parseCompletedBookmarkTitle(bookmark[0].title);
      // Восстанавливаем с тем же resetType, что был
      const newTitle = `${parsed.title} [${parsed.resetType}]`;
      await chrome.bookmarks.update(request.bookmarkId, { title: newTitle });
      notifyPanelUpdate();
      sendResponse({ success: true });
    })();
    return true; // Асинхронный ответ
  } else if (request.action === 'openNextPage') {
    openNextPageFromPanel();
    sendResponse({ success: true });
  } else if (request.action === 'clearAll') {
    // Удаляем все страницы из Active
    (async () => {
      const pages = await getActivePages();
      for (const page of pages) {
        await removePage(page.id);
      }
      sendResponse({ success: true });
    })();
    return true; // Асинхронный ответ
  } else if (request.action === 'setResetType') {
    // Обновляем resetType в метаданных закладки Active
    (async () => {
      try {
        const bookmark = await chrome.bookmarks.get(request.bookmarkId);
        if (bookmark && bookmark[0]) {
          const parsed = parseActiveBookmarkTitle(bookmark[0].title);
          const newTitle = `${parsed.title} [${request.resetType}]`;
          await chrome.bookmarks.update(request.bookmarkId, { title: newTitle });
          notifyPanelUpdate();
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error setting reset type:', error);
        sendResponse({ success: false });
      }
    })();
    return true; // Асинхронный ответ
  } else if (request.action === 'moveToCompletedWithInterval') {
    // Перемещение в Completed с установкой интервала
    (async () => {
      await movePageToCompleted(request.bookmarkId);
      await setPageInterval(request.bookmarkId, request.intervalHours);
      sendResponse({ success: true });
    })();
    return true; // Асинхронный ответ
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  // Создаем контекстное меню для добавления страниц в панель
  chrome.contextMenus.create({
    id: "addToPanel",
    title: "Add to 00 UTC | Daily Task Tracker",
    contexts: ["page"]
  });
  
  // Отключаем автоматическое открытие панели по клику (обрабатываем вручную)
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error) => console.error(error));
  
  // Создаём или находим папки в закладках
  await initializeBookmarksFolder();
  
  // Запускаем периодическую проверку времени
  await startTimeChecker();
});

// Запускаем проверку времени при старте service worker
chrome.runtime.onStartup.addListener(async () => {
  await initializeBookmarksFolder();
  await startTimeChecker();
});

// Глобальные переменные для хранения ID папок (только ID, не данные)
let FOLDER_IDS = {
  active: null,
  completed: null
};

// Флаг для предотвращения параллельной инициализации
let isInitializing = false;

// Функция инициализации папки закладок (с двумя подпапками)
async function initializeBookmarksFolder() {
  if (isInitializing) return;
  
  isInitializing = true;
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
    }
    
    if (!completedFolder) {
      completedFolder = await chrome.bookmarks.create({
        parentId: dailyPanelFolder.id,
        title: 'Completed'
      });
    }
    
    // Сохраняем ID папок в глобальную переменную
    FOLDER_IDS = {
      active: activeFolder.id,
      completed: completedFolder.id
    };
  } catch (error) {
    console.error('Error initializing bookmarks folder:', error);
  } finally {
    isInitializing = false;
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
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=32`,
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
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=32`,
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
  
  return `${page.title} [${metadata}]`;
}

// Функция добавления параметра daily_panel_task=1 к URL
function addTaskParamToUrl(url) {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('daily_panel_task', '1');
    return urlObj.toString();
  } catch (e) {
    console.error('Cannot add parameter to URL:', url, e);
    return url; // Возвращаем оригинальный URL если не удалось распарсить
  }
}

// Функция добавления страницы в Active
async function addPageToActive(tab) {
  try {
    const ids = await getFolderIds();
    if (!ids.active) {
      console.error('Active folder not found');
      return;
    }
    
    // Нормализуем URL (убираем параметр daily_panel_task если есть)
    let normalizedUrl = tab.url;
    try {
      const url = new URL(tab.url);
      url.searchParams.delete('daily_panel_task');
      normalizedUrl = url.toString();
    } catch (e) {
      // Если URL не парсится, используем как есть
    }
    
    // Проверяем дубликаты в Active
    const activePages = await getActivePages();
    const existsInActive = activePages.some(p => {
      let pageUrl = p.url;
      try {
        const url = new URL(p.url);
        url.searchParams.delete('daily_panel_task');
        pageUrl = url.toString();
      } catch (e) {}
      return pageUrl === normalizedUrl;
    });
    if (existsInActive) return { exists: true, location: 'active' };
    
    // Проверяем дубликаты в Completed
    const completedPages = await getCompletedPages();
    const existsInCompleted = completedPages.some(p => {
      let pageUrl = p.url;
      try {
        const url = new URL(p.url);
        url.searchParams.delete('daily_panel_task');
        pageUrl = url.toString();
      } catch (e) {}
      return pageUrl === normalizedUrl;
    });
    if (existsInCompleted) return { exists: true, location: 'completed' };
    
    // Создаём закладку с метаданными [resetType]
    const titleWithMetadata = `${tab.title} [midnight]`;
    const urlWithParam = addTaskParamToUrl(normalizedUrl);
    
    await chrome.bookmarks.create({
      parentId: ids.active,
      title: titleWithMetadata,
      url: urlWithParam
    });
    
    notifyPanelUpdate();
    return { exists: false, added: true };
  } catch (error) {
    console.error('Error adding page to Active:', error);
    return { exists: false, added: false, error: error.message };
  }
}

// Функция удаления страницы по ID закладки
async function removePage(bookmarkId) {
  try {
    await chrome.bookmarks.remove(bookmarkId);
    notifyPanelUpdate();
  } catch (error) {
    console.error('Error removing bookmark:', error);
  }
}

// Вспомогательная функция уведомления панели об обновлении
function notifyPanelUpdate() {
  // Уведомляем боковую панель
  chrome.runtime.sendMessage({ action: 'pagesUpdated' }).catch(() => {});
  
  // Уведомляем все content scripts (для баннеров)
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'pagesUpdated' }).catch(() => {});
    });
  });
}

// Функция запуска периодической проверки
let fastCheckInterval = null;
let sidePanelConnections = 0;

async function startTimeChecker() {
  // Проверяем сразу при запуске
  await checkAndRestoreOldPages();
  
  // Очищаем старый alarm если есть
  await chrome.alarms.clear('checkPages');
  
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
        await chrome.bookmarks.move(page.id, { parentId: ids.active });
        
        // Создаём метаданные для Active с сохранением resetType
        const newTitle = `${page.title} [${page.resetType}]`;
        const urlWithParam = addTaskParamToUrl(page.url);
        
        await chrome.bookmarks.update(page.id, { 
          title: newTitle,
          url: urlWithParam
        });
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
      // Добавляем страницу и получаем результат
      const result = await addPageToActive(tab);
      
      if (result && result.exists) {
        // Страница уже добавлена
        chrome.tabs.sendMessage(tab.id, { 
          action: 'showAlreadyAddedNotification',
          title: tab.title 
        }).catch(() => {});
      } else {
        // Страница успешно добавлена
        chrome.tabs.sendMessage(tab.id, { 
          action: 'showAddedNotification',
          title: tab.title 
        }).catch(() => {
          // Игнорируем ошибки (страница может не поддерживать content scripts)
        });
      }
    } catch (error) {
      console.error('Error adding page from context menu:', error);
    }
  }
});

// Слушаем закрытие вкладок для автоматического открытия следующей
// Хранилище для отслеживания открытых вкладок из панели
const openedTabs = new Map(); // tabId -> bookmarkId
const intervalDialogTabs = new Set(); // tabId диалога (только для отслеживания)
let isCycleMode = false; // Флаг режима автоматической отработки цикла
let currentWindowId = null; // Сохраняем windowId для открытия панели в конце
let cycleQueue = []; // Очередь страниц для цикла
let currentCycleIndex = 0; // Текущий индекс в очереди

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  // Проверяем, не диалог ли интервала закрылся
  if (intervalDialogTabs.has(tabId)) {
    intervalDialogTabs.delete(tabId);
    
    // Продолжаем цикл - переходим к следующей странице
    if (isCycleMode) {
      currentCycleIndex++;
      setTimeout(() => openNextInCycle(), 100);
    }
    return;
  }
  
  if (!removeInfo.isWindowClosing && openedTabs.has(tabId)) {
    const bookmarkId = openedTabs.get(tabId);
    openedTabs.delete(tabId);
    
    try {
      // Проверяем, что закладка всё ещё существует
      const bookmark = await chrome.bookmarks.get(bookmarkId);
      if (!bookmark || !bookmark[0]) return;
      
      const page = bookmark[0];
      const parsed = parseActiveBookmarkTitle(page.title);
      
      // Удаляем все вкладки с этим bookmarkId из openedTabs (на случай дубликатов)
      for (const [tId, bId] of openedTabs.entries()) {
        if (bId === bookmarkId) {
          openedTabs.delete(tId);
        }
      }
      
      // Если тип = interval, перемещаем в Completed с интервалом по умолчанию и открываем диалог
      if (parsed.resetType === 'interval') {
        // Сразу перемещаем в Completed с интервалом 24 часа
        await movePageToCompleted(bookmarkId);
        await setPageInterval(bookmarkId, 24);
        
        // Получаем favicon
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(page.url).hostname}&sz=32`;
        
        // Открываем диалог для изменения интервала
        const dialogUrl = chrome.runtime.getURL('interval-dialog.html') + 
          `?bookmarkId=${bookmarkId}` +
          `&title=${encodeURIComponent(parsed.title)}` +
          `&url=${encodeURIComponent(page.url)}` +
          `&favicon=${encodeURIComponent(faviconUrl)}` +
          `&interval=24`;
        
        chrome.tabs.create({ url: dialogUrl }, (dialogTab) => {
          if (dialogTab) {
            intervalDialogTabs.add(dialogTab.id);
          }
        });
        // Цикл продолжится когда диалог закроется
        
      } else {
        // Тип midnight - сразу перемещаем в Completed
        await movePageToCompleted(bookmarkId);
        
        // Продолжаем цикл
        if (isCycleMode) {
          currentCycleIndex++;
          setTimeout(() => openNextInCycle(), 100);
        }
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
    console.log('Moving to Completed:', parsed.title, 'resetType from Active:', parsed.resetType);
    
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
    
    console.log('Moved to Completed with title:', newTitle);
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
    notifyPanelUpdate();
  } catch (error) {
    console.error('Error setting interval:', error);
  }
}

// Механизм поддержания активности service worker во время цикла
let keepAliveInterval = null;
let cycleStartTime = null;
const MAX_CYCLE_DURATION = 10 * 60 * 1000; // 10 минут

function startKeepAlive() {
  if (keepAliveInterval) return;
  
  cycleStartTime = Date.now();
  
  // Отправляем сообщение самому себе каждые 20 секунд
  keepAliveInterval = setInterval(() => {
    const elapsed = Date.now() - cycleStartTime;
    
    if (elapsed >= MAX_CYCLE_DURATION) {
      // Прошло 10 минут - останавливаем цикл
      console.log('Cycle timeout: 10 minutes elapsed');
      isCycleMode = false;
      stopKeepAlive();
    } else if (isCycleMode) {
      chrome.runtime.sendMessage({ action: 'keepAlive' }).catch(() => {});
    } else {
      stopKeepAlive();
    }
  }, 20000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    cycleStartTime = null;
  }
}

// Универсальная функция запуска цикла задач
async function startTasksCycle() {
  // Получаем все активные страницы
  const pages = await getActivePages();
  if (pages.length === 0) return;
  
  // Сохраняем очередь страниц и включаем режим цикла
  cycleQueue = pages;
  currentCycleIndex = 0;
  isCycleMode = true;
  
  // Запускаем механизм поддержания активности
  startKeepAlive();
  
  // Открываем первую страницу
  openNextInCycle();
}

// Функция открытия следующей страницы из очереди
function openNextInCycle() {
  if (!isCycleMode) return;
  
  if (currentCycleIndex >= cycleQueue.length) {
    // Все страницы завершены
    isCycleMode = false;
    cycleQueue = [];
    currentCycleIndex = 0;
    
    // Останавливаем механизм поддержания активности
    stopKeepAlive();
    
    // Открываем страницу завершения
    if (currentWindowId) {
      const completedUrl = chrome.runtime.getURL('completed.html');
      chrome.tabs.create({ url: completedUrl, windowId: currentWindowId });
      currentWindowId = null;
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('completed.html') });
    }
    return;
  }
  
  const page = cycleQueue[currentCycleIndex];
  
  // Добавляем параметр в URL
  let taskUrl = page.url;
  try {
    const url = new URL(page.url);
    url.searchParams.set('daily_panel_task', '1');
    taskUrl = url.toString();
    chrome.bookmarks.update(page.id, { url: taskUrl });
  } catch (e) {
    // Ignore URL parse errors
  }
  
  chrome.tabs.create({ url: taskUrl }, (tab) => {
    if (tab) {
      openedTabs.set(tab.id, page.id);
      if (!currentWindowId) {
        currentWindowId = tab.windowId;
      }
    }
  });
}

// Обработчик сообщений от popup, боковой панели и content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openSinglePage') {
    // Открытие ОДНОЙ страницы без запуска цикла
    isCycleMode = false;
    chrome.tabs.create({ url: request.url }, (tab) => {
      if (tab && request.bookmarkId) {
        openedTabs.set(tab.id, request.bookmarkId);
      }
      sendResponse({ success: true });
    });
    return true; // Асинхронный ответ
  } else if (request.action === 'openPage') {
    chrome.tabs.create({ url: request.url }, (tab) => {
      if (tab && request.bookmarkId) {
        openedTabs.set(tab.id, request.bookmarkId);
      }
      sendResponse({ success: true });
    });
    return true;
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
      const urlWithParam = addTaskParamToUrl(bookmark[0].url);
      
      await chrome.bookmarks.update(request.bookmarkId, { 
        title: newTitle,
        url: urlWithParam
      });
      notifyPanelUpdate();
      sendResponse({ success: true });
    })();
    return true; // Асинхронный ответ
  } else if (request.action === 'openNextPage') {
    // Запуск цикла (используется кнопкой "Запустить задачи" в панели)
    startTasksCycle();
    sendResponse({ success: true });
  } else if (request.action === 'continueAfterInterval') {
    // УСТАРЕЛО: цикл продолжается автоматически при закрытии диалога
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
    // УСТАРЕЛО: обратная совместимость, просто обновляем интервал
    (async () => {
      await setPageInterval(request.bookmarkId, request.intervalHours);
      sendResponse({ success: true });
    })();
    return true;
  } else if (request.action === 'restoreAllAndStart') {
    // Восстановить все из Completed в Active и запустить
    (async () => {
      // Отправляем сообщение боковой панели закрыться
      chrome.runtime.sendMessage({ action: 'closeSidePanel' }).catch(() => {});
      
      // Небольшая задержка для закрытия панели
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const completedPages = await getCompletedPages();
      
      if (completedPages.length === 0) {
        sendResponse({ success: false, message: 'No completed pages' });
        return;
      }
      
      // Переносим все страницы из Completed в Active
      for (const page of completedPages) {
        const ids = await getFolderIds();
        await chrome.bookmarks.move(page.id, { parentId: ids.active });
        
        const newTitle = `${page.title} [${page.resetType}]`;
        const urlWithParam = addTaskParamToUrl(page.url);
        
        await chrome.bookmarks.update(page.id, { 
          title: newTitle,
          url: urlWithParam
        });
      }
      
      notifyPanelUpdate();
      
      // Запускаем цикл
      await startTasksCycle();
      
      sendResponse({ success: true });
    })();
    return true;
  } else if (request.action === 'startStealthMode') {
    (async () => {
      chrome.runtime.sendMessage({ action: 'closeSidePanel' }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 100));
      await startTasksCycle();
      sendResponse({ success: true });
    })();
    return true;
  } else if (request.action === 'startDailyTasks') {
    startTasksCycle();
    sendResponse({ success: true });
  } else if (request.action === 'toggleBanner') {
    // Уведомляем все вкладки об изменении настройки баннера
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'bannerSettingChanged', 
          enabled: request.enabled 
        }).catch(() => {
          // Игнорируем ошибки (вкладки без content script)
        });
      });
    });
    sendResponse({ success: true });
  } else if (request.action === 'keepAlive') {
    // Простое подтверждение для поддержания активности
    sendResponse({ success: true });
  } else if (request.action === 'addCurrentTab') {
    // Добавление текущей вкладки в активные задачи
    (async () => {
      try {
        const tab = request.tab;
        if (tab && tab.url && !tab.url.startsWith('chrome://')) {
          const result = await addPageToActive(tab);
          notifyPanelUpdate();
          sendResponse({ 
            success: true, 
            exists: result?.exists || false,
            location: result?.location
          });
        } else {
          sendResponse({ success: false, message: 'Invalid tab' });
        }
      } catch (error) {
        console.error('Error adding current tab:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
});

// Модуль управления циклом задач
import { getFolderIds } from './folderManager.js';
import { getActivePages } from './bookmarkOperations.js';
import { parseActiveBookmarkTitle, parseCompletedBookmarkTitle, createCompletedBookmarkTitle, getFaviconUrl } from '../shared/bookmarkParser.js';
import { notifyPanelUpdate } from '../shared/notifications.js';
import { RESET_TYPES } from '../shared/constants.js';
import { logError, logInfo } from '../shared/errorHandler.js';

// Глобальное состояние цикла
const openedTabs = new Map();
let isCycleMode = false;
let currentWindowId = null;
let cycleQueue = [];
let currentCycleIndex = 0;
let isProcessingNext = false;

// Восстановление состояния из session storage при старте SW
export async function restoreCycleState() {
  const { cycleState } = await chrome.storage.session.get('cycleState');
  if (cycleState) {
    isCycleMode = cycleState.isCycleMode || false;
    currentWindowId = cycleState.currentWindowId || null;
    cycleQueue = cycleState.cycleQueue || [];
    currentCycleIndex = cycleState.currentCycleIndex || 0;
    isProcessingNext = cycleState.isProcessingNext || false;
    
    if (cycleState.openedTabs) {
      Object.entries(cycleState.openedTabs).forEach(([tabId, info]) => {
        openedTabs.set(Number(tabId), info);
      });
    }
  }
}

// Сохранение состояния в session storage
async function saveCycleState() {
  await chrome.storage.session.set({
    cycleState: {
      isCycleMode,
      currentWindowId,
      cycleQueue,
      currentCycleIndex,
      isProcessingNext,
      openedTabs: Object.fromEntries(openedTabs)
    }
  });
}

// Функция перемещения страницы из Active в Completed
export async function movePageToCompleted(bookmarkId) {
  try {
    const ids = await getFolderIds();
    const bookmark = await chrome.bookmarks.get(bookmarkId);
    
    if (!bookmark || !bookmark[0]) {
      logError('movePageToCompleted', `Bookmark not found: ${bookmarkId}`);
      return;
    }
    
    const page = bookmark[0];
    const parsed = parseActiveBookmarkTitle(page.title);
    
    const completedAt = new Date().toISOString();
    const metadata = [
      completedAt,
      '',
      parsed.resetType,
      24,
      page.dateAdded ? new Date(page.dateAdded).toISOString() : new Date().toISOString()
    ].join('|');
    
    const newTitle = `${parsed.title} [${metadata}]`;
    
    await chrome.bookmarks.move(bookmarkId, { parentId: ids.completed });
    await chrome.bookmarks.update(bookmarkId, { title: newTitle });
    
    logInfo('movePageToCompleted', `Moved to completed: ${parsed.title}`);
    notifyPanelUpdate();
  } catch (error) {
    logError('movePageToCompleted', error);
  }
}

// Функция установки интервала для отработанной страницы
export async function setPageInterval(bookmarkId, intervalHours) {
  try {
    const bookmark = await chrome.bookmarks.get(bookmarkId);
    if (!bookmark || !bookmark[0]) return;
    
    const page = bookmark[0];
    const parsed = parseCompletedBookmarkTitle(page.title);
    
    const now = new Date();
    const restoreAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
    
    const metadata = [
      parsed.completedAt || now.toISOString(),
      restoreAt.toISOString(),
      RESET_TYPES.INTERVAL,
      intervalHours,
      parsed.addedAt
    ].join('|');
    
    const newTitle = `${parsed.title} [${metadata}]`;
    
    await chrome.bookmarks.update(bookmarkId, { title: newTitle });
    
    logInfo('setPageInterval', `Set interval ${intervalHours}h for: ${parsed.title}`);
    notifyPanelUpdate();
  } catch (error) {
    logError('setPageInterval', error);
  }
}// Универсальная функция запуска цикла задач
export async function startTasksCycle() {
  const pages = await getActivePages();
  if (pages.length === 0) return;
  
  logInfo('startTasksCycle', `Starting cycle with ${pages.length} tasks`);
  cycleQueue = pages;
  currentCycleIndex = 0;
  isCycleMode = true;
  await saveCycleState();
  
  openNextInCycle();
}

// Функция открытия следующей страницы из очереди
async function openNextInCycle() {
  if (!isCycleMode) return;
  
  if (isProcessingNext) {
    return;
  }
  
  isProcessingNext = true;
  await saveCycleState();
  
  try {
    const currentActivePages = await getActivePages();
    let nextPage = null;
    
    while (currentCycleIndex < cycleQueue.length) {
      const page = cycleQueue[currentCycleIndex];
      
      const stillActive = currentActivePages.some(active => active.id === page.id);
      
      if (stillActive) {
        nextPage = page;
        break;
      } else {
        currentCycleIndex++;
      }
    }
    
    if (!nextPage) {
      isCycleMode = false;
      cycleQueue = [];
      currentCycleIndex = 0;
      isProcessingNext = false;
      await saveCycleState();
      
      if (currentWindowId) {
        const completedUrl = chrome.runtime.getURL('src/pages/completed.html');
        chrome.tabs.create({ url: completedUrl, windowId: currentWindowId });
        currentWindowId = null;
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/completed.html') });
      }
      return;
    }
    
    chrome.tabs.create({ url: nextPage.url }, async (tab) => {
      if (tab) {
        logInfo('openNextInCycle', `Opening task ${currentCycleIndex + 1}/${cycleQueue.length}: ${nextPage.title}`);
        openedTabs.set(tab.id, {
          bookmarkId: nextPage.id,
          fromCycle: true,
          isIntervalDialog: false,
          dialogFromCycle: false
        });
        
        if (!currentWindowId) {
          currentWindowId = tab.windowId;
        }
        
        isProcessingNext = false;
        await saveCycleState();
      }
    });
  } catch (error) {
    logError('openNextInCycle', error);
    isProcessingNext = false;
    await saveCycleState();
  }
}

// Обработчик закрытия вкладок
export async function handleTabRemove(tabId, removeInfo) {
  const tabInfo = openedTabs.get(tabId);
  if (!tabInfo) return;
  
  logInfo('handleTabRemove', `Tab closed: ${tabInfo.fromCycle ? 'from cycle' : 'single page'}`);
  
  if (tabInfo.isIntervalDialog) {
    const storageKey = `intervalDialog_${tabInfo.bookmarkId}`;
    chrome.storage.session.get(storageKey, async (result) => {
      if (result[storageKey]) {
        const { intervalHours } = result[storageKey];
        
        await setPageInterval(tabInfo.bookmarkId, intervalHours);
        notifyPanelUpdate();
        
        chrome.storage.session.remove(storageKey);
      }
    });
    
    openedTabs.delete(tabId);
    await saveCycleState();
    
    if (tabInfo.dialogFromCycle && isCycleMode) {
      currentCycleIndex++;
      await saveCycleState();
      openNextInCycle();
    }
    return;
  }
  
  if (!removeInfo.isWindowClosing) {
    const bookmarkId = tabInfo.bookmarkId;
    const wasFromCycle = tabInfo.fromCycle;
    
    openedTabs.delete(tabId);
    await saveCycleState();
    
    try {
      const bookmark = await chrome.bookmarks.get(bookmarkId);
      if (!bookmark || !bookmark[0]) return;
      
      const page = bookmark[0];
      const parsed = parseActiveBookmarkTitle(page.title);
      
      for (const [tId, info] of openedTabs.entries()) {
        if (info.bookmarkId === bookmarkId) {
          openedTabs.delete(tId);
        }
      }
      
      if (parsed.resetType === RESET_TYPES.INTERVAL) {
        await movePageToCompleted(bookmarkId);
        await setPageInterval(bookmarkId, 24);
        
        const faviconUrl = getFaviconUrl(page.url);
        
        const dialogUrl = chrome.runtime.getURL('src/pages/intervalDialog.html') + 
          `?bookmarkId=${bookmarkId}` +
          `&title=${encodeURIComponent(parsed.title)}` +
          `&url=${encodeURIComponent(page.url)}` +
          `&favicon=${encodeURIComponent(faviconUrl)}` +
          `&interval=24`;
        
        chrome.tabs.create({ url: dialogUrl }, async (dialogTab) => {
          if (dialogTab) {
            openedTabs.set(dialogTab.id, {
              bookmarkId: bookmarkId,
              fromCycle: false,
              isIntervalDialog: true,
              dialogFromCycle: wasFromCycle
            });
            
            await saveCycleState();
          }
        });
        
      } else {
        await movePageToCompleted(bookmarkId);
        
        if (wasFromCycle && isCycleMode) {
          currentCycleIndex++;
          await saveCycleState();
          openNextInCycle();
        }
      }
    } catch (error) {
      logError('handleTabRemove', error);
    }
  }
}

// Открытие одной страницы (не из цикла)
export async function openSinglePage(url, bookmarkId) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url }, async (tab) => {
      if (tab && bookmarkId) {
        openedTabs.set(tab.id, {
          bookmarkId,
          fromCycle: false,
          isIntervalDialog: false,
          dialogFromCycle: false
        });
        await saveCycleState();
      }
      resolve({ success: true });
    });
  });
}

// Получение статуса вкладки
export function getTabStatus(tabId) {
  const tabInfo = openedTabs.get(tabId);
  if (tabInfo) {
    return { 
      isTask: true, 
      fromCycle: tabInfo.fromCycle,
      isIntervalDialog: tabInfo.isIntervalDialog,
      dialogFromCycle: tabInfo.dialogFromCycle
    };
  }
  return { isTask: false, fromCycle: false };
}

// Модуль управления папками закладок

import { logError, logInfo } from '../shared/errorHandler.js';
import { FOLDER_NAME, FOLDER_NAMES } from '../shared/constants.js';

// Функция инициализации папки закладок (с двумя подпапками)
export async function initializeBookmarksFolder() {
  const lockStatus = await chrome.storage.session.get('isInitializing');
  if (lockStatus.isInitializing) {
    return;
  }
  
  await chrome.storage.session.set({ isInitializing: true });
  
  try {
    const bookmarkTreeNodes = await chrome.bookmarks.getTree();
    const rootNode = bookmarkTreeNodes[0];
    
    let dailyPanelFolder = null;
    
    for (const child of rootNode.children) {
      if (child.title === FOLDER_NAME && !child.url) {
        dailyPanelFolder = child;
        break;
      }
      if (child.children) {
        const found = child.children.find(node => node.title === FOLDER_NAME && !node.url);
        if (found) {
          dailyPanelFolder = found;
          break;
        }
      }
    }
    
    if (!dailyPanelFolder) {
      const otherBookmarks = rootNode.children.find(node => node.id === '2');
      const parentId = otherBookmarks ? otherBookmarks.id : rootNode.id;
      
      dailyPanelFolder = await chrome.bookmarks.create({
        parentId: parentId,
        title: FOLDER_NAME
      });
    }
    
    const dailyPanelChildren = await chrome.bookmarks.getChildren(dailyPanelFolder.id);
    
    let activeFolder = dailyPanelChildren.find(node => node.title === FOLDER_NAMES.ACTIVE && !node.url);
    let completedFolder = dailyPanelChildren.find(node => node.title === FOLDER_NAMES.COMPLETED && !node.url);
    
    if (!activeFolder) {
      activeFolder = await chrome.bookmarks.create({
        parentId: dailyPanelFolder.id,
        title: FOLDER_NAMES.ACTIVE
      });
    }
    
    if (!completedFolder) {
      completedFolder = await chrome.bookmarks.create({
        parentId: dailyPanelFolder.id,
        title: FOLDER_NAMES.COMPLETED
      });
    }
    
    const folderIds = {
      active: activeFolder.id,
      completed: completedFolder.id
    };
    
    await chrome.storage.session.set({ FOLDER_IDS: folderIds });
    logInfo('initializeBookmarksFolder', `Folders initialized: Active=${activeFolder.id}, Completed=${completedFolder.id}`);
    
  } catch (error) {
    logError('initializeBookmarksFolder', error);
  } finally {
    await chrome.storage.session.set({ isInitializing: false });
  }
}

// Функция получения ID папок (с инициализацией если нужно)
export async function getFolderIds() {
  const cached = await chrome.storage.session.get('FOLDER_IDS');
  
  if (cached.FOLDER_IDS && cached.FOLDER_IDS.active && cached.FOLDER_IDS.completed) {
    try {
      await chrome.bookmarks.get(cached.FOLDER_IDS.active);
      await chrome.bookmarks.get(cached.FOLDER_IDS.completed);
      return cached.FOLDER_IDS;
    } catch (error) {
      await chrome.storage.session.remove('FOLDER_IDS');
    }
  }
  
  await initializeBookmarksFolder();
  
  const result = await chrome.storage.session.get('FOLDER_IDS');
  return result.FOLDER_IDS || { active: null, completed: null };
}

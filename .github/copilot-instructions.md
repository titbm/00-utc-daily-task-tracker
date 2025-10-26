# Daily Panel - Chrome Extension for Task Tracking

## Architecture Overview

This is a **Chrome Manifest V3 extension** that tracks daily internet tasks using bookmarks as the data store. The extension uses a **modular ES6 architecture** with 8 separate modules for maintainability.

### Layers

1. **Background Service Worker** (`background.js` + 8 modules) - Core business logic, bookmark management, alarm-based time checks
2. **User Interfaces** - Popup (`popup.html/js`), Side Panel (`sidepanel.html/js`), Pages (`pages/*.html/js`)
3. **Content Scripts** (`src/content/content.js`) - In-page notifications and banners

### Modular Structure (Refactored v1.0.3)

```
background.js (80 lines)           # Coordinator, entry point
src/
  shared/                          # Shared utilities
    ├─ notifications.js            # notifyPanelUpdate()
    ├─ bookmarkParser.js           # Parse/create metadata
    ├─ dateUtils.js                # Date/time helpers
    └─ constants.js                # App constants
  
  background/                      # Service worker modules
    ├─ folderManager.js            # Bookmark folder management
    ├─ bookmarkOperations.js       # CRUD operations (getActivePages, etc.)
    ├─ scheduler.js                # Alarm + checkAndRestoreOldPages
    ├─ cycle.js                    # Task cycle state & logic
    └─ messageHandler.js           # chrome.runtime.onMessage routing
  
  sidepanel/                       # Side Panel API (Chrome UI)
    └─ sidepanel.html/js           # Main side panel interface
  
  pages/                           # Full-page tabs
    ├─ completed.html/js           # Success page (tab)
    └─ intervalDialog.html/js      # Interval selection (tab)
  
  popup/                           # Browser action popup
    └─ popup.html/js               # Extension icon popup

styles/                            # External CSS files
  ├─ sidepanel.css                 # Side panel styles
  ├─ popup.css                     # Popup styles
  ├─ intervalDialog.css            # Interval dialog styles
  └─ completed.css                 # Completed page styles
```

**Key Benefits:**
- ✅ **91.7% reduction** in main file (967 → 80 lines)
- ✅ **Single Responsibility** - each module has one job
- ✅ **ES6 imports** - modern module system
- ✅ **Testability** - modules can be tested independently
- ✅ **Logical separation** - Side Panel API vs. full-page tabs in separate folders
- ✅ **CSS organization** - external stylesheets for all UI components

### Critical Data Flow: Bookmark-Based State Management

**All task data lives in Chrome bookmarks** under `Bookmarks Bar > Daily Panel`:
- `Daily Panel/Active/` - Tasks to complete, titled: `"PageTitle [resetType]"` where `resetType` = `midnight` | `interval`
- `Daily Panel/Completed/` - Finished tasks, titled: `"PageTitle [completedAt|restoreAt|resetType|resetInterval|addedAt]"`

**Tab Tracking**: Active tasks are tracked via `openedTabs` Map in `src/background/cycle.js`. When a task tab is opened (from cycle or panel), its tabId is stored with metadata (`fromCycle`, `isIntervalDialog`, `dialogFromCycle`). Content scripts query this via `getMyTabStatus` message to determine whether to show cycle indicator.

**Metadata Parsing**: All bookmark title parsing happens in `src/shared/bookmarkParser.js`:
- `parseActiveBookmarkTitle(title)` → `{ title, resetType }`
- `parseCompletedBookmarkTitle(title)` → `{ title, completedAt, restoreAt, resetType, resetInterval, addedAt }`
- `createCompletedBookmarkTitle(data)` → formatted title string

### Task Lifecycle (The "Cycle")

1. User adds page via context menu or popup → `addPageToActive()` in `bookmarkOperations.js` creates bookmark in `Active/` with `[midnight]` metadata
2. "Start" button triggers `startTasksCycle()` in `cycle.js` → Opens tabs sequentially from `cycleQueue`
3. User closes tab → `handleTabRemove()` in `cycle.js` fires:
   - If `resetType=midnight`: Calls `movePageToCompleted()`, marks completion timestamp
   - If `resetType=interval`: Opens `interval-dialog.html` to collect interval (hours/minutes)
4. Background alarm in `scheduler.js` (`checkAndRestoreOldPages`) runs every minute:
   - For `midnight` tasks: Restores if `completedAt < today's 00:00 UTC`
   - For `interval` tasks: Restores if `now >= restoreAt` timestamp

### Cycle Persistence

Cycle runs indefinitely without time limits. State is persisted to `chrome.storage.session` via `saveCycleState()` in `cycle.js`:
- `isCycleMode`: Whether cycle is currently running
- `currentWindowId`: Window where cycle tabs open
- `cycleQueue`: Array of bookmarkIds to process
- `currentCycleIndex`: Current position in queue
- `openedTabs`: Map of tabId → {bookmarkId, fromCycle, isIntervalDialog, dialogFromCycle}

On service worker restart, state is restored via `restoreCycleState()`. No keep-alive mechanism needed - cycle continues naturally as user closes tabs.

## Key Development Patterns

### 1. ES6 Module System (CRITICAL)
All background modules use ES6 import/export with `"type": "module"` in manifest.json:
```javascript
// Importing
import { getActivePages } from './src/background/bookmarkOperations.js';
import { startTasksCycle } from './src/background/cycle.js';

// Exporting
export async function myFunction() { ... }
export const MY_CONSTANT = 42;
```

**Module Locations:**
- `src/shared/` - Reusable utilities (debug, notifications, bookmarkParser, dateUtils, constants)
- `src/background/` - Service worker logic (folderManager, bookmarkOperations, scheduler, cycle, messageHandler)

### 2. Asynchronous Message Handlers (CRITICAL)
### 2. Asynchronous Message Handlers (CRITICAL)
Always return `true` from `chrome.runtime.onMessage` listeners for async responses:
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getActivePages') {
    getActivePages().then(pages => sendResponse({ pages }));
    return true; // REQUIRED for async sendResponse
  }
});
```
All message routing is in `src/background/messageHandler.js` with `initMessageHandler()` function.

### 3. Metadata Encoding in Bookmark Titles
### 3. Metadata Encoding in Bookmark Titles
Parse/create metadata using these helper functions:
- Active: `parseActiveBookmarkTitle()` / `${title} [${resetType}]`
- Completed: `parseCompletedBookmarkTitle()` / `createCompletedBookmarkTitle()` (pipe-separated: `completedAt|restoreAt|resetType|resetInterval|addedAt`)

All in `src/shared/bookmarkParser.js`.

### 4. UI Rendering Optimization (sidepanel.js)
### 4. UI Rendering Optimization (sidepanel.js)
Cache pages to prevent unnecessary re-renders:
```javascript
_cachedActivePages = null;
_arePagesEqual(pages1, pages2) // Deep comparison via JSON.stringify
```
Only call `renderPages()` if data changed.

### 5. RoughNotation Integration
Used for hand-drawn UI annotations (underlines, brackets, strikethroughs):
- Load via `<script src="rough-notation.iife.js"></script>`
- Check availability: `if (typeof RoughNotation !== 'undefined')`
- See `sidepanel.js:initTabHighlighter()` for underline example
- See `interval-dialog.js` for bracket/crossed-off examples

## Testing & Debugging

### Load Extension
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → Select `Daily panel` folder
4. **Reload after changes**: Click reload icon next to extension

### Debug Each Component
- **Background script**: `chrome://extensions/` → Click "service worker" link → Opens DevTools
- **Popup**: Right-click extension icon → Inspect popup
- **Side panel**: Open side panel → Right-click → Inspect
- **Content script**: Open any page → F12 → Check for banner elements

### Common Issues
- **Service worker inactive**: Check `chrome://serviceworker-internals/` for crashes
- **Bookmark sync delays**: Call `notifyPanelUpdate()` after bookmark operations to force UI refresh
- **Content script not injecting**: Verify `manifest.json` has `"matches": ["<all_urls>"]` and page allows scripts

## File Responsibilities

- `background.js` (80 lines): Coordinator, entry point - imports modules and initializes listeners
- `src/background/folderManager.js` (103 lines): Bookmark folder initialization and management
- `src/background/bookmarkOperations.js` (107 lines): CRUD operations - getActivePages, getCompletedPages, addPageToActive, removePage
- `src/background/scheduler.js` (59 lines): Time-based restoration with alarms - checkAndRestoreOldPages
- `src/background/cycle.js` (302 lines): Task cycle management - state, movePageToCompleted, startTasksCycle, handleTabRemove
- `src/background/messageHandler.js` (192 lines): All runtime.onMessage routing (20+ actions)
- `src/shared/bookmarkParser.js` (68 lines): Metadata parsing for Active/Completed bookmarks
- `src/shared/notifications.js` (12 lines): Panel update notifications
- `src/sidepanel/sidepanel.js` (688 lines): Main UI controller with class-based architecture (`DailyPanel`), active/completed section toggling
- `src/popup/popup.js` (150 lines): Browser action popup with counters, "Start" vs "Repeat All" button logic based on active task count
- `src/content/content.js` (304 lines): Injects "Daily tasks are not completed" banner, checks `bannerEnabled` storage setting
- `src/pages/intervalDialog.html/js`: Modal for setting custom restore intervals (hours/minutes), uses quick-select buttons (1h, 3h, 6h, 12h)
- `src/pages/completed.html/js`: Success page shown after all tasks completed, offers "Go to Completed" panel view
- `src/sidepanel/completed.html/js`: Success page shown after all tasks completed, offers "Go to Completed" panel view

## Extension Permissions & APIs Used

- `sidePanel`: Custom side panel UI
- `bookmarks`: Primary data storage (no external DB)
- `alarms`: Background time checks without service worker timeout
- `storage`: Settings persistence (`bannerEnabled`)
- `tabs`: Tab creation/closure detection, message passing
- `contextMenus`: Right-click "Add to Daily Panel"
- `host_permissions: ["<all_urls>"]`: Required for content script injection

## Conventions

- **ES6 Modules**: All background scripts use import/export with `"type": "module"` in manifest.json
- **No external build system**: Pure HTML/CSS/JS, load directly in Chrome
- **No package.json**: All dependencies (RoughNotation) bundled as `.iife.js`
- **UI fonts**: Google Fonts via CDN (`Inter`, `Outfit`, Material Symbols)
- **Time handling**: Always UTC (`Date.UTC()`, `toISOString()`)
- **Error handling**: Extensive `.catch(() => {})` on cross-context messages (tab may be closed)
- **ID storage**: Use `FOLDER_IDS` cache in `folderManager.js` session storage to avoid repeated bookmark tree traversals

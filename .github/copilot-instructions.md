# Daily Panel - Chrome Extension for Task Tracking

## Architecture Overview

This is a **Chrome Manifest V3 extension** that tracks daily internet tasks using bookmarks as the data store. The extension operates across three layers:

1. **Background Service Worker** (`background.js`) - Core business logic, bookmark management, alarm-based time checks
2. **User Interfaces** - Popup (`popup.html/js`), Side Panel (`sidepanel.html/js/css`)  
3. **Content Scripts** (`content-banner.js`) - In-page notifications and banners injected via `rough-notation.iife.js`

### Critical Data Flow: Bookmark-Based State Management

**All task data lives in Chrome bookmarks** under `Bookmarks Bar > Daily Panel`:
- `Daily Panel/Active/` - Tasks to complete, titled: `"PageTitle [resetType]"` where `resetType` = `midnight` | `interval`
- `Daily Panel/Completed/` - Finished tasks, titled: `"PageTitle [completedAt|restoreAt|resetType|resetInterval|addedAt]"`

**Tab Tracking**: Active tasks are tracked via `openedTabs` Map in session storage. When a task tab is opened (from cycle or panel), its tabId is stored with metadata (`fromCycle`, `isIntervalDialog`, `dialogFromCycle`). Content scripts query this via `getMyTabStatus` message to determine whether to show cycle indicator.

### Task Lifecycle (The "Cycle")

1. User adds page via context menu or popup → Creates bookmark in `Active/` with `[midnight]` metadata
2. "Start" button triggers `startTasksCycle()` → Opens tabs sequentially from `cycleQueue`
3. User closes tab → `chrome.tabs.onRemoved` fires:
   - If `resetType=midnight`: Moves to `Completed/` folder, marks completion timestamp
   - If `resetType=interval`: Opens `interval-dialog.html` to collect interval (hours/minutes)
4. Background alarm (`checkAndRestoreOldPages`) runs every minute:
   - For `midnight` tasks: Restores if `completedAt < today's 00:00 UTC`
   - For `interval` tasks: Restores if `now >= restoreAt` timestamp

### Cycle Persistence

Cycle runs indefinitely without time limits. State is persisted to `chrome.storage.session`:
- `isCycleMode`: Whether cycle is currently running
- `currentWindowId`: Window where cycle tabs open
- `cycleQueue`: Array of bookmarkIds to process
- `currentCycleIndex`: Current position in queue
- `openedTabs`: Map of tabId → {bookmarkId, fromCycle, isIntervalDialog, dialogFromCycle}

On service worker restart, state is restored from session storage. No keep-alive mechanism needed - cycle continues naturally as user closes tabs.

## Key Development Patterns

### 1. Asynchronous Message Handlers (CRITICAL)
Always return `true` from `chrome.runtime.onMessage` listeners for async responses:
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getActivePages') {
    getActivePages().then(pages => sendResponse({ pages }));
    return true; // REQUIRED for async sendResponse
  }
});
```

### 2. Metadata Encoding in Bookmark Titles
Parse/create metadata using these helper functions:
- Active: `parseActiveBookmarkTitle()` / `${title} [${resetType}]`
- Completed: `parseCompletedBookmarkTitle()` / `createCompletedBookmarkTitle()` (pipe-separated: `completedAt|restoreAt|resetType|resetInterval|addedAt`)

### 3. UI Rendering Optimization (sidepanel.js)
Cache pages to prevent unnecessary re-renders:
```javascript
_cachedActivePages = null;
_arePagesEqual(pages1, pages2) // Deep comparison via JSON.stringify
```
Only call `renderPages()` if data changed.

### 4. RoughNotation Integration
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

- `background.js` (891 lines): Bookmark CRUD, alarm scheduling, tab lifecycle management, message routing
- `sidepanel.js` (688 lines): Main UI controller with class-based architecture (`DailyPanel`), active/completed section toggling
- `popup.js` (150 lines): Browser action popup with counters, "Start" vs "Repeat All" button logic based on active task count
- `content-banner.js` (304 lines): Injects "Daily tasks are not completed" banner, checks `bannerEnabled` storage setting
- `interval-dialog.html/js`: Modal for setting custom restore intervals (hours/minutes), uses quick-select buttons (1h, 3h, 6h, 12h)
- `completed.html/js`: Success page shown after all tasks completed, offers "Go to Completed" panel view

## Extension Permissions & APIs Used

- `sidePanel`: Custom side panel UI
- `bookmarks`: Primary data storage (no external DB)
- `alarms`: Background time checks without service worker timeout
- `storage`: Settings persistence (`bannerEnabled`)
- `tabs`: Tab creation/closure detection, message passing
- `contextMenus`: Right-click "Add to Daily Panel"
- `host_permissions: ["<all_urls>"]`: Required for content script injection

## Conventions

- **No external build system**: Pure HTML/CSS/JS, load directly in Chrome
- **No package.json**: All dependencies (RoughNotation) bundled as `.iife.js`
- **UI fonts**: Google Fonts via CDN (`Inter`, `Outfit`, Material Symbols)
- **Time handling**: Always UTC (`Date.UTC()`, `toISOString()`)
- **Error handling**: Extensive `.catch(() => {})` on cross-context messages (tab may be closed)
- **ID storage**: Use `FOLDER_IDS` cache in background.js to avoid repeated bookmark tree traversals

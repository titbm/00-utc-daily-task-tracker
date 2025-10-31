![00 UTC Chrome Webstore Screenshots](./public/00%20UTC%20Chrome%20Webstore%20Screenshots.png)

# 00 UTC | Daily Task Tracker

A Chrome extension for tracking and managing your daily internet tasks with automatic restoration at midnight UTC.

## Features

✅ **Bookmark-Based Storage** - All tasks stored in Chrome bookmarks, no external database  
⏰ **Automatic Restoration** - Tasks reset daily at 00:00 UTC or custom intervals  
🎯 **Quick Add** - Right-click context menu or popup button  
📋 **Side Panel UI** - Dedicated panel for managing active and completed tasks  
🔄 **Task Cycles** - Open all tasks sequentially with one click  
⚡ **Persistent Cycles** - Keep-alive mechanism prevents interruption during active cycles  
🎨 **Beautiful Animations** - Hand-drawn highlight effects using RoughNotation-inspired code  
🌐 **Smart Banners** - Reminder banner on web pages when you have pending tasks  
💾 **Import/Export** - Backup and restore tasks via JSON files with automatic duplicate detection

## Installation

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select the project folder

## Usage

### Adding Tasks
- **Right-click** on any webpage → "Add to 00 UTC"
- Click extension icon → **"Add current page"** button
- Tasks are added to the "Active" section

### Completing Tasks
1. Click **"Start"** button to begin task cycle
2. Each task opens in a new tab
3. **Close the tab** when finished
4. For **midnight tasks**: automatically restored next day at 00:00 UTC
5. For **interval tasks**: choose custom restoration time or switch to midnight reset
   - Select interval (hours/minutes) and click **"Confirm"**
   - Or click **"Reset at 00:00 UTC"** to switch to midnight reset

### Managing Tasks
- Open **Side Panel** (click extension icon, then "Go to Side Panel")
- View **Active** and **Completed** tasks
- **Delete** tasks you no longer need
- **Restore** completed tasks manually
- **Export** all tasks to JSON file for backup
- **Import** tasks from JSON file (duplicates by URL are automatically skipped)

## Architecture

### Technology Stack
- **Manifest V3** service worker with ES6 modules
- **Service Worker Keep-Alive** - Official Chrome solution (`setInterval`) prevents sleep during cycles
- **Modular Architecture** - 8 separate modules for maintainability
- **chrome.storage.session** for persistent state across service worker restarts
- **Bookmarks API** as primary data storage (no external database)
- **Content scripts** for in-page notifications (http/https only)
- **Alarms API** for scheduled task restoration

### Code Structure (Refactored)

```
00-utc-daily-task-tracker/
├── background.js (80 lines)           # Service worker coordinator
├── src/
│   ├── shared/                        # Shared utilities
│   │   ├── notifications.js           # Panel update notifications
│   │   ├── bookmarkParser.js          # Metadata parsing/creation
│   │   ├── errorHandler.js            # Centralized error logging
│   │   └── constants.js               # App constants
│   ├── background/                    # Service worker modules
│   │   ├── folderManager.js           # Bookmark folder management
│   │   ├── bookmarkOperations.js      # CRUD operations
│   │   ├── scheduler.js               # Time-based restoration
│   │   ├── cycle.js                   # Task cycle management
│   │   └── messageHandler.js          # Runtime message routing
│   ├── sidepanel/                     # Side panel UI (Chrome Side Panel API)
│   │   └── sidepanel.html/js
│   ├── pages/                         # Full-page tabs
│   │   ├── intervalDialog.html/js     # Interval selection dialog
│   │   └── completed.html/js          # Success page
│   ├── popup/                         # Browser action popup
│   │   └── popup.html/js
│   └── content/                       # Content scripts
│       └── content.js
├── styles/                            # External CSS files
│   ├── sidepanel.css                  # Side panel styles
│   ├── popup.css                      # Popup styles
│   ├── intervalDialog.css             # Interval dialog styles
│   └── completed.css                  # Completed page styles
├── manifest.json                      # Extension configuration
└── assets/                            # Icons and resources
```

### Modular Design Benefits
- ✅ **91.7% reduction** in main file size (967 → 80 lines)
- ✅ **Separation of concerns** - each module has single responsibility
- ✅ **Easier testing** - modules can be tested independently
- ✅ **Better maintainability** - changes are isolated to specific modules
- ✅ **Code reusability** - shared utilities in `src/shared/`
- ✅ **CSS organization** - external stylesheets for all UI components

## Privacy

This extension:
- ❌ Does **NOT** collect any personal data
- ❌ Does **NOT** send data to external servers
- ✅ Stores everything locally in Chrome bookmarks and storage
- ✅ Only loads fonts and favicons from Google CDN

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for details.

## Development

### Prerequisites
- Chrome/Chromium browser (version 116+)
- Basic knowledge of Chrome Extension APIs
- ES6 JavaScript modules understanding

### Local Development
1. Clone the repository
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → select project folder
5. Make changes → click Reload button on extension card

### Module System
All background scripts use **ES6 import/export**:
```javascript
// Import from modules
import { getActivePages } from './src/background/bookmarkOperations.js';
import { startTasksCycle } from './src/background/cycle.js';

// Export from modules
export async function myFunction() { ... }
```

**Important:** Manifest V3 requires `"type": "module"` in manifest.json background configuration.

### Debugging
- **Service Worker:** chrome://extensions → click "service worker" link
- **Side Panel:** Open panel → right-click → Inspect
- **Popup:** Right-click extension icon → Inspect popup
- **Content Script:** Open webpage → F12 → check Console for banners

## Changelog

### Version 1.0.9 (2025-10-31)
- 🔧 **Fixed Midnight Task Timers in Side Panel** - Real-time countdown for midnight tasks
  - Added timer calculation for `midnight` type tasks in `pageRenderer.js`
  - Timers now show time until next 00:00 UTC for tasks completed today
  - Tasks completed before today show immediate restoration
  - Unified timer system: both `interval` and `midnight` tasks tracked in real-time
  - Side panel now triggers restoration for midnight tasks exactly at 00:00 UTC
  - No more reliance on background alarms for midnight tasks when panel is open

### Version 1.0.8 (2025-10-31)
- ⚡ **Smart Task Reset** - New "Check tasks" feature for selective task restoration
  - Automatically identifies tasks restoring within 24 hours
  - Resets only near-expiring tasks (midnight tasks completed today + interval tasks < 24h)
  - Immediately starts task cycle after reset
  - New `resetTasksWithin24Hours()` function in `cycle.js`
- 🎨 **Redesigned Popup Buttons** - Check/Reset split-button replaces "Repeat All"
  - "Check tasks" (80% width) - Black button with checkmark icon, resets and starts cycle
  - "Reset" (20% width) - White button with refresh icon, resets all tasks without cycle
  - Buttons shown only when no active tasks exist
  - Professional 80/20 width split matching Import/Export design
- 💡 **Enhanced Tooltips** - Helpful descriptions on all popup buttons
  - "Reset tasks restoring within 24h and start cycle"
  - "Reset all completed tasks to active"
  - "Start task cycle", "Add current page to active tasks"
  - "Open side panel with all tasks"
  - "Import/Export tasks from/to JSON file"
- 🔧 **New Action Constant** - `RESET_TASKS_WITHIN_24H` added to constants.js
- 📋 **Smart Algorithm** - Precise detection logic:
  - Midnight tasks: Checks if `completedAt >= today's 00:00 UTC`
  - Interval tasks: Checks if `restoreAt <= now + 24 hours`
  - Automatically updates scheduler after reset

### Version 1.0.7 (2025-10-31)
- 🎯 **Action Buttons in Notification Banner** - Two interactive buttons added to task notification
  - "Start tomorrow" button - Immediately moves task to Completed (restores at 00:00 UTC)
  - "Start after time" button - Opens interval dialog to set custom restoration time
  - Automatically changes task type from `midnight` to `interval` when needed
  - Auto-hide timer (3 seconds) pauses on hover for better UX
- 🔧 **New Message Handler** - Added `setupInterval` action for interval workflow
  - Handles complete flow: type change → move to completed → open dialog
  - Proper tab registration via `registerIntervalDialog()` function
  - Ensures interval metadata is saved correctly on dialog close
- 🎨 **New Icons** - Added `bedtime.svg` and `schedule.svg` for action buttons
  - 15px icons matching popup.css button styles
  - Declared in `web_accessible_resources` for content script access
- 📝 **Branding Update** - Renamed "Daily Panel" to "Extension" throughout codebase
  - Updated all IDs and classes with `extension-*` prefix
  - Changed notification texts and console logs
  - Updated context menu text to "Add to Extension"
  - Export file renamed to `extension-tasks-YYYYMMDD.json`

### Version 1.0.6 (2025-10-28)
- 💾 **Import/Export System** - Full backup and restore functionality
  - Export all tasks to JSON file (`00-UTC-tasks-YYYYMMDD.json`)
  - Import tasks from JSON with validation
  - Smart duplicate detection across both Active and Completed folders
  - Prevents duplicates within same import file
  - Shows import summary (imported/skipped counts)
- 🎨 **Split-Button UI** - Professional import/export interface in popup
  - Two-part button with separate Import/Export actions
  - Custom styles with hover effects and animations
  - Press animation for all buttons (scale + color feedback)
- 🔒 **Enhanced Data Integrity** - URL-based uniqueness enforcement
  - No duplicate URLs allowed across entire system
  - Combined Set for fast duplicate checking
  - Maintains data consistency during import
- 📦 **New Permission** - Added `downloads` for file export functionality
- 📝 **Documentation Updates** - README and copilot-instructions updated with import/export details

### Version 1.0.5 (2025-10-28)
- ⚡ **Service Worker Keep-Alive** - Implemented official Chrome solution to prevent service worker sleep during active cycles
  - Uses `setInterval(chrome.runtime.getPlatformInfo, 25000)` per official Google documentation
  - Automatic 30-minute timeout to prevent resource leaks
  - Graceful cleanup on cycle completion or browser events
- 🔄 **Enhanced Cycle Management** - Fixed interruptions when opening tasks from both panel and cycle
  - Concurrent task handling - panel and cycle can work with same task simultaneously
  - Skip already completed tasks during cycle iteration
  - Robust error handling for missing bookmarks (interval dialog edge cases)
  - Preserve panel tabs after cycle ends
- 🛡️ **Crash Recovery** - Service worker restart detection with automatic cleanup
  - Sends `cycleEnded` message to all tabs on crash/restart
  - Clears stale cycle state from session storage
  - Prevents ghost indicators and zombie state
- 📊 **Detailed Logging** - Added comprehensive debug logs for cycle operations
  - Track bookmark IDs, cycle state, parent folder changes
  - Easier troubleshooting and maintenance

### Version 1.0.4 (2025-10-26)
- ✨ **New Feature**: "Reset at 00:00 UTC" button in interval dialog
  - Allows switching interval tasks to midnight reset type after completion
  - Storage-driven architecture - resetType determines processing
- 🔧 **Code Refactoring**: Unified `updateCompletedPage()` function
  - Replaced `setPageInterval()` and `switchPageToMidnight()` with single universal function
  - Handles both 'midnight' and 'interval' reset types
  - Eliminated code duplication and improved maintainability
- 🐛 **Bug Fix**: Removed duplicate bookmark update call
  - Fixed race condition when closing interval dialog
  - Single update path ensures data consistency

### Version 1.0.3 (2025-10-26)
- 🗂️ **Reorganized folder structure** - Moved `completed.html/js` and `intervalDialog.html/js` from `src/sidepanel/` to `src/pages/`
- 📁 **Logical separation** - Side Panel API files vs. full-page tabs now in separate folders
- 🎨 **CSS extraction** - Moved all inline styles to external CSS files in `styles/` folder

### Version 1.0.2 (2025-10-26)
- 🔧 **Modular refactoring** - Split background.js into 8 ES6 modules
- 📦 **Better organization** - Separated shared utilities and business logic
- ✅ **No functionality changes** - All features work as before

### Version 1.0.1 (2025-10-26)
- 🐛 Chrome extension reload compatibility fix

### Version 1.0.0 (2025-01-25)
- 🎉 Initial release
- ✅ Bookmark-based task storage
- ✅ Midnight UTC and interval restoration
- ✅ Side panel interface
- ✅ Content script optimization (16KB, -15% vs previous)
- ✅ Service worker persistence with chrome.storage.session

## License

MIT License - see [LICENSE](LICENSE) file for details

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

- 🐛 **Bug reports**: [GitHub Issues](https://github.com/yourusername/daily-task-tracker/issues)
- 💡 **Feature requests**: [GitHub Discussions](https://github.com/yourusername/daily-task-tracker/discussions)
- 📧 **Email**: your.email@example.com

## Credits

- Icons: Material Symbols
- Fonts: Google Fonts (Outfit, Inter)
- Inspiration: RoughNotation library (for highlight animation)

---

## Third-party licenses

- **Google Fonts (Inter, Outfit, Material Symbols)** — [SIL Open Font License (OFL)](https://scripts.sil.org/OFL)
- **Material Symbols icons by Google** — [Apache License 2.0](https://github.com/google/material-design-icons/blob/master/LICENSE)
- **RoughNotation** — [MIT License](https://github.com/rough-stuff/rough-notation)

---

Made with ❤️ for productivity enthusiasts

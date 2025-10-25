# 00 UTC | Daily Task Tracker

A Chrome extension for tracking and managing your daily internet tasks with automatic restoration at midnight UTC.

## Features

✅ **Bookmark-Based Storage** - All tasks stored in Chrome bookmarks, no external database  
⏰ **Automatic Restoration** - Tasks reset daily at 00:00 UTC or custom intervals  
🎯 **Quick Add** - Right-click context menu or popup button  
📋 **Side Panel UI** - Dedicated panel for managing active and completed tasks  
🔄 **Task Cycles** - Open all tasks sequentially with one click  
🎨 **Beautiful Animations** - Hand-drawn highlight effects using RoughNotation-inspired code  
🌐 **Smart Banners** - Reminder banner on web pages when you have pending tasks

## Installation

### From Chrome Web Store
[Install from Chrome Web Store](#) *(link pending publication)*

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select the `Daily panel` folder

## Usage

### Adding Tasks
- **Right-click** on any webpage → "Add to Daily Panel"
- Click extension icon → **"Add current page"** button
- Tasks are added to the "Active" section

### Completing Tasks
1. Click **"Start"** button to begin task cycle
2. Each task opens in a new tab
3. **Close the tab** when finished
4. For midnight tasks: automatically restored next day at 00:00 UTC
5. For interval tasks: choose custom restoration time (1-24 hours)

### Managing Tasks
- Open **Side Panel** (click extension icon, then "Go to Side Panel")
- View **Active** and **Completed** tasks
- **Delete** tasks you no longer need
- **Restore** completed tasks manually

## Architecture

- **Manifest V3** service worker architecture
- **chrome.storage.session** for persistent state across service worker restarts
- **Bookmarks API** as primary data storage
- **Content scripts** for in-page notifications (http/https only)
- **Alarms API** for scheduled task restoration

## Privacy

This extension:
- ❌ Does **NOT** collect any personal data
- ❌ Does **NOT** send data to external servers
- ✅ Stores everything locally in Chrome bookmarks and storage
- ✅ Only loads fonts and favicons from Google CDN

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for details.

## Development

### File Structure
```
Daily panel/
├── background.js          # Service worker, core logic
├── sidepanel.html/js/css  # Side panel UI
├── popup.html/js          # Browser action popup
├── content-banner.js      # In-page notifications
├── interval-dialog.html/js # Interval selection dialog
├── completed.html/js      # Success page
├── manifest.json          # Extension configuration
└── icons/                 # Extension icons
```

### Key Technologies
- Vanilla JavaScript (no frameworks)
- Chrome Extension APIs (Manifest V3)
- Google Fonts (Outfit, Inter)
- Custom RoughNotation highlight animation

## Changelog

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

Made with ❤️ for productivity enthusiasts

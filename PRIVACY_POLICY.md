# Privacy Policy for 00 UTC | Daily Task Tracker

**Last Updated: October 31, 2025**

## Overview
00 UTC | Daily Task Tracker ("the Extension") is committed to protecting your privacy. This extension does not collect, store, or transmit any personal data to external servers.

## Data Collection
**We do NOT collect any data.** The Extension operates entirely on your local device.

## Data Storage
All data is stored locally in your browser:

- **Bookmarks**: Your daily tasks are stored as Chrome bookmarks in a dedicated folder "00 UTC | Daily Task Tracker" in "Other Bookmarks"
- **Local Storage**: Extension settings (e.g., banner visibility preferences) are stored in Chrome's `chrome.storage.local`
- **Session Storage**: Temporary cache for folder IDs is stored in `chrome.storage.session` and cleared when you close Chrome

## Permissions Justification

The Extension requires the following permissions:

- **bookmarks**: To create, read, update, and delete task bookmarks in your local storage
- **storage**: To save your extension settings and preferences locally in Chrome
- **alarms**: To schedule automatic task restoration at midnight UTC or after custom intervals
- **tabs**: To open tasks in new tabs during cycles and detect when you close them to mark as completed
- **contextMenus**: To add "Add to 00 UTC" option in right-click menu for quick task addition
- **sidePanel**: To display the side panel interface for managing your tasks

## Third-Party Services

The Extension uses the following external resources:

- **Google Fonts** (`fonts.googleapis.com`): To load Outfit and Inter fonts for UI
- **Google Favicon Service** (`www.google.com/s2/favicons`): To display website icons next to tasks

These services may have their own privacy policies. No personal data is sent to these services beyond what's necessary to load fonts and favicons.

## Data Sharing
**We do NOT share any data.** Your tasks and settings never leave your device.

## Updates to This Policy
We may update this Privacy Policy from time to time. Changes will be reflected in the "Last Updated" date above.

## Contact
If you have questions about this Privacy Policy, please create an issue on our GitHub repository:
[https://github.com/titbm/00-utc-daily-task-tracker](https://github.com/titbm/00-utc-daily-task-tracker)

## Your Rights
You can:
- Delete all extension data by removing the extension
- Export your tasks to JSON file using the built-in Export feature
- Import tasks from JSON file to restore your data
- Disable the extension at any time without losing your bookmarks

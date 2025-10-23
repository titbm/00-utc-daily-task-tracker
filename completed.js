document.getElementById('openPanelBtn').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    // Set flag to open on completed section
    await chrome.storage.session.set({ openOnCompleted: true });
    
    // Open panel
    await chrome.sidePanel.open({ windowId: tabs[0].windowId });
    
    // Close tab
    chrome.tabs.remove(tabs[0].id);
  }
});

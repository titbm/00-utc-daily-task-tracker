// Import constants
import { ACTIONS } from '../shared/constants.js';

// Get parameters from URL
const urlParams = new URLSearchParams(window.location.search);
const bookmarkId = urlParams.get('bookmarkId');
const pageTitle = decodeURIComponent(urlParams.get('title') || 'Page');
const pageUrl = decodeURIComponent(urlParams.get('url') || '');
const pageFavicon = decodeURIComponent(urlParams.get('favicon') || '');
const defaultInterval = parseInt(urlParams.get('interval') || '24');

// Check if dialog is opened from cycle and show indicator
chrome.runtime.sendMessage({ action: ACTIONS.GET_TAB_STATUS }, (response) => {
  if (response && response.dialogFromCycle) {
    // Show cycle indicator
    const cycleIndicator = document.getElementById('cycle-indicator');
    if (cycleIndicator) {
      cycleIndicator.classList.add('visible');
    }
  }
});

// Display page information
document.getElementById('pageTitle').textContent = pageTitle;
document.getElementById('pageUrl').textContent = pageUrl;

// Set favicon
const faviconEl = document.getElementById('pageFavicon');
if (pageFavicon) {
  faviconEl.src = pageFavicon;
  faviconEl.onerror = function() {
    this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23ddd"/></svg>';
  };
} else {
  faviconEl.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23ddd"/></svg>';
}

document.getElementById('hoursInput').value = defaultInterval;

// Set focus on hours input field
document.getElementById('hoursInput').focus();
document.getElementById('hoursInput').select();

// Link click handler - open page for viewing in a new tab
document.getElementById('pageInfoLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: pageUrl });
});

// Function to save interval
function saveInterval() {
  const hours = parseInt(document.getElementById('hoursInput').value) || 0;
  const minutes = parseInt(document.getElementById('minutesInput').value) || 0;
  
  // Check: at least 1 minute
  if (hours === 0 && minutes === 0) {
    // If nothing specified, use default value
    return defaultInterval;
  }
  
  return hours + (minutes / 60);
}

// Quick buttons
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const hours = parseInt(btn.dataset.hours);
    const minutes = parseInt(btn.dataset.minutes);
    document.getElementById('hoursInput').value = hours;
    document.getElementById('minutesInput').value = minutes;
  });
});

// Confirmation
document.getElementById('confirmBtn').addEventListener('click', () => {
  const hours = parseInt(document.getElementById('hoursInput').value) || 0;
  const minutes = parseInt(document.getElementById('minutesInput').value) || 0;
  
  // Check: at least 1 minute
  if (hours === 0 && minutes === 0) {
    alert('Please specify at least 1 minute');
    return;
  }
  
  // Storage already updated via updateCurrentInterval, just close window
  window.close();
});

// Handle Enter
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('confirmBtn').click();
  }
});

// Button "Reset at 00:00 UTC"
document.getElementById('switchToMidnightBtn').addEventListener('click', () => {
  const storageKey = `intervalDialog_${bookmarkId}`;
  
  chrome.storage.session.set({
    [storageKey]: {
      resetType: 'midnight'
    }
  }, () => {
    window.close();
  });
});

// Save current values to storage on any change
function updateCurrentInterval() {
  const hours = parseInt(document.getElementById('hoursInput').value) || 0;
  const minutes = parseInt(document.getElementById('minutesInput').value) || 0;
  const intervalHours = (hours > 0 || minutes > 0) ? hours + (minutes / 60) : defaultInterval;
  
  chrome.storage.session.set({
    [`intervalDialog_${bookmarkId}`]: {
      resetType: 'interval',
      intervalHours: intervalHours
    }
  });
}

// Update on change
document.getElementById('hoursInput').addEventListener('input', updateCurrentInterval);
document.getElementById('minutesInput').addEventListener('input', (e) => {
  // Limit minutes from 0 to 59
  let value = parseInt(e.target.value) || 0;
  if (value > 59) {
    e.target.value = 59;
  } else if (value < 0) {
    e.target.value = 0;
  }
  updateCurrentInterval();
});
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setTimeout(updateCurrentInterval, 10);
  });
});

// Initialize initial value
updateCurrentInterval();

// RoughNotation effect for title
if (typeof RoughNotation !== 'undefined') {
  const highlightElement = document.getElementById('highlight');
  if (highlightElement) {
    const annotation = RoughNotation.annotate(highlightElement, {
      type: 'bracket',
      color: '#8B00FF',
      brackets: ['left', 'right'],
      strokeWidth: 2,
      animationDuration: 600
    });
    setTimeout(() => annotation.show(), 100);
  }
}

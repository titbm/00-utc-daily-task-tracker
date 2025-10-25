// Получаем параметры из URL
const urlParams = new URLSearchParams(window.location.search);
const bookmarkId = urlParams.get('bookmarkId');
const pageTitle = decodeURIComponent(urlParams.get('title') || 'Page');
const pageUrl = decodeURIComponent(urlParams.get('url') || '');
const pageFavicon = decodeURIComponent(urlParams.get('favicon') || '');
const defaultInterval = parseInt(urlParams.get('interval') || '24');

// Проверяем открыт ли диалог из цикла и показываем индикатор
chrome.runtime.sendMessage({ action: 'getMyTabStatus' }, (response) => {
  if (response && response.fromCycle) {
    // Показываем индикатор цикла
    const cycleIndicator = document.getElementById('cycle-indicator');
    if (cycleIndicator) {
      cycleIndicator.classList.add('visible');
    }
  }
});

// Отображаем информацию о странице
document.getElementById('pageTitle').textContent = pageTitle;
document.getElementById('pageUrl').textContent = pageUrl;

// Устанавливаем фавиконку
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

// Устанавливаем фокус на поле ввода часов
document.getElementById('hoursInput').focus();
document.getElementById('hoursInput').select();

// Обработчик клика по ссылке - открываем страницу для просмотра в новой вкладке
document.getElementById('pageInfoLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: pageUrl });
});

// Функция для сохранения интервала
function saveInterval() {
  const hours = parseInt(document.getElementById('hoursInput').value) || 0;
  const minutes = parseInt(document.getElementById('minutesInput').value) || 0;
  
  // Проверка: хотя бы 1 минута
  if (hours === 0 && minutes === 0) {
    // Если ничего не указано, используем значение по умолчанию
    return defaultInterval;
  }
  
  return hours + (minutes / 60);
}

// Быстрые кнопки
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const hours = parseInt(btn.dataset.hours);
    const minutes = parseInt(btn.dataset.minutes);
    document.getElementById('hoursInput').value = hours;
    document.getElementById('minutesInput').value = minutes;
  });
});

// Подтверждение
document.getElementById('confirmBtn').addEventListener('click', () => {
  const hours = parseInt(document.getElementById('hoursInput').value) || 0;
  const minutes = parseInt(document.getElementById('minutesInput').value) || 0;
  
  // Проверка: хотя бы 1 минута
  if (hours === 0 && minutes === 0) {
    alert('Please specify at least 1 minute');
    return;
  }
  
  const intervalHours = hours + (minutes / 60);
  
  // Страница уже в Completed, просто обновляем интервал
  chrome.runtime.sendMessage({
    action: 'setPageInterval',
    bookmarkId: bookmarkId,
    intervalHours: intervalHours
  }, () => {
    window.close();
  });
});

// Обработка Enter
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('confirmBtn').click();
  }
});

// RoughNotation эффект для заголовка
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

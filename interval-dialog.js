// Получаем параметры из URL
const urlParams = new URLSearchParams(window.location.search);
const pageId = parseInt(urlParams.get('pageId'));
const pageTitle = decodeURIComponent(urlParams.get('title') || 'Страница');
const pageUrl = decodeURIComponent(urlParams.get('url') || '');
const defaultInterval = parseInt(urlParams.get('interval') || '24');

// Отображаем информацию о странице
document.getElementById('pageTitle').textContent = pageTitle;
document.getElementById('pageUrl').textContent = pageUrl;
document.getElementById('hoursInput').value = defaultInterval;

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
    alert('Укажите хотя бы 1 минуту');
    return;
  }
  
  // Отправляем сообщение в background script
  chrome.runtime.sendMessage({
    action: 'moveToCompletedWithInterval',
    pageId: pageId,
    intervalHours: hours + (minutes / 60)
  }, () => {
    // Открываем следующую страницу
    chrome.runtime.sendMessage({ action: 'openNextPage' });
    
    // Закрываем эту вкладку
    window.close();
  });
});

// Обработка Enter
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('confirmBtn').click();
  }
});

// Получаем параметры из URL
const urlParams = new URLSearchParams(window.location.search);
const bookmarkId = urlParams.get('bookmarkId');
const pageTitle = decodeURIComponent(urlParams.get('title') || 'Страница');
const pageUrl = decodeURIComponent(urlParams.get('url') || '');
const defaultInterval = parseInt(urlParams.get('interval') || '24');

// Отображаем информацию о странице
document.getElementById('pageTitle').textContent = pageTitle;
document.getElementById('pageUrl').textContent = pageUrl;
document.getElementById('hoursInput').value = defaultInterval;

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

// Обработчик закрытия вкладки (beforeunload) - больше не нужен
// Страница уже перемещена в Completed при открытии диалога
// function handleBeforeUnload() {
//   console.log('📤 beforeunload triggered, saving interval...');
//   const intervalHours = saveInterval();
//   
//   // Отправляем сообщение в background script
//   chrome.runtime.sendMessage({
//     action: 'moveToCompletedWithInterval',
//     bookmarkId: bookmarkId,
//     intervalHours: intervalHours
//   });
//   
//   console.log('📤 beforeunload calling continueAfterInterval...');
//   // Открываем следующую страницу (background сам решит открывать или нет на основе isCycleMode)
//   chrome.runtime.sendMessage({ action: 'continueAfterInterval' });
// }

// window.addEventListener('beforeunload', handleBeforeUnload);

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
  
  const intervalHours = hours + (minutes / 60);
  
  console.log('✅ Updating interval to:', intervalHours, 'hours');
  
  // Страница уже в Completed, просто обновляем интервал
  chrome.runtime.sendMessage({
    action: 'setPageInterval',
    bookmarkId: bookmarkId,
    intervalHours: intervalHours
  }, () => {
    console.log('✅ Interval updated, closing dialog...');
    // Закрываем диалог
    window.close();
  });
});

// Обработка Enter
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('confirmBtn').click();
  }
});

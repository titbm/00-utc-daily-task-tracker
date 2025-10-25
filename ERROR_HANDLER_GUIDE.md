# Централизованный Error Handler

## Использование

### Импорт
```javascript
import { logError, logWarning, logInfo, withErrorHandler } from '../shared/errorHandler.js';
```

### Базовое логирование

```javascript
// Логирование ошибки с контекстом
try {
  const pages = await getActivePages();
} catch (error) {
  logError('getActivePages', error);
}

// Логирование предупреждения
if (!ids.active) {
  logWarning('addPageToActive', 'Active folder not found');
}

// Информационное сообщение (только в DEBUG режиме)
logInfo('startCycle', 'Starting task cycle with 5 pages');
```

### Обёртка для async функций

```javascript
// Автоматическая обработка ошибок с значением по умолчанию
const pages = await withErrorHandler(
  'getActivePages',
  async () => {
    const ids = await getFolderIds();
    return await chrome.bookmarks.getChildren(ids.active);
  },
  [] // Вернёт пустой массив при ошибке
);
```

### Дополнительные данные

```javascript
try {
  await movePageToCompleted(bookmarkId);
} catch (error) {
  logError('movePageToCompleted', error, {
    bookmarkId,
    timestamp: Date.now(),
    userAction: 'manual'
  });
}
```

## Конфигурация

В файле `src/shared/constants.js`:

```javascript
// Debug режим - установите true для включения логирования в консоль
export const DEBUG = false;
```

Эта константа используется во всех модулях через импорт из `errorHandler.js`.

## Преимущества

✅ **Централизованное управление** - переключение между debug и production одной константой  
✅ **Единообразие** - все ошибки логируются в одном формате  
✅ **Готово к расширению** - легко добавить Sentry/Google Analytics  
✅ **Меньше кода** - `logError('context', err)` вместо `console.error('Error in context:', err)`  
✅ **Production-ready** - никаких логов в консоли пользователя

## Миграция со старого кода

**Было:**
```javascript
console.error('Error getting active pages:', error);
```

**Стало:**
```javascript
logError('getActivePages', error);
```

## Будущие возможности

```javascript
// В errorHandler.js можно добавить:
export function logError(context, error, additionalData = null) {
  if (DEBUG) {
    console.error(`[${context}]`, error);
  }
  
  // Отправка в Sentry
  if (ENABLE_SENTRY && typeof Sentry !== 'undefined') {
    Sentry.captureException(error, {
      tags: { context },
      extra: additionalData
    });
  }
  
  // Отправка в Google Analytics
  if (ENABLE_GA4) {
    gtag('event', 'exception', {
      description: `${context}: ${error.message}`,
      fatal: false
    });
  }
}
```

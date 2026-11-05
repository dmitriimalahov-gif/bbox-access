/**
 * B'BOX Production - Routing Column Manager Logger
 * ================================================
 * Система логирования для менеджера колонок таблицы маршрутов
 * Записывает логи в файл с указанием путей к функциям
 */

(function() {
  'use strict';
  
  const LOG_FILE = 'routing-column-manager.log';
  const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
  const MAX_LOG_LINES = 10000;
  
  let logBuffer = [];
  let logBufferSize = 0;
  const FLUSH_INTERVAL = 2000; // 2 секунды
  
  /**
   * Получает путь к функции из стека вызовов
   */
  function getFunctionPath() {
    try {
      const stack = new Error().stack;
      if (!stack) return 'unknown';
      
      const lines = stack.split('\n');
      // Пропускаем первые 2 строки (Error и getFunctionPath)
      for (let i = 2; i < lines.length && i < 10; i++) {
        const line = lines[i].trim();
        if (line.includes('routing-column-manager.js')) {
          // Извлекаем путь и номер строки
          const match = line.match(/([^:]+):(\d+):(\d+)/);
          if (match) {
            return `${match[1]}:${match[2]}`;
          }
          return line.substring(0, 100);
        }
      }
      return 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }
  
  /**
   * Записывает лог в буфер
   */
  function writeLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const path = getFunctionPath();
    
    const logEntry = {
      timestamp,
      level,
      path,
      message,
      data: data ? JSON.parse(JSON.stringify(data)) : null
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    logBuffer.push(logLine);
    logBufferSize += logLine.length;
    
    // Также выводим в консоль
    const prefix = `[ROUTING-COLUMNS] [${level}] [${path}]`;
    if (level === 'ERROR') {
      console.error(prefix, message, data);
    } else if (level === 'WARN') {
      console.warn(prefix, message, data);
    } else {
      console.log(prefix, message, data);
    }
    
    // Если буфер переполнен, сбрасываем сразу
    if (logBufferSize > MAX_LOG_SIZE || logBuffer.length > MAX_LOG_LINES) {
      flushLogs();
    }
  }
  
  /**
   * Сбрасывает буфер логов в файл
   */
  function flushLogs() {
    if (logBuffer.length === 0) return;
    
    const logsToWrite = logBuffer.join('');
    logBuffer = [];
    logBufferSize = 0;
    
    // Отправляем на сервер для записи в файл
    if (typeof window.api === 'function') {
      window.api('/api/log-file', {
        method: 'POST',
        body: JSON.stringify({
          level: 'LOG',
          category: 'ROUTING-COLUMNS-FILE',
          message: 'Batch log write',
          data: {
            logs: logsToWrite,
            count: logsToWrite.split('\n').length
          }
        })
      }).catch(() => {
        // Если сервер недоступен, просто выводим в консоль
        console.warn('[ROUTING-COLUMNS-LOGGER] Не удалось записать логи на сервер');
      });
    }
  }
  
  // Периодически сбрасываем буфер
  setInterval(flushLogs, FLUSH_INTERVAL);
  
  // Сбрасываем при выгрузке страницы
  window.addEventListener('beforeunload', () => {
    flushLogs();
  });
  
  // Экспортируем функцию логирования
  window.RoutingColumnManagerLogger = {
    log: (message, data) => writeLog('LOG', message, data),
    warn: (message, data) => writeLog('WARN', message, data),
    error: (message, data) => writeLog('ERROR', message, data),
    flush: flushLogs
  };
  
  console.log('✅ routing-column-manager-logger.js: Логгер инициализирован');
})();

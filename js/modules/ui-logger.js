/**
 * B'BOX Production - UI Logger Module
 * ====================================
 * Детальное логирование для отладки работы с таблицами и UI
 */

(function() {
  'use strict';

  const LOG_STORAGE_KEY = 'bbox_ui_logs';
  const MAX_LOG_ENTRIES = 1000;
  const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
  };

  let logs = [];
  let currentLogLevel = LOG_LEVELS.DEBUG;
  let logToConsole = true;
  let logToStorage = true;

  /**
   * Инициализация логгера
   */
  function initLogger() {
    // Загружаем сохраненные логи
    try {
      const savedLogs = localStorage.getItem(LOG_STORAGE_KEY);
      if (savedLogs) {
        logs = JSON.parse(savedLogs);
        // Ограничиваем количество логов
        if (logs.length > MAX_LOG_ENTRIES) {
          logs = logs.slice(-MAX_LOG_ENTRIES);
        }
      }
    } catch (e) {
      console.error("Ошибка загрузки логов:", e);
      logs = [];
    }

    // Создаем панель логов
    createLogPanel();
  }

  /**
   * Логирование
   */
  function log(level, category, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      category,
      message,
      data: data ? JSON.parse(JSON.stringify(data)) : null
    };

    logs.push(logEntry);

    // Ограничиваем количество логов
    if (logs.length > MAX_LOG_ENTRIES) {
      logs = logs.slice(-MAX_LOG_ENTRIES);
    }

    // Сохраняем в localStorage
    if (logToStorage) {
      try {
        localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
      } catch (e) {
        console.error("Ошибка сохранения логов:", e);
      }
    }

    // Выводим в консоль
    if (logToConsole && level >= currentLogLevel) {
      const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level) || 'UNKNOWN';
      const prefix = `[${timestamp}] [${levelName}] [${category}]`;
      
      if (data) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
    }

    // Обновляем панель логов
    updateLogPanel();
  }

  /**
   * Создание панели логов
   */
  function createLogPanel() {
    if (document.getElementById('uiLoggerPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'uiLoggerPanel';
    panel.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      width: 400px;
      max-height: 300px;
      background: var(--bg);
      border: 2px solid var(--accent);
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 9998;
      display: none;
      flex-direction: column;
      font-family: monospace;
      font-size: 11px;
    `;

    panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
        <h3 style="margin: 0; font-size: 12px; font-weight: 700;">📋 UI Logger</h3>
        <div style="display: flex; gap: 4px;">
          <button id="loggerClear" class="btn ghost" style="padding: 4px 8px; font-size: 10px;">Очистить</button>
          <button id="loggerClose" class="btn ghost" style="padding: 4px 8px; font-size: 10px;">×</button>
        </div>
      </div>
      <div id="loggerContent" style="overflow-y: auto; max-height: 240px; flex: 1;">
        <div style="color: var(--muted); font-size: 10px; padding: 8px; text-align: center;">
          Логи будут отображаться здесь
        </div>
      </div>
      <div style="display: flex; gap: 4px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);">
        <button id="loggerExport" class="btn ghost" style="padding: 4px 8px; font-size: 10px; flex: 1;">Экспорт</button>
        <button id="loggerToggle" class="btn ghost" style="padding: 4px 8px; font-size: 10px; flex: 1;">Свернуть</button>
      </div>
    `;

    document.body.appendChild(panel);

    // Обработчики
    document.getElementById('loggerClose').onclick = () => {
      panel.style.display = 'none';
    };

    document.getElementById('loggerClear').onclick = () => {
      logs = [];
      localStorage.removeItem(LOG_STORAGE_KEY);
      updateLogPanel();
    };

    document.getElementById('loggerExport').onclick = () => {
      const dataStr = JSON.stringify(logs, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bbox_ui_logs_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    let isCollapsed = false;
    document.getElementById('loggerToggle').onclick = () => {
      isCollapsed = !isCollapsed;
      const content = document.getElementById('loggerContent');
      if (isCollapsed) {
        content.style.display = 'none';
        document.getElementById('loggerToggle').textContent = 'Развернуть';
      } else {
        content.style.display = 'block';
        document.getElementById('loggerToggle').textContent = 'Свернуть';
      }
    };
  }

  /**
   * Обновление панели логов
   */
  function updateLogPanel() {
    const content = document.getElementById('loggerContent');
    if (!content) return;

    if (logs.length === 0) {
      content.innerHTML = '<div style="color: var(--muted); font-size: 10px; padding: 8px; text-align: center;">Логи пусты</div>';
      return;
    }

    // Показываем последние 50 логов
    const recentLogs = logs.slice(-50).reverse();
    
    content.innerHTML = recentLogs.map(log => {
      const levelColor = {
        0: '#888', // DEBUG
        1: '#00CFB5', // INFO
        2: '#FFA500', // WARN
        3: '#FF4444' // ERROR
      }[log.level] || '#888';

      const time = new Date(log.timestamp).toLocaleTimeString();
      const dataStr = log.data ? JSON.stringify(log.data, null, 2).substring(0, 100) : '';

      return `
        <div style="padding: 4px; border-bottom: 1px solid rgba(0,0,0,0.1); margin-bottom: 2px;">
          <div style="display: flex; gap: 8px; align-items: start;">
            <span style="color: ${levelColor}; font-weight: bold; min-width: 50px;">[${log.category}]</span>
            <span style="color: var(--muted); font-size: 9px; min-width: 70px;">${time}</span>
            <div style="flex: 1;">
              <div style="color: var(--text);">${log.message}</div>
              ${dataStr ? `<div style="color: var(--muted); font-size: 9px; margin-top: 2px; white-space: pre-wrap; word-break: break-all;">${dataStr}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Прокручиваем вверх
    content.scrollTop = 0;
  }

  /**
   * Создание кнопки для показа панели
   */
  function createLoggerToggleButton() {
    if (document.getElementById('loggerToggleBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'loggerToggleBtn';
    btn.innerHTML = '📋';
    btn.title = 'UI Logger';
    btn.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      z-index: 9997;
      width: 35px;
      height: 35px;
      border-radius: 50%;
      background: var(--accent);
      color: white;
      border: none;
      cursor: pointer;
      font-size: 16px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    btn.onclick = () => {
      const panel = document.getElementById('uiLoggerPanel');
      if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
      }
    };

    document.body.appendChild(btn);
  }

  // Экспорт функций
  window.UILogger = {
    debug: (category, message, data) => log(LOG_LEVELS.DEBUG, category, message, data),
    info: (category, message, data) => log(LOG_LEVELS.INFO, category, message, data),
    warn: (category, message, data) => log(LOG_LEVELS.WARN, category, message, data),
    error: (category, message, data) => log(LOG_LEVELS.ERROR, category, message, data),
    getLogs: () => [...logs],
    clearLogs: () => {
      logs = [];
      localStorage.removeItem(LOG_STORAGE_KEY);
      updateLogPanel();
    },
    setLevel: (level) => {
      currentLogLevel = level;
    },
    init: () => {
      initLogger();
      createLoggerToggleButton();
    }
  };

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => window.UILogger.init(), 500);
    });
  } else {
    setTimeout(() => window.UILogger.init(), 500);
  }

})();

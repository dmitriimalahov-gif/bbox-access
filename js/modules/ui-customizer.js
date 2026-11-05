/**
 * B'BOX Production - UI Customizer Module
 * =======================================
 * Модуль для полной кастомизации интерфейса администратором
 * - Управление столбцами и строками таблиц
 * - Изменение размеров контейнеров
 * - Перетаскивание элементов интерфейса
 * - Сохранение всех настроек
 */

(function() {
  'use strict';

  // Вспомогательная функция для логирования
  const log = (category, message, data) => {
    if (window.UILogger) {
      window.UILogger.debug(category, message, data);
    } else {
      console.log(`[${category}]`, message, data || '');
    }
  };

  const CUSTOMIZER_KEY = 'bbox_ui_customizer';
  const SERVER_CUSTOMIZER_KEY = 'ui_customizer_settings';
  
  let isCustomizerMode = false;
  let customizerSettings = {
    columns: {},      // Настройки столбцов таблиц
    rows: {},        // Настройки строк таблиц
    containers: {},  // Настройки контейнеров
    elements: {},    // Позиции элементов интерфейса
    layouts: {}      // Общие настройки макетов
  };

  /**
   * Инициализация модуля кастомизатора
   */
  async function initCustomizer() {
    // Загружаем сохраненные настройки
    await loadCustomizerSettings();
    
    // Ждем загрузки системы columns.js
    await new Promise(resolve => {
      if (window.getAllColumnWidths && window.restoreColumnWidths) {
        resolve();
      } else {
        // Ждем до 3 секунд
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if ((window.getAllColumnWidths && window.restoreColumnWidths) || attempts > 30) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      }
    });
    
    // Применяем настройки при загрузке (с задержкой для рендеринга таблиц)
    setTimeout(async () => {
      await applyCustomizerSettings();
    }, 500);
    
    // Создаем панель управления для администратора
    if (isAdmin()) {
      createCustomizerPanel();
    }
  }

  /**
   * Загрузка настроек кастомизатора
   */
  async function loadCustomizerSettings() {
    try {
      if (isAdmin()) {
        // Загружаем с сервера для администратора
        const userSettings = await window.api("/api/user-settings/user");
        if (userSettings && userSettings[SERVER_CUSTOMIZER_KEY]) {
          try {
            const parsed = JSON.parse(userSettings[SERVER_CUSTOMIZER_KEY]);
            customizerSettings = { ...customizerSettings, ...parsed };
            console.log("✅ Настройки кастомизатора загружены с сервера");
          } catch (e) {
            console.error("❌ Ошибка парсинга настроек кастомизатора:", e);
          }
        }
      }
      
      // Также загружаем из localStorage как fallback
      const localData = localStorage.getItem(CUSTOMIZER_KEY);
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          customizerSettings = { ...customizerSettings, ...parsed };
          console.log("✅ Настройки кастомизатора загружены из localStorage");
        } catch (e) {
          console.error("❌ Ошибка парсинга localStorage:", e);
        }
      }
    } catch (e) {
      console.error("❌ Ошибка загрузки настроек кастомизатора:", e);
    }
  }

  /**
   * Сохранение настроек кастомизатора
   */
  async function saveCustomizerSettings() {
    try {
      // Сохраняем в localStorage
      localStorage.setItem(CUSTOMIZER_KEY, JSON.stringify(customizerSettings));
      
      // Сохраняем на сервер для администратора
      if (isAdmin()) {
        try {
          await window.api(`/api/user-settings/user/${SERVER_CUSTOMIZER_KEY}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: JSON.stringify(customizerSettings) })
          });
          console.log("✅ Настройки кастомизатора сохранены на сервер");
        } catch (e) {
          console.error("❌ Ошибка сохранения на сервер:", e);
        }
      }
    } catch (e) {
      console.error("❌ Ошибка сохранения настроек кастомизатора:", e);
    }
  }

  /**
   * Применение сохраненных настроек
   */
  async function applyCustomizerSettings() {
    console.log("🔄 Применение настроек кастомизатора...", customizerSettings);
    
    // Применяем настройки столбцов (самое важное)
    await applyColumnSettings();
    
    // Применяем настройки контейнеров
    applyContainerSettings();
    
    // Применяем настройки элементов
    applyElementSettings();
    
    console.log("✅ Настройки кастомизатора применены");
  }

  /**
   * Применение настроек столбцов
   */
  async function applyColumnSettings() {
    // Применяем настройки столбцов из кастомизатора
    if (customizerSettings.columns && Object.keys(customizerSettings.columns).length > 0) {
      console.log("🔄 Применение настроек столбцов из кастомизатора:", customizerSettings.columns);
      
      // Сначала обновляем данные в системе columns.js
      if (window.getAllColumnWidths && window.saveAllColumnWidths) {
        try {
          const allWidths = await window.getAllColumnWidths();
          // Объединяем настройки из кастомизатора (приоритет у кастомизатора)
          Object.assign(allWidths, customizerSettings.columns);
          
          // Сохраняем обратно в систему columns.js
          await window.saveAllColumnWidths(allWidths);
          console.log("✅ Настройки столбцов синхронизированы с columns.js");
        } catch (e) {
          console.error("❌ Ошибка синхронизации с columns.js:", e);
        }
      }
      
      // Применяем к каждой таблице
      // Ждем рендеринга таблиц
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Пытаемся применить настройки несколько раз (на случай, если таблицы еще не отрендерены)
      let attempts = 0;
      const maxAttempts = 10; // Увеличиваем количество попыток
      
      const applyWidths = async () => {
        let appliedCount = 0;
        const notFoundKeys = [];
        
        for (const [tableKey, widths] of Object.entries(customizerSettings.columns)) {
          // Находим таблицу по ключу
          const table = Array.from(document.querySelectorAll('table')).find(t => {
            if (window.getTableKey) {
              try {
                return window.getTableKey(t) === tableKey;
              } catch (e) {
                return false;
              }
            }
            return false;
          });
          
          if (table && window.restoreColumnWidths) {
            try {
              // Временно сохраняем ширины в систему columns.js для этой таблицы
              if (window.getAllColumnWidths) {
                const allWidths = await window.getAllColumnWidths();
                allWidths[tableKey] = widths;
                // Сохраняем в localStorage для быстрого доступа
                const COL_WIDTHS_KEY = "bbox_column_widths";
                try {
                  const localData = JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) || "{}");
                  localData[tableKey] = widths;
                  localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(localData));
                } catch (e) {
                  console.error("Ошибка сохранения в localStorage:", e);
                }
              }
              
              // Восстанавливаем ширины
              await window.restoreColumnWidths(table);
              appliedCount++;
            } catch (e) {
              console.error(`❌ Ошибка применения ширин для таблицы ${tableKey}:`, e);
              notFoundKeys.push(tableKey);
            }
          } else {
            notFoundKeys.push(tableKey);
          }
        }
        
        // Удаляем ключи таблиц, которые не найдены после всех попыток
        if (attempts >= maxAttempts && notFoundKeys.length > 0) {
          notFoundKeys.forEach(key => {
            delete customizerSettings.columns[key];
            console.log(`🗑️ Удален неактуальный ключ таблицы: ${key}`);
          });
          // Сохраняем обновленные настройки
          if (Object.keys(customizerSettings.columns).length === 0) {
            // Если все ключи удалены, очищаем настройки столбцов
            customizerSettings.columns = {};
          }
          await saveCustomizerSettings();
        }
        
        return { appliedCount, notFoundCount: notFoundKeys.length };
      };
      
      // Пытаемся применить настройки
      let result = await applyWidths();
      let appliedCount = result.appliedCount;
      
      // Если не все таблицы найдены, пытаемся еще раз
      const totalTables = Object.keys(customizerSettings.columns).length;
      if (appliedCount < totalTables && attempts < maxAttempts && totalTables > 0) {
        const retryInterval = setInterval(async () => {
          attempts++;
          result = await applyWidths();
          appliedCount = result.appliedCount;
          
          if (appliedCount >= totalTables || attempts >= maxAttempts) {
            clearInterval(retryInterval);
            if (appliedCount < totalTables && totalTables > 0) {
              // Показываем предупреждение только если есть реальные таблицы для применения
              const remaining = totalTables - appliedCount;
              if (remaining > 0) {
                console.warn(`⚠️ Не все таблицы найдены после ${attempts} попыток (найдено: ${appliedCount}/${totalTables})`);
              }
            }
          }
        }, 500);
      } else if (totalTables === 0) {
        // Если нет таблиц для применения, просто выходим без предупреждений
        return;
      }
    }
  }
  
  /**
   * Сохранение текущих настроек столбцов
   */
  async function saveColumnSettings() {
    console.log("💾 Начало сохранения настроек столбцов...");
    
    // Получаем все таблицы на странице
    const tables = document.querySelectorAll('table.resizable-table, table[data-resizable-initialized], table');
    const columnWidths = {};
    
    console.log(`💾 Найдено таблиц: ${tables.length}`);
    
    for (const table of tables) {
      if (!table.querySelector('thead')) {
        console.log(`⚠️ Пропущена таблица без thead`);
        continue;
      }
      
      // Получаем ключ таблицы
      let tableKey = 'unknown';
      if (window.getTableKey) {
        try {
          tableKey = window.getTableKey(table);
        } catch (e) {
          console.error("Ошибка получения ключа таблицы:", e);
          tableKey = table.id || `table_${Date.now()}`;
        }
      } else {
        tableKey = table.id || `table_${Date.now()}`;
      }
      
      log('COLUMNS', `Обработка таблицы: ${tableKey}`, { 
        hasThead: !!table.querySelector('thead'),
        tableId: table.id 
      });
      
      // Получаем все заголовки
      const thead = table.querySelector('thead');
      const allThs = Array.from(thead.querySelectorAll('th'));
      const saveRow = table.querySelector('.save-width-row');
      const thsToSave = saveRow 
        ? allThs.filter(th => !th.closest('.save-width-row')) 
        : allThs;
      
      log('COLUMNS', `Найдено заголовков для сохранения: ${thsToSave.length}`, {
        totalThs: allThs.length,
        hasSaveRow: !!saveRow
      });
      
      // Читаем АКТУАЛЬНУЮ ширину из DOM
      const widths = thsToSave.map((th, index) => {
        // Используем getBoundingClientRect для получения реальной видимой ширины
        const rect = th.getBoundingClientRect();
        if (rect.width > 0 && rect.width >= 50) {
          const width = Math.round(rect.width);
          console.log(`  Столбец ${index}: ${width}px (из getBoundingClientRect)`);
          return width;
        }
        
        // Fallback на style.width
        if (th.style.width) {
          const widthValue = parseInt(th.style.width);
          if (widthValue > 0 && widthValue >= 50) {
            console.log(`  Столбец ${index}: ${widthValue}px (из style.width)`);
            return widthValue;
          }
        }
        
        // Fallback на offsetWidth
        const offsetWidth = th.offsetWidth;
        if (offsetWidth > 0 && offsetWidth >= 50) {
          console.log(`  Столбец ${index}: ${offsetWidth}px (из offsetWidth)`);
          return offsetWidth;
        }
        
        console.warn(`  ⚠️ Столбец ${index}: не удалось определить ширину`);
        return 0;
      }).filter(w => w > 0);
      
      if (widths.length > 0) {
        columnWidths[tableKey] = widths;
        log('COLUMNS', `Сохранены ширины для таблицы ${tableKey}`, widths);
      } else {
        log('COLUMNS', `Нет валидных ширин для таблицы ${tableKey}`, { 
          tableKey,
          thsCount: thsToSave.length 
        });
      }
    }
    
    // Сохраняем в настройки кастомизатора
    customizerSettings.columns = columnWidths;
    log('COLUMNS', 'Все сохраненные ширины столбцов', columnWidths);
    
    // Также сохраняем через существующую систему columns.js
    if (window.saveAllColumnWidths && window.getAllColumnWidths) {
      try {
        const allWidths = await window.getAllColumnWidths();
        console.log("💾 Текущие ширины из columns.js:", allWidths);
        // Объединяем с текущими настройками (приоритет у новых)
        Object.assign(allWidths, columnWidths);
        console.log("💾 Объединенные ширины:", allWidths);
        await window.saveAllColumnWidths(allWidths);
        console.log("✅ Ширины столбцов сохранены через columns.js");
      } catch (e) {
        console.error("❌ Ошибка сохранения через columns.js:", e);
      }
    } else {
      console.warn("⚠️ Функции columns.js не доступны");
    }
  }

  /**
   * Применение настроек контейнеров
   */
  function applyContainerSettings() {
    if (!customizerSettings.containers) return;
    
    Object.entries(customizerSettings.containers).forEach(([containerId, settings]) => {
      const container = document.getElementById(containerId) || document.querySelector(`[data-container-id="${containerId}"]`);
      if (container && settings.width) {
        container.style.width = settings.width;
        container.style.minWidth = settings.minWidth || settings.width;
        container.style.maxWidth = settings.maxWidth || 'none';
      }
    });
  }

  /**
   * Применение настроек элементов
   */
  function applyElementSettings() {
    if (!customizerSettings.elements) return;
    
    Object.entries(customizerSettings.elements).forEach(([elementId, settings]) => {
      const element = document.getElementById(elementId) || document.querySelector(`[data-element-id="${elementId}"]`);
      if (element && settings) {
        if (settings.position) {
          element.style.position = settings.position;
          if (settings.top !== undefined) element.style.top = settings.top;
          if (settings.left !== undefined) element.style.left = settings.left;
          if (settings.right !== undefined) element.style.right = settings.right;
          if (settings.bottom !== undefined) element.style.bottom = settings.bottom;
        }
        if (settings.order !== undefined) {
          element.style.order = settings.order;
        }
      }
    });
  }

  /**
   * Создание панели управления кастомизатором
   */
  function createCustomizerPanel() {
    // Проверяем, не создана ли уже панель
    if (document.getElementById('customizerPanel')) return;
    
    const panel = document.createElement('div');
    panel.id = 'customizerPanel';
    panel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 10000;
      background: var(--bg);
      border: 2px solid var(--accent);
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      min-width: 200px;
      display: none;
    `;
    
    panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
        <h3 style="margin: 0; font-size: 14px; font-weight: 700;">🎨 Кастомизатор</h3>
        <button id="customizerClose" class="btn ghost" style="padding: 4px 8px; font-size: 12px;">×</button>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button id="toggleCustomizerMode" class="btn accent" style="width: 100%; padding: 8px;">
          🔧 Включить режим редактирования
        </button>
        
        <div id="customizerControls" style="display: none; flex-direction: column; gap: 8px;">
          <div style="font-size: 11px; color: var(--muted); padding: 8px; background: rgba(0,207,181,0.1); border-radius: 4px;">
            💡 В режиме редактирования вы можете:
            <ul style="margin: 4px 0 0 0; padding-left: 16px; font-size: 10px;">
              <li>Перетаскивать элементы интерфейса</li>
              <li>Изменять размеры контейнеров</li>
              <li>Настраивать столбцы таблиц</li>
            </ul>
          </div>
          
          <button id="saveAllSettings" class="btn primary" style="width: 100%; padding: 8px; font-weight: 600;">
            💾 Сохранить все настройки
          </button>
          
          <button id="resetAllSettings" class="btn ghost danger" style="width: 100%; padding: 8px;">
            🔄 Сбросить все настройки
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    
    // Обработчики событий
    const toggleBtn = document.getElementById('toggleCustomizerMode');
    const closeBtn = document.getElementById('customizerClose');
    const saveBtn = document.getElementById('saveAllSettings');
    const resetBtn = document.getElementById('resetAllSettings');
    
    // Кнопка показа/скрытия панели (создаем отдельную кнопку)
    createCustomizerToggleButton();
    
    toggleBtn.onclick = () => {
      isCustomizerMode = !isCustomizerMode;
      toggleCustomizerMode(isCustomizerMode);
      toggleBtn.textContent = isCustomizerMode 
        ? '✅ Режим редактирования включен' 
        : '🔧 Включить режим редактирования';
      document.getElementById('customizerControls').style.display = isCustomizerMode ? 'flex' : 'none';
    };
    
    closeBtn.onclick = () => {
      panel.style.display = 'none';
    };
    
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = '⏳ Сохранение...';
      
      try {
        // ВАЖНО: Сначала сохраняем текущие настройки столбцов из DOM
        console.log("💾 Начало сохранения настроек столбцов...");
        await saveColumnSettings();
        console.log("💾 Настройки столбцов сохранены:", customizerSettings.columns);
        
        // Сохраняем все настройки кастомизатора
        await saveCustomizerSettings();
        console.log("💾 Настройки кастомизатора сохранены");
        
        // Дополнительно сохраняем через существующую систему columns.js
        if (window.saveAllColumnWidths && window.getAllColumnWidths) {
          const allWidths = await window.getAllColumnWidths();
          // Объединяем с настройками из кастомизатора (приоритет у кастомизатора)
          Object.assign(allWidths, customizerSettings.columns);
          await window.saveAllColumnWidths(allWidths);
          console.log("✅ Ширины столбцов сохранены через columns.js:", allWidths);
        }
        
        // Проверяем, что данные действительно сохранились
        const savedData = localStorage.getItem("bbox_column_widths");
        const savedCustomizer = localStorage.getItem(CUSTOMIZER_KEY);
        console.log("💾 Проверка сохраненных данных:", {
          columns: savedData ? JSON.parse(savedData) : null,
          customizer: savedCustomizer ? JSON.parse(savedCustomizer) : null
        });
        
        if (typeof window.toast === 'function') {
          window.toast('✅ Все настройки сохранены', 2000);
        }
        console.log("💾 Все настройки сохранены:", customizerSettings);
      } catch (e) {
        console.error("❌ Ошибка сохранения настроек:", e);
        if (typeof window.toast === 'function') {
          window.toast('❌ Ошибка сохранения настроек: ' + e.message, 3000);
        }
      } finally {
        saveBtn.textContent = '💾 Сохранить все настройки';
        saveBtn.disabled = false;
      }
    };
    
    resetBtn.onclick = () => {
      if (confirm('Вы уверены, что хотите сбросить все настройки кастомизатора?')) {
        customizerSettings = {
          columns: {},
          rows: {},
          containers: {},
          elements: {},
          layouts: {}
        };
        localStorage.removeItem(CUSTOMIZER_KEY);
        location.reload();
      }
    };
  }

  /**
   * Создание кнопки для показа/скрытия панели
   */
  function createCustomizerToggleButton() {
    if (document.getElementById('customizerToggleBtn')) return;
    
    const btn = document.createElement('button');
    btn.id = 'customizerToggleBtn';
    btn.innerHTML = '🎨';
    btn.title = 'Кастомизатор интерфейса';
    btn.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 9999;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--accent);
      color: white;
      border: none;
      cursor: pointer;
      font-size: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    btn.onclick = () => {
      const panel = document.getElementById('customizerPanel');
      if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      }
    };
    
    document.body.appendChild(btn);
  }

  /**
   * Включение/выключение режима кастомизации
   */
  function toggleCustomizerMode(enabled) {
    isCustomizerMode = enabled;
    
    if (enabled) {
      // Включаем режим редактирования
      document.body.classList.add('customizer-mode');
      
      // Инициализируем перетаскивание элементов
      initDraggableElements();
      
      // Инициализируем изменение размеров контейнеров
      initResizableContainers();
      
      // Добавляем визуальные индикаторы
      addCustomizerIndicators();
    } else {
      // Выключаем режим редактирования
      document.body.classList.remove('customizer-mode');
      
      // Убираем визуальные индикаторы
      removeCustomizerIndicators();
    }
  }

  /**
   * Инициализация перетаскивания элементов
   */
  function initDraggableElements() {
    // Находим все элементы, которые можно перетаскивать
    const draggableSelectors = [
      '.btn',
      '.field',
      '.card h3',
      'select',
      'button:not(#customizerToggleBtn):not(#customizerClose):not(.save-width-btn)',
      '.row > *',
      '.card > *'
    ];
    
    draggableSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        if (!element.hasAttribute('data-draggable-init') && 
            !element.closest('.save-width-row') &&
            element.offsetParent !== null) { // Только видимые элементы
          makeElementDraggable(element);
          element.setAttribute('data-draggable-init', 'true');
        }
      });
    });
    
    // Инициализируем перетаскивание строк таблиц
    initTableRowDragging();
  }
  
  /**
   * Инициализация перетаскивания строк таблиц
   */
  function initTableRowDragging() {
    document.querySelectorAll('table tbody tr').forEach(row => {
      if (!row.hasAttribute('data-row-draggable-init')) {
        makeTableRowDraggable(row);
        row.setAttribute('data-row-draggable-init', 'true');
      }
    });
  }
  
  /**
   * Делает строку таблицы перетаскиваемой (улучшенная версия с плавным перетаскиванием)
   */
  function makeTableRowDraggable(row) {
    if (!isCustomizerMode) {
      row.draggable = false;
      row.style.cursor = '';
      return;
    }
    
    row.draggable = true;
    row.style.cursor = 'move';
    row.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
    
    let draggedRow = null;
    let placeholder = null;
    let isDragging = false;
    
    row.addEventListener('dragstart', (e) => {
      log('ROW_DRAG', 'Начало перетаскивания строки', { rowIndex: row.rowIndex });
      
      isDragging = true;
      draggedRow = row;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', row.outerHTML);
      
      // Создаем placeholder
      placeholder = document.createElement('tr');
      placeholder.style.height = row.offsetHeight + 'px';
      placeholder.style.backgroundColor = 'rgba(0, 207, 181, 0.1)';
      placeholder.style.border = '2px dashed var(--accent)';
      placeholder.innerHTML = '<td colspan="100%" style="padding: 0;"></td>';
      
      // Визуальные эффекты
      row.style.opacity = '0.5';
      row.style.transform = 'scale(0.98)';
      row.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
      row.style.zIndex = '1000';
      row.style.position = 'relative';
    });
    
    row.addEventListener('dragend', () => {
      log('ROW_DRAG', 'Конец перетаскивания строки');
      
      isDragging = false;
      
      // Убираем placeholder
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder);
      }
      
      // Восстанавливаем стили
      if (draggedRow) {
        draggedRow.style.opacity = '1';
        draggedRow.style.transform = '';
        draggedRow.style.boxShadow = '';
        draggedRow.style.zIndex = '';
        draggedRow.style.position = '';
      }
      
      // Убираем индикаторы со всех строк
      document.querySelectorAll('tr').forEach(r => {
        r.style.borderTop = '';
        r.style.borderBottom = '';
        r.style.backgroundColor = '';
      });
      
      draggedRow = null;
      placeholder = null;
    });
    
    row.addEventListener('dragover', (e) => {
      if (!isDragging || !draggedRow || draggedRow === row) return;
      
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      
      const tbody = row.parentElement;
      const rect = row.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const insertBefore = e.clientY < midpoint;
      
      // Визуальная индикация
      row.style.borderTop = insertBefore ? '3px solid var(--accent)' : 'none';
      row.style.borderBottom = !insertBefore ? '3px solid var(--accent)' : 'none';
      row.style.backgroundColor = 'rgba(0, 207, 181, 0.05)';
      
      // Вставляем placeholder
      if (placeholder && placeholder.parentNode !== tbody) {
        if (insertBefore) {
          tbody.insertBefore(placeholder, row);
        } else {
          tbody.insertBefore(placeholder, row.nextSibling);
        }
      } else if (placeholder) {
        // Перемещаем placeholder
        if (insertBefore && placeholder.nextSibling !== row) {
          tbody.insertBefore(placeholder, row);
        } else if (!insertBefore && placeholder.previousSibling !== row) {
          tbody.insertBefore(placeholder, row.nextSibling);
        }
      }
    });
    
    row.addEventListener('dragleave', () => {
      if (!isDragging) return;
      row.style.borderTop = '';
      row.style.borderBottom = '';
      row.style.backgroundColor = '';
    });
    
    row.addEventListener('drop', (e) => {
      if (!isDragging || !draggedRow) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      if (draggedRow && draggedRow !== row) {
        const tbody = row.parentElement;
        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const insertBefore = e.clientY < midpoint;
        
        log('ROW_DRAG', 'Перемещение строки', { 
          from: draggedRow.rowIndex, 
          to: row.rowIndex,
          insertBefore 
        });
        
        // Убираем placeholder
        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.removeChild(placeholder);
        }
        
        // Перемещаем строку
        if (insertBefore) {
          tbody.insertBefore(draggedRow, row);
        } else {
          tbody.insertBefore(draggedRow, row.nextSibling);
        }
        
        // Сохраняем порядок строк
        saveTableRowOrder(tbody);
        
        // Анимация перемещения
        draggedRow.style.transition = 'transform 0.3s ease';
        draggedRow.style.transform = 'translateY(0)';
        setTimeout(() => {
          if (draggedRow) {
            draggedRow.style.transition = '';
            draggedRow.style.transform = '';
          }
        }, 300);
      }
      
      row.style.borderTop = '';
      row.style.borderBottom = '';
      row.style.backgroundColor = '';
    });
  }
  
  /**
   * Сохранение порядка строк таблицы
   */
  function saveTableRowOrder(tbody) {
    const table = tbody.closest('table');
    if (!table) return;
    
    const tableKey = window.getTableKey ? window.getTableKey(table) : table.id || 'unknown';
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const rowOrder = rows.map((row, index) => {
      // Пытаемся найти уникальный идентификатор строки
      const rowId = row.id || 
                   row.getAttribute('data-op-id') || 
                   row.getAttribute('data-id') ||
                   `row_${index}`;
      return rowId;
    });
    
    if (!customizerSettings.rows) {
      customizerSettings.rows = {};
    }
    
    customizerSettings.rows[tableKey] = rowOrder;
    
    // Автосохранение с небольшой задержкой
    clearTimeout(window.customizerSaveTimer);
    window.customizerSaveTimer = setTimeout(() => {
      saveCustomizerSettings();
    }, 500);
  }

  /**
   * Делает элемент перетаскиваемым (улучшенная версия с плавным перетаскиванием)
   */
  function makeElementDraggable(element) {
    element.style.cursor = isCustomizerMode ? 'move' : '';
    element.draggable = false; // Используем mouse events вместо drag and drop для лучшего контроля
    
    if (!isCustomizerMode) return;
    
    // Сохраняем исходную позицию
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;
    let isDragging = false;
    let originalPosition = '';
    let originalZIndex = '';
    let originalTransition = '';
    
    element.addEventListener('mousedown', (e) => {
      if (!isCustomizerMode) return;
      if (e.target.closest('button, select, input, a')) return; // Не перетаскиваем интерактивные элементы
      if (e.button !== 0) return; // Только левая кнопка мыши
      
      log('ELEMENT_DRAG', 'Начало перетаскивания элемента', { 
        elementId: element.id || element.className,
        tag: element.tagName 
      });
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = element.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      
      // Сохраняем исходные стили
      const computedStyle = getComputedStyle(element);
      originalPosition = computedStyle.position;
      originalZIndex = computedStyle.zIndex;
      originalTransition = element.style.transition;
      
      // Устанавливаем position для перетаскивания
      if (originalPosition === 'static') {
        element.style.position = 'relative';
      }
      element.style.zIndex = '10000';
      element.style.transition = 'none'; // Отключаем transition во время перетаскивания
      element.style.cursor = 'grabbing';
      element.style.opacity = '0.9';
      element.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
      element.style.transform = 'scale(1.02)';
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      
      e.preventDefault();
      e.stopPropagation();
    });
    
    const onMouseMove = (e) => {
      if (!isDragging || !isCustomizerMode) return;
      
      const diffX = e.clientX - startX;
      const diffY = e.clientY - startY;
      
      const newX = initialX + diffX;
      const newY = initialY + diffY;
      
      // Плавное перемещение
      element.style.left = newX + 'px';
      element.style.top = newY + 'px';
      
      // Визуальная обратная связь
      const distance = Math.sqrt(diffX * diffX + diffY * diffY);
      if (distance > 5) {
        element.style.opacity = '0.95';
      }
    };
    
    const onMouseUp = () => {
      if (!isDragging) return;
      
      log('ELEMENT_DRAG', 'Конец перетаскивания элемента', {
        finalX: element.style.left,
        finalY: element.style.top
      });
      
      isDragging = false;
      
      // Восстанавливаем transition для плавной анимации
      element.style.transition = originalTransition || 'all 0.3s ease';
      element.style.cursor = 'move';
      element.style.opacity = '1';
      element.style.boxShadow = '';
      element.style.transform = '';
      
      // Сохраняем позицию элемента
      const elementId = element.id || element.getAttribute('data-element-id') || `element_${Date.now()}`;
      if (!element.id && !element.getAttribute('data-element-id')) {
        element.setAttribute('data-element-id', elementId);
      }
      
      if (!customizerSettings.elements) {
        customizerSettings.elements = {};
      }
      
      const finalX = element.style.left;
      const finalY = element.style.top;
      
      customizerSettings.elements[elementId] = {
        position: getComputedStyle(element).position,
        left: finalX,
        top: finalY
      };
      
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      // Автосохранение
      clearTimeout(window.customizerSaveTimer);
      window.customizerSaveTimer = setTimeout(() => {
        saveCustomizerSettings();
        log('ELEMENT_DRAG', 'Позиция элемента сохранена', { elementId, finalX, finalY });
      }, 500);
    };
    
    // Добавляем визуальный индикатор
    element.addEventListener('mouseenter', () => {
      if (isCustomizerMode && !isDragging) {
        element.style.outline = '2px dashed var(--accent)';
        element.style.outlineOffset = '2px';
        element.style.cursor = 'move';
      }
    });
    
    element.addEventListener('mouseleave', () => {
      if (isCustomizerMode && !isDragging) {
        element.style.outline = '';
        element.style.outlineOffset = '';
      }
    });
  }

  /**
   * Инициализация изменения размеров контейнеров
   */
  function initResizableContainers() {
    const containerSelectors = [
      '.pane',
      '.card',
      '[class*="container"]',
      '[class*="wrapper"]'
    ];
    
    containerSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(container => {
        if (!container.hasAttribute('data-resizable-init')) {
          makeContainerResizable(container);
          container.setAttribute('data-resizable-init', 'true');
        }
      });
    });
  }

  /**
   * Делает контейнер изменяемым по размеру
   */
  function makeContainerResizable(container) {
    if (!isCustomizerMode) return;
    
    // Создаем handle для изменения размера
    const handle = document.createElement('div');
    handle.className = 'resize-container-handle';
    handle.style.cssText = `
      position: absolute;
      bottom: 0;
      right: 0;
      width: 20px;
      height: 20px;
      background: var(--accent);
      cursor: nwse-resize;
      z-index: 1000;
      border-radius: 4px 0 0 0;
      opacity: 0.7;
    `;
    
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    
    container.appendChild(handle);
    
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = container.offsetWidth;
      startHeight = container.offsetHeight;
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
    
    const onMouseMove = (e) => {
      if (!isResizing) return;
      
      const diffX = e.clientX - startX;
      const diffY = e.clientY - startY;
      
      // Для большинства контейнеров изменяем только ширину
      // Высота изменяется только если контейнер имеет фиксированную высоту
      const hasFixedHeight = container.style.height && container.style.height !== 'auto';
      
      const newWidth = Math.max(200, startWidth + diffX);
      const newHeight = hasFixedHeight ? Math.max(100, startHeight + diffY) : container.offsetHeight;
      
      container.style.width = newWidth + 'px';
      container.style.minWidth = newWidth + 'px';
      container.style.maxWidth = 'none';
      
      if (hasFixedHeight) {
        container.style.height = newHeight + 'px';
        container.style.minHeight = newHeight + 'px';
      }
      
      // Сохраняем настройки контейнера
      const containerId = container.id || container.getAttribute('data-container-id') || `container_${Date.now()}`;
      if (!container.id && !container.getAttribute('data-container-id')) {
        container.setAttribute('data-container-id', containerId);
      }
      
      if (!customizerSettings.containers) {
        customizerSettings.containers = {};
      }
      
      customizerSettings.containers[containerId] = {
        width: newWidth + 'px',
        minWidth: newWidth + 'px',
        maxWidth: 'none',
        ...(hasFixedHeight ? {
          height: newHeight + 'px',
          minHeight: newHeight + 'px'
        } : {})
      };
    };
    
    const onMouseUp = () => {
      isResizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      // Автосохранение настроек контейнера
      clearTimeout(window.customizerSaveTimer);
      window.customizerSaveTimer = setTimeout(() => {
        saveCustomizerSettings();
      }, 500);
    };
  }

  /**
   * Добавление визуальных индикаторов
   */
  function addCustomizerIndicators() {
    document.body.style.outline = isCustomizerMode ? '2px dashed rgba(0,207,181,0.3)' : '';
  }

  /**
   * Удаление визуальных индикаторов
   */
  function removeCustomizerIndicators() {
    document.body.style.outline = '';
    document.querySelectorAll('[style*="outline"]').forEach(el => {
      if (el.style.outline.includes('dashed')) {
        el.style.outline = '';
      }
    });
  }

  // Проверка прав администратора
  function isAdmin() {
    const user = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
    return user && user.role === 'admin' && !!user.userId;
  }

  // Экспорт функций
  window.UICustomizer = {
    init: initCustomizer,
    loadSettings: loadCustomizerSettings,
    saveSettings: saveCustomizerSettings,
    applySettings: applyCustomizerSettings,
    toggleMode: toggleCustomizerMode,
    isEnabled: () => isCustomizerMode
  };

  // Автоинициализация при загрузке
  // Ждем загрузки всех необходимых модулей
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Небольшая задержка для загрузки других модулей
      setTimeout(initCustomizer, 500);
    });
  } else {
    setTimeout(initCustomizer, 500);
  }
  
  // Также инициализируем при обновлении данных
  if (window.refreshAll) {
    const originalRefreshAll = window.refreshAll;
    window.refreshAll = async function(...args) {
      const result = await originalRefreshAll.apply(this, args);
      
      // Переинициализируем кастомизатор после обновления данных
      setTimeout(async () => {
        // Применяем настройки столбцов после рендеринга
        if (customizerSettings.columns && Object.keys(customizerSettings.columns).length > 0) {
          console.log("🔄 Применение настроек столбцов после refreshAll...");
          await applyColumnSettings();
        }
        
        // Переинициализируем режим кастомизатора, если он был включен
        if (window.UICustomizer && window.UICustomizer.isEnabled()) {
          if (window.UICustomizer.toggleMode) {
            const wasEnabled = window.UICustomizer.isEnabled();
            window.UICustomizer.toggleMode(false);
            setTimeout(() => {
              window.UICustomizer.toggleMode(wasEnabled);
            }, 100);
          }
        }
      }, 500);
      
      return result;
    };
  }
  
  // Также применяем настройки после переинициализации таблиц
  if (window.reinitResizableTables) {
    const originalReinit = window.reinitResizableTables;
    window.reinitResizableTables = async function(...args) {
      const result = await originalReinit.apply(this, args);
      
      // Применяем настройки столбцов после переинициализации
      setTimeout(async () => {
        if (customizerSettings.columns && Object.keys(customizerSettings.columns).length > 0) {
          console.log("🔄 Применение настроек столбцов после reinitResizableTables...");
          await applyColumnSettings();
        }
      }, 300);
      
      return result;
    };
  }

})();

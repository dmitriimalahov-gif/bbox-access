/**
 * B'BOX Production - Routing Table Column Manager
 * ================================================
 * Управление порядком и шириной колонок в таблице маршрутов
 * с поддержкой drag-and-drop и сохранением в БД
 */

(function() {
  'use strict';

  // Константы
  const ROUTING_TABLE_ID = "routing";
  const SETTINGS_KEY_COLUMN_ORDER = "routing_column_order";
  const MIN_COLUMN_WIDTH = 5;

  // Глобальное состояние
  let routingTable = null;
  let columnSettings = {
    order: [],
    widths: {}
  };

  // ============================================
  // Утилиты
  // ============================================

  /**
   * Логирование (используем console.log для отладки)
   */
  function log(level, message, data) {
    const prefix = '[ROUTING-COLUMNS]';
    if (level === 'ERROR') {
      console.error(`${prefix} [ERROR] ${message}`, data || '');
    } else if (level === 'WARN') {
      console.warn(`${prefix} [WARN] ${message}`, data || '');
    } else {
      console.log(`${prefix} [LOG] ${message}`, data || '');
    }
  }

  /**
   * Получает имя колонки из th элемента
   */
  function getColumnName(th) {
    return th.getAttribute('data-column') || th.textContent.trim().substring(0, 20);
  }

  /**
   * Получает все th элементы заголовков (исключая save-width-row)
   */
  function getColumnHeaders(table) {
    const thead = table.querySelector('thead');
    if (!thead) return [];
    
    const allThs = Array.from(thead.querySelectorAll('th'));
    const saveRow = table.querySelector('.save-width-row');
    return saveRow 
      ? allThs.filter(th => !th.closest('.save-width-row')) 
      : allThs;
  }

  /**
   * Нумерует все колонки: присваивает data-column-index каждому th и всем соответствующим td
   * Это обеспечивает жесткую связь между заголовком и ячейками колонки
   */
  function numberAllColumns(table) {
    if (!table) return;
    
    const ths = getColumnHeaders(table);
    if (ths.length === 0) {
      log('WARN', 'Заголовки колонок не найдены для нумерации');
      return;
    }
    
    const tbody = table.querySelector('tbody');
    if (!tbody) {
      log('WARN', 'Tbody не найден для нумерации');
      return;
    }
    
    // Нумеруем заголовки по порядку: 0, 1, 2, 3, 4, 5...
    ths.forEach((th, index) => {
      th.setAttribute('data-column-index', index.toString());
      log('LOG', `Заголовок пронумерован`, {
        index,
        columnName: getColumnName(th),
        dataColumn: th.getAttribute('data-column')
      });
    });
    
    // Нумеруем ячейки: находим ячейки по data-column и присваиваем им тот же номер
    const rows = Array.from(tbody.querySelectorAll('tr'));
    let numberedCellsCount = 0;
    
    rows.forEach((row, rowIndex) => {
      if (row.classList.contains('group-header')) return;
      
      const cells = Array.from(row.cells || []);
      if (cells.length === 0) return;
      if (cells.length === 1 && cells[0].colSpan > 1) return;
      
      // Для каждой ячейки находим соответствующий заголовок по data-column
      cells.forEach((cell) => {
        const cellColumnName = cell.getAttribute('data-column');
        if (!cellColumnName) {
          // Если у ячейки нет data-column, пропускаем
          return;
        }
        
        // Находим заголовок с таким же data-column
        const matchingTh = ths.find(th => {
          const thColumnName = th.getAttribute('data-column');
          return thColumnName === cellColumnName;
        });
        
        if (matchingTh) {
          const columnIndex = matchingTh.getAttribute('data-column-index');
          if (columnIndex !== null) {
            cell.setAttribute('data-column-index', columnIndex);
            numberedCellsCount++;
          }
        }
      });
    });
    
    log('LOG', 'Колонки пронумерованы', {
      headersCount: ths.length,
      numberedCellsCount,
      totalRows: rows.length
    });
  }

  // ============================================
  // Загрузка и сохранение настроек
  // ============================================

  /**
   * Загружает настройки колонок с сервера
   */
  async function loadColumnSettings() {
    try {
      if (typeof window.api !== 'function') {
        log('WARN', 'API функция недоступна');
        return;
      }
      
      // Загружаем все настройки пользователя
      const allSettings = await window.api('/api/settings/user');
      
      if (allSettings && allSettings[SETTINGS_KEY_COLUMN_ORDER]) {
        try {
          const parsedOrder = JSON.parse(allSettings[SETTINGS_KEY_COLUMN_ORDER]);
          if (Array.isArray(parsedOrder) && parsedOrder.length > 0) {
            columnSettings.order = parsedOrder;
            log('LOG', 'Порядок колонок загружен из БД', {
              orderLength: columnSettings.order.length,
              order: columnSettings.order.slice(0, 10)
            });
          } else {
            log('WARN', 'Загруженный порядок колонок пуст или некорректен');
            columnSettings.order = [];
          }
        } catch (e) {
          log('ERROR', 'Ошибка парсинга порядка колонок', e);
          columnSettings.order = [];
        }
      } else {
        log('LOG', 'Сохраненный порядок колонок не найден');
        columnSettings.order = [];
      }
      
      // Ширины колонок загружаются через существующую систему columns.js
      // Здесь мы только инициализируем пустой объект
      columnSettings.widths = {};
      
    } catch (e) {
      log('ERROR', 'Ошибка загрузки настроек колонок', e);
      columnSettings.order = [];
      columnSettings.widths = {};
    }
  }

  /**
   * Сохраняет настройки колонок на сервер
   */
  async function saveColumnSettings() {
    try {
      if (typeof window.api !== 'function') {
        log('WARN', 'API функция недоступна');
        return;
      }
      
      // Сохраняем порядок колонок
      if (columnSettings.order && columnSettings.order.length > 0) {
        const orderValue = JSON.stringify(columnSettings.order);
        
        await window.api(`/api/settings/user/${SETTINGS_KEY_COLUMN_ORDER}`, {
          method: 'PUT',
          body: JSON.stringify({ value: orderValue })
        });
        
        log('LOG', 'Порядок колонок сохранен в БД', {
          orderLength: columnSettings.order.length,
          order: columnSettings.order.slice(0, 10),
          savedValue: orderValue.substring(0, 100)
        });
      }
      
      // Ширины колонок сохраняются через существующую систему columns.js
      // Здесь мы не сохраняем их отдельно
      
    } catch (e) {
      log('ERROR', 'Ошибка сохранения настроек колонок', e);
      throw e;
    }
  }

  /**
   * Обновляет порядок колонок из текущего DOM
   * Сохраняет порядок как массив имен колонок (data-column) для стабильности
   */
  function updateColumnOrder() {
    if (!routingTable) {
      log('WARN', 'Таблица маршрутов не найдена для обновления порядка');
      return;
    }
    
    const ths = getColumnHeaders(routingTable);
    if (ths.length === 0) {
      log('WARN', 'Заголовки колонок не найдены');
      return;
    }
    
    // Сохраняем порядок как массив имен колонок (data-column) в текущем порядке DOM
    // Это более стабильно, чем номера, так как имена не меняются
    const newOrder = [];
    ths.forEach((th) => {
      const columnName = th.getAttribute('data-column');
      if (columnName && columnName.length > 0) {
        newOrder.push(columnName);
      } else {
        // Если нет data-column, используем текст заголовка
        const columnNameFallback = getColumnName(th);
        if (columnNameFallback) {
          newOrder.push(columnNameFallback);
        }
      }
    });
    
    // Сохраняем как массив имен: ["no", "order", "date", ...]
    columnSettings.order = newOrder;
    
    log('LOG', 'Порядок колонок обновлен из DOM (по именам)', {
      orderLength: newOrder.length,
      order: newOrder.slice(0, 10)
    });
  }

  // ============================================
  // Применение порядка колонок
  // ============================================

  /**
   * Применяет сохраненный порядок колонок к таблице
   */
  function applyColumnOrder(table) {
    if (!columnSettings.order || columnSettings.order.length === 0) {
      log('LOG', 'Сохраненный порядок колонок отсутствует, используем порядок по умолчанию');
      return;
    }
    
    const thead = table.querySelector('thead');
    if (!thead) return;
    
    const ths = getColumnHeaders(table);
    const tbody = table.querySelector('tbody');
    
    if (ths.length === 0) {
      log('WARN', 'Заголовки колонок не найдены');
      return;
    }
    
    log('LOG', 'Применение порядка колонок по номерам', {
      savedOrderLength: columnSettings.order.length,
      currentHeadersCount: ths.length,
      savedOrder: columnSettings.order.slice(0, 10)
    });
    
    // Создаем карту колонок по номеру (data-column-index)
    const columnMapByIndex = new Map();
    ths.forEach((th, currentIndex) => {
      const columnIndex = th.getAttribute('data-column-index');
      if (columnIndex !== null) {
        columnMapByIndex.set(parseInt(columnIndex, 10), { th, currentIndex });
      } else {
        // Если номера нет, используем текущий индекс как номер
        columnMapByIndex.set(currentIndex, { th, currentIndex });
      }
    });
    
    // Сортируем колонки по сохраненному порядку (массив номеров)
    const orderedColumns = [];
    const unorderedColumns = [];
    
    if (Array.isArray(columnSettings.order) && columnSettings.order.length > 0) {
      // Сохраненный порядок - это массив номеров: [0, 1, 2, 3, 4, 5...]
      columnSettings.order.forEach((savedIndex) => {
        if (columnMapByIndex.has(savedIndex)) {
          orderedColumns.push(columnMapByIndex.get(savedIndex));
          columnMapByIndex.delete(savedIndex);
        }
      });
    }
    
    // Добавляем колонки, которых нет в сохраненном порядке
    columnMapByIndex.forEach(({ th, currentIndex }) => {
      unorderedColumns.push({ th, currentIndex });
    });
    
    const finalOrder = [...orderedColumns, ...unorderedColumns];
    
    // Переупорядочиваем th в thead
    const parentRow = ths[0].parentElement;
    if (!parentRow) {
      log('ERROR', 'Родительская строка thead не найдена');
      return;
    }
    
    finalOrder.forEach(({ th }) => {
      parentRow.appendChild(th);
    });
    
    // Переупорядочиваем ячейки в tbody
    if (tbody) {
      const rows = Array.from(tbody.querySelectorAll('tr'));
      let reorderedRowsCount = 0;
      
      rows.forEach(row => {
        // Пропускаем групповые заголовки
        if (row.classList.contains('group-header')) return;
        
        const cells = Array.from(row.cells || []);
        
        // Пропускаем строки с неправильным количеством ячеек
        if (cells.length === 0) return;
        if (cells.length === 1 && cells[0].colSpan > 1) return;
        if (cells.length !== ths.length) return;
        
        // ВАЖНО: Создаем карту ячеек по имени (data-column) для точного сопоставления
        const cellMapByName = new Map();
        const cellsWithoutName = [];
        
        cells.forEach((cell, cellIndex) => {
          const columnName = cell.getAttribute('data-column');
          if (columnName) {
            cellMapByName.set(columnName, cell);
          } else {
            // Логируем ячейки без data-column для диагностики
            cellsWithoutName.push({ index: cellIndex, text: cell.textContent.trim().substring(0, 20) });
          }
        });
        
        if (cellsWithoutName.length > 0 && reorderedRowsCount === 0) {
          log('WARN', 'Найдены ячейки без data-column атрибута', {
            rowIndex: rows.indexOf(row),
            cellsWithoutName: cellsWithoutName.slice(0, 3)
          });
        }
        
        // Создаем массив ячеек в правильном порядке на основе finalOrder (по именам)
        const reorderedCells = [];
        const missingColumns = [];
        
        finalOrder.forEach(({ th }) => {
          const columnName = th.getAttribute('data-column') || getColumnName(th);
          if (cellMapByName.has(columnName)) {
            reorderedCells.push(cellMapByName.get(columnName));
          } else {
            missingColumns.push(columnName);
          }
        });
        
        // Добавляем ячейки, которых нет в finalOrder (на всякий случай)
        cells.forEach((cell) => {
          if (!reorderedCells.includes(cell)) {
            reorderedCells.push(cell);
          }
        });
        
        if (reorderedCells.length === cells.length) {
          // ВАЖНО: Сохраняем все атрибуты и обработчики событий
          // Удаляем все ячейки из строки
          while (row.firstChild) {
            row.removeChild(row.firstChild);
          }
          
          // Добавляем их в правильном порядке
          reorderedCells.forEach(cell => {
            row.appendChild(cell);
          });
          
          reorderedRowsCount++;
          
          if (missingColumns.length > 0 && reorderedRowsCount <= 3) {
            log('WARN', 'Некоторые колонки не найдены в ячейках', {
              rowIndex: rows.indexOf(row),
              missingColumns: missingColumns.slice(0, 3),
              cellMapKeys: Array.from(cellMap.keys()).slice(0, 5)
            });
          }
        } else {
          log('WARN', 'Количество переупорядоченных ячеек не совпадает', {
            expected: cells.length,
            actual: reorderedCells.length,
            rowIndex: rows.indexOf(row),
            missingColumns: missingColumns.slice(0, 3)
          });
        }
      });
      
      log('LOG', 'Ячейки переупорядочены', {
        totalRows: rows.length,
        reorderedRowsCount
      });
    }
    
    log('LOG', 'Порядок колонок применен', {
      orderedCount: orderedColumns.length,
      unorderedCount: unorderedColumns.length,
      totalColumns: finalOrder.length
    });
  }

  /**
   * Применяет сохраненные ширины колонок
   * Использует существующую систему из columns.js
   */
  function applyColumnWidths(table) {
    // Ширины колонок применяются через существующую систему columns.js
    // Функция restoreColumnWidths вызывается автоматически после renderOps
    // Здесь мы только логируем
    log('LOG', 'Ширины колонок будут применены через columns.js');
  }

  /**
   * Сохраняет ширины колонок через существующую систему columns.js
   */
  function saveColumnWidths() {
    if (!routingTable) return;
    
    // Используем существующую систему из columns.js
    if (typeof getTableKey === 'function' && typeof saveAllColumnWidths === 'function') {
      try {
        const tableKey = getTableKey(routingTable);
        const ths = getColumnHeaders(routingTable);
        
        // Получаем текущие ширины всех колонок в правильном порядке
        const widthsArray = [];
        ths.forEach((th) => {
          const width = th.getBoundingClientRect().width;
          if (width > 0) {
            widthsArray.push(Math.round(width));
          }
        });
        
        // Сохраняем через существующую систему columns.js
        // Формат: { tableKey: [width1, width2, ...] }
        const allWidths = {};
        allWidths[tableKey] = widthsArray;
        saveAllColumnWidths(allWidths);
        
        log('LOG', 'Ширины колонок сохранены через columns.js', {
          tableKey,
          widthsCount: Object.keys(widths).length
        });
      } catch (e) {
        log('ERROR', 'Ошибка сохранения ширин колонок', e);
      }
    }
  }

  // ============================================
  // Drag and Drop для перестановки колонок
  // ============================================

  /**
   * Перемещает колонку из одной позиции в другую
   * ВАЖНО: Использует data-column-index (номера колонок) для точного сопоставления
   * Все ячейки с тем же номером перемещаются вместе с заголовком
   */
  function moveColumn(fromIndex, toIndex) {
    if (!routingTable) return;
    
    const ths = getColumnHeaders(routingTable);
    if (fromIndex < 0 || fromIndex >= ths.length || toIndex < 0 || toIndex >= ths.length) {
      log('WARN', 'Некорректные индексы для перемещения колонки', { fromIndex, toIndex, headersCount: ths.length });
      return;
    }
    
    if (fromIndex === toIndex) return;
    
    const thead = routingTable.querySelector('thead');
    if (!thead) return;
    
    const parentRow = ths[0].parentElement;
    if (!parentRow) return;
    
    // Получаем имя (data-column) перемещаемой колонки
    const draggedTh = ths[fromIndex];
    const draggedColumnName = draggedTh.getAttribute('data-column') || getColumnName(draggedTh);
    
    // Получаем имя целевой колонки
    const targetTh = ths[toIndex];
    const targetColumnName = targetTh.getAttribute('data-column') || getColumnName(targetTh);
    
    if (!draggedColumnName || !targetColumnName) {
      log('ERROR', 'Колонки не имеют data-column атрибута', {
        draggedColumnName,
        targetColumnName
      });
      return;
    }
    
    log('LOG', 'Перемещение колонки по именам', {
      fromIndex,
      toIndex,
      draggedColumnName,
      targetColumnName
    });
    
    // Перемещаем th
    if (fromIndex < toIndex) {
      parentRow.insertBefore(draggedTh, targetTh.nextSibling);
    } else {
      parentRow.insertBefore(draggedTh, targetTh);
    }
    
    // Перемещаем ячейки во всех строках tbody
    // ВАЖНО: Используем data-column для точного сопоставления
    // Все ячейки с именем draggedColumnName перемещаются вместе
    const tbody = routingTable.querySelector('tbody');
    if (tbody) {
      const rows = Array.from(tbody.querySelectorAll('tr'));
      let movedCellsCount = 0;
      
      rows.forEach(row => {
        if (row.classList.contains('group-header')) return;
        
        const cells = Array.from(row.cells || []);
        if (cells.length === 0) return;
        if (cells.length === 1 && cells[0].colSpan > 1) return;
        
        // Находим ячейку по data-column (перемещаемая колонка)
        let draggedCell = null;
        let targetCell = null;
        
        cells.forEach(cell => {
          const cellColumnName = cell.getAttribute('data-column');
          if (cellColumnName === draggedColumnName) {
            draggedCell = cell;
          }
          if (cellColumnName === targetColumnName) {
            targetCell = cell;
          }
        });
        
        if (draggedCell && targetCell) {
          if (fromIndex < toIndex) {
            row.insertBefore(draggedCell, targetCell.nextSibling);
          } else {
            row.insertBefore(draggedCell, targetCell);
          }
          movedCellsCount++;
        } else if (draggedCell && !targetCell) {
          // Если целевая ячейка не найдена, просто перемещаем в конец
          row.appendChild(draggedCell);
          movedCellsCount++;
        } else {
          log('WARN', 'Не найдены ячейки для перемещения', {
            draggedColumnName,
            targetColumnName,
            hasDraggedCell: !!draggedCell,
            hasTargetCell: !!targetCell
          });
        }
      });
      
      log('LOG', 'Ячейки перемещены по именам', {
        totalRows: rows.length,
        movedCellsCount,
        draggedColumnName
      });
    }
    
    // Обновляем порядок колонок
    updateColumnOrder();
    
    log('LOG', 'Колонка перемещена', { 
      fromIndex, 
      toIndex, 
      columnName: draggedColumnName 
    });
  }

  /**
   * Инициализирует drag-and-drop для колонок
   */
  function initColumnDragAndDrop(table) {
    if (!table) return;
    
    const ths = getColumnHeaders(table);
    if (ths.length === 0) {
      log('WARN', 'Заголовки колонок не найдены для drag-and-drop');
      return;
    }
    
    ths.forEach((th, index) => {
      // Делаем заголовок перетаскиваемым
      th.setAttribute('draggable', 'true');
      th.style.cursor = 'move';
      
      // Добавляем визуальный индикатор для захвата
      if (!th.querySelector('.drag-handle')) {
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.textContent = '⋮⋮';
        dragHandle.style.cssText = 'opacity:0.3;margin-right:4px;font-size:12px;cursor:move;user-select:none;';
        th.insertBefore(dragHandle, th.firstChild);
      }
      
      // Обработчик начала перетаскивания
      th.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        const columnName = th.getAttribute('data-column') || getColumnName(th);
        e.dataTransfer.setData('text/plain', index.toString());
        e.dataTransfer.setData('column-name', columnName);
        
        // Добавляем класс к заголовку
        th.classList.add('column-dragging');
        
        // ВАЖНО: Добавляем класс ко ВСЕМ ячейкам этой колонки по data-column
        // Это гарантирует, что подсветится ВСЯ колонка (заголовок + все ячейки)
        const tbody = table.querySelector('tbody');
        if (tbody && columnName) {
          const rows = Array.from(tbody.querySelectorAll('tr'));
          let highlightedCellsCount = 0;
          
          rows.forEach(row => {
            if (row.classList.contains('group-header')) return;
            const cells = Array.from(row.cells || []);
            
            cells.forEach(cell => {
              const cellColumnName = cell.getAttribute('data-column');
              if (cellColumnName === columnName) {
                cell.classList.add('column-dragging');
                highlightedCellsCount++;
              }
            });
          });
          
          log('LOG', 'Начало перетаскивания колонки - ВСЯ КОЛОНКА подсвечена', { 
            index, 
            columnName,
            highlightedCellsCount,
            totalRows: rows.length
          });
        }
      });
      
      // Обработчик окончания перетаскивания
      th.addEventListener('dragend', (e) => {
        const columnName = th.getAttribute('data-column') || getColumnName(th);
        
        th.classList.remove('column-dragging');
        th.classList.remove('column-drag-over');
        th.removeAttribute('data-insert-left');
        th.removeAttribute('data-insert-right');
        
        // ВАЖНО: Убираем класс со всех ячеек по data-column
        const tbody = table.querySelector('tbody');
        if (tbody && columnName) {
          const rows = Array.from(tbody.querySelectorAll('tr'));
          rows.forEach(row => {
            if (row.classList.contains('group-header')) return;
            const cells = Array.from(row.cells || []);
            cells.forEach(cell => {
              const cellColumnName = cell.getAttribute('data-column');
              if (cellColumnName === columnName) {
                cell.classList.remove('column-dragging');
              }
              cell.classList.remove('column-drag-over');
            });
          });
        }
        
        // Убираем классы со всех заголовков и ячеек
        const allThs = getColumnHeaders(table);
        allThs.forEach(otherTh => {
          otherTh.classList.remove('column-drag-over');
          otherTh.removeAttribute('data-insert-left');
          otherTh.removeAttribute('data-insert-right');
        });
        
        // Убираем классы со всех ячеек
        if (tbody) {
          const allRows = Array.from(tbody.querySelectorAll('tr'));
          allRows.forEach(row => {
            if (row.classList.contains('group-header')) return;
            const cells = Array.from(row.cells || []);
            cells.forEach(cell => {
              cell.classList.remove('column-drag-over');
            });
          });
        }
        
        log('LOG', 'Окончание перетаскивания колонки', { columnName });
      });
      
      // Обработчик наведения при перетаскивании
      th.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const dragIndex = parseInt(e.dataTransfer.getData('text/plain') || '-1');
        const draggedColumnName = e.dataTransfer.getData('column-name') || '';
        if (dragIndex === -1) return;
        
        const currentColumnName = th.getAttribute('data-column') || getColumnName(th);
        
        // Показываем индикатор только если это не та же колонка
        if (dragIndex !== index && draggedColumnName !== currentColumnName) {
          // Убираем индикаторы с других колонок
          const allThs = getColumnHeaders(table);
          allThs.forEach(otherTh => {
            if (otherTh !== th) {
              otherTh.removeAttribute('data-insert-left');
              otherTh.removeAttribute('data-insert-right');
            }
          });
          
          // Добавляем класс к заголовку
          th.classList.add('column-drag-over');
          
          // Определяем, куда вставлять (слева или справа от этой колонки)
          const rect = th.getBoundingClientRect();
          const mouseX = e.clientX;
          const thCenter = rect.left + rect.width / 2;
          
          if (mouseX < thCenter) {
            // Вставляем СЛЕВА от этой колонки
            th.setAttribute('data-insert-left', 'true');
            th.removeAttribute('data-insert-right');
          } else {
            // Вставляем СПРАВА от этой колонки
            th.setAttribute('data-insert-right', 'true');
            th.removeAttribute('data-insert-left');
          }
          
          // ВАЖНО: Добавляем класс ко ВСЕМ ячейкам этой колонки по data-column
          // Это показывает, куда встанет перетаскиваемая колонка
          const tbody = table.querySelector('tbody');
          if (tbody && currentColumnName) {
            const rows = Array.from(tbody.querySelectorAll('tr'));
            rows.forEach(row => {
              if (row.classList.contains('group-header')) return;
              const cells = Array.from(row.cells || []);
              
              cells.forEach(cell => {
                const cellColumnName = cell.getAttribute('data-column');
                if (cellColumnName === currentColumnName) {
                  cell.classList.add('column-drag-over');
                }
              });
            });
          }
        }
      });
      
      // Обработчик ухода курсора
      th.addEventListener('dragleave', (e) => {
        const currentColumnName = th.getAttribute('data-column') || getColumnName(th);
        
        th.classList.remove('column-drag-over');
        th.removeAttribute('data-insert-left');
        th.removeAttribute('data-insert-right');
        
        // ВАЖНО: Убираем класс со всех ячеек этой колонки по data-column
        const tbody = table.querySelector('tbody');
        if (tbody && currentColumnName) {
          const rows = Array.from(tbody.querySelectorAll('tr'));
          rows.forEach(row => {
            if (row.classList.contains('group-header')) return;
            const cells = Array.from(row.cells || []);
            
            cells.forEach(cell => {
              const cellColumnName = cell.getAttribute('data-column');
              if (cellColumnName === currentColumnName) {
                cell.classList.remove('column-drag-over');
              }
            });
          });
        }
      });
      
      // Обработчик сброса (drop)
      th.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const dragIndex = parseInt(e.dataTransfer.getData('text/plain') || '-1');
        const draggedColumnName = e.dataTransfer.getData('column-name') || '';
        if (dragIndex === -1) return;
        
        // Убираем индикаторы
        th.classList.remove('column-drag-over');
        const insertLeft = th.hasAttribute('data-insert-left');
        th.removeAttribute('data-insert-left');
        th.removeAttribute('data-insert-right');
        
        // Определяем целевую позицию на основе индикатора
        let toIndex = index;
        if (insertLeft) {
          // Вставляем СЛЕВА от этой колонки
          toIndex = index;
        } else {
          // Вставляем СПРАВА от этой колонки
          toIndex = index + 1;
        }
        
        // Ограничиваем индекс
        const thsAfterDrag = getColumnHeaders(table);
        if (toIndex > thsAfterDrag.length) {
          toIndex = thsAfterDrag.length;
        }
        if (toIndex < 0) {
          toIndex = 0;
        }
        
        // Перемещаем колонку только если позиция изменилась
        if (dragIndex !== toIndex) {
          log('LOG', 'Перемещение колонки в новую позицию', {
            fromIndex: dragIndex,
            toIndex,
            draggedColumnName
          });
          
          moveColumn(dragIndex, toIndex);
          
          // ВАЖНО: После перемещения перенумеровываем колонки
          numberAllColumns(table);
          
          // Сохраняем порядок и ширины
          updateColumnOrder();
          
          // Сохраняем ширины через существующую систему columns.js
          saveColumnWidths();
          
          // ВАЖНО: Сохраняем порядок в БД СРАЗУ после перемещения
          saveColumnSettings().then(() => {
            log('LOG', 'Порядок колонок успешно сохранен в БД', {
              order: columnSettings.order.slice(0, 10)
            });
            
            // Показываем уведомление через 2 секунды
            setTimeout(() => {
              if (typeof window.toast === 'function') {
                window.toast('✅ Место для колонки сохранено в базе данных', 'success');
              }
            }, 2000);
          }).catch(err => {
            log('ERROR', 'Ошибка сохранения порядка колонок в БД', err);
            if (typeof window.toast === 'function') {
              window.toast('❌ Ошибка сохранения порядка колонок', 'error');
            }
          });
        } else {
          log('LOG', 'Колонка не перемещена (позиция не изменилась)', {
            dragIndex,
            toIndex
          });
        }
      });
    });
    
    log('LOG', 'Drag-and-drop инициализирован', { columnsCount: ths.length });
  }

  // ============================================
  // Инициализация
  // ============================================

  /**
   * Инициализирует менеджер колонок для таблицы маршрутов
   */
  async function initRoutingColumnManager() {
    log('LOG', 'Инициализация менеджера колонок');
    
    const routingPane = document.getElementById(ROUTING_TABLE_ID);
    if (!routingPane) {
      log('WARN', 'Панель маршрутов не найдена');
      return;
    }
    
    routingTable = routingPane.querySelector('table.resizable-table');
    if (!routingTable) {
      log('WARN', 'Таблица маршрутов не найдена');
      return;
    }
    
    // ВАЖНО: Сначала нумеруем все колонки (th и td)
    // Это должно быть сделано ДО применения порядка
    numberAllColumns(routingTable);
    
    // Загружаем настройки
    await loadColumnSettings();
    
    // Применяем сохраненный порядок
    if (columnSettings.order && columnSettings.order.length > 0) {
      applyColumnOrder(routingTable);
      
      // ВАЖНО: После применения порядка нужно перенумеровать колонки заново
      // чтобы номера соответствовали новому порядку
      numberAllColumns(routingTable);
      
      // Применяем порядок еще раз через небольшую задержку,
      // чтобы убедиться, что он применился после всех операций рендеринга
      setTimeout(() => {
        applyColumnOrder(routingTable);
        numberAllColumns(routingTable);
        log('LOG', 'Порядок колонок применен повторно после задержки');
      }, 300);
    } else {
      // Если сохраненного порядка нет, обновляем порядок из текущего DOM
      updateColumnOrder();
    }
    
    // Ширины колонок применяются через существующую систему columns.js
    // Она автоматически загрузит и применит ширины при инициализации
    // Функция restoreColumnWidths вызывается в routing.js после renderOps
    
    // Инициализируем drag-and-drop
    initColumnDragAndDrop(routingTable);
    
    log('LOG', 'Менеджер колонок инициализирован');
  }

  // Экспортируем функции
  window.initRoutingColumnManager = initRoutingColumnManager;
  window.applyRoutingColumnOrder = function() {
    if (routingTable) {
      applyColumnOrder(routingTable);
    }
  };

  // Автоматическая инициализация при загрузке
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initRoutingColumnManager, 1000);
    });
  } else {
    setTimeout(initRoutingColumnManager, 1000);
  }

})();

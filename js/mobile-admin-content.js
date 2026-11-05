/* Mobile presentation only: keep the original fields, rows and event handlers. */
(function () {
  'use strict';
  if (window.BboxMobileContent) return;

  const ROOTS = '.pane, .modal, [role="dialog"], dialog, .bbox-mobile-overlay';
  const COLUMN_NAMES = {
    'reset-setup': 'Сброс наладки', 'reset-work': 'Сброс работы',
    files: 'Файлы и чертежи', materials: 'Материалы', cutting: 'Раскрой',
    'link-item': 'Связать с изделием', qr: 'QR-код', dup: 'Копировать',
    del: 'Удалить', delete: 'Удалить', setup: 'Наладка', work: 'Работа',
    'reset-sort': 'Сброс сортировки'
  };
  let queued = false;
  let observer;
  const expandedOperations = new Set();
  const ROUTE_SUMMARY = new Set(['no', 'order', 'date', 'machine', 'operator', 'operation', 'plan', 'fact', 'completion', 'status']);

  function setClass(node, name, enabled) {
    if (node.classList.contains(name) !== enabled) node.classList.toggle(name, enabled);
  }

  // Read header text without the column-resize/save widgets injected by legacy code.
  function headerLabel(header) {
    if (COLUMN_NAMES[header.dataset.column]) return COLUMN_NAMES[header.dataset.column];
    const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (parent && !parent.closest('button, input, select, .resize-handle, .save-width-btn, .column-resize-handle, .drag-handle')) {
        parts.push(walker.currentNode.textContent);
      }
    }
    return parts.join(' ').replace(/[▲▼↑↓⋮]/g, '').replace(/\s+/g, ' ').trim();
  }

  function prepareRouteDisclosure(row, cells) {
    if (!row.closest('#routing') || !cells.some(cell => cell.dataset.column === 'operation')) return;
    const holder = cells.find(cell => cell.dataset.column === 'order');
    if (!holder) return;
    const key = row.dataset.opId;
    setClass(row, 'bbox-mobile-route-row', true);
    cells.forEach(cell => setClass(cell, 'bbox-mobile-route-detail', !ROUTE_SUMMARY.has(cell.dataset.column)));
    let toggle = holder.querySelector('.bbox-mobile-route-toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'bbox-mobile-route-toggle';
      // CSS supplies the visible label so legacy table text exports retain original values.
      toggle.addEventListener('click', event => {
        event.stopPropagation();
        const expanded = !row.classList.contains('bbox-mobile-route-expanded');
        setClass(row, 'bbox-mobile-route-expanded', expanded);
        if (key) expanded ? expandedOperations.add(key) : expandedOperations.delete(key);
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.setAttribute('aria-label', expanded ? 'Свернуть' : 'Подробнее');
      });
      holder.appendChild(toggle);
    }
    const expanded = key ? expandedOperations.has(key) : row.classList.contains('bbox-mobile-route-expanded');
    setClass(row, 'bbox-mobile-route-expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Свернуть' : 'Подробнее');
    toggle.title = 'Время, материалы, файлы и действия с операцией';
  }

  function headerCells(table) {
    if (!table.tHead) return [];
    const row = Array.from(table.tHead.rows).find(item =>
      !item.classList.contains('save-width-row') && item.cells.length > 1);
    return row ? Array.from(row.cells) : [];
  }

  function scrollFallback(table) {
    setClass(table, 'bbox-mobile-card-table', false);
    let host = table.parentElement;
    if (!host) return;
    if (!host.classList.contains('table-wrapper') &&
        !host.classList.contains('bbox-mobile-table-host') &&
        !host.classList.contains('bbox-mobile-table-scroll') &&
        !(/auto|scroll/.test(host.style.overflow + host.style.overflowX) && host.children.length === 1)) {
      host = document.createElement('div');
      table.before(host);
      host.appendChild(table);
      host.classList.add('bbox-mobile-table-host');
    }
    setClass(host, 'bbox-mobile-table-scroll', true);
    const hint = 'Таблицу можно прокручивать влево и вправо';
    if (host.dataset.mobileScrollHint !== hint) host.dataset.mobileScrollHint = hint;
    if (!host.hasAttribute('tabindex')) host.tabIndex = 0;
    if (!host.hasAttribute('aria-label')) host.setAttribute('aria-label', hint);
  }

  function prepareTable(table) {
    if (table.closest('#techcards, #printArea, .qr-modal-table')) return;
    const headers = headerCells(table);
    const rows = Array.from(table.tBodies).flatMap(body => Array.from(body.rows));
    // A full-width grouped row (completed route operations) can hold its own independent cards.
    // Other nested matrices and canvases retain their native layout in a local scroller.
    const complexNested = Array.from(table.querySelectorAll('table')).some(nested => {
      const cell = nested.closest('td');
      return !cell || cell.parentElement.cells.length !== 1;
    });
    const irregular = !headers.length || headers.some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1) ||
      complexNested || table.querySelector('canvas') || rows.some(row =>
        row.cells.length > 1 && Array.from(row.cells).some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1));
    if (irregular) { scrollFallback(table); return; }
    const columnLabels = new Map(headers.filter(cell => cell.dataset.column).map(cell => [cell.dataset.column, headerLabel(cell)]));
    const labels = headers.map(headerLabel);
    // Routing rows intentionally omit some configurable columns, hence the key-based lookup.
    if (rows.some(row => row.cells.length > 1 && row.cells.length !== headers.length &&
        !Array.from(row.cells).every(cell => cell.dataset.column && columnLabels.has(cell.dataset.column)))) {
      scrollFallback(table); return;
    }
    setClass(table, 'bbox-mobile-card-table', true);
    if (table.parentElement.classList.contains('bbox-mobile-table-scroll')) {
      setClass(table.parentElement, 'bbox-mobile-table-scroll', false);
      table.parentElement.removeAttribute('data-mobile-scroll-hint');
    }
    headers.forEach(header => {
      const interactive = !!(header.dataset.sort || header.onclick || header.hasAttribute('onclick') || header.querySelector('button:not(.save-width-btn), input[type="checkbox"]'));
      setClass(header, 'bbox-mobile-sort-control', interactive);
    });
    rows.forEach(row => {
      const cells = Array.from(row.cells);
      const single = cells.length === 1;
      setClass(row, 'bbox-mobile-message-row', single);
      cells.forEach((cell, index) => {
        const label = single ? '' : (columnLabels.get(cell.dataset.column) || labels[index] || 'Действия');
        if (cell.dataset.mobileLabel !== label) cell.dataset.mobileLabel = label;
        const actions = /^(Действия|Удалить|Копировать|Сброс |Файлы|Материалы$|Раскрой$|Связать|QR-код)/.test(label) &&
          !!cell.querySelector('button, input[type="checkbox"]');
        const primary = /^(Клиент|Название|Материал$|Изделие$|Операция$|Название операции|Оператор$)/i.test(label) && !actions;
        const wide = primary || single || /Описание|Примечани|Причина|Набор изделий|Рецептура|Откуда|Куда|Работа|Наладка/.test(label) ||
          !!cell.querySelector('textarea, select, input[type="text"], input:not([type])');
        setClass(cell, 'bbox-mobile-primary-cell', primary);
        setClass(cell, 'bbox-mobile-action-cell', actions);
        setClass(cell, 'bbox-mobile-wide-cell', wide || (actions && cell.querySelectorAll('button').length > 1));
        const empty = !cell.classList.contains('editable') && !cell.textContent.trim() &&
          !cell.querySelector('button, input, select, textarea, img, svg');
        setClass(cell, 'bbox-mobile-empty-cell', empty);
        if (label) cell.querySelectorAll('input, select, textarea').forEach(field => {
          if (!field.hasAttribute('aria-label') && !field.hasAttribute('aria-labelledby') && !field.labels?.length) {
            field.setAttribute('aria-label', field.getAttribute('placeholder') || label);
          }
        });
      });
      prepareRouteDisclosure(row, cells);
    });
  }

  function annotateContent() {
    if (!document.body.classList.contains('bbox-mobile-admin')) return;
    // Some older pickers are anonymous fixed overlays instead of .modal elements.
    Array.from(document.body.children).forEach(element => {
      if (element.id !== 'loginPage' && element.style.position === 'fixed' &&
          element.querySelector('input, select, textarea, table, .srcTargetOption') &&
          element.querySelector('button')) {
        setClass(element, 'bbox-mobile-overlay', true);
      }
    });
    document.querySelectorAll(ROOTS).forEach(root => {
      if (!root.getClientRects().length) return;
      root.querySelectorAll('table').forEach(prepareTable);
      root.querySelectorAll('[style]').forEach(element => {
        if (element.closest('svg, #designer, #cutting, #cutting-simple')) return;
        const size = parseFloat(element.style.fontSize);
        if (size > 0 && size < 14 && !element.matches('button, input, select, textarea')) {
          setClass(element, 'bbox-mobile-small-text', true);
        }
        if (element.style.display === 'grid' && element.style.gridTemplateColumns &&
            element.querySelector('input, select, textarea') && !element.closest('#techcards')) {
          setClass(element, 'bbox-mobile-form-grid', true);
        }
        if (element.style.display === 'flex' && element.style.flexDirection !== 'column' &&
            !element.matches('button, .btn') && !element.closest('#techcards')) {
          setClass(element, 'bbox-mobile-flex-wrap', true);
          Array.from(element.children).forEach(child => {
            if (child.matches('div, label') && !child.querySelector('table') &&
                child.querySelector('select, textarea, input:not([type="checkbox"]):not([type="radio"])')) {
              setClass(child, 'bbox-mobile-form-item', true);
            }
          });
        }
        if (element.style.minWidth && !element.matches('table, th, td, canvas, svg') &&
            !element.closest('.bbox-mobile-table-scroll')) {
          setClass(element, 'bbox-mobile-width-safe', true);
        }
      });
    });
  }

  function observe() {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'style', 'data-column', 'colspan', 'rowspan'] });
  }

  function schedule() {
    if (queued || !observer) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      // Annotation is synchronous; disconnect to avoid observing our own classes/wrappers.
      observer.disconnect();
      try { annotateContent(); } finally { observe(); }
    });
  }

  function init() {
    observer = new MutationObserver(schedule);
    observe();
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
  }
  window.BboxMobileContent = { refresh: schedule };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());

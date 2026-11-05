/** B'BOX column widths. One resize owner, one account-scoped cache, no per-render document listeners. */
let serverColumnWidths = null; // Kept for the existing startup diagnostic.
(function () {
  'use strict';
  const storagePrefix = 'bbox_column_widths';
  let owner = window.currentUser, epoch = 0, loadFlight = null, saveTimer = null, saveQueue = Promise.resolve();
  let currentResize = null;
  const bound = new WeakSet(), originalStyles = new WeakMap();
  const admin = () => window.currentUser?.role === 'admin' && Boolean(window.currentUser.userId);
  const ownerKey = () => {
    const user = window.currentUser;
    return user ? `${user.role}:${user.userId || user.username || user.operatorName || ''}` : 'guest';
  };
  const storageKey = () => `${storagePrefix}:${ownerKey()}`;
  const sameOwner = generation => generation === epoch && owner === window.currentUser;
  const clean = value => {
    const result = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    Object.entries(value).forEach(([key, widths]) => {
      if (Array.isArray(widths)) result[key] = widths.map(width => Number.isFinite(Number(width)) && Number(width) >= 50 ? Number(width) : 0);
    });
    return result;
  };
  function localWidths() {
    try {
      let raw = localStorage.getItem(storageKey());
      // Bind the previous shared cache to its first signed-in owner once.
      if (!raw && window.currentUser) {
        let legacyOwner = localStorage.getItem(storagePrefix + ':legacy-owner');
        if (!legacyOwner) { legacyOwner = ownerKey(); localStorage.setItem(storagePrefix + ':legacy-owner', legacyOwner); }
        if (legacyOwner === ownerKey()) raw = localStorage.getItem(storagePrefix);
      }
      return clean(JSON.parse(raw || '{}'));
    } catch (_) { return {}; }
  }
  function storeLocal(value) { try { localStorage.setItem(storageKey(), JSON.stringify(value)); } catch (error) { console.warn('Column widths could not be stored locally:', error); } }
  function stopResize(save = false) {
    const resize = currentResize;
    currentResize = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (!resize) return;
    document.body.style.cursor = ''; document.body.style.userSelect = '';
    resize.table.style.pointerEvents = ''; resize.th.style.cursor = '';
    if (save && sameOwner(resize.epoch) && resize.table.isConnected !== false) saveColumnWidths(resize.table).catch(error => console.warn('Column widths:', error));
  }
  function reset() {
    stopResize(); clearTimeout(saveTimer); saveTimer = null;
    epoch++; owner = window.currentUser; serverColumnWidths = null; loadFlight = null; saveQueue = Promise.resolve();
    document.querySelectorAll('table[data-resizable-initialized]').forEach(table => {
      headers(table).forEach(th => {
        const style = originalStyles.get(th);
        if (style) Object.assign(th.style, style);
      });
      table.querySelectorAll('tbody td').forEach(td => { td.style.width = ''; td.style.minWidth = ''; td.style.maxWidth = ''; });
    });
  }
  function ensureOwner() { if (owner !== window.currentUser) reset(); }
  async function getAllColumnWidths() { ensureOwner(); return { ...(serverColumnWidths || localWidths()) }; }
  function loadColumnWidthsFromServer(force = false) {
    ensureOwner();
    if (loadFlight) return loadFlight;
    if (!force && serverColumnWidths !== null) return Promise.resolve(serverColumnWidths);
    const generation = epoch;
    const flight = (async () => {
      let data = localWidths();
      if (admin()) {
        try {
          const settings = await window.api('/api/user-settings/user');
          if (!sameOwner(generation)) return null;
          if (settings?.column_widths) data = clean(typeof settings.column_widths === 'string' ? JSON.parse(settings.column_widths) : settings.column_widths);
        } catch (error) { if (sameOwner(generation)) console.warn('Column widths use account-local fallback:', error); }
      }
      if (!sameOwner(generation)) return null;
      serverColumnWidths = data;
      return data;
    })().finally(() => { if (loadFlight === flight) loadFlight = null; });
    loadFlight = flight; return flight;
  }
  async function saveAllColumnWidths(data) {
    ensureOwner();
    const generation = epoch;
    serverColumnWidths = { ...(serverColumnWidths || localWidths()), ...clean(data) };
    storeLocal(serverColumnWidths);
    if (!admin()) return { local: true };
    const save = saveQueue.catch(() => {}).then(async () => {
      if (!sameOwner(generation)) return { cancelled: true };
      // Merge updates made while the previous save was running; never retry a write.
      await window.api('/api/user-settings/user/column_widths', { method: 'PUT', body: JSON.stringify({ value: JSON.stringify(serverColumnWidths) }) });
      return { local: false };
    });
    saveQueue = save;
    return save;
  }
  function headers(table) { return Array.from(table.querySelectorAll('thead th')).filter(th => !th.closest('.save-width-row')); }
  function applyWidth(table, th, width) {
    const index = Array.from(th.parentElement.children).indexOf(th);
    const apply = cell => {
      cell.style.setProperty('width', width + 'px', 'important');
      cell.style.setProperty('min-width', width + 'px', 'important');
      cell.style.setProperty('max-width', 'none', 'important');
    };
    apply(th);
    table.querySelectorAll('tbody tr').forEach(row => {
      if (row.cells.length === 1 && row.cells[0].colSpan > 1) return;
      if (row.cells[index]) apply(row.cells[index]);
    });
    table.style.tableLayout = 'fixed';
  }
  async function restoreColumnWidths(table) {
    const generation = epoch, all = await getAllColumnWidths();
    if (!sameOwner(generation)) return;
    const widths = all[getTableKey(table)];
    if (!Array.isArray(widths)) return;
    headers(table).forEach((th, index) => { if (widths[index] >= 50) applyWidth(table, th, widths[index]); });
  }
  async function saveColumnWidths(table, forceImmediate = false) {
    ensureOwner();
    const generation = epoch;
    const widths = headers(table).map(th => Math.round(parseFloat(th.style.width) || th.getBoundingClientRect().width || th.offsetWidth || 0));
    if (!widths.some(width => width >= 50)) return;
    serverColumnWidths = { ...(serverColumnWidths || localWidths()), [getTableKey(table)]: widths };
    storeLocal(serverColumnWidths);
    clearTimeout(saveTimer); saveTimer = null;
    if (forceImmediate === true) return saveAllColumnWidths(serverColumnWidths);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (sameOwner(generation)) saveAllColumnWidths(serverColumnWidths).catch(error => window.toast?.('Ширина сохранена в этом браузере; сервер недоступен: ' + error.message));
    }, 500);
  }
  function onMove(event) {
    const resize = currentResize;
    if (!resize) return;
    if (!sameOwner(resize.epoch) || resize.table.isConnected === false) { stopResize(); return; }
    applyWidth(resize.table, resize.th, Math.max(50, resize.width + event.pageX - resize.x));
  }
  function onUp() { stopResize(true); }
  function bindHeader(table, th) {
    if (!originalStyles.has(th)) originalStyles.set(th, { width: th.style.width, minWidth: th.style.minWidth, maxWidth: th.style.maxWidth });
    let handle = th.querySelector('.resize-handle');
    if (!handle) { handle = document.createElement('div'); handle.className = 'resize-handle'; th.appendChild(handle); }
    if (bound.has(handle)) return;
    bound.add(handle); handle.setAttribute('data-handler-attached', 'true');
    handle.title = 'Перетащите для изменения ширины';
    Object.assign(handle.style, { position: 'absolute', right: '0', top: '0', width: '4px', height: '100%', cursor: 'col-resize', zIndex: '10', background: 'transparent', pointerEvents: 'auto', display: 'block' });
    if (getComputedStyle(th).position === 'static') th.style.position = 'relative';
    handle.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation(); ensureOwner(); stopResize();
      currentResize = { table, th, x: event.pageX, width: th.offsetWidth, epoch };
      document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
      table.style.pointerEvents = 'none'; th.style.cursor = 'col-resize';
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    });
  }
  function createSaveWidthButton(table) {
    if (table.querySelector('.save-width-btn')) return;
    const row = document.createElement('tr'); row.className = 'save-width-row';
    row.innerHTML = '<td colspan="100%" style="padding:6px 10px;text-align:right"><button class="save-width-btn btn primary" style="padding:5px 12px;font-size:12px">💾 Сохранить ширину</button></td>';
    const button = row.querySelector('button');
    button.onclick = async event => {
      event.preventDefault(); event.stopPropagation(); if (button.disabled) return;
      const generation = epoch; button.disabled = true;
      try {
        const result = await saveColumnWidths(table, true);
        if (sameOwner(generation)) window.toast?.(result?.local ? 'Ширина сохранена в этом браузере' : 'Ширина столбцов сохранена');
      } catch (error) { if (sameOwner(generation)) window.toast?.('Ширина сохранена в этом браузере; сервер недоступен: ' + error.message); }
      finally { button.disabled = false; }
    };
    table.querySelector('thead').appendChild(row);
  }
  async function makeTableResizable(table) {
    if (!table?.querySelector('thead')) return;
    ensureOwner(); const generation = epoch;
    headers(table).forEach(th => bindHeader(table, th));
    await loadColumnWidthsFromServer(); if (!sameOwner(generation)) return;
    await restoreColumnWidths(table); if (!sameOwner(generation)) return;
    createSaveWidthButton(table); table.setAttribute('data-resizable-initialized', 'true');
  }
  async function reinitResizableTables(container = document) {
    const tables = container.matches?.('table') ? [container] : Array.from(container.querySelectorAll('table'));
    await Promise.all(tables.map(makeTableResizable));
  }
  async function initResizableTables() { return reinitResizableTables(document); }
  async function initColumnWidthsAfterAuth() { await loadColumnWidthsFromServer(); await initResizableTables(); }

function getTableKey(table) {
  // ПРИОРИТЕТ 1: Используем data-атрибут, если он есть (самый стабильный)
  const dataKey = table.getAttribute('data-table-key');
  if (dataKey) {
    console.log(`🔑 Используется data-table-key: ${dataKey}`);
    return dataKey;
  }
  
  // ПРИОРИТЕТ 2: Используем ID родительского контейнера (pane) + все заголовки
  // Ищем родительский pane (не саму таблицу или её ближайший родитель с ID)
  let parentPane = table.closest(".pane");
  
  // Если не нашли .pane, ищем по известным ID панелей
  if (!parentPane) {
    const knownPanes = ['routing', 'orders', 'my', 'machine', 'stats', 'analytics', 'designer'];
    for (const paneId of knownPanes) {
      const pane = document.getElementById(paneId);
      if (pane && pane.contains(table)) {
        parentPane = pane;
        break;
      }
    }
  }
  
  // Если все еще не нашли, ищем любой родительский элемент с ID, который не является таблицей
  if (!parentPane) {
    let parent = table.parentElement;
    while (parent && parent !== document.body) {
      if (parent.id && !parent.id.startsWith('table_') && parent.id !== '') {
        parentPane = parent;
        break;
      }
      parent = parent.parentElement;
    }
  }
  
  const parentId = parentPane?.id || "unknown";
  
  // Получаем заголовки, исключая строку с кнопкой сохранения
  const saveRow = table.querySelector('.save-width-row');
  const allThs = Array.from(table.querySelectorAll("th"));
  const thsToUse = saveRow 
    ? allThs.filter(th => !th.closest('.save-width-row')) 
    : allThs;
  
  // Используем ВСЕ заголовки для уникальности
  // Очищаем заголовки от лишних символов и делаем их читаемыми
  const headers = thsToUse
    .map(th => {
      const text = th.textContent.trim();
      // Убираем только действительно лишние символы, сохраняем буквы (включая кириллицу), цифры и пробелы
      const clean = text
        .replace(/[^\w\sа-яА-ЯёЁ]/gi, "") // Убираем спецсимволы, но сохраняем буквы и цифры
        .replace(/\s+/g, "_") // Заменяем пробелы на подчеркивания
        .replace(/^_+|_+$/g, ""); // Убираем подчеркивания в начале и конце
      return clean.slice(0, 20); // Ограничиваем длину
    })
    .filter(h => h.length > 0) // Убираем пустые заголовки
    .join("|");
  
  // Создаем ключ на основе родителя и всех заголовков
  // Это гарантирует стабильность даже при изменении ID таблицы
  // НЕ удаляем кириллицу из ключа - она нужна для идентификации
  const key = `${parentId}_${headers}`.slice(0, 200);
  
  console.log(`🔑 Генерация ключа таблицы: ${key}`, {
    parentId: parentId,
    parentPaneClass: parentPane?.className || "none",
    headersCount: thsToUse.length,
    headers: headers.substring(0, 100) + (headers.length > 100 ? "..." : "")
  });
  
  return key;
}


  window.ColumnsModule = { initTable: makeTableResizable, initAll: initResizableTables, reset };
  Object.assign(window, { getTableKey, getAllColumnWidths, saveColumnWidths, saveAllColumnWidths, restoreColumnWidths,
    initResizableTables, reinitResizableTables, initColumnWidthsAfterAuth, loadColumnWidthsFromServer });
})();

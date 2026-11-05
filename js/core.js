/**
 * B'BOX Production - Core Module
 * Основные функции, API, рендеринг
 */

// Ensure state exists
if (!window.state) {
  window.state = {
    orders: [],
    ops: [],
    templates: [],
    machines: [],
    operators: [],
    operations: [],
    materials: [],
    materialTypes: [],
    units: [],
    productTemplates: [],
    clientProfiles: [],
    orderItems: [],
    orderItemsByOrder: {},
    currentTemplate: "",
    activeOrderId: null,
    currentUser: null,
    serverColumnWidths: {},
    sortBy: "order",
    opsColumnSort: "",
    opsSortDir: "asc"
  };
}

// Ensure currentUser exists
if (!window.currentUser) {
  window.currentUser = null;
}

// --- Completion Calculation ---
function completion(op) {
  const plan = +op.plan || 0, fact = +op.fact || 0, scrap = +op.scrap || 0;
  if(plan <= 0) return 0;
  return Math.max(0, (fact - scrap) / plan);
}
window.completion = completion;

// --- Additional Helpers ($ and esc are in utils.js) ---

function escAttr(s) {
  return esc(s).replace(/\n/g, "&#10;");
}
window.escAttr = escAttr;

// --- Fill Select ---
function fillSelect(sel, items, value) {
  if(!sel) return;
  sel.innerHTML = items.map(i => {
    const v = typeof i === "object" ? (i.id || i.name || i) : i;
    const t = typeof i === "object" ? (i.name || i.id || i) : i;
    return `<option value="${esc(v)}">${esc(t)}</option>`;
  }).join("");
  if(value !== undefined && value !== null) sel.value = value;
}
window.fillSelect = fillSelect;

// --- DateTime Formatting ---
function formatDateTime(isoDateTime) {
  if(!isoDateTime) return "";
  const d = new Date(isoDateTime);
  if(isNaN(d.getTime())) return isoDateTime;
  return d.toLocaleString("ru-RU", { 
    year: "numeric", 
    month: "2-digit", 
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
window.formatDateTime = formatDateTime;

// --- Operation Helpers ---
function isDone(op) { 
  return completion(op) >= 1 || op.status === "Выполнено"; 
}
window.isDone = isDone;

function isOverdue(op) {
  if(isDone(op)) return false;
  if(!op.date) return false;
  const opDate = new Date(op.date + "T23:59:59");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return opDate < today;
}
window.isOverdue = isOverdue;

function orderProgress(orderId) {
  const ops = state.ops.filter(o => o.order_id === orderId);
  if(!ops.length) return 0;
  return ops.reduce((s, o) => s + completion(o), 0) / ops.length;
}
window.orderProgress = orderProgress;

function pillStatus(op) {
  const c = completion(op);
  let cls = "pill", txt = op.status || "—";
  let prefix = "";
  if(isOverdue(op)) {
    cls += " bad";
    prefix = "⚠️ ";
  } else if(op.status === "Стоп") cls += " bad";
  else if(c >= 1) cls += " ok";
  else if(op.status === "В работе" || c > 0) cls += " warn";
  return `<span class="${cls}">${prefix}${esc(txt)}</span>`;
}
window.pillStatus = pillStatus;

function getOpItemLabel(op) {
  const orderId = op.order_id;
  const itemId = op.order_item_id;
  if(!orderId || !itemId) return "";
  const items = state.orderItemsByOrder?.[orderId];
  if(!Array.isArray(items)) return "";
  const it = items.find(x => x.id === itemId);
  if(!it) return "";
  const title = it.title ? ` · ${it.title}` : "";
  return `${it.type}${title}`;
}
window.getOpItemLabel = getOpItemLabel;

// --- Shared API transport and account-scoped read catalog ---
// Writes are never retried: a timed-out write may already have committed.
window.ApiClient = (() => {
  const timeoutDefault = 30000;
  const abortError = () => Object.assign(new Error('Запрос отменён.'), { name: 'AbortError' });
  async function request(path, options = {}) {
    const owner = window.currentUser;
    const { timeoutMs: requestedTimeout, signal, ...opts } = options;
    const timeoutMs = Number.isFinite(requestedTimeout) ? Math.max(1, Math.min(120000, requestedTimeout)) : timeoutDefault;
    const controller = new AbortController();
    let timer, rejectAbort;
    const cancelled = new Promise((_, reject) => { rejectAbort = reject; });
    const abort = () => { const error = signal?.reason || abortError(); controller.abort(error); rejectAbort(error); };
    if (signal?.aborted) throw signal.reason || abortError();
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => {
      const method = String(opts.method || 'GET').toUpperCase();
      const error = Object.assign(new Error(['GET', 'HEAD'].includes(method)
        ? 'Сервер не ответил вовремя. Повторите загрузку.'
        : 'Сервер не ответил вовремя. Результат сохранения неизвестен; проверьте данные перед повтором.'), { name: 'TimeoutError', code: 'API_TIMEOUT' });
      controller.abort(error); rejectAbort(error);
    }, timeoutMs);
    try {
      return await Promise.race([cancelled, (async () => {
        const response = await (window.PagesClient?.request || fetch)(path, { ...opts, credentials: 'include', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...opts.headers } });
        const text = await response.text();
        if (controller.signal.aborted) throw controller.signal.reason || abortError();
        if (response.status === 401 && (String(path).includes('/api/auth/me') || String(path).includes('/api/settings/user'))) return null;
        let body;
        try { body = text ? JSON.parse(text) : null; }
        catch (_) { throw Object.assign(new Error(`HTTP ${response.status}: сервер вернул неверный JSON`), { status: response.status, code: 'BAD_JSON' }); }
        if (!response.ok || body?.ok === false) {
          throw Object.assign(new Error(body?.message || body?.error || `HTTP ${response.status}`), {
            status: response.status, code: body?.code || null, details: body
          });
        }
        const method = String(opts.method || 'GET').toUpperCase();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && owner === window.currentUser) window.CatalogState?.invalidateForMutation(path);
        return body?.ok === true ? body.data : body;
      })()]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  return { request, timeoutDefault };
})();

window.CatalogState = (() => {
  let owner = window.currentUser, epoch = 0;
  const entries = new Map();
  const listeners = new Set();
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const stale = () => Object.assign(new Error('Сеанс изменился.'), { name: 'AbortError', code: 'SESSION_CHANGED' });
  const catalogKeys = ['materials', 'materialTypes', 'units', 'templates', 'productTemplates', 'clientProfiles', 'productTypes', 'operators', 'machines', 'operations', 'operatorsData', 'machinesData', 'operationsData'];
  function reset() {
    epoch++; owner = window.currentUser;
    entries.forEach(entry => entry.controller?.abort(stale())); entries.clear();
    catalogKeys.forEach(key => { if (window.state) window.state[key] = []; });
    if (window.state) window.state.clientProfileItems = {};
  }
  function ensureOwner() { if (owner !== window.currentUser) reset(); }
  function notify(paths) { listeners.forEach(listener => { try { listener(paths); } catch (error) { console.warn('Catalog listener:', error); } }); }
  function invalidate(matches) {
    ensureOwner();
    const paths = [];
    entries.forEach((entry, path) => {
      if (matches(path)) { entry.revision++; entry.freshAt = 0; paths.push(path); }
    });
    notify(paths);
  }
  function invalidateForMutation(path) {
    const base = String(path).split('?')[0];
    const materials = /^\/api\/(materials(?:\/|$)|tech-cards\/materials(?:\/|$)|warehouse\/movements(?:\/|$))/.test(base);
    const settings = /^\/api\/(settings(?:\/|$)|operators(?:\/|$)|machines(?:\/|$)|operations(?:\/|$))/.test(base);
    const templates = /^\/api\/(templates(?:\/|$)|templates-bom(?:\/|$)|product-templates(?:\/|$)|product-types(?:\/|$))/.test(base);
    const profiles = /^\/api\/client-profiles(?:\/|$)/.test(base);
    const orders = /^\/api\/(orders|order-items|ops)(?:\/|$)/.test(base);
    invalidate(read => {
      const resource = read.split('?')[0];
      if (read === base || resource === base) return true;
      if (materials && (/^\/api\/materials(?:\/|$)/.test(resource) || resource === '/api/warehouse/materials')) return true;
      if (settings && resource === '/api/settings') return true;
      if (/^\/api\/units(?:\/|$)/.test(base) && resource === '/api/units') return true;
      if (templates && /^\/api\/(product-templates|templates|templates-bom|product-types)(?:\/|$)/.test(resource)) return true;
      if (profiles && /^\/api\/client-profiles(?:\/|$)/.test(resource)) return true;
      if (base.startsWith('/api/warehouse/') && resource.startsWith('/api/warehouse/')) return true;
      if (orders && /^\/api\/(orders|order-items|ops)(?:\/|$)/.test(resource)) return true;
      if (resource === '/api/tech-cards/bootstrap' && (materials || settings || orders || base === '/api/tech-cards/finishes')) return true;
      return base.startsWith('/api/tech-cards') && resource === '/api/tech-cards';
    });
  }
  async function read(path, { force = false, ttlMs = 30000, signal } = {}) {
    ensureOwner();
    if (signal?.aborted) throw signal.reason || stale();
    const generation = epoch;
    let entry = entries.get(path);
    if (!entry) { entry = { revision: 0, freshAt: 0, value: undefined, flight: null }; entries.set(path, entry); }
    if (!force && entry.freshAt && Date.now() - entry.freshAt < ttlMs) return copy(entry.value);
    if (!entry.flight) {
      const controller = new AbortController(); entry.controller = controller;
      const revision = entry.revision;
      const flight = window.ApiClient.request(path, { signal: controller.signal }).then(value => {
        if (epoch !== generation || owner !== window.currentUser) throw stale();
        if (entry.revision !== revision) return { invalidated: true };
        entry.value = copy(value); entry.freshAt = Date.now();
        return { value };
      }).finally(() => { if (entry.flight === flight) { entry.flight = null; entry.controller = null; } });
      entry.flight = flight;
    }
    // A caller may stop waiting without aborting a shared read needed by another pane.
    let onAbort;
    const aborted = signal && new Promise((_, reject) => { onAbort = () => reject(signal.reason || stale()); signal.addEventListener('abort', onAbort, { once: true }); });
    try {
      const result = await (aborted ? Promise.race([entry.flight, aborted]) : entry.flight);
      if (epoch !== generation || owner !== window.currentUser) throw stale();
      if (result.invalidated) return read(path, { force: true, ttlMs, signal });
      return copy(result.value);
    } finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
  }
  function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  return { read, reset, invalidateForMutation, subscribe };
})();

async function api(path, opts = {}) { return window.ApiClient.request(path, opts); }
window.api = api;

// Note: todayISO, uid, fileToBase64, formatDuration are in utils.js
// completion, opShortCode, parseTimeToSeconds are defined above

// --- Toast Notifications ---
function toast(msg, duration) {
  const el = document.getElementById("toast");
  const msgEl = document.getElementById("toastMsg");
  if (el && msgEl) {
    msgEl.textContent = msg;
    // Для мобильной версии устанавливаем 3 секунды, для десктопа - 2.5 секунды
    const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    const displayDuration = duration !== undefined ? duration : (isMobile ? 3000 : 2500);
    el.style.display = "block";
    el.classList.add("show");
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.style.display = "none", 300); // Небольшая задержка для анимации
    }, displayDuration);
  }
}

window.toast = toast;

// --- Refresh Data ---
// The result is explicit but non-throwing for legacy callers that do not await it.
let pendingRefresh = null;
let refreshDataOwner = currentUser;
function refreshAll(showToast = true) {
  const owner = currentUser;
  if (pendingRefresh && pendingRefresh.owner === owner) {
    pendingRefresh.showToast ||= showToast;
    return pendingRefresh.promise;
  }
  const refresh = { owner, showToast };
  refresh.promise = refreshSnapshot(refresh).finally(() => {
    if (pendingRefresh === refresh) pendingRefresh = null;
  });
  pendingRefresh = refresh;
  return refresh.promise;
}

async function refreshSnapshot(refresh) {
  const signedIn = Boolean(refresh.owner);
  const isAdminUser = refresh.owner?.role === 'admin';
  const rows = value => {
    if (!Array.isArray(value)) throw new Error('Сервер вернул неверный список');
    return value;
  };
  const resources = [
    { key: 'orders', label: 'Заказы', path: '/api/orders', decode: rows },
    { key: 'ops', label: 'Операции', path: '/api/ops', decode: rows },
    { key: 'templates', label: 'Шаблоны операций', path: '/api/templates', decode: rows },
    { key: 'settings', label: 'Настройки', path: '/api/settings', decode: value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Сервер вернул неверные настройки');
      const list = (full, names) => rows(value[full] || value[names] || []).map((entry, index) => {
        if (typeof entry === 'string') return { id: index + 1, name: entry };
        if (!entry || typeof entry.name !== 'string') throw new Error('Сервер вернул неверную запись справочника');
        return entry;
      });
      return { operatorsData: list('operatorsData', 'operators'), machinesData: list('machinesData', 'machines'), operationsData: list('operationsData', 'operations') };
    } },
    { key: 'materials', label: 'Материалы', path: '/api/materials', decode: rows, enabled: signedIn },
    { key: 'materialTypes', label: 'Типы материалов', path: '/api/materials/types', decode: rows, enabled: signedIn },
    { key: 'units', label: 'Единицы измерения', path: '/api/units', decode: value => rows(value?.units || value) },
    { key: 'productTemplates', label: 'Шаблоны изделий', path: '/api/product-templates', decode: rows, enabled: isAdminUser },
    { key: 'clientProfiles', label: 'Профили клиентов', path: '/api/client-profiles', decode: rows, enabled: isAdminUser },
    { key: 'orderItems', label: 'Изделия заказов', path: '/api/order-items', decode: value => {
      const items = rows(value);
      if (items.some(item => !item || typeof item.order_id !== 'string')) throw new Error('Сервер вернул неверное изделие заказа');
      return items;
    } },
    { key: 'productTypes', label: 'Типы изделий', path: '/api/product-types', decode: rows, enabled: isAdminUser }
  ];
  const results = await Promise.allSettled(resources.map(async resource => {
    if (resource.enabled === false) return [];
    return resource.decode(await window.CatalogState.read(resource.path, { force: true }));
  }));
  if (currentUser !== refresh.owner || pendingRefresh !== refresh) {
    return { ok: false, partial: false, errors: [], updated: [], cancelled: true };
  }
  if (refreshDataOwner !== refresh.owner) {
    // Retain failed resources only within the account that loaded them.
    resources.forEach(resource => { if (resource.key !== 'settings') state[resource.key] = []; });
    ['operators', 'machines', 'operations', 'operatorsData', 'machinesData', 'operationsData'].forEach(key => { state[key] = []; });
    state.orderItemsByOrder = Object.create(null);
    state.activeOrderId = '';
    refreshDataOwner = refresh.owner;
  }
  const errors = [], updated = [];
  results.forEach((result, index) => {
    const resource = resources[index];
    if (result.status === 'rejected') {
      errors.push({ resource: resource.key, label: resource.label, message: result.reason?.message || String(result.reason) });
      return; // Keep the previously loaded value when this resource is unavailable.
    }
    updated.push(resource.key);
    if (resource.key === 'settings') {
      Object.assign(state, result.value);
      state.operators = result.value.operatorsData.map(item => item.name);
      state.machines = result.value.machinesData.map(item => item.name);
      state.operations = result.value.operationsData.map(item => item.name);
    } else {
      state[resource.key] = result.value;
    }
    if (resource.key === 'orderItems') {
      const byOrder = Object.create(null);
      result.value.forEach(item => { (byOrder[item.order_id] ||= []).push(item); });
      state.orderItemsByOrder = byOrder;
    }
  });
  const result = { ok: errors.length === 0, partial: errors.length > 0 && updated.length > 0, errors, updated, cancelled: false };
  if (errors.length) {
    console.warn('Не удалось обновить данные:', errors);
    toast('Не удалось обновить: ' + errors.map(error => error.label).join(', ') + '. Показаны последние доступные данные этого сеанса.');
  } else if (refresh.showToast) {
    toast('Данные обновлены');
  }
  // Preserve the existing column lifecycle; business data refresh itself only reads.
  setTimeout(async () => {
    if (currentUser !== refresh.owner) return;
    try {
      if (typeof initColumnWidthsAfterAuth === 'function') await initColumnWidthsAfterAuth();
      else if (typeof initResizableTables === 'function') await initResizableTables();
    } catch (error) { console.warn('Не удалось обновить размеры колонок:', error); }
  }, 200);
  return result;
}
window.refreshAll = refreshAll;

// --- Idle Timer (defined in index.html with more options) ---
// idleTimer, resetIdleTimer, initIdleTimer are in index.html

console.log("Core module loaded");


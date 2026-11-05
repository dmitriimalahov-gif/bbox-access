/* Mobile admin navigation. Existing panes, permissions and handlers remain authoritative. */
(function () {
  'use strict';
  if (window.BboxMobileAdminShell) return;

  const primary = [
    ['orders', 'Заказы', 'box'],
    ['techcards', 'Техзадания', 'document'],
    ['warehouse', 'Склад', 'warehouse'],
    ['stats', 'Сводка', 'chart']
  ];
  const routes = {
    orders: ['Заказы', 'box'], techcards: ['Техзадания', 'document'], warehouse: ['Склад', 'warehouse'], brain: ['Мозг / ИИ', 'spark'],
    stats: ['Сводка', 'chart'], routing: ['Маршруты', 'route'], my: ['Мои задачи', 'check'],
    barcode: ['Штрихкоды', 'barcode'], machine: ['Машины', 'machine'], clients: ['Клиенты', 'people'],
    finance: ['Финансы', 'wallet'], designer: ['Конструктор производства', 'layout'],
    'cutting-simple': ['Раскрой', 'cut'], settings: ['Настройки', 'settings'], diagnostics: ['Диагностика', 'pulse']
  };
  const paths = {
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 3v4M18 5h4"/>',
    box: '<path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10M7.5 5l9 4"/>',
    document: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8M8 17h6"/>',
    warehouse: '<path d="m3 9 9-6 9 6v12H3V9Zm4 12v-9h10v9M7 16h10"/>',
    chart: '<path d="M4 3v18h17M8 16v-4M13 16V8M18 16V5"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    route: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h8a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h8"/>',
    check: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
    barcode: '<path d="M3 6v12M7 6v12M11 6v12M14 6v12M17 6v12M21 6v12"/>',
    machine: '<path d="M4 21V10h5l3-5 3 5h5v11H4ZM8 15h2M14 15h2M8 18h8"/>',
    people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3"/>',
    wallet: '<path d="M20 8V5H5a2 2 0 0 0 0 4h16v11H5a2 2 0 0 1-2-2V7M21 12h-6v5h6"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M10 3v18M10 11h11"/>',
    cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 13 13M8 16 21 3"/>',
    settings: '<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>',
    pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="m14 6-6 6 6 6"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M6.2 6.2A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.8 5.8"/>',
    logout: '<path d="M9 4H4v16h5M13 7l5 5-5 5M8 12h10"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.document) + '</svg>';
  const query = selector => document.querySelector(selector);
  let mobile, chrome, bottom, more, title, account, offline, back, initialized = false;
  let active = false, owner = '', currentRoute = '', backRoute = '', returnFocus = null;
  let queued = false, navigationNumber = 0, scrollByRoute = new Map();

  function user() { return window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null); }
  function sourceButton(id) { return Array.from(document.querySelectorAll('.navbtn[data-go]')).find(button => button.dataset.go === id); }
  function allowed(id) {
    const button = sourceButton(id);
    return Boolean(button && !button.hidden && !button.disabled && button.getAttribute('aria-hidden') !== 'true' && getComputedStyle(button).display !== 'none');
  }
  function visibleRoute() {
    return Array.from(document.querySelectorAll('#mainApp > .pane')).find(pane => pane.style.display !== 'none' && !pane.hidden)?.id || currentRoute || 'orders';
  }
  function label(id) { return routes[id]?.[0] || sourceButton(id)?.textContent.trim() || 'B’BOX'; }
  function setText(element, value) { if (element.textContent !== value) element.textContent = value; }

  function closeMore(restoreFocus = true) {
    if (!more?.open) return;
    more.close();
    bottom.querySelector('[data-mobile-more]').setAttribute('aria-expanded', 'false');
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  function routeButton(id) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bbox-mobile-menu-link';
    button.dataset.mobileRoute = id;
    button.innerHTML = icon(routes[id]?.[1]) + '<span></span>' + icon('back');
    button.querySelector('span').textContent = label(id);
    if (id === currentRoute) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => navigate(id));
    return button;
  }

  function renderMore() {
    const holder = more.querySelector('[data-mobile-menu]');
    holder.replaceChildren();
    const groups = [
      ['Помощник', ['brain']],
      ['Производство', ['routing', 'my', 'machine', 'designer', 'cutting-simple', 'barcode']],
      ['Управление', ['clients', 'finance']],
      ['Система', ['settings', 'diagnostics']]
    ];
    const seen = new Set(primary.map(([id]) => id));
    groups.forEach(([heading, ids]) => {
      ids.forEach(id => seen.add(id));
      const available = ids.filter(allowed);
      if (!available.length) return;
      const section = document.createElement('section');
      section.className = 'bbox-mobile-menu-group';
      const title = document.createElement('h3');
      title.textContent = heading;
      section.append(title, ...available.map(routeButton));
      holder.append(section);
    });
    const extras = Array.from(document.querySelectorAll('.navbtn[data-go]')).map(button => button.dataset.go).filter(id => !seen.has(id) && allowed(id));
    if (extras.length) {
      const section = document.createElement('section');
      section.className = 'bbox-mobile-menu-group';
      const heading = document.createElement('h3');
      heading.textContent = 'Другие разделы';
      section.append(heading, ...extras.map(routeButton));
      holder.append(section);
    }
    setText(more.querySelector('[data-mobile-account]'), user()?.username || 'Администратор');
  }

  function openMore() {
    if (!active || more.open) return;
    renderMore();
    returnFocus = document.activeElement;
    more.showModal();
    bottom.querySelector('[data-mobile-more]').setAttribute('aria-expanded', 'true');
    more.querySelector('[data-mobile-close]').focus({ preventScroll: true });
  }

  function snapshotScroll() {
    const app = query('#mainApp');
    return { x: window.scrollX, y: window.scrollY, appX: app?.scrollLeft || 0, appY: app?.scrollTop || 0 };
  }
  function restoreScroll(saved) {
    const point = saved || { x: 0, y: 0, appX: 0, appY: 0 };
    window.scrollTo({ left: point.x, top: point.y, behavior: 'instant' });
    query('#mainApp')?.scrollTo({ left: point.appX, top: point.appY, behavior: 'instant' });
  }

  function wrapNavigation() {
    const original = window.switchPane;
    if (typeof original !== 'function' || original.bboxMobileWrapped) return;
    async function wrapped(id) {
      if (!active) return original.apply(this, arguments);
      const from = visibleRoute();
      const startedFor = owner;
      const number = ++navigationNumber;
      scrollByRoute.set(from, snapshotScroll());
      if (from !== id) backRoute = from;
      closeMore(false);
      const result = await original.apply(this, arguments);
      sync();
      if (active && owner === startedFor && navigationNumber === number && visibleRoute() === id) {
        restoreScroll(scrollByRoute.get(id));
      }
      return result;
    }
    wrapped.bboxMobileWrapped = true;
    window.switchPane = wrapped;
  }

  async function navigate(id) {
    if (!active || !allowed(id) || typeof window.switchPane !== 'function') return;
    closeMore(false);
    if (visibleRoute() === id) return;
    try {
      await window.switchPane(id);
      if (active && visibleRoute() === id) title.focus({ preventScroll: true });
    } catch (error) {
      if (typeof window.toast === 'function') window.toast('Не удалось открыть раздел. Попробуйте ещё раз.');
      console.error('Mobile navigation:', error);
    }
  }

  function sync() {
    queued = false;
    const signedIn = user();
    const nextOwner = signedIn ? String(signedIn.userId || signedIn.username || '') + ':' + signedIn.role : '';
    const shouldBeActive = Boolean(mobile.matches && signedIn?.role === 'admin' && query('#mainApp')?.style.display !== 'none' && query('#loginPage')?.style.display === 'none');
    if (nextOwner !== owner || !shouldBeActive) {
      if (active || nextOwner !== owner) {
        closeMore(false);
        scrollByRoute.clear();
        backRoute = '';
        currentRoute = '';
        navigationNumber++;
      }
      owner = nextOwner;
    }
    active = shouldBeActive;
    document.body.classList.toggle('bbox-mobile-admin', active);
    chrome.hidden = !active;
    bottom.hidden = !active;
    if (!active) {
      setText(title, 'B’BOX');
      setText(account, 'Администратор');
      setText(more.querySelector('[data-mobile-account]'), '');
      more.querySelector('[data-mobile-menu]').replaceChildren();
      return;
    }
    wrapNavigation();
    currentRoute = visibleRoute();
    setText(title, label(currentRoute));
    const name = signedIn.username || 'Администратор';
    setText(account, name);
    account.closest('button').setAttribute('aria-label', 'Меню администратора: ' + name);
    primary.forEach(([id]) => {
      const button = bottom.querySelector('[data-mobile-route="' + id + '"]');
      button.hidden = !allowed(id);
      if (id === currentRoute) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const moreButton = bottom.querySelector('[data-mobile-more]');
    if (!primary.some(([id]) => id === currentRoute)) moreButton.setAttribute('aria-current', 'page');
    else moreButton.removeAttribute('aria-current');
    back.hidden = primary.some(([id]) => id === currentRoute) || !backRoute || !allowed(backRoute);
    back.setAttribute('aria-label', 'Назад: ' + label(backRoute));
    offline.hidden = navigator.onLine;
  }

  function scheduleSync() {
    if (!queued) { queued = true; queueMicrotask(sync); }
  }

  function init() {
    if (initialized || !query('#mainApp') || !query('.nav')) return;
    initialized = true;
    mobile = window.matchMedia('(max-width: 768px)');
    chrome = document.createElement('div');
    chrome.className = 'bbox-mobile-chrome noprint';
    chrome.hidden = true;
    chrome.innerHTML = '<div class="bbox-mobile-topbar"><button type="button" class="bbox-mobile-icon-button" data-mobile-back hidden>' + icon('back') + '</button><div class="bbox-mobile-heading"><span class="bbox-mobile-brand">B’BOX</span><h1 data-mobile-title>Заказы</h1></div><button type="button" class="bbox-mobile-account" data-mobile-account-button aria-haspopup="dialog"><span class="bbox-mobile-account-dot" aria-hidden="true"></span><span data-mobile-name>Администратор</span>' + icon('more') + '</button></div><div class="bbox-mobile-offline" data-mobile-offline role="status" hidden>Нет интернета. Проверьте соединение перед сохранением.</div>';
    bottom = document.createElement('nav');
    bottom.className = 'bbox-mobile-bottom noprint';
    bottom.hidden = true;
    bottom.setAttribute('aria-label', 'Основные разделы');
    primary.forEach(([id, text, symbol]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bbox-mobile-tab';
      button.dataset.mobileRoute = id;
      button.innerHTML = icon(symbol) + '<span>' + text + '</span>';
      button.addEventListener('click', () => navigate(id));
      bottom.append(button);
    });
    const moreButton = document.createElement('button');
    moreButton.type = 'button';
    moreButton.className = 'bbox-mobile-tab';
    moreButton.dataset.mobileMore = '';
    moreButton.innerHTML = icon('more') + '<span>Ещё</span>';
    moreButton.setAttribute('aria-haspopup', 'dialog');
    moreButton.setAttribute('aria-controls', 'bboxMobileMore');
    moreButton.setAttribute('aria-expanded', 'false');
    moreButton.addEventListener('click', openMore);
    bottom.append(moreButton);
    more = document.createElement('dialog');
    more.id = 'bboxMobileMore';
    more.className = 'bbox-mobile-more noprint';
    more.setAttribute('aria-labelledby', 'bboxMobileMoreTitle');
    more.innerHTML = '<div class="bbox-mobile-sheet-header"><h2 id="bboxMobileMoreTitle">Все разделы</h2><button type="button" class="bbox-mobile-icon-button" data-mobile-close aria-label="Закрыть меню">' + icon('close') + '</button></div><div class="bbox-mobile-sheet-content"><div class="bbox-mobile-identity">' + icon('user') + '<div><strong data-mobile-account></strong><span>Администратор</span></div></div><div data-mobile-menu></div><div class="bbox-mobile-system-actions"><button type="button" data-mobile-refresh>' + icon('refresh') + '<span>Обновить данные</span></button><button type="button" data-mobile-logout>' + icon('logout') + '<span>Выйти из аккаунта</span></button></div></div>';
    document.body.prepend(chrome);
    document.body.append(bottom, more);
    title = chrome.querySelector('[data-mobile-title]');
    title.tabIndex = -1;
    account = chrome.querySelector('[data-mobile-name]');
    offline = chrome.querySelector('[data-mobile-offline]');
    back = chrome.querySelector('[data-mobile-back]');
    back.addEventListener('click', () => navigate(backRoute));
    chrome.querySelector('[data-mobile-account-button]').addEventListener('click', openMore);
    more.querySelector('[data-mobile-close]').addEventListener('click', () => closeMore());
    more.addEventListener('cancel', event => { event.preventDefault(); closeMore(); });
    more.addEventListener('click', event => {
      if (event.target !== more) return;
      const box = more.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeMore();
    });
    more.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const elements = Array.from(more.querySelectorAll('button:not(:disabled), [href], input, select, textarea, [tabindex="0"]')).filter(element => !element.hidden && element.getClientRects().length);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    more.querySelector('[data-mobile-refresh]').addEventListener('click', async event => {
      const button = event.currentTarget;
      const refreshOwner = owner;
      button.disabled = true;
      button.querySelector('span').textContent = 'Обновляем…';
      try {
        if (typeof window.refreshAll === 'function') {
          await window.refreshAll(true);
          if (active && owner === refreshOwner && typeof window.renderAll === 'function') await window.renderAll();
        } else query('#refresh')?.click();
      } catch (error) {
        if (typeof window.toast === 'function') window.toast('Не удалось обновить данные. Проверьте соединение.');
        console.error('Mobile refresh:', error);
      } finally {
        button.disabled = false;
        button.querySelector('span').textContent = 'Обновить данные';
      }
    });
    more.querySelector('[data-mobile-logout]').addEventListener('click', () => { closeMore(false); query('#logoutBtn')?.click(); });

    // Place administrator access first visually, keeping the same login elements and handlers.
    query('#adminLoginBtn')?.parentElement.classList.add('bbox-mobile-admin-choice');
    const username = query('#adminUsername');
    if (username) { username.autocapitalize = 'none'; username.spellcheck = false; }
    const loginObserver = new MutationObserver(scheduleSync);
    [query('#mainApp'), query('#loginPage')].filter(Boolean).forEach(element => loginObserver.observe(element, { attributes: true, attributeFilter: ['style', 'hidden'] }));
    query('#currentUser') && loginObserver.observe(query('#currentUser'), { childList: true, attributes: true, attributeFilter: ['style'] });
    const routeObserver = new MutationObserver(scheduleSync);
    routeObserver.observe(query('.nav'), { attributes: true, subtree: true, attributeFilter: ['style', 'class', 'hidden', 'disabled'] });
    document.querySelectorAll('#mainApp > .pane').forEach(pane => routeObserver.observe(pane, { attributes: true, attributeFilter: ['style', 'hidden'] }));
    mobile.addEventListener('change', scheduleSync);
    window.addEventListener('online', scheduleSync);
    window.addEventListener('offline', scheduleSync);
    window.addEventListener('pageshow', scheduleSync);
    sync();
  }

  window.BboxMobileAdminShell = { init, sync: scheduleSync };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

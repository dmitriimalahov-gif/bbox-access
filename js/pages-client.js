/* GitHub Pages stays the UI origin. Only a verified, signed API origin receives credentials. */
(function () {
  'use strict';
  if (window.PagesClient) return;
  const enabled = location.origin === 'https://dmitriimalahov-gif.github.io' && /^\/bbox-access(?:\/|$)/.test(location.pathname);
  const CONFIG_URL = 'https://raw.githubusercontent.com/dmitriimalahov-gif/bbox-access/main/config.json';
  const PUBLIC_KEY = { kty: 'EC', crv: 'P-256', x: 'wjwys6mwSX0I9oRsQoHWF-XryVZ2p0W7K0zd_2MCRio', y: 'MCfBAsNkCknfBdBu8xQTVohtSzuBfYxga7KwM8csgaE' };
  const API_ORIGIN = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/;
  const STORAGE = 'bbox-pages:v1:/bbox-access:';
  const nativeFetch = window.fetch.bind(window);
  const pending = new Set(), assets = new Map();
  let config = null, configFlight = null, keyFlight = null, epoch = 0, token = '', expiresAt = 0, closing = false;
  const abortError = () => new DOMException('Сеанс изменился или запрос отменён.', 'AbortError');
  const configError = () => Object.assign(new Error('Не удалось проверить адрес сервера B’BOX. Повторите загрузку страницы.'), { code: 'PAGES_CONFIG_INVALID' });
  const storageRead = (storage, key) => { try { return storage.getItem(STORAGE + key); } catch (_) { return null; } };
  const storageWrite = (storage, key, value) => { try { value === null ? storage.removeItem(STORAGE + key) : storage.setItem(STORAGE + key, value); } catch (_) {} };
  function resetAuth() {
    epoch++; token = ''; expiresAt = 0; closing = false;
    storageWrite(sessionStorage, 'auth', null);
    for (const controller of pending) controller.abort(abortError());
    pending.clear();
    for (const entry of assets.values()) if (entry.url) URL.revokeObjectURL(entry.url);
    assets.clear();
  }
  function beginLogout() {
    if (!enabled || closing) return;
    closing = true; epoch++;
    for (const controller of pending) controller.abort(abortError());
    pending.clear();
  }
  if (enabled) {
    try {
      const saved = JSON.parse(storageRead(sessionStorage, 'auth') || 'null');
      if (saved && typeof saved.token === 'string' && /^[A-Za-z0-9._~-]{16,4096}$/.test(saved.token) && saved.expiresAt > Date.now()) {
        token = saved.token; expiresAt = saved.expiresAt;
      }
    } catch (_) {}
  }
  async function verify(value) {
    if (!value || value.v !== 1 || typeof value.api !== 'string' || !API_ORIGIN.test(value.api) || !Number.isSafeInteger(value.iat) || value.iat <= 0 || value.iat > Math.floor(Date.now() / 1000) + 300 || typeof value.sig !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(value.sig)) throw configError();
    let signature;
    try {
      signature = Uint8Array.from(atob(value.sig.replace(/-/g, '+').replace(/_/g, '/') + '=='), char => char.charCodeAt(0));
      if (signature.length !== 64 || btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== value.sig) throw configError();
      if (!keyFlight) keyFlight = crypto.subtle.importKey('jwk', PUBLIC_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await keyFlight, signature, new TextEncoder().encode(JSON.stringify({ v: 1, api: value.api, iat: value.iat })));
      if (!valid) throw configError();
    } catch (_) { throw configError(); }
    let highest;
    try { highest = JSON.parse(storageRead(localStorage, 'config-highest') || 'null'); } catch (_) {}
    if (highest && (value.iat < highest.iat || (value.iat === highest.iat && value.api !== highest.api))) throw configError();
    if (config && (value.iat < config.iat || (value.iat === config.iat && value.api !== config.api))) throw configError();
    storageWrite(localStorage, 'config-highest', JSON.stringify({ iat: value.iat, api: value.api }));
    return Object.freeze({ v: 1, api: value.api, iat: value.iat, sig: value.sig });
  }
  async function loadConfig() {
    if (configFlight) return configFlight;
    const flight = (async () => {
      const controller = new AbortController();
      let timer;
      try {
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('Сервер адресов B’BOX не ответил.'), { name: 'TimeoutError' })); }, 8000); });
        const fetched = (async () => {
          const response = await nativeFetch(CONFIG_URL + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
          if (!response.ok) throw Object.assign(new Error('Адрес сервера B’BOX временно недоступен.'), { status: response.status });
          const text = await response.text();
          if (text.length > 8192) throw configError();
          try { return JSON.parse(text); } catch (_) { throw configError(); }
        })();
        const value = await Promise.race([fetched, timeout]);
        config = await verify(value);
        storageWrite(sessionStorage, 'config', JSON.stringify(config));
        return config;
      } catch (error) {
        // A previously verified address can survive a GitHub outage, but a bad signature never falls back.
        if (error.code === 'PAGES_CONFIG_INVALID') throw error;
        const cached = storageRead(sessionStorage, 'config');
        if (cached) { try { config = await verify(JSON.parse(cached)); return config; } catch (_) {} }
        throw error;
      } finally { clearTimeout(timer); }
    })();
    configFlight = flight;
    try { return await flight; } finally { if (configFlight === flight) configFlight = null; }
  }
  function pathForRequest(path, base) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path)) throw new Error('Недопустимый адрес запроса B’BOX.');
    const url = new URL(path, base);
    if (url.origin !== base || url.hash || !/^\/(?:api(?:\/|$)|uploads\/|tech-card-assets\/)/.test(url.pathname)) throw new Error('Недопустимый адрес запроса B’BOX.');
    // URL normalization must not turn an allowed prefix into an external or unrelated resource.
    return url.href;
  }
  async function waitFor(promise, signal) {
    if (signal?.aborted) throw signal.reason || abortError();
    let listener;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        listener = () => reject(signal.reason || abortError());
        signal?.addEventListener('abort', listener, { once: true });
      })]);
    } finally { signal?.removeEventListener('abort', listener); }
  }
  async function request(path, options = {}) {
    if (!enabled) return nativeFetch(path, options);
    if (closing && path !== '/api/auth/logout') throw abortError();
    if (token && expiresAt <= Date.now()) resetAuth();
    const generation = epoch, owner = window.currentUser, requestToken = token;
    const controller = new AbortController(), external = options.signal;
    const cancel = () => controller.abort(external.reason || abortError());
    const check = () => { if (generation !== epoch || owner !== window.currentUser || controller.signal.aborted) throw controller.signal.reason || abortError(); };
    if (external?.aborted) throw external.reason || abortError();
    external?.addEventListener('abort', cancel, { once: true }); pending.add(controller);
    const method = String(options.method || 'GET').toUpperCase();
    let bodyPending = false;
    const finish = () => { pending.delete(controller); external?.removeEventListener('abort', cancel); };
    try {
      let address = await waitFor(config ? Promise.resolve(config) : loadConfig(), controller.signal);
      for (let attempt = 0; ; attempt++) {
        check();
        const url = pathForRequest(path, address.api), headers = new Headers(options.headers || {});
        // Callers cannot forward an unrelated Authorization value or cookies.
        headers.delete('Authorization'); headers.set('X-BBOX-Client', 'pages');
        if (requestToken) headers.set('Authorization', 'Bearer ' + requestToken);
        try {
          const response = await nativeFetch(url, { ...options, method, headers, signal: controller.signal, mode: 'cors', credentials: 'omit', redirect: 'error' });
          check();
          if (response.ok && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            const files = new URL(url).pathname.match(/^\/api\/ops\/([^/]+)\/files(?:\/|$)/);
            if (files) {
              const prefix = '/uploads/' + encodeURIComponent(decodeURIComponent(files[1])) + '/';
              for (const [key, entry] of assets) if (key.startsWith(prefix)) {
                if (entry.url) URL.revokeObjectURL(entry.url);
                assets.delete(key);
              }
            }
          }
          // Keep cancellation/account ownership through body consumption, not only response headers.
          for (const name of ['text', 'json', 'blob', 'arrayBuffer', 'formData']) {
            if (typeof response[name] !== 'function') continue;
            const read = response[name].bind(response);
            response[name] = async (...args) => { try { const value = await read(...args); check(); return value; } finally { finish(); } };
          }
          bodyPending = true; return response;
        } catch (error) {
          check();
          if (method !== 'GET' || attempt !== 0 || error.name !== 'TypeError') throw error;
          // A tunnel may have moved. One GET retry is safe; writes are never replayed.
          address = await waitFor(loadConfig(), controller.signal);
        }
      }
    } finally { if (!bodyPending) finish(); }
  }
  function acceptAuth(value) {
    if (!value || typeof value !== 'object') throw new Error('Сервер вернул неверный ответ входа.');
    const { accessToken, expiresIn, ...identity } = value;
    if (enabled) {
      if (typeof accessToken !== 'string' || !/^[A-Za-z0-9._~-]{16,4096}$/.test(accessToken) || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error('Сервер не подтвердил вход с GitHub Pages.');
      resetAuth(); token = accessToken; expiresAt = Date.now() + Math.min(expiresIn, 2592000) * 1000;
      storageWrite(sessionStorage, 'auth', JSON.stringify({ token, expiresAt }));
    }
    return identity;
  }
  function assetPath(path) {
    if (typeof path !== 'string' || !/^\/(?:uploads|tech-card-assets)\//.test(path)) throw new Error('Недопустимый адрес вложения.');
    const normalized = new URL(pathForRequest(path, 'https://asset.invalid'));
    if (!/^\/(?:uploads|tech-card-assets)\//.test(normalized.pathname)) throw new Error('Недопустимый адрес вложения.');
    return normalized.pathname + normalized.search;
  }
  function cachedPrivateUrl(path) {
    const key = assetPath(path);
    if (!enabled) return key;
    const entry = assets.get(key);
    return entry?.epoch === epoch && entry.owner === window.currentUser ? entry.url || null : null;
  }
  async function privateUrl(path) {
    const key = assetPath(path);
    if (!enabled) return key;
    const owner = window.currentUser, generation = epoch;
    if (!token) throw Object.assign(new Error('Войдите, чтобы открыть вложение.'), { status: 401 });
    let entry = assets.get(key);
    if (entry?.epoch === generation && entry.owner === owner) return entry.url || entry.flight;
    if (entry?.url) URL.revokeObjectURL(entry.url);
    entry = { epoch: generation, owner, url: null, flight: null }; assets.set(key, entry);
    entry.flight = (async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await request(key, { signal: controller.signal });
        if (!response.ok) { await response.text(); throw Object.assign(new Error('Не удалось загрузить вложение.'), { status: response.status }); }
        let blob = await response.blob();
        if (controller.signal.aborted || generation !== epoch || owner !== window.currentUser || assets.get(key) !== entry) throw abortError();
        if (!/^(image\/(?:png|jpeg|gif|webp)|application\/pdf)$/i.test(blob.type)) blob = new Blob([blob], { type: 'application/octet-stream' });
        entry.url = URL.createObjectURL(blob); return entry.url;
      } catch (error) { if (assets.get(key) === entry) assets.delete(key); throw error; }
      finally { clearTimeout(timer); }
    })();
    return entry.flight;
  }
  async function download(path, filename) {
    const generation = epoch, owner = window.currentUser;
    let url, temporary = false;
    if (typeof path === 'string' && path.startsWith('/api/')) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await request(path, { signal: controller.signal });
        if (!response.ok) { await response.text(); throw Object.assign(new Error('Не удалось скачать файл.'), { status: response.status }); }
        const blob = await response.blob();
        if (controller.signal.aborted || generation !== epoch || owner !== window.currentUser) throw abortError();
        url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' })); temporary = true;
      } finally { clearTimeout(timer); }
    } else url = await privateUrl(path);
    if (generation !== epoch || owner !== window.currentUser) { if (temporary) URL.revokeObjectURL(url); throw abortError(); }
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename || ''; anchor.rel = 'noopener';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    if (temporary) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const ready = enabled ? loadConfig() : Promise.resolve(null);
  ready.catch(() => {}); // Callers receive the actual error; startup must not emit an unhandled rejection.
  window.PagesClient = Object.freeze({ enabled, ready, request, acceptAuth, beginLogout, logout: resetAuth, privateUrl, cachedPrivateUrl, download });
})();

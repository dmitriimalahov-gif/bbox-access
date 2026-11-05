// === АВТОРИЗАЦИЯ ===
async function checkAuth(){
  try {
    const user = await api("/api/auth/me");
    return user;
  } catch(e) {
    return null;
  }
}

// Определение типа устройства
function getDeviceType(){
  const width = window.innerWidth;
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isTablet = /ipad|android(?!.*mobile)|tablet/i.test(userAgent);
  
  if(isMobile && width < 768) return 'mobile';
  if(isTablet || (width >= 768 && width < 1024)) return 'tablet';
  return 'desktop';
}

// Таймер для блокировки кнопок операторов на странице входа
let loginPageTimer = null;

async function showLoginPage(){
  $("loginPage").style.display = "flex";
  $("adminLoginForm").style.display = "none";
  $("adminLoginBtn").style.display = "block";
  $("operatorsGrid").style.display = "grid";
  $("adminPassword").value = "";
  $("operatorLoginForm")?.remove();
  window.AccessSettings?.reset();
  $("loginError").style.display = "none";
  $("mainApp").style.display = "none";
  $("operatorSearch").value = "";
  document.querySelector("header").style.display = "none";
  document.querySelector(".nav").style.display = "none";
  
  // Очищаем предыдущий таймер
  if(loginPageTimer) clearTimeout(loginPageTimer);
  
  // Загружаем список операторов и создаем кнопки
  try {
    const settings = await api("/api/auth/operators");
    const operatorsGrid = $("operatorsGrid");
    operatorsGrid.innerHTML = "";
    
    settings.operators.forEach(op => {
      // Поддержка нового формата {id, name} и старого (строка)
      const opName = typeof op === 'string' ? op : op.name;
      const btn = document.createElement("button");
      btn.className = "btn accent";
      btn.style.cssText = "padding:24px 16px;font-size:18px;font-weight:800;min-height:80px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px";
      btn.innerHTML = `<span style="font-size:32px">👤</span><span>${esc(opName)}</span>`;
      btn.onclick = () => {
        if(btn.disabled) return;
        openOperatorLogin(opName);
      };
      btn.dataset.operatorName = opName;
      operatorsGrid.appendChild(btn);
    });
    
    // НЕ запускаем таймер для блокировки кнопок на странице входа
    // Кнопки должны быть доступны для входа операторов
  } catch(e) {
    console.error("Ошибка загрузки операторов:", e);
    $("operatorsGrid").innerHTML = '<div style="text-align:center;color:var(--bad);padding:20px">Ошибка загрузки операторов</div>';
  }
}

function showMainApp(){
  $("loginPage").style.display = "none";
  $("mainApp").style.display = "";
  document.querySelector("header").style.display = "";
  document.querySelector(".nav").style.display = "";
}

let loginFlight = null;
async function doLogin(role, username, password) {
  if (loginFlight) return loginFlight;
  const controls = [...$('loginPage').querySelectorAll('button,input')];
  const previous = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  const surfaces = [$('mainApp'), document.querySelector('header'), document.querySelector('.nav')].filter(Boolean);
  surfaces.forEach(element => { element.inert = true; });
  const pending = performLogin(role, username, password);
  loginFlight = pending;
  try { return await pending; }
  finally {
    if (loginFlight === pending) loginFlight = null;
    controls.forEach((control, i) => { control.disabled = previous[i]; });
    surfaces.forEach(element => { element.inert = false; });
    $("adminPassword").value = "";
  }
}

async function performLogin(role, username, password){
  try {
    const loginResult = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, role })
    });
    
    const user = window.PagesClient ? window.PagesClient.acceptAuth(loginResult) : loginResult;
    console.log("🔐 Данные пользователя после логина:", user);
    
    window.CatalogState?.reset();
    window.ColumnsModule?.reset();
    window.TechCardsModule?.reset();
    window.BrainModule?.reset();
    window.DesignerModule?.reset?.();
    currentUser = user;
    // Убеждаемся, что currentUser установлен в глобальной области видимости
    window.currentUser = user;
    if (typeof setCurrentUser === 'function') {
      setCurrentUser(user);
    }
    
    console.log("🔐 currentUser установлен:", {
      local: currentUser,
      global: window.currentUser,
      hasUserId: !!window.currentUser?.userId,
      role: window.currentUser?.role
    });
    
    updateUserDisplay();
    showMainApp();
    
    if (role === 'operator') {
      localStorage.setItem('mobileLogin', 'true');
      localStorage.setItem('operatorName', username);
    } else {
      localStorage.removeItem('mobileLogin');
      localStorage.removeItem('operatorName');
    }
    await refreshAll(false);
    if (!applicationControlsReady) await init();
    await switchPane(role === 'operator' ? 'my' : 'orders');

    // Настраиваем таймер бездействия после успешного входа
    setupIdleTimer();
    
    // Сбрасываем таймер бездействия
    resetIdleTimer();
    
    return true;
  } catch(e) {
    const errorEl = $("loginError");
    errorEl.textContent = e.message || "Ошибка входа";
    errorEl.style.display = "block";
    return false;
  }
}

async function doLogout(){
  if (loginFlight) await loginFlight;
  window.PagesClient?.beginLogout();
  window.CatalogState?.reset();
  window.ColumnsModule?.reset();
  window.AccessSettings?.reset();
  window.DesignerModule?.reset?.();
  window.TechCardsModule?.reset();
  window.BrainModule?.reset();
  try {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    // Server invalidation must receive the bearer before the tab clears it.
    await api("/api/auth/logout", { method: "POST" });
  } catch (e) {
    console.error("Ошибка выхода:", e);
  } finally {
    window.PagesClient?.logout();
    currentUser = null;
    window.currentUser = null;
    localStorage.removeItem('mobileLogin');
    localStorage.removeItem('operatorName');
    showLoginPage();
  }
}

function updateUserDisplay(){
  const userEl = $("currentUser");
  const logoutBtn = $("logoutBtn");
  const refreshBtn = $("refresh");
  if(currentUser){
    document.querySelectorAll('.navbtn[data-go]').forEach(button => {
      button.style.display = currentUser.role === 'admin' || ['my', 'barcode'].includes(button.dataset.go) ? '' : 'none';
    });
    const displayName = currentUser.operatorName || currentUser.username;
    const roleText = currentUser.role === 'admin' ? '👑 Админ' : '👤 Оператор';
    userEl.textContent = `${roleText}: ${displayName}`;
    userEl.style.display = "";
    logoutBtn.style.display = "";
    // Скрываем кнопку "Обновить" для операторов
    if(refreshBtn){
      refreshBtn.style.display = currentUser.role === 'admin' ? "" : "none";
    }
  } else {
    userEl.style.display = "none";
    logoutBtn.style.display = "none";
    if(refreshBtn){
      refreshBtn.style.display = "none";
    }
  }
}

// Таймер бездействия
let idleTimer = null;
let operatorIdleTimeout = 10; // По умолчанию 10 секунд для операторов (в секундах)
let adminIdleTimeout = 0; // 0 = отключен для администратора (в секундах)
let idleTimerHandlers = null; // Храним ссылки на обработчики для правильного удаления

function resetIdleTimer(){
  // Очищаем предыдущий таймер
  if(idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  
  // Если пользователь не авторизован, не запускаем таймер
  if(!currentUser) return;
  
  // Для мобильных устройств отключаем таймер бездействия
  const deviceType = getDeviceType();
  if(deviceType === 'mobile') {
    return; // Не запускаем таймер для мобильных устройств
  }
  
  // Определяем таймаут в зависимости от роли пользователя
  let timeout;
  if(currentUser.role === 'admin'){
    timeout = adminIdleTimeout > 0 ? adminIdleTimeout * 1000 : 0; // 0 = отключен
  } else {
    // operatorIdleTimeout уже в секундах
    timeout = operatorIdleTimeout > 0 ? operatorIdleTimeout * 1000 : 10000; // Конвертируем в миллисекунды
  }
  
  if(timeout <= 0) return; // Отключен для администратора
  
  // Устанавливаем новый таймер
  idleTimer = setTimeout(() => {
    // Автоматический выход после бездействия
    if(currentUser){
      doLogout();
      toast("Сеанс завершен из-за бездействия");
    }
  }, timeout);
}

// Создаем обертку для resetIdleTimer, чтобы можно было правильно удалять обработчики
function createIdleHandler(){
  if(!idleTimerHandlers){
    idleTimerHandlers = () => {
      resetIdleTimer();
    };
  }
  return idleTimerHandlers;
}

function setupIdleTimer(){
  // Сбрасываем таймер при любом действии пользователя
  const events = ['mousedown', 'mousemove', 'keypress', 'keydown', 'scroll', 'touchstart', 'touchmove', 'click', 'input', 'change', 'wheel', 'pointerdown', 'pointermove'];
  
  const handler = createIdleHandler();
  
  // Удаляем старые обработчики, если они есть
  if(idleTimerHandlers){
    events.forEach(event => {
      document.removeEventListener(event, handler, true);
      window.removeEventListener(event, handler, true);
    });
    window.removeEventListener('focus', handler, true);
  }
  
  // Добавляем новые обработчики на document и window для лучшего покрытия
  events.forEach(event => {
    document.addEventListener(event, handler, { capture: true, passive: true });
    window.addEventListener(event, handler, { capture: true, passive: true });
  });
  
  // Также отслеживаем фокус окна
  window.addEventListener('focus', handler, { capture: true, passive: true });
  
  // Сбрасываем таймер сразу после настройки
  resetIdleTimer();
}


function bindAuthControls(){
  // Обработчики для страницы входа
  $("adminLoginBtn").onclick = () => {
    $("operatorLoginForm")?.remove();
    $("adminLoginForm").style.display = "block";
    $("adminLoginBtn").style.display = "none";
    $("operatorsGrid").style.display = "none";
    $("adminUsername").focus();
  };

  $("adminLoginCancelBtn").onclick = () => {
    $("adminLoginForm").style.display = "none";
    $("adminLoginBtn").style.display = "block";
    $("operatorsGrid").style.display = "grid";
    $("loginError").style.display = "none";
  };

  $("adminLoginSubmitBtn").onclick = async () => {
    $("loginError").style.display = "none";
    const username = $("adminUsername").value.trim();
    const password = $("adminPassword").value;
    if(!username || !password){
      $("loginError").textContent = "Заполните все поля";
      $("loginError").style.display = "block";
      return;
    }
    await doLogin('admin', username, password);
  };

  // Enter для входа администратора
  $("adminPassword").onkeydown = (e) => {
    if(e.key === "Enter") $("adminLoginSubmitBtn").click();
  };
  $("adminUsername").onkeydown = (e) => {
    if(e.key === "Enter") $("adminPassword").focus();
  };

  $('operatorSearch').oninput = event => {
    const value = event.target.value.trim().toLowerCase();
    $('operatorsGrid').querySelectorAll('button').forEach(button => { button.hidden = !button.dataset.operatorName.toLowerCase().includes(value); });
  };
  bindOperatorLogin();
}

function bindOperatorLogin() {
  // The form is created on selection; no duplicate document listeners.
}
function openOperatorLogin(name) {
  $('operatorLoginForm')?.remove();
  $('loginError').style.display = 'none';
  $('operatorsGrid').style.display = 'none';
  $('adminLoginForm').style.display = 'none';
  const form = document.createElement('form');
  form.id = 'operatorLoginForm';
  form.className = 'card';
  form.style.cssText = 'max-width:440px;margin:16px auto;padding:20px';
  form.innerHTML = `<h3>${esc(name)}</h3><label for="operatorCode">Личный код</label><input id="operatorCode" type="password" inputmode="numeric" autocomplete="current-password" required minlength="6" maxlength="64" style="width:100%;font-size:20px;letter-spacing:4px;margin:10px 0"><p class="hint">Код выдаёт администратор. Ваше имя не является паролем.</p><button class="btn accent" type="submit" style="width:100%;margin:12px 0">Войти</button><button class="btn ghost" type="button" data-cancel style="width:100%">Выбрать другое имя</button>`;
  $('operatorsGrid').after(form);
  form.querySelector('[data-cancel]').onclick = () => { form.remove(); $('operatorsGrid').style.display = 'grid'; $('loginError').style.display = 'none'; };
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try { await doLogin('operator', name, $('operatorCode').value); }
    finally { button.disabled = false; if ($('operatorCode')) $('operatorCode').value = ''; }
  };
  $('operatorCode').focus();
}

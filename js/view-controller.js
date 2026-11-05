let paneNavigationSerial = 0;
let requestedPaneId = null;
async function switchPane(id){
  // Для операторов ограничиваем доступ только к разделу "Мои задачи"
  if(currentUser && currentUser.role === 'operator' && id !== 'my' && id !== 'barcode'){
    toast("Операторы могут работать только в разделах 'Мои задачи' и 'Штрихкод'");
    return;
  }
  
  const navigation = ++paneNavigationSerial;
  const owner = currentUser;
  requestedPaneId = id;
  const isCurrentNavigation = () => navigation === paneNavigationSerial && currentUser === owner;
  if (id !== 'settings' && $('accessCode')) $('accessCode').textContent = '';
  if (id !== 'designer') window.DesignerModule?.stopLiveUpdate?.();

  // Сначала показываем секцию
  document.querySelectorAll(".pane").forEach(p=>p.style.display="none");
  
  // При переключении на вкладку "Заказы" заполняем селекторы для добавления изделия
  if(id === 'orders'){
    if(typeof window.fillNewItemSelectors === "function") {
      window.fillNewItemSelectors();
    } else if(typeof fillNewItemSelectors === "function") {
      fillNewItemSelectors();
    }
  }

  // Проверяем, существует ли элемент
  const targetElement = $(id);
  if (!targetElement) {
    console.error(`Element with id "${id}" not found`);
    toast(`❌ Раздел "${id}" не найден`);
    return;
  }

  targetElement.style.display="";
  
  // Lazy loading модулей для раздела (если ModuleLoader доступен)
  // Важно: загрузка происходит ПОСЛЕ того как секция показана
  if(window.ModuleLoader && ModuleLoader.moduleMap[id]) {
    try {
      await ModuleLoader.loadForPane(id);
    } catch(e) {
      console.warn("Module loading failed for pane:", id, e);
      if (isCurrentNavigation()) toast('Не удалось открыть раздел. Повторите переход.');
      return false;
    }
  }
  
  if (!isCurrentNavigation()) {
    // A late designer mount may start its timer after the user has left.
    if (requestedPaneId !== 'designer' || currentUser !== owner) window.DesignerModule?.stopLiveUpdate?.();
    return false;
  }

  // Загружаем ширины колонок ПЕРЕД рендерингом
  if (currentUser && currentUser.userId) {
    if (typeof loadColumnWidthsFromServer === 'function') {
      await loadColumnWidthsFromServer();
    }
  }
  
  if (!isCurrentNavigation()) return false;

  // Обновляем активную кнопку навигации
  document.querySelectorAll(".navbtn").forEach(b=>{
    b.classList.toggle("active", b.dataset.go===id);
    
    // Для операторов скрываем все кнопки кроме "Мои задачи" и "Штрихкод"
    if(currentUser && currentUser.role === 'operator'){
      if(b.dataset.go === 'my' || b.dataset.go === 'barcode'){
        b.style.display = "";
      } else {
        b.style.display = "none";
      }
    } else {
      // Для администраторов показываем все кнопки
      b.style.display = "";
    }
  });
  
  window.scrollTo({top:0, behavior:"smooth"});
  await renderAll();
  if (!isCurrentNavigation()) return false;
  
  // Сбрасываем таймер бездействия при переключении разделов
  if(currentUser) resetIdleTimer();
  
  // Для операторов в разделе "Мои задачи" явно вызываем renderMy
  if(id === 'my'){
    // Убеждаемся, что селектор установлен на имя оператора (если это оператор)
    if(currentUser && currentUser.role === 'operator' && $("my_op") && currentUser.operatorName){
      const operatorExists = Array.from($("my_op").options).some(opt => opt.value === currentUser.operatorName);
      if(operatorExists && $("my_op").value !== currentUser.operatorName){
        $("my_op").value = currentUser.operatorName;
        // Триггерим событие change для применения фильтра
        $("my_op").dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    // Вызываем renderMy с небольшой задержкой, чтобы убедиться, что все готово
    setTimeout(() => {
      if(isCurrentNavigation() && typeof renderMy === 'function'){
        renderMy();
      }
    }, 100);
  }
  
  // The loader has already awaited the one-time designer mount.
  if (id === 'designer') {
    const orderSelect = $('designerOrderSelectMain');
    if (orderSelect) {
      const selected = window.designer?.selectedOrderId || orderSelect.value || '';
      fillSelect(orderSelect, ['', ...state.orders.map(order => ({ id: order.id, name: `${order.id} — ${order.client || 'Без клиента'}` }))], selected);
      if (orderSelect.firstElementChild) orderSelect.firstElementChild.textContent = '— Выберите заказ —';
    }
    if (window.DesignerModule?.enter) await window.DesignerModule.enter();
    else window.DesignerModule?.startLiveUpdate?.();
    if (!isCurrentNavigation()) return false;
  }
  return true;
}


async function renderAll(){
  // Загружаем сохраненную сортировку перед рендерингом
  const savedSortBy = localStorage.getItem("sortBy");
  if(savedSortBy) {
    state.sortBy = savedSortBy;
  }
  
  // Сбрасываем кеш таймеров при перерисовке
  timerCache.timers = null;
  timerCache.setupTimers = null;
  timerCache.lastUpdate = 0;
  
  // НЕ загружаем ширины колонок здесь - они уже загружены при инициализации приложения
  // Это предотвращает перезапись данных при обновлении
  
  // Обновляем видимость навигационных кнопок
  document.querySelectorAll(".navbtn").forEach(b=>{
    // Для операторов скрываем все кнопки кроме "Мои задачи" и "Штрихкод"
    if(currentUser && currentUser.role === 'operator'){
      if(b.dataset.go === 'my' || b.dataset.go === 'barcode'){
        b.style.display = "";
      } else {
        b.style.display = "none";
      }
    } else {
      // Для администраторов показываем все кнопки
      b.style.display = "";
    }
  });
  
  renderSelectors();
  const pane = [...document.querySelectorAll('.pane')].find(el => el.style.display !== 'none')?.id;
  if (currentUser?.role === 'operator') {
    if (pane === 'my') renderMy();
  } else {
    const renderers = {
      orders: [renderKPIs, renderOrders, renderOrderItems],
      routing: [renderOps, renderTemplateSelector, renderTemplates], ops: [renderOps], my: [renderMy], machine: [renderMachine],
      templates: [renderTemplateSelector, renderTemplates],
      settings: [renderMaterialsSettings, renderUnitsSettings, renderProductTemplatesSettings, renderClientProfilesSettings],
      stats: [fillStatsFilters]
    };
    for (const render of renderers[pane] || []) await render();
    if (pane === 'settings') {
      await window.SettingsModule?.renderMaterialTypesSettings?.();
      await window.SettingsModule?.renderProductTypesSettings?.();
      await window.AccessSettings?.render();
    }
    if (pane === 'orders') window.fillNewItemSelectors?.();
  }

  // Убеждаемся, что operators и machines - массивы строк
  const operatorsList = Array.isArray(state.operators) 
    ? state.operators.map(o => typeof o === 'string' ? o : (o?.name || String(o))) 
    : [];
  const machinesList = Array.isArray(state.machines) 
    ? state.machines.map(m => typeof m === 'string' ? m : (m?.name || String(m))) 
    : [];
  
  $("s_ops").value = operatorsList.join("\n");
  $("s_machs").value = machinesList.join("\n");
  if($("sort_by")) $("sort_by").value = state.sortBy || "order";
  if($("sort_by_status")) $("sort_by_status").value = localStorage.getItem("sortByStatus") || "";
  if($("m_sort")) $("m_sort").value = localStorage.getItem("machineSortBy") || "date";
  if($("my_sort")) $("my_sort").value = localStorage.getItem("mySortBy") || "machine";
  if($("my_order")) $("my_order").value = localStorage.getItem("myOrderFilter") || "(все)";
  
  // Обновляем визуальный индикатор сортировки
  if(typeof updateSortVisualIndicator === 'function'){
    updateSortVisualIndicator();
  }
  
  // Восстанавливаем фильтры по дате
  const savedFilterDate = localStorage.getItem("filterDate");
  const savedFilterDateMode = localStorage.getItem("filterDateMode");
  if(savedFilterDate && $("f_date")) $("f_date").value = savedFilterDate;
  if(savedFilterDateMode && $("f_date_mode")) $("f_date_mode").value = savedFilterDateMode;
  window.ColumnsModule?.initAll?.();
}


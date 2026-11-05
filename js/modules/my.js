/**
 * B'BOX Production - My Tasks Module
 * Модуль "Мои задачи"
 */

(function() {
  'use strict';
  
  if (window.MyModule && window.MyModule.loaded) {
    console.log('My module already loaded');
    if(typeof window.renderMy === 'function') window.renderMy();
    return;
  }
  
  console.log('Loading My Tasks module...');

  // Helper: Get filtered operations for current operator
  function myOps() {
    // Используем единые фильтры (без дублирования для мобильной и десктоп версии)
    const opEl = $("my_op");
    const orderEl = $("my_order");
    const dateEl = $("my_date");
    const dateModeEl = $("my_date_mode");
    const statusEl = $("my_status");
    
    const opVal = opEl?.value || "";
    const orderVal = orderEl?.value || "(все)";
    const dateVal = dateEl?.value || "";
    const dateMode = dateModeEl?.value || "all";
    const statusVal = statusEl?.value || "all";
    
    // Если нет операций в state, возвращаем пустой массив
    if(!state.ops || state.ops.length === 0) {
      return [];
    }
    
    let ops = state.ops.slice();
    
    // Filter by operator - если оператор выбран, фильтруем, иначе показываем все
    // Важно: если оператор выбран, показываем только его задачи
    // Если не выбран (пустая строка), показываем все задачи
    if(opVal && opVal.trim() !== "" && opVal !== "(все)") {
      ops = ops.filter(o => o.operator === opVal);
    }
    
    // Filter by order
    if(orderVal && orderVal !== "(все)") {
      ops = ops.filter(o => o.order_id === orderVal);
    }
    
    // Filter by date
    if(dateMode === "selected" && dateVal) {
      ops = ops.filter(o => o.date === dateVal);
    }
    
    // Filter by status
    if(statusVal && statusVal !== "all") {
      ops = ops.filter(o => o.status === statusVal);
    }
    
    return ops;
  }
  window.myOps = myOps;

function renderMy(){
  const list=$("myList"); list.innerHTML="";
  const ops=myOps();
  const sortBy = $("my_sort") ? $("my_sort").value : "machine";
  const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  
  if(!ops.length){
    list.innerHTML = `<div class="card"><b>Нет задач</b><div class="hint">Добавь операции в «Маршрут».</div></div>`;
    return;
  }
  
    // Группируем операции по статусу для сворачивания
    const groupedByStatus = {};
    for(const op of ops){
      const status = op.status || "Без статуса";
      if(!groupedByStatus[status]){
        groupedByStatus[status] = [];
      }
      groupedByStatus[status].push(op);
    }
    
    // Загружаем состояние сворачивания из localStorage
    const collapsedGroups = JSON.parse(localStorage.getItem("myCollapsedGroups") || "{}");
    
    // Если сортировка по статусу, сортируем группы статусов в правильном порядке
    const statusOrder = {
      "Запланировано": 1,
      "Наладка": 2,
      "В работе": 3,
      "Выполнено": 4,
      "Стоп": 5,
      "Без статуса": 99
    };
    
    // Сортируем группы статусов если выбрана сортировка по статусу
    let sortedStatusGroups = Object.entries(groupedByStatus);
    if(sortBy === "status"){
      sortedStatusGroups = sortedStatusGroups.sort((a, b) => {
        const orderA = statusOrder[a[0]] || 99;
        const orderB = statusOrder[b[0]] || 99;
        return orderA - orderB;
      });
    } else {
      // Для других сортировок сортируем по алфавиту статусов
      sortedStatusGroups = sortedStatusGroups.sort((a, b) => a[0].localeCompare(b[0]));
    }
    
    // Создаем контейнеры для каждой группы статусов
  for(const [status, statusOps] of sortedStatusGroups){
      const isCollapsed = collapsedGroups[status] === true;
      
      // Заголовок группы статуса
      const statusHeader = document.createElement("div");
      statusHeader.className = "card";
      statusHeader.style.cursor = "pointer";
      statusHeader.style.userSelect = "none";
      statusHeader.style.marginBottom = "4px";
      statusHeader.dataset.status = status;
      
      const statusIcon = status === "Запланировано" ? "📋" : 
                        status === "Наладка" ? "🔧" :
                        status === "В работе" ? "⚙️" :
                        status === "Выполнено" ? "✅" :
                        status === "Стоп" ? "⏸️" : "❓";
      
      const collapseIcon = isCollapsed ? "▶" : "▼";
      statusHeader.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <span style="font-size:16px;margin-right:8px">${collapseIcon}</span>
            <b>${statusIcon} ${esc(status)}</b>
            <span class="hint">(${statusOps.length} оп.)</span>
          </div>
        </div>
      `;
      
      // Обработчик клика для сворачивания/разворачивания
      statusHeader.onclick = () => {
        const newCollapsed = !collapsedGroups[status];
        collapsedGroups[status] = newCollapsed;
        localStorage.setItem("myCollapsedGroups", JSON.stringify(collapsedGroups));
        renderMy(); // Перерисовываем
      };
      
      list.appendChild(statusHeader);
      
      // Контейнер для операций этой группы
      const statusContainer = document.createElement("div");
      statusContainer.className = "status-group-container";
      statusContainer.dataset.status = status;
      statusContainer.style.display = isCollapsed ? "none" : "block";
    
    // Сортируем операции внутри статуса по основной сортировке
    const sortedStatusOps = [...statusOps].sort((a, b) => {
      if(sortBy === "item"){
        const itemLabelA = typeof getOpItemLabel === 'function' ? getOpItemLabel(a) : '';
        const itemLabelB = typeof getOpItemLabel === 'function' ? getOpItemLabel(b) : '';
        const comp = (itemLabelA || "Без изделия").localeCompare(itemLabelB || "Без изделия");
        if(comp !== 0) return comp;
        // Если изделия одинаковые, сортируем по заказу и номеру операции
        const orderComp = (a.order_id || "").localeCompare(b.order_id || "");
        if(orderComp !== 0) return orderComp;
        return (+a.no || 0) - (+b.no || 0);
      } else if(sortBy === "order"){
        const orderComp = (a.order_id || "").localeCompare(b.order_id || "");
        if(orderComp !== 0) return orderComp;
        return (+a.no || 0) - (+b.no || 0);
      } else if(sortBy === "date"){
        const dateComp = (a.date || "").localeCompare(b.date || "");
        if(dateComp !== 0) return dateComp;
        const timeComp = (a.time || "").localeCompare(b.time || "");
        if(timeComp !== 0) return timeComp;
        return (a.order_id || "").localeCompare(b.order_id || "") || (+a.no || 0) - (+b.no || 0);
      } else {
        // По умолчанию: по машине
        const machComp = (a.machine || "").localeCompare(b.machine || "");
        if(machComp !== 0) return machComp;
        const dateComp = (a.date || "").localeCompare(b.date || "");
        if(dateComp !== 0) return dateComp;
        return (a.order_id || "").localeCompare(b.order_id || "") || (+a.no || 0) - (+b.no || 0);
      }
    });
    
    // Группируем операции внутри статуса по основной сортировке
    let currentGroup = "";
    for(const op of sortedStatusOps){
      // Определяем текущую группу в зависимости от сортировки
      let groupValue = "";
      let groupIcon = "";
      
      if(sortBy === "order"){
        groupValue = op.order_id;
        groupIcon = "📦";
      } else if(sortBy === "date"){
        groupValue = op.date || "Без даты";
        groupIcon = "📅";
      } else if(sortBy === "item"){
        const itemLabel = typeof getOpItemLabel === 'function' ? getOpItemLabel(op) : '';
        groupValue = itemLabel || "Без изделия";
        groupIcon = "📦";
      } else {
        groupValue = op.machine;
        groupIcon = "🛠️";
      }
      
      // Показываем заголовок группы при смене группы
      if(groupValue !== currentGroup){
        currentGroup = groupValue;
        const h=document.createElement("div"); 
        h.className="card";
        h.style.marginLeft = "20px";
        h.style.marginBottom = "4px";
        h.style.background = "rgba(0,207,181,.05)";
        const displayValue = sortBy === "date" && groupValue !== "Без даты" ? formatDate(groupValue) : groupValue;
        h.innerHTML=`<b>${groupIcon} ${esc(displayValue)}</b> <span class="hint">группа</span>`;
        statusContainer.appendChild(h);
      }
      const c=completion(op);
      const el=document.createElement("div");
      el.className="task";
      if(isOverdue(op)){
        el.className += " overdue";
      } else if(op.status === "Выполнено" && (+op.fact||0) >= (+op.plan||0) && (+op.plan||0) > 0){
        // Операция выполнена на 100% - зелёный цвет
        el.style.borderColor = "rgba(46,204,113,.55)";
        el.style.background = "rgba(46,204,113,.05)";
      } else if(c>=1){
        el.style.borderColor = "rgba(46,204,113,.35)";
      }
      // Формируем HTML таймера
      let timerChipHTML = "";
      
      // Проверяем, идёт ли наладка
      const isSetupInProgress = op.status === "Наладка";
    
    if(isSetupInProgress){
      // Идёт наладка - показываем большой таймер обратного отсчёта
      // Используем вычисленное время с сервера (current_setup_duration)
      let totalSetupElapsed = 0;
      if(op.current_setup_duration !== undefined){
        // Время вычисляется на сервере - используем его значение
        totalSetupElapsed = op.current_setup_duration;
      } else if(op.setup_duration !== undefined){
        // Если current_setup_duration не доступен, используем сохраненное время
        totalSetupElapsed = op.setup_duration || 0;
      }
      
      if(op.setup_started_at || totalSetupElapsed > 0){
        
        const plannedSetupTime = Number(op.planned_setup_time) || 0;
        
        let setupRemaining = plannedSetupTime > 0 ? plannedSetupTime - totalSetupElapsed : 0;
        let setupOverdue = 0; // Просроченное время
        let isWarning = false;
        let isCritical = false;
        
        if(plannedSetupTime > 0){
          if(setupRemaining <= 0){
            isCritical = true;
            setupOverdue = Math.abs(setupRemaining); // Просроченное время
            setupRemaining = 0;
          } else if(setupRemaining <= plannedSetupTime * 0.2){
            isWarning = true;
          }
        }
        
        // Формируем отображаемое время
        let displayTime;
        if(isCritical && setupOverdue > 0){
          // Показываем просроченное время с минусом (оно продолжает нарастать)
          displayTime = `-${formatDuration(setupOverdue)}`;
        } else if(plannedSetupTime > 0){
          // Показываем оставшееся время
          displayTime = formatDuration(setupRemaining);
        } else {
          // Нет плана - показываем прошедшее время
          displayTime = formatDuration(totalSetupElapsed);
        }
        
        const warningClass = isCritical ? "setup-timer-critical" : isWarning ? "setup-timer-warning" : "";
        
        const previousSetupTimeForData = op.setup_duration || 0;
        timerChipHTML = `
          <div class="setup-timer-container ${warningClass}" data-setup-timer="${op.id}" data-setup-started-at="${op.setup_started_at}" data-planned="${plannedSetupTime}" data-previous="${previousSetupTimeForData}" style="margin-top:12px;padding:16px;background:${isCritical ? 'rgba(255,77,77,.2)' : isWarning ? 'rgba(255,176,32,.15)' : 'rgba(255,176,32,.1)'};border:2px solid ${isCritical ? 'var(--bad)' : isWarning ? 'var(--warn)' : 'rgba(255,176,32,.4)'};border-radius:12px;text-align:center">
            <div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">🔧 Наладка</div>
            <div style="font-size:32px;font-weight:900;font-family:var(--mono);color:${isCritical ? 'var(--bad)' : isWarning ? 'var(--warn)' : 'var(--warn)'};line-height:1.2" class="setup-timer-display">${displayTime}</div>
            ${plannedSetupTime > 0 ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">План: ${formatDuration(plannedSetupTime)}</div>` : '<div style="font-size:11px;color:var(--muted);margin-top:4px">Время наладки</div>'}
            ${totalSetupElapsed > 0 ? `<div data-spent-time style="font-size:10px;color:var(--muted);margin-top:2px">Потрачено: ${formatDuration(totalSetupElapsed)}</div>` : ''}
            ${isCritical ? `<div data-overdue-time style="font-size:12px;color:var(--bad);margin-top:8px;font-weight:800">⏰ Время вышло! Просрочено: ${formatDuration(setupOverdue)} (продолжается отсчет)</div>` : '<div data-overdue-time style="display:none"></div>'}
          </div>
        `;
      } else {
        // Наладка началась, но setup_started_at ещё не установлен (обновится после сохранения)
        // Показываем плановое время наладки, если оно есть
        const plannedSetupTime = Number(op.planned_setup_time) || 0;
        const displayTime = plannedSetupTime > 0 ? formatDuration(plannedSetupTime) : "00:00";
        // Используем текущее время как ISO строку для таймера (будет обновлено после сохранения)
        const tempStartTime = new Date().toISOString();
        timerChipHTML = `
          <div class="setup-timer-container" data-setup-timer="${op.id}" data-setup-started-at="${tempStartTime}" data-planned="${plannedSetupTime}" data-previous="0" style="margin-top:12px;padding:16px;background:rgba(255,176,32,.1);border:2px solid rgba(255,176,32,.4);border-radius:12px;text-align:center">
            <div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">🔧 Наладка</div>
            <div style="font-size:32px;font-weight:900;font-family:var(--mono);color:var(--warn);line-height:1.2" class="setup-timer-display">${displayTime}</div>
            ${plannedSetupTime > 0 ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">План: ${formatDuration(plannedSetupTime)}</div>` : '<div style="font-size:11px;color:var(--muted);margin-top:4px">Начало наладки...</div>'}
          </div>
        `;
      }
      
    } else if(op.status === "Стоп" && (op.setup_started_at || op.setup_duration > 0)){
      // Операция приостановлена, но была наладка - показываем сколько уже потрачено
      // Используем вычисленное время с сервера (current_setup_duration) или сохраненное время
      let setupElapsed = 0;
      if(op.current_setup_duration !== undefined){
        // Время вычисляется на сервере - используем его значение
        setupElapsed = op.current_setup_duration;
      } else if(op.setup_duration !== undefined){
        // Если current_setup_duration не доступен, используем сохраненное время (в статусе Стоп время уже зафиксировано)
        setupElapsed = op.setup_duration || 0;
      }
      const plannedSetupTime = Number(op.planned_setup_time) || 0;
      
      let setupRemaining = plannedSetupTime > 0 ? plannedSetupTime - setupElapsed : 0;
      let setupOverdue = 0;
      let isCritical = false;
      
      if(plannedSetupTime > 0 && setupRemaining <= 0){
        isCritical = true;
        setupOverdue = Math.abs(setupRemaining);
        setupRemaining = 0;
      }
      
      timerChipHTML = `
        <div class="setup-timer-container ${isCritical ? 'setup-timer-critical' : ''}" style="margin-top:12px;padding:16px;background:${isCritical ? 'rgba(255,77,77,.15)' : 'rgba(149,165,166,.12)'};border:2px solid ${isCritical ? 'var(--bad)' : 'rgba(149,165,166,.4)'};border-radius:12px;text-align:center">
          <div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">⏸️ Наладка (пауза)</div>
          <div style="font-size:28px;font-weight:900;font-family:var(--mono);color:${isCritical ? 'var(--bad)' : 'var(--muted)'};line-height:1.2">${isCritical ? `-${formatDuration(setupOverdue)}` : formatDuration(setupElapsed)}</div>
          ${plannedSetupTime > 0 ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">План: ${formatDuration(plannedSetupTime)}</div>` : ''}
          <div style="font-size:10px;color:var(--muted);margin-top:2px">Потрачено: ${formatDuration(setupElapsed)}</div>
          ${isCritical ? `<div style="font-size:12px;color:var(--bad);margin-top:8px;font-weight:800">⏰ Просрочено: ${formatDuration(setupOverdue)} (продолжается отсчет)</div>` : ''}
        </div>
      `;
      
    } else if(op.status === "В работе" && op.started_at){
      // Основная работа - показываем большой таймер обратного отсчёта для производства
      // Время начала производства могло быть установлено ранее, продолжаем отсчёт
      // Parse UTC time from server (format: "YYYY-MM-DD HH:MM:SS")
      const utcTime = op.started_at.replace(" ", "T") + "Z";
      const startTime = new Date(utcTime).getTime();
      const now = Date.now();
      const previousWorkTime = op.total_duration || 0;
      const currentWorkElapsed = Math.floor((now - startTime) / 1000);
      const totalWorkElapsed = previousWorkTime + currentWorkElapsed;
      const plannedDuration = op.planned_duration || 0;
      
      let productionRemaining = plannedDuration > 0 ? plannedDuration - totalWorkElapsed : 0;
      let productionOverdue = 0;
      let isWarning = false;
      let isCritical = false;
      
      if(plannedDuration > 0){
        if(productionRemaining <= 0){
          isCritical = true;
          productionOverdue = Math.abs(productionRemaining);
          productionRemaining = 0;
        } else {
          const remainingPercent = (productionRemaining / plannedDuration) * 100;
          if(remainingPercent <= 20){
            isWarning = true;
          }
        }
      }
      
      const remainingTime = isCritical ? `-${formatDuration(productionOverdue)}` : (productionRemaining > 0 ? formatDuration(productionRemaining) : "00:00");
      
      // Вычисляем время окончания тиража
      let completionTimeStr = "";
      if(plannedDuration > 0 && op.started_at){
        const completionTime = new Date(startTime + (plannedDuration * 1000));
        completionTimeStr = completionTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      }
      
      let setupInfo = "";
      if(op.setup_duration > 0){
        setupInfo = `<div style="font-size:10px;color:var(--muted);margin-top:4px">Наладка: ${formatDuration(op.setup_duration)}</div>`;
      }
      
      timerChipHTML = `
        <div class="production-timer-container ${isCritical ? 'production-timer-critical' : isWarning ? 'production-timer-warning' : ''}" data-timer="${op.id}" data-started-at="${op.started_at}" data-planned="${plannedDuration}" data-previous="${previousWorkTime}" style="margin-top:12px;padding:16px;background:${isCritical ? 'rgba(255,77,77,.15)' : isWarning ? 'rgba(255,176,32,.15)' : 'rgba(0,207,181,.1)'};border:2px solid ${isCritical ? 'var(--bad)' : isWarning ? 'var(--warn)' : 'rgba(0,207,181,.4)'};border-radius:12px;text-align:center">
          <div style="font-size:11px;color:var(--muted);margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">⚙️ Производство</div>
          <div style="font-size:32px;font-weight:900;font-family:var(--mono);color:${isCritical ? 'var(--bad)' : isWarning ? 'var(--warn)' : 'var(--accent)'};line-height:1.2" class="production-timer-display">${remainingTime}</div>
          ${plannedDuration > 0 ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">План: ${formatDuration(plannedDuration)}</div>` : ''}
          ${completionTimeStr ? `<div style="font-size:12px;color:var(--accent);margin-top:6px;font-weight:700">⏰ Окончание: <span class="completion-time-display">${completionTimeStr}</span></div>` : ''}
          ${setupInfo}
          ${isCritical ? `<div style="font-size:12px;color:var(--bad);margin-top:8px;font-weight:800">⏰ Просрочено: ${formatDuration(productionOverdue)} (продолжается отсчет)</div>` : ''}
        </div>
      `;
      
    } else if(op.status === "Стоп" || op.status === "Приостановлено"){
      // Операция приостановлена (если не было наладки, показываем просто статус)
      if(!op.setup_started_at && op.setup_duration === 0){
        timerChipHTML = `<span class="chip" style="background:rgba(149,165,166,.12);border-color:rgba(149,165,166,.4);font-weight:900">⏸️ Приостановлено</span>`;
      }
      // Если была наладка, информация уже показана выше
      
    } else if(op.status === "Выполнено" && (+op.fact||0) >= (+op.plan||0) && (+op.plan||0) > 0){
      // Операция выполнена на 100% - показываем зелёный цвет и время
      const plannedDuration = op.planned_duration || 0;
      let icon = '✅';
      let bgColor = 'rgba(46,204,113,.12)';
      let borderColor = 'rgba(46,204,113,.4)';
      
      if(op.total_duration > 0){
      if(plannedDuration > 0 && op.total_duration > plannedDuration * 1.1){
        icon = '⚠️';
        bgColor = 'rgba(255,176,32,.12)';
        borderColor = 'rgba(255,176,32,.4)';
      }
      
      const plannedInfo = plannedDuration > 0 ? ` / ${formatDuration(plannedDuration)}` : '';
      timerChipHTML = `<span class="chip" style="background:${bgColor};border-color:${borderColor};font-weight:900">${icon} ${formatDuration(op.total_duration)}${plannedInfo}</span>`;
      } else {
        timerChipHTML = `<span class="chip" style="background:${bgColor};border-color:${borderColor};font-weight:900">${icon} Выполнено</span>`;
      }
    }
    
    // Формируем таймеры для отображения над кнопками
    let statusTimerHTML = "";
    
    // Таймер для наладки
    if(op.status === "Наладка" && op.setup_started_at){
      const plannedSetupTime = Number(op.planned_setup_time) || 0;
      let totalSetupElapsed = 0;
      if(op.current_setup_duration !== undefined){
        totalSetupElapsed = op.current_setup_duration;
      } else if(op.setup_duration !== undefined){
        totalSetupElapsed = op.setup_duration || 0;
      } else {
        // Parse UTC time from server (format: "YYYY-MM-DD HH:MM:SS")
        const utcTime = op.setup_started_at.replace(" ", "T") + "Z";
        const startTime = new Date(utcTime).getTime();
        const now = Date.now();
        totalSetupElapsed = Math.floor((now - startTime) / 1000);
      }
      
      let setupRemaining = plannedSetupTime > 0 ? plannedSetupTime - totalSetupElapsed : 0;
      let isOverdue = setupRemaining < 0;
      let displayTime = isOverdue ? `-${formatDuration(Math.abs(setupRemaining))}` : formatDuration(setupRemaining);
      
      statusTimerHTML = `
        <div class="status-timer status-timer-setup ${isOverdue ? 'status-timer-overdue' : ''}" data-timer-type="setup" data-op-id="${op.id}" data-started-at="${op.setup_started_at}" data-planned="${plannedSetupTime}" style="margin-bottom:6px;padding:6px 8px;background:${isOverdue ? 'rgba(255,77,77,.15)' : 'rgba(255,176,32,.1)'};border:1px solid ${isOverdue ? 'var(--bad)' : 'rgba(255,176,32,.4)'};border-radius:6px;text-align:center">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px;font-weight:700">🔧 Наладка</div>
          <div style="font-size:18px;font-weight:900;font-family:var(--mono);color:${isOverdue ? 'var(--bad)' : 'var(--warn)'}" class="status-timer-display">${displayTime}</div>
        </div>
      `;
    }
    // Таймер для работы
    else if(op.status === "В работе" && op.started_at){
      const plannedDuration = Number(op.planned_duration) || 0;
      // Parse UTC time from server (format: "YYYY-MM-DD HH:MM:SS")
      const utcTime = op.started_at.replace(" ", "T") + "Z";
      const startTime = new Date(utcTime).getTime();
      const now = Date.now();
      const previousWorkTime = op.total_duration || 0;
      const currentWorkElapsed = Math.floor((now - startTime) / 1000);
      const totalWorkElapsed = previousWorkTime + currentWorkElapsed;
      
      let productionRemaining = plannedDuration > 0 ? plannedDuration - totalWorkElapsed : 0;
      let isOverdue = productionRemaining < 0;
      let displayTime = isOverdue ? `-${formatDuration(Math.abs(productionRemaining))}` : formatDuration(productionRemaining);
      
      statusTimerHTML = `
        <div class="status-timer status-timer-work ${isOverdue ? 'status-timer-overdue' : ''}" data-timer-type="work" data-op-id="${op.id}" data-started-at="${op.started_at}" data-planned="${plannedDuration}" data-previous="${previousWorkTime}" style="margin-bottom:6px;padding:6px 8px;background:${isOverdue ? 'rgba(255,77,77,.15)' : 'rgba(0,207,181,.1)'};border:1px solid ${isOverdue ? 'var(--bad)' : 'rgba(0,207,181,.4)'};border-radius:6px;text-align:center">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px;font-weight:700">⚙️ В работе</div>
          <div style="font-size:18px;font-weight:900;font-family:var(--mono);color:${isOverdue ? 'var(--bad)' : 'var(--accent)'}" class="status-timer-display">${displayTime}</div>
        </div>
      `;
    }
    // Таймер для стопа (показываем просрочку если была)
    else if(op.status === "Стоп" && (op.setup_started_at || op.setup_duration > 0)){
      const plannedSetupTime = Number(op.planned_setup_time) || 0;
      let setupElapsed = 0;
      if(op.current_setup_duration !== undefined){
        setupElapsed = op.current_setup_duration;
      } else if(op.setup_duration !== undefined){
        setupElapsed = op.setup_duration || 0;
      }
      
      let setupRemaining = plannedSetupTime > 0 ? plannedSetupTime - setupElapsed : 0;
      let isOverdue = setupRemaining < 0;
      
      if(plannedSetupTime > 0 && isOverdue){
        statusTimerHTML = `
          <div class="status-timer status-timer-stop status-timer-overdue" data-timer-type="stop" data-op-id="${op.id}" style="margin-bottom:6px;padding:6px 8px;background:rgba(255,77,77,.15);border:1px solid var(--bad);border-radius:6px;text-align:center">
            <div style="font-size:9px;color:var(--muted);margin-bottom:2px;font-weight:700">⏸️ Стоп</div>
            <div style="font-size:18px;font-weight:900;font-family:var(--mono);color:var(--bad)" class="status-timer-display">-${formatDuration(Math.abs(setupRemaining))}</div>
          </div>
        `;
      }
    }
    
    el.innerHTML = `
      <!-- ID задачи и изделие - на самом верху (без статуса, он виден по кнопкам) -->
      <div style="flex-shrink:0;margin-bottom:${isMobile ? '6px' : '12px'};padding:${isMobile ? '10px 12px' : '10px 14px'};background:${isMobile ? 'rgba(0,207,181,.15)' : 'rgba(0,207,181,.08)'};border-radius:8px">
        <div style="display:flex;flex-direction:column;gap:2px">
          <span style="font-size:${isMobile ? '16px' : '16px'};font-weight:700;color:var(--muted);font-family:var(--mono)">${esc(op.order_id)} №${op.no}</span>
          ${(() => {
            const itemLabel = typeof getOpItemLabel === 'function' ? getOpItemLabel(op) : '';
            return itemLabel ? `<span style="font-size:${isMobile ? '14px' : '14px'};font-weight:600;color:var(--text);margin-top:2px">📦 ${esc(itemLabel)}</span>` : '';
          })()}
        </div>
      </div>

      <!-- Таймеры статусов (над кнопками) -->
      ${statusTimerHTML}

      <!-- Кнопки статусов -->
      <div class="task-status-buttons">
        <button class="task-status-btn status-planned ${op.status==="Запланировано"?"active":""}" data-status="Запланировано" data-op-id="${op.id}">
          <span class="status-icon">📋</span>
          <span class="status-label">Назначена</span>
        </button>
        <button class="task-status-btn status-setup ${op.status==="Наладка"?"active":""}" data-status="Наладка" data-op-id="${op.id}">
          <span class="status-icon">🔧</span>
          <span class="status-label">Наладка</span>
        </button>
        <button class="task-status-btn status-work ${op.status==="В работе"?"active":""}" data-status="В работе" data-op-id="${op.id}">
          <span class="status-icon">⚙️</span>
          <span class="status-label">В работе</span>
        </button>
        <button class="task-status-btn status-done ${op.status==="Выполнено"?"active":""}" data-status="Выполнено" data-op-id="${op.id}">
          <span class="status-icon">✅</span>
          <span class="status-label">Выполнено</span>
        </button>
        <button class="task-status-btn status-stop ${op.status==="Стоп"?"active":""}" data-status="Стоп" data-op-id="${op.id}">
          <span class="status-icon">⏸️</span>
          <span class="status-label">Стоп</span>
        </button>
      </div>

      <!-- Заголовок операции - крупно для мобильной версии -->
      <div style="flex-shrink:0;margin-bottom:${isMobile ? '8px' : '12px'}">
        <div class="op-name-editable" style="font-size:${isMobile ? '24px' : '26px'};font-weight:800;color:var(--blue);cursor:pointer;padding:${isMobile ? '14px 18px' : '14px 18px'};border-radius:8px;transition:background 0.2s ease;background:${isMobile ? 'rgba(0,207,181,.18)' : 'rgba(0,207,181,.08)'};border:2px solid ${isMobile ? 'rgba(0,207,181,.4)' : 'rgba(0,207,181,.2)'};line-height:1.3" data-op-id="${op.id}" data-field="name" title="Кликните для редактирования названия операции">${esc(op.name||"")}</div>
      </div>
      
      <!-- Направления (Откуда/Машина/Куда) - редактируемые -->
      <div style="flex-shrink:0;margin-bottom:${isMobile ? '6px' : '12px'};padding:${isMobile ? '8px' : '12px'};background:${isMobile ? 'rgba(156,39,176,.15)' : 'rgba(156,39,176,.08)'};border-radius:8px;border:1px solid ${isMobile ? 'rgba(156,39,176,.4)' : 'rgba(156,39,176,.2)'}">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div style="cursor:pointer" data-k="input_sources" data-op-id="${op.id}" title="Кликните для редактирования">
            <div style="font-size:${isMobile ? '14px' : '12px'};color:var(--muted);font-weight:700;text-transform:uppercase;margin-bottom:${isMobile ? '6px' : '4px'}">⬅️ Откуда</div>
            <div style="font-size:${isMobile ? '16px' : '14px'};font-weight:600;color:var(--text);min-height:${isMobile ? '32px' : '20px'};padding:${isMobile ? '8px 10px' : '8px 10px'};background:${isMobile ? '#fff' : 'rgba(255,255,255,.5)'};border-radius:4px;border:1px solid ${isMobile ? 'rgba(156,39,176,.4)' : 'rgba(156,39,176,.2)'}">
              ${(() => {
                const formatSources = (sources, isInput) => {
                  if (!sources) return '<span style="color:var(--muted)">—</span>';
                  let parsed = [];
                  try {
                    parsed = typeof sources === 'string' ? JSON.parse(sources) : sources;
                  } catch(e) {
                    parsed = [sources];
                  }
                  if (!Array.isArray(parsed)) parsed = [parsed];
                  if (parsed.length === 0) return '<span style="color:var(--muted)">—</span>';
                  
                  const labels = {
                    'warehouse': '🏭 Склад',
                    'warehouse_rest': '💤 Отдых',
                  };
                  
                  const display = parsed.map(s => {
                    const label = labels[s] || `⚙️ ${esc(String(s))}`;
                    return `<div style="line-height:1.4">${label}</div>`;
                  }).join('');
                  
                  return `<div style="font-size:${isMobile ? '16px' : '14px'}" title="${parsed.join(', ')}">${display}</div>`;
                };
                const inputSources = op.input_sources || null;
                const inputCritical = op.input_critical || 0;
                return formatSources(inputSources, true) + (inputCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : '');
              })()}
              </div>
              </div>
          <div style="cursor:pointer" data-k="machine" data-op-id="${op.id}" title="Кликните для редактирования">
            <div style="font-size:${isMobile ? '14px' : '12px'};color:var(--muted);font-weight:700;text-transform:uppercase;margin-bottom:${isMobile ? '6px' : '4px'}">🛠️ Машина</div>
            <div style="font-size:${isMobile ? '16px' : '14px'};font-weight:600;color:var(--text);min-height:${isMobile ? '32px' : '20px'};padding:${isMobile ? '8px 10px' : '8px 10px'};background:${isMobile ? 'rgba(52,152,219,.2)' : 'rgba(52,152,219,.1)'};border-radius:4px;border:1px solid ${isMobile ? 'rgba(52,152,219,.4)' : 'rgba(52,152,219,.3)'}">
              <span style="font-size:${isMobile ? '16px' : '14px'}">${esc(op.machine||"—")}</span>
            </div>
          </div>
          <div style="cursor:pointer" data-k="output_targets" data-op-id="${op.id}" title="Кликните для редактирования">
            <div style="font-size:${isMobile ? '14px' : '12px'};color:var(--muted);font-weight:700;text-transform:uppercase;margin-bottom:${isMobile ? '6px' : '4px'}">➡️ Куда</div>
            <div style="font-size:${isMobile ? '16px' : '14px'};font-weight:600;color:var(--text);min-height:${isMobile ? '32px' : '20px'};padding:${isMobile ? '8px 10px' : '8px 10px'};background:${isMobile ? '#fff' : 'rgba(255,255,255,.5)'};border-radius:4px;border:1px solid ${isMobile ? 'rgba(156,39,176,.4)' : 'rgba(156,39,176,.2)'}">
              ${(() => {
                const formatSources = (sources, isInput) => {
                  if (!sources) return '<span style="color:var(--muted)">—</span>';
                  let parsed = [];
                  try {
                    parsed = typeof sources === 'string' ? JSON.parse(sources) : sources;
                  } catch(e) {
                    parsed = [sources];
                  }
                  if (!Array.isArray(parsed)) parsed = [parsed];
                  if (parsed.length === 0) return '<span style="color:var(--muted)">—</span>';
                  
                  const labels = {
                    'warehouse': '🏭 Склад',
                    'warehouse_rest': '💤 Отдых',
                  };
                  
                  const display = parsed.map(s => {
                    const label = labels[s] || `⚙️ ${esc(String(s))}`;
                    return `<div style="line-height:1.4">${label}</div>`;
                  }).join('');
                  
                  return `<div style="font-size:${isMobile ? '16px' : '14px'}" title="${parsed.join(', ')}">${display}</div>`;
                };
                const outputTargets = op.output_targets || null;
                const outputCritical = op.output_critical || 0;
                return formatSources(outputTargets, false) + (outputCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : '');
              })()}
              </div>
            </div>
          </div>
            </div>

      <!-- Машина - под заданием (скрыт, так как теперь в блоке направлений) -->
      <div style="flex-shrink:0;margin-bottom:${isMobile ? '8px' : '12px'};display:none">
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:${isMobile ? '9px' : '12px'};color:var(--text-secondary);font-weight:700;text-transform:uppercase">🛠️ Машина</label>
          <select data-k="machine" style="font-size:${isMobile ? '12px' : '14px'};padding:${isMobile ? '6px 8px' : '8px 10px'};min-height:${isMobile ? '36px' : '42px'}">
            <option value="">—</option>
            ${(state.machines || []).map(m => {
              const machineName = typeof m === 'string' ? m : (m?.name || String(m));
              const machineValue = typeof m === 'string' ? m : (m?.name || String(m));
              return `<option value="${esc(machineValue)}" ${op.machine === machineValue ? 'selected' : ''}>${esc(machineName)}</option>`;
            }).join('')}
          </select>
          </div>
        </div>

      <!-- План, Факт, Брак, Приладочные - названия в первой строке, поля под ними -->
      <div style="flex-shrink:0;margin-bottom:${isMobile ? '8px' : '12px'};padding:${isMobile ? '8px' : '12px'};background:${isMobile ? 'rgba(0,207,181,.15)' : 'rgba(0,207,181,.08)'};border-radius:8px">
        <!-- Первая строка: названия -->
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:6px;margin-bottom:${isMobile ? '4px' : '6px'}">
          <div style="text-align:center">
            <span style="font-size:${isMobile ? '14px' : '14px'};color:var(--muted);font-weight:700">📋 План</span>
                </div>
          <div style="text-align:center">
            <span style="font-size:${isMobile ? '14px' : '14px'};color:var(--muted);font-weight:700">✅ Факт</span>
                  </div>
          <div style="text-align:center">
            <span style="font-size:${isMobile ? '14px' : '14px'};color:var(--muted);font-weight:700">❌ Брак</span>
              </div>
          <div style="text-align:center">
            <span style="font-size:${isMobile ? '14px' : '14px'};color:var(--muted);font-weight:700">🔧 Прилад.</span>
            </div>
          </div>
        <!-- Вторая строка: поля ввода -->
        <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:6px">
          <input data-k="plan" type="number" min="0" step="1" value="${op.plan||0}" placeholder="0" style="font-weight:700;font-size:${isMobile ? '18px' : '16px'};padding:${isMobile ? '12px 8px' : '10px 12px'};min-height:${isMobile ? '48px' : '44px'};width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:4px;text-align:center">
          <input data-k="fact" type="number" min="0" step="1" value="${(op.fact && op.fact > 0) ? op.fact : ''}" placeholder="—" data-original-value="${op.fact||0}" style="font-weight:700;font-size:${isMobile ? '18px' : '16px'};background:${isMobile ? 'rgba(46,204,113,.15)' : 'rgba(46,204,113,.08)'};border-color:${isMobile ? 'rgba(46,204,113,.4)' : 'rgba(46,204,113,.2)'};padding:${isMobile ? '12px 8px' : '10px 12px'};min-height:${isMobile ? '48px' : '44px'};width:100%;box-sizing:border-box;border:1px solid;border-radius:4px;text-align:center">
          <input data-k="scrap" type="number" min="0" step="1" value="${(op.scrap && op.scrap > 0) ? op.scrap : ''}" placeholder="—" data-original-value="${op.scrap||0}" style="font-weight:700;font-size:${isMobile ? '18px' : '16px'};background:${isMobile ? 'rgba(255,77,77,.15)' : 'rgba(255,77,77,.08)'};border-color:${isMobile ? 'rgba(255,77,77,.4)' : 'rgba(255,77,77,.2)'};padding:${isMobile ? '12px 8px' : '10px 12px'};min-height:${isMobile ? '48px' : '44px'};width:100%;box-sizing:border-box;border:1px solid;border-radius:4px;text-align:center">
          <input data-k="auxiliary_units" type="number" min="0" step="1" value="${(op.auxiliary_units && op.auxiliary_units > 0) ? op.auxiliary_units : ''}" placeholder="—" data-original-value="${op.auxiliary_units||0}" style="font-weight:700;font-size:${isMobile ? '18px' : '16px'};background:${isMobile ? 'rgba(255,176,32,.15)' : 'rgba(255,176,32,.08)'};border-color:${isMobile ? 'rgba(255,176,32,.4)' : 'rgba(255,176,32,.2)'};padding:${isMobile ? '12px 8px' : '10px 12px'};min-height:${isMobile ? '48px' : '44px'};width:100%;box-sizing:border-box;border:1px solid;border-radius:4px;text-align:center">
                </div>
                </div>
      
      <!-- Кнопка Сохранить - ниже строчек плана/факта -->
      <div style="flex-shrink:0;margin-bottom:${isMobile ? '8px' : '12px'}">
        <button class="btn accent" data-a="save-progress" title="Сохранить прогресс" style="font-weight:700;padding:${isMobile ? '14px 20px' : '12px 20px'};font-size:${isMobile ? '16px' : '15px'};min-height:${isMobile ? '52px' : 'auto'};width:100%">
          💾 Сохранить прогресс
        </button>
                </div>

      <!-- Аналитика - компактно внизу -->
      <div class="task-analytics" style="flex:1;overflow:visible;min-height:0;max-height:none">
        <!-- Дата и время (редактируемые) - компактно -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:${isMobile ? '6px' : '10px'}">
          <div style="background:${isMobile ? 'rgba(0,207,181,.15)' : 'rgba(0,207,181,.08)'};padding:${isMobile ? '8px 10px' : '8px 10px'};border-radius:8px;border:1px solid ${isMobile ? 'rgba(0,207,181,.3)' : 'rgba(0,207,181,.1)'}">
            <div style="font-size:${isMobile ? '13px' : '12px'};color:${isMobile ? 'var(--text)' : 'var(--muted)'};font-weight:700;text-transform:uppercase;margin-bottom:${isMobile ? '4px' : '2px'}">📅 Дата</div>
            <input data-k="date" type="date" value="${op.date||""}" placeholder="Дата" style="width:100%;box-sizing:border-box;font-weight:700;font-size:${isMobile ? '16px' : '14px'};padding:${isMobile ? '8px 4px' : '6px 8px'};min-height:${isMobile ? '40px' : '34px'};border:none;background:transparent">
                  </div>
          <div style="background:${isMobile ? 'rgba(0,207,181,.15)' : 'rgba(0,207,181,.08)'};padding:${isMobile ? '8px 10px' : '8px 10px'};border-radius:8px;border:1px solid ${isMobile ? 'rgba(0,207,181,.3)' : 'rgba(0,207,181,.1)'}">
            <div style="font-size:${isMobile ? '13px' : '12px'};color:${isMobile ? 'var(--text)' : 'var(--muted)'};font-weight:700;text-transform:uppercase;margin-bottom:${isMobile ? '4px' : '2px'}">🕐 Время</div>
            <input data-k="time" type="text" value="${esc(op.time||"")}" placeholder="08:00-10:00" style="width:100%;box-sizing:border-box;font-weight:700;font-size:${isMobile ? '16px' : '14px'};padding:${isMobile ? '8px 4px' : '6px 8px'};min-height:${isMobile ? '40px' : '34px'};border:none;background:transparent">
              </div>
            </div>

      <!-- Основная информация - компактно -->
      <div style="margin-bottom:${isMobile ? '6px' : '10px'}">
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(100px, 1fr));gap:6px;margin-bottom:${isMobile ? '6px' : '10px'}">
          <div style="background:${isMobile ? 'rgba(255,176,32,.2)' : 'rgba(255,176,32,.08)'};padding:${isMobile ? '10px' : '10px'};border-radius:8px;border:1px solid ${isMobile ? 'rgba(255,176,32,.4)' : 'rgba(255,176,32,.2)'}">
            <div style="font-size:${isMobile ? '13px' : '12px'};color:${isMobile ? 'var(--text)' : 'var(--muted)'};font-weight:700;text-transform:uppercase;margin-bottom:${isMobile ? '4px' : '2px'}">🛠️ Машина</div>
            <div style="font-size:${isMobile ? '16px' : '15px'};font-weight:700;color:var(--text)">${esc(op.machine||"—")}</div>
          </div>
          <div style="background:${isMobile ? 'rgba(52,152,219,.2)' : 'rgba(52,152,219,.08)'};padding:${isMobile ? '10px' : '10px'};border-radius:8px;border:1px solid ${isMobile ? 'rgba(52,152,219,.4)' : 'rgba(52,152,219,.2)'}">
            <div style="font-size:${isMobile ? '13px' : '12px'};color:${isMobile ? 'var(--text)' : 'var(--muted)'};font-weight:700;text-transform:uppercase;margin-bottom:${isMobile ? '4px' : '2px'}">👤 Оператор</div>
            <div style="font-size:${isMobile ? '16px' : '15px'};font-weight:700;color:var(--text)">${esc(op.operator||"—")}</div>
                </div>
                ${op.setup_started_at ? `
          <div style="background:${isMobile ? 'rgba(46,204,113,.2)' : 'rgba(46,204,113,.08)'};padding:${isMobile ? '10px' : '10px'};border-radius:8px;border:1px solid ${isMobile ? 'rgba(46,204,113,.4)' : 'rgba(46,204,113,.2)'}">
            <div style="font-size:${isMobile ? '13px' : '12px'};color:${isMobile ? 'var(--text)' : 'var(--muted)'};font-weight:700;text-transform:uppercase;margin-bottom:${isMobile ? '4px' : '2px'}">🟢 Начало</div>
            <div style="font-size:${isMobile ? '15px' : '14px'};font-weight:700;color:var(--text)">${op.setup_started_at ? (() => {
              const utcTime = op.setup_started_at.replace(" ", "T") + "Z";
              return new Date(utcTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            })() : "—"}</div>
                  </div>
                ` : ''}
                ${op.operation_completed_at ? `
          <div style="background:${isMobile ? 'rgba(142,68,173,.2)' : 'rgba(142,68,173,.08)'};padding:${isMobile ? '10px' : '10px'};border-radius:8px;border:1px solid ${isMobile ? 'rgba(142,68,173,.4)' : 'rgba(142,68,173,.2)'}">
            <div style="font-size:${isMobile ? '13px' : '12px'};color:${isMobile ? 'var(--text)' : 'var(--muted)'};font-weight:700;text-transform:uppercase;margin-bottom:${isMobile ? '4px' : '2px'}">✅ Окончание</div>
            <div style="font-size:${isMobile ? '15px' : '14px'};font-weight:700;color:var(--text)">${(() => {
              const utcTime = op.operation_completed_at.replace(" ", "T") + "Z";
              return new Date(utcTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            })()}</div>
                  </div>
                ` : ''}
      </div>

        <!-- Таймеры наладки и работы - компактно -->
        ${(isSetupInProgress && timerChipHTML) ? `<div style="margin-bottom:6px">${timerChipHTML}</div>` : ''}
        ${timerChipHTML && !isSetupInProgress ? `<div style="margin-bottom:6px">${timerChipHTML}</div>` : ''}
      </div>

      <!-- Информация о крое (если привязан) -->
      ${op.cutting_layout_id && op.layout_svg ? `
      <div style="margin-top:${isMobile ? '8px' : '12px'};padding:${isMobile ? '12px' : '12px'};background:${isMobile ? 'rgba(0,207,181,.18)' : 'rgba(0,207,181,.08)'};border:1px solid ${isMobile ? 'rgba(0,207,181,.4)' : 'rgba(0,207,181,.2)'};border-radius:8px">
        <div style="font-size:${isMobile ? '14px' : '13px'};color:${isMobile ? 'var(--text)' : 'var(--muted)'};font-weight:700;margin-bottom:${isMobile ? '6px' : '4px'};text-transform:uppercase">✂️ Раскрой материала</div>
        <div style="display:flex;gap:8px;align-items:center">
          <div style="flex-shrink:0;border:1px solid var(--border);border-radius:4px;padding:4px;background:#fff">
            <div style="width:80px;height:60px;overflow:hidden;border-radius:2px;background:#f8f9fa;display:flex;align-items:center;justify-content:center">
              ${op.layout_svg ? `<div style="transform:scale(0.2);transform-origin:top left;pointer-events:none">${op.layout_svg}</div>` : '✂️'}
          </div>
          </div>
          <div style="flex:1;font-size:${isMobile ? '16px' : '14px'};line-height:1.4">
            ${op.material_name ? `<div><b>Материал:</b> ${esc(op.material_name)}</div>` : ''}
            ${op.sheet_width_mm && op.sheet_length_mm ? `<div><b>Лист:</b> ${op.sheet_width_mm}×${op.sheet_length_mm}мм</div>` : ''}
            ${op.pieces_count ? `<div><b>Заготовок:</b> ${op.pieces_count} | <b>Отходы:</b> ${op.waste_percent || 0}%</div>` : ''}
          </div>
          </div>
        </div>
      ` : ''}

      <!-- Миниатюра файла (загружается асинхронно) -->
      <div class="op-file-thumb-container" data-op-id="${esc(op.id)}" style="display:none;margin-top:${isMobile ? '8px' : '12px'};padding:${isMobile ? '12px' : '12px'};background:${isMobile ? 'rgba(52,152,219,.18)' : 'rgba(52,152,219,.08)'};border:1px solid ${isMobile ? 'rgba(52,152,219,.4)' : 'rgba(52,152,219,.2)'};border-radius:8px">
        <div style="font-size:${isMobile ? '14px' : '13px'};color:${isMobile ? 'var(--text)' : 'var(--muted)'};font-weight:700;margin-bottom:${isMobile ? '6px' : '4px'};text-transform:uppercase">📎 Файлы операции</div>
        <div class="op-file-thumb-content" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"></div>
      </div>

      <!-- Действия - внизу карточки (материалы, файлы, штрихкод в одной строке) -->
      <div style="border-top:2px solid var(--border);padding-top:8px;margin-top:auto">
        <div style="display:flex;gap:${isMobile ? '8px' : '6px'};flex-wrap:wrap">
          <button class="btn ghost" data-a="materials" title="Материалы" style="font-weight:700;padding:${isMobile ? '14px 16px' : '12px 16px'};font-size:${isMobile ? '16px' : '14px'};min-height:${isMobile ? '52px' : 'auto'};flex:1;min-width:100px">
            📦 Материалы
          </button>
          <button class="btn ghost" data-a="files" title="Файлы" style="font-weight:700;padding:${isMobile ? '14px 16px' : '12px 16px'};font-size:${isMobile ? '16px' : '14px'};min-height:${isMobile ? '52px' : 'auto'};flex:1;min-width:100px">
            📎 Файлы
          </button>
          <button class="btn ghost" data-a="print-code" title="Штрихкод" style="font-weight:700;padding:${isMobile ? '14px 16px' : '12px 16px'};font-size:${isMobile ? '16px' : '14px'};min-height:${isMobile ? '52px' : 'auto'};flex:1;min-width:100px">
            🧾 Штрихкод
          </button>
          <button class="btn ghost ${op.cutting_layout_id ? 'accent' : ''}" data-a="cutting" title="${op.cutting_layout_id ? 'Изменить крой' : 'Выбрать крой'}" style="font-weight:700;padding:${isMobile ? '14px 16px' : '12px 16px'};font-size:${isMobile ? '16px' : '14px'};min-height:${isMobile ? '52px' : 'auto'};flex:1;min-width:100px">
            ✂️ ${op.cutting_layout_id ? 'Крой ✓' : 'Крой'}
            </button>
          ${(() => {
            const userRole = window.currentUser?.role || state.currentUser?.role;
            if(userRole !== 'operator') {
              return `<button class="btn ghost" data-a="port-item" title="Портировать изделие" style="font-weight:700;padding:${isMobile ? '14px 16px' : '12px 16px'};font-size:${isMobile ? '16px' : '14px'};min-height:${isMobile ? '52px' : 'auto'};flex:1;min-width:100px">
            🔄 Портировать
          </button>`;
            }
            return '';
          })()}
        </div>
      </div>
    `;
    const saveOp = async ()=>{
      // Убеждаемся, что все поля направлений включены в сохранение
      const updateData = {
        ...op,
        // Явно включаем поля направлений, если они есть
        input_sources: op.input_sources || null,
        output_targets: op.output_targets || null,
        input_critical: op.input_critical || 0,
        output_critical: op.output_critical || 0
      };
      
      const updated = await updateOp(op, updateData, "PUT");
      if(updated){
        Object.assign(op, updated);
        // Обновляем операцию в state.ops
        const stateOp = state.ops?.find(o => o.id === op.id);
        if(stateOp){
          Object.assign(stateOp, updated);
        }
      }
      await refreshAll(false);
      
      // Уведомляем конструктор об изменении связей
      if(window.DesignerModule && typeof window.DesignerModule.refreshConnections === 'function') {
        const currentPane = document.querySelector('.pane[style*="display"][style*="block"]')?.id;
        if(currentPane === 'designer') {
          window.DesignerModule.refreshConnections();
        }
      }
      
      // Для мобильной версии: возвращаемся к той же карточке
      const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
      if(isMobile){
        localStorage.setItem('scrollToOpId', op.id);
      }
      renderMy();
    };
    
    // Обработчики для мобильных кнопок статусов
    el.querySelectorAll('.task-status-btn').forEach(btn => {
      btn.onclick = async () => {
        const newStatus = btn.dataset.status;
        const oldStatus = op.status;
        
        // Обновляем визуальное состояние кнопок
        el.querySelectorAll('.task-status-btn').forEach(b => {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        
        // Обновляем статус операции
        op.status = newStatus;
        
        // Обновляем select (для синхронизации с десктопом)
        const statusSelect = el.querySelector('[data-k="status"]');
        if(statusSelect) statusSelect.value = newStatus;
        
        // Логика уведомлений (та же что в select)
        if(newStatus === "Наладка" && oldStatus !== "Наладка"){
          if(oldStatus === "В работе"){
            toast("🔧 Возврат к наладке. Отсчёт времени наладки продолжается ⏱️");
          } else if(oldStatus === "Стоп"){
            toast("🔧 Возобновлена наладка. Отсчёт времени продолжается ⏱️");
          } else {
            toast("🔧 Началась наладка. Время начала зафиксировано ⏱️");
          }
        }
        
        if(newStatus === "В работе" && oldStatus === "Наладка"){
          toast("⚙️ Наладка завершена! Начато/продолжено производство ⏱️");
        } else if(newStatus === "В работе" && oldStatus === "Стоп"){
          toast("⚙️ Возобновлено производство. Отсчёт времени продолжается ⏱️");
        } else if(newStatus === "В работе" && oldStatus !== "Наладка" && oldStatus !== "В работе" && oldStatus !== "Стоп"){
          toast("⚙️ Начато производство ⏱️");
        }
        
        if(newStatus === "Стоп" && oldStatus !== "Стоп"){
          toast("⏸️ Операция приостановлена");
        }
        
        if(newStatus === "Выполнено" && oldStatus !== "Выполнено"){
          const fact = +op.fact || 0;
          const plan = +op.plan || 0;
          
          if(fact < plan || plan === 0){
            toast(`⚠️ Тираж должен быть выполнен на 100% (факт: ${fact}, план: ${plan}) перед закрытием операции`, 3000);
            // Возвращаем предыдущий статус
            el.querySelectorAll('.task-status-btn').forEach(b => {
              b.classList.remove('active');
              if(b.dataset.status === oldStatus) b.classList.add('active');
            });
            if(statusSelect) statusSelect.value = oldStatus;
            op.status = oldStatus;
            return;
          }
          toast("✅ Операция закрыта! Тираж выполнен на 100%. Время зафиксировано.");
        }
        
        if(oldStatus === "Выполнено" && newStatus !== "Выполнено"){
          toast("⚠️ Операция открыта для редактирования");
        }
        
        // Сохраняем изменения
        await saveOp();
        
        // Для мобильной версии: возвращаемся к той же карточке
        const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
        if(isMobile){
          localStorage.setItem('scrollToOpId', op.id);
        }
        
        // Перерисовываем карточку для обновления таймеров
        renderMy();
      };
    });
    
    // Функция обновления таймеров в реальном времени
    const updateStatusTimers = () => {
      const timerEl = el.querySelector('.status-timer');
      if(!timerEl) return;
      
      // Проверяем текущий статус операции - если Стоп, не обновляем таймер
      const currentStatus = op.status;
      if(currentStatus === "Стоп" && timerEl.dataset.timerType !== 'stop'){
        return; // Не обновляем таймер если операция на паузе
      }
      
      const timerType = timerEl.dataset.timerType;
      const opId = timerEl.dataset.opId;
      const startedAt = timerEl.dataset.startedAt;
      const planned = Number(timerEl.dataset.planned) || 0;
      const previous = Number(timerEl.dataset.previous) || 0;
      
      if(!startedAt || !planned) return;
      
      // Parse UTC time from server (format: "YYYY-MM-DD HH:MM:SS")
      const utcTime = startedAt.replace(" ", "T") + "Z";
      const startTime = new Date(utcTime).getTime();
      const now = Date.now();
      let elapsed = 0;
      let remaining = 0;
      let isOverdue = false;
      
      if(timerType === 'setup'){
        // Для наладки учитываем только если статус "Наладка"
        if(currentStatus === "Наладка"){
          elapsed = previous + Math.floor((now - startTime) / 1000);
        } else {
          // Если не в статусе наладки, используем сохраненное время
          elapsed = previous;
        }
        remaining = planned - elapsed;
        isOverdue = remaining < 0;
      } else if(timerType === 'work'){
        // Для работы учитываем только если статус "В работе"
        if(currentStatus === "В работе"){
          elapsed = previous + Math.floor((now - startTime) / 1000);
        } else {
          // Если не в статусе работы, используем сохраненное время
          elapsed = previous;
        }
        remaining = planned - elapsed;
        isOverdue = remaining < 0;
      }
      
      const displayTime = isOverdue ? `-${formatDuration(Math.abs(remaining))}` : formatDuration(remaining);
      const displayEl = timerEl.querySelector('.status-timer-display');
      if(displayEl){
        displayEl.textContent = displayTime;
      }
      
      // Обновляем цвет таймера и кнопки
      if(isOverdue){
        timerEl.classList.add('status-timer-overdue');
        timerEl.style.background = 'rgba(255,77,77,.15)';
        timerEl.style.borderColor = 'var(--bad)';
        if(displayEl) displayEl.style.color = 'var(--bad)';
        
        // Меняем цвет кнопки статуса на красный
        const statusBtn = el.querySelector(`.task-status-btn.active`);
        if(statusBtn){
          statusBtn.style.background = 'rgba(255,77,77,.2)';
          statusBtn.style.borderColor = 'var(--bad)';
          statusBtn.classList.add('status-timer-overdue');
        }
      } else {
        timerEl.classList.remove('status-timer-overdue');
        if(timerType === 'setup'){
          timerEl.style.background = 'rgba(255,176,32,.1)';
          timerEl.style.borderColor = 'rgba(255,176,32,.4)';
          if(displayEl) displayEl.style.color = 'var(--warn)';
        } else if(timerType === 'work'){
          timerEl.style.background = 'rgba(0,207,181,.1)';
          timerEl.style.borderColor = 'rgba(0,207,181,.4)';
          if(displayEl) displayEl.style.color = 'var(--accent)';
        }
        
        // Возвращаем обычный цвет кнопки
        const statusBtn = el.querySelector(`.task-status-btn.active`);
        if(statusBtn){
          statusBtn.classList.remove('status-timer-overdue');
          // Убираем инлайн стили только если нет класса overdue
          if(!statusBtn.classList.contains('status-timer-overdue')){
            statusBtn.style.background = '';
            statusBtn.style.borderColor = '';
          }
        }
      }
    };
    
    // Запускаем обновление таймеров каждую секунду
    if(el.querySelector('.status-timer')){
      const timerInterval = setInterval(() => {
        if(!document.body.contains(el)){
          clearInterval(timerInterval);
          return;
        }
        updateStatusTimers();
      }, 1000);
    }
    
    el.querySelectorAll("select,input").forEach(ctrl=>{
      ctrl.onchange = async ()=>{
        const k=ctrl.dataset.k;
        if(k==="status") {
          const oldStatus = op.status;
          const newStatus = ctrl.value;
          op.status = newStatus;
          
          // Обновляем кнопки статусов при изменении
          el.querySelectorAll('.task-status-btn').forEach(b => {
            b.classList.remove('active');
            if(b.dataset.status === newStatus) {
              b.classList.add('active');
            }
          });
          
          // Фиксация времени начала наладки (делается на сервере)
          if(newStatus === "Наладка" && oldStatus !== "Наладка"){
            if(oldStatus === "В работе"){
              toast("🔧 Возврат к наладке. Отсчёт времени наладки продолжается ⏱️");
            } else if(oldStatus === "Стоп"){
              toast("🔧 Возобновлена наладка. Отсчёт времени продолжается ⏱️");
            } else {
              toast("🔧 Началась наладка. Время начала зафиксировано ⏱️");
            }
          }
          
          if(newStatus === "В работе" && oldStatus === "Наладка"){
            toast("⚙️ Наладка завершена! Начато/продолжено производство ⏱️");
          } else if(newStatus === "В работе" && oldStatus === "Стоп"){
            toast("⚙️ Возобновлено производство. Отсчёт времени продолжается ⏱️");
          } else if(newStatus === "В работе" && oldStatus !== "Наладка" && oldStatus !== "В работе" && oldStatus !== "Стоп"){
            toast("⚙️ Начато производство ⏱️");
          }
          
          if(newStatus === "Стоп" && oldStatus !== "Стоп"){
            toast("⏸️ Операция приостановлена");
          }
          
          if(newStatus === "Выполнено" && oldStatus !== "Выполнено"){
            // Проверяем, что операция может быть закрыта (fact >= plan, 100% выполнен тираж)
            const fact = +op.fact || 0;
            const plan = +op.plan || 0;
            
            if(fact < plan || plan === 0){
              toast(`⚠️ Тираж должен быть выполнен на 100% (факт: ${fact}, план: ${plan}) перед закрытием операции`, 3000);
              ctrl.value = oldStatus; // Отменяем изменение статуса
              op.status = oldStatus;
              return;
            }
            toast("✅ Операция закрыта! Тираж выполнен на 100%. Время зафиксировано.");
          }
          
          // Если возвращаем из "Выполнено" в другой статус
          if(oldStatus === "Выполнено" && newStatus !== "Выполнено"){
            toast("⚠️ Операция открыта для редактирования");
          }
        }
        if(k==="machine") op.machine=ctrl.value;
        if(k==="date") op.date=ctrl.value;
        if(k==="time") {
          op.time=ctrl.value;
          // Синхронизация с мобильными полями
          const parts = ctrl.value.split(/[-–—]/);
          if(parts.length >= 2){
            const startInput = el.querySelector('[data-k="time_start"]');
            const endInput = el.querySelector('[data-k="time_end"]');
            if(startInput) startInput.value = parts[0].trim();
            if(endInput) endInput.value = parts[1].trim();
          }
        }
        if(k==="time_start" || k==="time_end") {
          // Обновляем поле time на основе time_start и time_end
          const startInput = el.querySelector('[data-k="time_start"]');
          const endInput = el.querySelector('[data-k="time_end"]');
          const start = startInput?.value || "";
          const end = endInput?.value || "";
          if(start && end){
            op.time = `${start}–${end}`;
            const timeInput = el.querySelector('[data-k="time"]');
            if(timeInput) timeInput.value = op.time;
          }else if(start){
            op.time = start;
            const timeInput = el.querySelector('[data-k="time"]');
            if(timeInput) timeInput.value = op.time;
          }
        }
        if(k==="fact") op.fact = ctrl.value === '' || ctrl.value === '—' ? 0 : (+ctrl.value || 0);
        if(k==="scrap") op.scrap = ctrl.value === '' || ctrl.value === '—' ? 0 : (+ctrl.value || 0);
        if(k==="auxiliary_units") op.auxiliary_units = ctrl.value === '' || ctrl.value === '—' ? 0 : (+ctrl.value || 0);
        await saveOp();
        toast("Сохранено");
        
        // Для мобильной версии: обновляем страницу и возвращаемся к той же карточке
        const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
        if(isMobile){
          // Сохраняем ID операции для возврата
          localStorage.setItem('scrollToOpId', op.id);
          // Обновляем данные и перерисовываем
          await refreshAll(false);
          renderMy();
          // Прокручиваем к нужной карточке
          setTimeout(() => {
            const targetEl = document.querySelector(`[data-op-id="${op.id}"]`);
            if(targetEl){
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Подсвечиваем карточку
              targetEl.style.boxShadow = '0 0 0 3px rgba(0,207,181,.5)';
              setTimeout(() => {
                targetEl.style.boxShadow = '';
              }, 2000);
            }
            localStorage.removeItem('scrollToOpId');
          }, 100);
        }
      };
    });
    
    // Обработчики для полей ввода (факт, брак, приладка) - убираем прочерк при фокусе
    ['fact', 'scrap', 'auxiliary_units'].forEach(field => {
      const input = el.querySelector(`[data-k="${field}"]`);
      if(input){
        // При фокусе - если значение пустое или прочерк, очищаем поле
        input.onfocus = (e) => {
          const val = e.target.value;
          if(!val || val === '—' || val === '0'){
            e.target.value = '';
          }
        };
        // При потере фокуса - если пустое, ставим прочерк в placeholder
        input.onblur = (e) => {
          const val = e.target.value;
          if(!val || val === ''){
            e.target.value = '';
            e.target.placeholder = '—';
          } else {
            e.target.placeholder = '—';
          }
        };
      }
    });
    
    // Печать штрихкода (включает файлы кроя если есть)
    const codeBtn = el.querySelector('[data-a="print-code"]');
    if(codeBtn){
      codeBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if(typeof window.printOpQr === 'function'){
            await window.printOpQr(op);
          } else if(typeof printOpQr === 'function'){
            await printOpQr(op);
          } else {
            toast("Функция печати штрихкода недоступна");
          }
        } catch(err) {
          console.error("Ошибка печати штрихкода:", err);
          toast("Ошибка: " + (err.message || err));
        }
      };
    }
    const filesBtn = el.querySelector('[data-a="files"]');
    if(filesBtn){
      filesBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if(typeof window.openOpFilesModal === 'function'){
            await window.openOpFilesModal(op);
          } else if(typeof openOpFilesModal === 'function'){
            await openOpFilesModal(op);
          } else {
            toast("Функция работы с файлами недоступна");
          }
        } catch(err) {
          console.error("Ошибка открытия файлов:", err);
          toast("Ошибка: " + (err.message || err));
        }
      };
    }
    const matsBtn = el.querySelector('[data-a="materials"]');
    if(matsBtn){
      matsBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if(typeof window.openOpMaterialsModal === 'function'){
            await window.openOpMaterialsModal(op);
          } else if(typeof openOpMaterialsModal === 'function'){
            await openOpMaterialsModal(op);
          } else {
            toast("Функция работы с материалами недоступна");
          }
        } catch(err) {
          console.error("Ошибка открытия материалов:", err);
          toast("Ошибка: " + (err.message || err));
        }
      };
    }
    const cuttingBtn = el.querySelector('[data-a="cutting"]');
    if(cuttingBtn){
      cuttingBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          // Если крой уже привязан - показываем полный просмотр
          if(op.cutting_layout_id && op.layout_svg) {
            if(typeof window.showFullCuttingLayout === 'function') {
              window.showFullCuttingLayout(op);
            } else {
              toast("Функция просмотра кроя недоступна");
            }
          } else {
            // Иначе открываем выбор кроя
            if(typeof window.openOpCuttingModal === 'function'){
              window.openOpCuttingModal(op);
            } else if(typeof openOpCuttingModal === 'function'){
              openOpCuttingModal(op);
            } else {
              toast("Функция выбора кроя недоступна");
            }
          }
        } catch(err) {
          console.error("Ошибка открытия кроя:", err);
          toast("Ошибка: " + (err.message || err));
        }
      };
    }
    
    // Кнопка портирования изделия (только для админов)
    const portItemBtn = el.querySelector('[data-a="port-item"]');
    if(portItemBtn){
      const userRole = window.currentUser?.role || state.currentUser?.role;
      if(userRole !== 'operator'){
        portItemBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            await openPortItemModal(op);
          } catch(err) {
            console.error("Ошибка портирования изделия:", err);
            toast("Ошибка: " + (err.message || err));
          }
        };
      } else {
        // Скрываем кнопку для операторов
        portItemBtn.style.display = 'none';
      }
    }
    
    // Кнопка сохранения промежуточного прогресса
    const saveProgressBtn = el.querySelector('[data-a="save-progress"]');
    if(saveProgressBtn){
      saveProgressBtn.onclick = async ()=>{
      const factInput = el.querySelector('[data-k="fact"]');
      const scrapInput = el.querySelector('[data-k="scrap"]');
      const auxiliaryInput = el.querySelector('[data-k="auxiliary_units"]');
      
      const currentFact = factInput.value === '' || factInput.value === '—' ? 0 : (+factInput.value || 0);
      const currentScrap = scrapInput.value === '' || scrapInput.value === '—' ? 0 : (+scrapInput.value || 0);
      const currentAuxiliary = auxiliaryInput.value === '' || auxiliaryInput.value === '—' ? 0 : (+auxiliaryInput.value || 0);
      const plan = +op.plan || 0;
      
      if(currentFact <= 0){
        alert("Укажите количество выполненного материала (факт)");
        return;
      }
      
      // Обновляем значения в объекте операции
      op.fact = currentFact;
      op.scrap = currentScrap;
      op.auxiliary_units = currentAuxiliary;
      
      // Сохраняем операцию
      await saveOp();
      
      // Проверяем, достигнут ли 100%
      if(currentFact >= plan && plan > 0){
        // 100% выполнено - закрываем операцию
        try {
          // Устанавливаем статус "Выполнено" и закрываем операцию через PATCH
          await updateOp(op, {
              status: "Выполнено",
              fact: currentFact,
              scrap: currentScrap,
              auxiliary_units: currentAuxiliary
          });
          
          // Обновляем данные
          await refreshAll(false);
          toast(`✅ Операция выполнена на 100%! Тираж: ${currentFact} ед.${currentScrap > 0 ? ` Брак: ${currentScrap} ед.` : ''}`, 3000);
        } catch(e) {
          console.error("Ошибка при закрытии операции:", e);
          alert("Ошибка при закрытии операции: " + e.message);
        }
      } else {
        // Меньше 100% - информируем и переводим в паузу
        const completion = Math.round((currentFact / plan) * 100);
        toast(`⚠️ Операция выполнена на ${completion}%. Для завершения необходимо выполнить 100% тиража. Операция переведена в паузу.`, 5000);
        
        // Переводим в паузу
        try {
          await updateOp(op, {
              status: "Стоп",
              fact: currentFact,
              scrap: currentScrap,
              auxiliary_units: currentAuxiliary
          });
          await refreshAll(false);
        } catch(e) {
          console.error("Ошибка при переводе в паузу:", e);
        }
      }
    };
    }
    
    // Кнопка сброса статистики наладки
    const resetSetupStatsBtn = el.querySelector('[data-a="reset-setup-stats"]');
    if(resetSetupStatsBtn){
      resetSetupStatsBtn.onclick = async ()=>{
        if(!confirm("Вы уверены, что хотите сбросить статистику наладки этой операции?\n\nБудут сброшены:\n- Время наладки (setup_duration)\n- Дата начала наладки (setup_started_at)\n- Дата завершения наладки (setup_completed_at)")){
          return;
        }
        
        // Сбрасываем статистику наладки через API
        try {
          await api("/api/ops/"+encodeURIComponent(op.id)+"/reset-setup-stats", { 
            method:"POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version: op.version ?? 0 })
          });
          await refreshAll();
          toast("🔧 Статистика наладки сброшена");
          
          // Для мобильной версии: возвращаемся к той же карточке
          const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
          if(isMobile){
            localStorage.setItem('scrollToOpId', op.id);
            renderMy();
          }
        } catch(e) {
          console.error("Ошибка при сбросе статистики наладки:", e);
          alert("Ошибка при сбросе статистики наладки: " + e.message);
        }
      };
    }
    
    // Кнопка сброса статистики работы
    const resetWorkStatsBtn = el.querySelector('[data-a="reset-work-stats"]');
    if(resetWorkStatsBtn){
      resetWorkStatsBtn.onclick = async ()=>{
        if(!confirm("Вы уверены, что хотите сбросить статистику работы этой операции?\n\nБудут сброшены:\n- Время выполнения (total_duration)\n- Дата начала работы (started_at)\n- Дата завершения работы (completed_at)")){
          return;
        }
        
        // Сбрасываем статистику работы через API
        try {
          await api("/api/ops/"+encodeURIComponent(op.id)+"/reset-work-stats", { 
            method:"POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version: op.version ?? 0 })
          });
          await refreshAll();
          toast("⚙️ Статистика работы сброшена");
          
          // Для мобильной версии: возвращаемся к той же карточке
          const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
          if(isMobile){
            localStorage.setItem('scrollToOpId', op.id);
            renderMy();
          }
        } catch(e) {
          console.error("Ошибка при сбросе статистики работы:", e);
          alert("Ошибка при сбросе статистики работы: " + e.message);
        }
      };
    }
    
    // Редактирование направлений (Откуда/Куда) и машины
    const inputSourcesEl = el.querySelector('[data-k="input_sources"]');
    const outputTargetsEl = el.querySelector('[data-k="output_targets"]');
    const machineEl = el.querySelector('[data-k="machine"][data-op-id]');
    
    // Обработчик для редактирования машины в блоке направлений
    if(machineEl && machineEl.dataset.opId === op.id){
      machineEl.onclick = () => {
        // Открываем модальное окно для выбора машины
        const modal = document.createElement("div");
        modal.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px;";
        
        const card = document.createElement("div");
        card.style.cssText = "background:#fff;border-radius:12px;padding:20px;max-width:400px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.2);";
        card.innerHTML = `
          <h3 style="margin:0 0 16px 0;font-size:16px">Выберите машину</h3>
          <select id="machineSelectModal" style="width:100%;padding:10px;font-size:14px;border:2px solid var(--border);border-radius:6px;margin-bottom:16px">
            <option value="">—</option>
            ${(state.machines || []).map(m => {
              const machineName = typeof m === 'string' ? m : (m?.name || String(m));
              const machineValue = typeof m === 'string' ? m : (m?.name || String(m));
              return `<option value="${esc(machineValue)}" ${op.machine === machineValue ? 'selected' : ''}>${esc(machineName)}</option>`;
            }).join('')}
          </select>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn ghost" data-a="cancel-machine" style="padding:8px 16px">Отмена</button>
            <button class="btn accent" data-a="save-machine" style="padding:8px 16px">Сохранить</button>
          </div>
        `;
        
        modal.appendChild(card);
        document.body.appendChild(modal);
        
        const selectEl = card.querySelector('#machineSelectModal');
        selectEl.focus();
        
        const closeModal = () => {
          document.body.removeChild(modal);
        };
        
        card.querySelector('[data-a="cancel-machine"]').onclick = closeModal;
        card.querySelector('[data-a="save-machine"]').onclick = async () => {
          const newMachine = selectEl.value;
          if(newMachine !== op.machine){
            op.machine = newMachine;
            await saveOp();
            toast("Машина обновлена");
            
            const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
            if(isMobile){
              localStorage.setItem('scrollToOpId', op.id);
              await refreshAll(false);
              renderMy();
            } else {
              await refreshAll(false);
              renderMy();
            }
          }
          closeModal();
        };
        
        modal.onclick = (e) => {
          if(e.target === modal) closeModal();
        };
      };
    }
    
    const openOpSourceTargetModal = (op, isInput) => {
      const currentSources = op.input_sources || "";
      const currentTargets = op.output_targets || "";
      const currentInputCritical = op.input_critical || 0;
      const currentOutputCritical = op.output_critical || 0;
      
      let currentValues = [];
      try {
        const raw = isInput ? currentSources : currentTargets;
        currentValues = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
      } catch(e) { 
        currentValues = []; 
      }
      if (!Array.isArray(currentValues) || currentValues.length === 0) {
        currentValues = ['warehouse'];
      }
      const currentCritical = isInput ? currentInputCritical : currentOutputCritical;
      
      const modal = document.createElement("div");
      modal.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px;";
      
      // Разделяем склады и машины для лучшей группировки
      const warehouseOptions = [
        { value: 'warehouse', label: '🏭 Склад заготовительный', type: 'warehouse' },
        { value: 'warehouse_rest', label: '💤 Склад отдыха (буфер)', type: 'warehouse' }
      ];
      const machineOptions = (state.machines || []).map(m => {
        const name = typeof m === 'string' ? m : m.name;
        return { value: name, label: `⚙️ ${name}`, type: 'machine' };
      });
      const allOptions = [...warehouseOptions, ...machineOptions];
      
      modal.innerHTML = `
        <div class="card" style="width:100%;max-width:500px;padding:5px;box-shadow:0 10px 40px rgba(0,0,0,0.3)">
          <h3 style="margin:0 0 5px 0;font-size:18px;font-weight:700;color:var(--text)">
            ${isInput ? '⬅ ВХОД (откуда приходит)' : '➡ ВЫХОД (куда уходит)'}
          </h3>
          <div class="hint" style="margin-bottom:5px;font-size:12px;padding:5px;background:rgba(0,207,181,.1);border-radius:6px;border:1px solid rgba(0,207,181,.2)">
            Выберите варианты для операции. Можно выбрать несколько.
          </div>
          
          <!-- Поиск -->
          <div style="margin-bottom:5px">
            <input type="text" id="srcTargetSearch" placeholder="🔍 Поиск..." 
                   style="width:100%;padding:5px;font-size:14px;border:2px solid var(--border);border-radius:6px;outline:none;transition:border-color 0.2s"
                   onfocus="this.style.borderColor='var(--accent)'"
                   onblur="this.style.borderColor='var(--border)'">
          </div>
          
          <!-- Кнопки управления выбором -->
          <div style="display:flex;gap:5px;margin-bottom:5px">
            <button class="btn ghost" id="selectAllBtn" style="padding:5px;font-size:12px;flex:1">✓ Выбрать все</button>
            <button class="btn ghost" id="deselectAllBtn" style="padding:5px;font-size:12px;flex:1">✗ Снять выбор</button>
          </div>
          
          <!-- Счетчик выбранных -->
          <div id="selectedCount" style="margin-bottom:5px;font-size:12px;color:var(--muted);font-weight:600">
            Выбрано: <span id="selectedCountNum">0</span>
          </div>
          
          <!-- Список вариантов с группировкой -->
          <div style="max-height:350px;overflow-y:auto;border:2px solid var(--border);border-radius:8px;padding:5px;margin-bottom:5px;background:var(--bg)">
            <!-- Склады -->
            <div style="margin-bottom:5px">
              <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:5px;padding:5px;background:rgba(76,175,80,.1);border-radius:4px">
                📦 Склады
              </div>
              ${warehouseOptions.map(opt => `
                <label class="srcTargetOption" data-type="warehouse" style="display:flex;align-items:center;gap:5px;padding:5px;cursor:pointer;border-radius:6px;font-size:14px;transition:all 0.2s;margin-bottom:2px;background:rgba(255,255,255,.5);border:1px solid transparent" 
                       onmouseover="this.style.background='rgba(0,207,181,.15)';this.style.borderColor='rgba(0,207,181,.3)'" 
                       onmouseout="this.style.background='rgba(255,255,255,.5)';this.style.borderColor='transparent'">
                  <input type="checkbox" class="srcTargetCheck" value="${esc(opt.value)}" ${currentValues.includes(opt.value) ? 'checked' : ''} 
                         style="width:18px;height:18px;margin:0;cursor:pointer;accent-color:var(--accent)">
                  <span style="flex:1;font-weight:500">${opt.label}</span>
                </label>
              `).join('')}
            </div>
            
            <!-- Машины -->
            <div>
              <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:5px;padding:5px;background:rgba(33,150,243,.1);border-radius:4px">
                ⚙️ Оборудование (${machineOptions.length})
              </div>
              ${machineOptions.map(opt => `
                <label class="srcTargetOption" data-type="machine" style="display:flex;align-items:center;gap:5px;padding:5px;cursor:pointer;border-radius:6px;font-size:14px;transition:all 0.2s;margin-bottom:2px;background:rgba(255,255,255,.5);border:1px solid transparent" 
                       onmouseover="this.style.background='rgba(0,207,181,.15)';this.style.borderColor='rgba(0,207,181,.3)'" 
                       onmouseout="this.style.background='rgba(255,255,255,.5)';this.style.borderColor='transparent'">
                  <input type="checkbox" class="srcTargetCheck" value="${esc(opt.value)}" ${currentValues.includes(opt.value) ? 'checked' : ''} 
                         style="width:18px;height:18px;margin:0;cursor:pointer;accent-color:var(--accent)">
                  <span class="optionLabel" style="flex:1;font-weight:500">${opt.label}</span>
                </label>
              `).join('')}
            </div>
          </div>
          
          <!-- Критичная точка -->
          <label style="display:flex;align-items:center;gap:5px;padding:5px;cursor:pointer;background:rgba(255,77,77,.08);border:2px solid rgba(255,77,77,.2);border-radius:6px;margin-bottom:5px;font-size:14px;transition:all 0.2s"
                 onmouseover="this.style.background='rgba(255,77,77,.12)';this.style.borderColor='rgba(255,77,77,.3)'"
                 onmouseout="this.style.background='rgba(255,77,77,.08)';this.style.borderColor='rgba(255,77,77,.2)'">
            <input type="checkbox" id="criticalCheck" ${currentCritical ? 'checked' : ''} 
                   style="width:18px;height:18px;margin:0;cursor:pointer;accent-color:#ff4d4d">
            <span style="color:#ff4d4d;font-weight:600">⚠ Критичная точка</span>
          </label>
          
          <!-- Кнопки действий -->
          <div class="row" style="gap:5px;justify-content:flex-end">
            <button class="btn ghost" data-a="cancel" style="padding:5px 10px;font-size:14px;font-weight:600">Отмена</button>
            <button class="btn accent" data-a="save" style="padding:5px 10px;font-size:14px;font-weight:600">💾 Сохранить</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      // Функция сортировки: выбранные элементы вверх
      const sortSelectedToTop = () => {
        // Сортировка для складов - находим контейнер через первый элемент
        const firstWarehouse = modal.querySelector('.srcTargetOption[data-type="warehouse"]');
        if(firstWarehouse && firstWarehouse.parentElement) {
          const warehouseContainer = firstWarehouse.parentElement;
          const warehouseOptions = Array.from(warehouseContainer.querySelectorAll('.srcTargetOption[data-type="warehouse"]'));
          warehouseOptions.sort((a, b) => {
            const aChecked = a.querySelector('.srcTargetCheck')?.checked || false;
            const bChecked = b.querySelector('.srcTargetCheck')?.checked || false;
            return bChecked - aChecked; // Выбранные (true=1) идут первыми
          });
          warehouseOptions.forEach(opt => warehouseContainer.appendChild(opt));
        }
        
        // Сортировка для машин - находим контейнер через первый элемент
        const firstMachine = modal.querySelector('.srcTargetOption[data-type="machine"]');
        if(firstMachine && firstMachine.parentElement) {
          const machineContainer = firstMachine.parentElement;
          const machineOptions = Array.from(machineContainer.querySelectorAll('.srcTargetOption[data-type="machine"]'));
          machineOptions.sort((a, b) => {
            const aChecked = a.querySelector('.srcTargetCheck')?.checked || false;
            const bChecked = b.querySelector('.srcTargetCheck')?.checked || false;
            return bChecked - aChecked; // Выбранные (true=1) идут первыми
          });
          machineOptions.forEach(opt => machineContainer.appendChild(opt));
        }
      };
      
      // Функция обновления счетчика выбранных
      const updateSelectedCount = () => {
        const checks = modal.querySelectorAll('.srcTargetCheck:checked');
        const count = checks.length;
        const countEl = modal.querySelector('#selectedCountNum');
        if(countEl) {
          countEl.textContent = count;
          countEl.style.color = count > 0 ? 'var(--accent)' : 'var(--muted)';
        }
        // Сортируем выбранные элементы вверх
        sortSelectedToTop();
      };
      
      // Функция фильтрации по поиску
      const searchInput = modal.querySelector('#srcTargetSearch');
      if(searchInput) {
        searchInput.oninput = (e) => {
          const searchTerm = e.target.value.toLowerCase().trim();
          const options = modal.querySelectorAll('.srcTargetOption');
          options.forEach(opt => {
            const label = opt.querySelector('.optionLabel')?.textContent || opt.textContent || '';
            const matches = !searchTerm || label.toLowerCase().includes(searchTerm);
            opt.style.display = matches ? 'flex' : 'none';
          });
        };
        // Фокус на поле поиска при открытии
        setTimeout(() => searchInput.focus(), 100);
      }
      
      // Кнопки "Выбрать все" / "Снять выбор"
      const selectAllBtn = modal.querySelector('#selectAllBtn');
      const deselectAllBtn = modal.querySelector('#deselectAllBtn');
      if(selectAllBtn) {
        selectAllBtn.onclick = () => {
          const visibleOptions = Array.from(modal.querySelectorAll('.srcTargetOption')).filter(opt => {
            return opt.style.display !== 'none' && window.getComputedStyle(opt).display !== 'none';
          });
          visibleOptions.forEach(opt => {
            const checkbox = opt.querySelector('.srcTargetCheck');
            if(checkbox) checkbox.checked = true;
          });
          updateSelectedCount();
          sortSelectedToTop();
        };
      }
      if(deselectAllBtn) {
        deselectAllBtn.onclick = () => {
          const checkboxes = modal.querySelectorAll('.srcTargetCheck');
          checkboxes.forEach(cb => cb.checked = false);
          updateSelectedCount();
          sortSelectedToTop();
        };
      }
      
      // Обновление счетчика при изменении чекбоксов
      modal.querySelectorAll('.srcTargetCheck').forEach(cb => {
        cb.addEventListener('change', () => {
          updateSelectedCount();
          sortSelectedToTop();
        });
      });
      
      // Инициализация счетчика и сортировка при открытии
      updateSelectedCount();
      sortSelectedToTop();
      
      // Закрытие по Escape
      const handleEscape = (e) => {
        if(e.key === 'Escape') {
          modal.remove();
          document.removeEventListener('keydown', handleEscape);
        }
      };
      document.addEventListener('keydown', handleEscape);
      
      modal.querySelector('[data-a="cancel"]').onclick = ()=> { 
        document.removeEventListener('keydown', handleEscape);
        modal.remove(); 
      };
      modal.querySelector('[data-a="save"]').onclick = async ()=>{
        const checks = modal.querySelectorAll('.srcTargetCheck:checked');
        const newValues = Array.from(checks).map(c => c.value);
        const newCritical = modal.querySelector('#criticalCheck').checked;
        document.removeEventListener('keydown', handleEscape);
        modal.remove();
        
        if(newValues.length === 0) {
          toast("Выберите хотя бы один вариант", 3000);
          return;
        }
        
        // Обновляем операцию
        if(isInput){
          op.input_sources = JSON.stringify(newValues);
          op.input_critical = newCritical ? 1 : 0;
        } else {
          op.output_targets = JSON.stringify(newValues);
          op.output_critical = newCritical ? 1 : 0;
        }
        
        // Сохраняем на сервер
        try {
          // Формируем объект обновления с учетом того, что мы обновляем только одно направление
          const updateData = {};
          if(isInput){
            updateData.input_sources = op.input_sources;
            updateData.input_critical = op.input_critical;
          } else {
            updateData.output_targets = op.output_targets;
            updateData.output_critical = op.output_critical;
          }
          
          const updated = await updateOp(op, updateData, "PATCH");
          
          // Обновляем операцию в state.ops
          if(updated){
            const stateOp = state.ops?.find(o => o.id === op.id);
            if(stateOp){
              Object.assign(stateOp, updated);
              // Также обновляем локальный объект op
              Object.assign(op, updated);
            }
          }
          
          // Перерисовываем карточку и обновляем все данные
          await refreshAll(false);
          
          // Уведомляем конструктор об изменении связей
          if(window.DesignerModule && typeof window.DesignerModule.refreshConnections === 'function') {
            const currentPane = document.querySelector('.pane[style*="display"][style*="block"]')?.id;
            if(currentPane === 'designer') {
              window.DesignerModule.refreshConnections();
            }
          }
          
          const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
          if(isMobile){
            localStorage.setItem('scrollToOpId', op.id);
          }
          renderMy();
          
          toast(isInput ? "✅ Варианты входа сохранены" : "✅ Варианты выхода сохранены");
        } catch(e) {
          console.error("Ошибка сохранения направлений:", e);
          toast("❌ Ошибка: " + (e.message || "Не удалось сохранить направления"), 3000);
        }
      };
      
      // Закрытие при клике вне модального окна
      modal.onclick = (e)=> { 
        if(e.target === modal) { 
          document.removeEventListener('keydown', handleEscape);
          modal.remove(); 
        } 
      };
    };
    
    if(inputSourcesEl){
      inputSourcesEl.onclick = () => openOpSourceTargetModal(op, true);
    }
    if(outputTargetsEl){
      outputTargetsEl.onclick = () => openOpSourceTargetModal(op, false);
    }
    
    // Редактирование названия операции
    const nameEl = el.querySelector('.op-name-editable');
    if(nameEl){
      nameEl.onclick = async ()=>{
        if(nameEl.classList.contains("editing")) return;
        
        const originalValue = op.name || "";
        nameEl.classList.add("editing");
        nameEl.style.background = "rgba(0,207,181,.15)";
        
        const input = document.createElement("input");
        input.type = "text";
        input.value = originalValue;
        input.style.cssText = "font-size:16px;font-weight:600;padding:6px 10px;border:2px solid var(--accent);border-radius:6px;width:100%;background:#fff;color:var(--blue);outline:none";
        nameEl.textContent = "";
        nameEl.appendChild(input);
        input.focus();
        input.select();
        
        const save = async ()=>{
          const newValue = input.value.trim();
          nameEl.classList.remove("editing");
          nameEl.style.background = "";
          
          if(newValue !== originalValue){
            op.name = newValue;
            await saveOp();
            toast("Название операции обновлено");
            
            // Для мобильной версии: возвращаемся к той же карточке
            const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
            if(isMobile){
              localStorage.setItem('scrollToOpId', op.id);
              await refreshAll(false);
              renderMy();
            }
          } else {
            nameEl.textContent = originalValue || "";
          }
        };
        
        const cancel = ()=>{
          nameEl.classList.remove("editing");
          nameEl.style.background = "";
          nameEl.textContent = originalValue || "";
        };
        
        input.onblur = save;
        input.onkeydown = (e)=>{
          if(e.key === "Enter"){
            e.preventDefault();
            save();
          } else if(e.key === "Escape"){
            e.preventDefault();
            cancel();
          }
        };
      };
      
      // Добавляем hover эффект
      nameEl.onmouseenter = ()=>{
        if(!nameEl.classList.contains("editing")){
          nameEl.style.background = "rgba(0,207,181,.1)";
        }
      };
      nameEl.onmouseleave = ()=>{
        if(!nameEl.classList.contains("editing")){
          nameEl.style.background = "";
        }
      };
    }
    
    // Добавляем задачу в контейнер статуса
    statusContainer.appendChild(el);
    }
    
    // Добавляем контейнер статуса в список
    list.appendChild(statusContainer);
  }
  
  // Прокручиваем к нужной карточке после рендеринга (для мобильной версии)
  const scrollToOpId = localStorage.getItem('scrollToOpId');
  if(scrollToOpId){
    setTimeout(() => {
      const targetEl = document.querySelector(`[data-op-id="${scrollToOpId}"]`);
      if(targetEl){
        // Находим родительскую карточку
        const taskCard = targetEl.closest('.task');
        if(taskCard){
          taskCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Подсвечиваем карточку
          taskCard.style.boxShadow = '0 0 0 3px rgba(0,207,181,.5)';
          taskCard.style.transition = 'box-shadow 0.3s ease';
          setTimeout(() => {
            taskCard.style.boxShadow = '';
          }, 2000);
        }
      }
      localStorage.removeItem('scrollToOpId');
    }, 100);
    
    // Восстанавливаем ширину столбцов ПОСЛЕ рендеринга
    // Используем reinitResizableTables для правильного восстановления
    setTimeout(async () => {
      if (typeof reinitResizableTables === 'function') {
        console.log("🔄 Восстановление ширин после renderMy...");
        await reinitResizableTables(document.querySelector('#my.pane') || document);
      }
    }, 200);
    
    // Загружаем миниатюры файлов для операций
    loadMyOpFileThumbnails();
  }
  }
  
  // Загрузка миниатюр файлов для операций в "Мои задачи"
  async function loadMyOpFileThumbnails(){
    const owner = window.currentUser;
    const containers = document.querySelectorAll('.op-file-thumb-container[data-op-id]');
    for (const container of containers) {
      const opId = container.dataset.opId;
      if (!opId || !container.isConnected || owner !== window.currentUser) continue;
      try {
        const data = await api("/api/ops/" + encodeURIComponent(opId) + "/files");
        const files = data.files || [];
        if (!files.length) continue;
        const filesToShow = await Promise.all(files.slice(0, 4).map(async file => ({ ...file,
          url: window.PagesClient?.enabled && file.url?.startsWith('/uploads/') ? await window.PagesClient.privateUrl(file.url) : file.url
        })));
        if (owner !== window.currentUser || !container.isConnected) return;
        const contentDiv = container.querySelector('.op-file-thumb-content');
        if (!contentDiv) continue;
        container.style.display = 'block';
        const isImage = name => window.PagesClient?.enabled ? /\.(png|jpe?g|gif|webp|bmp)$/i.test(name || '') : /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(name || '');
        contentDiv.innerHTML = filesToShow.map(file => {
          const image = isImage(file.filename), pdf = /\.pdf$/i.test(file.filename || '');
          const preview = image ? `<img src="${esc(file.url)}" alt="${esc(file.filename)}" style="width:80px;height:60px;object-fit:contain;border-radius:2px">`
            : `<div style="width:80px;height:60px;display:flex;align-items:center;justify-content:center;font-size:24px;background:#f8f9fa;border-radius:2px">${pdf ? '📄' : '📎'}</div>`;
          return `<a href="${esc(file.url)}" target="_blank" rel="noopener" ${image || pdf ? '' : `download="${esc(file.filename)}"`} style="flex-shrink:0;border:1px solid var(--border);border-radius:4px;padding:4px;background:#fff;cursor:pointer">${preview}<div style="font-size:9px;text-align:center;color:var(--muted);margin-top:2px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(file.filename)}</div></a>`;
        }).join('');
        if (files.length > 4) {
          const more = document.createElement('button'); more.className = 'btn ghost'; more.textContent = '+' + (files.length - 4) + ' ещё';
          more.onclick = () => { const op = state.ops?.find(row => row.id === opId); if (op) window.openOpFilesModal?.(op); };
          contentDiv.appendChild(more);
        }
      } catch (error) { if (owner === window.currentUser) console.warn("Не удалось загрузить файлы для операции", opId, error); }
    }
  }
  
  function machineOps(){
    const m=$("m_m").value, dt=$("m_date").value||todayISO(), only=$("m_only").value==="yes";
    const sortBy = $("m_sort") ? $("m_sort").value : "date";
    
    let ops = state.ops.filter(op=>op.machine===m && (!only || (op.date||"")===dt));
    
    // Применяем сортировку
    ops.sort((a,b)=>{
      if(sortBy === "status"){
        const statusOrder = {
          "Запланировано": 1,
          "Наладка": 2,
          "В работе": 3,
          "Выполнено": 4,
          "Стоп": 5
        };
        const statusA = statusOrder[a.status] || 99;
        const statusB = statusOrder[b.status] || 99;
        if(statusA !== statusB) return statusA - statusB;
        // Если статусы одинаковые, сортируем по дате, затем по заказу
        const dateComp = (a.date||"").localeCompare(b.date||"");
        if(dateComp !== 0) return dateComp;
        return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
      } else if(sortBy === "order"){
        const orderComp = a.order_id.localeCompare(b.order_id);
        if(orderComp !== 0) return orderComp;
        return (+a.no||0)-(+b.no||0);
      } else {
        // По умолчанию: по дате
        const dateComp = (a.date||"").localeCompare(b.date||"");
        if(dateComp !== 0) return dateComp;
        return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
      }
    });
    
    return ops;
  }

  // Expose functions globally
  // Добавляем восстановление ширины столбцов после рендеринга
  const originalRenderMy = renderMy;
  window.renderMy = async function() {
    originalRenderMy();
    
    // Восстанавливаем ширину столбцов ПОСЛЕ рендеринга
    setTimeout(async () => {
      // Находим все таблицы в разделе "Мои задачи" и восстанавливаем ширину
      const myPane = document.querySelector('#my.pane');
      if (myPane && typeof restoreColumnWidths === 'function') {
        const tables = myPane.querySelectorAll('table');
        for (const table of tables) {
          if (table.querySelector('thead')) {
            await restoreColumnWidths(table);
          }
        }
      }
    }, 100);
  };
  
  window.myOps = myOps;
  window.machineOps = machineOps;
  
  // Функция открытия модального окна портирования изделия
  async function openPortItemModal(op) {
    try {
      // Загружаем все изделия
      const allItems = await api("/api/order-items");
      if(!allItems || !Array.isArray(allItems)) {
        toast("Не удалось загрузить список изделий", 3000);
        return;
      }
      
      // Получаем информацию о текущем изделии
      const currentItem = op.order_item_id ? allItems.find(item => item.id === op.order_item_id) : null;
      const currentOrder = state.orders?.find(o => o.id === op.order_id);
      
      // Группируем изделия по заказам
      const itemsByOrder = {};
      for(const item of allItems) {
        if(!itemsByOrder[item.order_id]) {
          itemsByOrder[item.order_id] = [];
        }
        itemsByOrder[item.order_id].push(item);
      }
      
      const modal = document.createElement("div");
      modal.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px;";
      
      modal.innerHTML = `
        <div class="card" style="width:100%;max-width:500px;max-height:80vh;overflow-y:auto;padding:16px">
          <h3 style="margin-bottom:12px;font-size:16px;font-weight:700">🔄 Портировать изделие</h3>
          <div class="hint" style="margin-bottom:12px;font-size:11px;padding:8px;background:rgba(0,207,181,.08);border-radius:4px">
            <div><b>Текущая операция:</b> ${esc(op.name || "Без названия")}</div>
            <div><b>Текущий заказ:</b> ${esc(op.order_id || "—")}</div>
            ${currentItem ? `<div><b>Текущее изделие:</b> ${esc(currentItem.type || "")} ${esc(currentItem.title || "")}</div>` : '<div><b>Текущее изделие:</b> Не привязано</div>'}
          </div>
          <div style="margin-bottom:12px">
            <label style="display:block;font-size:11px;font-weight:700;margin-bottom:6px;color:var(--muted);text-transform:uppercase">Выберите новое изделие:</label>
            <div style="max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;padding:4px">
              <label style="display:flex;align-items:center;gap:6px;padding:6px;cursor:pointer;border-radius:3px;font-size:12px;transition:background 0.1s" 
                     onmouseover="this.style.background='rgba(0,207,181,.1)'" 
                     onmouseout="this.style.background='transparent'">
                <input type="radio" name="portItem" value="" ${!op.order_item_id ? 'checked' : ''} style="width:16px;height:16px;margin:0">
                <span><b>—</b> Не привязывать к изделию</span>
              </label>
              ${Object.entries(itemsByOrder).map(([orderId, items]) => {
                const order = state.orders?.find(o => o.id === orderId);
                return `
                  <div style="margin-top:8px;padding:4px;background:rgba(0,207,181,.05);border-radius:3px">
                    <div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:4px;text-transform:uppercase">📦 ${esc(orderId)}${order ? ` · ${esc(order.client || "")}` : ""}</div>
                    ${items.map(item => `
                      <label style="display:flex;align-items:center;gap:6px;padding:4px 6px;cursor:pointer;border-radius:3px;font-size:12px;transition:background 0.1s;margin-left:12px" 
                             onmouseover="this.style.background='rgba(0,207,181,.1)'" 
                             onmouseout="this.style.background='transparent'">
                        <input type="radio" name="portItem" value="${esc(item.id)}" ${op.order_item_id === item.id ? 'checked' : ''} style="width:16px;height:16px;margin:0">
                        <span>${esc(item.type || "")} ${esc(item.title || "")} <span style="color:var(--muted);font-size:10px">(${item.qty_plan || 0} шт.)</span></span>
                      </label>
                    `).join('')}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
          <div class="row" style="gap:6px;justify-content:flex-end;margin-top:12px">
            <button class="btn ghost" data-a="cancel" style="padding:8px 16px;font-size:12px">Отмена</button>
            <button class="btn accent" data-a="save" style="padding:8px 16px;font-size:12px">Сохранить</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      modal.querySelector('[data-a="cancel"]').onclick = () => { modal.remove(); };
      modal.querySelector('[data-a="save"]').onclick = async () => {
        const selectedRadio = modal.querySelector('input[name="portItem"]:checked');
        if(!selectedRadio) {
          toast("Выберите изделие", 3000);
          return;
        }
        
        const newOrderItemId = selectedRadio.value || null;
        modal.remove();
        
        try {
          // Обновляем order_item_id через API
          const updated = await api(`/api/ops/${encodeURIComponent(op.id)}/order-item`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_item_id: newOrderItemId })
          });
          
          // Обновляем операцию в state
          if(updated) {
            const stateOp = state.ops?.find(o => o.id === op.id);
            if(stateOp) {
              Object.assign(stateOp, updated);
              Object.assign(op, updated);
            }
          }
          
          // Обновляем данные и перерисовываем
          await refreshAll(false);
          const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
          if(isMobile){
            localStorage.setItem('scrollToOpId', op.id);
          }
          renderMy();
          
          const itemName = newOrderItemId ? (() => {
            const item = allItems.find(i => i.id === newOrderItemId);
            return item ? `${item.type} ${item.title}` : "изделие";
          })() : "не привязано";
          toast(`✅ Изделие успешно портировано: ${itemName}`, 3000);
        } catch(e) {
          console.error("Ошибка портирования изделия:", e);
          toast("❌ Ошибка: " + (e.message || "Не удалось портировать изделие"), 3000);
        }
      };
    } catch(e) {
      console.error("Ошибка открытия модального окна портирования:", e);
      toast("Ошибка: " + (e.message || "Не удалось открыть модальное окно"), 3000);
    }
  }
  
  // Экспортируем функцию глобально
  window.openPortItemModal = openPortItemModal;
  
  // Module export
  window.MyModule = {
    loaded: true,
    myOps,
    machineOps,
    renderMy: window.renderMy
  };
  
  console.log('My Tasks module loaded successfully');
  
  // Auto-render if on my pane
  if(document.querySelector('#my.pane')?.style.display !== 'none') {
    window.renderMy();
  }
  
})();

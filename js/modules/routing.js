/**
 * B'BOX Production - Routing Module
 * Модуль маршрутизации операций
 */

(function() {
  'use strict';
  
  if (window.RoutingModule && window.RoutingModule.loaded) {
    console.log('Routing module already loaded');
    if(typeof window.renderOps === 'function') window.renderOps();
    return;
  }
  
  console.log('Loading Routing module...');

  // Helper: Update operation
  async function updateOp(op, changes) {
    return window.OperationUpdates.update(op, changes);
  }
  window.updateOp = updateOp;

function makeEditable(td, op, field, type="text"){
  if(td.classList.contains("editing")) return;
  
  const originalValue = op[field];
  const displayValue = originalValue || (type==="number" ? 0 : "");
  
  td.classList.add("editing");
  
  if(type==="select-operator"){
    const sel = document.createElement("select");
    state.operators.forEach(op=>{
      const name = typeof op === 'string' ? op : op.name;
      const opt=document.createElement("option");
      opt.value=name; opt.textContent=name;
      if(name===originalValue) opt.selected=true;
      sel.appendChild(opt);
    });
    td.textContent="";
    td.appendChild(sel);
    sel.focus();
    
    const save = async ()=>{
      // Проверяем, что элемент все еще в DOM
      if (!td.parentNode) return;
      
      const newVal = sel.value;
      
      if(newVal !== originalValue){
        // Получаем актуальную версию операции перед обновлением
        const freshOp = state.ops?.find(o => o.id === op.id) || op;
        try {
          const updated = await updateOp(freshOp, { operator: newVal });
          
          // Обновляем содержимое только после успешного сохранения
          if (td.parentNode) {
            td.classList.remove("editing");
            td.textContent = newVal;
          }
          
          // Обновляем операцию в state.ops
          const stateOp = state.ops?.find(o => o.id === op.id);
          if (stateOp && updated) {
            Object.assign(stateOp, updated);
          }
          
          // Автоматически обновляем все данные и перерисовываем маршрут
          await refreshAll(false);
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          
          toast("✅ Оператор изменён");
        } catch (e) {
          console.error("Ошибка обновления оператора:", e);
          // Восстанавливаем исходное значение при ошибке
          if (td.parentNode) {
            td.classList.remove("editing");
            td.textContent = originalValue;
          }
          toast("❌ Ошибка: " + (e.message || "Не удалось обновить оператора"));
        }
      } else {
        // Значение не изменилось, просто закрываем редактирование
        if (td.parentNode) {
          td.classList.remove("editing");
          td.textContent = newVal;
        }
      }
    };
    sel.onchange = save;
    sel.onblur = save;
    
  } else if(type==="select-machine"){
    const sel = document.createElement("select");
    state.machines.forEach(m=>{
      const name = typeof m === 'string' ? m : m.name;
      const opt=document.createElement("option");
      opt.value=name; opt.textContent=name;
      if(name===originalValue) opt.selected=true;
      sel.appendChild(opt);
    });
    td.textContent="";
    td.appendChild(sel);
    sel.focus();
    
    const save = async ()=>{
      // Проверяем, что элемент все еще в DOM
      if (!td.parentNode) return;
      
      const newVal = sel.value;
      
      if(newVal !== originalValue){
        // Получаем актуальную версию операции перед обновлением
        const freshOp = state.ops?.find(o => o.id === op.id) || op;
        try {
          const updated = await updateOp(freshOp, { machine: newVal });
          
          // Обновляем содержимое только после успешного сохранения
          if (td.parentNode) {
            td.classList.remove("editing");
            td.textContent = newVal;
          }
          
          // Обновляем операцию в state.ops
          const stateOp = state.ops?.find(o => o.id === op.id);
          if (stateOp && updated) {
            Object.assign(stateOp, updated);
          }
          
          // Автоматически обновляем все данные и перерисовываем маршрут
          await refreshAll(false);
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          
          toast("✅ Машина изменена");
        } catch (e) {
          console.error("Ошибка обновления машины:", e);
          // Восстанавливаем исходное значение при ошибке
          if (td.parentNode) {
            td.classList.remove("editing");
            td.textContent = originalValue;
          }
          toast("❌ Ошибка: " + (e.message || "Не удалось обновить машину"));
        }
      } else {
        // Значение не изменилось, просто закрываем редактирование
        if (td.parentNode) {
          td.classList.remove("editing");
          td.textContent = newVal;
        }
      }
    };
    sel.onchange = save;
    sel.onblur = save;
    
  } else if(type==="select-source" || type==="select-target"){
    // Модальное окно для МУЛЬТИ-выбора источников/назначений
    const isSource = type === "select-source";
    // Парсим JSON массив или строку
    let currentValues = [];
    try {
      const raw = isSource ? op.input_sources : op.output_targets;
      currentValues = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    } catch(e) { 
      currentValues = []; 
    }
    if (!Array.isArray(currentValues) || currentValues.length === 0) {
      // Fallback на старые поля
      const oldVal = isSource ? op.input_source : op.output_target;
      currentValues = oldVal ? [oldVal] : ['warehouse'];
    }
    const currentCritical = isSource ? (op.input_critical || 0) : (op.output_critical || 0);
    
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
          ${isSource ? '⬅ ВХОД (откуда приходит)' : '➡ ВЫХОД (куда уходит)'}
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
        td.classList.remove("editing");
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    modal.querySelector('[data-a="cancel"]').onclick = ()=> { 
      document.removeEventListener('keydown', handleEscape);
      modal.remove(); 
      td.classList.remove("editing"); 
    };
    modal.querySelector('[data-a="save"]').onclick = async ()=>{
      const checks = modal.querySelectorAll('.srcTargetCheck:checked');
      const newValues = Array.from(checks).map(c => c.value);
      const newCritical = modal.querySelector('#criticalCheck').checked;
      document.removeEventListener('keydown', handleEscape);
      modal.remove();
      td.classList.remove("editing");
      
      if(newValues.length === 0) {
        toast("Выберите хотя бы один вариант", 3000);
        return;
      }
      
      // Обновляем операцию
      const freshOp = state.ops?.find(o => o.id === op.id) || op;
      const updates = isSource 
        ? { input_sources: JSON.stringify(newValues), input_critical: newCritical ? 1 : 0 }
        : { output_targets: JSON.stringify(newValues), output_critical: newCritical ? 1 : 0 };
      
      try {
        const updated = await updateOp(freshOp, updates);
        
        // Обновляем операцию в state.ops
        const stateOp = state.ops?.find(o => o.id === op.id);
        if (stateOp && updated) {
          Object.assign(stateOp, updated);
        }
        
        // Обновляем отображение ячейки в таблице
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
          
          return `<div style="font-size:11px" title="${parsed.join(', ')}">${display}</div>`;
        };
        
        // Обновляем ячейку в таблице
        if (td.parentNode) {
          const critical = newCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : '';
          td.innerHTML = formatSources(JSON.stringify(newValues), isSource) + critical;
          
          // Визуальное подтверждение - подсветка измененной ячейки
          td.style.transition = 'background-color 0.3s ease, box-shadow 0.3s ease';
          td.style.backgroundColor = 'rgba(0, 207, 181, 0.2)';
          td.style.boxShadow = '0 0 8px rgba(0, 207, 181, 0.4)';
          setTimeout(() => {
            td.style.backgroundColor = '';
            td.style.boxShadow = '';
          }, 1000);
        }
        
        // Перерисовываем маршрут для обновления всех операций
        await refreshAll(false);
        if (typeof window.renderOps === 'function') {
          await window.renderOps();
        } else if (typeof renderOps === 'function') {
          renderOps();
        }
        
        // Уведомляем конструктор об изменении связей
        if(window.DesignerModule && typeof window.DesignerModule.refreshConnections === 'function') {
          const currentPane = document.querySelector('.pane[style*="display"][style*="block"]')?.id;
          if(currentPane === 'designer') {
            window.DesignerModule.refreshConnections();
          }
        }
        
        toast(isSource ? "✅ Варианты входа сохранены" : "✅ Варианты выхода сохранены");
      } catch (e) {
        console.error("Ошибка сохранения направлений:", e);
        toast("❌ Ошибка: " + (e.message || "Не удалось сохранить направления"));
      }
    };
    
    // Закрытие при клике вне модального окна
    modal.onclick = (e)=> { 
      if(e.target === modal) { 
        document.removeEventListener('keydown', handleEscape);
        modal.remove(); 
        td.classList.remove("editing"); 
      }
    };
    
  } else if(type==="select-status"){
    const sel = document.createElement("select");
    const statuses = ["Запланировано","Наладка","В работе","Выполнено","Стоп"];
    statuses.forEach(st=>{
      const opt=document.createElement("option");
      opt.value=st; opt.textContent=st;
      if(st===originalValue) opt.selected=true;
      sel.appendChild(opt);
    });
    td.textContent="";
    td.appendChild(sel);
    sel.focus();
    
    const save = async ()=>{
      // Проверяем, что элемент все еще в DOM
      if (!td.parentNode) return;
      
      const newVal = sel.value;
      
      if(newVal !== originalValue){
        const freshOp = op;
        
        try {
          const updated = await updateOp(freshOp, { status: newVal });
          
          // Обновляем содержимое только после успешного сохранения
          if (td.parentNode) {
            td.classList.remove("editing");
            td.innerHTML = pillStatus(updated || freshOp);
          }
          
          // Обновляем операцию в state.ops с новыми данными
          const stateOp = state.ops?.find(o => o.id === op.id);
          if (stateOp && updated) {
            Object.assign(stateOp, updated);
          }
          
          // Автоматически обновляем все данные
          await refreshAll(false);
          
          // Перерисовываем маршрут, чтобы операции с статусом "Выполнено" переместились в таблицу выполненных
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          
          // Обновляем анализ времени и все счетчики
          if (typeof renderTimeAnalysis === 'function') {
            renderTimeAnalysis();
          }
          
          toast("✅ Статус изменён");
        } catch (e) {
          console.error("Ошибка обновления статуса:", e);
          // Восстанавливаем исходное значение при ошибке
          if (td.parentNode) {
            td.classList.remove("editing");
            td.innerHTML = pillStatus(op);
          }
          toast("❌ Ошибка: " + (e.message || "Не удалось обновить статус"));
        }
      } else {
        // Значение не изменилось, просто закрываем редактирование
        if (td.parentNode) {
          td.classList.remove("editing");
          td.innerHTML = pillStatus({...op, status:newVal});
        }
      }
    };
    sel.onchange = save;
    sel.onblur = save;
    
  } else {
    const inp = document.createElement("input");
    inp.type = type;
    inp.value = displayValue;
    if(type==="number"){ inp.min="0"; inp.step="1"; }
    if(type==="date") inp.style.fontSize="11px";
    if(field==="time"){ inp.placeholder="08:00–10:00"; inp.style.minWidth="100px"; }
    
    td.textContent="";
    td.appendChild(inp);
    inp.focus();
    inp.select();
    
    const save = async ()=>{
      // Проверяем, что элемент все еще в DOM
      if (!td.parentNode) return;
      
      let newVal = inp.value;
      if(type==="number") newVal = +newVal || 0;
      
      if(String(newVal) !== String(originalValue)){
        // Получаем актуальную версию операции перед обновлением
        const freshOp = state.ops?.find(o => o.id === op.id) || op;
        try {
          await updateOp(freshOp, { [field]: newVal });
          // Обновляем содержимое только после успешного сохранения
          if (td.parentNode) {
            td.classList.remove("editing");
            td.textContent = type === "date" ? formatDate(newVal) : newVal;
          }
          
          // Если изменен номер операции, сортируем таблицу по номеру
          if(field === "no" && td.parentNode && td.parentNode.parentNode) {
            const tbody = td.parentNode.parentNode;
            const rows = Array.from(tbody.querySelectorAll("tr"));
            // Сортируем строки по номеру операции (первая ячейка с data-field="no")
            rows.sort((a, b) => {
              const aNoCell = a.querySelector('[data-field="no"]');
              const bNoCell = b.querySelector('[data-field="no"]');
              const aNo = aNoCell ? parseInt(aNoCell.textContent || "0", 10) : 0;
              const bNo = bNoCell ? parseInt(bNoCell.textContent || "0", 10) : 0;
              return aNo - bNo;
            });
            // Переставляем строки в отсортированном порядке
            rows.forEach(row => tbody.appendChild(row));
            toast(`✅ Номер изменён, таблица отсортирована`);
          } else {
            await refreshAll(false);
            // Обновляем отображение операций
            if (typeof window.renderOps === 'function') {
              await window.renderOps();
            } else if (typeof renderOps === 'function') {
              renderOps();
            }
            toast(`${field} изменён`);
          }
        } catch (e) {
          console.error(`Ошибка обновления ${field}:`, e);
          // Восстанавливаем исходное значение при ошибке
          if (td.parentNode) {
            td.classList.remove("editing");
            td.textContent = type === "date" ? formatDate(originalValue) : displayValue;
          }
          toast(`❌ Ошибка: ${e.message || `Не удалось обновить ${field}`}`);
        }
      } else {
        // Значение не изменилось, просто закрываем редактирование
        if (td.parentNode) {
          td.classList.remove("editing");
          td.textContent = type === "date" ? formatDate(newVal) : newVal;
        }
      }
    };
    
    inp.onblur = save;
    inp.onkeydown = (e)=>{
      if(e.key==="Enter") {
        save();
      }
      if(e.key==="Escape"){ 
        // Проверяем, что элемент все еще в DOM
        if (!td.parentNode) return;
        td.classList.remove("editing"); 
        if (!td.parentNode) return;
        td.textContent = type === "date" ? formatDate(originalValue) : displayValue;
      }
    };
  }
}

// Анализ времени работы (сворачиваемый блок)
function renderTimeAnalysis(){
  const analysisEl = $("timeAnalysis");
  if(!analysisEl) return;
  
  const fDate = $("f_date").value;
  const fDateMode = $("f_date_mode") ? $("f_date_mode").value : "all";
  const selectedDate = (fDateMode === "selected" && fDate) ? fDate : null;
  
  // Фильтруем операции
  let opsForAnalysis = state.ops.slice();
  if(selectedDate){
    opsForAnalysis = opsForAnalysis.filter(op => op.date === selectedDate);
  }
  
  // Группируем по операторам
  const operatorStats = {};
  
  for(const op of opsForAnalysis){
    const operator = op.operator || "Без оператора";
    if(!operatorStats[operator]){
      operatorStats[operator] = {
        planned: 0,           // Запланированное время (наладка + работа)
        remainingTime: 0,     // Оставшееся время для операций "В работе" и "Стоп"
        actualTime: 0,        // Фактическое время работы (setup_duration + total_duration)
        operationsCount: 0    // Количество операций
      };
    }
    
    // Увеличиваем счетчик операций
    operatorStats[operator].operationsCount++;
    
    const plannedDuration = op.planned_duration || 0;
    const plannedSetupTime = op.planned_setup_time || 0;
    const totalPlanned = plannedDuration + plannedSetupTime;
    
    // Запланированное время - всегда суммируем для всех операций
    operatorStats[operator].planned += totalPlanned;
    
    // Фактическое время - используем вычисленные значения с сервера (current_setup_duration, current_work_duration)
    const actualSetupTime = op.current_setup_duration !== undefined ? op.current_setup_duration : (op.setup_duration || 0);
    const actualWorkTime = op.current_work_duration !== undefined ? op.current_work_duration : (op.total_duration || 0);
    operatorStats[operator].actualTime += actualSetupTime + actualWorkTime;
    
    // Оставшееся время для операций "В работе" и "Стоп" - используем данные с сервера
    if(op.status === "В работе" || op.status === "Стоп"){
      if(op.status === "В работе"){
        let remainingWorkTime = plannedDuration;
        if(op.current_work_duration !== undefined && op.current_work_duration > 0){
          remainingWorkTime = Math.max(0, plannedDuration - op.current_work_duration);
        }
        
        let remainingSetupTime = 0;
        if(op.current_setup_duration !== undefined && op.current_setup_duration > 0){
          remainingSetupTime = Math.max(0, plannedSetupTime - op.current_setup_duration);
        } else if(!op.setup_completed_at && plannedSetupTime > 0){
          remainingSetupTime = plannedSetupTime;
        }
        
        operatorStats[operator].remainingTime += remainingWorkTime + remainingSetupTime;
      } else if(op.status === "Стоп"){
        operatorStats[operator].remainingTime += totalPlanned;
      }
    } else if(op.status === "Наладка"){
      let remainingSetupTime = plannedSetupTime;
      if(op.current_setup_duration !== undefined && op.current_setup_duration > 0){
        remainingSetupTime = Math.max(0, plannedSetupTime - op.current_setup_duration);
      }
      operatorStats[operator].remainingTime += remainingSetupTime + plannedDuration;
    }
  }
  
  const dateText = selectedDate ? ` на ${formatDate(selectedDate)}` : " (все операции)";
  const operators = Object.keys(operatorStats).sort();
  const hasData = operators.length > 0;
  
  analysisEl.innerHTML = `
    <details class="card" style="margin:10px;border:1px solid var(--border);border-radius:10px;padding:12px;background:rgba(0,207,181,.03)">
      <summary style="display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;font-weight:800;font-size:14px">
        📊 Анализ времени работы${dateText}
        <span style="font-size:11px;color:var(--muted);font-weight:700">Нажмите, чтобы развернуть</span>
      </summary>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="font-size:12px;color:var(--muted);font-weight:700">Дата</label>
        <input type="date" id="time_analysis_date" value="${selectedDate || ""}" style="padding:6px 10px;font-weight:600" />
        <button class="btn ghost" id="refreshTimeAnalysis" title="Обновить">↻</button>
      </div>
      ${hasData ? `
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:12px">
          ${operators.map(operator => {
      const stats = operatorStats[operator];
            return `
              <div style="padding:12px;background:rgba(0,207,181,.05);border-radius:8px;border:1px solid rgba(0,207,181,.2)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">
                  <div style="display:flex;align-items:center;gap:8px">
              <div style="font-weight:800;font-size:13px;color:var(--blue)">👤 ${esc(operator)}</div>
              <div style="font-size:11px;color:var(--muted);padding:3px 8px;background:rgba(0,0,0,.05);border-radius:4px">${stats.operationsCount} ${stats.operationsCount === 1 ? 'операция' : stats.operationsCount < 5 ? 'операции' : 'операций'}</div>
            </div>
          </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:8px;font-size:11px">
            <div style="padding:8px;background:rgba(0,207,181,.1);border-radius:6px">
              <div style="color:var(--muted);margin-bottom:4px">📋 Запланировано</div>
              <div style="font-weight:800;font-size:14px;color:var(--accent)">${formatDuration(stats.planned)}</div>
                    <div style="font-size:10px;color:var(--muted);margin-top:2px">${selectedDate ? 'На выбранную дату' : 'Общее время'}</div>
            </div>
            <div style="padding:8px;background:rgba(255,176,32,.1);border-radius:6px">
              <div style="color:var(--muted);margin-bottom:4px">⏱️ До окончания</div>
              <div style="font-weight:800;font-size:14px;color:var(--warn)">${formatDuration(stats.remainingTime)}</div>
              <div style="font-size:10px;color:var(--muted);margin-top:2px">В работе + На паузе</div>
            </div>
            <div style="padding:8px;background:rgba(46,204,113,.1);border-radius:6px">
                    <div style="color:var(--muted);margin-bottom:4px">✅ Факт</div>
              <div style="font-weight:800;font-size:14px;color:#2ecc71">${formatDuration(stats.actualTime)}</div>
                    <div style="font-size:10px;color:var(--muted);margin-top:2px">Наладка + Работа</div>
            </div>
          </div>
        </div>
      `;
          }).join('')}
        </div>
      ` : `<div class="hint" style="margin:10px 0">Нет операций для анализа</div>`}
    </details>
  `;
  
  const refreshBtn = $("refreshTimeAnalysis");
  if(refreshBtn){
    refreshBtn.onclick = () => renderTimeAnalysis();
  }
  const dateInput = $("time_analysis_date");
  if(dateInput){
    dateInput.onchange = () => renderTimeAnalysis();
  }
}

// Вспомогательная функция для расчета времени работы оператора на выбранную дату
function calculateOperatorTimeForDate(operator, selectedDate, ops){
  const operatorOps = ops.filter(op => {
    if(op.operator !== operator) return false;
    if(selectedDate && (op.date || "") !== selectedDate) return false;
    return true;
  });
  
  let planned = 0;
  let stopped = 0;
  let inProgress = 0;
  
  for(const op of operatorOps){
    const plannedDuration = op.planned_duration || 0;
    const plannedSetupTime = op.planned_setup_time || 0;
    const totalPlanned = plannedDuration + plannedSetupTime;
    
    if(op.status === "Запланировано"){
      planned += totalPlanned;
    } else if(op.status === "Стоп"){
      stopped += totalPlanned;
    } else if(op.status === "В работе"){
      // Используем данные с сервера (current_work_duration, current_setup_duration)
      if(op.current_work_duration !== undefined && op.current_work_duration > 0){
        inProgress += Math.max(0, plannedDuration - op.current_work_duration);
      } else {
        inProgress += plannedDuration;
      }
      if(op.current_setup_duration !== undefined && op.current_setup_duration > 0){
        inProgress += Math.max(0, plannedSetupTime - op.current_setup_duration);
      }
    } else if(op.status === "Наладка"){
      // Используем данные с сервера (current_setup_duration)
      if(op.current_setup_duration !== undefined && op.current_setup_duration > 0){
        inProgress += Math.max(0, plannedSetupTime - op.current_setup_duration);
      } else {
        inProgress += plannedSetupTime;
      }
    }
  }
  
  return planned + stopped + inProgress;
}

// Функция для расчета общего запланированного времени оператора (когда дата не выбрана)
function calculateOperatorTotalPlannedTime(operator, ops){
  const operatorOps = ops.filter(op => op.operator === operator);
  
  let totalPlanned = 0;
  
  for(const op of operatorOps){
    const plannedDuration = op.planned_duration || 0;
    const plannedSetupTime = op.planned_setup_time || 0;
    totalPlanned += plannedDuration + plannedSetupTime;
  }
  
  return totalPlanned;
}

function renderOps(){
  const tb = $("opsT"); tb.innerHTML="";
  const fo = $("f_order").value;
  const fi = $("f_item") ? $("f_item").value : "";
  const fDate = $("f_date").value;
  const fDateMode = $("f_date_mode").value;
  const sortBy = state.sortBy || "order";
  
  // Обновляем анализ времени при рендере операций
  renderTimeAnalysis();
  const sortByStatus = $("sort_by_status") ? $("sort_by_status").value : "";

  let ops = state.ops.slice().filter(op=>{
    if(fo && fo!=="(все)" && op.order_id!==fo) return false;
    if(fi && fi !== "" && op.order_item_id !== fi) return false;
    if(fDateMode === "selected" && fDate && (op.date||"") !== fDate) return false;
    return true;
  });

  // Apply sorting based on sortBy
  ops.sort((a,b)=>{
    if(sortBy === "overdue"){
      // Сортировка по просроченным: просроченные первыми
      const overdueA = isOverdue(a) ? 1 : 0;
      const overdueB = isOverdue(b) ? 1 : 0;
      if(overdueA !== overdueB) return overdueB - overdueA; // Просроченные первыми
      // Внутри просроченных/непросроченных сортируем по дате (более просроченные первыми)
      if(overdueA === 1){
        const dateA = a.date || "";
        const dateB = b.date || "";
        const dateComp = dateA.localeCompare(dateB);
        if(dateComp !== 0) return dateComp; // Более старые даты первыми
      }
      // Затем по заказу и номеру операции
      return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
    } else if(sortBy === "client"){
      // Получаем клиентов из заказов
      const orderA = state.orders.find(o => o.id === a.order_id);
      const orderB = state.orders.find(o => o.id === b.order_id);
      const clientA = (orderA?.client || "Без клиента").toLowerCase();
      const clientB = (orderB?.client || "Без клиента").toLowerCase();
      const clientComp = clientA.localeCompare(clientB);
      if(clientComp !== 0) return clientComp;
      // Внутри клиента сортируем по заказу и номеру операции
      return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
    } else if(sortBy === "date"){
      const dateComp = (a.date||"").localeCompare(b.date||"");
      if(dateComp !== 0) return dateComp;
      const timeComp = (a.time||"").localeCompare(b.time||"");
      if(timeComp !== 0) return timeComp;
      return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
    } else if(sortBy === "operator"){
      const opComp = (a.operator||"").localeCompare(b.operator||"");
      if(opComp !== 0) return opComp;
      const dateComp = (a.date||"").localeCompare(b.date||"");
      if(dateComp !== 0) return dateComp;
      return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
    } else if(sortBy === "machine"){
      const machComp = (a.machine||"").localeCompare(b.machine||"");
      if(machComp !== 0) return machComp;
      const dateComp = (a.date||"").localeCompare(b.date||"");
      if(dateComp !== 0) return dateComp;
      return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
    } else if(sortBy === "status"){
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
      // Если статусы одинаковые, сортируем по заказу и номеру операции
      const orderComp = (a.order_id||"").localeCompare(b.order_id||"");
      if(orderComp !== 0) return orderComp;
      return (+a.no||0)-(+b.no||0);
    } else {
      // Default: sort by order_id and no
      return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
    }
  });
  
  // Применяем вторичную сортировку по статусу, если выбрана
  // Вторичная сортировка применяется внутри групп основной сортировки
  // Не применяем, если основная сортировка уже по статусу
  if(sortByStatus === "status" && sortBy !== "status"){
    const statusOrder = {
      "Запланировано": 1,
      "Наладка": 2,
      "В работе": 3,
      "Выполнено": 4,
      "Стоп": 5
    };
    
    // Группируем операции по значению основной сортировки
    const groups = new Map();
    ops.forEach((op, index) => {
      let groupKey = "";
      if(sortBy === "client"){
        const order = state.orders.find(o => o.id === op.order_id);
        groupKey = (order?.client || "Без клиента").toLowerCase();
      } else if(sortBy === "date"){
        groupKey = op.date || "Без даты";
      } else if(sortBy === "operator"){
        groupKey = op.operator || "Без оператора";
      } else if(sortBy === "machine"){
        groupKey = op.machine || "Без машины";
      } else {
        groupKey = op.order_id; // Для сортировки по заказу
      }
      
      if(!groups.has(groupKey)){
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push({ op, originalIndex: index });
    });
    
    // Сортируем каждую группу по статусу
    const sortedOps = [];
    for(const [groupKey, groupOps] of groups){
      groupOps.sort((a, b) => {
        const statusA = statusOrder[a.op.status] || 99;
        const statusB = statusOrder[b.op.status] || 99;
        if(statusA !== statusB) return statusA - statusB;
        // Если статусы одинаковые, сохраняем исходный порядок
        return a.originalIndex - b.originalIndex;
      });
      sortedOps.push(...groupOps.map(item => item.op));
    }
    
    ops = sortedOps;
  }
  
  // Дополнительная сортировка по колонкам (при клике на заголовок)
  const columnSort = state.opsColumnSort || "";
  const columnDir = state.opsSortDir || "asc";
  if(columnSort){
    ops.sort((a,b)=>{
      let va, vb;
      switch(columnSort){
        case "no": va = +a.no||0; vb = +b.no||0; break;
        case "order": 
          const ordA = state.orders.find(o=>o.id===a.order_id);
          const ordB = state.orders.find(o=>o.id===b.order_id);
          va = (ordA?.client||"").toLowerCase(); 
          vb = (ordB?.client||"").toLowerCase(); 
          break;
        case "date": va = a.date||""; vb = b.date||""; break;
        case "time": va = a.time||""; vb = b.time||""; break;
        case "machine": va = (a.machine||"").toLowerCase(); vb = (b.machine||"").toLowerCase(); break;
        case "operator": va = (a.operator||"").toLowerCase(); vb = (b.operator||"").toLowerCase(); break;
        case "operation": va = (a.name||"").toLowerCase(); vb = (b.name||"").toLowerCase(); break;
        case "plan": va = +a.plan||0; vb = +b.plan||0; break;
        case "fact": va = +a.fact||0; vb = +b.fact||0; break;
        case "scrap": va = +a.scrap||0; vb = +b.scrap||0; break;
        case "status": va = a.status||""; vb = b.status||""; break;
        case "setup": va = +a.planned_setup_time||0; vb = +b.planned_setup_time||0; break;
        case "work": va = +a.planned_duration||0; vb = +b.planned_duration||0; break;
        default: return 0;
      }
      if(typeof va === "string"){
        return columnDir === "asc" ? va.localeCompare(vb,"ru") : vb.localeCompare(va,"ru");
      }
      return columnDir === "asc" ? va - vb : vb - va;
    });
  }
  
  // Применяем кастомный порядок из localStorage (если есть)
  const swaps = JSON.parse(localStorage.getItem("opsSwaps") || "[]");
  if(swaps.length > 0){
    // Создаем карту операций по ID
    const opsMap = new Map();
    ops.forEach(op => opsMap.set(op.id, op));
    
    // Применяем перестановки в обратном порядке (последние перестановки имеют приоритет)
    for(let i = swaps.length - 1; i >= 0; i--){
      const swap = swaps[i];
      const draggedOp = opsMap.get(swap.dragged);
      const targetOp = opsMap.get(swap.target);
      
      if(draggedOp && targetOp){
        const draggedIndex = ops.indexOf(draggedOp);
        const targetIndex = ops.indexOf(targetOp);
        
        if(draggedIndex !== -1 && targetIndex !== -1){
          // Удаляем перетаскиваемую операцию
          ops.splice(draggedIndex, 1);
          
          // Вставляем в нужное место
          const newTargetIndex = ops.indexOf(targetOp);
          if(swap.before){
            ops.splice(newTargetIndex, 0, draggedOp);
          } else {
            ops.splice(newTargetIndex + 1, 0, draggedOp);
          }
        }
      }
    }
  }

  // Загружаем состояние сворачивания для групп
  const collapsedGroups = JSON.parse(localStorage.getItem("routeCollapsedGroups") || "{}");

  // Фильтруем по статусу: выполненные отдельно
  const incompleteOps = ops.filter(op => op.status !== "Выполнено");
  const completedOps = ops.filter(op => op.status === "Выполнено");

  // Track current group for visual separation and count operations per group
  let currentGroup = null;
  let groupCounts = {};
  
  // Pre-calculate group counts (только для невыполненных операций)
  if(sortBy !== "order"){
    for(const op of incompleteOps){
      let groupValue = null;
      if(sortBy === "client"){
        const order = state.orders.find(o => o.id === op.order_id);
        groupValue = order?.client || "Без клиента";
      } else if(sortBy === "date"){
        groupValue = op.date || "Без даты";
      } else if(sortBy === "operator"){
        groupValue = op.operator || "Без оператора";
      } else if(sortBy === "machine"){
        groupValue = op.machine || "Без машины";
      } else if(sortBy === "status"){
        groupValue = op.status || "Без статуса";
      }
      // Если выбрана вторичная сортировка по статусу, добавляем группировку по статусу
      if(sortByStatus === "status" && !groupValue){
        groupValue = op.status || "Без статуса";
      }
      if(groupValue){
        groupCounts[groupValue] = (groupCounts[groupValue] || 0) + 1;
      }
    }
  }

  for(const op of incompleteOps){
    // Add group header when sorting by client, date, operator, or machine
    let groupValue = null;
    let groupLabel = null;
    
    if(sortBy === "client"){
      const order = state.orders.find(o => o.id === op.order_id);
      groupValue = order?.client || "Без клиента";
      groupLabel = groupValue;
    } else if(sortBy === "date"){
      groupValue = op.date || "Без даты";
      groupLabel = formatDate(op.date) || "Без даты";
    } else if(sortBy === "operator"){
      groupValue = op.operator || "Без оператора";
      groupLabel = op.operator || "Без оператора";
    } else if(sortBy === "machine"){
      groupValue = op.machine || "Без машины";
      groupLabel = op.machine || "Без машины";
    } else if(sortBy === "status"){
      groupValue = op.status || "Без статуса";
      groupLabel = op.status || "Без статуса";
    }
    // Если выбрана вторичная сортировка по статусу, добавляем группировку по статусу
    if(sortByStatus === "status" && !groupValue){
      groupValue = op.status || "Без статуса";
      groupLabel = op.status || "Без статуса";
    }
    
    // Show group header if group changed
    if(groupValue && groupValue !== currentGroup){
      currentGroup = groupValue;
      const count = groupCounts[groupValue] || 0;
      const groupTr = document.createElement("tr");
      groupTr.className = "group-header";
      groupTr.dataset.groupValue = groupValue;
      groupTr.style.cursor = "pointer";
      groupTr.style.userSelect = "none";
      
      let icon = sortBy === "client" ? "👥" : sortBy === "date" ? "📅" : sortBy === "operator" ? "👤" : "🛠️";
      // Если группировка по статусу (вторичная сортировка)
      const isStatusGroup = sortByStatus === "status" && (groupValue === "Запланировано" || groupValue === "Наладка" || groupValue === "В работе" || groupValue === "Выполнено" || groupValue === "Стоп" || groupValue === "Без статуса");
      if(isStatusGroup) {
        icon = "✅";
      }
      
      // Загружаем состояние сворачивания для этой группы
      const collapsedGroups = JSON.parse(localStorage.getItem("routeCollapsedGroups") || "{}");
      const isCollapsed = collapsedGroups[groupValue] === true;
      const collapseIcon = isCollapsed ? "▶" : "▼";
      
      // Вычисляем общее время работы для оператора (если группировка по оператору)
      let timeDisplay = "";
      if(sortBy === "operator"){
        let totalTime = 0;
        if(fDateMode === "selected" && fDate){
          // Если выбрана дата - показываем время, которое потребуется на эту дату
          totalTime = calculateOperatorTimeForDate(groupValue, fDate, incompleteOps);
        } else {
          // Если дата не выбрана - показываем общее запланированное время для всех операций
          totalTime = calculateOperatorTotalPlannedTime(groupValue, incompleteOps);
        }
        if(totalTime > 0){
          timeDisplay = ` <span style="font-weight:700;font-size:12px;color:var(--accent);padding:3px 8px;background:rgba(0,207,181,.15);border-radius:6px;margin-left:8px">⏱️ ${formatDuration(totalTime)}</span>`;
        }
      }
      
      groupTr.innerHTML = `<td colspan="26">
        <span style="font-size:14px;margin-right:6px">${collapseIcon}</span>
        ${icon} ${esc(groupLabel)} <span style="font-weight:600;opacity:0.7;margin-left:8px">(${count} оп.)</span>${timeDisplay}
      </td>`;
      
      // Обработчик клика для сворачивания/разворачивания
      groupTr.onclick = () => {
        const newCollapsed = !collapsedGroups[groupValue];
        collapsedGroups[groupValue] = newCollapsed;
        localStorage.setItem("routeCollapsedGroups", JSON.stringify(collapsedGroups));
        
        // Скрываем/показываем все строки этой группы
        const allRows = tb.querySelectorAll("tr");
        let foundGroup = false;
        for(const row of allRows){
          if(row === groupTr){
            foundGroup = true;
            continue;
          }
          if(foundGroup){
            if(row.classList.contains("group-header")){
              break; // Дошли до следующей группы
            }
            // Проверяем, относится ли строка к этой группе
            if(row.dataset.groupValue === groupValue){
              row.style.display = newCollapsed ? "none" : "";
            }
          }
        }
        
        // Обновляем иконку
        const iconSpan = groupTr.querySelector("span");
        if(iconSpan){
          iconSpan.textContent = newCollapsed ? "▶" : "▼";
        }
      };
      
      tb.appendChild(groupTr);
    }
    const c=completion(op);
    const tr=document.createElement("tr");
    tr.draggable = true;
    tr.dataset.opId = op.id;
    tr.dataset.groupValue = groupValue || ""; // Для сворачивания групп
    tr.style.cursor = "move";
    
    // Применяем состояние сворачивания
    if(groupValue){
      const collapsedGroups = JSON.parse(localStorage.getItem("routeCollapsedGroups") || "{}");
      if(collapsedGroups[groupValue] === true){
        tr.style.display = "none";
      }
    }
    
    if(isOverdue(op)){
      tr.className = "overdue";
    } else if(c>=1){
      tr.style.background = "rgba(46,204,113,.08)";
    }
    
    // Вычисляем таймер для операций в работе
    let timerHTML = "—";
    if(op.status === "В работе" && (op.current_work_duration !== undefined || op.started_at)){
      // Используем вычисленное время с сервера (current_work_duration)
      let elapsed = 0;
      if(op.current_work_duration !== undefined){
        elapsed = op.current_work_duration;
      } else if(op.total_duration !== undefined){
        elapsed = op.total_duration;
      }
      const plannedDuration = op.planned_duration || 0;
      
      let timerColor = 'var(--accent)';
      let prefix = '⏱️';
      
      if(plannedDuration > 0 && elapsed > plannedDuration){
        const overtimePercent = Math.round(((elapsed - plannedDuration) / plannedDuration) * 100);
        if(overtimePercent > 50){
          timerColor = 'var(--bad)';
          prefix = '🚨';
        } else if(overtimePercent > 20){
          timerColor = 'var(--warn)';
          prefix = '⚠️';
        }
      }
      
      const plannedInfo = plannedDuration > 0 ? ` / ${formatDuration(plannedDuration)}` : '';
      // ВАЖНО: не используем переменную startTime (её нет). Для обновления таймера используем started_at из БД.
      const startedAtAttr = op.started_at || "";
      const previousWorkTimeAttr = op.total_duration || 0;
      timerHTML = `<span data-timer="${op.id}" data-started-at="${startedAtAttr}" data-planned="${plannedDuration}" data-previous="${previousWorkTimeAttr}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;background:rgba(0,207,181,.08);border:1px solid rgba(0,207,181,.25)">
        <span class="production-timer-display" style="color:${timerColor};font-weight:900">${prefix} ${formatDuration(elapsed)}${plannedInfo}</span>
      </span>`;
    } else if(op.status === "Выполнено" && op.total_duration > 0){
      const plannedDuration = op.planned_duration || 0;
      let statusIcon = '✓';
      let color = 'var(--ok)';
      
      if(plannedDuration > 0 && op.total_duration > plannedDuration){
        const overtimePercent = Math.round(((op.total_duration - plannedDuration) / plannedDuration) * 100);
        if(overtimePercent > 20){
          statusIcon = '⚠️';
          color = 'var(--warn)';
        }
      }
      
      const plannedInfo = plannedDuration > 0 ? ` / ${formatDuration(plannedDuration)}` : '';
      timerHTML = `<span style="color:${color};font-weight:700">${statusIcon} ${formatDuration(op.total_duration)}${plannedInfo}</span>`;
    } else if(op.planned_duration > 0 || op.planned_setup_time > 0){
      let planParts = [];
      if(op.planned_setup_time > 0){
        planParts.push(`🔧 ${formatDuration(op.planned_setup_time)}`);
      }
      if(op.planned_duration > 0){
        planParts.push(`⚙️ ${formatDuration(op.planned_duration)}`);
      }
      timerHTML = `<span style="color:var(--muted);font-size:11px">План: ${planParts.join(' + ')}</span>`;
    }
    
    // Функция форматирования направлений для отображения
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
      
      return `<div style="font-size:11px" title="${parsed.join(', ')}">${display}</div>`;
    };
    
    const inputSources = op.input_sources || null;
    const outputTargets = op.output_targets || null;
    const inputCritical = op.input_critical || 0;
    const outputCritical = op.output_critical || 0;
    
    tr.innerHTML = `
      <td data-column="no" class="editable mono" data-field="no" data-type="number">${op.no||""}</td>
      <td data-column="order" class="mono">
        <div>${esc(op.order_id)}</div>
        ${getOpItemLabel(op) ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">📦 ${esc(getOpItemLabel(op))}</div>` : ``}
      </td>
      <td data-column="date" class="editable" data-field="date" data-type="date" style="white-space:nowrap;line-height:1.25;word-break:keep-all;max-width:220px">${formatDate(op.date)}</td>
      <td data-column="time" class="editable" data-field="time" data-type="text" style="white-space:normal;line-height:1.25;word-break:break-word;max-width:220px">
        <div style="font-size:12px;font-weight:700;color:var(--text)">${esc(op.time||"—")}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">
          Факт старт: <b style="color:var(--text)">${op.setup_started_at ? new Date(op.setup_started_at).toTimeString().slice(0,5) : "—"}</b>
        </div>
        <div style="font-size:10px;color:var(--muted);">
          Факт конец: <b style="color:var(--text)">${op.operation_completed_at ? new Date(op.operation_completed_at).toTimeString().slice(0,5) : "—"}</b>
        </div>
      </td>
      <td data-column="input_sources" class="editable" data-field="input_sources" data-type="select-source" style="font-size:11px;cursor:pointer" title="Откуда поступает материал (клик для редактирования)">
        ${formatSources(inputSources, true)}${inputCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : ''}
      </td>
      <td data-column="machine" class="editable" data-field="machine" data-type="select-machine" style="background:rgba(52,152,219,.1);font-weight:700;font-size:13px;color:#2980b9">${esc(op.machine||"")}</td>
      <td data-column="output_targets" class="editable" data-field="output_targets" data-type="select-target" style="font-size:11px;cursor:pointer" title="Куда уходит материал (клик для редактирования)">
        ${formatSources(outputTargets, false)}${outputCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : ''}
      </td>
      <td data-column="operator" class="editable" data-field="operator" data-type="select-operator">${esc(op.operator||"")}</td>
      <td data-column="operation" class="editable" data-field="name" data-type="text" style="background:rgba(155,89,182,.1);font-weight:700;font-size:13px;color:#8e44ad">
        ${esc(op.name||"")}
        ${op.cutting_layout_id ? `
          <div style="margin-top:4px">
            <div style="display:inline-block;cursor:pointer;border:1px solid var(--border);border-radius:4px;padding:2px;background:#fff" 
                 data-view-cutting="${esc(op.cutting_layout_id)}" 
                 title="Просмотр раскроя (клик для открытия)">
              <div style="width:60px;height:40px;overflow:hidden;border-radius:2px;background:#f8f9fa;display:flex;align-items:center;justify-content:center">
                ${op.layout_svg ? `<div style="transform:scale(0.15);transform-origin:top left;pointer-events:none">${op.layout_svg}</div>` : '✂️'}
              </div>
              <div style="font-size:9px;text-align:center;color:var(--muted);margin-top:2px">Раскрой</div>
            </div>
          </div>
        ` : ''}
      </td>
      <td data-column="delete" style="text-align:center">
        <button class="btn ghost danger" data-a="del" title="Удалить операцию">🗑️</button>
      </td>
      <td data-column="plan" class="editable" data-field="plan" data-type="number">${op.plan||0}</td>
      <td data-column="fact" class="editable" data-field="fact" data-type="number">${op.fact||0}</td>
      <td data-column="scrap" class="editable" data-field="scrap" data-type="number">${op.scrap||0}</td>
      <td data-column="completion"><span class="pill ${c>=1?"ok":"bad"}" style="${c>1?"background:rgba(0,207,181,.2);border-color:rgba(0,207,181,.5);font-weight:900":""}">${Math.round(c*100)}%</span></td>
      <td data-column="status" class="editable" data-field="status" data-type="select-status">${pillStatus(op)}</td>
      <td data-column="setup" style="white-space:nowrap;font-size:11px">
        <div style="display:flex;align-items:center;gap:4px">
        ${op.setup_duration > 0 ? `<span style="color:var(--warn);font-weight:700">🔧 ${formatDuration(op.setup_duration)}</span>` : (op.setup_started_at && !op.setup_completed_at ? '<span style="color:var(--warn);font-size:10px">⏳ Идёт</span>' : '—')}
          <button class="btn ghost" data-a="edit-setup-fact" title="Редактировать факт наладки" style="padding:1px 4px;font-size:9px;line-height:1">✏</button>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <div style="font-size:9px;color:var(--muted);">План: ${formatDuration(op.planned_setup_time||0)}</div>
          <button class="btn ghost" data-a="edit-setup-plan" title="Изменить план наладки" style="padding:2px 6px;font-size:10px;line-height:1">✏</button>
        </div>
      </td>
      <td data-column="work" style="white-space:nowrap;font-size:11px">
        <div style="display:flex;align-items:center;gap:4px">
        ${op.total_duration > 0 ? `<span style="color:var(--accent);font-weight:700">⚙️ ${formatDuration(op.total_duration)}</span>` : (op.started_at && !op.completed_at ? '<span style="color:var(--accent);font-size:10px">⏳ Идёт</span>' : '—')}
          <button class="btn ghost" data-a="edit-work-fact" title="Редактировать факт работы" style="padding:1px 4px;font-size:9px;line-height:1">✏</button>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <div style="font-size:9px;color:var(--muted);">План: ${formatDuration(op.planned_duration||0)}</div>
          <button class="btn ghost" data-a="edit-work-plan" title="Изменить план работы" style="padding:2px 6px;font-size:10px;line-height:1">✏</button>
        </div>
      </td>
      <td data-column="reset-setup" style="text-align:center">
        ${op.setup_duration>0 ? `<button class="btn ghost danger" data-a="reset-setup" title="Сбросить статистику наладки">🔧</button>` : ''}
      </td>
      <td data-column="reset-work" style="text-align:center">
        ${op.total_duration>0 ? `<button class="btn ghost danger" data-a="reset-work" title="Сбросить статистику работы">⚙️</button>` : ''}
      </td>
      <td data-column="files" style="text-align:center">
        <div class="op-files-cell" data-op-id="${esc(op.id)}" style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <div class="op-file-thumb" style="display:none"></div>
          <button class="btn ghost" data-a="files" title="Файлы/чертежи">📎</button>
        </div>
      </td>
      <td data-column="materials" style="text-align:center">
        <button class="btn ghost" data-a="materials" title="Материалы">📦</button>
      </td>
      <td data-column="cutting" style="text-align:center;vertical-align:middle">
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
          ${op.cutting_layout_id && op.layout_svg ? `
            <div style="width:40px;height:30px;border:1px solid var(--border);border-radius:3px;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer" 
                 data-view-cutting="${esc(op.cutting_layout_id)}" title="Просмотр кроя">
              ${op.layout_svg.replace(/width="[^"]*"/, 'width="40"').replace(/height="[^"]*"/, 'height="30"').replace(/viewBox="[^"]*"/, '')}
            </div>
          ` : ''}
          <button class="btn ghost" data-a="cutting" title="Выбрать крой" style="padding:4px 8px;font-size:12px">✂️</button>
        </div>
      </td>
      <td data-column="link-item" style="text-align:center">
        <button class="btn ghost" data-a="link-item" title="Привязать к изделию">🏷</button>
      </td>
      <td data-column="qr" style="text-align:center">
        <button class="btn ghost" data-a="qr" title="Печать QR/штрихкода текущего статуса">🧾</button>
      </td>
      <td data-column="dup" style="text-align:center">
        <button class="btn ghost" data-a="dup" title="Дублировать операцию">📋</button>
      </td>`;

    // Inline editing for all editable cells
    tr.querySelectorAll('.editable').forEach(td=>{
      td.onclick = ()=> makeEditable(td, op, td.dataset.field, td.dataset.type);
    });

    tr.querySelector('[data-a="dup"]').onclick = async ()=>{
      if(!confirm("Дублировать эту операцию?")) return;
      
      // Find max operation number for this order
      const orderOps = state.ops.filter(o => o.order_id === op.order_id);
      const maxNo = orderOps.length > 0 ? Math.max(...orderOps.map(o => +o.no || 0)) : 0;
      const nextNo = maxNo + 1;
      
      // Create new operation with same data but new number
      // Копируем ВСЕ данные включая input_sources, output_targets, order_item_id
      const newOp = {
        id: uid(),
        order_id: op.order_id,
        order_item_id: op.order_item_id || null, // Привязка к изделию
        no: nextNo,
        date: op.date || todayISO(),
        time: op.time || "",
        machine: op.machine || "",
        operator: op.operator || "",
        name: op.name || "",
        plan: op.plan || 0,
        fact: 0,
        scrap: 0,
        status: "Запланировано",
        dep: op.dep || 0,
        planned_duration: op.planned_duration || 0,
        planned_setup_time: op.planned_setup_time || 0,
        auxiliary_units: 0,
        input_sources: op.input_sources || null, // Откуда пришло
        output_targets: op.output_targets || null, // Куда ушло
        input_critical: op.input_critical || 0,
        output_critical: op.output_critical || 0
      };
      
      try{
        await api("/api/ops", { method:"POST", body: JSON.stringify(newOp) });
        // Копируем материалы из исходной операции
        try{
          await api("/api/ops/"+encodeURIComponent(newOp.id)+"/materials/copy-from-op", {
            method:"POST",
            body: JSON.stringify({ sourceOpId: op.id })
          });
        }catch(_e){}
        await refreshAll(false);
        toast("Операция продублирована как №" + nextNo + " (с материалами и привязками)");
      }catch(e){
        alert("Ошибка дублирования: " + e.message);
      }
    };

    tr.querySelector('[data-a="del"]').onclick = async ()=>{
      if(!confirm("Удалить операцию?")) return;
      try {
        await api("/api/ops/"+encodeURIComponent(op.id), { method:"DELETE" });
        // Обновляем данные без перезагрузки страницы
        await refreshAll(false);
        // Обновляем отображение операций
        if (typeof window.renderOps === 'function') {
          await window.renderOps();
        } else if (typeof renderOps === 'function') {
          renderOps();
        }
        if (typeof renderTimeAnalysis === 'function') {
          renderTimeAnalysis();
        }
        toast("✅ Операция удалена");
      } catch(e) {
        toast("❌ Ошибка удаления: " + e.message);
      }
    };

    // Сброс статистики наладки/работы (основная таблица)
    const resetSetupBtn = tr.querySelector('[data-a="reset-setup"]');
    if(resetSetupBtn){
      resetSetupBtn.onclick = async ()=>{
        if(!confirm("Сбросить статистику наладки для этой операции?\nБудут обнулены время наладки и метки начала/окончания.")) return;
        try{
          await api("/api/ops/"+encodeURIComponent(op.id)+"/reset-setup-stats", {
            method:"POST",
            headers:{ "Content-Type":"application/json" },
            body: JSON.stringify({ version: op.version ?? 0 })
          });
          await refreshAll(false);
          // Обновляем отображение операций
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          if (typeof renderTimeAnalysis === 'function') {
            renderTimeAnalysis();
          }
          toast("🔧 Статистика наладки сброшена");
        }catch(e){
          console.error(e);
          alert("Ошибка сброса наладки: " + e.message);
        }
      };
    }
    const resetWorkBtn = tr.querySelector('[data-a="reset-work"]');
    if(resetWorkBtn){
      resetWorkBtn.onclick = async ()=>{
        if(!confirm("Сбросить статистику работы для этой операции?\nБудут обнулены время работы и метки начала/окончания.")) return;
        try{
          await api("/api/ops/"+encodeURIComponent(op.id)+"/reset-work-stats", {
            method:"POST",
            headers:{ "Content-Type":"application/json" },
            body: JSON.stringify({ version: op.version ?? 0 })
          });
          await refreshAll(false);
          // Обновляем отображение операций
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          if (typeof renderTimeAnalysis === 'function') {
            renderTimeAnalysis();
          }
          toast("⚙️ Статистика работы сброшена");
        }catch(e){
          console.error(e);
          alert("Ошибка сброса работы: " + e.message);
        }
      };
    }

    // Редактирование плановых времен (наладка/работа) в основной таблице
    const editSetupBtn = tr.querySelector('[data-a="edit-setup-plan"]');
    if(editSetupBtn){
      editSetupBtn.onclick = async ()=>{
        const freshOp = state.ops?.find(o => o.id === op.id) || op;
        const defMin = Math.round((freshOp.planned_setup_time||0)/60);
        const val = prompt("Плановое время наладки (мин):", defMin || "0");
        if(val===null) return;
        const mins = parseFloat(String(val).replace(',','.'));
        if(isNaN(mins) || mins<0){ alert("Введите число минут"); return; }
        const seconds = Math.round(mins*60);
        try {
          const updated = await updateOp(freshOp, { planned_setup_time: seconds });
          
          // Обновляем операцию в state.ops
          const stateOp = state.ops?.find(o => o.id === op.id);
          if (stateOp && updated) {
            Object.assign(stateOp, updated);
          }
          
          await refreshAll(false);
          
          // Перерисовываем маршрут
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          
          toast("✅ План наладки обновлён");
        } catch (e) {
          console.error("Ошибка обновления плана наладки:", e);
          toast("❌ Ошибка: " + (e.message || "Не удалось обновить план наладки"));
        }
      };
    }
    const editWorkBtn = tr.querySelector('[data-a="edit-work-plan"]');
    if(editWorkBtn){
      editWorkBtn.onclick = async ()=>{
        const freshOp = state.ops?.find(o => o.id === op.id) || op;
        const defMin = Math.round((freshOp.planned_duration||0)/60);
        const val = prompt("Плановое время работы (мин):", defMin || "0");
        if(val===null) return;
        const mins = parseFloat(String(val).replace(',','.'));
        if(isNaN(mins) || mins<0){ alert("Введите число минут"); return; }
        const seconds = Math.round(mins*60);
        try {
          const updated = await updateOp(freshOp, { planned_duration: seconds });
          
          // Обновляем операцию в state.ops
          const stateOp = state.ops?.find(o => o.id === op.id);
          if (stateOp && updated) {
            Object.assign(stateOp, updated);
          }
          
          await refreshAll(false);
          
          // Перерисовываем маршрут
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          
          toast("✅ План работы обновлён");
        } catch (e) {
          console.error("Ошибка обновления плана работы:", e);
          toast("❌ Ошибка: " + (e.message || "Не удалось обновить план работы"));
        }
      };
    }
    // Редактирование фактического времени наладки
    const editSetupFactBtn = tr.querySelector('[data-a="edit-setup-fact"]');
    if(editSetupFactBtn){
      editSetupFactBtn.onclick = async ()=>{
        // Получаем актуальную версию операции перед редактированием
        const freshOp = state.ops?.find(o => o.id === op.id) || op;
        const defMin = Math.round((freshOp.setup_duration||0)/60);
        const val = prompt("Фактическое время наладки (мин):", defMin || "0");
        if(val===null) return;
        const mins = parseFloat(String(val).replace(',','.'));
        if(isNaN(mins) || mins<0){ alert("Введите число минут"); return; }
        const seconds = Math.round(mins*60);
        try {
          const updated = await updateOp(freshOp, { setup_duration: seconds });
          
          // Обновляем операцию в state.ops
          const stateOp = state.ops?.find(o => o.id === op.id);
          if (stateOp && updated) {
            Object.assign(stateOp, updated);
          }
          
          // Автоматически обновляем все данные
          await refreshAll(false);
          
          // Перерисовываем маршрут, чтобы обновленные значения отобразились
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          
          // Обновляем анализ времени
          if (typeof renderTimeAnalysis === 'function') {
            renderTimeAnalysis();
          }
          
          toast("✅ Факт наладки обновлён");
        } catch (e) {
          console.error("Ошибка обновления времени наладки:", e);
          toast("❌ Ошибка: " + (e.message || "Не удалось обновить время наладки"));
        }
      };
    }
    // Редактирование фактического времени работы
    const editWorkFactBtn = tr.querySelector('[data-a="edit-work-fact"]');
    if(editWorkFactBtn){
      editWorkFactBtn.onclick = async ()=>{
        // Получаем актуальную версию операции перед редактированием
        const freshOp = state.ops?.find(o => o.id === op.id) || op;
        const defMin = Math.round((freshOp.total_duration||0)/60);
        const val = prompt("Фактическое время работы (мин):", defMin || "0");
        if(val===null) return;
        const mins = parseFloat(String(val).replace(',','.'));
        if(isNaN(mins) || mins<0){ alert("Введите число минут"); return; }
        const seconds = Math.round(mins*60);
        try {
          const updated = await updateOp(freshOp, { total_duration: seconds });
          
          // Обновляем операцию в state.ops
          const stateOp = state.ops?.find(o => o.id === op.id);
          if (stateOp && updated) {
            Object.assign(stateOp, updated);
          }
          
          // Автоматически обновляем все данные
          await refreshAll(false);
          
          // Перерисовываем маршрут, чтобы обновленные значения отобразились
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          
          // Обновляем анализ времени
          if (typeof renderTimeAnalysis === 'function') {
            renderTimeAnalysis();
          }
          
          toast("✅ Факт работы обновлён");
        } catch (e) {
          console.error("Ошибка обновления времени работы:", e);
          toast("❌ Ошибка: " + (e.message || "Не удалось обновить время работы"));
        }
      };
    }
    // Вложения (основная таблица)
    const filesBtn = tr.querySelector('[data-a="files"]');
    if(filesBtn){
      filesBtn.onclick = ()=> openOpFilesModal(op);
    }
    const matsBtn = tr.querySelector('[data-a="materials"]');
    if(matsBtn){
      matsBtn.onclick = ()=> openOpMaterialsModal(op);
    }
    const linkItemBtn = tr.querySelector('[data-a="link-item"]');
    if(linkItemBtn){
      linkItemBtn.onclick = ()=> openOpItemLinkModal(op);
    }
    const cuttingBtn = tr.querySelector('[data-a="cutting"]');
    if(cuttingBtn){
      cuttingBtn.onclick = ()=> openOpCuttingModal(op);
    }
    const qrBtn = tr.querySelector('[data-a="qr"]');
    if(qrBtn){
      qrBtn.onclick = ()=> printOpQr(op);
    }
    
    // Обработчик клика на миниатюру раскроя
    const cuttingThumb = tr.querySelector('[data-view-cutting]');
    if(cuttingThumb){
      cuttingThumb.onclick = () => {
        const layoutId = cuttingThumb.dataset.viewCutting;
        viewCuttingLayoutForOp(layoutId, op);
      };
    }
    
    // Drag and Drop для изменения порядка
    let draggedElement = null;
    tr.ondragstart = (e) => {
      draggedElement = tr;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/html", tr.outerHTML);
      tr.style.opacity = "0.5";
    };
    
    tr.ondragend = () => {
      tr.style.opacity = "1";
      draggedElement = null;
    };
    
    tr.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if(draggedElement && draggedElement !== tr){
        const rect = tr.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if(e.clientY < midpoint){
          tr.style.borderTop = "3px solid var(--accent)";
          tr.style.borderBottom = "none";
        } else {
          tr.style.borderBottom = "3px solid var(--accent)";
          tr.style.borderTop = "none";
        }
      }
    };
    
    tr.ondragleave = () => {
      tr.style.borderTop = "none";
      tr.style.borderBottom = "none";
    };
    
    tr.ondrop = (e) => {
      e.preventDefault();
      tr.style.borderTop = "none";
      tr.style.borderBottom = "none";
      
      if(draggedElement && draggedElement !== tr){
        const draggedOpId = draggedElement.dataset.opId;
        const targetOpId = tr.dataset.opId;
        
        // Сохраняем информацию о перестановке
        const swaps = JSON.parse(localStorage.getItem("opsSwaps") || "[]");
        const rect = tr.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        
        // Определяем позицию вставки
        const insertBefore = e.clientY < midpoint;
        swaps.push({
          dragged: draggedOpId,
          target: targetOpId,
          before: insertBefore,
          timestamp: Date.now()
        });
        
        // Оставляем только последние 100 перестановок
        if(swaps.length > 100) swaps.shift();
        
        localStorage.setItem("opsSwaps", JSON.stringify(swaps));
        
        // Перерисовываем таблицу
        renderOps();
        toast("Порядок изменен");
      }
    };

    tb.appendChild(tr);
  }

  // Блок с выполнёнными операциями (сворачиваемый)
  if(completedOps.length > 0){
    const doneTr = document.createElement("tr");
    doneTr.className = "group-header";
    const colspan = 24;
    doneTr.innerHTML = `
      <td colspan="${colspan}">
        <details class="card" style="margin:8px 0;border:1px solid var(--border);border-radius:10px;padding:10px;background:rgba(0,0,0,.02)">
          <summary style="display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;font-weight:800;font-size:13px">
            ✅ Выполнено (${completedOps.length})
            <span style="font-size:11px;color:var(--muted);font-weight:700">Нажмите, чтобы развернуть</span>
          </summary>
          <div class="table-wrapper" style="margin-top:8px;max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:8px">
            <table class="resizable-table">
              <thead>
                <tr>
                  <th data-column="no" style="width:50px">№</th>
                  <th data-column="order" style="width:100px">Заказ</th>
                  <th data-column="date" style="width:80px">Дата</th>
                  <th data-column="time" style="width:60px">Время</th>
                  <th data-column="machine" style="width:100px">Машина</th>
                  <th data-column="operator" style="width:100px">Оператор</th>
                  <th data-column="operation" style="width:150px">Операция</th>
                  <th data-column="status" style="width:100px">Статус</th>
                  <th data-column="setup" style="width:60px">🔧</th>
                  <th data-column="work" style="width:60px">⚙️</th>
                  <th data-column="reset-setup" style="width:40px">🔧</th>
                  <th data-column="reset-work" style="width:40px">⚙️</th>
                  <th data-column="files" style="width:40px">📎</th>
                  <th data-column="materials" style="width:40px">📦</th>
                  <th data-column="cutting" style="width:60px">✂️</th>
                  <th data-column="link-item" style="width:40px">🏷</th>
                  <th data-column="qr" style="width:40px">🧾</th>
                  <th data-column="dup" style="width:40px">📋</th>
                  <th data-column="del" style="width:40px">×</th>
                </tr>
              </thead>
              <tbody id="doneT"></tbody>
            </table>
          </div>
        </details>
      </td>
    `;
    tb.appendChild(doneTr);

    const doneBody = doneTr.querySelector("#doneT");
    completedOps.forEach(op=>{
      const c=completion(op);
      const row=document.createElement("tr");
      row.dataset.opId = op.id;
      row.innerHTML = `
        <td data-column="no" class="editable mono" data-field="no" data-type="number">${op.no||""}</td>
        <td data-column="order" class="mono">
          <div>${esc(op.order_id)}</div>
          ${getOpItemLabel(op) ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">📦 ${esc(getOpItemLabel(op))}</div>` : ``}
        </td>
        <td data-column="date" class="editable" data-field="date" data-type="date">${formatDate(op.date)}</td>
        <td data-column="time" class="editable" data-field="time" data-type="text" style="white-space:normal;line-height:1.2">${esc(op.time||"")}</td>
        <td data-column="machine" class="editable" data-field="machine" data-type="select-machine" style="background:rgba(52,152,219,.1);font-weight:700;font-size:13px;color:#2980b9">${esc(op.machine||"")}</td>
        <td data-column="operator" class="editable" data-field="operator" data-type="select-operator">${esc(op.operator||"")}</td>
        <td data-column="operation" class="editable" data-field="name" data-type="text" style="background:rgba(155,89,182,.1);font-weight:700;font-size:13px;color:#8e44ad">${esc(op.name||"")}</td>
        <td data-column="status" class="editable" data-field="status" data-type="select-status">${pillStatus(op)}</td>
        <td data-column="setup" style="white-space:nowrap;font-size:11px">
            <div style="display:flex;align-items:center;gap:4px">
            ${op.setup_duration>0?`<span style="color:var(--warn);font-weight:700">🔧 ${formatDuration(op.setup_duration)}</span>`:'—'}
              <button class="btn ghost" data-a="edit-setup-fact" title="Редактировать факт наладки" style="padding:1px 4px;font-size:9px;line-height:1">✏</button>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
              <div style="font-size:9px;color:var(--muted);">План: ${formatDuration(op.planned_setup_time||0)}</div>
              <button class="btn ghost" data-a="edit-setup-plan" title="Изменить план наладки" style="padding:2px 6px;font-size:10px;line-height:1">✏</button>
            </div>
          </td>
        <td data-column="work" style="white-space:nowrap;font-size:11px">
            <div style="display:flex;align-items:center;gap:4px">
            ${op.total_duration>0?`<span style="color:var(--accent);font-weight:700">⚙️ ${formatDuration(op.total_duration)}</span>`:'—'}
              <button class="btn ghost" data-a="edit-work-fact" title="Редактировать факт работы" style="padding:1px 4px;font-size:9px;line-height:1">✏</button>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
              <div style="font-size:9px;color:var(--muted);">План: ${formatDuration(op.planned_duration||0)}</div>
              <button class="btn ghost" data-a="edit-work-plan" title="Изменить план работы" style="padding:2px 6px;font-size:10px;line-height:1">✏</button>
            </div>
          </td>
        <td data-column="reset-setup" style="text-align:center">
          ${op.setup_duration>0 ? `<button class="btn ghost danger" data-a="reset-setup" title="Сбросить статистику наладки">🔧</button>` : ''}
        </td>
        <td data-column="reset-work" style="text-align:center">
          ${op.total_duration>0 ? `<button class="btn ghost danger" data-a="reset-work" title="Сбросить статистику работы">⚙️</button>` : ''}
        </td>
        <td data-column="files" style="text-align:center">
          <div class="op-files-cell" data-op-id="${esc(op.id)}" style="display:flex;flex-direction:column;align-items:center;gap:4px">
            <div class="op-file-thumb" style="display:none"></div>
        <button class="btn ghost" data-a="files" title="Файлы/чертежи">📎</button>
          </div>
        </td>
        <td data-column="materials" style="text-align:center">
        <button class="btn ghost" data-a="materials" title="Материалы">📦</button>
        </td>
        <td data-column="cutting" style="text-align:center;vertical-align:middle">
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            ${op.cutting_layout_id && op.layout_svg ? `
              <div style="width:40px;height:30px;border:1px solid var(--border);border-radius:3px;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer" 
                   data-view-cutting="${esc(op.cutting_layout_id)}" title="Просмотр кроя">
                ${op.layout_svg.replace(/width="[^"]*"/, 'width="40"').replace(/height="[^"]*"/, 'height="30"').replace(/viewBox="[^"]*"/, '')}
              </div>
            ` : ''}
            <button class="btn ghost" data-a="cutting" title="Выбрать крой" style="padding:4px 8px;font-size:12px">✂️</button>
          </div>
        </td>
        <td data-column="link-item" style="text-align:center">
        <button class="btn ghost" data-a="link-item" title="Привязать к изделию">🏷</button>
        </td>
        <td data-column="qr" style="text-align:center">
          <button class="btn ghost" data-a="qr" title="Печать QR/штрихкода текущего статуса">🧾</button>
        </td>
        <td data-column="dup" style="text-align:center">
          <button class="btn ghost" data-a="dup" title="Дублировать операцию">📋</button>
        </td>
        <td data-column="del" style="text-align:center">
          <button class="btn ghost danger" data-a="del" title="Удалить">×</button>
        </td>
      `;
      // inline edit
      row.querySelectorAll('.editable').forEach(td=>{
        td.onclick = ()=> makeEditable(td, op, td.dataset.field, td.dataset.type);
      });
      // cutting button
      const cuttingBtn2 = row.querySelector('[data-a="cutting"]');
      if(cuttingBtn2){
        cuttingBtn2.onclick = ()=> openOpCuttingModal(op);
      }
      // Обработчик клика на миниатюру раскроя (для группированных операций)
      const cuttingThumb2 = row.querySelector('[data-view-cutting]');
      if(cuttingThumb2){
        cuttingThumb2.onclick = () => {
          const layoutId = cuttingThumb2.dataset.viewCutting;
          viewCuttingLayoutForOp(layoutId, op);
        };
      }
      // duplicate
      const dupBtn = row.querySelector('[data-a="dup"]');
      if(dupBtn){
        dupBtn.onclick = async ()=>{
          if(!confirm("Дублировать эту операцию?")) return;
          const orderOps = state.ops.filter(o => o.order_id === op.order_id);
          const maxNo = orderOps.length > 0 ? Math.max(...orderOps.map(o => +o.no || 0)) : 0;
          const nextNo = maxNo + 1;
          const newOp = {
            id: uid(),
            order_id: op.order_id,
            no: nextNo,
            date: op.date || todayISO(),
            time: op.time || "",
            machine: op.machine || "",
            operator: op.operator || "",
            name: op.name || "",
            plan: op.plan || 0,
            fact: 0,
            scrap: 0,
            status: "Запланировано",
            dep: op.dep || 0,
            planned_duration: op.planned_duration || 0,
            planned_setup_time: op.planned_setup_time || 0,
            auxiliary_units: 0
          };
          try{
            await api("/api/ops", { method:"POST", body: JSON.stringify(newOp) });
            await refreshAll(false);
            toast("Операция продублирована как №" + nextNo);
          }catch(e){
            alert("Ошибка дублирования: " + e.message);
          }
        };
      }
      // edit planned setup/work
      const editSetupBtn = row.querySelector('[data-a="edit-setup-plan"]');
      if(editSetupBtn){
        editSetupBtn.onclick = async ()=>{
          const defMin = Math.round((op.planned_setup_time||0)/60);
          const val = prompt("Плановое время наладки (мин):", defMin || "0");
          if(val===null) return;
          const mins = parseFloat(String(val).replace(',','.'));
          if(isNaN(mins) || mins<0){ alert("Введите число минут"); return; }
          const seconds = Math.round(mins*60);
          await updateOp(op, { planned_setup_time: seconds });
          await refreshAll(false);
          // Обновляем отображение операций
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          toast("План наладки обновлён");
        };
      }
      const editWorkBtn = row.querySelector('[data-a="edit-work-plan"]');
      if(editWorkBtn){
        editWorkBtn.onclick = async ()=>{
          const defMin = Math.round((op.planned_duration||0)/60);
          const val = prompt("Плановое время работы (мин):", defMin || "0");
          if(val===null) return;
          const mins = parseFloat(String(val).replace(',','.'));
          if(isNaN(mins) || mins<0){ alert("Введите число минут"); return; }
          const seconds = Math.round(mins*60);
          await updateOp(op, { planned_duration: seconds });
          await refreshAll(false);
          // Обновляем отображение операций
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          toast("План работы обновлён");
        };
      }
      // Редактирование фактического времени наладки
      const editSetupFactBtn = row.querySelector('[data-a="edit-setup-fact"]');
      if(editSetupFactBtn){
        editSetupFactBtn.onclick = async ()=>{
          const defMin = Math.round((op.setup_duration||0)/60);
          const val = prompt("Фактическое время наладки (мин):", defMin || "0");
          if(val===null) return;
          const mins = parseFloat(String(val).replace(',','.'));
          if(isNaN(mins) || mins<0){ alert("Введите число минут"); return; }
          const seconds = Math.round(mins*60);
          await updateOp(op, { setup_duration: seconds });
          await refreshAll(false);
          // Обновляем отображение операций
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          if (typeof renderTimeAnalysis === 'function') {
            renderTimeAnalysis();
          }
          toast("🔧 Факт наладки обновлён");
        };
      }
      // Редактирование фактического времени работы
      const editWorkFactBtn = row.querySelector('[data-a="edit-work-fact"]');
      if(editWorkFactBtn){
        editWorkFactBtn.onclick = async ()=>{
          const defMin = Math.round((op.total_duration||0)/60);
          const val = prompt("Фактическое время работы (мин):", defMin || "0");
          if(val===null) return;
          const mins = parseFloat(String(val).replace(',','.'));
          if(isNaN(mins) || mins<0){ alert("Введите число минут"); return; }
          const seconds = Math.round(mins*60);
          await updateOp(op, { total_duration: seconds });
          await refreshAll(false);
          // Обновляем отображение операций
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          if (typeof renderTimeAnalysis === 'function') {
            renderTimeAnalysis();
          }
          toast("⚙️ Факт работы обновлён");
        };
      }
      // delete
    const delBtn = row.querySelector('[data-a="del"]');
      if(delBtn){
        delBtn.onclick = async ()=>{
          if(!confirm("Удалить операцию?")) return;
          await api("/api/ops/"+encodeURIComponent(op.id), { method:"DELETE" });
          await refreshAll(false);
          // Обновляем отображение операций
          if (typeof window.renderOps === 'function') {
            await window.renderOps();
          } else if (typeof renderOps === 'function') {
            renderOps();
          }
          if (typeof renderTimeAnalysis === 'function') {
            renderTimeAnalysis();
          }
          toast("Операция удалена");
        };
      }
      // qr
      const qrBtn = row.querySelector('[data-a="qr"]');
      if(qrBtn){
        qrBtn.onclick = ()=> printOpQr(op);
      }
      // reset setup stats (completed block)
      const resetSetupBtn = row.querySelector('[data-a="reset-setup"]');
      if(resetSetupBtn){
        resetSetupBtn.onclick = async ()=>{
          if(!confirm("Сбросить статистику наладки для этой операции?\nБудут обнулены время наладки и метки начала/окончания.")) return;
          try{
            await api("/api/ops/"+encodeURIComponent(op.id)+"/reset-setup-stats", {
              method:"POST",
              headers:{ "Content-Type":"application/json" },
              body: JSON.stringify({ version: op.version ?? 0 })
            });
            await refreshAll(false);
            // Обновляем отображение операций
            if (typeof window.renderOps === 'function') {
              await window.renderOps();
            } else if (typeof renderOps === 'function') {
              renderOps();
            }
            if (typeof renderTimeAnalysis === 'function') {
              renderTimeAnalysis();
            }
            toast("🔧 Статистика наладки сброшена");
          }catch(e){
            console.error(e);
            alert("Ошибка сброса наладки: " + e.message);
          }
        };
      }
      // reset work stats (completed block)
      const resetWorkBtn = row.querySelector('[data-a="reset-work"]');
      if(resetWorkBtn){
        resetWorkBtn.onclick = async ()=>{
          if(!confirm("Сбросить статистику работы для этой операции?\nБудут обнулены время работы и метки начала/окончания.")) return;
          try{
            await api("/api/ops/"+encodeURIComponent(op.id)+"/reset-work-stats", {
              method:"POST",
              headers:{ "Content-Type":"application/json" },
              body: JSON.stringify({ version: op.version ?? 0 })
            });
            await refreshAll(false);
            // Обновляем отображение операций
            if (typeof window.renderOps === 'function') {
              await window.renderOps();
            } else if (typeof renderOps === 'function') {
              renderOps();
            }
            if (typeof renderTimeAnalysis === 'function') {
              renderTimeAnalysis();
            }
            toast("⚙️ Статистика работы сброшена");
          }catch(e){
            console.error(e);
            alert("Ошибка сброса работы: " + e.message);
          }
        };
      }
      const filesBtn = row.querySelector('[data-a="files"]');
      if(filesBtn){
        filesBtn.onclick = ()=> openOpFilesModal(op);
      }
      const matsBtn = row.querySelector('[data-a="materials"]');
      if(matsBtn){
        matsBtn.onclick = ()=> openOpMaterialsModal(op);
      }
      const linkItemBtn = row.querySelector('[data-a="link-item"]');
      if(linkItemBtn){
        linkItemBtn.onclick = ()=> openOpItemLinkModal(op);
      }
      doneBody.appendChild(row);
    });
  }
  
  // Рендерим выполненные операции (100%+) в отдельной таблице
  // (completedOps уже отфильтрованы выше)
  if(completedOps.length > 0){
    // Создаем контейнер для выполненных операций
    const completedContainer = document.createElement("div");
    completedContainer.id = "completedOpsContainer";
    completedContainer.style.marginTop = "20px";
    completedContainer.style.borderTop = "2px solid rgba(46,204,113,.3)";
    completedContainer.style.paddingTop = "15px";
    
    // Заголовок с кнопкой сворачивания
    const completedHeader = document.createElement("div");
    completedHeader.style.cursor = "pointer";
    completedHeader.style.userSelect = "none";
    completedHeader.style.padding = "10px";
    completedHeader.style.background = "rgba(46,204,113,.12)";
    completedHeader.style.borderRadius = "8px";
    completedHeader.style.marginBottom = "10px";
    
    const completedGroupKey = "__completed_100__";
    const isCompletedCollapsed = collapsedGroups[completedGroupKey] === true;
    const collapseIcon = isCompletedCollapsed ? "▶" : "▼";
    
    // Статистика по всем выполненным операциям
    const totalPlan = completedOps.reduce((sum, op) => sum + (+op.plan || 0), 0);
    const totalFact = completedOps.reduce((sum, op) => sum + (+op.fact || 0), 0);
    const totalScrap = completedOps.reduce((sum, op) => sum + (+op.scrap || 0), 0);
    
    // Статистика по времени наладки
    const totalPlannedSetupTime = completedOps.reduce((sum, op) => sum + (op.planned_setup_time || 0), 0);
    const totalActualSetupTime = completedOps.reduce((sum, op) => sum + (op.setup_duration || 0), 0);
    
    // Статистика по времени работы
    const totalPlannedWorkTime = completedOps.reduce((sum, op) => sum + (op.planned_duration || 0), 0);
    const totalActualWorkTime = completedOps.reduce((sum, op) => sum + (op.total_duration || 0), 0);
    
    // Статистика по операции "Отгрузка товара" - это последняя операция, которая фиксируется только при отгрузке
    const shipmentOps = completedOps.filter(op => {
      const opName = (op.name || "").toLowerCase();
      return opName.includes("отгрузка") || opName.includes("отгруз") || opName.includes("товар");
    });
    
    // Если есть операции отгрузки, используем их для статистики по количеству продукции
    let shipmentPlan = 0;
    let shipmentFact = 0;
    let quantityPercent = 0;
    
    if(shipmentOps.length > 0){
      shipmentPlan = shipmentOps.reduce((sum, op) => sum + (+op.plan || 0), 0);
      shipmentFact = shipmentOps.reduce((sum, op) => sum + (+op.fact || 0), 0);
      if(shipmentPlan > 0){
        quantityPercent = Math.round((shipmentFact / shipmentPlan) * 100);
      }
    } else {
      // Если нет операций отгрузки, используем общую статистику
      if(totalPlan > 0){
        quantityPercent = Math.round((totalFact / totalPlan) * 100);
      }
    }
    
    const quantityPercentColor = quantityPercent >= 100 ? "var(--ok)" : quantityPercent >= 80 ? "var(--warn)" : "var(--bad)";
    
    completedHeader.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <span style="font-size:16px;margin-right:8px">${collapseIcon}</span>
            <b>✅ Выполненные операции (100%+)</b>
            <span style="font-weight:600;opacity:0.7;margin-left:8px">(${completedOps.length} оп.)</span>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:11px">
          <div style="display:flex;flex-direction:column;gap:4px">
            <div style="font-weight:700;color:var(--text)">Количество продукции:</div>
            <div style="color:var(--muted)">
              План: <b style="color:var(--text)">${shipmentOps.length > 0 ? shipmentPlan : totalPlan}</b> | 
              Факт: <b style="color:var(--text)">${shipmentOps.length > 0 ? shipmentFact : totalFact}</b> | 
              Брак: <b style="color:var(--text)">${totalScrap}</b>
            </div>
            <div style="color:var(--muted)">
              Выполнение: <b style="color:${quantityPercentColor}">${quantityPercent}%</b>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <div style="font-weight:700;color:var(--text)">🔧 Наладка:</div>
            <div style="color:var(--muted)">
              План: <b style="color:var(--text)">${formatDuration(totalPlannedSetupTime)}</b> | 
              Факт: <b style="color:var(--text)">${formatDuration(totalActualSetupTime)}</b>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <div style="font-weight:700;color:var(--text)">⚙️ Работа:</div>
            <div style="color:var(--muted)">
              План: <b style="color:var(--text)">${formatDuration(totalPlannedWorkTime)}</b> | 
              Факт: <b style="color:var(--text)">${formatDuration(totalActualWorkTime)}</b>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Таблица для выполненных операций
    const completedTable = document.createElement("table");
    completedTable.style.display = isCompletedCollapsed ? "none" : "";
    completedTable.innerHTML = `
      <thead>
        <tr>
          <th>№</th><th>Заказ</th><th>Дата</th><th>Время</th><th>Откуда</th><th>Машина</th><th>Куда</th><th>Оператор</th>
          <th>Операция</th><th>План</th><th>Факт</th><th>Брак</th><th>Готово</th><th>Статус</th>
          <th>🔧 Наладка</th><th>⚙️ Работа</th><th></th>
        </tr>
      </thead>
      <tbody id="completedOpsT"></tbody>
    `;
    
    const completedTbody = completedTable.querySelector("#completedOpsT");
    
    // Обработчик клика для сворачивания/разворачивания
    completedHeader.onclick = () => {
      const newCollapsed = !isCompletedCollapsed;
      collapsedGroups[completedGroupKey] = newCollapsed;
      localStorage.setItem("routeCollapsedGroups", JSON.stringify(collapsedGroups));
      completedTable.style.display = newCollapsed ? "none" : "";
      const iconSpan = completedHeader.querySelector("span");
      if(iconSpan){
        iconSpan.textContent = newCollapsed ? "▶" : "▼";
      }
    };
    
    completedContainer.appendChild(completedHeader);
    completedContainer.appendChild(completedTable);
    
    // Рендерим выполненные операции
    for(const op of completedOps){
      const c = completion(op);
      const tr = document.createElement("tr");
      tr.draggable = true;
      tr.dataset.opId = op.id;
      tr.style.cursor = "move";
      tr.style.background = "rgba(46,204,113,.08)";
      
      // Функция форматирования направлений для отображения
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
        
        return `<div style="font-size:11px" title="${parsed.join(', ')}">${display}</div>`;
      };
      
      const inputSources = op.input_sources || null;
      const outputTargets = op.output_targets || null;
      const inputCritical = op.input_critical || 0;
      const outputCritical = op.output_critical || 0;
      
      tr.innerHTML = `
        <td class="editable mono" data-field="no" data-type="number">${op.no||""}</td>
        <td class="mono">${esc(op.order_id)}</td>
        <td class="editable" data-field="date" data-type="date">${formatDate(op.date)}</td>
        <td class="editable" data-field="time" data-type="text">${esc(op.time||"")}</td>
        <td class="editable" data-field="input_sources" data-type="select-source" style="font-size:11px;cursor:pointer" title="Откуда поступает материал (клик для редактирования)">
          ${formatSources(inputSources, true)}${inputCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : ''}
        </td>
        <td class="editable" data-field="machine" data-type="select-machine">${esc(op.machine||"")}</td>
        <td class="editable" data-field="output_targets" data-type="select-target" style="font-size:11px;cursor:pointer" title="Куда уходит материал (клик для редактирования)">
          ${formatSources(outputTargets, false)}${outputCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : ''}
        </td>
        <td class="editable" data-field="operator" data-type="select-operator">${esc(op.operator||"")}</td>
        <td class="editable" data-field="name" data-type="text">${esc(op.name||"")}</td>
        <td class="editable" data-field="plan" data-type="number">${op.plan||0}</td>
        <td class="editable" data-field="fact" data-type="number">${op.fact||0}</td>
        <td class="editable" data-field="scrap" data-type="number">${op.scrap||0}</td>
        <td><span class="pill ok" style="${c>1?"background:rgba(0,207,181,.2);border-color:rgba(0,207,181,.5);font-weight:900":""}">${Math.round(c*100)}%</span></td>
        <td class="editable" data-field="status" data-type="select-status">${pillStatus(op)}</td>
        <td style="white-space:nowrap;font-size:11px">
          ${op.setup_duration > 0 ? `<span style="color:var(--warn);font-weight:700">🔧 ${formatDuration(op.setup_duration)}</span>` : '—'}
          ${op.planned_setup_time > 0 ? `<div style="font-size:9px;color:var(--muted);margin-top:2px">План: ${formatDuration(op.planned_setup_time)}</div>` : ''}
        </td>
        <td style="white-space:nowrap;font-size:11px">
          ${op.total_duration > 0 ? `<span style="color:var(--accent);font-weight:700">⚙️ ${formatDuration(op.total_duration)}</span>` : '—'}
          ${op.planned_duration > 0 ? `<div style="font-size:9px;color:var(--muted);margin-top:2px">План: ${formatDuration(op.planned_duration)}</div>` : ''}
        </td>
        <td class="row" style="gap:6px">
          <button class="btn ghost" data-a="dup" title="Дублировать операцию">📋</button>
          <button class="btn ghost danger" data-a="del" title="Удалить">×</button>
        </td>
      `;
      
      // Inline editing for all editable cells
      tr.querySelectorAll('.editable').forEach(td=>{
        td.onclick = ()=> makeEditable(td, op, td.dataset.field, td.dataset.type);
      });
      
      tr.querySelector('[data-a="dup"]').onclick = async ()=>{
        if(!confirm("Дублировать эту операцию?")) return;
        
        const orderOps = state.ops.filter(o => o.order_id === op.order_id);
        const maxNo = orderOps.length > 0 ? Math.max(...orderOps.map(o => +o.no || 0)) : 0;
        const nextNo = maxNo + 1;
        
        const newOp = {
          id: uid(),
          order_id: op.order_id,
          no: nextNo,
          date: op.date || todayISO(),
          time: op.time || "",
          machine: op.machine || "",
          operator: op.operator || "",
          name: op.name || "",
          plan: op.plan || 0,
          fact: 0,
          scrap: 0,
          status: "Запланировано",
          dep: op.dep || 0,
          planned_duration: op.planned_duration || 0,
          planned_setup_time: op.planned_setup_time || 0,
          auxiliary_units: 0
        };
        
        try{
          await api("/api/ops", { method:"POST", body: JSON.stringify(newOp) });
          await refreshAll(false);
          toast("Операция продублирована как №" + nextNo);
        }catch(e){
          alert("Ошибка дублирования: " + e.message);
        }
      };
      
      tr.querySelector('[data-a="del"]').onclick = async ()=>{
        if(!confirm("Удалить операцию?")) return;
        await api("/api/ops/"+encodeURIComponent(op.id), { method:"DELETE" });
        await refreshAll(false);
        // Обновляем отображение операций
        if (typeof window.renderOps === 'function') {
          await window.renderOps();
        } else if (typeof renderOps === 'function') {
          renderOps();
        }
        if (typeof renderTimeAnalysis === 'function') {
          renderTimeAnalysis();
        }
        toast("Операция удалена");
      };
      
      // Drag and Drop
      let draggedElement = null;
      tr.ondragstart = (e) => {
        draggedElement = tr;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/html", tr.outerHTML);
        tr.style.opacity = "0.5";
      };
      
      tr.ondragend = () => {
        tr.style.opacity = "1";
        draggedElement = null;
      };
      
      tr.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if(draggedElement && draggedElement !== tr){
          const rect = tr.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          if(e.clientY < midpoint){
            tr.style.borderTop = "3px solid var(--accent)";
            tr.style.borderBottom = "none";
          } else {
            tr.style.borderBottom = "3px solid var(--accent)";
            tr.style.borderTop = "none";
          }
        }
      };
      
      tr.ondragleave = () => {
        tr.style.borderTop = "none";
        tr.style.borderBottom = "none";
      };
      
      tr.ondrop = (e) => {
        e.preventDefault();
        tr.style.borderTop = "none";
        tr.style.borderBottom = "none";
        
        if(draggedElement && draggedElement !== tr){
          const draggedOpId = draggedElement.dataset.opId;
          const targetOpId = tr.dataset.opId;
          
          const swaps = JSON.parse(localStorage.getItem("opsSwaps") || "[]");
          const rect = tr.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          
          const insertBefore = e.clientY < midpoint;
          swaps.push({
            dragged: draggedOpId,
            target: targetOpId,
            before: insertBefore,
            timestamp: Date.now()
          });
          
          if(swaps.length > 100) swaps.shift();
          
          localStorage.setItem("opsSwaps", JSON.stringify(swaps));
          renderOps();
          toast("Порядок изменен");
        }
      };
      
      completedTbody.appendChild(tr);
    }
    
    // Добавляем контейнер после карточки с основной таблицей
    const routeCard = $("routeCard");
    if(routeCard){
      const existingCompleted = document.getElementById("completedOpsContainer");
      if(existingCompleted){
        existingCompleted.remove();
      }
      routeCard.parentElement.appendChild(completedContainer);
    }
  } else {
    // Удаляем контейнер, если выполненных операций нет
    const existingCompleted = document.getElementById("completedOpsContainer");
    if(existingCompleted){
      existingCompleted.remove();
    }
  }
  
  // Функция для просмотра полного раскроя
  window.viewCuttingLayoutForOp = async function(layoutId, op) {
    if (!layoutId) {
      toast("Раскрой не найден");
      return;
    }
    
    // Если layout_svg не загружен, загружаем его из API
    let layoutSvg = op.layout_svg;
    let layoutData = op.layout_data_json ? 
      (typeof op.layout_data_json === 'string' ? JSON.parse(op.layout_data_json) : op.layout_data_json) : {};
    let materialName = op.material_name;
    let sheetWidth = op.sheet_width_mm;
    let sheetLength = op.sheet_length_mm;
    let boxWidth = op.box_width_mm;
    let boxLength = op.box_length_mm;
    let piecesCount = op.pieces_count;
    let wastePercent = op.waste_percent;
    let wasteWidth = op.waste_width_mm || 0;
    let wasteLength = op.waste_length_mm || 0;
    let wasteArea = op.waste_area_mm2 || 0;
    let thicknessMm = op.thickness_mm;
    
    // Если layout_svg не загружен, загружаем из API
    if (!layoutSvg && layoutId) {
      try {
        const apiFunc = window.api || api;
        // Пробуем загрузить по order_id или order_item_id
        const layouts = await apiFunc(`/api/cutting/layouts?order_id=${encodeURIComponent(op.order_id || '')}`);
        const layout = Array.isArray(layouts) ? layouts.find(l => l.id === layoutId) : null;
        
        if (!layout && op.order_item_id) {
          // Пробуем загрузить по order_item_id
          const layoutsByItem = await apiFunc(`/api/cutting/layouts?order_id=${encodeURIComponent(op.order_id || '')}`);
          const layoutByItem = Array.isArray(layoutsByItem) ? layoutsByItem.find(l => l.order_item_id === op.order_item_id) : null;
          if (layoutByItem) {
            layoutSvg = layoutByItem.layout_svg;
            materialName = layoutByItem.material_name;
            sheetWidth = layoutByItem.sheet_width_mm;
            sheetLength = layoutByItem.sheet_length_mm;
            boxWidth = layoutByItem.box_width_mm;
            boxLength = layoutByItem.box_length_mm;
            piecesCount = layoutByItem.pieces_count;
            wastePercent = layoutByItem.waste_percent;
            wasteWidth = layoutByItem.waste_width_mm || 0;
            wasteLength = layoutByItem.waste_length_mm || 0;
            wasteArea = layoutByItem.waste_area_mm2 || 0;
            thicknessMm = layoutByItem.thickness_mm;
            if (layoutByItem.layout_data_json) {
              layoutData = typeof layoutByItem.layout_data_json === 'string' ? 
                JSON.parse(layoutByItem.layout_data_json) : layoutByItem.layout_data_json;
            }
          }
        } else if (layout) {
          layoutSvg = layout.layout_svg;
          materialName = layout.material_name;
          sheetWidth = layout.sheet_width_mm;
          sheetLength = layout.sheet_length_mm;
          boxWidth = layout.box_width_mm;
          boxLength = layout.box_length_mm;
          piecesCount = layout.pieces_count;
          wastePercent = layout.waste_percent;
          wasteWidth = layout.waste_width_mm || 0;
          wasteLength = layout.waste_length_mm || 0;
          wasteArea = layout.waste_area_mm2 || 0;
          thicknessMm = layout.thickness_mm;
          if (layout.layout_data_json) {
            layoutData = typeof layout.layout_data_json === 'string' ? 
              JSON.parse(layout.layout_data_json) : layout.layout_data_json;
          }
        }
      } catch (e) {
        console.error("Ошибка загрузки раскроя:", e);
      }
    }
    
    if (!layoutSvg) {
      toast("Раскрой не найден или не загружен");
      return;
    }
    
    // Открываем модальное окно с полным раскроем
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:95vw;max-height:95vh;width:1200px;overflow:auto">
        <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0;font-size:18px">✂️ Просмотр раскроя</h2>
          <button class="btn ghost" data-action="close" style="padding:6px 12px;font-size:14px">×</button>
        </div>
        <div class="modal-body" style="padding:20px">
          <div style="margin-bottom:20px;font-size:14px;line-height:1.8">
            <div><b>Операция:</b> ${esc(op.name || '')}</div>
            <div><b>Материал:</b> ${esc(materialName || layoutData.materialName || 'Неизвестно')}</div>
            <div><b>Лист:</b> ${sheetWidth || layoutData.sheetWidth || 0}×${sheetLength || layoutData.sheetLength || 0}мм</div>
            <div><b>Заготовка:</b> ${boxWidth || layoutData.pieceWidth || 0}×${boxLength || layoutData.pieceLength || 0}мм${layoutData.rotated ? ' (повернуто на 90°)' : ''}</div>
            <div><b>Заготовок:</b> ${piecesCount || 0} | <b>Отходы:</b> ${wastePercent || 0}%</div>
            ${(wasteWidth > 0 || wasteLength > 0) ? `
            <div><b>Размеры отходов:</b> ${wasteWidth > 0 ? `${wasteWidth.toFixed(1)}×${sheetLength || 0}мм` : ''}${wasteWidth > 0 && wasteLength > 0 ? ' + ' : ''}${wasteLength > 0 ? `${sheetWidth || 0}×${wasteLength.toFixed(1)}мм` : ''}${wasteArea > 0 ? ` (${(wasteArea / 1000000).toFixed(2)} м²)` : ''}</div>
            ` : ''}
            <div><b>Толщина:</b> ${thicknessMm || layoutData.thickness || 0}мм</div>
          </div>
          <div style="border:2px solid var(--border);border-radius:8px;padding:30px;background:#fff;overflow:auto;text-align:center;box-sizing:border-box">
            <div style="display:inline-block;max-width:100%;padding:0">
              ${layoutSvg}
            </div>
          </div>
        </div>
        <div class="modal-footer" style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end">
          <button class="btn ghost" data-action="close">Закрыть</button>
          <button class="btn primary" data-action="print" title="Печать раскроя">🖨️ Печать</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Обработчики
    modal.querySelector('[data-action="close"]').onclick = () => {
      document.body.removeChild(modal);
    };
    
    modal.querySelector('[data-action="print"]').onclick = () => {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Печать раскроя</title>
            <style>
              @media print {
                @page { margin: 10mm; size: A4 landscape; }
                body { margin: 0; padding: 0; }
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                padding: 20px;
                font-size: 12px;
              }
              .header {
                margin-bottom: 15px;
                padding: 10px;
                background: #f5f5f5;
                border-radius: 4px;
              }
              .header h2 {
                margin: 0 0 8px 0;
                font-size: 16px;
              }
              .info {
                font-size: 11px;
                color: #666;
                line-height: 1.6;
              }
              .svg-container {
                border: 2px solid #000;
                padding: 30px;
                background: #fff;
                text-align: center;
                page-break-inside: avoid;
                box-sizing: border-box;
              }
              .svg-container svg {
                max-width: 100%;
                height: auto;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>✂️ Раскрой материала</h2>
              <div class="info">
                <b>Операция:</b> ${esc(op.name || '')}<br>
                <b>Материал:</b> ${esc(op.material_name || layoutData.materialName || 'Неизвестно')} | 
                <b>Лист:</b> ${op.sheet_width_mm || layoutData.sheetWidth || 0}×${op.sheet_length_mm || layoutData.sheetLength || 0}мм<br>
                <b>Заготовка:</b> ${op.box_width_mm || layoutData.pieceWidth || 0}×${op.box_length_mm || layoutData.pieceLength || 0}мм | 
                <b>Заготовок:</b> ${op.pieces_count || 0} | <b>Отходы:</b> ${op.waste_percent || 0}%
              </div>
            </div>
            <div class="svg-container">
              ${op.layout_svg}
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
    };
    
    // Закрытие по клику вне модального окна
    modal.onclick = (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    };
  };
  
  // Update sort indicator and badge
  const sortIndicator = $("sortIndicator");
  const routeBadge = $("routeBadge");
  
  if(sortIndicator){
    const sortNames = {
      "order": "📋 Сортировка: По заказу и №",
      "client": "👥 Сортировка: По клиенту",
      "date": "📅 Сортировка: По дате",
      "operator": "👤 Сортировка: По оператору",
      "machine": "🛠️ Сортировка: По машине",
      "status": "✅ Сортировка: По статусу"
    };
    let indicatorText = sortNames[sortBy] || "";
    
    // Add date filter info
    if(fDateMode === "selected" && fDate){
      indicatorText += " • Дата: " + formatDate(fDate);
    }
    
    // Add count (только невыполненные операции в основной таблице)
    const incompleteCount = ops.filter(op => completion(op) < 1).length;
    indicatorText += ` • Показано: ${incompleteCount} оп.`;
    
    sortIndicator.textContent = indicatorText;
    sortIndicator.style.color = (sortBy !== "order" || (fDateMode === "selected" && fDate)) ? "var(--accent)" : "var(--muted)";
  }
  
  // Update badge in title
  if(routeBadge){
    if(fDateMode === "selected" && fDate){
      routeBadge.innerHTML = `<span class="pill" style="background:rgba(0,207,181,.15);border-color:rgba(0,207,181,.4);margin-left:8px">📅 ${formatDate(fDate)}</span>`;
    } else {
      routeBadge.innerHTML = "";
    }
  }
  
  // Запускаем обновление таймеров
  updateTimers();
  
  // Восстанавливаем ширину столбцов ПОСЛЕ рендеринга таблицы
  // Используем reinitResizableTables для правильного восстановления
  setTimeout(async () => {
    if (typeof reinitResizableTables === 'function') {
      console.log("🔄 Восстановление ширин после renderOps...");
      await reinitResizableTables(document.querySelector('#routing.pane') || document);
    }
  }, 200);
  
  // Загружаем миниатюры файлов для операций
  loadOpFileThumbnails();
}

// Загрузка миниатюр файлов для операций
async function loadOpFileThumbnails(){
  const owner = window.currentUser;
  const cells = document.querySelectorAll('.op-files-cell[data-op-id]');
  for(const cell of cells){
    const opId = cell.dataset.opId;
    if(!opId || !cell.isConnected || owner !== window.currentUser) continue;
    try {
      const data = await api("/api/ops/"+encodeURIComponent(opId)+"/files");
      const files = data.files || [];
      // Находим первое изображение
      const isImage = name => window.PagesClient?.enabled ? /\.(png|jpe?g|gif|webp|bmp)$/i.test(name || "") : /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(name || "");
      const imageFile = files.find(f => isImage(f.filename));
      
      if (owner !== window.currentUser || !cell.isConnected) return;
      if(imageFile){
        const imageURL = window.PagesClient?.enabled && imageFile.url?.startsWith('/uploads/') ? await window.PagesClient.privateUrl(imageFile.url) : imageFile.url;
        if (owner !== window.currentUser || !cell.isConnected) return;
        const thumbDiv = cell.querySelector('.op-file-thumb');
        if(thumbDiv){
          thumbDiv.style.display = 'block';
          thumbDiv.innerHTML = `
            <div style="display:inline-block;cursor:pointer;border:1px solid var(--border);border-radius:4px;padding:2px;background:#fff" 
                 title="Просмотр файла (${esc(imageFile.filename)})">
              <div style="width:60px;height:40px;overflow:hidden;border-radius:2px;background:#f8f9fa;display:flex;align-items:center;justify-content:center">
                <img src="${esc(imageURL)}" alt="${esc(imageFile.filename)}" style="max-width:60px;max-height:40px;object-fit:contain">
              </div>
              <div style="font-size:9px;text-align:center;color:var(--muted);margin-top:2px">${files.length > 1 ? files.length + ' файлов' : '1 файл'}</div>
            </div>
          `;
          // Клик на миниатюре открывает модалку файлов
          thumbDiv.onclick = () => {
            const op = state.ops?.find(o => o.id === opId);
            if(op && typeof window.openOpFilesModal === 'function'){
              window.openOpFilesModal(op);
            }
          };
        }
      } else if(files.length > 0){
        // Есть файлы, но не изображения - показываем иконку
        const thumbDiv = cell.querySelector('.op-file-thumb');
        if(thumbDiv){
          thumbDiv.style.display = 'block';
          thumbDiv.innerHTML = `
            <div style="display:inline-block;cursor:pointer;border:1px solid var(--border);border-radius:4px;padding:2px;background:#fff" 
                 title="Файлы (${files.length})">
              <div style="width:60px;height:40px;overflow:hidden;border-radius:2px;background:#f8f9fa;display:flex;align-items:center;justify-content:center;font-size:20px">
                📄
              </div>
              <div style="font-size:9px;text-align:center;color:var(--muted);margin-top:2px">${files.length} ${files.length === 1 ? 'файл' : 'файлов'}</div>
            </div>
          `;
          thumbDiv.onclick = () => {
            const op = state.ops?.find(o => o.id === opId);
            if(op && typeof window.openOpFilesModal === 'function'){
              window.openOpFilesModal(op);
            }
          };
        }
      }
    } catch(e){
      // Игнорируем ошибки загрузки файлов
      console.warn("Не удалось загрузить файлы для операции", opId, e);
    }
  }
  
}

// Кеш для таймеров, чтобы не искать их каждый раз
let timerCache = {
  timers: null,
  setupTimers: null,
  lastUpdate: 0
};

// Обновление таймеров в реальном времени и проверка превышения времени
function updateTimers(){
  // Используем requestAnimationFrame для более плавного обновления
  if(!timerCache.timers || Date.now() - timerCache.lastUpdate > 2000){
    // Обновляем кеш каждые 2 секунды
    timerCache.timers = Array.from(document.querySelectorAll('[data-timer]'));
    timerCache.setupTimers = Array.from(document.querySelectorAll('[data-setup-timer]'));
    timerCache.lastUpdate = Date.now();
  }
  
  const now = Date.now();
  
  // Обновляем таймеры основной работы (обратный отсчёт)
  for(const timer of timerCache.timers){
    // Проверяем, что элемент всё ещё в DOM
    if(!timer.isConnected) continue;
    
    const opId = timer.dataset.timer;
    const startedAt = timer.dataset.startedAt; // ISO строка из базы данных
    const plannedDuration = parseInt(timer.dataset.planned) || 0;
    const previousWorkTime = parseInt(timer.dataset.previous) || 0;
    
    const displayEl = timer.querySelector('.production-timer-display');
    const completionTimeEl = timer.querySelector('.completion-time-display');
    
    // Получаем актуальные данные операции из state для более точного расчета
    const op = state.ops.find(o => o.id === opId);
    let actualStartedAt = startedAt;
    let actualPreviousWorkTime = previousWorkTime;
    
    // Если есть актуальные данные операции, используем их
    if(op){
      if(op.started_at){
        actualStartedAt = op.started_at;
      }
      if(op.total_duration !== undefined){
        actualPreviousWorkTime = op.total_duration || 0;
      }
    }
    
    if(actualStartedAt && displayEl){
      // Используем дату из базы данных для точного расчета времени
      const workStartTime = new Date(actualStartedAt).getTime();
      // Таймер уже начался - обновляем обратный отсчёт на основе реального времени
      const currentWorkElapsed = Math.floor((now - workStartTime) / 1000);
      const totalWorkElapsed = actualPreviousWorkTime + currentWorkElapsed;
      let productionRemaining = plannedDuration - totalWorkElapsed;
      let productionOverdue = 0;
      
      // Формируем отображаемое время
      let displayTime;
      if(plannedDuration > 0){
        if(productionRemaining <= 0){
          // Время просрочено - показываем нарастающее просроченное время
          productionOverdue = Math.abs(productionRemaining);
          productionRemaining = 0;
          // Продолжаем отсчет просроченного времени (оно нарастает)
          displayTime = `-${formatDuration(productionOverdue)}`;
        } else {
          // Показываем оставшееся время
          displayTime = formatDuration(productionRemaining);
        }
      } else {
        // Нет плана - показываем прошедшее время
        displayTime = formatDuration(totalWorkElapsed);
      }
      
      // Обновляем только если изменилось
      if(displayEl.textContent !== displayTime){
        displayEl.textContent = displayTime;
      }
      
      // Обновляем время окончания тиража
      if(completionTimeEl && plannedDuration > 0){
        const completionTime = new Date(workStartTime + (plannedDuration * 1000));
        const completionTimeStr = completionTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        if(completionTimeEl.textContent !== completionTimeStr){
          completionTimeEl.textContent = completionTimeStr;
        }
      }
      
      // Моргание при приближении к концу времени (обновляем стили только при изменении состояния)
      if(plannedDuration > 0){
        const remainingPercent = productionRemaining > 0 ? (productionRemaining / plannedDuration) * 100 : 0;
        const currentState = timer.dataset.timerState || 'normal';
        let newState = 'normal';
        
        if(productionRemaining <= 0 && productionOverdue > 0){
          newState = 'critical';
        } else if(remainingPercent <= 20 && remainingPercent > 0){
          newState = 'warning';
        }
        
        // Обновляем стили только если состояние изменилось
        if(currentState !== newState){
          timer.dataset.timerState = newState;
          
          if(newState === 'critical'){
            timer.style.background = 'rgba(255,77,77,.2)';
            timer.style.borderColor = 'var(--bad)';
            displayEl.style.color = 'var(--bad)';
            displayEl.classList.add('blink');
          } else if(newState === 'warning'){
            timer.style.background = 'rgba(255,176,32,.2)';
            timer.style.borderColor = 'var(--warn)';
            displayEl.style.color = 'var(--warn)';
            displayEl.classList.add('blink');
          } else {
            timer.style.background = 'rgba(0,207,181,.1)';
            timer.style.borderColor = 'rgba(0,207,181,.4)';
            displayEl.style.color = 'var(--accent)';
            displayEl.classList.remove('blink');
          }
        }
      }
    } else if(displayEl && plannedDuration > 0){
      // started_at ещё не установлен, но есть плановое время - показываем его
      const plannedText = formatDuration(plannedDuration);
      if(displayEl.textContent !== plannedText){
        displayEl.textContent = plannedText;
      }
    } else {
      // Старый формат таймера (для совместимости)
      const startTime = parseInt(timer.dataset.start);
    if(startTime){
      const elapsed = Math.floor((now - startTime) / 1000);
        const newText = `⏱️ ${formatDuration(elapsed)}`;
        if(timer.textContent !== newText){
          timer.textContent = newText;
        }
      
        // Проверка превышения планового времени (только для уведомлений, не каждый раз)
      if(plannedDuration > 0 && elapsed > plannedDuration){
        const overtime = elapsed - plannedDuration;
        const overtimePercent = Math.round((overtime / plannedDuration) * 100);
        
        // Находим операцию для получения деталей
        const op = state.ops.find(o => o.id === opId);
        if(op){
          // Критическое превышение (>50%)
          if(overtimePercent > 50){
            timer.style.color = 'var(--bad)';
            timer.style.fontWeight = '900';
            
            // Показываем уведомление раз в 5 минут
              if(overtime % 300 < 5 && !timer.dataset.notifiedCritical){
                timer.dataset.notifiedCritical = 'true';
              showNotification(
                'Критическое превышение времени!',
                `Операция "${op.name}" (${op.order_id}) превышает план на ${overtimePercent}% (+${formatDuration(overtime)})`,
                'danger',
                15000
              );
            }
          }
          // Предупреждение (>20%)
          else if(overtimePercent > 20){
            timer.style.color = 'var(--warn)';
            timer.style.fontWeight = '800';
            
            // Показываем уведомление раз в 10 минут
              if(overtime % 600 < 5 && !timer.dataset.notifiedWarning){
                timer.dataset.notifiedWarning = 'true';
              showNotification(
                'Превышение планового времени',
                `Операция "${op.name}" (${op.order_id}) превышает план на ${overtimePercent}%`,
                'warning',
                10000
              );
              }
            }
          }
        }
      }
    }
  }
  
  // Обновляем таймеры наладки (обратный отсчёт)
  for(const setupTimer of timerCache.setupTimers){
    // Проверяем, что элемент всё ещё в DOM
    if(!setupTimer.isConnected) continue;
    
    const opId = setupTimer.dataset.setupTimer;
    const setupStartedAt = setupTimer.dataset.setupStartedAt; // ISO строка из базы данных
    const plannedSetupTime = parseInt(setupTimer.dataset.planned) || 0;
    const previousSetupTime = parseInt(setupTimer.dataset.previous) || 0;
    
    const displayEl = setupTimer.querySelector('.setup-timer-display');
    
    // Получаем актуальные данные операции из state
    const op = state.ops.find(o => o.id === opId);
    
    // Используем вычисленное время с сервера (current_setup_duration) - время вычисляется только на сервере
    let totalSetupElapsed = 0;
    if(op && op.current_setup_duration !== undefined){
      // Время вычисляется на сервере - используем его значение
      totalSetupElapsed = op.current_setup_duration;
    } else if(op && op.setup_duration !== undefined){
      // Если current_setup_duration не доступен, используем сохраненное время
      totalSetupElapsed = op.setup_duration || 0;
    }
    
    if(setupStartedAt && displayEl){
      let setupRemaining = plannedSetupTime - totalSetupElapsed;
      let setupOverdue = 0;
      
      // Формируем отображаемое время
      let displayTime;
      if(plannedSetupTime > 0){
        if(setupRemaining <= 0){
          // Время просрочено - показываем нарастающее просроченное время
          setupOverdue = Math.abs(setupRemaining);
          setupRemaining = 0;
          // Продолжаем отсчет просроченного времени (оно нарастает)
          displayTime = `-${formatDuration(setupOverdue)}`;
        } else {
          // Показываем оставшееся время
          displayTime = formatDuration(setupRemaining);
        }
      } else {
        // Нет плана - показываем прошедшее время
        displayTime = formatDuration(totalSetupElapsed);
      }
      
      // Обновляем только если изменилось
      if(displayEl.textContent !== displayTime){
        displayEl.textContent = displayTime;
      }
      
      // Обновляем информацию о потраченном времени
      const spentEl = setupTimer.querySelector('[data-spent-time]');
      if(spentEl){
        const spentText = `Потрачено: ${formatDuration(totalSetupElapsed)}`;
        if(spentEl.textContent !== spentText){
          spentEl.textContent = spentText;
        }
      }
      
      // Обновляем информацию о просрочке
      const overdueEl = setupTimer.querySelector('[data-overdue-time]');
      if(overdueEl){
        if(setupOverdue > 0){
          const overdueText = `⏰ Время вышло! Просрочено: ${formatDuration(setupOverdue)}`;
          if(overdueEl.textContent !== overdueText){
            overdueEl.textContent = overdueText;
          }
          if(overdueEl.style.display !== 'block'){
            overdueEl.style.display = 'block';
          }
        } else {
          if(overdueEl.style.display !== 'none'){
            overdueEl.style.display = 'none';
          }
        }
      }
      
      // Моргание при приближении к концу времени (обновляем стили только при изменении состояния)
      if(plannedSetupTime > 0){
        const remainingPercent = setupRemaining > 0 ? (setupRemaining / plannedSetupTime) * 100 : 0;
        const currentState = setupTimer.dataset.setupTimerState || 'normal';
        let newState = 'normal';
        
        if(setupRemaining <= 0 && setupOverdue > 0){
          newState = 'critical';
        } else if(remainingPercent <= 20 && remainingPercent > 0){
          newState = 'warning';
        }
        
        // Обновляем стили только если состояние изменилось
        if(currentState !== newState){
          setupTimer.dataset.setupTimerState = newState;
          
          if(newState === 'critical'){
            setupTimer.style.background = 'rgba(255,77,77,.2)';
            setupTimer.style.borderColor = 'var(--bad)';
            displayEl.style.color = 'var(--bad)';
            displayEl.classList.add('blink');
          } else if(newState === 'warning'){
            setupTimer.style.background = 'rgba(255,176,32,.2)';
            setupTimer.style.borderColor = 'var(--warn)';
            displayEl.style.color = 'var(--warn)';
            displayEl.classList.add('blink');
          } else {
            setupTimer.style.background = 'rgba(255,176,32,.1)';
            setupTimer.style.borderColor = 'rgba(255,176,32,.4)';
            displayEl.style.color = 'var(--warn)';
            displayEl.classList.remove('blink');
          }
        }
      } else if(plannedSetupTime > 0){
        // Есть план, но setup_started_at ещё не установлен - показываем плановое время
        const plannedText = formatDuration(plannedSetupTime);
        if(displayEl.textContent !== plannedText){
          displayEl.textContent = plannedText;
        }
      }
    } else if(displayEl && plannedSetupTime > 0){
      // setup_started_at ещё не установлен, но есть плановое время - показываем его
      const plannedText = formatDuration(plannedSetupTime);
      if(displayEl.textContent !== plannedText){
        displayEl.textContent = plannedText;
      }
    }
  }
  
  // Обновляем фактическое время наладки и работы в карточках операций
  // Используем вычисленные значения с сервера (current_setup_duration, current_work_duration)
  document.querySelectorAll('.actual-setup-time-container').forEach(container => {
    const opId = container.dataset.opId;
    const op = state.ops.find(o => o.id === opId);
    if(!op) return;
    
    const actualTimeEl = container.querySelector('.actual-setup-time');
    if(!actualTimeEl) return;
    
    // Используем вычисленное время с сервера
    let totalSetupElapsed = 0;
    if(op.current_setup_duration !== undefined){
      totalSetupElapsed = op.current_setup_duration;
    } else if(op.setup_duration > 0){
      totalSetupElapsed = op.setup_duration;
    }
    
    if(totalSetupElapsed > 0 || op.status === "Наладка"){
      const newText = totalSetupElapsed > 0 ? formatDuration(totalSetupElapsed) : 'Идёт отсчёт...';
      if(actualTimeEl.textContent !== newText){
        actualTimeEl.textContent = newText;
      }
    }
  });
  
  document.querySelectorAll('.actual-work-time-container').forEach(container => {
    const opId = container.dataset.opId;
    const op = state.ops.find(o => o.id === opId);
    if(!op) return;
    
    const actualTimeEl = container.querySelector('.actual-work-time');
    if(!actualTimeEl) return;
    
    // Используем вычисленное время с сервера
    let totalWorkElapsed = 0;
    if(op.current_work_duration !== undefined){
      totalWorkElapsed = op.current_work_duration;
    } else if(op.total_duration > 0){
      totalWorkElapsed = op.total_duration;
    }
    
    if(totalWorkElapsed > 0 || op.status === "В работе"){
      const newText = totalWorkElapsed > 0 ? formatDuration(totalWorkElapsed) : 'Идёт отсчёт...';
      if(actualTimeEl.textContent !== newText){
        actualTimeEl.textContent = newText;
      }
    }
  });
}

// Запускаем обновление таймеров каждую секунду (только один раз)
let timerInterval = null;
if(!timerInterval){
  timerInterval = setInterval(updateTimers, 1000);
}

// Обновляем таймеры при возврате на вкладку (когда браузер приостанавливал выполнение)
document.addEventListener('visibilitychange', () => {
  if(!document.hidden){
    // Вкладка стала видимой - обновляем таймеры сразу
    updateTimers();
  }
});

// Также обновляем таймеры при фокусе на окне
window.addEventListener('focus', () => {
  updateTimers();
});

function myOps(){
  const name = $("my_op").value;
  const dt = $("my_date").value||todayISO();
  const only = $("my_only").value==="yes";
  const status = $("my_status").value;
  const fOrder = $("my_order") ? $("my_order").value : "(все)";
  const sortBy = $("my_sort") ? $("my_sort").value : "machine";
  
  const filtered = state.ops.filter(op=>{
    if(op.operator !== name) return false;
    if(only && (op.date||"") !== dt) return false;
    if(status !== "all" && (op.status||"Запланировано") !== status) return false;
    if(fOrder && fOrder !== "(все)" && op.order_id !== fOrder) return false;
    return true;
  });
  
  // Применяем сортировку
  return filtered.sort((a,b)=>{
    if(sortBy === "order"){
      // Сортировка по заказу, затем по номеру операции
      const orderComp = (a.order_id||"").localeCompare(b.order_id||"");
      if(orderComp !== 0) return orderComp;
      return (+a.no||0) - (+b.no||0);
    } else if(sortBy === "date"){
      // Сортировка по дате, затем по времени
      const dateComp = (a.date||"").localeCompare(b.date||"");
      if(dateComp !== 0) return dateComp;
      const timeComp = (a.time||"").localeCompare(b.time||"");
      if(timeComp !== 0) return timeComp;
      return (a.order_id||"").localeCompare(b.order_id||"") || (+a.no||0) - (+b.no||0);
    } else {
      // По умолчанию - по машине (как было раньше)
      const machComp = (a.machine||"").localeCompare(b.machine||"");
      if(machComp !== 0) return machComp;
      return (+a.no||0) - (+b.no||0) || (a.time||"").localeCompare(b.time||"");
    }
  });
}

  // Добавляем восстановление ширины столбцов после рендеринга
  const originalRenderOps = renderOps;
  window.renderOps = async function() {
    originalRenderOps();
    
    // Восстанавливаем ширину столбцов ПОСЛЕ рендеринга
    setTimeout(async () => {
      const opsTable = $("opsT");
      if (opsTable && typeof restoreColumnWidths === 'function') {
        const table = opsTable.closest('table') || opsTable;
        if (table && table.querySelector('thead')) {
          await restoreColumnWidths(table);
        }
      }
      
      // Также для таблицы выполненных операций, если она есть
      const completedTable = document.querySelector('#completedOpsT')?.closest('table');
      if (completedTable && typeof restoreColumnWidths === 'function') {
        await restoreColumnWidths(completedTable);
      }
      
      // Инициализируем менеджер колонок для таблицы маршрутов
      if (typeof window.initRoutingColumnManager === 'function') {
        setTimeout(() => {
          window.initRoutingColumnManager();
          console.log('[ROUTING] Менеджер колонок инициализирован после renderOps');
        }, 500);
      }
    }, 150);
  };
  
  // Expose functions globally
  window.makeEditable = makeEditable;
  window.renderTimeAnalysis = renderTimeAnalysis;
  
  // Module export
  window.RoutingModule = {
    loaded: true,
    updateOp,
    makeEditable,
    renderTimeAnalysis,
    renderOps
  };
  
  console.log('Routing module loaded successfully');
  
  // Auto-render if on routing pane
  if(document.querySelector('#routing.pane')?.style.display !== 'none') {
    renderOps();
  }
  
})();

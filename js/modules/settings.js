/**
 * B'BOX Production - Settings Module
 * Модуль настроек (материалы, единицы, шаблоны, профили)
 */

(function() {
  'use strict';
  
  if (window.SettingsModule && window.SettingsModule.loaded) {
    console.log('Settings module already loaded');
    return;
  }
  
  console.log('Loading Settings module...');

// Read-through catalog only; mutation responses are handled once without write retries.
const api = async (path, options = {}) => {
  const owner = window.currentUser;
  const result = options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())
    ? await window.ApiClient.request(path, options)
    : await window.CatalogState.read(path);
  if (owner !== window.currentUser) throw Object.assign(new Error('Сеанс изменился.'), { name: 'AbortError' });
  return result;
};
let templateSelection = 0, profileSelection = 0;
async function init() {
  const owner = window.currentUser;
  const resources = [
    ['materials', '/api/materials'], ['materialTypes', '/api/materials/types'], ['units', '/api/units'],
    ['templates', '/api/templates'], ['productTemplates', '/api/product-templates'],
    ['clientProfiles', '/api/client-profiles'], ['productTypes', '/api/product-types'], ['settings', '/api/settings']
  ];
  const results = await Promise.allSettled(resources.map(async ([key, path]) => {
    let value = await api(path);
    if (key === 'units') value = value?.units || value;
    if (key !== 'settings' && !Array.isArray(value)) throw new Error('Сервер вернул неверный справочник');
    if (key === 'settings' && (!value || ['operators', 'machines', 'operations'].some(name => {
      const rows = value[name + 'Data'] || value[name] || [];
      return !Array.isArray(rows) || rows.some(row => typeof row !== 'string' && (!row || typeof row.name !== 'string'));
    }))) throw new Error('Сервер вернул неверный справочник');
    return value;
  }));
  if (owner !== window.currentUser) return;
  const errors = [];
  results.forEach((result, index) => {
    const key = resources[index][0];
    if (result.status !== 'fulfilled') { errors.push(key); return; }
    if (key !== 'settings') state[key] = result.value;
    else for (const name of ['operators', 'machines', 'operations']) {
      const rows = result.value[name + 'Data'] || result.value[name] || [];
      state[name + 'Data'] = rows.map((row, index) => typeof row === 'string' ? { id: index + 1, name: row } : row);
      state[name] = state[name + 'Data'].map(row => row.name);
    }
  });
  if (errors.length) toast('Не удалось обновить справочники: ' + errors.join(', ') + '. Показаны последние доступные данные этого сеанса.');
}
function lazyDetail(cell, label, load) {
  cell.innerHTML = `<button class="btn ghost" data-catalog-detail>${esc(label)}</button>`;
  cell.querySelector('button').onclick = () => load();
}

function renderMaterialsSettings(){
  const tb = $("materialsT");
  if(!tb) return;
  
  // Сохраняем состояние раскрытых типов перед перерисовкой
  const expandedTypes = new Set();
  if(tb.querySelectorAll){
    // Находим все РАСКРЫТЫЕ группы (те, у которых display не 'none' или не установлен)
    const allGroups = tb.querySelectorAll('.material-type-group');
    allGroups.forEach(group => {
      // Группа раскрыта, если display не равен 'none'
      const isExpanded = group.style.display !== 'none';
      if(isExpanded && group.dataset.typeId){
        expandedTypes.add(group.dataset.typeId);
      }
    });
    // Также проверяем заголовки для определения состояния (дополнительная проверка)
    const headers = tb.querySelectorAll('.material-type-header');
    headers.forEach(header => {
      const toggle = header.querySelector('.type-toggle');
      if(toggle && toggle.textContent === '▼' && header.dataset.typeId){
        expandedTypes.add(header.dataset.typeId);
      }
    });
  }
  
  // Инициализируем изменение размера столбцов после рендеринга
  setTimeout(async () => {
    const materialsTable = tb.closest('table');
    if (materialsTable && typeof reinitResizableTables === 'function'){
      await reinitResizableTables(materialsTable.closest('.pane') || document);
    }
  }, 100);

  // Заполнить селектор типов материалов в форме добавления
  const typeSel = $("new_material_type_id");
  if(typeSel){
    const curVal = typeSel.value || "";
    typeSel.innerHTML = '<option value="">— Без типа —</option>';
    // Отладочная информация
    console.log("[renderMaterialsSettings] state.materialTypes:", state.materialTypes);
    console.log("[renderMaterialsSettings] state.materialTypes является массивом:", Array.isArray(state.materialTypes));
    const types = Array.isArray(state.materialTypes) ? state.materialTypes.slice() : [];
    console.log("[renderMaterialsSettings] Количество типов для селектора:", types.length);
    types.sort((a,b)=>{
      const sortA = Number(a.sort_order || 0);
      const sortB = Number(b.sort_order || 0);
      if(sortA !== sortB) return sortA - sortB;
      return String(a.name||"").localeCompare(String(b.name||""), "ru");
    });
    for(const t of types){
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name || "";
      if(o.value === curVal) o.selected = true;
      typeSel.appendChild(o);
    }
  }

  // Заполнить селектор единиц в форме добавления
  const unitSel = $("new_material_unit");
  if(unitSel){
    const curVal = unitSel.value || "";
    unitSel.innerHTML = '<option value="">—</option>';
    for(const u of (state.units||[])){
      const o = document.createElement("option");
      o.value = u.short_name || u.name || "";
      o.textContent = `${u.name} (${u.short_name||""})`;
      if(o.value === curVal) o.selected = true;
      unitSel.appendChild(o);
    }
  }

  if(!currentUser || currentUser.role !== "admin"){
    tb.innerHTML = `<tr><td colspan="8" style="padding:14px;color:var(--muted)">Только для администратора</td></tr>`;
    return;
  }

  const mats = Array.isArray(state.materials) ? state.materials.slice() : [];
  
  // Сортировка
  const sortBy = state.materialsSortBy || "name";
  const sortDir = state.materialsSortDir || "asc";
  mats.sort((a,b)=>{
    let va = a[sortBy], vb = b[sortBy];
    if(sortBy === "name" || sortBy === "unit"){
      va = String(va||"").toLowerCase();
      vb = String(vb||"").toLowerCase();
      return sortDir === "asc" ? va.localeCompare(vb,"ru") : vb.localeCompare(va,"ru");
    } else {
      va = Number(va||0);
      vb = Number(vb||0);
      return sortDir === "asc" ? va - vb : vb - va;
    }
  });
  
  // Обновить иконки сортировки в заголовках
  const header = $("materialsHeader");
  if(header){
    header.querySelectorAll("th[data-sort]").forEach(th=>{
      const col = th.dataset.sort;
      let txt = th.textContent.replace(/[▲▼]/g,"").trim();
      if(col === sortBy){
        txt += sortDir === "asc" ? " ▲" : " ▼";
      } else {
        txt += " ▲▼";
      }
      th.textContent = txt;
    });
  }
  
  // Группируем материалы по типам
  const types = Array.isArray(state.materialTypes) ? state.materialTypes.slice() : [];
  types.sort((a,b)=>{
    const sortA = Number(a.sort_order || 0);
    const sortB = Number(b.sort_order || 0);
    if(sortA !== sortB) return sortA - sortB;
    return String(a.name||"").localeCompare(String(b.name||""), "ru");
  });
  
  const materialsByType = {};
  const materialsWithoutType = [];
  
  for(const m of mats){
    const typeId = m.material_type_id || null;
    if(typeId){
      if(!materialsByType[typeId]) materialsByType[typeId] = [];
      materialsByType[typeId].push(m);
    } else {
      materialsWithoutType.push(m);
    }
  }
  
  tb.innerHTML = "";
  if(mats.length === 0){
    tb.innerHTML = `<tr><td colspan="9" style="padding:14px;color:var(--muted)">Материалов пока нет. Добавьте выше.</td></tr>`;
    return;
  }

  // Функция для рендеринга строки материала
  const renderMaterialRow = (m) => {
    const tr = document.createElement("tr");
    tr.dataset.id = m.id;
    const types = Array.isArray(state.materialTypes) ? state.materialTypes.slice() : [];
    types.sort((a,b)=>{
      const sortA = Number(a.sort_order || 0);
      const sortB = Number(b.sort_order || 0);
      if(sortA !== sortB) return sortA - sortB;
      return String(a.name||"").localeCompare(String(b.name||""), "ru");
    });
    tr.innerHTML = `
      <td><input type="text" data-f="name" value="${esc(m.name||"")}" style="width:100%;min-width:150px"></td>
      <td>
        <select data-f="material_type_id" style="width:100%;min-width:120px">
          <option value="">— Без типа —</option>
          ${types.map(t=>`<option value="${esc(t.id)}" ${t.id === (m.material_type_id||"") ? "selected":""}>${esc(t.name||"")}</option>`).join("")}
        </select>
      </td>
      <td>
        <select data-f="unit" style="width:100%;min-width:70px">
          <option value="">—</option>
          ${(state.units||[]).map(u=>`<option value="${esc(u.short_name||u.name||"")}" ${(u.short_name||u.name||"") === (m.unit||"") ? "selected":""}>${esc(u.short_name||u.name||"")}</option>`).join("")}
        </select>
      </td>
      <td><input type="number" step="0.1" data-f="length_mm" value="${m.length_mm||0}" style="width:70px"></td>
      <td><input type="number" step="0.1" data-f="width_mm" value="${m.width_mm||0}" style="width:70px"></td>
      <td><input type="number" step="0.01" data-f="thickness_mm" value="${m.thickness_mm||0}" style="width:70px"></td>
      <td><input type="number" step="0.01" data-f="price_per_unit" value="${m.price_per_unit||0}" style="width:70px"></td>
      <td><input type="number" step="0.01" data-f="stock" value="${m.stock||0}" style="width:80px;font-weight:800"></td>
      <td class="row" style="gap:4px;flex-wrap:nowrap;white-space:nowrap">
        <button class="btn ghost" data-a="save" title="Сохранить">💾</button>
        <button class="btn ghost danger" data-a="del" title="Удалить">🗑</button>
      </td>
    `;
    tr.querySelector('[data-a="save"]').onclick = async (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget;
      const row = btn.closest("tr");
      const id = row.dataset.id;
      console.log("Сохранение материала ID:", id);
      const name = row.querySelector('[data-f="name"]').value.trim();
      const material_type_id = (row.querySelector('[data-f="material_type_id"]')?.value || "").trim() || null;
      const unit = row.querySelector('[data-f="unit"]').value.trim();
      const length_mm = parseFloat(row.querySelector('[data-f="length_mm"]').value) || 0;
      const width_mm = parseFloat(row.querySelector('[data-f="width_mm"]').value) || 0;
      const thickness_mm = parseFloat(row.querySelector('[data-f="thickness_mm"]').value) || 0;
      const price_per_unit = parseFloat(row.querySelector('[data-f="price_per_unit"]').value) || 0;
      const stock = parseFloat(row.querySelector('[data-f="stock"]').value) || 0;
      console.log("Данные для сохранения:", { name, material_type_id, unit, length_mm, width_mm, thickness_mm, price_per_unit, stock });
      if(!name){ alert("Название обязательно"); return; }
      btn.disabled = true;
      btn.textContent = "⏳";
      try{
        const result = await api("/api/materials/"+encodeURIComponent(id), {
          method:"PUT",
          body: JSON.stringify({ name, material_type_id, unit, length_mm, width_mm, thickness_mm, price_per_unit, stock })
        });
        console.log("Результат сохранения:", result);
        alert("✅ Материал успешно сохранён!");
        await refreshAll(false);
      }catch(err){
        console.error("Ошибка сохранения:", err);
        alert("❌ Ошибка сохранения: " + err.message);
      }finally{
        btn.disabled = false;
        btn.textContent = "💾";
      }
    };
    tr.querySelector('[data-a="del"]').onclick = async (e)=>{
      const btn = e.currentTarget;
      if(!confirm(`Удалить материал "${m.name}"?\nОн будет удалён также из всех задач и шаблонов.`)) return;
      btn.disabled = true;
      btn.textContent = "⏳";
      try{
        await api("/api/materials/"+encodeURIComponent(m.id), { method:"DELETE" });
        toast("✅ Материал удалён");
        await refreshAll(false);
      }catch(e){
        alert("❌ Ошибка удаления: " + e.message);
      }finally{
        btn.disabled = false;
        btn.textContent = "🗑";
      }
    };
    return tr;
  };
  
  // Рендерим материалы по типам
  for(const type of types){
    const typeMaterials = materialsByType[type.id] || [];
    if(typeMaterials.length === 0) continue;
    
    // Заголовок типа
    const headerRow = document.createElement("tr");
    headerRow.className = "material-type-header";
    headerRow.style.cssText = "background:rgba(0,207,181,0.1);font-weight:800;cursor:pointer;user-select:none";
    headerRow.dataset.typeId = type.id;
    headerRow.innerHTML = `
      <td colspan="9" style="padding:10px 14px;display:flex;align-items:center;gap:8px">
        <span class="type-toggle" style="font-size:14px;transition:transform 0.2s">▶</span>
        <span>${esc(type.name || "")}</span>
        <span style="color:var(--muted);font-weight:400;font-size:12px">(${typeMaterials.length})</span>
      </td>
    `;
    headerRow.onclick = (e) => {
      const toggle = headerRow.querySelector('.type-toggle');
      const tbody = headerRow.nextElementSibling;
      if(tbody && tbody.classList.contains('material-type-group')){
        const isHidden = tbody.style.display === 'none';
        tbody.style.display = isHidden ? '' : 'none';
        toggle.textContent = isHidden ? '▼' : '▶';
        toggle.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
      }
    };
    tb.appendChild(headerRow);
    
    // Группа материалов этого типа (восстанавливаем состояние раскрытия)
    const groupTbody = document.createElement("tbody");
    groupTbody.className = "material-type-group";
    groupTbody.dataset.typeId = type.id;
    // Восстанавливаем состояние: если тип был раскрыт, оставляем раскрытым
    const wasExpanded = expandedTypes.has(type.id);
    groupTbody.style.display = wasExpanded ? '' : 'none';
    // Обновляем иконку в зависимости от состояния
    if(wasExpanded){
      const toggle = headerRow.querySelector('.type-toggle');
      if(toggle){
        toggle.textContent = '▼';
        toggle.style.transform = 'rotate(0deg)';
      }
    }
    for(const m of typeMaterials){
      groupTbody.appendChild(renderMaterialRow(m));
    }
    tb.appendChild(groupTbody);
  }
  
  // Материалы без типа
  if(materialsWithoutType.length > 0){
    const headerRow = document.createElement("tr");
    headerRow.className = "material-type-header";
    headerRow.style.cssText = "background:rgba(128,128,128,0.1);font-weight:800;cursor:pointer;user-select:none";
    headerRow.innerHTML = `
      <td colspan="9" style="padding:10px 14px;display:flex;align-items:center;gap:8px">
        <span class="type-toggle" style="font-size:14px;transition:transform 0.2s">▶</span>
        <span>Без типа</span>
        <span style="color:var(--muted);font-weight:400;font-size:12px">(${materialsWithoutType.length})</span>
      </td>
    `;
    headerRow.onclick = (e) => {
      const toggle = headerRow.querySelector('.type-toggle');
      const tbody = headerRow.nextElementSibling;
      if(tbody && tbody.classList.contains('material-type-group')){
        const isHidden = tbody.style.display === 'none';
        tbody.style.display = isHidden ? '' : 'none';
        toggle.textContent = isHidden ? '▼' : '▶';
        toggle.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
      }
    };
    tb.appendChild(headerRow);
    
    // Группа материалов без типа (восстанавливаем состояние раскрытия)
    const groupTbody = document.createElement("tbody");
    groupTbody.className = "material-type-group";
    // Используем специальный идентификатор для группы "Без типа"
    const noTypeId = '__no_type__';
    // Восстанавливаем состояние: если группа была раскрыта, оставляем раскрытой
    const wasExpanded = expandedTypes.has(noTypeId);
    groupTbody.style.display = wasExpanded ? '' : 'none';
    // Обновляем иконку в зависимости от состояния
    if(wasExpanded){
      const toggle = headerRow.querySelector('.type-toggle');
      if(toggle){
        toggle.textContent = '▼';
        toggle.style.transform = 'rotate(0deg)';
      }
    }
    groupTbody.dataset.typeId = noTypeId;
    for(const m of materialsWithoutType){
      groupTbody.appendChild(renderMaterialRow(m));
    }
    tb.appendChild(groupTbody);
  }
}

function renderMaterialTypesSettings(){
  const tb = $("materialTypesT");
  if(!tb) return;
  if(!currentUser || currentUser.role !== "admin"){
    tb.innerHTML = `<tr><td colspan="4" style="padding:14px;color:var(--muted)">Только для администратора</td></tr>`;
    return;
  }
  
  // Отладочная информация
  console.log("[renderMaterialTypesSettings] state.materialTypes:", state.materialTypes);
  
  const types = Array.isArray(state.materialTypes) ? state.materialTypes.slice() : [];
  types.sort((a,b)=>{
    const sortA = Number(a.sort_order || 0);
    const sortB = Number(b.sort_order || 0);
    if(sortA !== sortB) return sortA - sortB;
    return String(a.name||"").localeCompare(String(b.name||""), "ru");
  });
  
  tb.innerHTML = "";
  if(types.length === 0){
    tb.innerHTML = `<tr><td colspan="4" style="padding:14px;color:var(--muted)">Типов материалов пока нет. Добавьте выше.</td></tr>`;
    return;
  }
  
  for(const t of types){
    const tr = document.createElement("tr");
    tr.dataset.id = t.id;
    tr.innerHTML = `
      <td><input type="text" data-f="name" value="${esc(t.name||"")}" style="width:100%;min-width:150px"></td>
      <td><input type="text" data-f="description" value="${esc(t.description||"")}" style="width:100%;min-width:200px"></td>
      <td><input type="number" data-f="sort_order" value="${t.sort_order||0}" style="width:70px"></td>
      <td class="row" style="gap:4px;flex-wrap:nowrap">
        <button class="btn ghost" data-a="save" title="Сохранить">💾</button>
        <button class="btn ghost danger" data-a="del" title="Удалить">🗑</button>
      </td>
    `;
    tr.querySelector('[data-a="save"]').onclick = async (e)=>{
      const btn = e.currentTarget;
      const row = btn.closest("tr");
      const id = row.dataset.id;
      const name = row.querySelector('[data-f="name"]').value.trim();
      const description = row.querySelector('[data-f="description"]').value.trim();
      const sort_order = parseInt(row.querySelector('[data-f="sort_order"]').value) || 0;
      if(!name){ alert("Название обязательно"); return; }
      btn.disabled = true;
      btn.textContent = "⏳";
      try{
        const updated = await api("/api/materials/types/"+encodeURIComponent(id), {
          method:"PUT",
          body: JSON.stringify({ name, description, sort_order })
        });
        // Обновляем тип в state.materialTypes
        if(state.materialTypes && updated){
          const index = state.materialTypes.findIndex(t => t.id === id);
          if(index >= 0){
            state.materialTypes[index] = updated;
            state.materialTypes.sort((a,b)=>{
              const sortA = Number(a.sort_order || 0);
              const sortB = Number(b.sort_order || 0);
              if(sortA !== sortB) return sortA - sortB;
              return String(a.name||"").localeCompare(String(b.name||""), "ru");
            });
          }
        }
        toast("✅ Тип материала сохранён");
        // Перерисовываем таблицу типов
        renderMaterialTypesSettings();
        // Также обновляем таблицу материалов для обновления выпадающих списков
        if(typeof renderMaterialsSettings === 'function'){
          renderMaterialsSettings();
        }
        // Обновляем данные в фоне
        refreshAll(false).catch(() => {});
      }catch(e){
        alert("❌ Ошибка: " + e.message);
      }finally{
        btn.disabled = false;
        btn.textContent = "💾";
      }
    };
    tr.querySelector('[data-a="del"]').onclick = async (e)=>{
      const btn = e.currentTarget;
      if(!confirm(`Удалить тип "${t.name}"?\nМатериалы с этим типом останутся без категории.`)) return;
      btn.disabled = true;
      btn.textContent = "⏳";
      try{
        await api("/api/materials/types/"+encodeURIComponent(t.id), { method:"DELETE" });
        // Удаляем тип из state.materialTypes
        if(state.materialTypes){
          state.materialTypes = state.materialTypes.filter(type => type.id !== t.id);
        }
        toast("✅ Тип материала удалён");
        // Перерисовываем таблицу типов
        renderMaterialTypesSettings();
        // Также обновляем таблицу материалов для обновления выпадающих списков
        if(typeof renderMaterialsSettings === 'function'){
          renderMaterialsSettings();
        }
        // Обновляем данные в фоне
        refreshAll(false).catch(() => {});
      }catch(e){
        alert("❌ Ошибка: " + e.message);
      }finally{
        btn.disabled = false;
        btn.textContent = "🗑";
      }
    };
    tb.appendChild(tr);
  }
}

function renderUnitsSettings(){
  const tb = $("unitsT");
  if(!tb) return;
  if(!currentUser || currentUser.role !== "admin"){
    tb.innerHTML = `<tr><td colspan="3" style="padding:14px;color:var(--muted)">Только для администратора</td></tr>`;
    return;
  }
  const units = Array.isArray(state.units) ? state.units.slice() : [];
  units.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""), "ru"));
  tb.innerHTML = "";
  if(units.length === 0){
    tb.innerHTML = `<tr><td colspan="3" style="padding:14px;color:var(--muted)">Единиц измерения пока нет.</td></tr>`;
    return;
  }
  for(const u of units){
    const tr = document.createElement("tr");
    tr.dataset.id = u.id;
    tr.innerHTML = `
      <td><input type="text" data-f="name" value="${esc(u.name||"")}" style="width:100%;min-width:150px"></td>
      <td><input type="text" data-f="short_name" value="${esc(u.short_name||"")}" style="width:100px"></td>
      <td class="row" style="gap:4px;flex-wrap:nowrap">
        <button class="btn ghost" data-a="save" title="Сохранить">💾</button>
        <button class="btn ghost danger" data-a="del" title="Удалить">🗑</button>
      </td>
    `;
    tr.querySelector('[data-a="save"]').onclick = async (e)=>{
      const btn = e.currentTarget;
      const row = btn.closest("tr");
      const id = row.dataset.id;
      const name = row.querySelector('[data-f="name"]').value.trim();
      const short_name = row.querySelector('[data-f="short_name"]').value.trim();
      if(!name){ alert("Название обязательно"); return; }
      btn.disabled = true;
      btn.textContent = "⏳";
      try{
        await api("/api/units/"+encodeURIComponent(id), {
          method:"PUT",
          body: JSON.stringify({ name, short_name })
        });
        toast("✅ Единица сохранена");
        await refreshAll(false);
      }catch(e){
        alert("❌ Ошибка: " + e.message);
      }finally{
        btn.disabled = false;
        btn.textContent = "💾";
      }
    };
    tr.querySelector('[data-a="del"]').onclick = async (e)=>{
      const btn = e.currentTarget;
      if(!confirm(`Удалить единицу "${u.name}"?`)) return;
      btn.disabled = true;
      btn.textContent = "⏳";
      try{
        await api("/api/units/"+encodeURIComponent(u.id), { method:"DELETE" });
        toast("✅ Единица удалена");
        await refreshAll(false);
      }catch(e){
        alert("❌ Ошибка: " + e.message);
      }finally{
        btn.disabled = false;
        btn.textContent = "🗑";
      }
    };
    tb.appendChild(tr);
  }
}

function renderProductTypesSettings(){
  const tb = $("productTypesT");
  if(!tb) return;
  if(!currentUser || currentUser.role !== "admin"){
    tb.innerHTML = `<tr><td colspan="3" style="padding:14px;color:var(--muted)">Только для администратора</td></tr>`;
    return;
  }
  
  // Загружаем типы из state.productTypes (теперь это объекты с id, name, description)
  const productTypes = Array.isArray(state.productTypes) ? state.productTypes.slice() : [];
  console.log("renderProductTypesSettings: загружено типов:", productTypes.length, productTypes);
  
  // Если типы пришли как строки (старый формат), преобразуем
  const types = productTypes.map(t => {
    if(typeof t === 'string'){
      return { name: t, description: '', id: null };
    }
    return t;
  });
  types.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""), "ru"));
  
  tb.innerHTML = "";
  if(types.length === 0){
    tb.innerHTML = `<tr><td colspan="3" style="padding:14px;color:var(--muted)">Типов изделий пока нет. Добавьте выше.</td></tr>`;
    return;
  }
  
  for(const t of types){
    const tr = document.createElement("tr");
    const typeId = t.id || "";
    tr.dataset.id = typeId;
    tr.innerHTML = `
      <td><input type="text" data-f="name" value="${esc(t.name||"")}" style="width:100%;min-width:150px"></td>
      <td><input type="text" data-f="description" value="${esc(t.description||"")}" style="width:100%;min-width:300px"></td>
      <td class="row" style="gap:4px;flex-wrap:nowrap">
        <button class="btn ghost" data-a="save" title="Сохранить изменения">💾</button>
        <button class="btn ghost danger" data-a="del" title="Удалить тип" ${!typeId ? 'disabled style="opacity:0.5"' : ''}>🗑</button>
      </td>
    `;
    
    // Сохранение изменений
    tr.querySelector('[data-a="save"]').onclick = async (e)=>{
      const btn = e.currentTarget;
      const row = btn.closest("tr");
      const id = row.dataset.id;
      const name = row.querySelector('[data-f="name"]').value.trim();
      const description = row.querySelector('[data-f="description"]').value.trim();
      
      if(!name){ 
        toast("⚠️ Название обязательно", 3000);
        return; 
      }
      
      btn.disabled = true;
      btn.textContent = "⏳";
      try{
        if(id){
          // Обновление существующего типа
          await api("/api/product-types/"+encodeURIComponent(id), {
            method:"PUT",
            body: JSON.stringify({ name, description })
          });
          toast("✅ Тип изделия обновлён");
        } else {
          // Создание нового типа (если нет id - не должно происходить для существующих типов)
          const result = await api("/api/product-types", {
            method:"POST",
            body: JSON.stringify({ name, description })
          });
          row.dataset.id = result.id;
          // Включаем кнопку удаления
          const delBtn = row.querySelector('[data-a="del"]');
          if(delBtn){
            delBtn.disabled = false;
            delBtn.style.opacity = '1';
          }
          toast("✅ Тип изделия создан");
        }
        await refreshAll(false);
        // Перерисовываем таблицу после обновления
        renderProductTypesSettings();
      }catch(e){
        // Обработка ошибки 409 (Conflict) - тип уже существует
        if(e.message && (e.message.includes("409") || e.message.includes("уже существует") || e.message.includes("Конфликт"))){
          toast("⚠️ Тип с таким названием уже существует. Выберите другое название.", 5000);
        } else {
          alert("Ошибка: " + e.message);
        }
      }finally{
        btn.disabled = false;
        btn.textContent = "💾";
      }
    };
    
    // Удаление типа
    tr.querySelector('[data-a="del"]').onclick = async (e)=>{
      const btn = e.currentTarget;
      if(!typeId){
        toast("⚠️ Нельзя удалить тип без ID", 3000);
        return;
      }
      if(!confirm(`Удалить тип "${t.name}"?\n\nВнимание: если тип используется в шаблонах, удаление будет невозможно.`)) return;
      btn.disabled = true;
      btn.textContent = "⏳";
      try{
        await api("/api/product-types/"+encodeURIComponent(typeId), { method:"DELETE" });
        toast("✅ Тип изделия удалён");
        await refreshAll(false);
        // Перерисовываем таблицу после удаления
        renderProductTypesSettings();
      }catch(e){
        alert("Ошибка: " + e.message);
      }finally{
        btn.disabled = false;
        btn.textContent = "🗑";
      }
    };
    tb.appendChild(tr);
  }
}

// Версия без рендеринга ops/bom - только перестроение селекторов
function renderProductTemplatesSettingsOnly(){
  if(!currentUser || currentUser.role !== "admin") return;

  const typeSel = $("pt_type");
  const tplSel = $("pt_select");
  if(!typeSel || !tplSel) return;

  const type = (typeSel.value || "Коробка").trim();
  const templates = (state.productTemplates || []).filter(t=>String(t.type||"").trim()===type);
  templates.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""), "ru"));

  const cur = tplSel.value || (templates[0]?.id || "");
  tplSel.innerHTML = "";
  if(templates.length === 0){
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "Нет шаблонов";
    tplSel.appendChild(o);
  } else {
    for(const t of templates){
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      if(t.id === cur) o.selected = true;
      tplSel.appendChild(o);
    }
  }

  // Список "старых" шаблонов операций (по имени)
  const legacySel = $("pt_import_legacy");
  if(legacySel){
    const names = [...new Set((state.templates||[]).map(t=>t.name).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"ru"));
    const curLegacy = legacySel.value || "";
    legacySel.innerHTML = "";
    const first = document.createElement("option");
    first.value = "";
    first.textContent = names.length ? "— выберите шаблон операций —" : "Нет шаблонов операций";
    legacySel.appendChild(first);
    for(const n of names){
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      if(n===curLegacy) o.selected = true;
      legacySel.appendChild(o);
    }
    legacySel.disabled = names.length === 0;
  }

  // Рендер списка всех шаблонов
  renderProductTemplatesList();
}

function renderProductTemplatesSettings(){
  if(!currentUser || currentUser.role !== "admin") return;

  const typeSel = $("pt_type");
  const tplSel = $("pt_select");
  if(!typeSel || !tplSel) return;

  // Загружаем типы изделий из базы данных (теперь это объекты с id, name, description)
  const productTypes = state.productTypes || [];
  // Преобразуем в формат для селектора: если объект - берем name, если строка - оставляем как есть
  const typeNames = productTypes.map(t => typeof t === 'string' ? t : (t.name || ''));
  const currentType = typeSel.value || (typeNames[0] || "");
  
  // Обновляем селектор типов
  typeSel.innerHTML = "";
  if(typeNames.length === 0){
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "Нет типов изделий";
    typeSel.appendChild(o);
  } else {
    for(const typeName of typeNames){
      const o = document.createElement("option");
      o.value = typeName;
      o.textContent = typeName;
      if(typeName === currentType) o.selected = true;
      typeSel.appendChild(o);
    }
  }

  const type = (typeSel.value || productTypes[0] || "").trim();
  const templates = (state.productTemplates || []).filter(t=>String(t.type||"").trim()===type);
  templates.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""), "ru"));

  const cur = tplSel.value || (templates[0]?.id || "");
  tplSel.innerHTML = "";
  if(templates.length === 0){
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "Нет шаблонов";
    tplSel.appendChild(o);
  } else {
    for(const t of templates){
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      if(t.id === cur) o.selected = true;
      tplSel.appendChild(o);
    }
  }

  // Рендер ops/bom текущего шаблона
  renderProductTemplateOpsAndBom(tplSel.value);

  // Список "старых" шаблонов операций (по имени)
  const legacySel = $("pt_import_legacy");
  if(legacySel){
    const names = [...new Set((state.templates||[]).map(t=>t.name).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"ru"));
    const curLegacy = legacySel.value || "";
    legacySel.innerHTML = "";
    const first = document.createElement("option");
    first.value = "";
    first.textContent = names.length ? "— выберите шаблон операций —" : "Нет шаблонов операций";
    legacySel.appendChild(first);
    for(const n of names){
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      if(n===curLegacy) o.selected = true;
      legacySel.appendChild(o);
    }
    legacySel.disabled = names.length === 0;
  }

  // Рендер списка всех шаблонов
  renderProductTemplatesList();
}

function renderProductTemplatesList(){
  const tb = $("pt_list_t");
  if(!tb) return;

  if(!currentUser || currentUser.role !== "admin"){
    tb.innerHTML = `<tr><td colspan="4" style="padding:14px;color:var(--muted)">Только для администратора</td></tr>`;
    return;
  }

  const templates = Array.isArray(state.productTemplates) ? state.productTemplates.slice() : [];
  templates.sort((a,b)=>{
    const typeCmp = String(a.type||"").localeCompare(String(b.type||""), "ru");
    if(typeCmp !== 0) return typeCmp;
    return String(a.name||"").localeCompare(String(b.name||""), "ru");
  });

  tb.innerHTML = "";
  if(templates.length === 0){
    tb.innerHTML = `<tr><td colspan="4" style="padding:14px;color:var(--muted)">Шаблонов пока нет. Создайте выше.</td></tr>`;
    return;
  }

  for(const t of templates){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="editable" data-field="type" data-id="${esc(t.id)}" style="cursor:pointer;padding:8px 12px;font-weight:700">${esc(t.type||"")}</td>
      <td class="editable" data-field="name" data-id="${esc(t.id)}" style="cursor:pointer;padding:8px 12px">${esc(t.name||"")}</td>
      <td data-bom-id="${esc(t.id)}" style="padding:8px 12px;color:var(--muted);font-size:13px">
        <span style="font-style:italic">Загрузка...</span>
      </td>
      <td class="row" style="gap:4px;flex-wrap:nowrap">
        <button class="btn ghost" data-a="edit-bom" title="Редактировать рецептуру">📦</button>
        <button class="btn ghost" data-a="select" title="Выбрать в селекторе">✓</button>
      </td>
    `;
    
    // Inline редактирование типа
    const typeTd = tr.querySelector('[data-field="type"]');
    typeTd.onclick = ()=> makeProductTemplateTypeEditable(typeTd, t);
    
    // Inline редактирование названия
    const nameTd = tr.querySelector('[data-field="name"]');
    nameTd.onclick = ()=> makeProductTemplateNameEditable(nameTd, t);
    
    // Кнопка редактирования рецептуры
    tr.querySelector('[data-a="edit-bom"]').onclick = ()=> openProductTemplateBomModal(t);
    
    // Кнопка выбора шаблона
    tr.querySelector('[data-a="select"]').onclick = ()=>{
      const typeSel = $("pt_type");
      const tplSel = $("pt_select");
      if(typeSel && tplSel){
        // Устанавливаем тип
        typeSel.value = t.type || "Коробка";
        // Перестраиваем селектор шаблонов (но НЕ рендерим ops/bom внутри)
        renderProductTemplatesSettingsOnly();
        // Устанавливаем нужный шаблон
        tplSel.value = t.id;
        // Теперь рендерим ops/bom для правильного шаблона
        renderProductTemplateOpsAndBom(t.id);
        toast("Шаблон выбран");
      }
    };
    
    const cell = tr.querySelector(`[data-bom-id="${esc(t.id)}"]`);
    lazyDetail(cell, 'Показать материалы', () => loadTemplateBomForList(t.id, cell));
    
    tb.appendChild(tr);
  }
}

async function loadTemplateBomForList(templateId, bomCell){
  if(!bomCell) return;
  const owner = window.currentUser;
  bomCell.innerHTML = 'Загрузка…';
  try{
    const res = await api("/api/product-templates/"+encodeURIComponent(templateId)+"/bom");
    if (owner !== window.currentUser || bomCell.isConnected === false) return;
    const items = Array.isArray(res?.items) ? res.items : [];
    const mats = state.materials || [];
    const matMap = {};
    for(const m of mats) matMap[m.id] = m;
    
    if(items.length === 0){
      bomCell.innerHTML = `<span style="color:var(--muted);font-style:italic">Нет материалов</span>`;
    } else {
      const bomText = items.map(item=>{
        const mat = matMap[item.material_id];
        const matName = mat ? mat.name : "?";
        const unit = mat ? (mat.unit ? ` ${mat.unit}` : "") : "";
        return `${esc(matName)}: ${esc(String(item.qty_per_unit||0))}${esc(unit)}`;
      }).join("; ");
      bomCell.innerHTML = `<span title="Рецептура шаблона">${bomText || "—"}</span>`;
    }
  }catch(e){
    if (owner !== window.currentUser || bomCell.isConnected === false) return;
    lazyDetail(bomCell, 'Повторить загрузку', () => loadTemplateBomForList(templateId, bomCell));
  }
}

function makeProductTemplateTypeEditable(td, template){
  if(td.classList.contains("editing")) return;
  td.classList.add("editing");
  const originalValue = template.type || "";
  
  // Создаем селектор с существующими типами
  const productTypes = state.productTypes || [];
  const select = document.createElement("select");
  select.style.width = "100%";
  select.style.padding = "4px 8px";
  select.style.border = "1px solid var(--accent)";
  select.style.borderRadius = "4px";
  select.style.fontWeight = "700";
  
  // Добавляем существующие типы (теперь это объекты с id, name, description)
  productTypes.forEach(type => {
    const typeName = typeof type === 'string' ? type : (type.name || '');
    if(!typeName) return; // Пропускаем пустые типы
    const option = document.createElement("option");
    option.value = typeName;
    option.textContent = typeName;
    if(typeName === originalValue) option.selected = true;
    select.appendChild(option);
  });
  
  // Добавляем опцию для нового типа
  const newTypeOption = document.createElement("option");
  newTypeOption.value = "__NEW__";
  newTypeOption.textContent = "+ Создать новый тип...";
  select.appendChild(newTypeOption);
  
  td.innerHTML = "";
  td.appendChild(select);
  select.focus();
  
  // Обработчик для создания нового типа
  let inputForNewType = null;
  select.onchange = ()=>{
    if(select.value === "__NEW__"){
      const newTypeInput = document.createElement("input");
      newTypeInput.type = "text";
      newTypeInput.placeholder = "Введите новый тип";
      newTypeInput.style.width = "100%";
      newTypeInput.style.padding = "4px 8px";
      newTypeInput.style.border = "1px solid var(--accent)";
      newTypeInput.style.borderRadius = "4px";
      newTypeInput.style.marginTop = "4px";
      newTypeInput.style.fontWeight = "700";
      td.appendChild(newTypeInput);
      inputForNewType = newTypeInput;
      newTypeInput.focus();
      
      newTypeInput.onkeydown = (e)=>{
        if(e.key === "Enter"){
          const newType = newTypeInput.value.trim();
          if(newType){
            // Добавляем новый тип в селектор
            const opt = document.createElement("option");
            opt.value = newType;
            opt.textContent = newType;
            opt.selected = true;
            select.insertBefore(opt, newTypeOption);
            select.value = newType;
            inputForNewType.remove();
            inputForNewType = null;
          }
        }
        if(e.key === "Escape"){
          select.value = originalValue;
          inputForNewType.remove();
          inputForNewType = null;
        }
      };
    } else if(inputForNewType){
      inputForNewType.remove();
      inputForNewType = null;
    }
  };
  
  const save = async ()=>{
    let newType = select.value;
    
    // Если выбран новый тип и есть input, берем значение из него
    if(select.value === "__NEW__" && inputForNewType){
      newType = inputForNewType.value.trim();
    } else {
      newType = newType.trim();
    }
    
    td.classList.remove("editing");
    
    if(newType === originalValue){
      td.textContent = originalValue;
      td.style.fontWeight = "700";
      return;
    }
    
    if(!newType){
      alert("Тип не может быть пустым");
      td.textContent = originalValue;
      td.style.fontWeight = "700";
      return;
    }
    
    try{
      await api("/api/product-templates/"+encodeURIComponent(template.id), {
        method:"PUT",
        body: JSON.stringify({ ...template, type: newType, name: template.name })
      });
      await refreshAll(false);
      toast("✅ Тип изменён");
    }catch(e){
      alert("Ошибка: " + e.message);
      td.textContent = originalValue;
      td.style.fontWeight = "700";
    }
  };
  
  select.onblur = (e)=>{
    // Не сохраняем если кликнули на input для нового типа
    if(inputForNewType && inputForNewType.contains(e.relatedTarget)){
      return;
    }
    save();
  };
  
  select.onkeydown = (e)=>{
    if(e.key==="Enter" && select.value !== "__NEW__"){
      e.preventDefault();
      save();
    }
    if(e.key==="Escape"){
      td.classList.remove("editing");
      td.textContent = originalValue;
      td.style.fontWeight = "700";
    }
  };
}

function makeProductTemplateNameEditable(td, template){
  if(td.classList.contains("editing")) return;
  td.classList.add("editing");
  const originalValue = template.name || "";
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = originalValue;
  inp.style.width = "100%";
  inp.style.padding = "4px 8px";
  inp.style.border = "1px solid var(--accent)";
  inp.style.borderRadius = "4px";
  td.innerHTML = "";
  td.appendChild(inp);
  inp.focus();
  inp.select();
  
  const save = async ()=>{
    const newName = inp.value.trim();
    td.classList.remove("editing");
    
    if(newName === originalValue){
      td.textContent = originalValue;
      return;
    }
    
    if(!newName){
      alert("Название не может быть пустым");
      td.textContent = originalValue;
      return;
    }
    
    try{
      await api("/api/product-templates/"+encodeURIComponent(template.id), {
        method:"PUT",
        body: JSON.stringify({ ...template, name: newName, type: template.type })
      });
      await refreshAll(false);
      toast("✅ Название изменено");
    }catch(e){
      alert("Ошибка: " + e.message);
      td.textContent = originalValue;
    }
  };
  
  inp.onblur = save;
  inp.onkeydown = (e)=>{
    if(e.key==="Enter") save();
    if(e.key==="Escape"){
      td.classList.remove("editing");
      td.textContent = originalValue;
    }
  };
}

async function openProductTemplateBomModal(template){
  if(!template?.id) return;
  
  // Загружаем текущую рецептуру
  let bom = [];
  try{
    const res = await api("/api/product-templates/"+encodeURIComponent(template.id)+"/bom");
    bom = Array.isArray(res?.items) ? res.items : [];
  }catch(e){
    alert("Ошибка загрузки рецептуры: " + e.message);
    return;
  }
  
  const mats = state.materials || [];
  // Группируем материалы по типам
  const materialsByType = {};
  const materialsWithoutType = [];
  for(const m of mats){
    const typeName = m.type_name || null;
    if(typeName){
      if(!materialsByType[typeName]) materialsByType[typeName] = [];
      materialsByType[typeName].push(m);
    } else {
      materialsWithoutType.push(m);
    }
  }
  
  let options = '<option value="">— выбрать материал —</option>';
  // Материалы по типам
  const typeNames = Object.keys(materialsByType).sort();
  for(const typeName of typeNames){
    const typeMaterials = materialsByType[typeName];
    options += `<optgroup label="${esc(typeName)}">`;
    for(const m of typeMaterials){
      options += `<option value="${esc(m.id)}">${esc(m.name)}${m.unit?` (${esc(m.unit)})`:""}</option>`;
    }
    options += '</optgroup>';
  }
  // Материалы без типа
  if(materialsWithoutType.length > 0){
    options += '<optgroup label="Без типа">';
    for(const m of materialsWithoutType){
      options += `<option value="${esc(m.id)}">${esc(m.name)}${m.unit?` (${esc(m.unit)})`:""}</option>`;
    }
    options += '</optgroup>';
  }
  
  // Генерируем строки рецептуры
  let bomRowsHtml = "";
  if(bom.length === 0){
    bomRowsHtml = `<tr data-placeholder><td colspan="3" style="padding:12px;color:var(--muted)">Нет материалов. Нажмите "+ Материал".</td></tr>`;
  } else {
    for(const b of bom){
      bomRowsHtml += `
        <tr data-row>
          <td><select data-k="material_id" style="min-width:280px">${options}</select></td>
          <td><input data-k="qty_per_unit" type="number" min="0" step="0.0001" value="${esc(String(b.qty_per_unit||0))}" style="width:140px"></td>
          <td><button class="btn ghost danger" data-a="rm">×</button></td>
        </tr>
      `;
    }
  }
  
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content" style="max-width:700px">
      <div class="modal-header">
        <h3 style="margin:0">📦 Рецептура: ${esc(template.type)} — ${esc(template.name)}</h3>
        <button class="modal-close" data-a="close">×</button>
      </div>
      <div class="modal-body" style="padding:20px">
        <div class="hint" style="margin-bottom:12px">Укажите материалы и количество <b>на 1 изделие</b>.</div>
        <div style="overflow:auto;max-height:400px">
          <table class="resizable-table">
            <thead><tr><th style="width:300px">Материал</th><th style="width:120px">Кол-во на 1</th><th style="width:60px"></th></tr></thead>
            <tbody id="pt_bom_modal_t">${bomRowsHtml}</tbody>
          </table>
        </div>
        <div class="row" style="gap:10px;margin-top:12px">
          <button class="btn ghost" data-a="add">+ Материал</button>
          <button class="btn accent" data-a="save">💾 Сохранить рецептуру</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setTimeout(()=> modal.classList.add("show"), 10);
  
  const close = ()=>{
    modal.classList.remove("show");
    setTimeout(()=> modal.remove(), 200);
  };
  
  modal.querySelector('[data-a="close"]').onclick = close;
  modal.onclick = (e)=>{ if(e.target === modal) close(); };
  
  // Устанавливаем значения select после добавления в DOM
  const tb = modal.querySelector("#pt_bom_modal_t");
  const rows = tb.querySelectorAll("tr[data-row]");
  rows.forEach((row, i)=>{
    if(bom[i]){
      const sel = row.querySelector('[data-k="material_id"]');
      if(sel) sel.value = bom[i].material_id || "";
      row.querySelector('[data-a="rm"]').onclick = ()=> row.remove();
    }
  });
  
  // Добавить материал
  modal.querySelector('[data-a="add"]').onclick = ()=>{
    // Удаляем placeholder если есть
    const placeholder = tb.querySelector('[data-placeholder]');
    if(placeholder) placeholder.remove();
    
    const tr = document.createElement("tr");
    tr.dataset.row = "true";
    tr.innerHTML = `
      <td><select data-k="material_id" style="min-width:280px">${options}</select></td>
      <td><input data-k="qty_per_unit" type="number" min="0" step="0.0001" value="1" style="width:140px"></td>
      <td><button class="btn ghost danger" data-a="rm">×</button></td>
    `;
    tr.querySelector('[data-a="rm"]').onclick = ()=> tr.remove();
    tb.appendChild(tr);
  };
  
  // Сохранить
  modal.querySelector('[data-a="save"]').onclick = async ()=>{
    const allRows = Array.from(tb.querySelectorAll("tr[data-row]"));
    const items = [];
    for(const tr of allRows){
      const matSel = tr.querySelector('[data-k="material_id"]');
      const qtyInp = tr.querySelector('[data-k="qty_per_unit"]');
      if(!matSel || !qtyInp) continue;
      const material_id = matSel.value;
      const qty_per_unit = parseFloat(String(qtyInp.value||"0").replace(",","."));
      if(material_id && isFinite(qty_per_unit) && qty_per_unit > 0){
        items.push({ material_id, qty_per_unit });
      }
    }
    try{
      await api("/api/product-templates/"+encodeURIComponent(template.id)+"/bom", { method:"PUT", body: JSON.stringify({ items }) });
      toast("Рецептура сохранена");
      close();
      // Обновляем список и основной раздел
      renderProductTemplatesList();
      if($("pt_select")?.value === template.id){
        renderProductTemplateOpsAndBom(template.id);
      }
    }catch(e){
      alert("Ошибка сохранения: " + e.message);
    }
  };
}

async function renderProductTemplateOpsAndBom(templateId){
  const selection = ++templateSelection, owner = window.currentUser;
  const opsT = $("pt_ops_t");
  const bomT = $("pt_bom_t");
  if(!opsT || !bomT) return;
  opsT.innerHTML = "";
  bomT.innerHTML = "";
  if(!templateId){
    opsT.innerHTML = `<tr><td colspan="8" style="padding:12px;color:var(--muted)">Выберите шаблон изделия</td></tr>`;
    bomT.innerHTML = `<tr><td colspan="3" style="padding:12px;color:var(--muted)">Выберите шаблон изделия</td></tr>`;
    return;
  }

  let ops = [];
  let bom = [];
  try{
    const [opsRes, bomRes] = await Promise.all([
      api("/api/product-templates/"+encodeURIComponent(templateId)+"/ops"),
      api("/api/product-templates/"+encodeURIComponent(templateId)+"/bom")
    ]);
    if (selection !== templateSelection || owner !== window.currentUser) return;
    // API возвращает массив операций напрямую или объект с полем ops
    ops = Array.isArray(opsRes) ? opsRes : (Array.isArray(opsRes?.ops) ? opsRes.ops : []);
    // API возвращает объект с полем items
    bom = Array.isArray(bomRes?.items) ? bomRes.items : [];
  }catch(e){
    if (selection !== templateSelection || owner !== window.currentUser) return;
    opsT.innerHTML = `<tr><td colspan="13" style="padding:12px;color:var(--muted)">Ошибка загрузки: ${esc(e.message)}</td></tr>`;
    bomT.innerHTML = `<tr><td colspan="3" style="padding:12px;color:var(--muted)">Ошибка загрузки: ${esc(e.message)}</td></tr>`;
    return;
  }

  // Функция форматирования источников/назначений
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
  
  // Ops rows
  if(ops.length === 0){
    opsT.innerHTML = `<tr><td colspan="13" style="padding:12px;color:var(--muted)">Нет операций. Нажмите "+ Операция".</td></tr>`;
  } else {
    for(const o of ops){
      const tr = document.createElement("tr");
      const inputSources = o.input_sources || null;
      const outputTargets = o.output_targets || null;
      const inputCritical = o.input_critical || 0;
      const outputCritical = o.output_critical || 0;
      
      const machineText = o.machine ? `🛠️ ${esc(o.machine)}` : '';
      tr.innerHTML = `
        <td><input data-k="no" type="number" min="1" step="1" value="${esc(String(o.no||1))}" style="width:50px" class="sort-trigger"></td>
        <td data-k="input_sources" data-type="select-source" style="font-size:11px;cursor:pointer;white-space:pre-line" title="Откуда поступает материал">
          ${formatSources(inputSources, true)}${machineText ? '<br>' + machineText : ''}${inputCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : ''}
        </td>
        <td><textarea data-k="machine" class="resizable-textarea" placeholder="Машина" rows="1" style="min-width:100px">${esc(o.machine||"")}</textarea></td>
        <td data-k="output_targets" data-type="select-target" style="font-size:11px;cursor:pointer;white-space:pre-line" title="Куда уходит материал">
          ${formatSources(outputTargets, false)}${machineText ? '<br>' + machineText : ''}${outputCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : ''}
        </td>
        <td><textarea data-k="operator" class="resizable-textarea" placeholder="Оператор" rows="1" style="min-width:100px">${esc(o.operator||"")}</textarea></td>
        <td><textarea data-k="operation_name" class="resizable-textarea" placeholder="Операция" rows="1" style="min-width:140px">${esc(o.operation_name||"")}</textarea></td>
        <td><input data-k="time" value="${esc(o.time||"")}" placeholder="Время" style="width:70px"></td>
        <td><input data-k="planned_duration" type="number" min="0" step="1" value="${esc(String(o.planned_duration||0))}" style="width:80px" title="Планируемое время операции (сек)"></td>
        <td><input data-k="setup_time" type="number" min="0" step="1" value="${esc(String(o.setup_time||0))}" style="width:80px" title="Время наладки (сек)"></td>
        <td><input data-k="setup_cost" type="number" min="0" step="0.01" value="${esc(String(o.setup_cost||0))}" style="width:90px" title="Стоимость наладки (€)"></td>
        <td><input data-k="operation_cost_per_unit" type="number" min="0" step="0.01" value="${esc(String(o.operation_cost_per_unit||0))}" style="width:90px" title="Стоимость за единицу операции (€)"></td>
        <td><input data-k="scrap_cost_per_unit" type="number" min="0" step="0.01" value="${esc(String(o.scrap_cost_per_unit||0))}" style="width:90px" title="Стоимость отбраковки за единицу (€)"></td>
        <td><button class="btn ghost danger" data-a="rm">×</button></td>
      `;
      tr.dataset.id = o.id || "";
      
      // Автосохранение при изменении стоимости
      const setupCostInput = tr.querySelector('[data-k="setup_cost"]');
      const operationCostInput = tr.querySelector('[data-k="operation_cost_per_unit"]');
      const scrapCostInput = tr.querySelector('[data-k="scrap_cost_per_unit"]');
      
      const autoSaveCost = async () => {
        const templateId = ($("pt_select")?.value || "").trim();
        if (!templateId) return;
        
        // Получаем все операции из таблицы
        const rows = Array.from(opsT.querySelectorAll("tr"));
        const ops = [];
        for (const row of rows) {
          const noInp = row.querySelector('[data-k="no"]');
          const machineInp = row.querySelector('[data-k="machine"]');
          const operatorInp = row.querySelector('[data-k="operator"]');
          const opNameInp = row.querySelector('[data-k="operation_name"]');
          if (!noInp || !machineInp || !operatorInp || !opNameInp) continue;
          
          const no = parseInt(noInp.value || "0", 10);
          if (no <= 0) continue;
          
          const setupCostInp = row.querySelector('[data-k="setup_cost"]');
          const operationCostInp = row.querySelector('[data-k="operation_cost_per_unit"]');
          const scrapCostInp = row.querySelector('[data-k="scrap_cost_per_unit"]');
          
          const inputSources = row.dataset.input_sources || "";
          const outputTargets = row.dataset.output_targets || "";
          const inputCritical = parseInt(row.dataset.input_critical || "0", 10) || 0;
          const outputCritical = parseInt(row.dataset.output_critical || "0", 10) || 0;
          
          let inputSourcesValue = null;
          let outputTargetsValue = null;
          if (inputSources && inputSources.trim() !== "") {
            try {
              JSON.parse(inputSources);
              inputSourcesValue = inputSources;
            } catch (e) {
              inputSourcesValue = JSON.stringify([inputSources]);
            }
          }
          if (outputTargets && outputTargets.trim() !== "") {
            try {
              JSON.parse(outputTargets);
              outputTargetsValue = outputTargets;
            } catch (e) {
              outputTargetsValue = JSON.stringify([outputTargets]);
            }
          }
          
          ops.push({
            id: row.dataset.id || undefined,
            no,
            machine: String(machineInp.value || "").trim(),
            operator: String(operatorInp.value || "").trim(),
            operation_name: String(opNameInp.value || "").trim(),
            time: row.querySelector('[data-k="time"]') ? String(row.querySelector('[data-k="time"]').value || "").trim() : "",
            planned_duration: row.querySelector('[data-k="planned_duration"]') ? parseInt(row.querySelector('[data-k="planned_duration"]').value || "0", 10) || 0 : 0,
            setup_time: row.querySelector('[data-k="setup_time"]') ? parseInt(row.querySelector('[data-k="setup_time"]').value || "0", 10) || 0 : 0,
            setup_cost: setupCostInp ? parseFloat(setupCostInp.value || "0") || 0 : 0,
            operation_cost_per_unit: operationCostInp ? parseFloat(operationCostInp.value || "0") || 0 : 0,
            scrap_cost_per_unit: scrapCostInp ? parseFloat(scrapCostInp.value || "0") || 0 : 0,
            input_sources: inputSourcesValue,
            output_targets: outputTargetsValue,
            input_critical: inputCritical || 0,
            output_critical: outputCritical || 0
          });
        }
        
        try {
          await api("/api/product-templates/" + encodeURIComponent(templateId) + "/ops", {
            method: "PUT",
            body: JSON.stringify(ops)
          });
          // Тихое сохранение без уведомления
        } catch (e) {
          console.error("Ошибка автосохранения стоимости:", e);
        }
      };
      
      // Debounce для автосохранения (сохраняем через 1 секунду после последнего изменения)
      let saveTimeout = null;
      const scheduleAutoSave = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(autoSaveCost, 1000);
      };
      
      if (setupCostInput) {
        setupCostInput.oninput = scheduleAutoSave;
        setupCostInput.onchange = scheduleAutoSave;
      }
      if (operationCostInput) {
        operationCostInput.oninput = scheduleAutoSave;
        operationCostInput.onchange = scheduleAutoSave;
      }
      if (scrapCostInput) {
        scrapCostInput.oninput = scheduleAutoSave;
        scrapCostInput.onchange = scheduleAutoSave;
      }
      // Сохраняем направления как JSON-строки для корректного сохранения
      if(inputSources){
        tr.dataset.input_sources = typeof inputSources === 'string' ? inputSources : JSON.stringify(inputSources);
      } else {
        tr.dataset.input_sources = "";
      }
      if(outputTargets){
        tr.dataset.output_targets = typeof outputTargets === 'string' ? outputTargets : JSON.stringify(outputTargets);
      } else {
        tr.dataset.output_targets = "";
      }
      tr.dataset.input_critical = String(inputCritical || 0);
      tr.dataset.output_critical = String(outputCritical || 0);
      
      // Обработчик для редактирования направлений
      const inputCell = tr.querySelector('[data-k="input_sources"]');
      const outputCell = tr.querySelector('[data-k="output_targets"]');
      if(inputCell){
        inputCell.onclick = () => openProductTemplateSourceTargetModal(tr, o, true);
      }
      if(outputCell){
        outputCell.onclick = () => openProductTemplateSourceTargetModal(tr, o, false);
      }
      
      // Обработчик изменения номера операции - сортировка таблицы
      const noInput = tr.querySelector('[data-k="no"]');
      if(noInput){
        noInput.oninput = ()=>{
          if(!opsT) return;
          const rows = Array.from(opsT.querySelectorAll("tr"));
          // Сортируем строки по номеру операции (input с data-k="no")
          rows.sort((a, b) => {
            const aNoInput = a.querySelector('[data-k="no"]');
            const bNoInput = b.querySelector('[data-k="no"]');
            const aNo = aNoInput ? parseInt(aNoInput.value || "0", 10) : 0;
            const bNo = bNoInput ? parseInt(bNoInput.value || "0", 10) : 0;
            return aNo - bNo;
          });
          // Переставляем строки в отсортированном порядке
          rows.forEach(row => opsT.appendChild(row));
        };
      }
      
      tr.querySelector('[data-a="rm"]').onclick = ()=>{
        if(!confirm("Удалить эту операцию из шаблона изделия?")) return;
        tr.remove();
        // Проверяем, остались ли еще операции в таблице
        const remainingOps = opsT.querySelectorAll("tr").length;
        if(remainingOps === 0){
          opsT.innerHTML = `<tr><td colspan="13" style="padding:12px;color:var(--muted)">Нет операций. Нажмите "+ Операция".</td></tr>`;
        }
        toast("✅ Операция удалена (не забудьте сохранить изменения)");
      };
      opsT.appendChild(tr);
    }
  }

  // BOM rows
  const mats = state.materials || [];
  // Группируем материалы по типам
  const materialsByTypeBom = {};
  const materialsWithoutTypeBom = [];
  for(const m of mats){
    const typeName = m.type_name || null;
    if(typeName){
      if(!materialsByTypeBom[typeName]) materialsByTypeBom[typeName] = [];
      materialsByTypeBom[typeName].push(m);
    } else {
      materialsWithoutTypeBom.push(m);
    }
  }
  
  let options = '<option value="">— выбрать —</option>';
  // Материалы по типам
  const typeNamesBom = Object.keys(materialsByTypeBom).sort();
  for(const typeName of typeNamesBom){
    const typeMaterials = materialsByTypeBom[typeName];
    options += `<optgroup label="${esc(typeName)}">`;
    for(const m of typeMaterials){
      options += `<option value="${esc(m.id)}">${esc(m.name)}${m.unit?` (${esc(m.unit)})`:""}</option>`;
    }
    options += '</optgroup>';
  }
  // Материалы без типа
  if(materialsWithoutTypeBom.length > 0){
    options += '<optgroup label="Без типа">';
    for(const m of materialsWithoutTypeBom){
      options += `<option value="${esc(m.id)}">${esc(m.name)}${m.unit?` (${esc(m.unit)})`:""}</option>`;
    }
    options += '</optgroup>';
  }
  if(bom.length === 0){
    bomT.innerHTML = `<tr><td colspan="3" style="padding:12px;color:var(--muted)">Нет материалов. Нажмите “+ Материал”.</td></tr>`;
  } else {
    // Показываем количество сохранённых материалов
    const bomCount = bom.length;
    for(const b of bom){
      const mat = mats.find(m=>m.id === b.material_id);
      const matName = mat ? mat.name : "?";
      const matUnit = mat ? (mat.unit ? ` ${mat.unit}` : "") : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><select data-k="material_id" style="min-width:280px">${options}</select></td>
        <td><input data-k="qty_per_unit" type="number" min="0" step="0.0001" value="${esc(String(b.qty_per_unit||0))}" style="width:160px"></td>
        <td><button class="btn ghost danger" data-a="rm">×</button></td>
      `;
      const matSel = tr.querySelector('[data-k="material_id"]');
      matSel.value = b.material_id || "";
      tr.querySelector('[data-a="rm"]').onclick = ()=> tr.remove();
      bomT.appendChild(tr);
    }
  }
}

// Функция для редактирования направлений в product template operations
function openProductTemplateSourceTargetModal(tr, op, isInput){
  const currentSources = tr.dataset.input_sources || "";
  const currentTargets = tr.dataset.output_targets || "";
  const currentInputCritical = parseInt(tr.dataset.input_critical || "0", 10) || 0;
  const currentOutputCritical = parseInt(tr.dataset.output_critical || "0", 10) || 0;
  
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
  modal.querySelector('[data-a="save"]').onclick = ()=>{
    const checks = modal.querySelectorAll('.srcTargetCheck:checked');
    const newValues = Array.from(checks).map(c => c.value);
    const newCritical = modal.querySelector('#criticalCheck').checked;
    document.removeEventListener('keydown', handleEscape);
    modal.remove();
    
    if(newValues.length === 0) {
      toast("Выберите хотя бы один вариант", 3000);
      return;
    }
    
    // Обновляем dataset строки
    if(isInput){
      tr.dataset.input_sources = JSON.stringify(newValues);
      tr.dataset.input_critical = newCritical ? "1" : "0";
    } else {
      tr.dataset.output_targets = JSON.stringify(newValues);
      tr.dataset.output_critical = newCritical ? "1" : "0";
    }
    
    // Обновляем отображение ячейки
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
    
    const cell = isInput ? tr.querySelector('[data-k="input_sources"]') : tr.querySelector('[data-k="output_targets"]');
    if(cell){
      const critical = newCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : '';
      cell.innerHTML = formatSources(JSON.stringify(newValues), isInput) + critical;
      
      // Визуальное подтверждение - подсветка измененной ячейки
      cell.style.transition = 'background-color 0.3s ease, box-shadow 0.3s ease';
      cell.style.backgroundColor = 'rgba(0, 207, 181, 0.2)';
      cell.style.boxShadow = '0 0 8px rgba(0, 207, 181, 0.4)';
      setTimeout(() => {
        cell.style.backgroundColor = '';
        cell.style.boxShadow = '';
      }, 1000);
      
      // Показываем сообщение об успешном изменении
      const direction = isInput ? 'входа (откуда)' : 'выхода (куда)';
      toast(`✅ Маршрут ${direction} обновлен`, 2000);
      
      // Обновляем всю таблицу операций, чтобы видеть актуальные данные
      // Получаем templateId из селектора
      const templateId = document.getElementById("pt_select")?.value;
      if(templateId && typeof renderProductTemplateOpsAndBom === 'function') {
        // Обновляем таблицу операций, чтобы видеть все изменения
        renderProductTemplateOpsAndBom(templateId);
      }
    }
  };
  
  // Закрытие при клике вне модального окна
  modal.onclick = (e)=> { 
    if(e.target === modal) { 
      document.removeEventListener('keydown', handleEscape);
      modal.remove(); 
    } 
  };
}

// Версия без рендеринга items - только перестроение селекторов
function renderClientProfilesSettingsOnly(){
  if(!currentUser || currentUser.role !== "admin") return;
  const clientInp = $("cp_client");
  const sel = $("cp_select");
  if(!clientInp || !sel) return;
  const client = (clientInp.value || "").trim();
  const profiles = (state.clientProfiles || []).filter(p=>!client || String(p.client_name||"")===client);
  profiles.sort((a,b)=>String(a.profile_name||"").localeCompare(String(b.profile_name||""), "ru"));

  const cur = sel.value || (profiles[0]?.id || "");
  sel.innerHTML = "";
  if(profiles.length === 0){
    const o = document.createElement("option");
    o.value = "";
    o.textContent = client ? "Нет профилей" : "Выберите клиента";
    sel.appendChild(o);
  } else {
    for(const p of profiles){
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.profile_name;
      if(p.id===cur) o.selected = true;
      sel.appendChild(o);
    }
  }
  renderClientProfilesList();
}

function renderClientProfilesSettings(){
  if(!currentUser || currentUser.role !== "admin") return;
  const clientInp = $("cp_client");
  const sel = $("cp_select");
  if(!clientInp || !sel) return;
  const client = (clientInp.value || "").trim();
  const profiles = (state.clientProfiles || []).filter(p=>!client || String(p.client_name||"")===client);
  profiles.sort((a,b)=>String(a.profile_name||"").localeCompare(String(b.profile_name||""), "ru"));

  const cur = sel.value || (profiles[0]?.id || "");
  sel.innerHTML = "";
  if(profiles.length === 0){
    const o = document.createElement("option");
    o.value = "";
    o.textContent = client ? "Нет профилей" : "Выберите клиента";
    sel.appendChild(o);
  } else {
    for(const p of profiles){
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.profile_name;
      if(p.id===cur) o.selected = true;
      sel.appendChild(o);
    }
  }
  renderClientProfileItems(sel.value);
  renderClientProfilesList();
}

async function renderClientProfileItems(profileId){
  const selection = ++profileSelection, owner = window.currentUser;
  const tb = $("cp_items_t");
  if(!tb) return;
  tb.innerHTML = "";
  if(!profileId){
    tb.innerHTML = `<tr><td colspan="4" style="padding:12px;color:var(--muted)">Выберите профиль</td></tr>`;
    return;
  }
  let items = [];
  try{
    const res = await api("/api/client-profiles/"+encodeURIComponent(profileId)+"/items");
    if (selection !== profileSelection || owner !== window.currentUser) return;
    items = Array.isArray(res?.items) ? res.items : [];
    (state.clientProfileItems ||= {})[profileId] = items;
  }catch(e){
    if (selection !== profileSelection || owner !== window.currentUser) return;
    tb.innerHTML = `<tr><td colspan="4" style="padding:12px;color:var(--muted)">Ошибка: ${esc(e.message)}</td></tr>`;
    return;
  }

  const templates = state.productTemplates || [];
  // Используем динамические типы из базы данных (теперь это объекты с id, name, description)
  const productTypes = state.productTypes || [];
  const typeNames = productTypes.map(t => typeof t === 'string' ? t : (t.name || ''));
  const typeOptions = typeNames.length > 0 
    ? typeNames.map(t=>`<option>${esc(t)}</option>`).join("")
    : ['Коробка','Крышка','Ложемент'].map(t=>`<option>${esc(t)}</option>`).join(""); // Fallback если типов нет
  const tplOptions = (type)=>['<option value="">— выбрать —</option>']
    .concat(templates.filter(x=>String(x.type||"")===type).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`))
    .join("");

  if(items.length === 0){
    tb.innerHTML = `<tr><td colspan="4" style="padding:12px;color:var(--muted)">Нажмите “+ Строка”.</td></tr>`;
    return;
  }
  for(const it of items){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><select data-k="product_type" style="min-width:140px">${typeOptions}</select></td>
      <td><select data-k="template_id" style="min-width:320px"></select></td>
      <td><input data-k="multiplier" type="number" min="1" step="1" value="${esc(String(it.multiplier||1))}" style="width:120px"></td>
      <td><button class="btn ghost danger" data-a="rm">×</button></td>
    `;
    tr.dataset.id = it.id || "";
    const typeSel = tr.querySelector('[data-k="product_type"]');
    const tplSel = tr.querySelector('[data-k="template_id"]');
    typeSel.value = it.product_type || "Коробка";
    const refill = ()=>{
      tplSel.innerHTML = tplOptions(typeSel.value);
      tplSel.value = it.template_id || "";
    };
    typeSel.onchange = ()=>{
      tplSel.innerHTML = tplOptions(typeSel.value);
    };
    refill();
    tr.querySelector('[data-a="rm"]').onclick = ()=> tr.remove();
    tb.appendChild(tr);
  }
}

function renderClientProfilesList(){
  const tb = $("cp_list_t");
  if(!tb) return;

  if(!currentUser || currentUser.role !== "admin"){
    tb.innerHTML = `<tr><td colspan="4" style="padding:14px;color:var(--muted)">Только для администратора</td></tr>`;
    return;
  }

  const profiles = Array.isArray(state.clientProfiles) ? state.clientProfiles.slice() : [];
  profiles.sort((a,b)=>{
    const clientCmp = String(a.client_name||"").localeCompare(String(b.client_name||""), "ru");
    if(clientCmp !== 0) return clientCmp;
    return String(a.profile_name||"").localeCompare(String(b.profile_name||""), "ru");
  });

  tb.innerHTML = "";
  if(profiles.length === 0){
    tb.innerHTML = `<tr><td colspan="4" style="padding:14px;color:var(--muted)">Профилей пока нет. Создайте выше.</td></tr>`;
    return;
  }

  for(const p of profiles){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${esc(p.client_name||"")}</b></td>
      <td class="editable" data-field="profile_name" data-id="${esc(p.id)}" style="cursor:pointer;padding:8px 12px">${esc(p.profile_name||"")}</td>
      <td data-items-id="${esc(p.id)}" style="padding:8px 12px;color:var(--muted);font-size:13px">
        <span style="font-style:italic">Загрузка...</span>
      </td>
      <td class="row" style="gap:4px;flex-wrap:nowrap">
        <button class="btn ghost" data-a="edit-items" title="Редактировать набор изделий">📦</button>
        <button class="btn ghost" data-a="select" title="Выбрать в селекторе">✓</button>
      </td>
    `;
    
    // Inline редактирование названия профиля
    const nameTd = tr.querySelector('[data-field="profile_name"]');
    nameTd.onclick = ()=> makeClientProfileNameEditable(nameTd, p);
    
    // Кнопка редактирования набора изделий
    tr.querySelector('[data-a="edit-items"]').onclick = ()=> openClientProfileItemsModal(p);
    
    // Кнопка выбора профиля
    tr.querySelector('[data-a="select"]').onclick = ()=>{
      const clientInp = $("cp_client");
      const sel = $("cp_select");
      if(clientInp && sel){
        // Устанавливаем клиента
        clientInp.value = p.client_name || "";
        // Перестраиваем селектор (но НЕ рендерим items внутри)
        renderClientProfilesSettingsOnly();
        // Устанавливаем нужный профиль
        sel.value = p.id;
        // Теперь рендерим items для правильного профиля
        renderClientProfileItems(p.id);
        toast("Профиль выбран");
      }
    };
    
    const cell = tr.querySelector(`[data-items-id="${esc(p.id)}"]`);
    lazyDetail(cell, 'Показать изделия', () => loadProfileItemsForList(p.id, cell));
    
    tb.appendChild(tr);
  }
}

async function loadProfileItemsForList(profileId, itemsCell){
  if(!itemsCell) return;
  const owner = window.currentUser;
  itemsCell.innerHTML = 'Загрузка…';
  try{
    const res = await api("/api/client-profiles/"+encodeURIComponent(profileId)+"/items");
    if (owner !== window.currentUser || itemsCell.isConnected === false) return;
    const items = Array.isArray(res?.items) ? res.items : [];
    const templates = state.productTemplates || [];
    const tplMap = {};
    for(const t of templates) tplMap[t.id] = t;
    
    if(items.length === 0){
      itemsCell.innerHTML = `<span style="color:var(--muted);font-style:italic">Нет изделий</span>`;
    } else {
      const itemsText = items.map(item=>{
        const tpl = tplMap[item.template_id];
        const tplName = tpl ? tpl.name : (item.product_type || "?");
        const mult = item.multiplier || 1;
        return `${esc(item.product_type||"")}: ${esc(tplName)}${mult > 1 ? ` ×${mult}` : ""}`;
      }).join("; ");
      itemsCell.innerHTML = `<span title="Набор изделий">${itemsText || "—"}</span>`;
    }
  }catch(e){
    if (owner !== window.currentUser || itemsCell.isConnected === false) return;
    lazyDetail(itemsCell, 'Повторить загрузку', () => loadProfileItemsForList(profileId, itemsCell));
  }
}

function makeClientProfileNameEditable(td, profile){
  if(td.classList.contains("editing")) return;
  td.classList.add("editing");
  const originalValue = profile.profile_name || "";
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = originalValue;
  inp.style.width = "100%";
  inp.style.padding = "4px 8px";
  inp.style.border = "1px solid var(--accent)";
  inp.style.borderRadius = "4px";
  td.innerHTML = "";
  td.appendChild(inp);
  inp.focus();
  inp.select();
  
  const save = async ()=>{
    const newName = inp.value.trim();
    td.classList.remove("editing");
    
    if(newName === originalValue){
      td.textContent = originalValue;
      return;
    }
    
    if(!newName){
      alert("Название не может быть пустым");
      td.textContent = originalValue;
      return;
    }
    
    try{
      await api("/api/client-profiles/"+encodeURIComponent(profile.id), {
        method:"PUT",
        body: JSON.stringify({ ...profile, profile_name: newName })
      });
      await refreshAll(false);
      toast("Название изменено");
    }catch(e){
      alert("Ошибка: " + e.message);
      td.textContent = originalValue;
    }
  };
  
  inp.onblur = save;
  inp.onkeydown = (e)=>{
    if(e.key==="Enter") save();
    if(e.key==="Escape"){
      td.classList.remove("editing");
      td.textContent = originalValue;
    }
  };
}

async function openClientProfileItemsModal(profile){
  if(!profile?.id) return;
  
  // Загружаем текущий набор изделий
  let items = [];
  try{
    const res = await api("/api/client-profiles/"+encodeURIComponent(profile.id)+"/items");
    items = Array.isArray(res?.items) ? res.items : [];
  }catch(e){
    alert("Ошибка загрузки: " + e.message);
    return;
  }
  
  const templates = state.productTemplates || [];
  // Используем динамические типы из базы данных (теперь это объекты с id, name, description)
  const productTypes = state.productTypes || [];
  const typeNames = productTypes.map(t => typeof t === 'string' ? t : (t.name || ''));
  const typeOptions = typeNames.length > 0 
    ? typeNames.map(t=>`<option>${esc(t)}</option>`).join("")
    : ['Коробка','Крышка','Ложемент'].map(t=>`<option>${esc(t)}</option>`).join(""); // Fallback если типов нет
  const tplOptions = (type)=>['<option value="">— выбрать шаблон —</option>']
    .concat(templates.filter(x=>String(x.type||"")===type).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`))
    .join("");
  
  // Генерируем строки набора
  let itemsRowsHtml = "";
  if(items.length === 0){
    itemsRowsHtml = `<tr data-placeholder><td colspan="4" style="padding:12px;color:var(--muted)">Нет изделий. Нажмите "+ Изделие".</td></tr>`;
  } else {
    for(const it of items){
      itemsRowsHtml += `
        <tr data-row data-type="${esc(it.product_type||"Коробка")}" data-tpl="${esc(it.template_id||"")}">
          <td><select data-k="product_type" style="min-width:140px">${typeOptions}</select></td>
          <td><select data-k="template_id" style="min-width:280px">${tplOptions(it.product_type||"Коробка")}</select></td>
          <td><input data-k="multiplier" type="number" min="1" step="1" value="${esc(String(it.multiplier||1))}" style="width:100px"></td>
          <td><button class="btn ghost danger" data-a="rm">×</button></td>
        </tr>
      `;
    }
  }
  
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content" style="max-width:800px">
      <div class="modal-header">
        <h3 style="margin:0">📦 Набор изделий: ${esc(profile.client_name)} — ${esc(profile.profile_name)}</h3>
        <button class="modal-close" data-a="close">×</button>
      </div>
      <div class="modal-body" style="padding:20px">
        <div class="hint" style="margin-bottom:12px">Укажите изделия и их множители <b>на 1 комплект</b>.</div>
        <div style="overflow:auto;max-height:400px">
          <table class="resizable-table">
            <thead><tr><th style="width:150px">Тип изделия</th><th style="width:250px">Шаблон изделия</th><th style="width:100px">Множитель</th><th style="width:60px"></th></tr></thead>
            <tbody id="cp_items_modal_t">${itemsRowsHtml}</tbody>
          </table>
        </div>
        <div class="row" style="gap:10px;margin-top:12px">
          <button class="btn ghost" data-a="add">+ Изделие</button>
          <button class="btn accent" data-a="save">💾 Сохранить набор</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setTimeout(()=> modal.classList.add("show"), 10);
  
  const close = ()=>{
    modal.classList.remove("show");
    setTimeout(()=> modal.remove(), 200);
  };
  
  modal.querySelector('[data-a="close"]').onclick = close;
  modal.onclick = (e)=>{ if(e.target === modal) close(); };
  
  // Устанавливаем значения select и добавляем обработчики после добавления в DOM
  const tb = modal.querySelector("#cp_items_modal_t");
  const rows = tb.querySelectorAll("tr[data-row]");
  rows.forEach((row)=>{
    const typeSel = row.querySelector('[data-k="product_type"]');
    const tplSel = row.querySelector('[data-k="template_id"]');
    const savedType = row.dataset.type || "Коробка";
    const savedTpl = row.dataset.tpl || "";
    
    typeSel.value = savedType;
    tplSel.innerHTML = tplOptions(savedType);
    tplSel.value = savedTpl;
    
    typeSel.onchange = ()=>{
      tplSel.innerHTML = tplOptions(typeSel.value);
    };
    row.querySelector('[data-a="rm"]').onclick = ()=> row.remove();
  });
  
  // Добавить изделие
  modal.querySelector('[data-a="add"]').onclick = ()=>{
    // Удаляем placeholder если есть
    const placeholder = tb.querySelector('[data-placeholder]');
    if(placeholder) placeholder.remove();
    
    const tr = document.createElement("tr");
    tr.dataset.row = "true";
    tr.innerHTML = `
      <td><select data-k="product_type" style="min-width:140px">${typeOptions}</select></td>
      <td><select data-k="template_id" style="min-width:280px">${tplOptions("Коробка")}</select></td>
      <td><input data-k="multiplier" type="number" min="1" step="1" value="1" style="width:100px"></td>
      <td><button class="btn ghost danger" data-a="rm">×</button></td>
    `;
    const typeSel = tr.querySelector('[data-k="product_type"]');
    const tplSel = tr.querySelector('[data-k="template_id"]');
    typeSel.onchange = ()=>{
      tplSel.innerHTML = tplOptions(typeSel.value);
    };
    tr.querySelector('[data-a="rm"]').onclick = ()=> tr.remove();
    tb.appendChild(tr);
  };
  
  // Сохранить
  modal.querySelector('[data-a="save"]').onclick = async ()=>{
    const allRows = Array.from(tb.querySelectorAll("tr[data-row]"));
    const newItems = [];
    for(const tr of allRows){
      const typeSel = tr.querySelector('[data-k="product_type"]');
      const tplSel = tr.querySelector('[data-k="template_id"]');
      const multInp = tr.querySelector('[data-k="multiplier"]');
      if(!typeSel || !tplSel || !multInp) continue;
      const product_type = typeSel.value;
      const template_id = tplSel.value;
      const multiplier = parseInt(multInp.value||"1",10) || 1;
      if(product_type){
        newItems.push({ product_type, template_id, multiplier });
      }
    }
    try{
      await api("/api/client-profiles/"+encodeURIComponent(profile.id)+"/items", { method:"PUT", body: JSON.stringify({ items: newItems }) });
      toast("Набор сохранён");
      close();
      // Обновляем список и основной раздел
      renderClientProfilesList();
      if($("cp_select")?.value === profile.id){
        renderClientProfileItems(profile.id);
      }
    }catch(e){
      alert("Ошибка сохранения: " + e.message);
    }
  };
}

// Printing

  // Expose functions globally
  window.renderMaterialsSettings = renderMaterialsSettings;
  window.renderMaterialTypesSettings = renderMaterialTypesSettings;
  window.renderUnitsSettings = renderUnitsSettings;
  window.renderProductTypesSettings = renderProductTypesSettings;
  window.renderProductTemplatesSettingsOnly = renderProductTemplatesSettingsOnly;
  window.renderProductTemplatesSettings = renderProductTemplatesSettings;
  window.renderProductTemplatesList = renderProductTemplatesList;
  window.loadTemplateBomForList = loadTemplateBomForList;
  window.makeProductTemplateTypeEditable = makeProductTemplateTypeEditable;
  window.makeProductTemplateNameEditable = makeProductTemplateNameEditable;
  window.openProductTemplateBomModal = openProductTemplateBomModal;
  window.renderProductTemplateOpsAndBom = renderProductTemplateOpsAndBom;
  window.renderClientProfilesSettingsOnly = renderClientProfilesSettingsOnly;
  window.renderClientProfilesSettings = renderClientProfilesSettings;
  window.renderClientProfileItems = renderClientProfileItems;
  window.renderClientProfilesList = renderClientProfilesList;
  window.loadProfileItemsForList = loadProfileItemsForList;
  window.makeClientProfileNameEditable = makeClientProfileNameEditable;
  window.openClientProfileItemsModal = openClientProfileItemsModal;
  
  // Module export
  window.SettingsModule = {
    loaded: true,
    init,
    renderMaterialsSettings,
    renderMaterialTypesSettings,
    renderProductTypesSettings,
    renderUnitsSettings,
    renderProductTemplatesSettings,
    renderClientProfilesSettings
  };
  
  console.log('Settings module loaded successfully');
  
})();

// B'BOX Production - Main Application Script
// State, utils, columns are loaded from external modules (js/*.js)

// --- Stub functions (replaced when modules load) ---
// These allow the app to start even before modules are fully loaded

function renderMy() {
  // Will be replaced by my.js module
  console.log('renderMy: waiting for module...');
}

function renderOps() {
  // Will be replaced by routing.js module
  console.log('renderOps: waiting for module...');
}

function renderTimeAnalysis() {
  // Will be replaced by routing.js module
}

function makeEditable() {
  // Will be replaced by routing.js module
}

function machineOps() {
  // Will be replaced by my.js module
  return [];
}

function myOps() {
  // Will be replaced by my.js module
  return [];
}

function renderMaterialsSettings() {
  // Will be replaced by settings.js module
}

function renderUnitsSettings() {
  // Will be replaced by settings.js module
}

function renderProductTemplatesSettings() {
  // Will be replaced by settings.js module
}

function renderClientProfilesSettings() {
  // Will be replaced by settings.js module
}

function renderAnalytics() {
  // Will be replaced by stats.js module
}

function renderStats() {
  // Will be replaced by stats.js module
}

function renderCharts() {
  // Will be replaced by stats.js module
}

function fillStatsFilters() {
  // Will be replaced by stats.js module
}

function loadStats() {
  // Will be replaced by stats.js module
}

// Timer cache for renderAll (used by routing.js)
let timerCache = { timers: null, setupTimers: null, lastUpdate: 0 };

// --- Attachments helpers ---

async function fetchOpFiles(opId){
  const data = await api("/api/ops/"+encodeURIComponent(opId)+"/files");
  const files = data.files || [];
  if (!window.PagesClient?.enabled) return files;
  return Promise.all(files.map(async file => ({ ...file, url: await window.PagesClient.privateUrl(file.url) })));

}

async function uploadOpFile(opId, file){
  const contentBase64 = await fileToBase64(file);
  return api("/api/ops/"+encodeURIComponent(opId)+"/files", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ filename: file.name, contentBase64 })
  });
}

async function findOpByShortCode(code){
  if(!code) return null;
  let op = state.ops?.find(o => opShortCode(o) === code);
  if(op) return op;
  try{
    const ops = await api("/api/ops");
    if(Array.isArray(ops)){
      state.ops = ops;
      op = ops.find(o => opShortCode(o) === code);
    }
  }catch(e){
    console.error("Не удалось загрузить операции для поиска кода:", e);
  }
  return op || null;
}

async function deleteOpFile(opId, filename){
  return api("/api/ops/"+encodeURIComponent(opId)+"/files/"+encodeURIComponent(filename), {
    method:"DELETE"
  });
}

async function openOpFilesModal(op){
  const modal = document.createElement("div");
  modal.className = "op-files-modal";
  modal.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:16px;overflow-y:auto;-webkit-overflow-scrolling:touch;";
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:520px;width:100%;padding:16px;box-shadow:0 20px 50px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:12px;max-height:90vh;overflow-y:auto;-webkit-overflow-scrolling:touch;margin:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-shrink:0">
        <div style="font-weight:800;font-size:15px">📎 Файлы по операции</div>
        <button data-a="close" class="btn ghost" style="padding:6px 10px;font-weight:700">Закрыть</button>
      </div>
      <div style="font-size:12px;color:var(--muted);flex-shrink:0">
        Заказ: <b>${esc(op.order_id||"—")}</b> · Операция: <b>${esc(op.name||"—")}</b> · Машина: <b>${esc(op.machine||"—")}</b>
      </div>
      <div id="filesList" style="border:1px solid var(--border);border-radius:8px;padding:10px;min-height:80px;background:rgba(0,0,0,.02);flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>
      <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
        <label style="font-size:12px;font-weight:700;color:var(--text)">Загрузить файл (PDF/PNG/SVG/JPG и др.)</label>
        <input id="fileInput" type="file" accept=".pdf,.png,.jpg,.jpeg,.svg,.webp,.gif,.bmp,.tiff,.heic,.heif,.psd,.ai,.eps,.txt,.csv,.xlsx,.xls,.doc,.docx,.ppt,.pptx,image/*" style="font-size:12px;width:100%;box-sizing:border-box">
        <button class="btn accent" data-a="upload" style="padding:10px 14px;font-weight:700;width:100%;box-sizing:border-box">Загрузить</button>
      </div>
    </div>
  `;
  const listEl = modal.querySelector("#filesList");
  const close = ()=> modal.remove();
  modal.querySelector('[data-a="close"]').onclick = close;
  modal.onclick = (e)=>{ if(e.target===modal) close(); };
  document.body.appendChild(modal);

  const renderList = (files)=>{
    if(!files || files.length===0){
      listEl.innerHTML = `<div style="font-size:12px;color:var(--muted)">Нет файлов</div>`;
      return;
    }
    const isImage = (name)=> /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(name||"");
    const isPdf = (name)=> /\.pdf$/i.test(name||"");
    listEl.innerHTML = files.map(f=>{
      const thumb = isImage(f.filename)
        ? `<img src="${esc(f.url)}" alt="${esc(f.filename)}" style="max-width:140px;max-height:120px;border:1px solid rgba(0,0,0,.1);border-radius:6px;object-fit:contain;background:#fff">`
        : isPdf(f.filename)
          ? `<iframe src="${esc(f.url)}#view=FitH" style="width:140px;height:120px;border:1px solid rgba(0,0,0,.1);border-radius:6px;background:#fff"></iframe>`
          : `<div style="width:140px;height:120px;display:flex;align-items:center;justify-content:center;border:1px dashed rgba(0,0,0,.2);border-radius:6px;font-size:11px;color:var(--muted)">Файл</div>`;
      return `
        <div style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(0,0,0,.05);font-size:12px">
          <div>${thumb}</div>
          <div style="flex:1;min-width:0">
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              <a href="${esc(f.url)}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:700">${esc(f.filename)}</a>
            </div>
            <div style="font-size:11px;color:var(--muted)">${(Number(f.size||0)/1024).toFixed(1)} КБ · ${f.uploaded_at ? new Date(f.uploaded_at).toLocaleString() : ""}</div>
          </div>
          <button class="btn ghost danger" data-fname="${esc(f.filename)}" style="padding:4px 8px;font-size:11px;font-weight:700">Удалить</button>
        </div>
      `;
    }).join("");
    listEl.querySelectorAll('[data-fname]').forEach(btn=>{
      btn.onclick = async ()=>{
        const fname = btn.dataset.fname;
        if(!confirm(`Удалить файл "${fname}"?`)) return;
        try{
          await deleteOpFile(op.id, fname);
          toast("Файл удалён");
          await reload();
        }catch(e){
          alert("Ошибка удаления: " + e.message);
        }
      };
    });
  };

  const reload = async ()=>{
    try{
      const files = await fetchOpFiles(op.id);
      renderList(files);
    }catch(e){
      listEl.innerHTML = `<div style="color:red;font-size:12px">Ошибка загрузки списка: ${esc(e.message||e)}</div>`;
    }
  };
  await reload();

  const uploadBtn = modal.querySelector('[data-a="upload"]');
  if(uploadBtn){
    uploadBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
    const inp = modal.querySelector("#fileInput");
      if(!inp || !inp.files || !inp.files[0]){ 
        alert("Выберите файл"); 
        return; 
      }
    const file = inp.files[0];
    try{
        uploadBtn.disabled = true;
        uploadBtn.textContent = "Загрузка...";
      await uploadOpFile(op.id, file);
      toast("Файл загружен");
      inp.value = "";
      await reload();
    }catch(e){
        alert("Ошибка загрузки: " + (e.message || e));
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = "Загрузить";
    }
  };
}
}
window.openOpFilesModal = openOpFilesModal;
// currentUser, $, esc, todayISO, formatDate, uid are loaded from js/utils.js and js/state.js

// Toast - adapted for HTML structure
function toast(msg, duration){
  const t=$("toast"), m=$("toastMsg");
  if(m) m.textContent = msg;
  if(t) { 
    // Для мобильной версии устанавливаем 3 секунды, для десктопа - 2.2 секунды
    const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    const displayDuration = duration !== undefined ? duration : (isMobile ? 3000 : 2200);
    t.style.display="block"; 
    setTimeout(()=>t.style.display="none", displayDuration); 
  }
}
window.toast = toast;

async function ensureMaterialsLoaded(){
  if(!currentUser) return;
  state.materials = await window.CatalogState.read('/api/materials');
}

async function openTemplateBomModal(templateName){
  await ensureMaterialsLoaded();
  if(!currentUser || currentUser.role !== "admin"){
    toast("Только для администратора");
    return;
  }
  const modal = document.createElement("div");
  modal.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px;";
  modal.innerHTML = `
    <div class="card" style="width:100%;max-width:760px;max-height:90vh;overflow:auto;padding:16px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <div style="font-weight:900;font-size:16px">📦 Рецептура шаблона (на 1 изделие)</div>
          <div class="hint" style="margin-top:4px">${esc(templateName||"")}</div>
        </div>
        <button class="btn ghost" data-a="close">Закрыть</button>
      </div>
      <div class="hint">Укажите материалы и количество <b>на 1 изделие</b> (шт/кг/м² — как вы ведёте единицы).</div>
      <div style="height:10px"></div>
      <table class="resizable-table">
        <thead><tr><th style="width:300px">Материал</th><th style="width:160px">Кол-во на 1</th><th style="width:90px"></th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
      <div class="row" style="gap:10px;margin-top:10px;flex-wrap:wrap">
        <button class="btn ghost" data-a="add">+ Строка</button>
        <div style="flex:1"></div>
        <button class="btn accent" data-a="save">Сохранить</button>
      </div>
    </div>
  `;
  const close = ()=> modal.remove();
  modal.querySelector('[data-a="close"]').onclick = close;
  modal.onclick = (e)=>{ if(e.target===modal) close(); };
  document.body.appendChild(modal);

  const listEl = modal.querySelector("#rows");
  const mats = state.materials || [];
  const buildRow = (item={ material_id:"", qty_per_unit:1 })=>{
    const tr = document.createElement("tr");
    const options = ['<option value="">— выбрать —</option>']
      .concat(mats.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}${m.unit?` (${esc(m.unit)})`:""} · остаток: ${formatStock(m.stock)}</option>`))
      .join("");
    tr.innerHTML = `
      <td><select data-k="material_id" style="min-width:280px">${options}</select></td>
      <td><input data-k="qty_per_unit" type="number" step="0.0001" min="0" value="${esc(String(item.qty_per_unit ?? 1))}"></td>
      <td><button class="btn ghost danger" data-a="rm">×</button></td>
    `;
    tr.querySelector('[data-k="material_id"]').value = item.material_id || "";
    tr.querySelector('[data-a="rm"]').onclick = ()=> tr.remove();
    return tr;
  };

  let current = [];
  try{
    const data = await api("/api/templates-bom?name="+encodeURIComponent(templateName));
    current = Array.isArray(data?.items) ? data.items : [];
  }catch(_e){ current = []; }
  if(current.length === 0) listEl.appendChild(buildRow());
  else for(const it of current) listEl.appendChild(buildRow({ material_id: it.material_id, qty_per_unit: it.qty_per_unit }));

  modal.querySelector('[data-a="add"]').onclick = ()=> listEl.appendChild(buildRow());
  modal.querySelector('[data-a="save"]').onclick = async ()=>{
    const items = Array.from(listEl.querySelectorAll("tr")).map(tr=>{
      const material_id = tr.querySelector('[data-k="material_id"]').value;
      const qty_per_unit = parseFloat(String(tr.querySelector('[data-k="qty_per_unit"]').value || "0").replace(",", "."));
      return { material_id, qty_per_unit };
    }).filter(x=>x.material_id && isFinite(x.qty_per_unit) && x.qty_per_unit>0);
    try{
      await api("/api/templates-bom", { method:"PUT", body: JSON.stringify({ name: templateName, items }) });
      toast("Рецептура шаблона сохранена");
      close();
    }catch(e){
      alert("Ошибка: "+e.message);
    }
  };
}

// === Модальное окно печати штрихкода для изделия ===
async function openItemBarcodeModal(item, orderId){
  if(!currentUser || currentUser.role !== "admin"){
    toast("Только для администратора");
    return;
  }
  await ensureMaterialsLoaded();
  
  // Получаем актуальные данные заказа из базы данных
  let order = null;
  try {
    const orderData = await api("/api/orders/" + encodeURIComponent(orderId));
    if (orderData) {
      order = orderData;
    } else {
      // Fallback на state, если API не вернул данные
      order = (state.orders||[]).find(o=> o.id === orderId);
    }
  } catch(e) {
    console.warn("Ошибка загрузки заказа, используем данные из state:", e);
    order = (state.orders||[]).find(o=> o.id === orderId);
  }
  
  // Получаем актуальные операции для этого изделия из базы данных
  let itemOps = [];
  try {
    const opsData = await api("/api/ops?order_id=" + encodeURIComponent(orderId));
    if (Array.isArray(opsData)) {
      itemOps = opsData.filter(o => o.order_item_id === item.id);
    } else {
      // Fallback на state, если API не вернул данные
      itemOps = (state.ops||[]).filter(o=> o.order_id === orderId && o.order_item_id === item.id);
    }
  } catch(e) {
    console.warn("Ошибка загрузки операций, используем данные из state:", e);
    itemOps = (state.ops||[]).filter(o=> o.order_id === orderId && o.order_item_id === item.id);
  }
  
  // Получаем актуальные данные изделия из базы данных
  let actualItem = item;
  try {
    const itemData = await api("/api/order-items/" + encodeURIComponent(item.id));
    if (itemData) {
      actualItem = itemData;
    }
  } catch(e) {
    console.warn("Ошибка загрузки изделия, используем данные из state:", e);
    actualItem = item;
  }
  
  // Получаем BOM изделия из item_bom (НЕ из шаблона!)
  let itemBom = [];
  try{
    const res = await api("/api/order-items/"+encodeURIComponent(item.id)+"/bom");
    console.log('[openItemBarcodeModal] Загружена рецептура для изделия:', {
      itemId: item.id,
      bomResponse: res,
      itemsCount: res?.items?.length || 0,
      items: res?.items || []
    });
    itemBom = Array.isArray(res?.items) ? res.items : [];
    if (itemBom.length === 0) {
      console.warn('[openItemBarcodeModal] Рецептура пустая в item_bom для изделия:', item.id);
    }
  }catch(e){
    console.error('[openItemBarcodeModal] Ошибка загрузки рецептуры:', e);
  }
  
  // Вычисляем даты: минимальная дата и максимальная дата+время из операций
  let minDate = "", maxDate = "";
  let totalPlannedSec = 0;
  
  // Функция для извлечения времени из диапазона (например, "08:00–10:00" -> "08:00")
  const extractTime = (timeStr) => {
    if (!timeStr) return "";
    // Поддержка разных тире: обычное тире, длинное тире, дефис
    const parts = timeStr.split(/[-–—]/);
    const firstTime = parts[0]?.trim() || "";
    // Проверяем, что это валидный формат времени HH:mm
    if (/^\d{2}:\d{2}$/.test(firstTime)) {
      return firstTime;
    }
    return "";
  };
  
  for(const op of itemOps){
    if(op.date && (!minDate || op.date < minDate)) minDate = op.date;
    if(op.date && (!maxDate || op.date > maxDate)) maxDate = op.date;
    totalPlannedSec += (parseInt(op.planned_duration||0,10)||0) + (parseInt(op.planned_setup_time||0,10)||0);
  }
  
  // Извлекаем время начала и окончания из операций
  const startTimeValue = itemOps.length > 0 ? extractTime(itemOps[0]?.time) : "";
  const endTimeValue = itemOps.length > 0 ? extractTime(itemOps[itemOps.length-1]?.time) : "";
  
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content" style="max-width:700px;width:100%">
      <div class="modal-header">
        <h3 style="margin:0">🖨 Печать штрихкода изделия</h3>
        <button class="modal-close" data-a="close">×</button>
      </div>
      <div class="modal-body" style="padding:20px">
        <div class="card" style="margin:0 0 16px;background:var(--bg)">
          <div style="font-weight:900;font-size:18px;margin-bottom:8px">
            ${esc(actualItem.type||"")} ${actualItem.title ? `· ${esc(actualItem.title)}` : ""}
          </div>
          <div class="row" style="gap:16px;flex-wrap:wrap">
            <div><b>Заказ:</b> ${esc(orderId)}</div>
            <div><b>Клиент:</b> ${esc(order?.client||"")}</div>
            <div><b>План:</b> ${esc(String(actualItem.qty_plan||0))} шт</div>
          </div>
        </div>
        
        <div class="row" style="gap:12px;margin-bottom:16px;flex-wrap:wrap">
          <div class="field" style="min-width:200px;flex:1">
            <label>👤 Оператор (для печати)</label>
            <select id="bc_operator">
              <option value="">— не указан —</option>
              ${(state.operators||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join("")}
            </select>
          </div>
          <div class="field" style="min-width:140px">
            <label>📅 Дата начала</label>
            <input type="date" id="bc_start_date" value="${esc(minDate)}">
          </div>
          <div class="field" style="min-width:100px">
            <label>🕐 Время</label>
            <input type="time" id="bc_start_time" value="${esc(startTimeValue || "08:00")}">
          </div>
          <div class="field" style="min-width:140px">
            <label>📅 Дата окончания</label>
            <input type="date" id="bc_end_date" value="${esc(maxDate || minDate)}">
          </div>
          <div class="field" style="min-width:100px">
            <label>🕐 Время</label>
            <input type="time" id="bc_end_time" value="${esc(endTimeValue || "18:00")}">
          </div>
        </div>
        
        <div class="card" style="margin:0 0 16px">
          <h4 style="margin:0 0 8px">📦 Рецептура (BOM)</h4>
          ${itemBom.length > 0 ? `
            <table style="font-size:13px">
              <thead><tr><th>Материал</th><th>На 1 шт</th><th>Всего</th></tr></thead>
              <tbody>
                ${itemBom.map(b=>{
                  const mat = (state.materials||[]).find(m=>m.id===b.material_id);
                  // Используем ту же формулу, что и в модальном окне: (На 1 шт × Тираж) ÷ Заготовок из 1 ед.
                  const qtyPerUnit = Number(b.qty_per_unit||0)||0;
                  const qtyFromMaterial = Number(b.qty_from_material||1)||1;
                  const itemQty = Number(actualItem.qty_plan||0)||0;
                  const need = qtyFromMaterial > 0 ? Math.ceil((qtyPerUnit * itemQty) / qtyFromMaterial * 100) / 100 : 0;
                  return `
                    <tr>
                      <td>${mat ? esc(mat.name) : esc(b.material_id)}</td>
                      <td class="mono">${formatStock(qtyPerUnit)}</td>
                      <td class="mono" style="font-weight:700">${formatStock(need)}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          ` : `<div style="color:var(--muted)">Нет материалов</div>`}
        </div>
        
        <div class="card" style="margin:0 0 16px">
          <h4 style="margin:0 0 8px">📋 Все операции по изделию (${itemOps.length})</h4>
          ${itemOps.length > 0 ? `
            <div style="max-height:300px;overflow:auto">
            <table style="font-size:12px">
              <thead><tr><th>№</th><th>Откуда</th><th>Операция</th><th>Машина</th><th>Куда</th><th>Оператор</th><th>Дата</th><th>Время</th></tr></thead>
              <tbody>
                ${itemOps.map(o=>{
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
                  const inputSources = o.input_sources || null;
                  const outputTargets = o.output_targets || null;
                  const inputCritical = o.input_critical || 0;
                  const outputCritical = o.output_critical || 0;
                  return `
                  <tr>
                    <td>${esc(String(o.no||""))}</td>
                    <td>${formatSources(inputSources, true)}${inputCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : ''}</td>
                    <td><b>${esc(o.name||"")}</b></td>
                    <td>${esc(o.machine||"")}</td>
                    <td>${formatSources(outputTargets, false)}${outputCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : ''}</td>
                    <td>${esc(o.operator||"")}</td>
                    <td>${esc(o.date||"")}</td>
                    <td>${esc(o.time||"")}</td>
                  </tr>
                `;
                }).join("")}
              </tbody>
            </table>
            </div>
          ` : `<div style="color:var(--muted)">Нет операций</div>`}
        </div>
        
        <div style="text-align:center;padding:16px;border:2px dashed var(--border);border-radius:8px;margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:8px">Штрихкод изделия:</div>
          <svg id="bc_barcode_svg" style="max-width:100%"></svg>
          <div class="mono" style="margin-top:8px;font-size:14px;font-weight:700" id="bc_item_code">${esc(item.id.slice(0,8).toUpperCase())}</div>
        </div>
        
        <div class="row" style="gap:10px;justify-content:flex-end">
          <button class="btn ghost" data-a="close">Отмена</button>
          <button class="btn primary" data-a="print">🖨 Печать</button>
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
  modal.querySelector('.modal-close').onclick = close;
  modal.onclick = (e)=>{ if(e.target===modal) close(); };
  
  // Генерируем штрихкод (используем JsBarcode если подключён)
  const barcodeValue = item.id.slice(0,12).toUpperCase();
  const barcodeSvg = modal.querySelector("#bc_barcode_svg");
  
  // Пробуем использовать JsBarcode если есть
  if(typeof JsBarcode !== "undefined"){
    try{
      JsBarcode(barcodeSvg, barcodeValue, { format: "CODE128", width: 2, height: 60, displayValue: false });
    }catch(_e){
      barcodeSvg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" font-size="12" fill="var(--muted)">Штрихкод</text>`;
    }
  } else {
    // Fallback: простой CSS штрихкод-имитация
    barcodeSvg.outerHTML = `<div id="bc_barcode_svg" style="font-family:monospace;font-size:24px;letter-spacing:4px;background:linear-gradient(90deg, #000 2px, transparent 2px) 0 0 / 4px 60px repeat-x;height:60px;display:flex;align-items:center;justify-content:center"></div>`;
  }
  
  // Печать
  modal.querySelector('[data-a="print"]').onclick = async ()=>{
    const operator = modal.querySelector("#bc_operator").value;
    const startDate = modal.querySelector("#bc_start_date").value;
    const startTime = modal.querySelector("#bc_start_time").value;
    const endDate = modal.querySelector("#bc_end_date").value;
    const endTime = modal.querySelector("#bc_end_time").value;
    
    // ПЕРЕЗАГРУЖАЕМ актуальные данные перед печатью
    let printItem = actualItem;
    let printItemBom = itemBom;
    let printOrder = order;
    let printItemOps = itemOps;
    
    try {
      // Перезагружаем актуальные данные изделия
      const freshItemData = await api("/api/order-items/" + encodeURIComponent(item.id));
      if (freshItemData) {
        printItem = freshItemData;
      }
      
      // Перезагружаем актуальную рецептуру изделия из item_bom (НЕ из шаблона!)
      const freshBomRes = await api("/api/order-items/"+encodeURIComponent(item.id)+"/bom");
      console.log('[PRINT] Загружена рецептура для изделия:', {
        itemId: item.id,
        bomResponse: freshBomRes,
        itemsCount: freshBomRes?.items?.length || 0,
        items: freshBomRes?.items || []
      });
      
      if (freshBomRes && Array.isArray(freshBomRes.items)) {
        printItemBom = freshBomRes.items;
        console.log('[PRINT] Используется рецептура из item_bom:', printItemBom.length, 'материалов');
      } else {
        console.warn('[PRINT] Рецептура не найдена в item_bom для изделия:', item.id);
        printItemBom = [];
      }
      
      // Перезагружаем актуальные данные заказа
      const freshOrderData = await api("/api/orders/" + encodeURIComponent(orderId));
      if (freshOrderData) {
        printOrder = freshOrderData;
      }
      
      // Перезагружаем актуальные операции для этого изделия
      const freshOpsData = await api("/api/ops?order_id=" + encodeURIComponent(orderId));
      if (Array.isArray(freshOpsData)) {
        printItemOps = freshOpsData.filter(o => o.order_item_id === item.id);
      }
    } catch(e) {
      console.warn("Ошибка перезагрузки данных перед печатью, используем загруженные ранее:", e);
    }
    
    // Формируем HTML для печати - рецептура (используем ТОЛЬКО актуальные данные из item_bom, НЕ из шаблона!)
    console.log('[PRINT] Формирование HTML для печати:', {
      itemId: item.id,
      printItemBomCount: printItemBom.length,
      printItemQtyPlan: printItem.qty_plan,
      printItemBom: printItemBom,
      source: 'item_bom (НЕ из шаблона!)'
    });
    
    // ВАЖНО: Используем ТОЛЬКО данные из item_bom, НЕ из product_template_bom!
    // Если printItemBom пустой, значит рецептура не указана для этого изделия в заказе
    if (printItemBom.length === 0) {
      console.error('[PRINT] ОШИБКА: Рецептура пустая в item_bom для изделия:', item.id);
      console.error('[PRINT] Нужно указать рецептуру через кнопку "Рецептура" (📦) рядом с кнопкой печати');
    }
    
    // Функция расчета нужного количества (та же формула, что и в модальном окне)
    const calcNeeded = (qtyPerUnit, qtyFromMaterial, itemQty) => {
      const qpu = parseFloat(qtyPerUnit) || 0;
      const qfm = parseFloat(qtyFromMaterial) || 1;
      const q = parseFloat(itemQty) || 1;
      if(qfm <= 0) return 0;
      return Math.ceil((qpu * q) / qfm * 100) / 100; // Округляем до 2 знаков вверх
    };
    
    const bomHtml = printItemBom.length > 0 
      ? printItemBom.map(b=>{
          const mat = (state.materials||[]).find(m=>m.id===b.material_id);
          const qtyPerUnit = Number(b.qty_per_unit||0)||0;
          const qtyFromMaterial = Number(b.qty_from_material||1)||1;
          const itemQty = Number(printItem.qty_plan||0)||0;
          // Используем ту же формулу, что и в модальном окне: (На 1 шт × Тираж) ÷ Заготовок из 1 ед.
          const need = calcNeeded(qtyPerUnit, qtyFromMaterial, itemQty);
          
          console.log('[PRINT] Материал в рецептуре (из item_bom):', {
            material_id: b.material_id,
            material_name: mat?.name || b.material_id,
            qty_per_unit: qtyPerUnit,
            qty_from_material: qtyFromMaterial,
            item_qty: itemQty,
            total_need: need,
            formula: `(${qtyPerUnit} × ${itemQty}) ÷ ${qtyFromMaterial} = ${need}`,
            source: 'item_bom'
          });
          
          return `<tr><td>${mat ? mat.name : b.material_id}${mat?.unit ? " ("+mat.unit+")" : ""}</td><td style="text-align:right">${formatStock(qtyPerUnit)}</td><td style="text-align:right;font-weight:bold">${formatStock(need)}</td></tr>`;
        }).join("") 
      : "<tr><td colspan='3' style='color:#ff4d4d;font-weight:bold'>⚠️ Рецептура не указана для этого изделия!<br>Используйте кнопку '📦 Рецептура' рядом с кнопкой печати, чтобы указать материалы для этого изделия в заказе.</td></tr>";
    
    // Функция форматирования направлений для печати (каждое значение на новой строке)
    const formatSourcesForPrint = (sources) => {
      if (!sources) return '—';
      let parsed = [];
      try {
        parsed = typeof sources === 'string' ? JSON.parse(sources) : sources;
      } catch(e) {
        parsed = [sources];
      }
      if (!Array.isArray(parsed)) parsed = [parsed];
      if (parsed.length === 0) return '—';
      
      const labels = {
        'warehouse': '🏭 Склад',
        'warehouse_rest': '💤 Отдых',
      };
      
      // Каждое значение на новой строке (через <br> для HTML печати)
      return parsed.map(s => {
        const label = labels[s] || `⚙️ ${String(s)}`;
        return label;
      }).join('<br>');
    };
    
    // Все операции для печати (используем актуальные данные)
    const opsHtml = printItemOps.length > 0
      ? printItemOps.map(o=>{
          const inputSources = formatSourcesForPrint(o.input_sources);
          const outputTargets = formatSourcesForPrint(o.output_targets);
          const inputCritical = o.input_critical ? ' ⚠' : '';
          const outputCritical = o.output_critical ? ' ⚠' : '';
          return `<tr><td>${o.no||""}</td><td>${inputSources}${inputCritical}</td><td><b>${o.name||""}</b></td><td>${o.machine||""}</td><td>${outputTargets}${outputCritical}</td><td>${o.operator||""}</td><td>${o.date||""}</td><td>${o.time||""}</td></tr>`;
        }).join("")
      : "<tr><td colspan='8' style='color:#999'>Нет операций</td></tr>";
    
    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Изделие: ${printItem.type} ${printItem.title||""}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11px; padding: 8mm; margin: 0; }
          h1 { font-size: 16px; margin: 0 0 8px; border-bottom: 2px solid #000; padding-bottom: 5px; }
          h2 { font-size: 13px; margin: 15px 0 6px; border-bottom: 1px solid #000; padding-bottom: 3px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 10px; }
          th, td { border: 1px solid #999; padding: 3px 5px; text-align: left; }
          th { background: #e0e0e0; font-weight: bold; }
          .info { display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 8px; font-size: 11px; }
          .info div { margin-right: 10px; }
          .barcode { text-align: center; margin: 12px 0; padding: 10px; border: 2px solid #000; }
          .barcode-text { font-family: monospace; font-size: 14px; font-weight: bold; letter-spacing: 3px; }
          .header-box { background: #f5f5f5; padding: 8px; border: 1px solid #ccc; margin-bottom: 10px; }
          @media print { 
            body { padding: 5mm; } 
            @page { margin: 5mm; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <h1>📦 ${printItem.type}${printItem.title ? " · " + printItem.title : ""}</h1>
          <div class="info">
            <div><b>Заказ:</b> ${orderId}</div>
            <div><b>Клиент:</b> ${printOrder?.client||""}</div>
            <div><b>Кол-во:</b> ${printItem.qty_plan||0} шт</div>
            ${operator ? `<div><b>👤 Оператор:</b> ${operator}</div>` : ""}
          </div>
          <div class="info">
            <div><b>📅 Начало:</b> ${startDate} ${startTime}</div>
            <div><b>📅 Окончание:</b> ${endDate} ${endTime}</div>
          </div>
        </div>
        
        <div class="barcode">
          <div style="font-family:monospace;font-size:24px;letter-spacing:5px;margin-bottom:5px">|||||||||||||||||||||||</div>
          <div class="barcode-text">${barcodeValue}</div>
        </div>
        
        <h2>📦 Рецептура (материалы на ${printItem.qty_plan||0} шт)</h2>
        <table>
          <tr><th style="width:50%">Материал</th><th style="width:25%">На 1 шт</th><th style="width:25%">Всего</th></tr>
          ${bomHtml}
        </table>
        
        <h2>📋 Маршрут операций (${printItemOps.length})</h2>
        <table>
          <tr><th style="width:30px">№</th><th>Откуда</th><th>Операция</th><th>Машина</th><th>Куда</th><th>Оператор</th><th>Дата</th><th>Время</th></tr>
          ${opsHtml}
        </table>
        
        <scr` + `ipt>window.onload = function(){ window.print(); }</scr` + `ipt>
      </body>
      </html>
    `;
    
    const printWindow = window.open("", "_blank", "width=800,height=600");
    if(printWindow){
      printWindow.document.write(printHtml);
      printWindow.document.close();
    } else {
      alert("Разрешите всплывающие окна для печати");
    }
  };
}

// Старая версия openItemBomModal - заменена на openItemBomModalNew
async function openItemBomModal_OLD(item){
  await ensureMaterialsLoaded();
  if(!currentUser || currentUser.role !== "admin"){
    toast("Только для администратора");
    return;
  }
  const modal = document.createElement("div");
  modal.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px;";
  modal.innerHTML = `
    <div class="card" style="width:100%;max-width:820px;max-height:90vh;overflow:auto;padding:16px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <div style="font-weight:900;font-size:16px">📦 Рецептура изделия (на 1 изделие)</div>
          <div class="hint" style="margin-top:4px"><b>${esc(item.type||"")}</b> ${item.title?`· ${esc(item.title)}`:""} · план: <b>${esc(String(item.qty_plan||0))}</b></div>
        </div>
        <button class="btn ghost" data-a="close">Закрыть</button>
      </div>
      <div class="hint">Списание произойдёт при <b>закрытии изделия</b>: количество_на_1 × план изделия.</div>
      <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:10px">
        <button class="btn ghost" data-a="copy-from-template">Скопировать из рецептуры шаблона</button>
        <div style="flex:1"></div>
        <button class="btn accent" data-a="save">Сохранить</button>
      </div>
      <div style="height:10px"></div>
      <table class="resizable-table">
        <thead><tr><th style="width:250px">Материал</th><th style="width:100px">Кол-во на 1</th><th style="width:120px">Нужно всего</th><th style="width:100px">Остаток</th><th style="width:70px"></th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  `;
  const close = ()=> modal.remove();
  modal.querySelector('[data-a="close"]').onclick = close;
  modal.onclick = (e)=>{ if(e.target===modal) close(); };
  document.body.appendChild(modal);

  const listEl = modal.querySelector("#rows");
  const mats = state.materials || [];
  const qtyPlan = Number(item.qty_plan||0)||0;

  const buildRow = (row={ material_id:"", qty_per_unit:1 })=>{
    const tr = document.createElement("tr");
    const options = ['<option value="">— выбрать —</option>']
      .concat(mats.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}${m.unit?` (${esc(m.unit)})`:""}</option>`))
      .join("");
    tr.innerHTML = `
      <td><select data-k="material_id" style="min-width:300px">${options}</select></td>
      <td><input data-k="qty_per_unit" type="number" step="0.0001" min="0" value="${esc(String(row.qty_per_unit ?? 1))}"></td>
      <td><span data-k="need_total" class="mono">—</span></td>
      <td><span data-k="stock" class="mono">—</span></td>
      <td><button class="btn ghost danger" data-a="rm">×</button></td>
    `;
    tr.querySelector('[data-k="material_id"]').value = row.material_id || "";
    tr.querySelector('[data-a="rm"]').onclick = ()=> tr.remove();

    const recalc = ()=>{
      const mid = tr.querySelector('[data-k="material_id"]').value;
      const per = parseFloat(String(tr.querySelector('[data-k="qty_per_unit"]').value||"0").replace(",", "."));
      const m = mats.find(x=>x.id===mid);
      tr.querySelector('[data-k="stock"]').textContent = formatStock(m ? m.stock : 0);
      const need = (isFinite(per)?per:0) * qtyPlan;
      tr.querySelector('[data-k="need_total"]').textContent = formatStock(need);
    };
    tr.querySelector('[data-k="material_id"]').onchange = recalc;
    tr.querySelector('[data-k="qty_per_unit"]').oninput = recalc;
    recalc();
    return tr;
  };

  let current = [];
  try{
    const data = await api("/api/order-items/"+encodeURIComponent(item.id)+"/bom");
    current = Array.isArray(data?.items) ? data.items : [];
  }catch(_e){ current = []; }
  listEl.innerHTML = "";
  if(current.length === 0) listEl.appendChild(buildRow());
  else for(const r of current) listEl.appendChild(buildRow({ material_id:r.material_id, qty_per_unit:r.qty_per_unit }));

  modal.querySelector('[data-a="copy-from-template"]').onclick = async ()=>{
    const templateName = prompt("Название шаблона (как в настройках шаблонов):", state.currentTemplate||"");
    if(templateName===null) return;
    try{
      const res = await api("/api/order-items/"+encodeURIComponent(item.id)+"/bom/copy-from-template", {
        method:"POST",
        body: JSON.stringify({ templateName: templateName.trim() })
      });
      const items = Array.isArray(res?.items) ? res.items : [];
      listEl.innerHTML = "";
      if(items.length===0) listEl.appendChild(buildRow());
      else for(const r of items) listEl.appendChild(buildRow({ material_id:r.material_id, qty_per_unit:r.qty_per_unit }));
      toast("Скопировано из шаблона");
    }catch(e){
      alert("Ошибка: "+e.message);
    }
  };

  modal.querySelector('[data-a="save"]').onclick = async ()=>{
    const items = Array.from(listEl.querySelectorAll("tr")).map(tr=>{
      const material_id = tr.querySelector('[data-k="material_id"]').value;
      const qty_per_unit = parseFloat(String(tr.querySelector('[data-k="qty_per_unit"]').value||"0").replace(",", "."));
      return { material_id, qty_per_unit };
    }).filter(x=>x.material_id && isFinite(x.qty_per_unit) && x.qty_per_unit>0);
    try{
      await api("/api/order-items/"+encodeURIComponent(item.id)+"/bom", {
        method:"PUT",
        body: JSON.stringify({ items })
      });
      await refreshAll(false);
      toast("Рецептура изделия сохранена");
      close();
    }catch(e){
      alert("Ошибка: "+e.message);
    }
  };
}

// Обновлённая версия openItemBomModal - использует openWizardItemBomModal
async function openItemBomModal(item){
  await ensureMaterialsLoaded();
  if(!currentUser || currentUser.role !== "admin"){
    toast("Только для администратора");
    return;
  }
  
  const templateId = item.template_id || null;
  const qtyPlan = Number(item.qty_plan||0)||0;
  
  // ВАЖНО: Загружаем рецептуру ТОЛЬКО из item_bom для этого конкретного изделия в заказе
  let currentBom = [];
  try{
    const data = await api("/api/order-items/"+encodeURIComponent(item.id)+"/bom");
    console.log('[openItemBomModal] Загружена рецептура из item_bom для модального окна редактирования:', {
      itemId: item.id,
      endpoint: '/api/order-items/' + item.id + '/bom',
      bomData: data,
      itemsCount: data?.items?.length || 0,
      items: data?.items || [],
      source: 'item_bom (таблица item_bom в базе данных)',
      note: 'Эти же данные будут использоваться в распечатке'
    });
    currentBom = Array.isArray(data?.items) ? data.items.map(b=>({
      material_id: b.material_id,
      qty_per_unit: b.qty_per_unit || 0,
      qty_from_material: b.qty_from_material || 1
    })) : [];
    if (currentBom.length === 0) {
      console.warn('[openItemBomModal] ⚠️ Рецептура пустая в item_bom для изделия:', item.id);
      console.warn('[openItemBomModal] Добавьте материалы в модальном окне и сохраните');
    } else {
      console.log('[openItemBomModal] ✅ Рецептура загружена:', currentBom.length, 'материалов');
    }
  }catch(e){
    console.error('[openItemBomModal] Ошибка загрузки рецептуры из item_bom:', e);
    currentBom = [];
  }
  
  // Передаем currentBom в модальное окно (НЕ используем fallback на шаблон в модальном окне)
  const newBom = await openWizardItemBomModal(templateId, currentBom, item.type, qtyPlan);
  
  if(newBom !== null){
    // Сохраняем рецептуру для этого конкретного заказа
    try{
      await api("/api/order-items/"+encodeURIComponent(item.id)+"/bom", {
        method:"PUT",
        body: JSON.stringify({ 
          items: newBom.map(b=>({
            material_id: b.material_id,
            qty_per_unit: b.qty_per_unit,
            qty_from_material: b.qty_from_material || 1
          }))
        })
      });
      await refreshAll(false);
      toast("✅ Рецептура сохранена для этого заказа");
    }catch(e){
      alert("Ошибка сохранения: " + e.message);
    }
  }
}

function formatStock(x){
  const n = Number(x);
  if(!isFinite(n)) return "0";
  // до 2 знаков, без лишних нулей
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/,"");
}

async function openTemplateMaterialsModal(tpl){
  await ensureMaterialsLoaded();
  if(!currentUser || currentUser.role !== "admin"){
    toast("Только для администратора");
    return;
  }
  const modal = document.createElement("div");
  modal.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px;";
  modal.innerHTML = `
    <div class="card" style="width:100%;max-width:720px;max-height:90vh;overflow:auto;padding:16px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <div style="font-weight:900;font-size:16px">📦 Материалы (шаблон)</div>
          <div class="hint" style="margin-top:4px">
            ${esc(tpl.name||"")} · №${esc(String(tpl.no||""))} · ${esc(tpl.operation_name||"")}
          </div>
        </div>
        <button class="btn ghost" data-a="close">Закрыть</button>
      </div>
      <div class="hint">Можно указать несколько материалов и количество для этой операции шаблона.</div>
      <div style="height:10px"></div>
      <table class="resizable-table">
        <thead><tr><th style="width:300px">Материал</th><th style="width:140px">Кол-во</th><th style="width:80px"></th></tr></thead>
        <tbody id="matRows"></tbody>
      </table>
      <div class="row" style="gap:10px;margin-top:10px;flex-wrap:wrap">
        <button class="btn ghost" data-a="add">+ Добавить строку</button>
        <div style="flex:1"></div>
        <button class="btn accent" data-a="save">Сохранить</button>
      </div>
    </div>
  `;
  const close = ()=> modal.remove();
  modal.querySelector('[data-a="close"]').onclick = close;
  modal.onclick = (e)=>{ if(e.target===modal) close(); };
  document.body.appendChild(modal);

  const listEl = modal.querySelector("#matRows");
  const materials = state.materials || [];

  const buildRow = (item={ material_id:"", qty:1 })=>{
    const tr = document.createElement("tr");
    const options = ['<option value="">— выбрать —</option>']
      .concat(materials.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}${m.unit?` (${esc(m.unit)})`:""} · остаток: ${formatStock(m.stock)}</option>`))
      .join("");
    tr.innerHTML = `
      <td>
        <select data-k="material_id" style="min-width:260px">${options}</select>
      </td>
      <td>
        <input data-k="qty" type="number" step="0.01" min="0" value="${esc(String(item.qty ?? 1))}">
      </td>
      <td><button class="btn ghost danger" data-a="rm">×</button></td>
    `;
    tr.querySelector('[data-k="material_id"]').value = item.material_id || "";
    tr.querySelector('[data-a="rm"]').onclick = ()=> tr.remove();
    return tr;
  };

  let current = [];
  try{
    const data = await api("/api/templates/"+encodeURIComponent(tpl.id)+"/materials");
    current = Array.isArray(data?.items) ? data.items : [];
  }catch(_e){ current = []; }
  if(current.length === 0){
    listEl.appendChild(buildRow());
  } else {
    for(const it of current){
      listEl.appendChild(buildRow({ material_id: it.material_id, qty: it.qty }));
    }
  }

  modal.querySelector('[data-a="add"]').onclick = ()=> listEl.appendChild(buildRow());
  modal.querySelector('[data-a="save"]').onclick = async ()=>{
    const items = Array.from(listEl.querySelectorAll("tr")).map(tr=>{
      const material_id = tr.querySelector('[data-k="material_id"]').value;
      const qty = parseFloat(tr.querySelector('[data-k="qty"]').value || "0");
      return { material_id, qty };
    }).filter(x=>x.material_id && isFinite(x.qty) && x.qty>0);
    try{
      await api("/api/templates/"+encodeURIComponent(tpl.id)+"/materials", {
        method:"PUT",
        body: JSON.stringify({ items })
      });
      toast("Материалы шаблона сохранены");
      close();
    }catch(e){
      alert("Ошибка сохранения материалов: " + e.message);
    }
  };
}

async function openOpMaterialsModal(op){
  // Вариант 2: материалы задаются в рецептуре ИЗДЕЛИЯ, не в задаче.
  if(!currentUser){
    toast("Требуется вход");
    return;
  }
  const itemId = (op.order_item_id || "").trim();
  if(!itemId){
    alert("Эта задача не привязана к изделию. Привяжите операции к изделию при вставке шаблона.");
    return;
  }
  const orderId = state.activeOrderId || op.order_id || "";
  const items = Array.isArray(state.orderItemsByOrder?.[orderId]) ? state.orderItemsByOrder[orderId] : [];
  const item = items.find(x=>x.id===itemId) || { id: itemId, type: "Изделие", qty_plan: 0 };
  if(typeof openItemBomModal === 'function'){
  openItemBomModal(item);
  } else if(typeof window.openItemBomModal === 'function'){
    window.openItemBomModal(item);
  } else {
    toast("Функция открытия материалов недоступна");
}
}
window.openOpMaterialsModal = openOpMaterialsModal;

// Система уведомлений
let notificationId = 0;
const activeNotifications = new Map();

function showNotification(title, message, type = 'warning', duration = 10000){
  const id = `notif_${notificationId++}`;
  
  // Проверяем, нет ли уже такого уведомления
  const existing = Array.from(activeNotifications.values()).find(n => n.message === message);
  if(existing) return;
  
  const container = $("notifications");
  const notif = document.createElement("div");
  notif.className = `notification ${type}`;
  notif.id = id;
  
  const icon = type === 'danger' ? '🚨' : '⚠️';
  
  notif.innerHTML = `
    <span class="close">×</span>
    <div class="title">${icon} ${esc(title)}</div>
    <div>${esc(message)}</div>
  `;
  
  container.appendChild(notif);
  activeNotifications.set(id, { id, message });
  notif.querySelector('.close').onclick = () => {
    notif.remove();
    activeNotifications.delete(id);
  };
  
  // Автоматическое удаление
  if(duration > 0){
    setTimeout(() => {
      const el = document.getElementById(id);
      if(el) el.remove();
      activeNotifications.delete(id);
    }, duration);
  }
  
  return id;
}

function clearNotifications(){
  $("notifications").innerHTML = "";
  activeNotifications.clear();
}

async function api(path, opts={}){
  return window.ApiClient.request(path, opts);
}

async function updateOp(op, body, method="PATCH"){
  return window.OperationUpdates.update(op, body, method);
}

// completion moved to js/core.js

async function openOpItemLinkModal(op){
  if(!currentUser || currentUser.role !== "admin"){
    toast("Только для администратора");
    return;
  }
  const orderId = op.order_id;
  if(!orderId){
    toast("У операции нет заказа");
    return;
  }
  const items = Array.isArray(state.orderItemsByOrder?.[orderId]) ? state.orderItemsByOrder[orderId] : [];
  const modal = document.createElement("div");
  modal.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px;";
  modal.innerHTML = `
    <div class="card" style="width:100%;max-width:640px;max-height:90vh;overflow:auto;padding:16px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <div style="font-weight:900;font-size:16px">🏷 Привязка операции к изделию</div>
          <div class="hint" style="margin-top:4px">Заказ <b>${esc(op.order_id||"")}</b> · №${esc(String(op.no||""))} · ${esc(op.name||"")}</div>
        </div>
        <button class="btn ghost" data-a="close">Закрыть</button>
      </div>
      <div class="field">
        <label>Изделие</label>
        <select id="opItemSel">
          <option value="">— не привязано —</option>
        </select>
        <div class="hint" style="margin-top:6px">
          Если изделий нет — создайте их в разделе <b>Заказы → Изделия</b>.
        </div>
      </div>
      <div class="row" style="gap:10px;margin-top:12px;flex-wrap:wrap">
        <button class="btn accent" data-a="save">Сохранить</button>
        <button class="btn ghost danger" data-a="clear">Снять привязку</button>
      </div>
    </div>
  `;
  const close = ()=> modal.remove();
  modal.querySelector('[data-a="close"]').onclick = close;
  modal.onclick = (e)=>{ if(e.target===modal) close(); };
  document.body.appendChild(modal);

  const sel = modal.querySelector("#opItemSel");
  for(const it of items){
    const opt = document.createElement("option");
    opt.value = it.id;
    const title = it.title ? ` · ${it.title}` : "";
    opt.textContent = `${it.type}${title} · план ${it.qty_plan||0}`;
    sel.appendChild(opt);
  }
  sel.value = op.order_item_id || "";
  sel.disabled = items.length === 0;

  modal.querySelector('[data-a="clear"]').onclick = async ()=>{
    try{
      await updateOp(op, { order_item_id: "" });
      await refreshAll(false);
      toast("Привязка снята");
      close();
    }catch(e){
      alert("Ошибка: " + e.message);
    }
  };

  modal.querySelector('[data-a="save"]').onclick = async ()=>{
    const v = (sel.value || "").trim();
    try{
      await updateOp(op, { order_item_id: v });
      await refreshAll(false);
      toast("Привязка сохранена");
      close();
    }catch(e){
      alert("Ошибка: " + e.message);
    }
  };
}

// === Модальное окно выбора кроя для операции ===
async function openOpCuttingModal(op){
  if(!currentUser){
    toast("Требуется вход");
    return;
  }
  
  // Получаем клиента из заказа
  const order = state.orders?.find(o => o.id === op.order_id);
  const opClient = order?.client || "";
  
  // Загружаем список раскроев
  let layouts = [];
  try{
    layouts = await api("/api/cutting/layouts");
    if(!Array.isArray(layouts)) layouts = [];
  }catch(e){
    console.error("Ошибка загрузки раскроев:", e);
    toast("Ошибка загрузки раскроев: " + e.message);
    return;
  }
  
  // Получаем список всех клиентов из раскроев для фильтра
  const allClients = [...new Set(layouts.map(l => l.client || l.order_client || "").filter(Boolean))].sort();
  
  const currentLayoutId = op.cutting_layout_id || "";
  let selectedClient = "";
  let showOnlyThisClient = false;
  
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content" style="max-width:1400px;width:95%;max-height:90vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h3 style="margin:0">✂️ Выбор кроя для операции</h3>
        <button class="modal-close" data-a="close">×</button>
      </div>
      <div class="modal-body" style="padding:20px;overflow-y:auto;flex:1">
        <div style="margin-bottom:16px;padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border)">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">Операция</div>
          <div style="font-size:12px;color:var(--muted)">
            Заказ: <b>${esc(op.order_id||"—")}</b> · №${esc(String(op.no||""))} · <b>${esc(op.name||"—")}</b>
            ${opClient ? ` · Клиент: <b>${esc(opClient)}</b>` : ""}
          </div>
          ${currentLayoutId ? `<div style="font-size:11px;color:var(--accent);margin-top:6px">✓ Текущий крой: ${esc(currentLayoutId)}</div>` : ""}
        </div>
        
        <div style="margin-bottom:16px;padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text)">Фильтр по клиенту:</label>
            <select id="cuttingModalClientFilter" style="width:100%;padding:6px;font-size:13px;border:1px solid var(--border);border-radius:4px;background:var(--bg)">
              <option value="">(все клиенты)</option>
              ${allClients.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
            </select>
          </div>
          ${opClient ? `
          <div style="display:flex;align-items:center;gap:8px;padding-top:20px">
            <input type="checkbox" id="cuttingModalShowOnlyThisClient" style="width:18px;height:18px;cursor:pointer">
            <label for="cuttingModalShowOnlyThisClient" style="font-size:13px;font-weight:500;cursor:pointer;user-select:none">
              Показать крой только для клиента <b>${esc(opClient)}</b>
            </label>
          </div>
          ` : ""}
        </div>
        
        ${layouts.length === 0 ? 
          '<div class="hint" style="text-align:center;padding:40px">Нет сохраненных раскроев. Создайте раскрой в разделе "Мастер кроя".</div>' : 
          `<div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:1000px">
              <thead>
                <tr style="background:var(--bg-secondary);border-bottom:2px solid var(--border)">
                  <th style="padding:10px;text-align:left;font-weight:700;font-size:11px;width:100px">Миниатюра</th>
                  <th style="padding:10px;text-align:left;font-weight:700;font-size:11px;min-width:150px">Материал</th>
                  <th style="padding:10px;text-align:left;font-weight:700;font-size:11px;min-width:120px">Заготовка (мм)</th>
                  <th style="padding:10px;text-align:left;font-weight:700;font-size:11px;min-width:120px">Лист (мм)</th>
                  <th style="padding:10px;text-align:center;font-weight:700;font-size:11px;min-width:80px">Заготовок</th>
                  <th style="padding:10px;text-align:center;font-weight:700;font-size:11px;min-width:80px">Отходы (%)</th>
                  <th style="padding:10px;text-align:left;font-weight:700;font-size:11px;min-width:150px">Клиент</th>
                  <th style="padding:10px;text-align:left;font-weight:700;font-size:11px;min-width:120px">ID</th>
                  <th style="padding:10px;text-align:center;font-weight:700;font-size:11px;width:120px">Действие</th>
                </tr>
              </thead>
              <tbody id="cuttingLayoutsList">
              </tbody>
            </table>
          </div>`
        }
      </div>
      <div class="modal-footer" style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end">
        <button class="btn ghost" data-a="close">Отмена</button>
        <button class="btn ghost danger" data-a="clear" ${!currentLayoutId ? 'style="display:none"' : ''}>Снять крой</button>
      </div>
    </div>
  `;
  
  const close = ()=> {
    modal.classList.remove("show");
    setTimeout(()=> modal.remove(), 200);
  };
  modal.querySelector('[data-a="close"]').onclick = close;
  modal.onclick = (e)=>{ if(e.target===modal) close(); };
  document.body.appendChild(modal);
  setTimeout(()=> modal.classList.add("show"), 10);
  
  const listEl = modal.querySelector("#cuttingLayoutsList");
  
  // Функция создания миниатюры SVG с размером заготовки
  const createSvgThumbnail = (svgContent, width = 80, height = 60, pieceWidth = 0, pieceLength = 0) => {
    if(!svgContent) return '<div class="hint" style="padding:8px;text-align:center;font-size:10px">Нет превью</div>';
    // Масштабируем SVG для миниатюры
    const scaledSvg = svgContent
      .replace(/width="[^"]*"/, `width="${width}"`)
      .replace(/height="[^"]*"/, `height="${height}"`)
      .replace(/viewBox="[^"]*"/, ''); // Убираем viewBox для правильного масштабирования
    const sizeLabel = (pieceWidth > 0 && pieceLength > 0) ? `<div style="position:absolute;bottom:2px;left:2px;right:2px;font-size:8px;font-weight:600;color:#333;background:rgba(255,255,255,0.9);padding:1px 3px;border-radius:2px;text-align:center;line-height:1.1">${pieceWidth}×${pieceLength}</div>` : '';
    return `<div style="width:${width}px;height:${height}px;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center;position:relative">${scaledSvg}${sizeLabel}</div>`;
  };
  
  // Рендерим список раскроев в виде таблицы с фильтрацией
  const renderLayouts = ()=>{
    if(layouts.length === 0) return;
    
    // Фильтруем раскрои по клиенту
    let filteredLayouts = layouts;
    if(showOnlyThisClient && opClient){
      filteredLayouts = layouts.filter(l => {
        const layoutClient = l.client || l.order_client || "";
        return layoutClient === opClient;
      });
    } else if(selectedClient){
      filteredLayouts = layouts.filter(l => {
        const layoutClient = l.client || l.order_client || "";
        return layoutClient === selectedClient;
      });
    }
    
    if(filteredLayouts.length === 0){
      listEl.innerHTML = `
        <tr>
          <td colspan="9" style="padding:40px;text-align:center;color:var(--muted)">
            <div class="hint">Нет раскроев для выбранного фильтра</div>
          </td>
        </tr>
      `;
      return;
    }
    
    listEl.innerHTML = filteredLayouts.map(layout => {
      const isSelected = layout.id === currentLayoutId;
      const pieceWidth = layout.box_width_mm || 0;
      const pieceLength = layout.box_length_mm || 0;
      const sheetWidth = layout.sheet_width_mm || 0;
      const sheetLength = layout.sheet_length_mm || 0;
      const thickness = layout.thickness_mm || 0;
      const layoutClient = layout.client || layout.order_client || "—";
      
      return `
        <tr style="border-bottom:1px solid var(--border);${isSelected ? 'background:rgba(0,207,181,.05)' : ''}" data-layout-id="${esc(layout.id)}">
          <td style="padding:8px;vertical-align:middle">
            <div style="cursor:pointer" data-action="preview" title="Нажмите для предпросмотра">
              ${createSvgThumbnail(layout.layout_svg, 80, 60, pieceWidth, pieceLength)}
            </div>
          </td>
          <td style="padding:8px;vertical-align:middle;font-weight:600">
            ${isSelected ? '✓ ' : ''}${esc(layout.material_name || 'Материал')}
          </td>
          <td style="padding:8px;vertical-align:middle;font-family:monospace;font-size:12px">
            ${pieceWidth}×${pieceLength}${thickness > 0 ? `×${thickness}` : ''}
          </td>
          <td style="padding:8px;vertical-align:middle;font-family:monospace;font-size:12px">
            ${sheetWidth}×${sheetLength}
          </td>
          <td style="padding:8px;vertical-align:middle;text-align:center;font-weight:600">
            ${layout.pieces_count || 0}
          </td>
          <td style="padding:8px;vertical-align:middle;text-align:center;color:${layout.waste_percent > 20 ? 'var(--warn)' : 'var(--text)'};font-weight:600">
            ${layout.waste_percent || 0}%
          </td>
          <td style="padding:8px;vertical-align:middle;font-size:12px;color:var(--text)">
            ${esc(layoutClient)}
          </td>
          <td style="padding:8px;vertical-align:middle;font-family:monospace;font-size:11px;color:var(--muted)">
            ${esc(layout.id)}
          </td>
          <td style="padding:8px;vertical-align:middle;text-align:center">
            <button class="btn ${isSelected ? 'accent' : 'primary'}" style="padding:6px 12px;font-size:12px" data-action="select">
            ${isSelected ? '✓ Выбран' : 'Выбрать'}
          </button>
          </td>
        </tr>
      `;
    }).join('');
    
    // Обработчики выбора кроя и предпросмотра
    listEl.querySelectorAll('[data-layout-id]').forEach(row => {
      const layoutId = row.dataset.layoutId;
      const layout = filteredLayouts.find(l => l.id === layoutId);
      const selectBtn = row.querySelector('[data-action="select"]');
      const previewBtn = row.querySelector('[data-action="preview"]');
      
      if(selectBtn) {
        selectBtn.onclick = (e) => {
          e.stopPropagation();
          selectLayout(layoutId);
      };
      }
      
      if(previewBtn && layout) {
        previewBtn.onclick = (e) => {
          e.stopPropagation();
          showCuttingPreview(layout);
      };
      }
    });
  };
  
  // Функция предпросмотра кроя
  const showCuttingPreview = (layout) => {
    // Используем сохранённый SVG из базы данных - это тот же SVG, что будет в печати
    // Он уже содержит все элементы, включая импортированный SVG (кровь)
    let svgContent = layout.layout_svg || '<div class="hint">Нет изображения</div>';
    
    // Если сохранённого SVG нет, генерируем заново (fallback)
    if (!svgContent || svgContent === '<div class="hint">Нет изображения</div>') {
      if (window.generateSvgForLayout) {
        const layoutData = layout.layout_data_json ? 
          (typeof layout.layout_data_json === 'string' ? JSON.parse(layout.layout_data_json) : layout.layout_data_json) : {};
        
        if (layoutData.pieces && Array.isArray(layoutData.pieces) && layoutData.pieces.length > 0) {
          // Восстанавливаем layout объект из layout_data_json
          const layoutObj = {
            pieces: layoutData.pieces,
            rotated: layoutData.rotated || false,
            piecesCount: layout.pieces_count || 0,
            wastePercent: layout.waste_percent || 0,
            wasteWidth: layout.waste_width_mm || layoutData.wasteWidth || 0,
            wasteLength: layout.waste_length_mm || layoutData.wasteLength || 0,
            wasteArea: layout.waste_area_mm2 || layoutData.wasteArea || 0
          };
          
          const pieceWidth = layout.box_width_mm || layoutData.pieceWidth || 0;
          const pieceLength = layout.box_length_mm || layoutData.pieceLength || 0;
          const kerf = layoutData.kerf || 0;
          const sheetWidth = layout.sheet_width_mm || 0;
          const sheetLength = layout.sheet_length_mm || 0;
          
          svgContent = window.generateSvgForLayout(layoutObj, sheetWidth, sheetLength, pieceWidth, pieceLength, kerf, {
            mode: 'preview',
            scaleMultiplier: 1,
            fontScale: 1
          });
        }
      }
    }
    
    const previewModal = document.createElement("div");
    previewModal.className = "modal";
    previewModal.innerHTML = `
      <div class="modal-content" style="max-width:1200px;width:95%;max-height:90vh;display:flex;flex-direction:column">
        <div class="modal-header">
          <h3 style="margin:0">📐 Предпросмотр кроя</h3>
          <button class="modal-close" data-a="close">×</button>
        </div>
        <div class="modal-body" style="padding:20px;overflow-y:auto;flex:1">
          <div style="margin-bottom:16px;padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border)">
            <div style="font-weight:700;font-size:14px;margin-bottom:8px">Информация о крое</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;font-size:12px">
              <div><b>Материал:</b> ${esc(layout.material_name || '—')}</div>
              <div><b>Заготовка:</b> ${layout.box_width_mm || 0}×${layout.box_length_mm || 0}${layout.thickness_mm ? `×${layout.thickness_mm}` : ''} мм</div>
              <div><b>Лист:</b> ${layout.sheet_width_mm || 0}×${layout.sheet_length_mm || 0} мм</div>
              <div><b>Заготовок:</b> ${layout.pieces_count || 0} шт</div>
              <div><b>Отходы:</b> ${layout.waste_percent || 0}%</div>
              ${layout.waste_width_mm > 0 || layout.waste_length_mm > 0 ? `
              <div><b>Отходы (размеры):</b> ${layout.waste_width_mm > 0 ? `Справа: ${layout.waste_width_mm.toFixed(1)}×${layout.sheet_length_mm || 0}мм` : ''}${layout.waste_width_mm > 0 && layout.waste_length_mm > 0 ? '; ' : ''}${layout.waste_length_mm > 0 ? `Снизу: ${layout.sheet_width_mm || 0}×${layout.waste_length_mm.toFixed(1)}мм` : ''}</div>
              ` : ''}
              ${layout.client || layout.order_client ? `<div><b>Клиент:</b> ${esc(layout.client || layout.order_client || '—')}</div>` : ''}
              <div><b>ID:</b> <code style="font-size:11px">${esc(layout.id)}</code></div>
            </div>
          </div>
          
          <div style="border:2px solid var(--border);border-radius:8px;padding:10px;background:#fff;overflow:auto;text-align:center;box-sizing:border-box">
            <div style="display:inline-block;max-width:100%">
              ${svgContent}
            </div>
          </div>
        </div>
        <div class="modal-footer" style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end">
          <button class="btn ghost" data-a="close">Закрыть</button>
        </div>
      </div>
    `;
    
    const closePreview = () => {
      previewModal.classList.remove("show");
      setTimeout(() => previewModal.remove(), 200);
    };
    
    previewModal.querySelector('[data-a="close"]').onclick = closePreview;
    previewModal.onclick = (e) => { if(e.target === previewModal) closePreview(); };
    
    document.body.appendChild(previewModal);
    setTimeout(() => previewModal.classList.add("show"), 10);
  };
  
  const selectLayout = async (layoutId) => {
    try{
      const response = await api(`/api/ops/${encodeURIComponent(op.id)}/cutting-layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cutting_layout_id: layoutId })
      });
      
      // Обновляем данные операции в state
      if(response && state.ops){
        const opIndex = state.ops.findIndex(o => o.id === op.id);
        if(opIndex !== -1){
          // Обновляем операцию в state
          state.ops[opIndex] = { ...state.ops[opIndex], ...response };
        }
      }
      
      await refreshAll(false);
      toast("✓ Крой привязан к операции");
      close();
      
      // Перерисовываем разделы, где отображаются операции
      if(typeof renderMy === 'function') renderMy();
      if(typeof renderOps === 'function') renderOps();
    }catch(e){
      console.error("Ошибка привязки кроя:", e);
      alert("Ошибка привязки кроя: " + (e.message || e));
    }
  };
  
  const clearBtn = modal.querySelector('[data-a="clear"]');
  if(clearBtn){
    clearBtn.onclick = async () => {
      if(!confirm("Снять крой с этой операции?")) return;
      try{
        const response = await api(`/api/ops/${encodeURIComponent(op.id)}/cutting-layout`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cutting_layout_id: null })
        });
        
        // Обновляем данные операции в state
        if(response && state.ops){
          const opIndex = state.ops.findIndex(o => o.id === op.id);
          if(opIndex !== -1){
            // Обновляем операцию в state
            state.ops[opIndex] = { ...state.ops[opIndex], ...response };
          }
        }
        
        await refreshAll(false);
        toast("Крой снят с операции");
        close();
        
        // Перерисовываем разделы, где отображаются операции
        if(typeof renderMy === 'function') renderMy();
        if(typeof renderOps === 'function') renderOps();
      }catch(e){
        console.error("Ошибка снятия кроя:", e);
        alert("Ошибка: " + (e.message || e));
      }
    };
  }
  
  // Обработчики фильтров
  const clientFilter = modal.querySelector("#cuttingModalClientFilter");
  if(clientFilter){
    clientFilter.onchange = () => {
      selectedClient = clientFilter.value || "";
      showOnlyThisClient = false; // Сбрасываем чекбокс при изменении селекта
      const checkbox = modal.querySelector("#cuttingModalShowOnlyThisClient");
      if(checkbox) checkbox.checked = false;
  renderLayouts();
    };
  }
  
  const showOnlyThisClientCheckbox = modal.querySelector("#cuttingModalShowOnlyThisClient");
  if(showOnlyThisClientCheckbox){
    showOnlyThisClientCheckbox.onchange = () => {
      showOnlyThisClient = showOnlyThisClientCheckbox.checked;
      if(showOnlyThisClient){
        selectedClient = ""; // Сбрасываем селект при включении чекбокса
        if(clientFilter) clientFilter.value = "";
      }
      renderLayouts();
    };
  }
  
  renderLayouts();
}

// === Модальное окно просмотра полного раскроя (для мобильной версии) ===
function showFullCuttingLayout(op) {
  if(!op || !op.layout_svg) {
    toast("Нет данных о раскрое");
    return;
  }
  
  const modal = document.createElement("div");
  modal.className = "modal";
  const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;z-index:10001;padding:${isMobile ? '0' : '20px'}`;
  
  const sheetW = op.sheet_width_mm || 0;
  const sheetL = op.sheet_length_mm || 0;
  const pieceW = op.box_width_mm || 0;
  const pieceL = op.box_length_mm || 0;
  const thickness = op.thickness_mm || 0;
  
  modal.innerHTML = `
    <div style="background:white;border-radius:${isMobile ? '0' : '12px'};width:${isMobile ? '100vw' : 'calc(100vw - 40px)'};height:${isMobile ? '100vh' : 'calc(100vh - 40px)'};max-width:100vw;max-height:100vh;display:flex;flex-direction:column;overflow:hidden">
      <!-- Заголовок -->
      <div style="padding:12px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <div>
          <div style="font-weight:700;font-size:16px">✂️ Раскрой материала</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(op.material_name || 'Материал')}</div>
        </div>
        <button class="btn ghost" style="font-size:24px;padding:4px 12px;line-height:1" data-close>×</button>
      </div>
      
      <!-- Информация о размерах -->
      <div style="padding:12px 16px;background:rgba(0,207,181,.05);border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:12px;font-size:13px;flex-shrink:0">
        <div style="flex:1;min-width:120px">
          <div style="color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:600">Лист</div>
          <div style="font-weight:700;font-size:16px">${sheetW} × ${sheetL} мм</div>
        </div>
        <div style="flex:1;min-width:120px">
          <div style="color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:600">Заготовка</div>
          <div style="font-weight:700;font-size:16px">${pieceW} × ${pieceL}${thickness ? ` × ${thickness}` : ''} мм</div>
        </div>
        <div style="flex:1;min-width:80px">
          <div style="color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:600">Заготовок</div>
          <div style="font-weight:700;font-size:16px;color:var(--accent)">${op.pieces_count || 0} шт</div>
        </div>
        <div style="flex:1;min-width:80px">
          <div style="color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:600">Отходы</div>
          <div style="font-weight:700;font-size:16px;color:${(op.waste_percent || 0) > 20 ? 'var(--warn)' : 'var(--text)'}">${op.waste_percent || 0}%</div>
          ${(op.waste_width_mm > 0 || op.waste_length_mm > 0) ? `
          <div style="font-size:10px;color:var(--muted);margin-top:2px">
            ${op.waste_width_mm > 0 ? `${op.waste_width_mm.toFixed(1)}×${sheetL}мм` : ''}
            ${op.waste_width_mm > 0 && op.waste_length_mm > 0 ? ' + ' : ''}
            ${op.waste_length_mm > 0 ? `${sheetW}×${op.waste_length_mm.toFixed(1)}мм` : ''}
          </div>
          ` : ''}
        </div>
      </div>
      
      <!-- SVG раскроя - занимает всё доступное пространство -->
      <div style="flex:1;overflow:auto;padding:20px;display:flex;align-items:center;justify-content:center;background:#f8f9fa;min-height:0">
        <div id="fullCuttingSvgContainer" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;min-height:400px;padding:10px;box-sizing:border-box">
          ${op.layout_svg || '<div class="hint">Нет изображения</div>'}
        </div>
      </div>
      
      <!-- Кнопки -->
      <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0">
        <button class="btn ghost" style="flex:1" data-close>Закрыть</button>
        <button class="btn ghost" style="flex:1" data-change>✏️ Изменить</button>
        <button class="btn primary" style="flex:1" data-print>🖨️ Печать</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add("show"), 10);
  
  // Масштабируем SVG под размер контейнера для максимальной видимости
  const svgContainer = modal.querySelector('#fullCuttingSvgContainer');
  const svg = svgContainer.querySelector('svg');
  if(svg) {
    // Получаем размеры контейнера
    const containerRect = svgContainer.getBoundingClientRect();
    const containerWidth = containerRect.width - 40; // Учитываем padding
    const containerHeight = containerRect.height - 40;
    
    // Получаем оригинальные размеры SVG
    const svgWidth = svg.getAttribute('width') ? parseFloat(svg.getAttribute('width')) : svg.viewBox?.baseVal?.width || containerWidth;
    const svgHeight = svg.getAttribute('height') ? parseFloat(svg.getAttribute('height')) : svg.viewBox?.baseVal?.height || containerHeight;
    
    // Вычисляем масштаб для вписывания
    const scaleX = containerWidth / svgWidth;
    const scaleY = containerHeight / svgHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Не увеличиваем больше оригинала
    
    // Применяем масштаб
    const newWidth = svgWidth * scale;
    const newHeight = svgHeight * scale;
    
    svg.style.width = `${newWidth}px`;
    svg.style.height = `${newHeight}px`;
    svg.style.maxWidth = '100%';
    svg.style.maxHeight = '100%';
    svg.style.display = 'block';
    svg.style.margin = 'auto';
  }
  
  // Закрытие
  const close = () => {
    modal.classList.remove("show");
    setTimeout(() => modal.remove(), 200);
  };
  
  modal.querySelectorAll('[data-close]').forEach(btn => btn.onclick = close);
  modal.onclick = (e) => { if(e.target === modal) close(); };
  
  // Изменить крой
  modal.querySelector('[data-change]').onclick = () => {
    close();
    if(typeof window.openOpCuttingModal === 'function') {
      window.openOpCuttingModal(op);
    }
  };
  
  // Печать
  modal.querySelector('[data-print]').onclick = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Раскрой - ${esc(op.material_name || 'Материал')}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .info { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
          .info-item { flex: 1; min-width: 100px; }
          .info-label { font-size: 10px; color: #666; text-transform: uppercase; }
          .info-value { font-size: 18px; font-weight: bold; }
          .svg-container { border: 2px solid #333; padding: 10px; background: #fff; box-sizing: border-box; }
          .svg-container svg { width: 100%; height: auto; display: block; margin: 0 auto; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <h2>✂️ Раскрой материала: ${esc(op.material_name || 'Материал')}</h2>
        <div class="info">
          <div class="info-item"><div class="info-label">Лист</div><div class="info-value">${sheetW} × ${sheetL} мм</div></div>
          <div class="info-item"><div class="info-label">Заготовка</div><div class="info-value">${pieceW} × ${pieceL}${thickness ? ` × ${thickness}` : ''} мм</div></div>
          <div class="info-item"><div class="info-label">Заготовок</div><div class="info-value">${op.pieces_count || 0} шт</div></div>
          <div class="info-item"><div class="info-label">Отходы</div><div class="info-value">${op.waste_percent || 0}%</div></div>
        </div>
        <div class="svg-container">${op.layout_svg || ''}</div>
        <scr` + `ipt>window.onload = () => { window.print(); }</scr` + `ipt>
      </body>
      </html>
    `);
    printWindow.document.close();
  };
}

// Экспортируем функцию глобально
window.showFullCuttingLayout = showFullCuttingLayout;

// === Печать QR для операции с SVG кроя ===
// СТАРАЯ ВЕРСИЯ УДАЛЕНА - используется новая версия функции printOpQr ниже (строка 5230)
// Эта функция была дубликатом и вызывала конфликты - весь проблемный код удален

// Модальное окно редактирования BOM для изделия в мастере заказов
// qtyPlan - тираж изделия для расчёта нужного количества материала
async function openWizardItemBomModal(templateId, currentBom, itemType, qtyPlan = 1){
  await ensureMaterialsLoaded();
  
  return new Promise(async (resolve)=>{
    const modal = document.createElement("div");
    modal.className = "modal";
    let currentQtyPlan = qtyPlan || 1;
    
    // ВАЖНО: Используем ТОЛЬКО рецептуру из item_bom (currentBom), НЕ из шаблона!
    // Если currentBom пустой, значит рецептура не указана для этого изделия в заказе
    // Fallback на шаблон отключен, чтобы рецептура в модальном окне совпадала с распечаткой
    let bomItems = Array.isArray(currentBom) && currentBom.length > 0 ? [...currentBom] : [];
    
    console.log('[openWizardItemBomModal] Рецептура для модального окна:', {
      templateId: templateId,
      currentBomCount: currentBom.length,
      bomItemsCount: bomItems.length,
      source: 'item_bom (НЕ из шаблона!)',
      bomItems: bomItems
    });
    
    // НЕ загружаем из шаблона - используем только то, что есть в item_bom
    // if(bomItems.length === 0 && templateId){
    //   try{
    //     const res = await api("/api/product-templates/"+encodeURIComponent(templateId)+"/bom");
    //     bomItems = Array.isArray(res?.items) ? res.items.map(b=>({
    //       material_id: b.material_id,
    //       qty_per_unit: b.qty_per_unit || 0,
    //       qty_from_material: b.qty_from_material || 1
    //     })) : [];
    //   }catch(_e){}
    // }
    
    const mats = state.materials || [];
    
    // Функция расчёта нужного количества материала
    const calcNeeded = (qtyPerUnit, qtyFromMat, qty)=>{
      const qpu = parseFloat(qtyPerUnit) || 0;
      const qfm = parseFloat(qtyFromMat) || 1;
      const q = parseFloat(qty) || 1;
      if(qfm <= 0) return 0;
      return Math.ceil((qpu * q) / qfm * 100) / 100; // Округляем до 2 знаков вверх
    };
    
    // Функция создания строки материала
    const createRowHtml = (b, idx)=>{
      const needed = calcNeeded(b.qty_per_unit, b.qty_from_material, currentQtyPlan);
      return `
        <tr data-row="${idx}">
          <td>
            <select data-k="material_id" style="width:100%;min-width:160px">
              <option value="">— выберите —</option>
              ${mats.map(m=>`<option value="${esc(m.id)}" ${m.id===b.material_id?"selected":""}>${esc(m.name)} (${esc(m.unit||"")})</option>`).join("")}
            </select>
          </td>
          <td><input data-k="qty_per_unit" type="number" step="0.01" min="0" value="${String(Math.max(0, parseFloat(b.qty_per_unit||0)||0))}" style="width:70px"></td>
          <td><input data-k="qty_from_material" type="number" step="1" min="1" value="${String(Math.max(1, parseInt(b.qty_from_material||1,10)||1))}" style="width:70px"></td>
          <td class="mono" style="font-weight:800;text-align:center" data-k="needed">${needed}</td>
          <td><button class="btn ghost danger" data-a="rm-row">×</button></td>
        </tr>
      `;
    };
    
    const bomRowsHtml = bomItems.length > 0 
      ? bomItems.map((b,i)=> createRowHtml(b, i)).join("")
      : `<tr data-placeholder><td colspan="5" style="padding:14px;color:var(--muted);text-align:center">Нет материалов. Добавьте или загрузите из шаблона.</td></tr>`;
    
    modal.innerHTML = `
      <div class="modal-content" style="max-width:800px;width:100%">
        <div class="modal-header">
          <h3 style="margin:0">📦 Рецептура изделия${itemType ? ` (${itemType})` : ""}</h3>
          <button class="modal-close" data-a="close">×</button>
        </div>
        <div class="modal-body" style="padding:20px;max-height:70vh;overflow-y:auto">
          <div class="hint" style="margin-bottom:12px;padding:10px;background:rgba(255,176,32,.1);border-radius:6px">
            ⚠️ Эта рецептура сохраняется только для текущего заказа и не изменяет исходный шаблон изделия.
          </div>
          <div class="row" style="gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
            ${templateId ? `<button class="btn ghost" data-a="load-template">📋 Загрузить из шаблона</button>` : ""}
            <div class="field" style="margin:0">
              <label style="font-size:12px;margin-bottom:2px">Тираж изделия (для расчёта)</label>
              <input id="wizBomQtyPlan" type="number" min="1" step="1" value="${String(Math.max(1, parseInt(currentQtyPlan||1,10)||1))}" style="width:100px">
            </div>
          </div>
          <div style="overflow:auto">
            <table class="resizable-table">
              <thead><tr>
                <th style="width:250px">Материал</th>
                <th style="width:80px" title="Сколько единиц материала на 1 изделие">На 1 шт</th>
                <th style="width:100px" title="Сколько заготовок получается из 1 единицы материала">Заготовок из 1 ед.</th>
                <th style="width:100px;background:var(--accent);color:#003b34" title="Нужно материала = (На 1 шт × Тираж) / Заготовок из 1 ед.">Нужно всего</th>
                <th style="width:60px"></th>
              </tr></thead>
              <tbody id="wizBomRows">${bomRowsHtml}</tbody>
            </table>
          </div>
          <div class="hint" style="margin-top:8px;font-size:11px">
            📐 Формула: <b>Нужно всего</b> = (На 1 шт × Тираж) ÷ Заготовок из 1 ед.
          </div>
          <button class="btn ghost" data-a="add-row" style="margin-top:10px">+ Добавить материал</button>
          <div class="row" style="gap:10px;margin-top:16px;justify-content:flex-end">
            <button class="btn ghost" data-a="cancel">Отмена</button>
            <button class="btn primary" data-a="save">💾 Сохранить рецептуру</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(()=> modal.classList.add("show"), 10);
    
    const close = (result)=>{
      modal.classList.remove("show");
      setTimeout(()=> modal.remove(), 200);
      resolve(result);
    };
    
    modal.querySelector('[data-a="close"]').onclick = ()=> close(null);
    modal.querySelector('[data-a="cancel"]').onclick = ()=> close(null);
    modal.onclick = (e)=>{ if(e.target===modal) close(null); };
    
    const tb = modal.querySelector("#wizBomRows");
    const qtyPlanInput = modal.querySelector("#wizBomQtyPlan");
    
    // Функция пересчёта всех "Нужно всего"
    const recalcAll = ()=>{
      currentQtyPlan = parseInt(qtyPlanInput.value) || 1;
      tb.querySelectorAll('tr[data-row]').forEach(tr=>{
        const qpu = parseFloat(tr.querySelector('[data-k="qty_per_unit"]')?.value) || 0;
        const qfm = parseFloat(tr.querySelector('[data-k="qty_from_material"]')?.value) || 1;
        const needed = calcNeeded(qpu, qfm, currentQtyPlan);
        const neededCell = tr.querySelector('[data-k="needed"]');
        if(neededCell) neededCell.textContent = needed;
      });
    };
    
    // При изменении тиража пересчитываем
    qtyPlanInput.oninput = recalcAll;
    
    // Функция привязки событий к строке
    const bindRowEvents = (tr)=>{
      tr.querySelector('[data-a="rm-row"]').onclick = ()=> tr.remove();
      tr.querySelector('[data-k="qty_per_unit"]').oninput = recalcAll;
      tr.querySelector('[data-k="qty_from_material"]').oninput = recalcAll;
    };
    
    // Добавить строку материала
    const addRow = ()=>{
      const placeholder = tb.querySelector('[data-placeholder]');
      if(placeholder) placeholder.remove();
      const idx = tb.querySelectorAll('tr[data-row]').length;
      const tr = document.createElement("tr");
      tr.dataset.row = idx;
      const needed = calcNeeded(1, 1, currentQtyPlan);
      tr.innerHTML = `
        <td>
          <select data-k="material_id" style="width:100%;min-width:160px">
            <option value="">— выберите —</option>
            ${mats.map(m=>`<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.unit||"")})</option>`).join("")}
          </select>
        </td>
        <td><input data-k="qty_per_unit" type="number" step="0.01" min="0" value="1" style="width:70px"></td>
        <td><input data-k="qty_from_material" type="number" step="1" min="1" value="1" style="width:70px"></td>
        <td class="mono" style="font-weight:800;text-align:center" data-k="needed">${needed}</td>
        <td><button class="btn ghost danger" data-a="rm-row">×</button></td>
      `;
      bindRowEvents(tr);
      tb.appendChild(tr);
    };
    
    // Привязываем события к существующим строкам
    tb.querySelectorAll('tr[data-row]').forEach(tr=> bindRowEvents(tr));
    
    modal.querySelector('[data-a="add-row"]').onclick = addRow;
    
    // Загрузить из шаблона
    if(templateId){
      const loadTplBtn = modal.querySelector('[data-a="load-template"]');
      if(loadTplBtn){
        loadTplBtn.onclick = async ()=>{
          try{
            const res = await api("/api/product-templates/"+encodeURIComponent(templateId)+"/bom");
            const items = Array.isArray(res?.items) ? res.items : [];
            tb.innerHTML = "";
            if(items.length === 0){
              tb.innerHTML = `<tr data-placeholder><td colspan="5" style="padding:14px;color:var(--muted);text-align:center">В шаблоне нет материалов.</td></tr>`;
            } else {
              for(const b of items){
                const idx = tb.querySelectorAll('tr[data-row]').length;
                const needed = calcNeeded(b.qty_per_unit, b.qty_from_material, currentQtyPlan);
                const tr = document.createElement("tr");
                tr.dataset.row = idx;
                tr.innerHTML = `
                  <td>
                    <select data-k="material_id" style="width:100%;min-width:160px">
                      <option value="">— выберите —</option>
                      ${mats.map(m=>`<option value="${esc(m.id)}" ${m.id===b.material_id?"selected":""}>${esc(m.name)} (${esc(m.unit||"")})</option>`).join("")}
                    </select>
                  </td>
                  <td><input data-k="qty_per_unit" type="number" step="0.01" min="0" value="${String(Math.max(0, parseFloat(b.qty_per_unit||0)||0))}" style="width:70px"></td>
                  <td><input data-k="qty_from_material" type="number" step="1" min="1" value="${String(Math.max(1, parseInt(b.qty_from_material||1,10)||1))}" style="width:70px"></td>
                  <td class="mono" style="font-weight:800;text-align:center" data-k="needed">${needed}</td>
                  <td><button class="btn ghost danger" data-a="rm-row">×</button></td>
                `;
                bindRowEvents(tr);
                tb.appendChild(tr);
              }
            }
            toast("Рецептура загружена из шаблона");
          }catch(e){
            alert("Ошибка загрузки: " + e.message);
          }
        };
      }
    }
    
    // Сохранить
    modal.querySelector('[data-a="save"]').onclick = ()=>{
      const rows = Array.from(tb.querySelectorAll('tr[data-row]'));
      const bom = rows.map(tr=>{
        const material_id = tr.querySelector('[data-k="material_id"]')?.value || "";
        const qty_per_unit = parseFloat(tr.querySelector('[data-k="qty_per_unit"]')?.value || "0") || 0;
        const qty_from_material = parseFloat(tr.querySelector('[data-k="qty_from_material"]')?.value || "1") || 1;
        return { material_id, qty_per_unit, qty_from_material };
      }).filter(x=> x.material_id && x.qty_per_unit > 0);
      close(bom);
    };
  });
}

async function openOrderWizard(){
  if(!currentUser || currentUser.role !== "admin"){
    toast("Только для администратора");
    return;
  }
  // Ensure fresh lists
  await refreshAll(false);
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content" style="max-width:1100px;width:100%">
      <div class="modal-header">
        <h3 style="margin:0">🧩 Создать заказ с изделиями</h3>
        <button class="modal-close" data-a="close">×</button>
      </div>
      <div class="modal-body" style="padding:20px;max-height:80vh;overflow-y:auto">
        <div class="grid two" style="gap:16px">
          <div class="card" style="margin:0">
            <h4 style="margin:0 0 10px">📝 Данные заказа</h4>
            <div class="field"><label>ID заказа</label><input id="w_order_id" placeholder="BMW-0002"></div>
            <div class="field"><label>Клиент</label><input id="w_client" list="clientsList" placeholder="Клиент"></div>
            <div class="row" style="gap:10px">
              <div class="field" style="flex:1"><label>Тираж (комплектов)</label><input id="w_qty" type="number" min="1" step="1" value="1"></div>
              <div class="field" style="flex:1">
                <label>📅 Дата начала производства</label>
                <input id="w_start_date" type="date">
              </div>
            </div>
            <div class="field"><label>Статус</label>
              <select id="w_status"><option>Запланировано</option><option>Наладка</option><option>В работе</option><option>Выполнено</option><option>Стоп</option></select>
            </div>
            <div class="hint">Дата начала будет установлена для всех создаваемых операций.</div>
          </div>
          <div class="card" style="margin:0">
            <h4 style="margin:0 0 10px">📦 Добавить изделия</h4>
            <div class="field">
              <label>Из профиля клиента</label>
              <div class="row" style="gap:8px">
                <select id="w_profile" style="flex:1"></select>
                <button class="btn accent" data-a="add-profile">+ Добавить из профиля</button>
              </div>
            </div>
            <div style="border-top:1px solid var(--border);margin:12px 0;padding-top:12px">
              <label>Или добавить отдельное изделие</label>
              <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap">
                <select id="w_single_type" style="min-width:140px"></select>
                <select id="w_single_tpl" style="flex:1;min-width:200px"></select>
                <button class="btn ghost" data-a="add-single">+ Добавить изделие</button>
              </div>
            </div>
            <div style="border-top:1px solid var(--border);margin:12px 0;padding-top:12px">
              <label>🗺️ Или загрузить из сохранённого маршрута</label>
              <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap">
                <select id="w_route_template" style="flex:1;min-width:200px">
                  <option value="">— Выберите шаблон маршрута —</option>
                </select>
                <button class="btn ghost" data-a="load-route">📥 Загрузить маршрут</button>
              </div>
              <div class="hint" style="margin-top:6px;font-size:11px">Шаблон маршрута создаст операции на основе сохранённых узлов.</div>
            </div>
          </div>
        </div>
        
        <div class="card" style="margin:16px 0 0">
          <h4 style="margin:0 0 10px">📋 Изделия в заказе</h4>
          <div class="hint" style="margin-bottom:8px">Размеры в мм. Можно изменить тираж и параметры. Кнопка × удаляет изделие.</div>
          <div style="overflow:auto">
            <table class="resizable-table">
              <thead><tr><th style="width:100px">Тип</th><th style="width:150px">Шаблон</th><th style="width:120px">Название</th><th style="width:80px">Тираж</th><th style="width:70px">Длина</th><th style="width:70px">Ширина</th><th style="width:70px">Высота</th><th style="width:150px">Материал</th><th style="width:90px">Действия</th></tr></thead>
              <tbody id="w_items"></tbody>
            </table>
          </div>
        </div>
        
        <div class="row" style="gap:10px;margin-top:16px;justify-content:flex-end">
          <button class="btn ghost" data-a="close">Отмена</button>
          <button class="btn primary" data-a="preview">👁 Предпросмотр операций</button>
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
  modal.querySelectorAll('[data-a="close"]').forEach(btn=> btn.onclick = close);
  modal.onclick = (e)=>{ if(e.target===modal) close(); };

  // Автоподстановка сегодняшней даты
  const startDateInput = modal.querySelector("#w_start_date");
  if(startDateInput){
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    startDateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  const profiles = state.clientProfiles || [];
  const templates = state.productTemplates || [];
  const profileSel = modal.querySelector("#w_profile");
  const clientInp = modal.querySelector("#w_client");
  const itemsBody = modal.querySelector("#w_items");
  const singleTypeSel = modal.querySelector("#w_single_type");
  const singleTplSel = modal.querySelector("#w_single_tpl");
  const presetsCache = { client: "", data: null };
  
  // Заполняем список профилей
  profileSel.innerHTML = '<option value="">— выберите профиль —</option>';
  for(const p of profiles){
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = `${p.client_name} — ${p.profile_name}`;
    profileSel.appendChild(o);
  }
  
  // Заполняем селектор типов изделий из state.productTypes
  const productTypes = Array.isArray(state.productTypes) ? state.productTypes : [];
  singleTypeSel.innerHTML = '<option value="">— выберите тип —</option>';
  for(const pt of productTypes){
    const o = document.createElement("option");
    o.value = typeof pt === 'string' ? pt : (pt.name || "");
    o.textContent = typeof pt === 'string' ? pt : (pt.name || "");
    singleTypeSel.appendChild(o);
  }
  
  // Функция обновления списка шаблонов по типу
  const updateSingleTplList = ()=>{
    const type = singleTypeSel.value;
    if(!type){
      singleTplSel.innerHTML = '<option value="">— выберите тип изделия —</option>';
      singleTplSel.disabled = true;
      return;
    }
    const filtered = templates.filter(t=>t.type === type);
    singleTplSel.innerHTML = '<option value="">— без шаблона —</option>';
    singleTplSel.disabled = false;
    for(const t of filtered){
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      singleTplSel.appendChild(o);
    }
  };
  singleTypeSel.onchange = updateSingleTplList;
  updateSingleTplList();
  
  // Загрузка шаблонов маршрутов
  const routeTemplateSel = modal.querySelector("#w_route_template");
  (async ()=>{
    try {
      const routeTemplates = await api('/api/route-templates');
      routeTemplateSel.innerHTML = '<option value="">— Выберите шаблон маршрута —</option>';
      for(const rt of routeTemplates){
        const o = document.createElement("option");
        o.value = rt.id;
        o.textContent = `${rt.name} (${(rt.nodes||[]).length} узлов)`;
        o.dataset.nodes = JSON.stringify(rt.nodes || []);
        o.dataset.edges = JSON.stringify(rt.edges || []);
        routeTemplateSel.appendChild(o);
      }
    } catch(e) {
      console.warn('Не удалось загрузить шаблоны маршрутов:', e);
    }
  })();
  
  // Обработчик загрузки маршрута
  modal.querySelector('[data-a="load-route"]').onclick = ()=>{
    const sel = routeTemplateSel;
    const opt = sel.options[sel.selectedIndex];
    if(!opt || !opt.value) {
      toast("Выберите шаблон маршрута");
      return;
    }
    try {
      const nodes = JSON.parse(opt.dataset.nodes || '[]');
      if(nodes.length === 0) {
        toast("Шаблон не содержит узлов");
        return;
      }
      // Добавляем узлы как операции в таблицу изделий
      let addedCount = 0;
      for(const node of nodes) {
        if(node.type === 'machine' && node.machine) {
          // Создаём виртуальное изделие на основе узла
          const type = node.operations?.[0]?.name || 'Операция';
          const title = node.label || node.machine;
          addItemRow({
            type: 'Из маршрута',
            template_name: title,
            title: type,
            qty: 1,
            len_mm: 0,
            wid_mm: 0,
            hei_mm: 0,
            material: '',
            machine: node.machine
          });
          addedCount++;
        }
      }
      toast(`✅ Добавлено ${addedCount} операций из маршрута`);
    } catch(e) {
      toast("Ошибка загрузки маршрута: " + e.message);
    }
  };
  
  // Загрузка пресетов клиента
  const loadPresets = async ()=>{
    const client = (clientInp.value || "").trim();
    if(!client) { presetsCache.client=""; presetsCache.data=null; return; }
    if(presetsCache.client === client && presetsCache.data) return;
    try{
      const data = await api("/api/client-item-presets?client="+encodeURIComponent(client));
      presetsCache.client = client;
      presetsCache.data = data;
    }catch(_e){
      presetsCache.client = client;
      presetsCache.data = null;
    }
  };
  
  // Локальное хранилище BOM для изделий в мастере
  const localBomStorage = new Map(); // key = row index, value = bom array
  let rowCounter = 0;
  
  // Добавить строку изделия в таблицу
  const addItemRow = (item)=>{
    // Удаляем placeholder если есть
    const placeholder = itemsBody.querySelector('[data-placeholder]');
    if(placeholder) placeholder.remove();
    
    const rowId = rowCounter++;
    const tr = document.createElement("tr");
    tr.dataset.template_id = item.template_id || "";
    tr.dataset.product_type = item.type || "Коробка";
    tr.dataset.row_id = rowId;
    const tpl = templates.find(t=>t.id === item.template_id);
    const tplName = tpl ? tpl.name : (item.template_id ? "?" : "— без шаблона —");
    
    // Инициализируем BOM из item.bom или пустой массив
    localBomStorage.set(rowId, item.bom || []);
    
    // Название изделия по умолчанию = название шаблона
    const defaultTitle = item.title || tplName || "";
    tr.dataset.title = defaultTitle;
    
    tr.innerHTML = `
      <td><b>${esc(item.type||"")}</b></td>
      <td>${esc(tplName)}</td>
      <td><input data-k="title" placeholder="Название" value="${esc(defaultTitle)}" style="min-width:100px" title="Название изделия"></td>
      <td><input data-k="qty_plan" type="number" min="1" step="1" value="${String(Math.max(1, parseInt(item.qty_plan||1,10)||1))}" style="width:80px"></td>
      <td><input data-k="len_mm" type="number" min="0" step="1" value="${String(Math.max(0, parseInt(item.len_mm||0,10)||0))}" style="width:70px"></td>
      <td><input data-k="wid_mm" type="number" min="0" step="1" value="${String(Math.max(0, parseInt(item.wid_mm||0,10)||0))}" style="width:70px"></td>
      <td><input data-k="hei_mm" type="number" min="0" step="1" value="${String(Math.max(0, parseInt(item.hei_mm||0,10)||0))}" style="width:70px"></td>
      <td><input data-k="material" placeholder="Материал" value="${esc(item.material||"")}" style="min-width:120px"></td>
      <td class="row" style="gap:4px;flex-wrap:nowrap">
        <button class="btn ghost" data-a="bom" title="Рецептура материалов">📦</button>
        <button class="btn ghost danger" data-a="rm" title="Удалить">×</button>
      </td>
    `;
    
    // Кнопка редактирования BOM
    tr.querySelector('[data-a="bom"]').onclick = async ()=>{
      const templateId = tr.dataset.template_id;
      const currentBom = localBomStorage.get(rowId) || [];
      // Получаем актуальный тираж из поля ввода
      const qtyPlan = parseInt(tr.querySelector('[data-k="qty_plan"]')?.value || "1", 10) || 1;
      const newBom = await openWizardItemBomModal(templateId, currentBom, item.type, qtyPlan);
      if(newBom !== null){
        localBomStorage.set(rowId, newBom);
        toast("Рецептура обновлена");
      }
    };
    
    tr.querySelector('[data-a="rm"]').onclick = ()=>{
      localBomStorage.delete(rowId);
      tr.remove();
      updateEmptyState();
    };
    itemsBody.appendChild(tr);
  };
  
  const updateEmptyState = ()=>{
    if(itemsBody.querySelectorAll('tr:not([data-placeholder])').length === 0){
      itemsBody.innerHTML = '<tr data-placeholder><td colspan="9" style="padding:14px;color:var(--muted);text-align:center">Добавьте изделия из профиля или отдельно</td></tr>';
    }
  };
  updateEmptyState();
  
  // Кнопка добавления из профиля
  modal.querySelector('[data-a="add-profile"]').onclick = async ()=>{
    const profileId = profileSel.value;
    if(!profileId){ toast("Выберите профиль"); return; }
    
    // Подставляем клиента из профиля
    const profile = profiles.find(p=>p.id === profileId);
    if(profile && profile.client_name && !clientInp.value){
      clientInp.value = profile.client_name;
    }
    
    let rows = [];
    try{
      const res = await api("/api/client-profiles/"+encodeURIComponent(profileId)+"/items");
      rows = Array.isArray(res?.items) ? res.items : [];
    }catch(e){
      alert("Ошибка загрузки профиля: " + e.message);
      return;
    }
    
    if(rows.length === 0){
      toast("Профиль пуст");
      return;
    }
    
    const orderQty = parseInt(modal.querySelector("#w_qty").value||"1",10) || 1;
    await loadPresets();
    const presets = presetsCache.data;
    
    for(const r of rows){
      const basePlan = orderQty * (parseInt(r.multiplier||1,10)||1);
      const p = (presets?.byTemplateId?.[r.template_id]) || (presets?.byType?.[r.product_type]) || null;
      addItemRow({
        type: r.product_type,
        template_id: r.template_id,
        qty_plan: basePlan,
        len_mm: p?.len_mm || 0,
        wid_mm: p?.wid_mm || 0,
        hei_mm: p?.hei_mm || 0,
        material: p?.material || ""
      });
    }
    toast(`Добавлено ${rows.length} изделий из профиля`);
  };
  
  // Кнопка добавления отдельного изделия
  modal.querySelector('[data-a="add-single"]').onclick = async ()=>{
    const type = singleTypeSel.value;
    const template_id = singleTplSel.value || null;
    const orderQty = parseInt(modal.querySelector("#w_qty").value||"1",10) || 1;
    
    await loadPresets();
    const presets = presetsCache.data;
    const p = (template_id && presets?.byTemplateId?.[template_id]) || (presets?.byType?.[type]) || null;
    
    addItemRow({
      type,
      template_id,
      qty_plan: orderQty,
      len_mm: p?.len_mm || 0,
      wid_mm: p?.wid_mm || 0,
      hei_mm: p?.hei_mm || 0,
      material: p?.material || ""
    });
    toast("Изделие добавлено");
  };
  
  // Обновление тиражей при изменении qty
  modal.querySelector("#w_qty").oninput = ()=>{
    // Можно добавить логику пересчёта, но лучше оставить как есть
  };
  
  clientInp.onchange = ()=>{
    presetsCache.client = "";
    presetsCache.data = null;
  };
  
  // Кнопка предпросмотра
  modal.querySelector('[data-a="preview"]').onclick = async ()=>{
    const order_id = (modal.querySelector("#w_order_id").value||"").trim();
    const client = (modal.querySelector("#w_client").value||"").trim();
    const qty = parseInt(modal.querySelector("#w_qty").value||"0",10) || 0;
    const status = modal.querySelector("#w_status").value;
    const start_date = modal.querySelector("#w_start_date").value || "";
    
    if(!order_id){ alert("Укажите ID заказа"); return; }
    if(!client){ alert("Укажите клиента"); return; }
    
    const itemRows = itemsBody.querySelectorAll('tr:not([data-placeholder])');
    if(itemRows.length === 0){ alert("Добавьте хотя бы одно изделие"); return; }
    
    const items = Array.from(itemRows).map(tr=>{
      const rowId = parseInt(tr.dataset.row_id || "0", 10);
      const bom = localBomStorage.get(rowId);
      // Если BOM был отредактирован (есть в localBomStorage, даже если пустой), передаём его
      // Если BOM не был отредактирован (нет в localBomStorage), передаём null (сервер скопирует из шаблона)
      const bomToSend = localBomStorage.has(rowId) ? (bom || []) : null;
      return {
      type: tr.dataset.product_type,
      template_id: tr.dataset.template_id || null,
        title: tr.querySelector('[data-k="title"]')?.value || "", // Название изделия
      qty_plan: parseInt(tr.querySelector('[data-k="qty_plan"]')?.value||"0",10)||0,
      len_mm: parseInt(tr.querySelector('[data-k="len_mm"]')?.value||"0",10)||0,
      wid_mm: parseInt(tr.querySelector('[data-k="wid_mm"]')?.value||"0",10)||0,
      hei_mm: parseInt(tr.querySelector('[data-k="hei_mm"]')?.value||"0",10)||0,
        material: tr.querySelector('[data-k="material"]')?.value||"",
        bom: bomToSend // Передаём отредактированную рецептуру (даже если пустая) или null для копирования из шаблона
      };
    }).filter(x=>x.qty_plan > 0);
    
    if(items.length === 0){ alert("Тираж должен быть > 0"); return; }
    
    // Открываем модальное окно предпросмотра
    await openOrderPreviewModal({
      order: { id: order_id, client, qty, status, start_date },
      items
    }, close);
  };
}

async function openOrderPreviewModal(orderData, closeParent){
  const { order, items } = orderData;
  const templates = state.productTemplates || [];
  
  // Собираем операции для каждого изделия
  const allOps = [];
  for(const item of items){
    let ops = [];
    if(item.template_id){
      try{
        const res = await api("/api/product-templates/"+encodeURIComponent(item.template_id)+"/ops");
        // API возвращает массив операций напрямую, не в объекте {ops: [...]}
        ops = Array.isArray(res) ? res : (Array.isArray(res?.ops) ? res.ops : []);
      }catch(e){
        console.error("Ошибка загрузки операций из шаблона:", e);
      }
    }
    const tpl = templates.find(t=>t.id === item.template_id);
    allOps.push({
      item,
      tplName: tpl ? tpl.name : "—",
      ops
    });
  }
  
  // Генерируем HTML для предпросмотра
  let previewHtml = "";
  let totalOpsCount = 0;
  for(const { item, tplName, ops } of allOps){
    const opsCount = ops.length;
    totalOpsCount += opsCount;
    previewHtml += `
      <div style="margin-bottom:16px;padding:12px;background:var(--card);border-radius:8px;border:1px solid var(--border)">
        <div style="font-weight:800;margin-bottom:8px">
          📦 ${esc(item.type)} — ${esc(tplName)}${item.title ? ` · <span style="color:var(--accent)">${esc(item.title)}</span>` : ""} · Тираж: ${item.qty_plan} шт
          ${item.len_mm || item.wid_mm || item.hei_mm ? `· ${item.len_mm}×${item.wid_mm}×${item.hei_mm} мм` : ""}
          ${item.material ? `· ${esc(item.material)}` : ""}
        </div>
        ${ops.length > 0 ? `
          <table style="font-size:12px">
            <thead><tr><th>№</th><th>Откуда</th><th>Операция</th><th>Машина</th><th>Куда</th><th>Оператор</th><th>Время</th></tr></thead>
            <tbody>
              ${ops.map(o=>{
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
                const inputSources = o.input_sources || null;
                const outputTargets = o.output_targets || null;
                const inputCritical = o.input_critical || 0;
                const outputCritical = o.output_critical || 0;
                return `
                <tr>
                  <td>${esc(String(o.no||""))}</td>
                  <td>${formatSources(inputSources, true)}${inputCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : ''}</td>
                  <td><b>${esc(o.operation_name||"")}</b></td>
                  <td>${esc(o.machine||"")}</td>
                  <td>${formatSources(outputTargets, false)}${outputCritical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : ''}</td>
                  <td>${esc(o.operator||"")}</td>
                  <td>${esc(o.time||"")}</td>
                </tr>
              `;
              }).join("")}
            </tbody>
          </table>
        ` : `<div style="color:var(--muted);font-style:italic">Нет операций в шаблоне</div>`}
      </div>
    `;
  }
  
  const previewModal = document.createElement("div");
  previewModal.className = "modal";
  previewModal.innerHTML = `
    <div class="modal-content" style="max-width:900px;width:100%">
      <div class="modal-header">
        <h3 style="margin:0">👁 Предпросмотр заказа</h3>
        <button class="modal-close" data-a="close">×</button>
      </div>
      <div class="modal-body" style="padding:20px;max-height:75vh;overflow-y:auto">
        <div class="card" style="margin:0 0 16px;background:rgba(0,207,181,.08);border-color:var(--accent)">
          <div style="display:flex;gap:20px;flex-wrap:wrap">
            <div><b>Заказ:</b> ${esc(order.id)}</div>
            <div><b>Клиент:</b> ${esc(order.client)}</div>
            <div><b>Тираж:</b> ${order.qty} комплектов</div>
            <div><b>Статус:</b> ${esc(order.status)}</div>
            ${order.start_date ? `<div><b>📅 Дата начала:</b> ${esc(order.start_date)}</div>` : `<div style="color:var(--muted)">📅 Дата начала: не указана</div>`}
          </div>
          <div style="margin-top:8px;font-weight:700;color:var(--accent)">
            📋 Будет создано: ${items.length} изделий, ${totalOpsCount} операций
          </div>
        </div>
        
        <h4 style="margin:0 0 12px">Изделия и операции:</h4>
        ${previewHtml}
        
        <div class="row" style="gap:10px;margin-top:20px;justify-content:flex-end">
          <button class="btn ghost" data-a="back">← Назад</button>
          <button class="btn primary" data-a="confirm">✅ Подтвердить и создать заказ</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(previewModal);
  setTimeout(()=> previewModal.classList.add("show"), 10);
  
  const closePreview = ()=>{
    previewModal.classList.remove("show");
    setTimeout(()=> previewModal.remove(), 200);
  };
  
  previewModal.querySelector('[data-a="close"]').onclick = closePreview;
  previewModal.querySelector('[data-a="back"]').onclick = closePreview;
  previewModal.onclick = (e)=>{ if(e.target===previewModal) closePreview(); };
  
  // Подтверждение создания
  previewModal.querySelector('[data-a="confirm"]').onclick = async ()=>{
    try{
      await api("/api/orders/from-wizard", {
        method:"POST",
        body: JSON.stringify({ order, items })
      });
      toast("Заказ успешно создан!");
      closePreview();
      if(closeParent) closeParent();
      state.activeOrderId = order.id;
      await refreshAll(false);
      await renderAll();
    }catch(e){
      alert("Ошибка создания заказа: " + e.message);
    }
  };
}

// getOpItemLabel, isDone, isOverdue, orderProgress, pillStatus - moved to js/core.js

// UI navigation
// Rendering - fillSelect moved to js/core.js

function renderSelectors(){
  const orders = state.orders.slice().sort((a,b)=>a.id.localeCompare(b.id));
  const active = state.activeOrderId || orders[0]?.id || "";
  if(active) {
    state.activeOrderId = active;
  }
  // Обновляем селекторы для добавления изделия (активируем или деактивируем)
  if(typeof window.fillNewItemSelectors === "function") {
    window.fillNewItemSelectors();
  } else if(typeof fillNewItemSelectors === "function") {
    fillNewItemSelectors();
  }

  fillSelect($("r_order"), orders.map(o=>o.id), active);
  
  // Восстанавливаем сохраненный фильтр заказа
  const savedFilterOrder = localStorage.getItem("filterOrder") || "(все)";
  fillSelect($("f_order"), ["(все)"].concat(orders.map(o=>o.id)), savedFilterOrder);
  
  fillSelect($("tpl_order"), orders.map(o=>o.id), $("tpl_order").value || active);
  
  // Изделия для вставки шаблона - показываем и существующие изделия, и шаблоны MVP
  const tplItemSel = $("tpl_item");
  if(tplItemSel){
    const orderId = $("tpl_order").value || active;
    const existingItems = Array.isArray(state.orderItemsByOrder?.[orderId]) ? state.orderItemsByOrder[orderId] : [];
    const productTemplates = state.productTemplates || [];
    
    tplItemSel.innerHTML = "";
    const first = document.createElement("option");
    first.value = "";
    first.textContent = (existingItems.length > 0 || productTemplates.length > 0) 
      ? "— выберите изделие —" 
      : "Нет изделий (создайте в заказе или выберите шаблон MVP)";
    tplItemSel.appendChild(first);
    
    // Сначала показываем существующие изделия в заказе
    if(existingItems.length > 0) {
      const groupLabel = document.createElement("option");
      groupLabel.value = "";
      groupLabel.textContent = "─── Изделия в заказе ───";
      groupLabel.disabled = true;
      groupLabel.style.fontWeight = "bold";
      tplItemSel.appendChild(groupLabel);
      
      for(const it of existingItems){
      const opt = document.createElement("option");
      opt.value = it.id;
        opt.dataset.isOrderItem = "true";
      const title = it.title ? ` · ${it.title}` : "";
      opt.textContent = `${it.type}${title} · план ${it.qty_plan||0}`;
      tplItemSel.appendChild(opt);
      }
    }
    
    // Затем показываем шаблоны MVP
    if(productTemplates.length > 0) {
      const groupLabel = document.createElement("option");
      groupLabel.value = "";
      groupLabel.textContent = "─── Шаблоны MVP ───";
      groupLabel.disabled = true;
      groupLabel.style.fontWeight = "bold";
      tplItemSel.appendChild(groupLabel);
      
      for(const tpl of productTemplates){
        const opt = document.createElement("option");
        opt.value = `template_${tpl.id}`;
        opt.dataset.isTemplate = "true";
        opt.dataset.templateId = tpl.id;
        opt.dataset.templateType = tpl.type || "";
        opt.textContent = `${tpl.type || ""} · ${tpl.name || ""}`;
        tplItemSel.appendChild(opt);
      }
    }
  }

  // Фильтр по изделию (в таблице операций)
  const itemFilter = $("f_item");
  if(itemFilter){
    const fo = $("f_order").value;
    // фильтр по изделию имеет смысл только при выборе конкретного заказа
    const orderId = (fo && fo !== "(все)") ? fo : "";
    const items = orderId ? (state.orderItemsByOrder?.[orderId] || []) : [];
    const saved = localStorage.getItem("filterItem") || "";
    itemFilter.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = orderId ? "(Все изделия)" : "(Выберите заказ)";
    itemFilter.appendChild(optAll);
    if(orderId){
      for(const it of items){
        const opt = document.createElement("option");
        opt.value = it.id;
        const title = it.title ? ` · ${it.title}` : "";
        opt.textContent = `${it.type}${title}`;
        if(saved && saved === it.id) opt.selected = true;
        itemFilter.appendChild(opt);
      }
      itemFilter.disabled = false;
    } else {
      itemFilter.disabled = true;
    }
  }
  
  // Для операторов автоматически выбираем их имя в селекторе "Мои задачи"
  let defaultOperator = "";
  // Приоритет: текущий пользователь-оператор > сохраненное значение > первый в списке
  if(currentUser && currentUser.role === 'operator' && currentUser.operatorName){
    defaultOperator = currentUser.operatorName;
  } else {
    // Проверяем сохраненное значение из localStorage
    const savedOp = localStorage.getItem('myOperatorFilter');
    if(savedOp && state.operators.includes(savedOp)){
      defaultOperator = savedOp;
    } else {
      defaultOperator = $("my_op")?.value || state.operators[0] || "";
    }
  }
  // Заполняем фильтры для "Мои задачи" (единые для мобильной и десктоп версии)
  if($("my_op")){
  fillSelect($("my_op"), state.operators, defaultOperator);
    // Явно устанавливаем значение после fillSelect с задержкой для гарантии
    if(defaultOperator){
      setTimeout(() => {
        const operatorExists = Array.from($("my_op").options).some(opt => opt.value === defaultOperator);
        if(operatorExists){
          if($("my_op").value !== defaultOperator){
            $("my_op").value = defaultOperator;
            // Сохраняем в localStorage
            localStorage.setItem('myOperatorFilter', defaultOperator);
            // Вызываем событие change для обновления списка задач
            $("my_op").dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }, 100);
    }
  }
  // Фильтр по заказу для "Мои"
  const savedMyOrder = localStorage.getItem("myOrderFilter") || "(все)";
  fillSelect($("my_order"), ["(все)"].concat(orders.map(o=>o.id)), savedMyOrder);
  
  fillSelect($("r_operator"), state.operators, $("r_operator").value || state.operators[0] || "");
  fillSelect($("r_machine"), state.machines, $("r_machine").value || state.machines[0] || "");
  fillSelect($("m_m"), state.machines, $("m_m").value || state.machines[0] || "");

  renderClientDatalist();
  
  // Селекторы для формы создания заказа
  if(typeof fillOrderProfileSelector === "function") fillOrderProfileSelector();
  if(typeof fillOrderTemplateSelector === "function") fillOrderTemplateSelector();
  // fillNewItemSelectors вызывается после загрузки данных в renderAll()
}

function getClientNames(){
  const set = new Set();
  for(const o of (state.orders||[])){
    const c = String(o?.client||"").trim();
    if(c) set.add(c);
  }
  return [...set].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase(), 'ru'));
}

function renderClientDatalist(){
  const dl = $("clientsList");
  if(!dl) return;
  const clients = getClientNames();
  dl.innerHTML = clients.map(c=>`<option value="${escAttr(c)}"></option>`).join("");
}

// Escaping для атрибутов (datalist option value)
function escAttr(s){
  return String(s||"")
    .replace(/&/g,"&amp;")
    .replace(/"/g,"&quot;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function renderKPIs(){
  $("k_orders").textContent = state.orders.length;
  $("k_ops").textContent = state.ops.length;
  const avg = state.ops.length ? state.ops.reduce((s,o)=>s+completion(o),0)/state.ops.length : 0;
  $("k_done").textContent = Math.round(avg*100)+"%";
}

function renderOrders(){
  const q = ($("q").value||"").toLowerCase().trim();
  const tb = $("ordersT"); tb.innerHTML="";
  const rows = state.orders.filter(o=>{
    if(!q) return true;
    return [o.id,o.client,o.product].join(" ").toLowerCase().includes(q);
  }).sort((a,b)=>a.id.localeCompare(b.id));

  for(const o of rows){
    const orderOps = state.ops.filter(x=>x.order_id===o.id);
    const totalProc = orderOps.length;
    const doneProc = orderOps.filter(isDone).length;
    const prog = orderProgress(o.id);

    const derivedStatus = (() => {
      if(totalProc > 0 && doneProc === totalProc) return "Выполнено";
      if(orderOps.some(op => op.status === "В работе" || op.status === "Наладка")) return "В работе";
      return "Запланировано";
    })();
    const statusClass = derivedStatus === "Выполнено" ? "ok" : (derivedStatus === "В работе" ? "warn" : "neutral");
    const statusHtml = `<span class="pill ${statusClass}">${esc(derivedStatus)}</span>`;

    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${esc(o.id)}${o.id===state.activeOrderId?` <span class="pill">активен</span>`:""}</td>
      <td class="editable" data-field="client" style="cursor:pointer" title="Кликните, чтобы изменить клиента">
        ${esc(o.client||"")}
        ${o.client ? `<button class="btn ghost" data-a="showClientCuttings" data-client="${esc(o.client)}" style="padding:2px 6px;font-size:10px;margin-left:6px" title="Показать все крои этого клиента">✂️</button>` : ''}
      </td>
      <td>${esc(o.product||"")}</td>
      <td>${o.qty||0}</td>
      <td class="mono">${totalProc}</td>
      <td class="mono">${doneProc}</td>
      <td>${statusHtml}</td>
      <td><span class="pill ${prog>=1?"ok":"bad"}" style="${prog>1?"background:rgba(0,207,181,.2);border-color:rgba(0,207,181,.5);font-weight:900":""}">${Math.round(prog*100)}%</span></td>
        <td class="row" style="gap:6px">
          <button class="btn ghost" data-a="open">Открыть</button>
          <button class="btn ghost" data-a="loadCutting" title="Загрузить раскрой для этого заказа">✂️ Крой</button>
          <button class="btn ghost" data-a="dup" title="Дублировать заказ (без операций)">Дубль</button>
          <button class="btn ghost" data-a="edit">✎</button>
          <button class="btn ghost danger" data-a="del">Удалить</button>
        </td>`;

    tr.querySelector('[data-a="open"]').onclick = async ()=>{ 
      state.activeOrderId=o.id; 
      await renderAll(); 
      // Обновляем селекторы для добавления изделия ПОСЛЕ renderAll
      if(typeof fillNewItemSelectors === "function") {
        fillNewItemSelectors();
      } else if(typeof window.fillNewItemSelectors === "function") {
        window.fillNewItemSelectors();
      }
      toast("Активный: "+o.id); 
    };
    tr.querySelector('[data-a="dup"]').onclick = ()=> duplicateOrder(o);
    tr.querySelector('[data-a="del"]').onclick = async ()=>{
      if(!confirm("Удалить заказ и все операции?")) return;
      try {
      await api("/api/orders/"+encodeURIComponent(o.id), { method:"DELETE" });
        await refreshAll(false);
        // Обновляем таблицу заказов без перезагрузки страницы
        renderOrders();
        toast("✅ Заказ удален: "+o.id);
      } catch(e) {
        toast("❌ Ошибка удаления: " + e.message);
      }
    };
    tr.querySelector('[data-a="edit"]').onclick = ()=> openOrderEditModal(o);
    const clientTd = tr.querySelector('td[data-field="client"]');
    if(clientTd){
      clientTd.onclick = (e) => {
        // Если клик по кнопке кроя - не редактируем клиента
        if(e.target && e.target.dataset.a === 'showClientCuttings') return;
        makeOrderClientEditable(clientTd, o);
      };
    }
    
    // Кнопка для показа всех кроев клиента
    const showCuttingsBtn = tr.querySelector('[data-a="showClientCuttings"]');
    if(showCuttingsBtn && o.client) {
      showCuttingsBtn.onclick = (e) => {
        e.stopPropagation();
        const client = o.client;
        // Переключаемся на вкладку кроя
        switchPane('cutting-simple');
        // Устанавливаем фильтр по клиенту
        setTimeout(() => {
          const clientFilter = $("simpleCuttingClientFilter");
          if(clientFilter) {
            clientFilter.value = client;
            // Загружаем раскрои с фильтром
            if(typeof window.SimpleCuttingModule !== 'undefined' && typeof window.SimpleCuttingModule.loadAndRenderSavedLayouts === 'function') {
              window.SimpleCuttingModule.loadAndRenderSavedLayouts();
            } else {
              // Если модуль еще не загружен, ждем немного
              setTimeout(() => {
                const filter = $("simpleCuttingClientFilter");
                if(filter) {
                  filter.value = client;
                  filter.onchange();
                }
              }, 500);
            }
          }
        }, 100);
        toast(`Показаны крои для клиента: ${client}`);
      };
    }

    tb.appendChild(tr);
  }
}

function renderOrderItems(){
  const tb = $("orderItemsT");
  if(!tb) return;
  const orderId = state.activeOrderId || "";
  tb.innerHTML = "";

  if(!currentUser || currentUser.role !== "admin"){
    tb.innerHTML = `<tr><td colspan="5" style="padding:14px;color:var(--muted)">Только для администратора</td></tr>`;
    return;
  }
  if(!orderId){
    tb.innerHTML = `<tr><td colspan="5" style="padding:14px;color:var(--muted)">Нет активного заказа</td></tr>`;
    return;
  }
  const items = Array.isArray(state.orderItemsByOrder?.[orderId]) ? state.orderItemsByOrder[orderId].slice() : [];
  if(items.length === 0){
    tb.innerHTML = `<tr><td colspan="5" style="padding:14px;color:var(--muted)">Добавьте изделие выше</td></tr>`;
    return;
  }

  for(const it of items){
    const tr = document.createElement("tr");
    const status = it.status || "Открыто";
    tr.innerHTML = `
      <td>
        <select data-field="type" style="padding:4px;font-weight:bold;background:var(--card);border:1px solid var(--border);border-radius:4px;color:var(--text)">
          <option value="Коробка" ${it.type==="Коробка"?"selected":""}>Коробка</option>
          <option value="Крышка" ${it.type==="Крышка"?"selected":""}>Крышка</option>
          <option value="Ложемент" ${it.type==="Ложемент"?"selected":""}>Ложемент</option>
          <option value="Вкладыш" ${it.type==="Вкладыш"?"selected":""}>Вкладыш</option>
          <option value="Другое" ${!["Коробка","Крышка","Ложемент","Вкладыш"].includes(it.type)?"selected":""}>${!["Коробка","Крышка","Ложемент","Вкладыш"].includes(it.type)?esc(it.type||"Другое"):"Другое"}</option>
        </select>
      </td>
      <td><input data-field="title" value="${esc(it.title||"")}" placeholder="Название" style="width:100%;padding:4px;background:var(--card);border:1px solid var(--border);border-radius:4px;color:var(--text)"></td>
      <td><input data-field="qty_plan" type="number" min="0" value="${it.qty_plan||0}" style="width:70px;padding:4px;font-weight:800;text-align:center;background:var(--card);border:1px solid var(--border);border-radius:4px;color:var(--text)"></td>
      <td>${esc(status)}${it.closed_at?` <span class="hint">(${esc(String(it.closed_at).slice(0,19))})</span>`:""}</td>
      <td class="row" style="gap:6px;flex-wrap:nowrap;white-space:nowrap">
        <button class="btn ghost" data-a="bom" style="padding:6px 8px;font-size:12px">📦</button>
        <button class="btn ghost" data-a="barcode" style="padding:6px 8px;font-size:12px">🖨</button>
        <button class="btn ghost" data-a="processes" style="padding:6px 8px;font-size:12px" title="Процессы производства">🔄</button>
        <button class="btn accent" data-a="save" style="padding:6px 8px;font-size:12px">💾</button>
        ${String(status).toLowerCase()==="выполнено" ? `<button class="btn ghost danger" data-a="reopen" style="padding:6px 8px;font-size:12px">↩︎</button>` : `<button class="btn accent" data-a="close" style="padding:6px 8px;font-size:12px">✅</button>`}
        <button class="btn ghost danger" data-a="del" style="padding:6px 8px;font-size:12px">🗑</button>
      </td>
    `;
    // Сохранение изменений
    const saveItem = async ()=>{
      const type = tr.querySelector('[data-field="type"]').value.trim();
      const title = tr.querySelector('[data-field="title"]').value.trim();
      const qty_plan = parseInt(tr.querySelector('[data-field="qty_plan"]').value||"0",10)||0;
      if(qty_plan<0){ toast("План не может быть отрицательным"); return; }
      try{
        await api("/api/order-items/"+encodeURIComponent(it.id), {
          method:"PUT",
          body: JSON.stringify({ type, title, qty_plan })
        });
        await refreshAll(false);
        toast("✅ Изделие обновлено");
      }catch(e){ toast("❌ Ошибка: "+e.message); }
    };
    tr.querySelector('[data-a="save"]').onclick = saveItem;
    // Сохранение по Enter
    tr.querySelectorAll('input').forEach(inp=>{
      inp.onkeydown = (e)=>{ if(e.key==="Enter") saveItem(); };
    });
    tr.querySelector('[data-a="del"]').onclick = async ()=>{
      if(!confirm("Удалить изделие? Операции отвяжутся от изделия.")) return;
      try{
        await api("/api/order-items/"+encodeURIComponent(it.id), { method:"DELETE" });
        await refreshAll(false);
        // Обновляем таблицу изделий без перезагрузки страницы
        renderOrderItems();
        toast("✅ Изделие удалено");
      }catch(e){ 
        toast("❌ Ошибка удаления: " + e.message);
      }
    };
    tr.querySelector('[data-a="bom"]').onclick = ()=> openItemBomModal(it);
    tr.querySelector('[data-a="barcode"]').onclick = ()=> openItemBarcodeModal(it, orderId);
    const processesBtn = tr.querySelector('[data-a="processes"]');
    if(processesBtn && window.showOrderProcesses) {
      processesBtn.onclick = ()=> window.showOrderProcesses(orderId, it.id);
    }
    const closeBtn = tr.querySelector('[data-a="close"]');
    if(closeBtn){
      closeBtn.onclick = async ()=>{
        if(!confirm(`Закрыть изделие "${it.type}" и выполнить списание материалов + приход продукции?\nОперации при этом не закрываются автоматически.`)) return;
        try{
          await api("/api/order-items/"+encodeURIComponent(it.id)+"/close", { method:"POST" });
          await refreshAll(false);
          toast("Изделие закрыто");
        }catch(e){
          alert("Ошибка закрытия: "+e.message);
        }
      };
    }
    const reopenBtn = tr.querySelector('[data-a="reopen"]');
    if(reopenBtn){
      reopenBtn.onclick = async ()=>{
        if(!confirm("Открыть изделие назад? Будет выполнен откат списания/прихода.")) return;
        try{
          await api("/api/order-items/"+encodeURIComponent(it.id)+"/reopen", { method:"POST" });
          await refreshAll(false);
          toast("Изделие снова открыто");
        }catch(e){
          alert("Ошибка: "+e.message);
        }
      };
    }
    tb.appendChild(tr);
  }
}

async function makeOrderClientEditable(td, order){
  if(!td || !order) return;
  if(td.classList.contains("editing")) return;
  td.classList.add("editing");

  const cur = String(order.client || "");
  const sel = document.createElement("select");
  sel.style.width = "100%";
  sel.style.minWidth = "140px";

  const clients = getClientNames();
  const values = [...new Set([cur, ...clients].filter(Boolean))];
  for(const c of values){
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    if(c === cur) opt.selected = true;
    sel.appendChild(opt);
  }
  const newOpt = document.createElement("option");
  newOpt.value = "__new__";
  newOpt.textContent = "➕ Новый клиент…";
  sel.appendChild(newOpt);

  td.textContent = "";
  td.appendChild(sel);
  sel.focus();

  const finish = (text)=>{
    td.classList.remove("editing");
    td.textContent = text ?? (order.client || "");
  };

  const save = async ()=>{
    let newVal = sel.value;
    if(newVal === "__new__"){
      const v = prompt("Введите имя нового клиента:", cur);
      if(v === null){
        finish(cur);
        return;
      }
      newVal = String(v||"").trim();
      if(!newVal){
        finish(cur);
        return;
      }
    }

    if(String(newVal) === cur){
      finish(cur);
      return;
    }

    try{
      await api("/api/orders/"+encodeURIComponent(order.id), {
        method:"PUT",
        body: JSON.stringify({ ...order, client: newVal })
      });
      finish(newVal);
      await refreshAll(false);
      toast("Клиент обновлён");
    }catch(e){
      finish(cur);
      alert("Ошибка обновления клиента: " + e.message);
    }
  };

  sel.onchange = save;
  sel.onblur = save;
}

function suggestDuplicateOrderId(baseId){
  const id = String(baseId||"").trim();
  if(!id) return "COPY-0001";
  const exists = new Set((state.orders||[]).map(o=>String(o.id||"")));
  if(!exists.has(id+"-копия")) return id+"-копия";
  for(let n=2; n<=999; n++){
    const cand = `${id}-копия-${n}`;
    if(!exists.has(cand)) return cand;
  }
  return `${id}-копия-${Date.now()}`;
}

async function duplicateOrder(o){
  try{
    const suggested = suggestDuplicateOrderId(o.id);
    const newId = prompt("Новый ID для дубликата заказа:", suggested);
    if(!newId || !newId.trim()) return;
    const id = newId.trim();
    if(state.orders.find(x=>x.id === id)){
      alert("Заказ с таким ID уже существует");
      return;
    }

    const payload = {
      id,
      client: (o.client||"").trim(),
      product: (o.product||"").trim(),
      size: (o.size||"").trim(),
      material: (o.material||"").trim(),
      qty: +o.qty || 0,
      notes: (o.notes||"").trim(),
      status: (o.status||"Запланировано")
    };

    await api("/api/orders", { method:"POST", body: JSON.stringify(payload) });
    await refreshAll(false);
    state.activeOrderId = id;
    await renderAll();
    toast("Заказ продублирован: " + id);
  }catch(e){
    alert("Ошибка дублирования: " + e.message);
  }
}

function ensureOrderEditModal(){
  const modal = $("orderEditModal");
  if(!modal || modal.dataset.ready === "1") return;
  modal.dataset.ready = "1";

  const close = ()=>{ modal.style.display = "none"; };
  $("orderEditClose").onclick = close;
  $("orderEditCancel").onclick = close;
  modal.addEventListener("click", (e)=>{ if(e.target === modal) close(); });
  document.addEventListener("keydown", (e)=>{ if(e.key === "Escape" && modal.style.display !== "none") close(); });
}

function openOrderEditModal(order){
  ensureOrderEditModal();
  renderClientDatalist();

  const modal = $("orderEditModal");
  modal.style.display = "flex";
  modal._order = order;

  $("orderEditNewId").value = order.id || "";
  $("orderEditClient").value = order.client || "";
  $("orderEditProduct").value = order.product || "";
  $("orderEditQty").value = +order.qty || 0;
  $("orderEditStatus").value = order.status || "Запланировано";

  $("orderEditNewId").focus();

  $("orderEditSave").onclick = async ()=>{
    const o = modal._order;
    if(!o) return;
    const requestedId = ($("orderEditNewId").value || "").trim();
    if(!requestedId){
      alert("ID заказа не может быть пустым");
      return;
    }
    const client = ($("orderEditClient").value || "").trim();
    const product = ($("orderEditProduct").value || "").trim();
    const qty = +($("orderEditQty").value || 0);
    const status = $("orderEditStatus").value || "Запланировано";

    try{
      let targetId = o.id;
      if(requestedId !== o.id){
        await api("/api/orders/"+encodeURIComponent(o.id)+"/rename", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ newId: requestedId })
        });
        targetId = requestedId;
      }

      await api("/api/orders/"+encodeURIComponent(targetId), {
        method:"PUT",
        body: JSON.stringify({ ...o, id: targetId, client, product, qty: isFinite(qty) ? qty : 0, status })
      });
      modal.style.display = "none";
      await refreshAll(false);
      if(state.activeOrderId === o.id) state.activeOrderId = targetId;
      toast("Заказ обновлён");
    }catch(e){
      alert("Ошибка обновления: " + e.message);
    }
  };
}


// ========================================
// makeEditable, renderTimeAnalysis, renderOps
// MOVED TO: js/modules/routing.js
// ========================================



// ========================================
// renderMy and related functions
// MOVED TO: js/modules/my.js
// ========================================

function renderMachine(){
  $("mTitle").textContent = "Список: "+($("m_m").value||"");
  const tb=$("mT"); tb.innerHTML="";
  
  // Инициализируем изменение размера столбцов после рендеринга
  setTimeout(() => {
    const machineTable = tb.closest('.resizable-table');
    if (machineTable && typeof initTableColumnResize === 'function'){
      initTableColumnResize(machineTable);
    }
  }, 50);
  
  for(const op of machineOps()){
    const c=completion(op);
    const tr=document.createElement("tr");
    if(isOverdue(op)){
      tr.className = "overdue";
    } else if(c>=1){
      tr.style.background = "rgba(46,204,113,.08)";
    }
    tr.innerHTML = `
      <td class="editable" data-field="date" data-type="date">${formatDate(op.date)}</td>
      <td class="mono">${esc(op.order_id)}</td>
      <td class="mono">${op.no||""}</td>
      <td class="editable" data-field="name" data-type="text">${esc(op.name||"")}</td>
      <td class="editable" data-field="operator" data-type="select-operator">${esc(op.operator||"")}</td>
      <td class="editable" data-field="plan" data-type="number">${op.plan||0}</td>
      <td class="editable" data-field="fact" data-type="number">${op.fact||0}</td>
      <td class="editable" data-field="scrap" data-type="number">${op.scrap||0}</td>
      <td><span class="pill ${c>=1?"ok":"bad"}" style="${c>1?"background:rgba(0,207,181,.2);border-color:rgba(0,207,181,.5);font-weight:900":""}">${Math.round(c*100)}%</span></td>
      <td class="editable" data-field="status" data-type="select-status">${pillStatus(op)}</td>
      <td style="white-space:nowrap;font-size:11px">
        ${op.setup_duration > 0 ? `<span style="color:var(--warn);font-weight:700">🔧 ${formatDuration(op.setup_duration)}</span>` : (op.setup_started_at && !op.setup_completed_at ? '<span style="color:var(--warn);font-size:10px">⏳ Идёт</span>' : '—')}
        ${op.planned_setup_time > 0 ? `<div style="font-size:9px;color:var(--muted);margin-top:2px">План: ${formatDuration(op.planned_setup_time)}</div>` : ''}
      </td>
      <td style="white-space:nowrap;font-size:11px">
        ${op.total_duration > 0 ? `<span style="color:var(--accent);font-weight:700">⚙️ ${formatDuration(op.total_duration)}</span>` : (op.started_at && !op.completed_at ? '<span style="color:var(--accent);font-size:10px">⏳ Идёт</span>' : '—')}
        ${op.planned_duration > 0 ? `<div style="font-size:9px;color:var(--muted);margin-top:2px">План: ${formatDuration(op.planned_duration)}</div>` : ''}
      </td>`;
    
    // Inline editing for all editable cells
    tr.querySelectorAll('.editable').forEach(td=>{
      td.onclick = ()=> makeEditable(td, op, td.dataset.field, td.dataset.type);
    });
    
    tb.appendChild(tr);
  }
}

function makeTemplateEditable(td, tpl, field, type="text"){
  if(td.classList.contains("editing")) return;
  
  let originalValue = tpl[field];
  let displayValue = originalValue || (type==="number" ? 0 : "");
  
  // Для setup_time конвертируем секунды в минуты для отображения
  if(field === "setup_time"){
    originalValue = Math.round((originalValue || 0) / 60); // секунды -> минуты
    displayValue = originalValue;
  }
  
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
      const newVal = sel.value;
      td.classList.remove("editing");
      td.textContent = newVal;
      if(newVal !== originalValue){
        await api("/api/templates/"+encodeURIComponent(tpl.id), { 
          method:"PUT", body: JSON.stringify({ ...tpl, [field]: newVal }) 
        });
        // Обновляем только таблицу шаблонов, без синхронизации с другими разделами
        await refreshAll(false);
        renderTemplates();
        toast("✅ Оператор изменён");
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
      const newVal = sel.value;
      td.classList.remove("editing");
      td.textContent = newVal;
      if(newVal !== originalValue){
        await api("/api/templates/"+encodeURIComponent(tpl.id), { 
          method:"PUT", body: JSON.stringify({ ...tpl, [field]: newVal }) 
        });
        // Обновляем только таблицу шаблонов, без синхронизации с другими разделами
        await refreshAll(false);
        renderTemplates();
        toast("✅ Машина изменена");
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
      const raw = isSource ? tpl.input_sources : tpl.output_targets;
      currentValues = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    } catch(e) { currentValues = []; }
    if(!Array.isArray(currentValues) || currentValues.length === 0) {
      // Fallback на старые поля
      const oldVal = isSource ? tpl.input_source : tpl.output_target;
      currentValues = oldVal ? [oldVal] : ['warehouse'];
    }
    const currentCritical = isSource ? (tpl.input_critical || false) : (tpl.output_critical || false);
    
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
          Выберите варианты для шаблона. Можно выбрать несколько.
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
        toast("Выберите хотя бы один вариант", "warning");
        return;
      }
      
      const updates = isSource 
        ? { input_sources: JSON.stringify(newValues), input_critical: newCritical ? 1 : 0 }
        : { output_targets: JSON.stringify(newValues), output_critical: newCritical ? 1 : 0 };
      
      await api("/api/templates/"+encodeURIComponent(tpl.id), { 
        method:"PUT", body: JSON.stringify({ ...tpl, ...updates }) 
      });
      await refreshAll(false);
      // Обновляем таблицу шаблонов без перезагрузки страницы
      renderTemplates();
      toast(isSource ? "✅ Варианты входа сохранены" : "✅ Варианты выхода сохранены");
    };
    
    // Закрытие при клике вне модального окна
    modal.onclick = (e)=> { 
      if(e.target === modal) { 
        document.removeEventListener('keydown', handleEscape);
        modal.remove(); 
        td.classList.remove("editing"); 
      } 
    };
    modal.onclick = (e)=> { if(e.target === modal) { modal.remove(); td.classList.remove("editing"); } };
    
  } else if(type==="cost"){
    // Редактирование стоимости с автосохранением
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = "0.01";
    inp.min = "0";
    inp.value = displayValue || 0;
    inp.style.width = "100%";
    inp.style.textAlign = "right";
    inp.style.padding = "4px 8px";
    
    td.textContent = "";
    td.appendChild(inp);
    inp.focus();
    inp.select();
    
    let saveTimeout = null;
    let isSaving = false;
    let lastSavedValue = originalValue || 0;
    
    const save = async ()=>{
      if(isSaving) return;
      
      let newVal = parseFloat(inp.value) || 0;
      if(newVal < 0) newVal = 0;
      
      // Для scrap_cost_per_unit: если не задан, автоматически равен operation_cost_per_unit
      if(field === "scrap_cost_per_unit" && newVal === 0){
        const operationCost = Number(tpl.operation_cost_per_unit || 0) || 0;
        newVal = operationCost;
        inp.value = operationCost.toFixed(2);
      }
      
      // Если значение не изменилось, не сохраняем
      if(Math.abs(newVal - lastSavedValue) < 0.01){
        return;
      }
      
      isSaving = true;
      const saveIndicator = document.createElement("span");
      saveIndicator.textContent = "💾";
      saveIndicator.style.marginLeft = "4px";
      saveIndicator.style.fontSize = "10px";
      td.appendChild(saveIndicator);
      
      try {
        const updateData = { ...tpl, [field]: newVal };
        
        // Если изменяется operation_cost_per_unit, обновляем scrap_cost_per_unit, если он равен 0
        if(field === "operation_cost_per_unit" && (!tpl.scrap_cost_per_unit || tpl.scrap_cost_per_unit === 0)){
          updateData.scrap_cost_per_unit = newVal;
        }
        
        await api("/api/templates/"+encodeURIComponent(tpl.id), { 
          method:"PUT", body: JSON.stringify(updateData) 
        });
        
        lastSavedValue = newVal;
        saveIndicator.textContent = "✅";
        setTimeout(() => {
          saveIndicator.remove();
          td.textContent = newVal.toFixed(2);
          toast("💰 Цена сохранена в шаблон");
        }, 500);
        
        await refreshAll(false);
        renderTemplates();
      } catch(e) {
        saveIndicator.textContent = "❌";
        toast("Ошибка сохранения: " + e.message, "error");
        setTimeout(() => {
          saveIndicator.remove();
          td.textContent = (lastSavedValue || 0).toFixed(2);
        }, 1000);
      } finally {
        isSaving = false;
      }
    };
    
    inp.oninput = ()=>{
      if(saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(save, 1000); // Автосохранение через 1 секунду
    };
    
    inp.onblur = ()=>{
      if(saveTimeout) clearTimeout(saveTimeout);
      save();
    };
    
    inp.onkeydown = (e)=>{
      if(e.key === "Enter"){
        e.preventDefault();
        if(saveTimeout) clearTimeout(saveTimeout);
        save();
      } else if(e.key === "Escape"){
        td.classList.remove("editing");
        td.textContent = (lastSavedValue || 0).toFixed(2);
      }
    };
    
  } else {
    const inp = document.createElement("input");
    inp.type = type;
    inp.value = displayValue;
    if(type==="number"){ 
      inp.min="0"; 
      inp.step="1"; 
      // Для planned_duration добавляем специальные атрибуты
      if(field === "planned_duration"){
        inp.min="1";
        inp.max="600";
        inp.placeholder="1-600 сек";
        inp.title="Время на обработку одной единицы (1-600 секунд)";
      }
      // Для setup_time добавляем специальные атрибуты (в минутах)
      if(field === "setup_time"){
        inp.min="0";
        inp.max="120";
        inp.placeholder="0-120 мин";
        inp.title="Время на наладку оборудования (в минутах)";
      }
    }
    
    td.textContent="";
    td.appendChild(inp);
    inp.focus();
    inp.select();
    
    const save = async ()=>{
      let newVal = inp.value;
      if(type==="number") newVal = +newVal || 0;
      
      // Валидация для planned_duration: от 1 до 600 секунд
      if(field === "planned_duration" && newVal > 0){
        if(newVal > 600){
          alert("Максимальное время на единицу: 600 секунд (10 минут)");
          newVal = 600;
          inp.value = 600;
        }
        if(newVal < 1 && newVal > 0){
          alert("Минимальное время: 1 секунда");
          newVal = 1;
          inp.value = 1;
        }
      }
      
      // Валидация для setup_time: от 0 до 120 минут
      if(field === "setup_time"){
        if(newVal > 120){
          alert("Максимальное время наладки: 120 минут (2 часа)");
          newVal = 120;
          inp.value = 120;
        }
        if(newVal < 0){
          newVal = 0;
          inp.value = 0;
        }
      }
      
      td.classList.remove("editing");
      td.textContent = newVal;
      
      if(String(newVal) !== String(originalValue)){
        // Для setup_time конвертируем минуты в секунды перед отправкой на сервер
        const valueToSave = field === "setup_time" ? newVal * 60 : newVal;
        
        // Обновляем поле в объекте шаблона
        tpl[field] = valueToSave;
        
        // Отправляем весь объект шаблона, как в операциях
        await api("/api/templates/"+encodeURIComponent(tpl.id), { 
          method:"PUT", body: JSON.stringify(tpl) 
        });
        
        // Если изменен номер шаблона, сортируем таблицу по номеру
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
          await refreshAll(false);
          renderTemplates();
          toast(`✅ Номер изменён, таблица отсортирована`);
        } else {
          // Обновляем только таблицу шаблонов, без синхронизации с другими разделами
          await refreshAll(false);
          renderTemplates();
        const fieldName = field === "planned_duration" ? "Время на единицу" : field === "setup_time" ? "Время наладки" : field;
          toast(`✅ ${fieldName} изменено`);
        }
      }
    };
    
    inp.onblur = save;
    inp.onkeydown = (e)=>{
      if(e.key==="Enter") save();
      if(e.key==="Escape"){ td.classList.remove("editing"); td.textContent=displayValue; }
    };
  }
}

function getTemplateNames(){
  const names = [...new Set(state.templates.map(t => t.name))].filter(Boolean);
  return names.sort();
}

function renderTemplateSelector(){
  const sel = $("tpl_select");
  const names = getTemplateNames();
  const current = state.currentTemplate || names[0] || "";
  
  sel.innerHTML = "";
  if(names.length === 0){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Нет шаблонов";
    sel.appendChild(opt);
    state.currentTemplate = "";
  } else {
    for(const name of names){
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if(name === current) opt.selected = true;
      sel.appendChild(opt);
    }
    if(current) state.currentTemplate = current;
  }
  
  // Обновляем селектор шаблонов-источников (мультиселект)
  const sourceSel = $("tpl_source_select");
  if(sourceSel) {
    const selectedValues = Array.from(sourceSel.selectedOptions).map(opt => opt.value);
    sourceSel.innerHTML = "";
    if(names.length === 0){
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Нет шаблонов";
      opt.disabled = true;
      sourceSel.appendChild(opt);
    } else {
      for(const name of names){
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        if(selectedValues.includes(name)) opt.selected = true;
        sourceSel.appendChild(opt);
      }
    }
  }
}

// Edit template name function
async function editTemplateName(currentName) {
  if (!currentName) return;
  
  const newName = prompt("Введите новое название шаблона:", currentName);
  if (!newName || !newName.trim() || newName.trim() === currentName) return;
  
  const trimmedName = newName.trim();
  
  // Проверяем, что такое имя не занято
  const existingNames = getTemplateNames();
  if (existingNames.includes(trimmedName)) {
    alert(`Шаблон с названием "${trimmedName}" уже существует`);
    return;
  }
  
  try {
    await api("/api/templates/name/"+encodeURIComponent(currentName), {
      method: "PUT",
      body: JSON.stringify({ name: trimmedName })
    });
    
    // Обновляем текущий шаблон
    state.currentTemplate = trimmedName;
    
    // Обновляем селектор и таблицу
    await refreshAll(false);
    renderTemplateSelector();
    renderTemplates();
    
    toast(`✅ Название шаблона изменено: "${currentName}" → "${trimmedName}"`);
  } catch (e) {
    alert("Ошибка изменения названия: " + e.message);
  }
}

// Render list of all templates
function renderTemplatesList() {
  const tb = $("templates_list_t");
  if (!tb) return;

  const templateNames = getTemplateNames();
  
  tb.innerHTML = "";
  if (templateNames.length === 0) {
    tb.innerHTML = `<tr><td colspan="3" style="padding:14px;color:var(--muted);text-align:center">Шаблонов пока нет. Создайте выше.</td></tr>`;
    return;
  }

  for (const name of templateNames) {
    const tr = document.createElement("tr");
    const templates = state.templates.filter(t => t.name === name);
    const opsCount = templates.length;
    
    tr.innerHTML = `
      <td class="editable" data-field="name" data-name="${esc(name)}" style="cursor:pointer;padding:8px 12px;font-weight:500">${esc(name)}</td>
      <td style="padding:8px 12px;text-align:center;color:var(--muted)">${opsCount}</td>
      <td class="row" style="gap:4px;flex-wrap:nowrap;justify-content:center">
        <button class="btn ghost" data-a="select" title="Выбрать в селекторе">✓</button>
      </td>
    `;
    
    // Inline редактирование названия
    const nameTd = tr.querySelector('[data-field="name"]');
    nameTd.onclick = () => editTemplateName(name);
    
    // Кнопка выбора шаблона
    tr.querySelector('[data-a="select"]').onclick = () => {
      const tplSel = $("tpl_select");
      if (tplSel) {
        tplSel.value = name;
        state.currentTemplate = name;
        renderTemplates();
        toast("✅ Шаблон выбран: " + name);
      }
    };
    
    tb.appendChild(tr);
  }
}

function renderTemplates(){
  const tb=$("templatesT"); tb.innerHTML="";
  
  // Инициализируем изменение размера столбцов после рендеринга
  setTimeout(() => {
    const templatesTable = tb.closest('.resizable-table');
    if (templatesTable && typeof initTableColumnResize === 'function'){
      initTableColumnResize(templatesTable);
    }
  }, 50);
  
  const currentName = state.currentTemplate || "";
  const templates = state.templates.filter(t=>t.name===currentName)
    .sort((a,b)=>(+a.no||0)-(+b.no||0));
  
  const nameDisplay = $("tpl_name_display");
  if(nameDisplay) {
    nameDisplay.textContent = currentName || "Нет шаблона";
    // Добавляем возможность редактирования названия шаблона
    nameDisplay.style.cursor = currentName ? "pointer" : "default";
    nameDisplay.title = currentName ? "Кликните, чтобы изменить название шаблона" : "";
    nameDisplay.onclick = currentName ? () => editTemplateName(currentName) : null;
  }
  $("tpl_count").textContent = templates.length;
  
  // Рендерим список всех шаблонов
  renderTemplatesList();
  
  if(templates.length === 0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="14" style="text-align:center;padding:20px;color:var(--muted)">Нет операций. Нажмите "+ Добавить операцию в шаблон"</td>`;
    tb.appendChild(tr);
    return;
  }
  
  for(const tpl of templates){
    const tr=document.createElement("tr");
    const timePerUnit = tpl.planned_duration || 0; // Теперь это время на единицу в секундах
    const setupTime = tpl.setup_time || 0; // Время наладки в секундах
    
    // Вычисляем примеры для разных тиражей
    let timeHint = "";
    let timeDisplay = timePerUnit || "";
    if(timePerUnit > 0){
      const for100 = formatDuration(timePerUnit * 100);
      const for500 = formatDuration(timePerUnit * 500);
      timeHint = `Примеры: 100 шт → ${for100} | 500 шт → ${for500}`;
      // Добавляем подсказку прямо в ячейку
      timeDisplay = `${timePerUnit} <span style="font-size:10px;color:var(--muted);display:block;margin-top:2px">${for100} (×100)</span>`;
    }
    
    // Конвертируем время наладки из секунд в минуты для отображения
    const setupTimeMinutes = Math.round(setupTime / 60);
    const setupTimeDisplay = setupTimeMinutes || "";
    
    // Источники входа и назначения выхода (мульти-выбор)
    let inputSources = [];
    let outputTargets = [];
    try {
      inputSources = tpl.input_sources ? (typeof tpl.input_sources === 'string' ? JSON.parse(tpl.input_sources) : tpl.input_sources) : [];
      outputTargets = tpl.output_targets ? (typeof tpl.output_targets === 'string' ? JSON.parse(tpl.output_targets) : tpl.output_targets) : [];
    } catch(e) {}
    // Fallback на старые поля
    if(!inputSources.length && tpl.input_source) inputSources = [tpl.input_source];
    if(!outputTargets.length && tpl.output_target) outputTargets = [tpl.output_target];
    if(!inputSources.length) inputSources = ['warehouse'];
    if(!outputTargets.length) outputTargets = ['warehouse'];
    
    const inputCritical = tpl.input_critical || false;
    const outputCritical = tpl.output_critical || false;
    
    // Функция отображения списка
    const formatSources = (sources, isInput) => {
      if(sources.length === 1) {
        const s = sources[0];
        if(s === 'warehouse') return `<span style="color:#4CAF50">🏭 Склад</span>`;
        if(s === 'warehouse_rest') return `<span style="color:#FF9800">💤 Отдых</span>`;
        return `<span style="color:#2196F3">⚙️ ${esc(s)}</span>`;
      }
      // Несколько вариантов - показываем все по именам
      const parts = [];
      if(sources.includes('warehouse')) parts.push('<span style="color:#4CAF50">🏭 Склад</span>');
      if(sources.includes('warehouse_rest')) parts.push('<span style="color:#FF9800">💤 Отдых</span>');
      const machines = sources.filter(s => s !== 'warehouse' && s !== 'warehouse_rest');
      machines.forEach(m => {
        parts.push(`<span style="color:#2196F3">⚙️ ${esc(m)}</span>`);
      });
      return parts.map(p => `<div style="line-height:1.4">${p}</div>`).join('');
    };
    
    let inputDisplay = formatSources(inputSources, true);
    let outputDisplay = formatSources(outputTargets, false);
    
    // НЕ добавляем машину операции в ячейки "откуда" и "куда" - она уже отображается в отдельной колонке "Машина"
    // В этих ячейках показываем только те варианты, которые выбраны в модальном окне
    
    if(inputCritical) inputDisplay += ` <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>`;
    if(outputCritical) outputDisplay += ` <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>`;
    
    // Стоимости из шаблона
    const setupCost = Number(tpl.setup_cost || 0) || 0;
    const operationCostPerUnit = Number(tpl.operation_cost_per_unit || 0) || 0;
    const scrapCostPerUnit = Number(tpl.scrap_cost_per_unit || 0) || 0;
    // Брак автоматически равен цене за единицу, если не задан
    const scrapCost = scrapCostPerUnit || operationCostPerUnit;
    
    tr.innerHTML = `
      <td class="editable" data-field="no" data-type="number">${tpl.no||""}</td>
      <td class="editable" data-field="input_source" data-type="select-source" style="font-size:11px;cursor:pointer;white-space:pre-line" title="Откуда поступает материал">
        ${inputDisplay}
      </td>
      <td class="editable" data-field="machine" data-type="select-machine" style="font-weight:600">${esc(tpl.machine||"")}</td>
      <td class="editable" data-field="output_target" data-type="select-target" style="font-size:11px;cursor:pointer;white-space:pre-line" title="Куда уходит материал">
        ${outputDisplay}
      </td>
      <td class="editable" data-field="operator" data-type="select-operator">${esc(tpl.operator||"")}</td>
      <td class="editable" data-field="operation_name" data-type="text">${esc(tpl.operation_name||"")}</td>
      <td class="editable" data-field="time" data-type="text">${esc(tpl.time||"")}</td>
      <td class="editable" data-field="planned_duration" data-type="number" title="${timeHint}" style="white-space:nowrap">${timeDisplay}</td>
      <td class="editable" data-field="setup_time" data-type="number" title="Время на наладку оборудования (в минутах)">${setupTimeDisplay}</td>
      <td class="editable" data-field="setup_cost" data-type="cost" title="Стоимость наладки (€)">${setupCost.toFixed(2)}</td>
      <td class="editable" data-field="operation_cost_per_unit" data-type="cost" title="Стоимость за единицу операции (€)">${operationCostPerUnit.toFixed(2)}</td>
      <td class="editable" data-field="scrap_cost_per_unit" data-type="cost" title="Стоимость брака за единицу (€), автоматически = цене за единицу">${scrapCost.toFixed(2)}</td>
      <td>
        <button class="btn ghost" data-a="tpl-mats" title="Материалы">📦</button>
      </td>
      <td class="row" style="gap:4px">
        <button class="btn ghost" data-a="dup" title="Дублировать">📋</button>
        <button class="btn ghost danger" data-a="del" title="Удалить">×</button>
      </td>`;
    
    // Inline editing for all editable cells
    tr.querySelectorAll('.editable').forEach(td=>{
      td.onclick = ()=> makeTemplateEditable(td, tpl, td.dataset.field, td.dataset.type);
    });
    
    tr.querySelector('[data-a="dup"]').onclick = async ()=>{
      if(!confirm("Дублировать эту операцию в шаблоне?")) return;
      
      // Find max operation number for this template
      const templateOps = state.templates.filter(t => t.name === tpl.name);
      const maxNo = templateOps.length > 0 ? Math.max(...templateOps.map(t => parseInt(t.no) || 0)) : 0;
      const nextNo = parseInt(maxNo) + 1;
      
      // Create new template operation with same data but new number
      const newTpl = {
        id: uid(),
        name: tpl.name,
        no: parseInt(nextNo),
        machine: tpl.machine || "",
        operator: tpl.operator || "",
        operation_name: tpl.operation_name || "",
        time: tpl.time || "",
        planned_duration: tpl.planned_duration || 0,
        setup_time: tpl.setup_time || 0,
        setup_cost: tpl.setup_cost || 0,
        operation_cost_per_unit: tpl.operation_cost_per_unit || 0,
        scrap_cost_per_unit: tpl.scrap_cost_per_unit || 0
      };
      
      try{
        await api("/api/templates", { method:"POST", body: JSON.stringify(newTpl) });
        // Копируем материалы (если есть)
        try{
          const src = await api("/api/templates/"+encodeURIComponent(tpl.id)+"/materials");
          const items = Array.isArray(src?.items) ? src.items.map(x=>({ material_id: x.material_id, qty: x.qty })) : [];
          if(items.length){
            await api("/api/templates/"+encodeURIComponent(newTpl.id)+"/materials", { method:"PUT", body: JSON.stringify({ items }) });
          }
        }catch(_e){}
        await refreshAll(false);
        toast("Операция продублирована как №" + nextNo);
      }catch(e){
        alert("Ошибка дублирования: " + e.message);
      }
    };
    
    tr.querySelector('[data-a="del"]').onclick = async ()=>{
      if(!confirm("Удалить эту операцию из шаблона?")) return;
      try {
      await api("/api/templates/"+encodeURIComponent(tpl.id), { method:"DELETE" });
        await refreshAll(false);
        // Обновляем таблицу шаблонов без перезагрузки страницы
        renderTemplates();
        toast("✅ Операция удалена из шаблона");
      } catch(e) {
        toast("❌ Ошибка удаления: " + e.message);
      }
    };

    const matsBtn = tr.querySelector('[data-a="tpl-mats"]');
    if(matsBtn){
      matsBtn.onclick = ()=> openTemplateMaterialsModal(tpl);
    }
    
    tb.appendChild(tr);
  }
}


// ========================================
// Settings functions (materials, units, templates, profiles)
// MOVED TO: js/modules/settings.js
// ========================================

function doPrint(html){
  const area = $("printArea");
  if(!area) return;

  // Показываем только область печати (иначе браузер может печатать не все страницы / обрезать)
  document.body.classList.add("printing");
  area.innerHTML = html;
  area.style.display = "block";

  let cleaned = false;
  const cleanup = ()=>{
    if(cleaned) return;
    cleaned = true;
    try{
      area.style.display = "none";
      area.innerHTML = "";
    }catch(_e){}
    document.body.classList.remove("printing");
  };

  // Основной путь: после завершения печати
  window.addEventListener("afterprint", cleanup, { once: true });
  // Фолбэк: когда закрыли диалог печати и вернулись в окно
  window.addEventListener("focus", ()=> setTimeout(cleanup, 0), { once: true });
  // Последний фолбэк: не держим область печати навсегда
  setTimeout(cleanup, 30000);

  // Даем браузеру отрисовать DOM перед печатью
  requestAnimationFrame(()=> requestAnimationFrame(()=> window.print()));
}
function printOperator(name, dt){
  const ops=state.ops.filter(o=>o.operator===name && (o.date||"")===dt)
    .sort((a,b)=>(a.machine||"").localeCompare(b.machine||"") || (+a.no||0)-(+b.no||0));
  const rows=ops.map(op=>{
    const st=op.status||"";
    return `<tr><td>${esc(op.machine||"")}</td><td class="mono">${op.no||""}</td><td class="mono">${esc(op.order_id)}</td><td>${esc(op.name||"")}</td><td>${op.plan||0}</td><td>${esc(st)}</td><td>☐</td><td></td></tr>`;
  }).join("");
  doPrint(`<div class="print-page"><div class="print-title">Сменный лист оператора</div>
    <div class="hint">Оператор: <b>${esc(name)}</b> · Дата: <b>${formatDate(dt)}</b></div><div style="height:8px"></div>
    <table><thead><tr><th>Машина</th><th>№</th><th>Заказ</th><th>Операция</th><th>План</th><th>Статус</th><th>✔</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

// Печать задач оператора с материалами и штрихкодами
async function printMyTasksWithMaterials(){
  const ops = myOps();
  if(ops.length === 0){
    alert("Нет задач для печати");
    return;
  }
  
  await ensureMaterialsLoaded();
  
  const operator = $("my_op").value;
  const dateFilter = $("my_date").value;
  const dateModeEl = $("my_date_mode");
  const onlyDate = dateModeEl && dateModeEl.value === "selected";
  const orderFilter = $("my_order") ? $("my_order").value : "(все)";
  const statusFilter = $("my_status") ? $("my_status").value : "all";
  
  // Собираем информацию о изделиях и их BOM
  const itemBomCache = {};
  const itemInfoCache = {};
  
  // Загружаем BOM для всех изделий
  for(const op of ops){
    if(op.order_item_id && !itemBomCache[op.order_item_id]){
      try{
        const res = await api("/api/order-items/"+encodeURIComponent(op.order_item_id)+"/bom");
        itemBomCache[op.order_item_id] = Array.isArray(res?.items) ? res.items : [];
      }catch(_e){
        itemBomCache[op.order_item_id] = [];
      }
      // Получаем инфо об изделии
      const items = state.orderItemsByOrder?.[op.order_id] || [];
      const it = items.find(x=>x.id === op.order_item_id);
      if(it) itemInfoCache[op.order_item_id] = it;
    }
  }
  
  // Формируем заголовок с фильтрами
  let filterInfo = [];
  if(operator) filterInfo.push(`Оператор: <b>${operator}</b>`);
  if(onlyDate && dateFilter) filterInfo.push(`Дата: <b>${dateFilter}</b>`);
  if(orderFilter && orderFilter !== "(все)") filterInfo.push(`Заказ: <b>${orderFilter}</b>`);
  if(statusFilter && statusFilter !== "all") filterInfo.push(`Статус: <b>${statusFilter}</b>`);
  
  // Загружаем файлы для всех операций
  const opFilesCache = {};
  for(const op of ops){
    if(!opFilesCache[op.id]){
      try{
        const res = await fetchOpFiles(op.id);
        opFilesCache[op.id] = Array.isArray(res) ? res : [];
      }catch(_e){
        opFilesCache[op.id] = [];
      }
    }
  }
  
  // Загружаем крои для всех операций, у которых есть cutting_layout_id, но нет layout_svg
  const cuttingLayoutsCache = {};
  const orderIds = [...new Set(ops.filter(op => op.order_id).map(op => op.order_id))];
  for(const orderId of orderIds){
    try{
      const layouts = await api(`/api/cutting/layouts?order_id=${encodeURIComponent(orderId)}`);
      if(Array.isArray(layouts)){
        for(const layout of layouts){
          cuttingLayoutsCache[layout.id] = layout;
          // Также кешируем по order_item_id
          if(layout.order_item_id){
            const opsWithItem = ops.filter(op => op.order_item_id === layout.order_item_id);
            for(const op of opsWithItem){
              if(op.cutting_layout_id === layout.id || !op.layout_svg){
                op.layout_svg = layout.layout_svg;
                op.material_name = layout.material_name;
                op.sheet_width_mm = layout.sheet_width_mm;
                op.sheet_length_mm = layout.sheet_length_mm;
                op.box_width_mm = layout.box_width_mm;
                op.box_length_mm = layout.box_length_mm;
                op.pieces_count = layout.pieces_count;
                op.waste_percent = layout.waste_percent;
                op.waste_width_mm = layout.waste_width_mm || 0;
                op.waste_length_mm = layout.waste_length_mm || 0;
                op.waste_area_mm2 = layout.waste_area_mm2 || 0;
                op.thickness_mm = layout.thickness_mm;
                op.layout_data_json = layout.layout_data_json;
              }
            }
          }
        }
      }
    }catch(_e){
      console.error("Ошибка загрузки кроев для заказа", orderId, _e);
    }
  }
  
  // Для операций с cutting_layout_id, но без layout_svg, ищем крой в кеше
  for(const op of ops){
    if(op.cutting_layout_id && !op.layout_svg){
      const layout = cuttingLayoutsCache[op.cutting_layout_id];
      if(layout){
        op.layout_svg = layout.layout_svg;
        op.material_name = layout.material_name;
        op.sheet_width_mm = layout.sheet_width_mm;
        op.sheet_length_mm = layout.sheet_length_mm;
        op.box_width_mm = layout.box_width_mm;
        op.box_length_mm = layout.box_length_mm;
        op.pieces_count = layout.pieces_count;
        op.waste_percent = layout.waste_percent;
        op.thickness_mm = layout.thickness_mm;
        op.layout_data_json = layout.layout_data_json;
      } else if(op.order_item_id){
        // Пробуем найти по order_item_id
        const layoutByItem = Object.values(cuttingLayoutsCache).find(l => l.order_item_id === op.order_item_id);
        if(layoutByItem){
          op.layout_svg = layoutByItem.layout_svg;
          op.material_name = layoutByItem.material_name;
          op.sheet_width_mm = layoutByItem.sheet_width_mm;
          op.sheet_length_mm = layoutByItem.sheet_length_mm;
          op.box_width_mm = layoutByItem.box_width_mm;
          op.box_length_mm = layoutByItem.box_length_mm;
          op.pieces_count = layoutByItem.pieces_count;
          op.waste_percent = layoutByItem.waste_percent;
          op.thickness_mm = layoutByItem.thickness_mm;
          op.layout_data_json = layoutByItem.layout_data_json;
          op.cutting_layout_id = layoutByItem.id; // Обновляем ID, если нашли по order_item_id
        }
      }
    }
  }
  
  // Группируем по заказам, затем по изделиям
  const byOrder = {};
  for(const op of ops){
    const key = op.order_id || "Без заказа";
    if(!byOrder[key]) byOrder[key] = {};
    const itemId = op.order_item_id || "Без изделия";
    if(!byOrder[key][itemId]) byOrder[key][itemId] = [];
    byOrder[key][itemId].push(op);
  }
  
  // Функция форматирования источников/назначений
  const formatSourcesForPrint = (sources) => {
    if (!sources) return '—';
    let parsed = [];
    try {
      parsed = typeof sources === 'string' ? JSON.parse(sources) : sources;
    } catch(e) {
      parsed = [sources];
    }
    if (!Array.isArray(parsed)) parsed = [parsed];
    if (parsed.length === 0) return '—';
    
    const labels = {
      'warehouse': '🏭 Склад',
      'warehouse_rest': '💤 Отдых',
    };
    
    return parsed.map(s => {
      const label = labels[s] || `⚙️ ${esc(String(s))}`;
      return `<div style="line-height:1.4">${label}</div>`;
    }).join('');
  };
  
  // Генерируем HTML для печати
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Задачи: ${operator}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; padding: 5mm; margin: 0; }
        h1 { font-size: 16px; margin: 0 0 8px; border-bottom: 2px solid #000; padding-bottom: 4px; }
        h2 { font-size: 14px; margin: 15px 0 8px; background: #eee; padding: 6px 8px; border-left: 4px solid #2196F3; }
        h3 { font-size: 13px; margin: 12px 0 6px; background: #f0f0f0; padding: 5px 8px; border-left: 3px solid #4CAF50; }
        .filter-info { font-size: 11px; margin-bottom: 12px; padding: 6px; background: #f5f5f5; border-radius: 4px; }
        .materials-section { background: #fffde7; padding: 8px; margin-bottom: 12px; border: 1px solid #fbc02d; border-radius: 4px; }
        .materials-title { font-weight: bold; font-size: 12px; margin-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
        th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
        th { background: #ddd; font-weight: bold; }
        .task-card { border: 1px solid #000; padding: 3px 5px; margin-bottom: 3px; page-break-inside: avoid; border-radius: 2px; line-height: 1.2; }
        .task-header { font-weight: bold; font-size: 10px; margin-bottom: 2px; line-height: 1.2; display: flex; align-items: center; }
        .task-info { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; margin: 2px 0 0 0; font-size: 9px; line-height: 1.2; }
        .task-info-box { border: 1px solid #ccc; padding: 2px 4px; background: #f9f9f9; border-radius: 2px; }
        .task-info-label { font-weight: bold; color: #666; font-size: 8px; display: block; margin-bottom: 1px; }
        .task-info-value { font-size: 9px; }
        .checkbox { width: 10px; height: 10px; border: 1px solid #000; display: inline-block; margin-right: 3px; vertical-align: middle; flex-shrink: 0; }
        @media print { 
          body { padding: 3mm; }
          @page { margin: 3mm; }
          .task-card { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <h1>📋 Задачи оператора</h1>
      <div class="filter-info">${filterInfo.join(" · ") || "Все задачи"} · Всего: <b>${ops.length}</b> операций</div>
  `;
  
  for(const [orderId, orderItems] of Object.entries(byOrder)){
    const order = (state.orders||[]).find(o=>o.id === orderId);
    html += `<h2>📦 Заказ: ${orderId}${order ? ` · Клиент: ${order.client||""}` : ""}</h2>`;
    
    // Сортируем изделия по типу и названию
    const sortedItems = Object.entries(orderItems).sort((a, b) => {
      const itemA = itemInfoCache[a[0]];
      const itemB = itemInfoCache[b[0]];
      if(!itemA && !itemB) return a[0].localeCompare(b[0]);
      if(!itemA) return 1;
      if(!itemB) return -1;
      const typeComp = (itemA.type || "").localeCompare(itemB.type || "");
      if(typeComp !== 0) return typeComp;
      return (itemA.title || "").localeCompare(itemB.title || "");
    });
    
    // Для каждого изделия показываем материалы и задачи
    for(const [itemId, itemOps] of sortedItems){
      const itemInfo = itemInfoCache[itemId];
      const itemBom = itemBomCache[itemId] || [];
      
      // Заголовок изделия
      const itemLabel = itemInfo 
        ? `${esc(itemInfo.type || "")}${itemInfo.title ? " · " + esc(itemInfo.title) : ""}`
        : (itemId === "Без изделия" ? "Без изделия" : `Изделие ${itemId}`);
      html += `<h3>📦 ${itemLabel}</h3>`;
      
      // Показываем материалы для этого изделия
      if(itemBom.length > 0){
        html += `
          <div class="materials-section">
            <div class="materials-title">📦 Материалы для изделия:</div>
            <table>
              <tr><th>Материал</th><th>На 1 шт</th><th>Всего</th></tr>
        `;
        for(const b of itemBom){
          const mat = (state.materials||[]).find(m=>m.id === b.material_id);
          const itemQty = Number(itemInfo?.qty_plan||0)||0;
          const qtyPerUnit = Number(b.qty_per_unit||0)||0;
          const qtyFromMaterial = Number(b.qty_from_material||1)||1;
          const need = qtyFromMaterial > 0 ? Math.ceil((qtyPerUnit * itemQty) / qtyFromMaterial * 100) / 100 : 0;
          html += `<tr>
            <td>${mat ? esc(mat.name) : '—'}${mat?.unit ? ` (${esc(mat.unit)})` : ""}</td>
            <td>${formatStock(qtyPerUnit)}</td>
            <td><b>${formatStock(need)}</b></td>
          </tr>`;
        }
        html += `</table></div>`;
      }
      
      // Сортируем операции по номеру
      itemOps.sort((a, b) => (Number(a.no||0)||0) - (Number(b.no||0)||0));
      
      // Показываем все задачи для этого изделия
      for(const op of itemOps){
        const inputSources = formatSourcesForPrint(op.input_sources);
        const outputTargets = formatSourcesForPrint(op.output_targets);
        
        html += `
          <div class="task-card">
            <div class="task-header">
              <span class="checkbox"></span>
              <b>${op.no || ""}. ${op.name || "Операция"}</b>
            </div>
            <div class="task-info">
              <div class="task-info-box">
                <div class="task-info-label">Тираж</div>
                <div class="task-info-value"><b>${op.plan||0} шт</b></div>
              </div>
              <div class="task-info-box">
                <div class="task-info-label">Откуда пришло</div>
                <div class="task-info-value">${inputSources}</div>
              </div>
              <div class="task-info-box">
                <div class="task-info-label">Машина</div>
                <div class="task-info-value"><b>${esc(op.machine||"—")}</b></div>
              </div>
              <div class="task-info-box">
                <div class="task-info-label">Куда пойдёт</div>
                <div class="task-info-value">${outputTargets}</div>
              </div>
            </div>
          </div>
        `;
      }
    }
  }
  
  html += `
      <scr` + `ipt>window.onload = function(){ window.print(); }</scr` + `ipt>
    </body>
    </html>
  `;
  
  const printWindow = window.open("", "_blank", "width=800,height=600");
  if(printWindow){
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    alert("Разрешите всплывающие окна для печати");
  }
}
function printMachine(machine, dt){
  const ops=state.ops.filter(o=>o.machine===machine && (o.date||"")===dt)
    .sort((a,b)=>a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0));
  const rows=ops.map(op=>{
    const st=op.status||"";
    return `<tr><td class="mono">${op.no||""}</td><td class="mono">${esc(op.order_id)}</td><td>${esc(op.name||"")}</td><td>${esc(op.operator||"")}</td><td>${op.plan||0}</td><td>${esc(st)}</td><td>☐</td><td></td></tr>`;
  }).join("");
  doPrint(`<div class="print-page"><div class="print-title">Сменный лист машины</div>
    <div class="hint">Машина: <b>${esc(machine)}</b> · Дата: <b>${formatDate(dt)}</b></div><div style="height:8px"></div>
    <table><thead><tr><th>№</th><th>Заказ</th><th>Операция</th><th>Оператор</th><th>План</th><th>Статус</th><th>✔</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}
function printChecklist(){
  const steps=["Подготовить материал","Проверить настройки","Установить форму/инструмент","Сделать тест","Запустить тираж","Контроль качества","Очистка и завершение"];
  const rows=steps.map((s,i)=>`<tr><td class="mono">${i+1}</td><td>${esc(s)}</td><td>☐</td><td></td></tr>`).join("");
  doPrint(`<div class="print-page"><div class="print-title">Чеклист запуска</div>
    <div class="hint">Дата: <b>${formatDate(todayISO())}</b></div><div style="height:8px"></div>
    <table><thead><tr><th>№</th><th>Шаг</th><th>✔</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}
function printRouteDay(dt){
  const fo = $("f_order").value;
  // Фильтр по дате/заказу
  let ops = state.ops.filter(o=>{
    if((o.date||"")!==dt) return false;
    if(fo && fo!=="(все)" && o.order_id!==fo) return false;
    return true;
  });
  if(ops.length===0){
    alert("Нет операций на выбранную дату" + (fo && fo!=="(все)" ? " для заказа " + fo : ""));
    return;
  }

  // Группировка по оператору, сортировка внутри по времени, машине, заказу, №
  ops.sort((a,b)=>{
    const opComp = (a.operator||"Без оператора").localeCompare(b.operator||"Без оператора");
    if(opComp!==0) return opComp;
    const timeComp = (a.time||"").localeCompare(b.time||"");
    if(timeComp!==0) return timeComp;
    const machComp = (a.machine||"").localeCompare(b.machine||"");
    if(machComp!==0) return machComp;
    return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
  });
  const groups = {};
  ops.forEach(op=>{
    const key = op.operator || "Без оператора";
    if(!groups[key]) groups[key]=[];
    groups[key].push(op);
  });

  const groupHtml = Object.entries(groups).map(([operator, list])=>{
    const rows = list.map(op=>`
      <tr>
        <td style="width:54px">${esc(op.time||"—")}</td>
        <td style="width:90px">${esc(op.machine||"")}</td>
        <td class="mono" style="width:80px">${esc(op.order_id)}</td>
        <td class="mono" style="width:32px">${op.no||""}</td>
        <td>${esc(op.name||"")}</td>
        <td style="width:55px">${op.plan||0}</td>
        <td style="width:70px">${esc(op.status||"")}</td>
        <td style="width:32px">☐</td>
      </tr>
    `).join("");
    return `
      <div style="page-break-inside:avoid;margin-bottom:10px">
        <div style="font-weight:800;font-size:13px;margin-bottom:4px">👤 ${esc(operator)}</div>
        <table style="font-size:11px">
          <thead>
            <tr><th>Время</th><th>Машина</th><th>Заказ</th><th>№</th><th>Операция</th><th>План</th><th>Статус</th><th>✔</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join("");

  doPrint(`<div class="print-page" style="font-size:11px">
    <div class="print-title" style="margin-bottom:6px">Маршрут на день (по операторам)</div>
    <div class="hint" style="margin-bottom:8px">Дата: <b>${formatDate(dt)}</b> · Операций: <b>${ops.length}</b>${fo && fo!=="(все)" ? " · Заказ: <b>" + fo + "</b>" : ""}</div>
    ${groupHtml}
  </div>`);
}

function printRouteSection(){
  const fo = $("f_order").value;
  const fDate = $("f_date").value || todayISO();
  const fDateMode = $("f_date_mode") ? $("f_date_mode").value : "selected";
  const sortBy = state.sortBy || "order";
  const sortByStatus = $("sort_by_status") ? $("sort_by_status").value : "";

  // Снимаем фактические ширины колонок из таблицы маршрута на экране,
  // чтобы печать имела ИДЕНТИЧНУЮ раскладку колонок.
  const routeTable = document.querySelector("#routeCard table");
  const routeThs = routeTable ? Array.from(routeTable.querySelectorAll("thead th")) : [];
  const colWidths = routeThs.length ? routeThs.map(th => Math.max(24, Math.round(th.getBoundingClientRect().width))) : [];
  const colgroupHtml = colWidths.length
    ? `<colgroup>${colWidths.map(w => `<col style="width:${w}px">`).join("")}</colgroup>`
    : "";

  // Берём операции из state, применяем фильтры как в маршруте
  let ops = state.ops.filter(op=>{
    if(fo && fo!=="(все)" && op.order_id!==fo) return false;
    if(fDateMode === "selected" && fDate && (op.date||"") !== fDate) return false;
    return true;
  }).slice();

  if(ops.length === 0){
    alert("Нет операций для печати на выбранную дату");
    return;
  }

  // Сортировка (та же логика, что в маршруте)
  ops.sort((a,b)=>{
    if(sortBy === "overdue"){
      const overdueA = isOverdue(a) ? 1 : 0;
      const overdueB = isOverdue(b) ? 1 : 0;
      if(overdueA !== overdueB) return overdueB - overdueA;
      if(overdueA === 1){
        const dateComp = (a.date||"").localeCompare(b.date||"");
        if(dateComp !== 0) return dateComp;
      }
      return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
    } else if(sortBy === "client"){
      const orderA = state.orders.find(o => o.id === a.order_id);
      const orderB = state.orders.find(o => o.id === b.order_id);
      const clientA = (orderA?.client || "Без клиента").toLowerCase();
      const clientB = (orderB?.client || "Без клиента").toLowerCase();
      const clientComp = clientA.localeCompare(clientB);
      if(clientComp !== 0) return clientComp;
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
      const timeComp = (a.time||"").localeCompare(b.time||"");
      if(timeComp !== 0) return timeComp;
      return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
    } else {
      return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
    }
  });

  // ВТОРИЧНАЯ сортировка по статусу — строго как в маршруте:
  // сортируем по статусу ВНУТРИ групп основной сортировки, сохраняя порядок внутри одинакового статуса
  if(sortByStatus === "status"){
    const statusOrder = { "Запланировано": 1, "Наладка": 2, "В работе": 3, "Выполнено": 4, "Стоп": 5 };

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
        groupKey = op.order_id;
      }
      if(!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push({ op, originalIndex: index });
    });

    const sortedOps = [];
    for(const [_groupKey, groupOps] of groups){
      groupOps.sort((a, b) => {
        const sa = statusOrder[a.op.status] || 99;
        const sb = statusOrder[b.op.status] || 99;
        if(sa !== sb) return sa - sb;
        return a.originalIndex - b.originalIndex; // стабильность
      });
      sortedOps.push(...groupOps.map(item => item.op));
    }
    ops = sortedOps;
  }

  // Ручной порядок (перетаскивания) — как в маршруте
  const swaps = JSON.parse(localStorage.getItem("opsSwaps") || "[]");
  if(swaps.length > 0){
    const opsMap = new Map();
    ops.forEach(op => opsMap.set(op.id, op));
    for(let i = swaps.length - 1; i >= 0; i--){
      const swap = swaps[i];
      const draggedOp = opsMap.get(swap.dragged);
      const targetOp = opsMap.get(swap.target);
      if(draggedOp && targetOp){
        const draggedIndex = ops.indexOf(draggedOp);
        const targetIndex = ops.indexOf(targetOp);
        if(draggedIndex !== -1 && targetIndex !== -1){
          ops.splice(draggedIndex, 1);
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

  // В маршруте выполненные — отдельным блоком
  const incompleteOps = ops.filter(op => op.status !== "Выполнено");
  const completedOps = ops.filter(op => op.status === "Выполнено");

  // Подсчёты для групп (как на экране): показываем заголовки групп, если сортировка не по заказу,
  // либо если включена вторичная сортировка по статусу при sortBy=order (тогда группируем по статусу)
  const getGroupValue = (op)=>{
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
    }
    if(sortByStatus === "status" && !groupValue){
      groupValue = op.status || "Без статуса";
    }
    return groupValue;
  };
  const getGroupLabel = (op)=>{
    if(sortBy === "date") return formatDate(op.date) || "Без даты";
    return getGroupValue(op);
  };
  const groupCounts = {};
  if(sortBy !== "order"){
    for(const op of incompleteOps){
      const gv = getGroupValue(op);
      if(gv) groupCounts[gv] = (groupCounts[gv] || 0) + 1;
    }
  }

  // Компактный Excel-подобный вид: фиксированные колонки, nowrap, тонкие границы
  const buildRowsWithGroups = (list, { showDoneHeader } = {})=>{
    let currentGroup = null;
    const out = [];
    for(const op of list){
      let gv = null;
      let gl = null;
      if(sortBy !== "order"){
        gv = getGroupValue(op);
        gl = getGroupLabel(op);
      } else if(sortByStatus === "status"){
        // на экране при sortBy=order + sortByStatus=status фактически появляются статус-группы
        gv = getGroupValue(op);
        gl = getGroupLabel(op);
      }
      if(gv && gv !== currentGroup){
        currentGroup = gv;
        const count = groupCounts[gv] || "";
        out.push(`
          <tr>
            <td colspan="17" style="padding:4px 6px;border:1px solid #bbb;background:#f3f4f6;font-weight:900">
              ${esc(gl || gv)}${count ? ` <span style="font-weight:700;color:#555">(${count})</span>` : ""}
            </td>
          </tr>
        `);
      }
      const formatSourcesForPrint = (sources) => {
        if (!sources) return '—';
        let parsed = [];
        try {
          parsed = typeof sources === 'string' ? JSON.parse(sources) : sources;
        } catch(e) {
          parsed = [sources];
        }
        if (!Array.isArray(parsed)) parsed = [parsed];
        if (parsed.length === 0) return '—';
        
        const labels = {
          'warehouse': '🏭 Склад',
          'warehouse_rest': '💤 Отдых',
        };
        
        // Каждое значение на новой строке (через <br> для HTML печати)
        return parsed.map(s => {
          const label = labels[s] || `⚙️ ${String(s)}`;
          return label;
        }).join('<br>');
      };
      
      const inputSources = formatSourcesForPrint(op.input_sources);
      const outputTargets = formatSourcesForPrint(op.output_targets);
      const inputCritical = op.input_critical ? ' ⚠' : '';
      const outputCritical = op.output_critical ? ' ⚠' : '';
      
      const c = completion(op);
      out.push(`
        <tr>
          <td class="mono">${op.no||""}</td>
          <td class="mono">${esc(op.order_id)}</td>
          <td>${formatDate(op.date)}</td>
          <td>${esc(op.time||"—")}</td>
          <td style="font-size:10px">${inputSources}${inputCritical}</td>
          <td>${esc(op.machine||"")}</td>
          <td style="font-size:10px">${outputTargets}${outputCritical}</td>
          <td>${esc(op.operator||"")}</td>
          <td>${esc(op.name||"")}</td>
          <td class="mono">${op.plan||0}</td>
          <td class="mono">${op.fact||0}</td>
          <td class="mono">${op.scrap||0}</td>
          <td><span class="pill ${c>=1?"ok":"bad"}">${Math.round(c*100)}%</span></td>
          <td>${esc(op.status||"")}</td>
          <td style="white-space:nowrap;font-size:11px">
            ${op.setup_duration > 0 ? `🔧 ${formatDuration(op.setup_duration)}` : (op.setup_started_at && !op.setup_completed_at ? '⏳ Идёт' : '—')}
            <div style="font-size:9px;color:var(--muted);margin-top:2px">План: ${formatDuration(op.planned_setup_time||0)}</div>
          </td>
          <td style="white-space:nowrap;font-size:11px">
            ${op.total_duration > 0 ? `⚙️ ${formatDuration(op.total_duration)}` : (op.started_at && !op.completed_at ? '⏳ Идёт' : '—')}
            <div style="font-size:9px;color:var(--muted);margin-top:2px">План: ${formatDuration(op.planned_duration||0)}</div>
          </td>
          <td></td>
        </tr>
      `);
    }
    if(showDoneHeader && completedOps.length){
      out.push(`
        <tr>
          <td colspan="17" style="padding:6px;border:1px solid #bbb;background:#eef2ff;font-weight:900">
            ✅ Выполнено (${completedOps.length})
          </td>
        </tr>
      `);
    }
    return out.join("");
  };

  const rows =
    buildRowsWithGroups(incompleteOps) +
    (completedOps.length ? buildRowsWithGroups(completedOps, { showDoneHeader: true }) : "");

  doPrint(`
    <div class="print-page" style="font-size:10px;line-height:1.05">
      <div class="print-title" style="margin-bottom:4px">Маршрут (печать)</div>
      <div class="hint" style="margin-bottom:6px">Дата: <b>${formatDate(fDate)}</b> · Операций: <b>${ops.length}</b>${fo && fo!=="(все)" ? " · Заказ: <b>" + fo + "</b>" : ""}</div>
      <table style="border-collapse:collapse;font-size:10px;line-height:1.05;table-layout:fixed;">
        ${colgroupHtml}
        <thead>
          <tr>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">№</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">Заказ</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">Дата</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">Время</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">Откуда</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">Машина</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">Куда</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">Оператор</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">Операция</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">План</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">Факт</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">Брак</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">Готово</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">Статус</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">🔧 Наладка</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap">⚙️ Работа</th>
            <th style="padding:2px 4px;border:1px solid #ccc;white-space:nowrap"></th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `);
}

function exportRouteExcel(){
  const fo = $("f_order").value;
  const fDate = $("f_date").value || todayISO();
  const fDateMode = $("f_date_mode") ? $("f_date_mode").value : "selected";
  const sortBy = state.sortBy || "order";
  const sortByStatus = $("sort_by_status") ? $("sort_by_status").value : "";

  let ops = state.ops.filter(op=>{
    if(fo && fo!=="(все)" && op.order_id!==fo) return false;
    if(fDateMode === "selected" && fDate && (op.date||"") !== fDate) return false;
    return true;
  }).slice();
  if(ops.length === 0){
    alert("Нет операций для экспорта на выбранную дату");
    return;
  }
  // Сортировка та же, что в маршруте
  ops.sort((a,b)=>{
    if(sortBy === "overdue"){
      const overdueA = isOverdue(a) ? 1 : 0;
      const overdueB = isOverdue(b) ? 1 : 0;
      if(overdueA !== overdueB) return overdueB - overdueA;
      if(overdueA === 1){
        const dateComp = (a.date||"").localeCompare(b.date||"");
        if(dateComp !== 0) return dateComp;
      }
      return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
    } else if(sortBy === "client"){
      const orderA = state.orders.find(o => o.id === a.order_id);
      const orderB = state.orders.find(o => o.id === b.order_id);
      const clientA = (orderA?.client || "Без клиента").toLowerCase();
      const clientB = (orderB?.client || "Без клиента").toLowerCase();
      const clientComp = clientA.localeCompare(clientB);
      if(clientComp !== 0) return clientComp;
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
      const timeComp = (a.time||"").localeCompare(b.time||"");
      if(timeComp !== 0) return timeComp;
      return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
    } else {
      return a.order_id.localeCompare(b.order_id) || (+a.no||0)-(+b.no||0);
    }
  });
  if(sortByStatus === "status"){
    const statusOrder = {
      "Запланировано": 1,
      "Наладка": 2,
      "В работе": 3,
      "Выполнено": 4,
      "Стоп": 5
    };
    ops = ops
      .map((op,i)=>({op,primaryKey:i,statusOrder:statusOrder[op.status]||99}))
      .sort((a,b)=> a.statusOrder===b.statusOrder ? a.primaryKey-b.primaryKey : a.statusOrder-b.statusOrder)
      .map(x=>x.op);
  }

  const headers = [
    "№","Заказ","Дата","Время","Машина","Оператор","Операция",
    "План","Факт","Брак","Готово","Статус","Наладка","Работа"
  ];
  const rows = ops.map(op=>{
    const completionPct = Math.round((completion(op) || 0)*100);
    const factStart = op.setup_started_at ? new Date(op.setup_started_at).toTimeString().slice(0,5) : "—";
    const factEnd = op.operation_completed_at ? new Date(op.operation_completed_at).toTimeString().slice(0,5) : "—";
    const timeCell = [
      `План: ${op.time||"—"}`,
      `Старт: ${factStart}`,
      `Конец: ${factEnd}`
    ].join("\n");
    const setupCell = [
      `Факт: ${formatDuration(op.setup_duration||0)}`,
      `План: ${formatDuration(op.planned_setup_time||0)}`
    ].join("\n");
    const workCell = [
      `Факт: ${formatDuration(op.total_duration||0)}`,
      `План: ${formatDuration(op.planned_duration||0)}`
    ].join("\n");
    return [
      op.no||"",
      op.order_id||"",
      formatDate(op.date)||"",
      timeCell,
      op.machine||"",
      op.operator||"",
      op.name||"",
      op.plan||0,
      op.fact||0,
      op.scrap||0,
      `${completionPct}%`,
      op.status||"",
      setupCell,
      workCell
    ];
  });

  let html = `
    <html><head><meta charset="utf-8">
    <style>
      table{border-collapse:collapse;font-size:10px;}
      th,td{white-space:pre-line;}
    </style>
    </head><body>
    <table border="1" cellspacing="0" cellpadding="2">
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map(r=>`<tr>${r.map(c=>`<td>${String(c).replace(/</g,"&lt;")}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
    </body></html>
  `;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `route_${fDate}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  toast("Excel-файл сформирован");
}

function opShortCode(op){
  // Стабильный код только от id операции: не меняется при изменении статуса/поля
  const baseStr = String(op.id || "");
  let h = 5381;
  for(let i=0;i<baseStr.length;i++){ h = ((h<<5)+h) + baseStr.charCodeAt(i); h &= 0xffffffff; }
  let b36 = Math.abs(h).toString(36).toUpperCase();
  b36 = b36.padStart(6,"0").slice(0,6);
  const letters = b36.replace(/[^A-Z]/g,"") || "ABC";
  const digits = b36.replace(/[^0-9]/g,"") || "123";
  return (letters + "ABC").slice(0,3) + (digits + "123").slice(0,3);
}

async function printOpQr(op){
  // Подготовка данных для штрихкода (Code128) и короткого буквенно-цифрового кода
  // Сжимаем ключи, чтобы код был короче
  const payload = {
    i: op.id,
    o: op.order_id,
    n: op.no,
    nm: op.name,
    m: op.machine,
    op: op.operator,
    p: op.plan,
    f: op.fact,
    sc: op.scrap,
    au: op.auxiliary_units,
    st: op.status,
    ss: op.setup_started_at,
    ws: op.started_at,
    c: op.operation_completed_at,
    sd: op.setup_duration,
    wd: op.total_duration,
    ps: op.planned_setup_time,
    pw: op.planned_duration
  };
  const formatDt = (dt)=> dt ? new Date(dt).toLocaleString('ru-RU', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'}) : "—";
  const txt = [
    `Заказ: ${op.order_id||"—"} (№${op.no||"—"})`,
    `Операция: ${op.name||"—"}`,
    `Машина: ${op.machine||"—"}`,
    `Оператор: ${op.operator||"—"}`,
    `План: ${op.plan||0} | Факт: ${op.fact||0} | Брак: ${op.scrap||0}`,
    `Приладочные: ${op.auxiliary_units||0}`,
    `Статус: ${op.status||"—"}`,
    `Начало наладки: ${formatDt(op.setup_started_at)}`,
    `Начало работы: ${formatDt(op.started_at)}`,
    `Завершено: ${formatDt(op.operation_completed_at)}`,
    `Наладка факт: ${formatDuration(op.setup_duration||0)} · план: ${formatDuration(op.planned_setup_time||0)}`,
    `Работа факт: ${formatDuration(op.total_duration||0)} · план: ${formatDuration(op.planned_duration||0)}`
  ].join("\n");

  // Очень короткий идентификатор: 3 буквы + 3 цифры (6 символов) — стабильный по id
  const codeStr = opShortCode(op);
  const printedAt = new Date();

  let attachments = [];
  try{
    attachments = await fetchOpFiles(op.id);
  }catch(e){
    console.error("Не удалось загрузить файлы для печати:", e);
  }
  const isImg = (name)=>/\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(name||"");
  const isPdf = (name)=>/\.pdf$/i.test(name||"");
  
  // Загружаем рецептуру изделия если операция привязана к изделию (из item_bom)
  let bomHtml = "";
  if(op.order_item_id){
    try {
      const bomData = await api("/api/order-items/"+encodeURIComponent(op.order_item_id)+"/bom");
      const bomItems = Array.isArray(bomData?.items) ? bomData.items : [];
      if(bomItems.length > 0){
        const planQty = op.plan || 0;
        
        // Функция расчета нужного количества (та же формула, что и в печати изделий)
        const calcNeeded = (qtyPerUnit, qtyFromMaterial, itemQty) => {
          const qpu = parseFloat(qtyPerUnit) || 0;
          const qfm = parseFloat(qtyFromMaterial) || 1;
          const q = parseFloat(itemQty) || 1;
          if(qfm <= 0) return 0;
          return Math.ceil((qpu * q) / qfm * 100) / 100;
        };
        
        bomHtml = `
          <div style="margin-bottom:4mm;font-weight:700;font-size:12px">📦 Рецептура (на ${planQty} шт):</div>
          <table class="materials-table">
            <tr style="background:#f0f0f0">
              <th style="text-align:left">Материал</th>
              <th style="text-align:right;width:30mm">На 1 шт</th>
              <th style="text-align:right;width:30mm">Всего</th>
            </tr>
        `;
        for(const b of bomItems){
          const matName = b.name || b.material_id || '—';
          const unit = b.unit || '';
          const qtyPerUnit = Number(b.qty_per_unit || 0);
          const qtyFromMaterial = Number(b.qty_from_material || 1) || 1;
          const totalQty = calcNeeded(qtyPerUnit, qtyFromMaterial, planQty);
          bomHtml += `
            <tr>
              <td>${esc(matName)}${unit ? ' <span style="color:#666">('+esc(unit)+')</span>' : ''}</td>
              <td style="text-align:right">${formatStock(qtyPerUnit)}</td>
              <td style="text-align:right;font-weight:700">${formatStock(totalQty)}</td>
            </tr>
          `;
        }
        bomHtml += `</table>`;
      }
    } catch(e){
      console.error("Не удалось загрузить рецептуру для печати:", e);
    }
  }
  
  // Загружаем данные раскроя, если он привязан к операции
  let cuttingLayoutHtml = "";
  if (op.cutting_layout_id) {
    const layoutData = op.layout_data_json ? 
      (typeof op.layout_data_json === 'string' ? JSON.parse(op.layout_data_json) : op.layout_data_json) : {};
    
    // Получаем данные для генерации SVG
    const sheetWidth = op.sheet_width_mm || layoutData.sheetWidth || 0;
    const sheetLength = op.sheet_length_mm || layoutData.sheetLength || 0;
    const pieceWidth = op.box_width_mm || layoutData.pieceWidth || 0;
    const pieceLength = op.box_length_mm || layoutData.pieceLength || 0;
    const kerf = layoutData.kerf || 0;
    
    // Формируем layout объект для генерации SVG (как в предпросмотре)
    const layoutForSvg = {
      pieces: layoutData.pieces || [],
      rotated: layoutData.rotated || false,
      wasteWidth: op.waste_width_mm || layoutData.wasteWidth || 0,
      wasteLength: op.waste_length_mm || layoutData.wasteLength || 0,
      wasteArea: op.waste_area_mm2 || layoutData.wasteArea || 0
    };
    
    // Используем сохранённый SVG из предпросмотра (тот же, что отображается в предпросмотре)
    let printSvg = '';
    if (op.layout_svg) {
      // Используем сохранённый SVG - он уже содержит все элементы, включая импортированный SVG (кровь)
      printSvg = op.layout_svg;
    } else if (layoutForSvg.pieces && layoutForSvg.pieces.length > 0) {
      // Если сохранённого SVG нет, генерируем заново с использованием универсальной функции
      // Это обеспечит правильное отображение импортированного SVG
      if (typeof window.generateSvgForLayout === 'function') {
        printSvg = window.generateSvgForLayout(layoutForSvg, sheetWidth, sheetLength, pieceWidth, pieceLength, kerf, {
          mode: 'print',
          scaleMultiplier: 2,
          fontScale: 1.6
        });
      } else if (typeof window.generatePreviewSvgForPrint === 'function') {
        // Fallback на старую функцию
        printSvg = window.generatePreviewSvgForPrint(layoutForSvg, sheetWidth, sheetLength, pieceWidth, pieceLength, kerf);
      }
    }
    
    // Получаем дополнительные данные
    const thickness = op.thickness_mm || layoutData.thickness || 0;
    const wasteWidth = op.waste_width_mm || layoutData.wasteWidth || 0;
    const wasteLength = op.waste_length_mm || layoutData.wasteLength || 0;
    const wasteArea = op.waste_area_mm2 || layoutData.wasteArea || 0;
    const pieceWidthWithKerf = layoutData.pieceWidthWithKerf || (pieceWidth + (kerf * 2));
    const pieceLengthWithKerf = layoutData.pieceLengthWithKerf || (pieceLength + (kerf * 2));
    
    // Полный раскрой для печати (не миниатюра)
    cuttingLayoutHtml = `
      <div class="cutting-info">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:3mm;font-size:11px;line-height:1.5">
          <div>
            <div><b>Материал:</b> ${esc(op.material_name || layoutData.materialName || 'Неизвестно')}</div>
            <div><b>Лист:</b> ${sheetWidth}×${sheetLength}${thickness > 0 ? `×${thickness}` : ''} мм</div>
            <div><b>Заготовка:</b> ${pieceWidth}×${pieceLength}${thickness > 0 ? `×${thickness}` : ''} мм${layoutData.rotated ? ' (повернуто на 90°)' : ''}</div>
            ${kerf > 0 ? `<div><b>Размер реза:</b> ${pieceWidthWithKerf.toFixed(1)}×${pieceLengthWithKerf.toFixed(1)} мм</div>` : ''}
          </div>
          <div>
            <div><b>Заготовок:</b> ${op.pieces_count || 0} шт</div>
            <div><b>Отходы:</b> ${op.waste_percent || 0}%</div>
            ${wasteWidth > 0 ? `<div><b>Отходы справа:</b> ${wasteWidth.toFixed(1)}×${sheetLength} мм</div>` : ''}
            ${wasteLength > 0 ? `<div><b>Отходы снизу:</b> ${sheetWidth}×${wasteLength.toFixed(1)} мм</div>` : ''}
            ${wasteArea > 0 ? `<div><b>Площадь отходов:</b> ${(wasteArea / 1000000).toFixed(2)} м²</div>` : ''}
            ${kerf > 0 ? `<div><b>Отступ реза:</b> ${kerf} мм</div>` : ''}
          </div>
        </div>
      </div>
      <div class="cutting-svg-container">
        <div class="cutting-svg">
            ${printSvg || '<div style="padding:20px;color:#999">Нет данных для отображения</div>'}
        </div>
      </div>
    `;
  }

  // Функция форматирования направлений для печати
  const formatSourcesForPrint = (sources) => {
    if (!sources) return '—';
    let parsed = [];
    try {
      parsed = typeof sources === 'string' ? JSON.parse(sources) : sources;
    } catch(e) {
      parsed = [sources];
    }
    if (!Array.isArray(parsed)) parsed = [parsed];
    if (parsed.length === 0) return '—';
    
    const labels = {
      'warehouse': '🏭 Склад',
      'warehouse_rest': '💤 Отдых',
    };
    
    return parsed.map(s => {
      const label = labels[s] || `⚙️ ${String(s)}`;
      return `<div style="line-height:1.4">${label}</div>`;
    }).join('');
  };
  
  // Формируем информацию о направлениях текущей операции
  const inputSources = formatSourcesForPrint(op.input_sources);
  const outputTargets = formatSourcesForPrint(op.output_targets);
  const inputCritical = op.input_critical ? ' ⚠' : '';
  const outputCritical = op.output_critical ? ' ⚠' : '';
  
  const attachmentsHtml = attachments.map(f=>{
          const thumb = isImg(f.filename)
      ? `<img src="${esc(f.url)}" alt="${esc(f.filename)}" class="file-thumb">`
            : isPdf(f.filename)
        ? `<iframe src="${esc(f.url)}#view=FitH" class="file-thumb"></iframe>`
        : `<div class="file-thumb" style="display:flex;align-items:center;justify-content:center;font-size:11px;color:#777">Файл</div>`;
          return `
      <div class="file-item">
              <div>${thumb}</div>
        <div class="file-info">
          <div class="file-name">${esc(f.filename)}</div>
          <div class="file-size">${(Number(f.size||0)/1024).toFixed(1)} КБ${f.uploaded_at ? " · "+new Date(f.uploaded_at).toLocaleString('ru-RU') : ""}</div>
              </div>
            </div>
          `;
  }).join("");

  const w = window.open("", "_blank", "width=800,height=1100");
  if(!w){ alert("Разрешите всплывающее окно для печати QR."); return; }
  w.document.write(`
    <html>
    <head>
      <meta charset="utf-8">
      <title>Штрихкод ${esc(op.order_id||"")}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 12px;
          padding: 10mm;
          line-height: 1.4;
        }
        .container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: auto auto auto;
          gap: 6mm;
          height: calc(100vh - 20mm);
          max-height: calc(297mm - 20mm);
        }
        .block {
          border: 1px solid #000;
          border-radius: 4px;
          padding: 6mm;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .block-title {
          font-weight: 700;
          font-size: 12px;
          margin-bottom: 4mm;
          border-bottom: 1px solid #000;
          padding-bottom: 2mm;
        }
        .block-content {
          flex: 1;
          overflow: auto;
          font-size: 12px;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .block-0 {
          grid-column: 1 / -1;
          grid-row: 1;
        }
        .block-1 {
          grid-column: 1;
          grid-row: 2;
        }
        .block-2 {
          grid-column: 2;
          grid-row: 2;
        }
        .block-3 {
          grid-column: 1;
          grid-row: 3;
        }
        .block-4 {
          grid-column: 2;
          grid-row: 3;
        }
        .flow-block {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8mm;
          font-size: 12px;
        }
        .flow-item {
          flex: 1;
          text-align: center;
          padding: 3mm;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: #f8f9fa;
        }
        .flow-label {
          font-weight: 700;
          font-size: 12px;
          margin-bottom: 2mm;
          color: #333;
        }
        .flow-value {
          font-size: 12px;
          font-weight: 600;
          color: #000;
        }
        .barcode-container {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: flex-start;
        }
        .barcode-box {
          margin-bottom: 4mm;
        }
        .barcode-code {
          font-family: monospace;
          font-size: 12px;
          font-weight: 700;
          text-align: right;
          margin-top: 2mm;
        }
        .task-info {
          font-size: 12px;
          line-height: 1.6;
        }
        .task-info-row {
          margin-bottom: 2mm;
        }
        .task-info-label {
          font-weight: 700;
          display: inline-block;
          min-width: 80px;
        }
        .materials-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .materials-table th,
        .materials-table td {
          border: 1px solid #000;
          padding: 2mm;
          text-align: left;
        }
        .materials-table th {
          background: #f0f0f0;
          font-weight: 700;
        }
        .materials-table td {
          font-size: 12px;
        }
        .cutting-info {
          font-size: 11px;
          line-height: 1.5;
          margin-bottom: 3mm;
          flex-shrink: 0;
        }
        .cutting-svg-container {
          flex: 1;
          min-height: 0;
          overflow: visible;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cutting-svg {
          width: 100%;
          height: 100%;
          border: 1px solid #000;
          padding: 5px;
          background: #fff;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cutting-svg svg {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          display: block;
        }
        .files-list {
          display: flex;
          flex-direction: column;
          gap: 3mm;
        }
        .file-item {
          display: flex;
          gap: 3mm;
          align-items: flex-start;
          font-size: 12px;
          padding: 2mm;
          border: 1px solid #ddd;
          border-radius: 2px;
        }
        .file-thumb {
          width: 40mm;
          height: 30mm;
          object-fit: contain;
          border: 1px solid #ddd;
          background: #fff;
          flex-shrink: 0;
        }
        .file-info {
          flex: 1;
          min-width: 0;
        }
        .file-name {
          font-weight: 700;
          font-size: 12px;
          word-break: break-word;
        }
        .file-size {
          font-size: 11px;
          color: #666;
          margin-top: 1mm;
        }
        @media print {
          button { display: none; }
          body {
            padding: 0;
            margin: 0;
          }
          .container {
            height: 100vh;
            max-height: 297mm;
            gap: 4mm;
            padding: 0;
          }
          .block {
            border: 1px solid #000;
            padding: 4mm;
            page-break-inside: avoid;
          }
          @page {
            size: A4;
            margin: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Блок 0: Направления и машина (на всю ширину сверху) -->
        <div class="block block-0">
          <div class="block-title">📍 ПРОЦЕСС ОБРАБОТКИ</div>
          <div class="block-content">
            <div class="flow-block">
              <div class="flow-item">
                <div class="flow-label">⬅ ОТКУДА ПРИШЛО</div>
                <div class="flow-value">${inputSources}${inputCritical}</div>
        </div>
              <div class="flow-item" style="background: #e3f2fd; border-color: #2196f3;">
                <div class="flow-label">🛠️ МАШИНА</div>
                <div class="flow-value">${esc(op.machine||"—")}</div>
      </div>
              <div class="flow-item">
                <div class="flow-label">➡ КУДА ПОЙДЁТ</div>
                <div class="flow-value">${outputTargets}${outputCritical}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Блок 1: Информация о задаче (слева вверху) -->
        <div class="block block-1">
          <div class="block-title">📋 ЗАДАЧА</div>
          <div class="block-content task-info">
            <div class="task-info-row"><span class="task-info-label">Заказ:</span> ${esc(op.order_id||"—")} №${op.no||"—"}</div>
            <div class="task-info-row"><span class="task-info-label">Операция:</span> ${esc(op.name||"—")}</div>
            <div class="task-info-row"><span class="task-info-label">Машина:</span> ${esc(op.machine||"—")}</div>
            <div class="task-info-row"><span class="task-info-label">Оператор:</span> ${esc(op.operator||"—")}</div>
            <div class="task-info-row"><span class="task-info-label">План:</span> ${op.plan||0}</div>
            <div class="task-info-row"><span class="task-info-label">Факт:</span> ${op.fact||0}</div>
            <div class="task-info-row"><span class="task-info-label">Брак:</span> ${op.scrap||0}</div>
            <div class="task-info-row"><span class="task-info-label">Прилад.:</span> ${op.auxiliary_units||0}</div>
            <div class="task-info-row"><span class="task-info-label">Статус:</span> ${esc(op.status||"—")}</div>
            <div class="task-info-row"><span class="task-info-label">Дата:</span> ${op.date||"—"}</div>
            <div class="task-info-row"><span class="task-info-label">Время:</span> ${esc(op.time||"—")}</div>
            ${op.setup_started_at ? `<div class="task-info-row"><span class="task-info-label">Начало наладки:</span> ${formatDt(op.setup_started_at)}</div>` : ''}
            ${op.started_at ? `<div class="task-info-row"><span class="task-info-label">Начало работы:</span> ${formatDt(op.started_at)}</div>` : ''}
            ${op.operation_completed_at ? `<div class="task-info-row"><span class="task-info-label">Завершено:</span> ${formatDt(op.operation_completed_at)}</div>` : ''}
            ${op.setup_duration > 0 ? `<div class="task-info-row"><span class="task-info-label">Наладка факт:</span> ${formatDuration(op.setup_duration)}</div>` : ''}
            ${op.planned_setup_time > 0 ? `<div class="task-info-row"><span class="task-info-label">Наладка план:</span> ${formatDuration(op.planned_setup_time)}</div>` : ''}
            ${op.total_duration > 0 ? `<div class="task-info-row"><span class="task-info-label">Работа факт:</span> ${formatDuration(op.total_duration)}</div>` : ''}
            ${op.planned_duration > 0 ? `<div class="task-info-row"><span class="task-info-label">Работа план:</span> ${formatDuration(op.planned_duration)}</div>` : ''}
          </div>
        </div>

        <!-- Блок 2: Штрихкод и материалы (справа вверху) -->
        <div class="block block-2">
          <div class="block-title">📦 МАТЕРИАЛЫ</div>
          <div class="barcode-container">
            <div class="barcode-box" id="barcodeBox">
              <svg id="barcode"></svg>
            </div>
            <div class="barcode-code">${esc(codeStr)}</div>
          </div>
          <div class="block-content">
            ${bomHtml || '<div style="font-size:12px;color:#777">Материалы не указаны</div>'}
          </div>
        </div>

        <!-- Блок 3: Раскрой материала (слева внизу) -->
        <div class="block block-3">
          <div class="block-title">✂️ РАСКРОЙ МАТЕРИАЛА</div>
          <div class="block-content">
            ${cuttingLayoutHtml || '<div style="font-size:12px;color:#777">Раскрой не привязан</div>'}
          </div>
        </div>

        <!-- Блок 4: Файлы (справа внизу) -->
        <div class="block block-4">
          <div class="block-title">📎 ФАЙЛЫ</div>
          <div class="block-content">
            ${attachments.length > 0 ? `<div class="files-list">${attachmentsHtml}</div>` : '<div style="font-size:12px;color:#777">Файлы не прикреплены</div>'}
          </div>
        </div>
      </div>
      <button onclick="window.print()" style="position:fixed;top:10px;right:10px;padding:8px 12px;font-weight:700;font-size:12px;z-index:1000">Печать</button>
      <script>
        (function(){
          const codeStr = ${JSON.stringify(String(codeStr || ""))};
          const box = document.getElementById("barcodeBox");
          const svg = document.getElementById("barcode");
          const showErr = (msg)=>{ if(box) box.innerHTML = '<div style="color:red;font-weight:700;font-size:12px">Ошибка: '+msg+'</div>'; };
          const gen = ()=> {
            try{
              JsBarcode(svg, codeStr, {
                format: "CODE128",
                displayValue: false,
                fontSize: 12,
                lineColor: "#000",
                width: 1.5,
                height: 50,
                margin: 4
              });
            }catch(e){
              showErr(e.message);
            }
          };
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js";
          s.onload = gen;
          s.onerror = ()=> showErr("не удалось загрузить JsBarcode");
          document.head.appendChild(s);
        })();
      <\/script>
    </body>
    </html>
  `);
  w.document.close();
}
window.printOpQr = printOpQr;

async function loadJsQR(){
  if(window.jsQR) return;
  await new Promise((resolve, reject)=>{
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    s.onload = ()=> resolve();
    s.onerror = ()=> reject(new Error("Не удалось загрузить библиотеку jsQR"));
    document.head.appendChild(s);
  });
}

function ensureQrScannerModal(){
  if(qrScannerState.modal) return;
  const modal = document.createElement("div");
  modal.id = "qrScannerModal";
  modal.style.cssText = "position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45);z-index:9999;padding:12px;overflow:auto;";
  modal.innerHTML = `
    <style>
      @media(max-width:600px){
        .qr-modal-card{max-width:100vw;width:100%;padding:12px;border-radius:10px;max-height:90vh;}
        .qr-modal-table td{font-size:11px;padding:3px 4px;}
        .qr-modal-table{font-size:11px;}
        .qr-modal-hint{font-size:12px;}
        #qrScanVideo{max-height:220px;}
      }
    </style>
    <div class="qr-modal-card" style="background:#fff;max-width:520px;width:100%;max-height:90vh;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.25);padding:16px;display:flex;flex-direction:column;gap:12px;overflow:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <h3 style="margin:0">Сканер QR</h3>
        <div style="display:flex;gap:6px">
          <button class="btn ghost" data-a="restart" style="padding:6px 10px">🔄 Сканировать снова</button>
          <button class="btn ghost danger" data-a="close" style="padding:6px 10px">×</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="position:relative;background:rgba(0,0,0,.05);border:1px solid rgba(0,0,0,.08);border-radius:10px;padding:8px">
          <video id="qrScanVideo" autoplay playsinline muted style="width:100%;max-height:300px;border-radius:8px;background:#000"></video>
          <canvas id="qrScanCanvas" style="display:none"></canvas>
          <div id="qrScanHint" class="hint qr-modal-hint" style="margin-top:8px">Наведите камеру на QR-код</div>
        </div>
        <div id="qrScanResult" style="font-size:12px;line-height:1.4;background:rgba(0,207,181,.06);border:1px solid rgba(0,207,181,.25);padding:10px;border-radius:8px;white-space:pre-line">Сканируйте QR, чтобы увидеть данные операции</div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  qrScannerState.modal = modal;
  qrScannerState.video = modal.querySelector("#qrScanVideo");
  qrScannerState.canvas = modal.querySelector("#qrScanCanvas");
  qrScannerState.ctx = qrScannerState.canvas.getContext("2d");
  qrScannerState.result = modal.querySelector("#qrScanResult");
  qrScannerState.hint = modal.querySelector("#qrScanHint");
  modal.querySelector('[data-a="close"]').onclick = ()=> stopQrScanner(true);
  modal.querySelector('[data-a="restart"]').onclick = ()=> restartQrScanner();
}

async function startQrScanner(){
  try{
    await loadJsQR();
  }catch(e){
    alert(e.message);
    return;
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    alert("Камера недоступна: браузер не поддерживает getUserMedia. Откройте страницу в современном браузере или по HTTPS/localhost.");
    return;
  }
  // Останавливаем предыдущую сессию перед новой
  stopQrScanner(false);
  ensureQrScannerModal();
  qrScannerState.modal.style.display = "flex";
  qrScannerState.result.textContent = "Сканируйте QR, чтобы увидеть данные операции";
  qrScannerState.hint.textContent = "Запрашиваем доступ к камере…";
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    qrScannerState.stream = stream;
    qrScannerState.video.srcObject = stream;
    await qrScannerState.video.play();
    qrScannerState.hint.textContent = "Наведите камеру на QR-код";
    // Небольшая задержка для мобильных, чтобы успел прогреться поток
    setTimeout(()=> tickQrScanner(), 150);
  }catch(e){
    qrScannerState.hint.textContent = "Нет доступа к камере: " + e.message;
    alert("Нет доступа к камере. Проверьте, что браузеру выдано разрешение, и страница открыта по HTTPS или localhost.");
  }
}

function stopQrScanner(hide=true){
  if(qrScannerState.raf){
    cancelAnimationFrame(qrScannerState.raf);
    qrScannerState.raf = null;
  }
  if(qrScannerState.stream){
    qrScannerState.stream.getTracks().forEach(t=>t.stop());
    qrScannerState.stream = null;
  }
  if(hide && qrScannerState.modal){
    qrScannerState.modal.style.display = "none";
  }
}

function restartQrScanner(){
  stopQrScanner(false);
  qrScannerState.result.textContent = "Сканируйте QR, чтобы увидеть данные операции";
  qrScannerState.hint.textContent = "Наведите камеру на QR-код";
  startQrScanner();
}

function tickQrScanner(){
  const { video, canvas, ctx } = qrScannerState;
  if(!video || video.readyState !== video.HAVE_ENOUGH_DATA){
    qrScannerState.raf = requestAnimationFrame(tickQrScanner);
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  if(code && code.data){
    onQrDetected(code.data);
    return;
  }
  qrScannerState.raf = requestAnimationFrame(tickQrScanner);
}

async function renderQrResult(text){
  let html = "";
  let attachments = [];
  const tryLoadFiles = async (opId)=>{
    if(!opId) return [];
    try{
      return await fetchOpFiles(opId);
    }catch(e){
      console.error("Не удалось загрузить файлы для скана:", e);
      return [];
    }
  };
  try{
    const data = JSON.parse(text);
    const opId = data.i || data.id;
    if(opId){
      attachments = await tryLoadFiles(opId);
    }
    html = renderOpTableFromData(data) + renderAttachmentsList(attachments);
  }catch(e){
    // Пробуем как короткий код
    const code = (text||"").trim();
    let op = state.ops?.find(o => opShortCode(o) === code);
    if(!op){
      op = await findOpByShortCode(code);
    }
    if(op){
      attachments = await tryLoadFiles(op.id);
      html = renderOpTableFromOp(op) + renderAttachmentsList(attachments);
    } else {
      html = `<div style="color:var(--bad);font-weight:700">Не удалось разобрать код</div><pre style="white-space:pre-wrap">${text.replace(/</g,"&lt;")}</pre>`;
    }
  }
  qrScannerState.result.innerHTML = html;
}

function renderOpTableFromData(data){
  const rows = [
    ["Заказ", data.order || "—"],
    ["Операция №", data.op_no || "—"],
    ["Наименование", data.operation || "—"],
    ["Машина", data.machine || "—"],
    ["Оператор", data.operator || "—"],
    ["План, шт", data.plan_qty ?? "—"],
    ["Факт, шт", data.fact_qty ?? "—"],
    ["Брак", data.scrap_qty ?? "—"],
    ["Приладочные", data.auxiliary_units ?? "—"],
    ["Статус", data.status || "—"],
    ["Начало наладки", formatDateTime(data.setup_started_at)],
    ["Начало работы", formatDateTime(data.started_at)],
    ["Завершено", formatDateTime(data.operation_completed_at)],
    ["Наладка факт", formatDuration(data.setup_duration||0)],
    ["Наладка план", formatDuration(data.planned_setup_time||0)],
    ["Работа факт", formatDuration(data.work_duration||0)],
    ["Работа план", formatDuration(data.planned_work_time||0)]
  ];
  return `<div style="font-weight:700;margin-bottom:6px">Данные операции</div><table class="qr-modal-table" style="width:100%;border-collapse:collapse;font-size:12px;">${rows.map(([k,v])=>`<tr><td style="padding:4px 6px;border:1px solid #eee;width:40%;font-weight:600">${esc(String(k))}</td><td style="padding:4px 6px;border:1px solid #eee">${esc(String(v))}</td></tr>`).join("")}</table>`;
}

function renderOpTableFromOp(op){
  const data = {
    order: op.order_id,
    op_no: op.no,
    operation: op.name,
    machine: op.machine,
    operator: op.operator,
    plan_qty: op.plan,
    fact_qty: op.fact,
    scrap_qty: op.scrap,
    auxiliary_units: op.auxiliary_units,
    status: op.status,
    setup_started_at: op.setup_started_at,
    started_at: op.started_at,
    operation_completed_at: op.operation_completed_at,
    setup_duration: op.setup_duration,
    planned_setup_time: op.planned_setup_time,
    work_duration: op.total_duration,
    planned_work_time: op.planned_duration
  };
  return renderOpTableFromData(data);
}

function onQrDetected(text){
  stopQrScanner(false);
  qrScannerState.hint.textContent = "QR найден";
  renderQrResult(text);
}

function showQrFromCode(text){
  ensureQrScannerModal();
  stopQrScanner(false);
  qrScannerState.modal.style.display = "flex";
  qrScannerState.hint.textContent = "Ручной ввод";
  renderQrResult(text);
}

// Форматирование длительности
function formatDuration(seconds){
  if(!seconds || seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if(hours > 0){
    return `${hours}ч ${mins}м`;
  } else if(mins > 0){
    return `${mins}м ${secs}с`;
  } else {
    return `${secs}с`;
  }
}

function formatDateTime(isoDateTime){
  if(!isoDateTime) return "—";
  try{
    const d = new Date(isoDateTime);
    const date = d.toLocaleDateString('ru-RU');
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  }catch(e){
    return isoDateTime;
  }
}

function renderAttachmentsList(attachments){
  const isImg = (name)=>/\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(name||"");
  const isPdf = (name)=>/\.pdf$/i.test(name||"");
  if(!attachments || attachments.length===0){
    return `<div style="margin-top:10px;font-size:12px;color:#777">Файлы не прикреплены</div>`;
  }
  return `
    <div style="margin-top:10px">
      <div style="font-weight:700;margin-bottom:4px">Файлы/чертежи:</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${attachments.map(f=>{
          const thumb = isImg(f.filename)
            ? `<img src="${esc(f.url)}" alt="${esc(f.filename)}" style="max-width:140px;max-height:120px;border:1px solid #ddd;border-radius:6px;object-fit:contain;background:#fff">`
            : isPdf(f.filename)
              ? `<iframe src="${esc(f.url)}#view=FitH" style="width:140px;height:120px;border:1px solid #ddd;border-radius:6px;background:#fff"></iframe>`
              : `<div style="width:140px;height:120px;display:flex;align-items:center;justify-content:center;border:1px dashed #ccc;border-radius:6px;font-size:11px;color:#777">Файл</div>`;
          return `
            <div style="display:flex;gap:10px;align-items:center;font-size:12px;line-height:1.4;border-bottom:1px solid #eee;padding-bottom:6px">
              <div>${thumb}</div>
              <div style="flex:1;min-width:0">
                <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700">
                  <a href="${esc(f.url)}" target="_blank" rel="noopener" style="color:#0070c9;">${esc(f.filename)}</a>
                </div>
                <div style="color:#666;font-size:11px">${(Number(f.size||0)/1024).toFixed(1)} КБ${f.uploaded_at ? " · "+new Date(f.uploaded_at).toLocaleString() : ""}</div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

// Экспорт статистики в CSV
function exportStatsToCSV(){
  if(!lastStatsData){
    alert("Сначала загрузите статистику");
    return;
  }
  
  const { operations } = lastStatsData;
  if(operations.length === 0){
    alert("Нет данных для экспорта");
    return;
  }
  
  // Создаём CSV с BOM для корректного отображения кириллицы в Excel
  let csv = '\uFEFF'; // BOM для UTF-8
  
  // Заголовки
  csv += 'Заказ;№;Операция;Оператор;Машина;Начало;Завершено;Длительность (сек);Длительность;План;Факт;Брак;Статус\n';
  
  // Данные
  for(const op of operations){
    const duration = op.total_duration || 0;
    const durationFormatted = formatDuration(duration);
    csv += `${op.order_id};${op.no||''};${op.name||''};${op.operator||''};${op.machine||''};`;
    csv += `${op.started_at||''};${op.completed_at||''};${duration};${durationFormatted};`;
    csv += `${op.plan||0};${op.fact||0};${op.scrap||0};${op.status||''}\n`;
  }
  
  // Скачивание файла
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `статистика_${todayISO()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  toast("CSV файл загружен");
}

// Экспорт статистики в Excel (HTML формат)
function exportStatsToExcel(){
  if(!lastStatsData){
    alert("Сначала загрузите статистику");
    return;
  }
  
  const { operations, summary } = lastStatsData;
  if(operations.length === 0){
    alert("Нет данных для экспорта");
    return;
  }
  
  // Создаём HTML таблицу, которую Excel может открыть
  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <style>
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; font-weight: bold; }
        .summary { background-color: #e3f2fd; font-weight: bold; }
        .header { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <div class="header">📊 Статистика выполненных работ - ${todayISO()}</div>
      
      <h3>📈 Сводка</h3>
      <table>
        <tr class="summary">
          <td>Всего операций:</td>
          <td>${summary.totalOps}</td>
        </tr>
        <tr class="summary">
          <td>Общее время:</td>
          <td>${formatDuration(summary.totalDuration)}</td>
        </tr>
        <tr class="summary">
          <td>Среднее время:</td>
          <td>${formatDuration(summary.avgDuration)}</td>
        </tr>
        <tr class="summary">
          <td>Минимальное время:</td>
          <td>${formatDuration(summary.minDuration)}</td>
        </tr>
        <tr class="summary">
          <td>Максимальное время:</td>
          <td>${formatDuration(summary.maxDuration)}</td>
        </tr>
      </table>
      
      <h3>👥 По операторам</h3>
      <table>
        <thead>
          <tr>
            <th>Оператор</th>
            <th>Операций</th>
            <th>Общее время</th>
            <th>Среднее время</th>
          </tr>
        </thead>
        <tbody>`;
  
  const operators = Object.entries(summary.byOperator).sort((a,b) => b[1].totalDuration - a[1].totalDuration);
  for(const [operator, data] of operators){
    html += `
          <tr>
            <td>${esc(operator)}</td>
            <td>${data.count}</td>
            <td>${formatDuration(data.totalDuration)}</td>
            <td>${formatDuration(data.avgDuration)}</td>
          </tr>`;
  }
  
  html += `
        </tbody>
      </table>
      
      <h3>🛠️ По машинам</h3>
      <table>
        <thead>
          <tr>
            <th>Машина</th>
            <th>Операций</th>
            <th>Общее время</th>
            <th>Среднее время</th>
          </tr>
        </thead>
        <tbody>`;
  
  const machines = Object.entries(summary.byMachine).sort((a,b) => b[1].totalDuration - a[1].totalDuration);
  for(const [machine, data] of machines){
    html += `
          <tr>
            <td>${esc(machine)}</td>
            <td>${data.count}</td>
            <td>${formatDuration(data.totalDuration)}</td>
            <td>${formatDuration(data.avgDuration)}</td>
          </tr>`;
  }
  
  html += `
        </tbody>
      </table>
      
      <h3>📦 Детальная информация</h3>
      <table>
        <thead>
          <tr>
            <th>Заказ</th>
            <th>№</th>
            <th>Операция</th>
            <th>Оператор</th>
            <th>Машина</th>
            <th>Начало</th>
            <th>Завершено</th>
            <th>Длительность</th>
            <th>План</th>
            <th>Факт</th>
            <th>Брак</th>
          </tr>
        </thead>
        <tbody>`;
  
  for(const op of operations){
    html += `
          <tr>
            <td>${esc(op.order_id)}</td>
            <td>${op.no||''}</td>
            <td>${esc(op.name||'')}</td>
            <td>${esc(op.operator||'')}</td>
            <td>${esc(op.machine||'')}</td>
            <td>${formatDateTime(op.started_at)}</td>
            <td>${formatDateTime(op.completed_at)}</td>
            <td>${formatDuration(op.total_duration)}</td>
            <td>${op.plan||0}</td>
            <td>${op.fact||0}</td>
            <td>${op.scrap||0}</td>
          </tr>`;
  }
  
  html += `
        </tbody>
      </table>
    </body>
    </html>`;
  
  // Скачивание файла
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `статистика_${todayISO()}.xls`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  toast("Excel файл загружен");
}

// Загрузка детальной аналитики
async function loadAnalytics(){
  try{
    const operator = $("analytics_operator").value;
    const orderId = $("analytics_order").value;
    
    if(!operator && !orderId){
      alert("Выберите оператора или заказ для анализа");
      return;
    }
    
    const params = new URLSearchParams();
    if(operator) params.append("operator", operator);
    if(orderId) params.append("orderId", orderId);
    
    const result = await api("/api/analytics?" + params.toString());
    
    if(!result.hasData){
      alert(result.message || "Нет данных для анализа");
      return;
    }
    
    renderAnalytics(result);
    toast("Аналитика загружена");
  }catch(e){
    console.error("Ошибка загрузки аналитики:", e);
    alert("Ошибка загрузки аналитики: " + e.message);
  }
}

// Отображение результатов аналитики

// ========================================
// Stats functions (renderAnalytics, loadStats, renderStats, renderCharts)
// MOVED TO: js/modules/stats.js
// ========================================

let applicationControlsReady = false;
async function init(){
  // Bind navigation before the login screen can return from initialization.
  document.querySelectorAll(".navbtn").forEach(b => b.onclick = () => switchPane(b.dataset.go));
  $("logoutBtn").onclick = doLogout;

  bindAuthControls();

  // Проверяем авторизацию
  currentUser = await checkAuth();
  // Убеждаемся, что currentUser установлен в глобальной области видимости
  if (currentUser) {
    window.currentUser = currentUser;
    if (typeof setCurrentUser === 'function') {
      setCurrentUser(currentUser);
    }
    console.log("🔐 Пользователь авторизован при инициализации:", {
      role: currentUser.role,
      userId: currentUser.userId,
      username: currentUser.username
    });
    
    // ВАЖНО: Загружаем ширины колонок ОДИН РАЗ при инициализации
    if (currentUser.userId && typeof loadColumnWidthsFromServer === 'function') {
      console.log("📥 Загрузка ширин колонок при инициализации приложения...");
      await loadColumnWidthsFromServer();
      console.log("📥 Ширины колонок загружены, кэш:", serverColumnWidths);
    } else if (currentUser && typeof loadColumnWidthsFromServer === 'function') {
      // Для операторов загружаем из localStorage
      console.log("📥 Загрузка ширин колонок из localStorage для оператора...");
      try {
        const localData = JSON.parse(localStorage.getItem('bbox_column_widths') || "{}");
        if (Object.keys(localData).length > 0) {
          console.log("📥 Загружены ширины из localStorage:", localData);
        }
      } catch (e) {
        console.error("Ошибка чтения из localStorage:", e);
      }
    }
  }
  
  // Проверяем, был ли вход с мобильного устройства
  const deviceType = getDeviceType();
  const mobileLogin = localStorage.getItem('mobileLogin') === 'true';
  const savedOperatorName = localStorage.getItem('operatorName');
  
  if(!currentUser){
    // Не авторизован - показываем страницу входа
    showLoginPage();
    
    return; // Не продолжаем инициализацию, пока не войдут
  }
  
  // Авторизован - показываем основной интерфейс
  showMainApp();
  updateUserDisplay();
  
  // Для операторов всегда переключаемся на раздел "Мои задачи"
  if(currentUser.role === 'operator'){
    // Сначала обновляем селекторы, чтобы список операторов был заполнен
    renderSelectors();
    
    // Убеждаемся, что оператор выбран в фильтре (с несколькими попытками)
    let attempts = 0;
    const setOperator = () => {
      if($("my_op") && currentUser.operatorName){
        const operatorExists = Array.from($("my_op").options).some(opt => opt.value === currentUser.operatorName);
        if(operatorExists){
          if($("my_op").value !== currentUser.operatorName){
            $("my_op").value = currentUser.operatorName;
            // Триггерим событие change для применения фильтра
            $("my_op").dispatchEvent(new Event('change', { bubbles: true }));
          }
          return true;
        } else if(attempts < 5 && state.operators.length === 0){
          // Если список операторов еще не загружен, повторяем попытку
          attempts++;
          setTimeout(setOperator, 100);
          return false;
        }
      }
      return true;
    };
    
    setTimeout(() => {
      setOperator();
      // Переключаемся на раздел "Мои задачи"
    switchPane('my');
      // Вызываем renderMy с задержкой, чтобы убедиться что данные загружены
      setTimeout(() => {
        if(typeof renderMy === 'function'){
          renderMy();
        }
      }, 150);
    }, 100);
  } else {
    // Восстанавливаем последнюю страницу после refresh
    const savedActivePane = sessionStorage.getItem('activePane');
    const savedDesignerLayoutId = sessionStorage.getItem('designerLayoutId');
    sessionStorage.removeItem('activePane'); // Очищаем после использования
    sessionStorage.removeItem('designerLayoutId');
    
    if(savedActivePane && $(savedActivePane)){
      const opened = await switchPane(savedActivePane);
      if(opened && savedActivePane === 'designer' && savedDesignerLayoutId) {
        await window.DesignerModule?.loadFloorLayoutFull(savedDesignerLayoutId);
      }
    }
  }
  
  // Запускаем таймер бездействия
  setupIdleTimer();
  
  // Мобильная оптимизация - оборачиваем таблицы для горизонтальной прокрутки
  document.querySelectorAll('table').forEach(table => {
    if(!table.parentElement.classList.contains('table-wrapper')){
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
  
  // Обработка touch events для улучшенного взаимодействия на мобильных
  if('ontouchstart' in window){
    document.body.classList.add('touch-device');
  }
  
  // Автоматическое скрытие клавиатуры при скролле на мобильных
  let scrollTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if(document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA'){
        // Оставляем фокус, но на некоторых устройствах это может скрыть клавиатуру
      }
    }, 150);
  }, { passive: true });
  
  // Dates
  ["r_date","my_date","m_date","f_date","tpl_start_date"].forEach(id=>$(id) && ($(id).value = todayISO()));
  
  // Set default filter mode to "all"
  $("f_date_mode").value = "all";

  // Cutting Master event handlers
  if($("cuttingCalculate")) {
    $("cuttingCalculate").onclick = async () => {
      if(window.CuttingModule?.calculateLayout) {
        await window.CuttingModule.calculateLayout();
      } else {
        toast("Модуль Мастера кроя загружается...");
      }
    };
  }
  
  if($("cuttingEditTemplate")) {
    $("cuttingEditTemplate").onclick = () => {
      if(window.CuttingModule?.openTemplateEditor) {
        window.CuttingModule.openTemplateEditor();
      } else if(window.openCuttingTemplateEditor) {
        window.openCuttingTemplateEditor();
      } else {
        toast("Модуль Мастера кроя загружается...");
      }
    };
  }

  // Сворачивание/разворачивание карточки "Операция (общая база)"
  const operationCardToggle = $("operationCardToggle");
  const operationCardContent = $("operationCardContent");
  const operationCardIcon = $("operationCardIcon");
  
  if(operationCardToggle && operationCardContent && operationCardIcon){
    // По умолчанию карточка свернута
    operationCardContent.style.display = "none";
    operationCardIcon.textContent = "▶";
    operationCardIcon.style.transform = "rotate(-90deg)";
    
    operationCardToggle.onclick = () => {
      const isCollapsed = operationCardContent.style.display === "none";
      operationCardContent.style.display = isCollapsed ? "block" : "none";
      operationCardIcon.textContent = isCollapsed ? "▼" : "▶";
      operationCardIcon.style.transform = isCollapsed ? "rotate(0deg)" : "rotate(-90deg)";
    };
  }

  // Универсальная функция для сворачивания карточек в настройках
  function initCollapsibleCard(toggleId, contentId, iconId, storageKey){
    const toggle = $(toggleId);
    const content = $(contentId);
    const icon = $(iconId);
    if(!toggle || !content || !icon) return;
    
    const savedState = localStorage.getItem(storageKey);
    const isCollapsed = savedState === "true" || (savedState === null && currentUser?.role === "admin" && window.matchMedia("(max-width: 768px)").matches);
    
    content.style.display = isCollapsed ? "none" : "block";
    icon.textContent = isCollapsed ? "▶" : "▼";
    icon.style.transform = isCollapsed ? "rotate(-90deg)" : "rotate(0deg)";
    
    toggle.onclick = () => {
      const newCollapsed = content.style.display !== "none";
      content.style.display = newCollapsed ? "none" : "block";
      icon.textContent = newCollapsed ? "▶" : "▼";
      icon.style.transform = newCollapsed ? "rotate(-90deg)" : "rotate(0deg)";
      localStorage.setItem(storageKey, String(newCollapsed));
    };
  }
  
  // Инициализируем все сворачиваемые карточки в настройках
  initCollapsibleCard("operatorsMachinesCardToggle", "operatorsMachinesCardContent", "operatorsMachinesCardIcon", "operatorsMachinesCardCollapsed");
  initCollapsibleCard("materialsCardToggle", "materialsCardContent", "materialsCardIcon", "materialsCardCollapsed");
  initCollapsibleCard("materialTypesCardToggle", "materialTypesCardContent", "materialTypesCardIcon", "materialTypesCardCollapsed");
  initCollapsibleCard("unitsCardToggle", "unitsCardContent", "unitsCardIcon", "unitsCardCollapsed");
  initCollapsibleCard("productTypesCardToggle", "productTypesCardContent", "productTypesCardIcon", "productTypesCardCollapsed");
  initCollapsibleCard("productTemplatesCardToggle", "productTemplatesCardContent", "productTemplatesCardIcon", "productTemplatesCardCollapsed");
  initCollapsibleCard("clientProfilesCardToggle", "clientProfilesCardContent", "clientProfilesCardIcon", "clientProfilesCardCollapsed");
  initCollapsibleCard("templatesCardToggle", "templatesCardContent", "templatesCardIcon", "templatesCardCollapsed");
  initCollapsibleCard("systemSettingsCardToggle", "systemSettingsCardContent", "systemSettingsCardIcon", "systemSettingsCardCollapsed");

  $("q").oninput = renderOrders;
  $("f_order").onchange = ()=>{
    localStorage.setItem("filterOrder", $("f_order").value);
    // пересобираем список изделий в фильтре
    renderSelectors();
    renderOps();
  };
  if($("f_item")){
    $("f_item").onchange = ()=>{
      localStorage.setItem("filterItem", $("f_item").value || "");
      renderOps();
    };
  }
  $("f_date").onchange = ()=> {
    // Auto-switch to selected mode when date is chosen
    if($("f_date").value && $("f_date_mode").value === "all"){
      $("f_date_mode").value = "selected";
    }
    localStorage.setItem("filterDate", $("f_date").value);
    renderOps();
  };
  $("f_date_mode").onchange = ()=>{
    localStorage.setItem("filterDateMode", $("f_date_mode").value);
    renderOps();
  };
  
  // Сортировка по колонкам маршрута
  const opsHeader = $("opsHeader");
  if(opsHeader){
    opsHeader.onclick = (e)=>{
      const th = e.target.closest("th[data-sort]");
      if(!th) return;
      const col = th.dataset.sort;
      if(state.opsColumnSort === col){
        state.opsSortDir = state.opsSortDir === "asc" ? "desc" : "asc";
      } else {
        state.opsColumnSort = col;
        state.opsSortDir = "asc";
      }
      localStorage.setItem("opsColumnSort", state.opsColumnSort);
      localStorage.setItem("opsSortDir", state.opsSortDir);
      renderOps();
    };
  }
  
  // Сброс сортировки по колонкам
  const resetBtn = $("resetColumnSort");
  if(resetBtn){
    resetBtn.onclick = (e)=>{
      e.stopPropagation();
      state.opsColumnSort = "";
      state.opsSortDir = "asc";
      localStorage.removeItem("opsColumnSort");
      localStorage.removeItem("opsSortDir");
      renderOps();
      toast("Сортировка сброшена");
    };
  }
  // Функция обновления визуального индикатора сортировки
  function updateSortVisualIndicator(){
    const sortBy = $("sort_by") ? $("sort_by").value : "order";
    const sortByStatus = $("sort_by_status") ? $("sort_by_status").value : "";
    const sortIcon = $("sortIcon");
    const sortText = $("sortText");
    const sortDescription = $("sortDescription");
    
    if(!sortIcon || !sortText || !sortDescription) return;
    
    const sortConfig = {
      "order": {
        icon: "📋",
        text: "По заказу и №",
        description: "Операции отсортированы по номеру заказа и номеру операции внутри заказа",
        color: "rgba(149,165,166,.15)",
        borderColor: "rgba(149,165,166,.3)"
      },
      "client": {
        icon: "👥",
        text: "По клиенту",
        description: "Операции сгруппированы по клиентам заказов, внутри группы — по заказу и номеру",
        color: "rgba(52,152,219,.15)",
        borderColor: "rgba(52,152,219,.3)"
      },
      "date": {
        icon: "📅",
        text: "По дате",
        description: "Операции сгруппированы по датам, внутри группы — по времени и заказу",
        color: "rgba(46,204,113,.15)",
        borderColor: "rgba(46,204,113,.3)"
      },
      "overdue": {
        icon: "🔴",
        text: "По просроченным",
        description: "Просроченные операции отображаются первыми (красная подсветка), затем непросроченные",
        color: "rgba(255,77,77,.15)",
        borderColor: "rgba(255,77,77,.3)"
      },
      "operator": {
        icon: "👤",
        text: "По оператору",
        description: "Операции сгруппированы по операторам, внутри группы — по дате и заказу",
        color: "rgba(155,89,182,.15)",
        borderColor: "rgba(155,89,182,.3)"
      },
      "machine": {
        icon: "🛠️",
        text: "По машине",
        description: "Операции сгруппированы по машинам, внутри группы — по дате и заказу",
        color: "rgba(255,176,32,.15)",
        borderColor: "rgba(255,176,32,.3)"
      },
      "status": {
        icon: "✅",
        text: "По статусу",
        description: "Операции сгруппированы по статусам (Запланировано → Наладка → В работе → Выполнено → Стоп), внутри группы — по заказу и номеру",
        color: "rgba(0,207,181,.15)",
        borderColor: "rgba(0,207,181,.3)"
      }
    };
    
    const config = sortConfig[sortBy] || sortConfig["order"];
    
    // Формируем текст с учетом вторичной сортировки
    let displayText = config.text;
    let displayDescription = config.description;
    
    if(sortByStatus === "status"){
      displayText += " + ✅ По статусу";
      displayDescription += ", дополнительно отсортировано по статусу";
    }
    
    sortIcon.textContent = config.icon;
    sortText.textContent = displayText;
    sortDescription.textContent = displayDescription;
    
    const indicator = $("sortVisualIndicator");
    if(indicator){
      // Добавляем анимацию при изменении
      indicator.style.animation = 'none';
      setTimeout(() => {
        indicator.style.animation = 'fadeIn 0.3s ease';
      }, 10);
      
      indicator.style.background = config.color;
      indicator.style.borderColor = config.borderColor;
      indicator.style.color = sortBy === "order" ? "var(--muted)" : "var(--accent)";
    }
  }
  
  $("sort_by").onchange = ()=>{ 
    state.sortBy = $("sort_by").value; 
    localStorage.setItem("sortBy", state.sortBy); // Сохраняем выбранную сортировку
    updateSortVisualIndicator(); // Обновляем визуальный индикатор
    renderOps(); 
  };
  
  $("sort_by_status").onchange = ()=>{
    localStorage.setItem("sortByStatus", $("sort_by_status").value);
    updateSortVisualIndicator();
    renderOps();
  };
  // Обработчики для фильтров "Мои задачи" (единые для мобильной и десктоп версии)
  function setupMyFilterHandler(id, needsStorage = false, storageKey = null) {
    const el = $(id);
    if (el) {
      el.onchange = () => {
        if (needsStorage && storageKey) {
          localStorage.setItem(storageKey, el.value);
        }
        renderMy();
      };
    }
  }
  
  setupMyFilterHandler("my_op");
  setupMyFilterHandler("my_date");
  setupMyFilterHandler("my_date_mode");
  setupMyFilterHandler("my_status");
  setupMyFilterHandler("my_sort", true, "mySortBy");
  setupMyFilterHandler("my_order", true, "myOrderFilter");
  $("m_m").onchange = renderMachine;
  $("m_date").onchange = renderMachine;
  $("m_only").onchange = renderMachine;
  $("m_sort").onchange = ()=>{
    localStorage.setItem("machineSortBy", $("m_sort").value);
    renderMachine();
  };

  $("f_today").onclick = ()=>{ $("f_date").value=todayISO(); $("f_date_mode").value="selected"; renderOps(); };
  $("f_clear_date").onclick = ()=>{ $("f_date").value=""; $("f_date_mode").value="all"; renderOps(); };
  
  // Обработчики для фильтров "Мои задачи" (единые для мобильной и десктоп версии)
  if($("myToday")){
    $("myToday").onclick = ()=>{ 
      $("my_date").value = todayISO(); 
      $("my_date_mode").value = "selected"; 
      renderMy(); 
    };
  }
  if($("myAll")){
    $("myAll").onclick = ()=>{ 
      $("my_date_mode").value = "all"; 
      renderMy(); 
    };
  }
  if($("myPrintAll")){
    $("myPrintAll").onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if(typeof printMyTasksWithMaterials === 'function'){
          await printMyTasksWithMaterials();
        } else {
          toast("Функция печати задач недоступна");
        }
      } catch(err) {
        console.error("Ошибка печати задач:", err);
        toast("Ошибка печати: " + (err.message || err));
      }
    };
  }
  
  // Дополнительная синхронизация фильтров при изменении
  // Обработчики onchange уже установлены выше с синхронизацией
  $("mToday").onclick = ()=>{ $("m_date").value=todayISO(); $("m_only").value="yes"; renderMachine(); };

  if($("printMy")){
  $("printMy").onclick = ()=> printOperator($("my_op").value, $("my_date").value||todayISO());
  }
  if($("printM")){
  $("printM").onclick = ()=> printMachine($("m_m").value, $("m_date").value||todayISO());
  }
  if($("printRouteSection")){
    $("printRouteSection").onclick = ()=> printRouteSection();
  }
  if($("openQrScanner")){
    $("openQrScanner").onclick = ()=> startQrScanner();
  }
  if($("exportRouteExcel")){
    $("exportRouteExcel").onclick = ()=> exportRouteExcel();
  }
  if($("barcode_scan")){
    $("barcode_scan").onclick = ()=> startQrScanner();
  }
  if($("barcode_show")){
    $("barcode_show").onclick = ()=>{
      const v = ($("barcode_input")?.value || "").trim();
      if(!v){ toast("Введите код"); return; }
      showQrFromCode(v);
    };
  }

  $("refresh").onclick = () => {
    // Hard refresh - полная перезагрузка системы, но остаёмся на текущей вкладке
    try {
      // Определяем текущую активную вкладку
    const activePane = document.querySelector('.pane[style*="display: block"], .pane:not([style*="display: none"]):not([style*="display:none"])');
    const activeBtn = document.querySelector('.navbtn.active');
    const currentPaneId = activeBtn?.dataset?.go || activePane?.id || 'orders';
      
      // Сохраняем текущую вкладку в sessionStorage (используем sessionStorage вместо localStorage для более надёжной работы)
      sessionStorage.setItem('activePane', currentPaneId);
      
      // Если это конструктор, сохраняем также ID цеха
      if(currentPaneId === 'designer' && window.designer?.currentLayoutId) {
        sessionStorage.setItem('designerLayoutId', window.designer.currentLayoutId);
      }
      
      // Полная перезагрузка страницы (как Cmd+Shift+R)
      location.reload();
    } catch(e) {
      console.error("Ошибка обновления:", e);
      toast("Ошибка обновления");
    }
  };

  // Add order
  if($("addOrder")){
    $("addOrder").onclick = async ()=>{
    const id=$("o_id").value.trim(); if(!id){alert("Укажи ID заказа"); return;}
    const mode = document.querySelector('input[name="o_mode"]:checked')?.value || "simple";
    const client = $("o_client").value.trim();
    const qty = +$("o_qty").value||0;
    const status = $("o_status").value;
    
    // Режим "По профилю клиента"
    if(mode === "profile" && orderSelectedProfile){
      if(!client){ alert("Укажите клиента"); return; }
      if(qty <= 0){ alert("Укажите тираж > 0"); return; }
      
      const { profile, items } = orderSelectedProfile;
      const orderItems = items.map(it=>{
        const multiplier = parseInt(it.multiplier||1,10) || 1;
        return {
          type: it.product_type,
          template_id: it.template_id,
          qty_plan: qty * multiplier,
          len_mm: 0, wid_mm: 0, hei_mm: 0, material: ""
        };
      });
      
      try{
        await api("/api/orders/from-wizard", {
          method:"POST",
          body: JSON.stringify({
            order: { id, client, qty, status },
            items: orderItems
          })
        });
        state.activeOrderId = id;
        $("o_id").value="";
        clearOrderSelectedInfo();
        await refreshAll(false);
        toast("Заказ создан по профилю");
      }catch(e){ alert("Ошибка: "+e.message); }
      return;
    }
    
    // Режим "По шаблону изделия"
    if(mode === "template" && orderSelectedTemplate){
      if(!client){ alert("Укажите клиента"); return; }
      if(qty <= 0){ alert("Укажите тираж > 0"); return; }
      
      const { template, ops } = orderSelectedTemplate;
      const orderItems = [{
        type: template.type,
        template_id: template.id,
        qty_plan: qty,
        len_mm: 0, wid_mm: 0, hei_mm: 0,
        material: $("o_material").value.trim()
      }];
      
      try{
        await api("/api/orders/from-wizard", {
          method:"POST",
          body: JSON.stringify({
            order: { id, client, qty, status },
            items: orderItems
          })
        });
        state.activeOrderId = id;
        $("o_id").value="";
        clearOrderSelectedInfo();
        await refreshAll(false);
        toast("Заказ создан по шаблону");
      }catch(e){ alert("Ошибка: "+e.message); }
      return;
    }
    
    // Простой режим (оригинальное поведение)
    const payload = {
      id,
      client,
      product:$("o_product").value.trim(),
      size:$("o_size").value.trim(),
      material:$("o_material").value.trim(),
      qty,
      notes:$("o_notes").value.trim(),
      status
    };
    try{
      await api("/api/orders", { method:"POST", body: JSON.stringify(payload) });
      state.activeOrderId = id;
      $("o_id").value="";
      await refreshAll(false);
      // Обновляем отображение
      await renderAll();
      toast("Заказ добавлен");
    }catch(e){ alert("Ошибка: "+e.message); }
    };
  }
  if($("openOrderWizard")){
    $("openOrderWizard").onclick = ()=> openOrderWizard();
  }
  if($("clearOrder")){
    $("clearOrder").onclick = ()=>{
    ["o_id","o_client","o_product","o_size","o_material","o_qty","o_notes"].forEach(id=>$(id).value="");
    $("o_status").value="Запланировано";
    // Сбрасываем режим на простой
    const simpleRadio = document.querySelector('input[name="o_mode"][value="simple"]');
    if(simpleRadio) simpleRadio.checked = true;
    updateOrderModeUI();
    clearOrderSelectedInfo();
    };
  }

  // === Логика режимов создания заказа ===
  let orderSelectedTemplate = null;
  let orderSelectedProfile = null;
  
  function clearOrderSelectedInfo(){
    orderSelectedTemplate = null;
    orderSelectedProfile = null;
    const info = $("o_selected_info");
    if(info) info.style.display = "none";
  }
  
  function updateOrderModeUI(){
    const mode = document.querySelector('input[name="o_mode"]:checked')?.value || "simple";
    const profileRow = $("o_profile_row");
    const templateRow = $("o_template_row");
    
    if(profileRow) profileRow.style.display = mode === "profile" ? "flex" : "none";
    if(templateRow) templateRow.style.display = mode === "template" ? "flex" : "none";
    
    // Сбрасываем выбор при смене режима
    clearOrderSelectedInfo();
  }
  
  // Переключение режимов
  const modeRadios = document.querySelectorAll('input[name="o_mode"]');
  if(modeRadios.length > 0){
    modeRadios.forEach(radio=>{
      radio.onchange = updateOrderModeUI;
    });
  }
  
  // Заполнение селектора профилей
  function fillOrderProfileSelector(){
    const sel = $("o_profile");
    if(!sel) return;
    const profiles = state.clientProfiles || [];
    sel.innerHTML = '<option value="">— выберите профиль —</option>';
    for(const p of profiles){
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = `${p.client_name} — ${p.profile_name}`;
      sel.appendChild(o);
    }
  }
  
  // Заполнение селектора шаблонов изделий
  function fillOrderTemplateSelector(){
    const typeSel = $("o_tpl_type");
    const tplSel = $("o_tpl_select");
    if(!typeSel || !tplSel) return;
    
    const type = typeSel.value;
    const templates = (state.productTemplates || []).filter(t=>t.type === type);
    tplSel.innerHTML = '<option value="">— выберите шаблон —</option>';
    for(const t of templates){
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      tplSel.appendChild(o);
    }
  }
  
  if($("o_tpl_type")){
    $("o_tpl_type").onchange = ()=>{
      fillOrderTemplateSelector();
      clearOrderSelectedInfo();
    };
  }
  
  if($("o_tpl_select")){
    $("o_tpl_select").onchange = clearOrderSelectedInfo;
  }
  
  if($("o_profile")){
    $("o_profile").onchange = clearOrderSelectedInfo;
  }
  
  // Загрузка из профиля
  if($("o_profile_load")){
    $("o_profile_load").onclick = async ()=>{
      const profileId = $("o_profile")?.value;
      if(!profileId){ toast("Выберите профиль"); return; }
      
      const profile = (state.clientProfiles||[]).find(p=>p.id === profileId);
      if(!profile){ toast("Профиль не найден"); return; }
      
      // Загружаем items профиля
      let items = [];
      try{
        const res = await api("/api/client-profiles/"+encodeURIComponent(profileId)+"/items");
        items = Array.isArray(res?.items) ? res.items : [];
      }catch(e){
        toast("Ошибка загрузки: " + e.message);
        return;
      }
      
      // Подставляем клиента
      if($("o_client") && profile.client_name){
        $("o_client").value = profile.client_name;
      }
      
      // Сохраняем для использования при создании
      orderSelectedProfile = { profile, items };
      orderSelectedTemplate = null;
      
      // Показываем информацию
      const info = $("o_selected_info");
      const details = $("o_selected_details");
      if(info && details){
        let html = `<div>Профиль: <b>${esc(profile.profile_name)}</b></div>`;
        html += `<div style="margin-top:4px">Изделий: <b>${items.length}</b></div>`;
        if(items.length > 0){
          html += '<ul style="margin:4px 0 0;padding-left:20px">';
          for(const it of items){
            const tpl = (state.productTemplates||[]).find(t=>t.id === it.template_id);
            html += `<li>${esc(it.product_type)} — ${tpl ? esc(tpl.name) : '—'} (×${it.multiplier||1})</li>`;
          }
          html += '</ul>';
        }
        details.innerHTML = html;
        info.style.display = "block";
      }
      toast("Профиль загружен");
    };
  }
  
  // Применение шаблона изделия
  if($("o_tpl_load")){
    $("o_tpl_load").onclick = async ()=>{
      const tplId = $("o_tpl_select")?.value;
      if(!tplId){ toast("Выберите шаблон изделия"); return; }
      
      const template = (state.productTemplates||[]).find(t=>t.id === tplId);
      if(!template){ toast("Шаблон не найден"); return; }
      
      // Загружаем операции шаблона
      let ops = [];
      try{
        const res = await api("/api/product-templates/"+encodeURIComponent(tplId)+"/ops");
        ops = Array.isArray(res?.ops) ? res.ops : [];
      }catch(e){
        toast("Ошибка загрузки: " + e.message);
        return;
      }
      
      // Подставляем данные в форму
      if($("o_product")){
        $("o_product").value = `${template.type} — ${template.name}`;
      }
      
      // Сохраняем для использования при создании
      orderSelectedTemplate = { template, ops };
      orderSelectedProfile = null;
      
      // Показываем информацию
      const info = $("o_selected_info");
      const details = $("o_selected_details");
      if(info && details){
        let html = `<div>Шаблон: <b>${esc(template.type)} — ${esc(template.name)}</b></div>`;
        html += `<div style="margin-top:4px">Операций: <b>${ops.length}</b></div>`;
        if(ops.length > 0){
          html += '<ul style="margin:4px 0 0;padding-left:20px">';
          for(const o of ops.slice(0, 5)){
            html += `<li>${o.no}. ${esc(o.operation_name||"")} (${esc(o.machine||"")})</li>`;
          }
          if(ops.length > 5) html += `<li>... ещё ${ops.length - 5}</li>`;
          html += '</ul>';
        }
        details.innerHTML = html;
        info.style.display = "block";
      }
      toast("Шаблон применён");
    };
  }

  // Заполнение селекторов типа и шаблона для добавления изделия
  window.fillNewItemSelectors = function fillNewItemSelectors(){
    const typeSel = $("new_item_type");
    const tplSel = $("new_item_template");
    if(!typeSel || !tplSel) return;
    
    const orderId = state.activeOrderId || "";
    
    // Если нет активного заказа - деактивируем селекторы
    if(!orderId){
      typeSel.disabled = true;
      tplSel.disabled = true;
      typeSel.innerHTML = '<option value="">Выберите активный заказ</option>';
      tplSel.innerHTML = '<option value="">Выберите активный заказ</option>';
      return;
    }
    
    // Если есть активный заказ - активируем и заполняем селекторы
    typeSel.disabled = false;
    tplSel.disabled = false;
    
    // Заполняем типы из productTypes
    const productTypes = state.productTypes || [];
    const typeNames = productTypes.map(t => typeof t === 'string' ? t : (t.name || ''));
    const currentType = typeSel.value || (typeNames[0] || "");
    
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
    
    // Заполняем шаблоны по выбранному типу
    const type = (typeSel.value || typeNames[0] || "").trim();
    const templates = (state.productTemplates || []).filter(t=>String(t.type||"").trim()===type);
    templates.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""), "ru"));
    
    tplSel.innerHTML = "";
    const first = document.createElement("option");
    first.value = "";
    first.textContent = templates.length ? "— выберите шаблон —" : "Нет шаблонов";
    tplSel.appendChild(first);
    for(const t of templates){
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      tplSel.appendChild(o);
    }
  }
  
  // Обновление селектора шаблонов при изменении типа
  if($("new_item_type")){
    $("new_item_type").onchange = () => {
      if(typeof window.fillNewItemSelectors === "function") {
        window.fillNewItemSelectors();
      } else if(typeof fillNewItemSelectors === "function") {
        fillNewItemSelectors();
      }
    };
  }

  // Add order item (изделие) с шаблоном MVP
  const addOrderItemBtn = $("addOrderItem");
  if(addOrderItemBtn){
    addOrderItemBtn.onclick = async ()=>{
      if(!currentUser || currentUser.role !== "admin"){
        toast("Только для администратора");
        return;
      }
      const orderId = state.activeOrderId || "";
      if(!orderId){ alert("Нет активного заказа"); return; }
      
      const type = ($("new_item_type").value || "").trim();
      const template_id = ($("new_item_template").value || "").trim();
      const title = ($("new_item_title").value || "").trim();
      const qty_plan = parseInt(($("new_item_qty").value || "0"), 10) || 0;
      
      if(!type){ alert("Выберите тип изделия"); return; }
      if(!template_id){ alert("Выберите шаблон изделия"); return; }
      if(qty_plan <= 0){ alert("Укажите план > 0"); return; }
      
      try{
        // Загружаем BOM из шаблона, если есть
        let bom = [];
        try{
          const bomRes = await api("/api/product-templates/"+encodeURIComponent(template_id)+"/bom");
          bom = Array.isArray(bomRes?.items) ? bomRes.items.map(x=>({ 
            material_id: x.material_id, 
            qty_per_unit: x.qty_per_unit, 
            qty_from_material: x.qty_from_material || 1 
          })) : [];
        }catch(e){
          console.warn("Ошибка загрузки BOM:", e);
        }
        
        await api("/api/orders/"+encodeURIComponent(orderId)+"/items", {
          method:"POST",
          body: JSON.stringify({ 
            id: uid(), 
            type, 
            title, 
            template_id,
            qty_plan,
            len_mm: 0,
            wid_mm: 0,
            hei_mm: 0,
            material: "",
            bom: bom
          })
        });
        
        $("new_item_title").value = "";
        $("new_item_qty").value = "";
        $("new_item_template").value = "";
        await refreshAll(false);
        // Обновляем отображение
        await renderAll();
        toast("✅ Изделие добавлено, задачи распределены");
      }catch(e){
        alert("Ошибка: " + e.message);
      }
    };
  }

  // Add op
  $("addOp").onclick = async ()=>{
    const order_id=$("r_order").value; if(!order_id){alert("Выбери заказ"); return;}
    const no=+$("r_no").value||0; if(no<=0){alert("№ операции > 0"); return;}
    const plannedMinutes = +$("r_planned_time").value || 0;
    const payload = {
      id: uid(),
      order_id,
      order_item_id: ($("f_order").value === order_id && $("f_item")) ? ($("f_item").value || null) : null,
      no,
      date:$("r_date").value||todayISO(),
      time:$("r_time").value.trim(),
      machine:$("r_machine").value,
      operator:$("r_operator").value,
      name:$("r_name").value.trim(),
      plan:+$("r_plan").value||0,
      fact:+$("r_fact").value||0,
      scrap:+$("r_scrap").value||0,
      status:$("r_status").value,
      dep:0,
      planned_duration: plannedMinutes * 60 // Конвертируем минуты в секунды
    };
    try{
      await api("/api/ops", { method:"POST", body: JSON.stringify(payload) });
      $("r_no").value = no+1;
      await refreshAll(false);
      // Обновляем отображение операций
      if(typeof window.renderOps === 'function'){
        await window.renderOps();
      } else if(typeof renderOps === 'function'){
        renderOps();
      } else {
        await renderAll();
      }
      toast("Операция добавлена");
    }catch(e){ alert("Ошибка: "+e.message); }
  };
  $("clearOp").onclick = ()=>{
    ["r_no","r_name","r_plan","r_fact","r_scrap","r_time","r_time_start","r_time_end"].forEach(id=>$(id).value="");
    $("r_status").value="Запланировано";
    $("r_date").value=todayISO();
  };
  
  // Синхронизация полей времени для мобильных
  $("r_time_start").onchange = ()=>{
    const start = $("r_time_start").value;
    const end = $("r_time_end").value;
    if(start && end){
      $("r_time").value = `${start}–${end}`;
    }else if(start){
      $("r_time").value = start;
    }
  };
  
  $("r_time_end").onchange = ()=>{
    const start = $("r_time_start").value;
    const end = $("r_time_end").value;
    if(start && end){
      $("r_time").value = `${start}–${end}`;
    }else if(end){
      $("r_time").value = end;
    }
  };
  
  // Обратная синхронизация: если меняется текстовое поле, обновляем time inputs
  $("r_time").onchange = ()=>{
    const timeStr = $("r_time").value.trim();
    const timeParts = timeStr.split(/[-–—]/); // Поддержка разных тире
    if(timeParts.length === 2){
      $("r_time_start").value = timeParts[0].trim();
      $("r_time_end").value = timeParts[1].trim();
    }else if(timeParts.length === 1 && timeParts[0]){
      $("r_time_start").value = timeParts[0].trim();
      $("r_time_end").value = "";
    }
  };

  // Quick add operation from table
  $("quickAddOp").onclick = async ()=>{
    // Get current filter
    const fo = $("f_order").value;
    const orderId = (fo && fo !== "(все)") ? fo : state.activeOrderId || "";
    
    if(!orderId || orderId === "(все)"){
      alert("Выберите конкретный заказ в фильтре для добавления операции");
      return;
    }

    // Find max operation number for this order
    const orderOps = state.ops.filter(op => op.order_id === orderId);
    const maxNo = orderOps.length > 0 ? Math.max(...orderOps.map(op => +op.no || 0)) : 0;
    const nextNo = maxNo + 1;
    
    // Get order info for plan
    const order = state.orders.find(o => o.id === orderId);
    const defaultPlan = order?.qty || 0;

    // Create new operation with defaults
    const newOp = {
      id: uid(),
      order_id: orderId,
      no: nextNo,
      date: todayISO(),
      time: "",
      machine: state.machines[0] || "",
      operator: state.operators[0] || "",
      name: "Новая операция",
      plan: defaultPlan,
      fact: 0,
      scrap: 0,
      status: "Запланировано",
      dep: 0
    };

    try{
      await api("/api/ops", { method:"POST", body: JSON.stringify(newOp) });
      await refreshAll(false);
      // Обновляем отображение операций
      if(typeof window.renderOps === 'function'){
        await window.renderOps();
      } else if(typeof renderOps === 'function'){
        renderOps();
      } else {
        await renderAll();
      }
      toast("Операция №" + nextNo + " добавлена! Кликните на ячейки для редактирования");
    }catch(e){
      alert("Ошибка добавления: " + e.message);
    }
  };

  // Settings save
  const addOperatorHandler = async ()=>{
    const newOperator = $("new_operator").value.trim();
    if(!newOperator){alert("Введите имя оператора"); return;}
    try{
      const currentList = $("s_ops").value.split("\n").map(s=>s.trim()).filter(Boolean);
      if(currentList.includes(newOperator)){
        alert("Оператор с таким именем уже существует");
        return;
      }
      currentList.push(newOperator);
      currentList.sort();
      await api("/api/operators", { method:"PUT", body: JSON.stringify({ operators: currentList }) });
      await refreshAll(false);
      $("new_operator").value = "";
      toast("Оператор добавлен: " + newOperator);
    }catch(e){
      console.error("Ошибка добавления оператора:", e);
      alert("Ошибка добавления: "+e.message);
    }
  };
  
  $("addOperator").onclick = addOperatorHandler;
  $("new_operator").onkeydown = (e)=>{
    if(e.key==="Enter") addOperatorHandler();
  };

  // Сохранение настроек таймера бездействия (только для администратора)
  $("saveAdminIdleTimeout").onclick = async () => {
    if(!currentUser || currentUser.role !== 'admin'){
      toast("Только для администратора");
      return;
    }
    const timeout = parseInt($("adminIdleTimeout").value || '0', 10);
    if(isNaN(timeout) || timeout < 0){
      toast("Неверное значение");
      return;
    }
    try {
      await api("/api/app-settings", {
        method: "PUT",
        body: JSON.stringify({
          settings: { admin_idle_timeout: timeout }
        })
      });
      adminIdleTimeout = timeout;
      resetIdleTimer(); // Перезапускаем таймер с новыми настройками
      toast("Настройки сохранены");
    } catch(e) {
      toast("Ошибка: " + e.message);
    }
  };
  
  $("saveOperatorIdleTimeout").onclick = async () => {
    if(!currentUser || currentUser.role !== 'admin'){
      toast("Только для администратора");
      return;
    }
    const timeout = parseInt($("operatorIdleTimeout").value || '10', 10);
    if(isNaN(timeout) || timeout < 1){
      toast("Неверное значение (минимум 1 секунда)");
      return;
    }
    try {
      await api("/api/app-settings", {
        method: "PUT",
        body: JSON.stringify({
          settings: { operator_idle_timeout: timeout }
        })
      });
      operatorIdleTimeout = timeout;
      resetIdleTimer(); // Перезапускаем таймер с новыми настройками
      toast("Настройки сохранены");
    } catch(e) {
      toast("Ошибка: " + e.message);
    }
  };
  
  // Показываем карточку настроек системы только для администратора
  const systemSettingsCard = $("systemSettingsCard");
  if(systemSettingsCard){
    if(currentUser && currentUser.role === 'admin'){
      systemSettingsCard.style.display = "";
    } else {
      systemSettingsCard.style.display = "none";
    }
  }

  $("saveOps").onclick = async ()=>{
    const list=$("s_ops").value.split("\n").map(s=>s.trim()).filter(Boolean);
    if(!list.length){alert("Пустой список"); return;}
    try{
      await api("/api/operators", { method:"PUT", body: JSON.stringify({ operators: list }) });
      await refreshAll(false);
      toast("Операторы сохранены");
    }catch(e){
      console.error("Ошибка сохранения операторов:", e);
      alert("Ошибка сохранения: "+e.message);
    }
  };
  const addMachineHandler = async ()=>{
    const newMachine = $("new_machine").value.trim();
    if(!newMachine){alert("Введите название машины"); return;}
    try{
      const currentList = $("s_machs").value.split("\n").map(s=>s.trim()).filter(Boolean);
      if(currentList.includes(newMachine)){
        alert("Машина с таким названием уже существует");
        return;
      }
      currentList.push(newMachine);
      currentList.sort();
      await api("/api/machines", { method:"PUT", body: JSON.stringify({ machines: currentList }) });
      await refreshAll(false);
      $("new_machine").value = "";
      toast("Машина добавлена: " + newMachine);
    }catch(e){
      console.error("Ошибка добавления машины:", e);
      alert("Ошибка добавления: "+e.message);
    }
  };
  
  $("addMachine").onclick = addMachineHandler;
  $("new_machine").onkeydown = (e)=>{
    if(e.key==="Enter") addMachineHandler();
  };

  $("saveMachs").onclick = async ()=>{
    const list=$("s_machs").value.split("\n").map(s=>s.trim()).filter(Boolean);
    if(!list.length){alert("Пустой список"); return;}
    try{
      await api("/api/machines", { method:"PUT", body: JSON.stringify({ machines: list }) });
      await refreshAll(false);
      toast("Машины сохранены");
    }catch(e){
      console.error("Ошибка сохранения машин:", e);
      alert("Ошибка сохранения: "+e.message);
    }
  };

  // Материалы
  const addMaterialBtn = $("addMaterial");
  if(addMaterialBtn){
    addMaterialBtn.onclick = async ()=>{
      if(!currentUser || currentUser.role !== "admin"){
        toast("Только для администратора");
        return;
      }
      const name = $("new_material_name").value.trim();
      const unit = ($("new_material_unit").value || "").trim();
      const material_type_id = ($("new_material_type_id").value || "").trim() || null;
      const length_mm = parseFloat($("new_material_length")?.value || "0") || 0;
      const width_mm = parseFloat($("new_material_width")?.value || "0") || 0;
      const thickness_mm = parseFloat($("new_material_thickness")?.value || "0") || 0;
      const price_per_unit = parseFloat($("new_material_price")?.value || "0") || 0;
      const stock = parseFloat(String($("new_material_stock").value || "0").replace(",", "."));
      if(!name){ alert("Введите название материала"); return; }
      try{
        await api("/api/materials", {
          method:"POST",
          body: JSON.stringify({ name, unit, material_type_id, length_mm, width_mm, thickness_mm, price_per_unit, stock: isFinite(stock) ? stock : 0 })
        });
        $("new_material_name").value = "";
        if($("new_material_unit")) $("new_material_unit").value = "";
        if($("new_material_length")) $("new_material_length").value = "";
        if($("new_material_width")) $("new_material_width").value = "";
        if($("new_material_thickness")) $("new_material_thickness").value = "";
        if($("new_material_price")) $("new_material_price").value = "";
        $("new_material_stock").value = "";
        await refreshAll(false);
        toast("Материал добавлен");
      }catch(e){
        alert("Ошибка добавления: " + e.message);
      }
    };
  }
  
  // Сортировка материалов
  const materialsHeader = $("materialsHeader");
  if(materialsHeader){
    materialsHeader.onclick = (e)=>{
      const th = e.target.closest("th[data-sort]");
      if(!th) return;
      const col = th.dataset.sort;
      if(state.materialsSortBy === col){
        state.materialsSortDir = state.materialsSortDir === "asc" ? "desc" : "asc";
      } else {
        state.materialsSortBy = col;
        state.materialsSortDir = "asc";
      }
      localStorage.setItem("materialsSortBy", state.materialsSortBy);
      localStorage.setItem("materialsSortDir", state.materialsSortDir);
      renderMaterialsSettings();
    };
  }
  
  // Единицы измерения
  const addUnitBtn = $("addUnit");
  if(addUnitBtn){
    addUnitBtn.onclick = async ()=>{
      if(!currentUser || currentUser.role !== "admin"){
        toast("Только для администратора");
        return;
      }
      const name = ($("new_unit_name")?.value || "").trim();
      const short_name = ($("new_unit_short")?.value || "").trim();
      if(!name){ alert("Введите название единицы"); return; }
      try{
        await api("/api/units", {
          method:"POST",
          body: JSON.stringify({ name, short_name })
        });
        if($("new_unit_name")) $("new_unit_name").value = "";
        if($("new_unit_short")) $("new_unit_short").value = "";
        await refreshAll(false);
        toast("Единица измерения добавлена");
      }catch(e){
        alert("Ошибка: " + e.message);
      }
    };
  }

  // Типы материалов
  const addMaterialTypeBtn = $("addMaterialType");
  if(addMaterialTypeBtn){
    addMaterialTypeBtn.onclick = async ()=>{
      if(!currentUser || currentUser.role !== "admin"){
        toast("Только для администратора");
        return;
      }
      const name = ($("new_material_type_name")?.value || "").trim();
      const description = ($("new_material_type_description")?.value || "").trim();
      if(!name){ alert("Введите название типа"); return; }
      try{
        const result = await api("/api/materials/types", {
          method:"POST",
          body: JSON.stringify({ name, description })
        });
        console.log("[addMaterialType] API вернул:", result);
        if($("new_material_type_name")) $("new_material_type_name").value = "";
        if($("new_material_type_description")) $("new_material_type_description").value = "";
        // Обновляем state.materialTypes напрямую, добавляя новый тип
        // Функция api() возвращает json.data напрямую, поэтому result уже содержит данные
        if(!state.materialTypes) {
          console.log("[addMaterialType] Инициализируем state.materialTypes");
          state.materialTypes = [];
        }
        console.log("[addMaterialType] Текущее состояние state.materialTypes:", state.materialTypes.length, "типов");
        if(result && result.id){
          // Проверяем, нет ли уже такого типа (чтобы избежать дубликатов)
          const exists = state.materialTypes.find(t => t.id === result.id);
          if(!exists){
            state.materialTypes.push(result);
            // Сортируем по sort_order и name
            state.materialTypes.sort((a,b)=>{
              const sortA = Number(a.sort_order || 0);
              const sortB = Number(b.sort_order || 0);
              if(sortA !== sortB) return sortA - sortB;
              return String(a.name||"").localeCompare(String(b.name||""), "ru");
            });
            console.log("[addMaterialType] Тип добавлен в state.materialTypes, всего:", state.materialTypes.length);
          } else {
            console.log("[addMaterialType] Тип уже существует в state.materialTypes");
          }
        } else {
          console.warn("[addMaterialType] Результат API не содержит id:", result);
        }
        // Перерисовываем таблицу типов сразу после добавления
        console.log("[addMaterialType] Вызываем renderMaterialTypesSettings()");
        if(typeof renderMaterialTypesSettings === 'function'){
          renderMaterialTypesSettings();
        } else {
          console.warn("renderMaterialTypesSettings не найдена");
        }
        // Также перерисовываем таблицу материалов, чтобы обновить выпадающие списки
        console.log("[addMaterialType] Вызываем renderMaterialsSettings()");
        if(typeof renderMaterialsSettings === 'function'){
          renderMaterialsSettings();
        }
        // Обновляем все данные в фоне для синхронизации
        refreshAll(false).catch(err => console.error("[addMaterialType] Ошибка refreshAll:", err));
        toast("✅ Тип материала добавлен");
      }catch(e){
        // Обработка ошибки 409 (Conflict) - тип уже существует
        const errorMsg = e.message || String(e);
        if(errorMsg.includes("409") || errorMsg.includes("уже существует") || errorMsg.includes("UNIQUE constraint") || errorMsg.includes("Conflict")){
          toast("⚠️ Тип с таким названием уже существует. Выберите другое название.", 5000);
        } else {
          console.error("Ошибка добавления типа материала:", e);
          alert("Ошибка: " + errorMsg);
        }
      }
    };
  }

  // Типы изделий
  const addProductTypeBtn = $("addProductType");
  if(addProductTypeBtn){
    addProductTypeBtn.onclick = async ()=>{
      if(!currentUser || currentUser.role !== "admin"){
        toast("Только для администратора");
        return;
      }
      const name = ($("new_product_type_name")?.value || "").trim();
      const description = ($("new_product_type_description")?.value || "").trim();
      if(!name){ alert("Введите название типа"); return; }
      try{
        await api("/api/product-types", {
          method:"POST",
          body: JSON.stringify({ name, description })
        });
        if($("new_product_type_name")) $("new_product_type_name").value = "";
        if($("new_product_type_description")) $("new_product_type_description").value = "";
        await refreshAll(false);
        // Перерисовываем таблицу после добавления
        if(typeof renderProductTypesSettings === 'function'){
          renderProductTypesSettings();
        }
        toast("✅ Тип изделия добавлен");
      }catch(e){
        // Обработка ошибки 409 (Conflict) - тип уже существует
        if(e.message && e.message.includes("409") || e.message && e.message.includes("уже существует")){
          toast("⚠️ Тип с таким названием уже существует. Выберите другое название.", 5000);
        } else {
          alert("Ошибка: " + e.message);
        }
      }
    };
  }

  // === Шаблоны изделий (MVP) ===
  if($("pt_type")){
    $("pt_type").onchange = ()=> renderProductTemplatesSettings();
  }
  if($("pt_select")){
    $("pt_select").onchange = ()=> renderProductTemplateOpsAndBom($("pt_select").value);
  }
  if($("pt_create")){
    $("pt_create").onclick = async ()=>{
      if(!currentUser || currentUser.role !== "admin"){ toast("Только для администратора"); return; }
      const type = ($("pt_type").value||"").trim();
      const name = prompt("Название шаблона изделия:", "");
      if(name===null) return;
      if(!name.trim()) return;
      try{
        await api("/api/product-templates", { method:"POST", body: JSON.stringify({ type, name: name.trim() }) });
        await refreshAll(false);
        toast("Шаблон изделия создан");
      }catch(e){ alert("Ошибка: "+e.message); }
    };
  }
  if($("pt_edit_name")){
    $("pt_edit_name").onclick = async ()=>{
      const id = ($("pt_select")?.value || "").trim();
      if(!id){ toast("Выберите шаблон"); return; }
      const template = (state.productTemplates || []).find(t=>t.id === id);
      if(!template){ toast("Шаблон не найден"); return; }
      const newName = prompt("Новое название шаблона:", template.name || "");
      if(newName === null) return;
      if(!newName.trim()){ alert("Название не может быть пустым"); return; }
      try{
        await api("/api/product-templates/"+encodeURIComponent(id), {
          method:"PUT",
          body: JSON.stringify({ ...template, name: newName.trim() })
        });
        await refreshAll(false);
        toast("Название изменено");
      }catch(e){ alert("Ошибка: "+e.message); }
    };
  }
  if($("pt_delete")){
    $("pt_delete").onclick = async ()=>{
      const id = ($("pt_select")?.value || "").trim();
      if(!id){ toast("Выберите шаблон"); return; }
      if(!confirm("Удалить шаблон изделия?")) return;
      try{
        await api("/api/product-templates/"+encodeURIComponent(id), { method:"DELETE" });
        await refreshAll(false);
        // Обновляем таблицу шаблонов изделий без перезагрузки страницы
        renderProductTemplatesSettings();
        toast("✅ Шаблон изделия удален");
      }catch(e){ 
        toast("❌ Ошибка удаления: " + e.message);
      }
    };
  }
  if($("pt_ops_add")){
    $("pt_ops_add").onclick = ()=>{
      const tb = $("pt_ops_t");
      if(!tb) return;
      // Удаляем строки-заглушки (без data-k="no")
      const existingRows = tb.querySelectorAll("tr");
      for(const row of existingRows){
        if(!row.querySelector('[data-k="no"]')){
          row.remove();
        }
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input data-k="no" type="number" min="1" step="1" value="1" style="width:50px"></td>
        <td data-k="input_sources" data-type="select-source" style="font-size:11px;cursor:pointer;color:var(--muted)" title="Откуда поступает материал">—</td>
        <td><textarea data-k="machine" class="resizable-textarea" placeholder="Машина" rows="1" style="min-width:100px"></textarea></td>
        <td data-k="output_targets" data-type="select-target" style="font-size:11px;cursor:pointer;color:var(--muted)" title="Куда уходит материал">—</td>
        <td><textarea data-k="operator" class="resizable-textarea" placeholder="Оператор" rows="1" style="min-width:100px"></textarea></td>
        <td><textarea data-k="operation_name" class="resizable-textarea" placeholder="Операция" rows="1" style="min-width:140px"></textarea></td>
        <td><input data-k="time" placeholder="Время" style="width:70px"></td>
        <td><input data-k="planned_duration" type="number" min="0" step="1" value="0" style="width:80px"></td>
        <td><input data-k="setup_time" type="number" min="0" step="1" value="0" style="width:80px"></td>
        <td><input data-k="setup_cost" type="number" min="0" step="0.01" value="0" style="width:90px" title="Стоимость наладки (€)"></td>
        <td><input data-k="operation_cost_per_unit" type="number" min="0" step="0.01" value="0" style="width:90px" title="Стоимость за единицу (€)"></td>
        <td><input data-k="scrap_cost_per_unit" type="number" min="0" step="0.01" value="0" style="width:90px" title="Стоимость отбраковки за единицу (€)"></td>
        <td><button class="btn ghost danger" data-a="rm">×</button></td>
      `;
      tr.dataset.input_sources = "";
      tr.dataset.output_targets = "";
      tr.dataset.input_critical = "0";
      tr.dataset.output_critical = "0";
      
      // Обработчики для редактирования направлений
      const inputCell = tr.querySelector('[data-k="input_sources"]');
      const outputCell = tr.querySelector('[data-k="output_targets"]');
      if(inputCell){
        inputCell.onclick = () => openProductTemplateSourceTargetModal(tr, null, true);
      }
      if(outputCell){
        outputCell.onclick = () => openProductTemplateSourceTargetModal(tr, null, false);
      }
      
      tr.querySelector('[data-a="rm"]').onclick = ()=> tr.remove();
      tb.appendChild(tr);
    };
  }
  if($("pt_ops_save")){
    $("pt_ops_save").onclick = async ()=>{
      const templateId = ($("pt_select")?.value || "").trim();
      if(!templateId){ toast("Выберите шаблон"); return; }
      const rows = Array.from($("pt_ops_t").querySelectorAll("tr"));
      const ops = [];
      for(const tr of rows){
        const noInp = tr.querySelector('[data-k="no"]');
        const machineInp = tr.querySelector('[data-k="machine"]');
        const operatorInp = tr.querySelector('[data-k="operator"]');
        const opNameInp = tr.querySelector('[data-k="operation_name"]');
        const timeInp = tr.querySelector('[data-k="time"]');
        const durationInp = tr.querySelector('[data-k="planned_duration"]');
        const setupInp = tr.querySelector('[data-k="setup_time"]');
        const setupCostInp = tr.querySelector('[data-k="setup_cost"]');
        const operationCostInp = tr.querySelector('[data-k="operation_cost_per_unit"]');
        const scrapCostInp = tr.querySelector('[data-k="scrap_cost_per_unit"]');
        // Пропускаем строки-заглушки
        if(!noInp || !machineInp || !operatorInp || !opNameInp) continue;
        const no = parseInt(noInp.value||"0",10);
        if(no <= 0) continue;
        // Получаем поля направлений из dataset строки
        const inputSources = tr.dataset.input_sources || "";
        const outputTargets = tr.dataset.output_targets || "";
        const inputCritical = parseInt(tr.dataset.input_critical || "0", 10) || 0;
        const outputCritical = parseInt(tr.dataset.output_critical || "0", 10) || 0;
        
        // Преобразуем значения направлений для отправки на сервер
        // dataset хранит JSON-строки, используем их как есть, если они не пустые
        let inputSourcesValue = null;
        let outputTargetsValue = null;
        if(inputSources && inputSources.trim() !== ""){
          // Проверяем, является ли это валидным JSON-строкой
          try {
            JSON.parse(inputSources);
            inputSourcesValue = inputSources; // Уже валидная JSON-строка
          } catch(e){
            // Если не JSON, преобразуем в JSON-массив
            inputSourcesValue = JSON.stringify([inputSources]);
          }
        }
        if(outputTargets && outputTargets.trim() !== ""){
          try {
            JSON.parse(outputTargets);
            outputTargetsValue = outputTargets; // Уже валидная JSON-строка
          } catch(e){
            outputTargetsValue = JSON.stringify([outputTargets]);
          }
        }
        
        ops.push({
          id: tr.dataset.id || undefined,
          no,
          machine: String(machineInp.value || "").trim(),
          operator: String(operatorInp.value || "").trim(),
          operation_name: String(opNameInp.value || "").trim(),
          time: timeInp ? String(timeInp.value || "").trim() : "",
          planned_duration: durationInp ? parseInt(durationInp.value||"0",10)||0 : 0,
          setup_time: setupInp ? parseInt(setupInp.value||"0",10)||0 : 0,
          setup_cost: setupCostInp ? parseFloat(setupCostInp.value||"0")||0 : 0,
          operation_cost_per_unit: operationCostInp ? parseFloat(operationCostInp.value||"0")||0 : 0,
          scrap_cost_per_unit: scrapCostInp ? parseFloat(scrapCostInp.value||"0")||0 : 0,
          input_sources: inputSourcesValue,
          output_targets: outputTargetsValue,
          input_critical: inputCritical || 0,
          output_critical: outputCritical || 0
        });
      }
      try{
        // Отправляем массив операций напрямую (сервер ожидает массив в req.body)
        await api("/api/product-templates/"+encodeURIComponent(templateId)+"/ops", { 
          method:"PUT", 
          body: JSON.stringify(ops) 
        });
        toast("✅ Маршрут сохранён");
        // Перерисовываем операции после сохранения
        await renderProductTemplateOpsAndBom(templateId);
      }catch(e){ 
        console.error("Ошибка сохранения маршрута:", e);
        alert("Ошибка: "+e.message); 
      }
    };
  }
  if($("pt_bom_add")){
    $("pt_bom_add").onclick = ()=>{
      const tb = $("pt_bom_t");
      if(!tb) return;
      // Удаляем строку-заглушку "Нет материалов", если она есть
      const existingRows = tb.querySelectorAll("tr");
      for(const row of existingRows){
        if(!row.querySelector('[data-k="material_id"]')){
          row.remove();
        }
      }
      const mats = state.materials || [];
      const options = ['<option value="">— выбрать —</option>']
        .concat(mats.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}${m.unit?` (${esc(m.unit)})`:""}</option>`))
        .join("");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><select data-k="material_id" style="min-width:280px">${options}</select></td>
        <td><input data-k="qty_per_unit" type="number" min="0" step="0.0001" value="1" style="width:160px"></td>
        <td><button class="btn ghost danger" data-a="rm">×</button></td>
      `;
      tr.querySelector('[data-a="rm"]').onclick = ()=> tr.remove();
      tb.appendChild(tr);
    };
  }
  if($("pt_bom_save")){
    $("pt_bom_save").onclick = async ()=>{
      const templateId = ($("pt_select")?.value || "").trim();
      if(!templateId){ toast("Выберите шаблон"); return; }
      const rows = Array.from($("pt_bom_t").querySelectorAll("tr"));
      const items = [];
      for(const tr of rows){
        const matSel = tr.querySelector('[data-k="material_id"]');
        const qtyInp = tr.querySelector('[data-k="qty_per_unit"]');
        if(!matSel || !qtyInp) continue; // Пропускаем строки-заглушки
        const material_id = matSel.value;
        const qty_per_unit = parseFloat(String(qtyInp.value||"0").replace(",","."));
        if(material_id && isFinite(qty_per_unit) && qty_per_unit > 0){
          items.push({ material_id, qty_per_unit });
        }
      }
      try{
        await api("/api/product-templates/"+encodeURIComponent(templateId)+"/bom", { method:"PUT", body: JSON.stringify({ items }) });
        toast("Рецептура сохранена");
        await renderProductTemplateOpsAndBom(templateId);
        // Обновляем список шаблонов, чтобы показать новую рецептуру
        renderProductTemplatesList();
      }catch(e){ alert("Ошибка: "+e.message); }
    };
  }

  if($("pt_import_btn")){
    $("pt_import_btn").onclick = async ()=>{
      const templateId = ($("pt_select")?.value || "").trim();
      const legacyName = ($("pt_import_legacy")?.value || "").trim();
      if(!templateId){ toast("Выберите шаблон изделия"); return; }
      if(!legacyName){ toast("Выберите шаблон операций"); return; }
      if(!confirm(`Импортировать маршрут операций из шаблона "${legacyName}"?\nОперации будут добавлены к существующему маршруту.`)) return;
      try{
        await api("/api/product-templates/"+encodeURIComponent(templateId)+"/import-ops-from-legacy", {
          method:"POST",
          body: JSON.stringify({ legacyTemplateName: legacyName })
        });
        toast("✅ Маршрут добавлен к существующему");
        await renderProductTemplateOpsAndBom(templateId);
      }catch(e){
        alert("Ошибка импорта: " + e.message);
      }
    };
  }

  // === Клиенты → Профили ===
  if($("cp_client")){
    $("cp_client").onchange = ()=> renderClientProfilesSettings();
  }
  if($("cp_select")){
    $("cp_select").onchange = ()=> renderClientProfileItems($("cp_select").value);
  }
  if($("cp_create")){
    $("cp_create").onclick = async ()=>{
      const client = ($("cp_client").value||"").trim();
      if(!client){ alert("Введите/выберите клиента"); return; }
      const profile = prompt("Название профиля:", "");
      if(profile===null) return;
      if(!profile.trim()) return;
      try{
        await api("/api/client-profiles", { method:"POST", body: JSON.stringify({ client_name: client, profile_name: profile.trim() }) });
        await refreshAll(false);
        toast("Профиль создан");
      }catch(e){ alert("Ошибка: "+e.message); }
    };
  }
  if($("cp_delete")){
    $("cp_delete").onclick = async ()=>{
      const id = ($("cp_select")?.value || "").trim();
      if(!id){ toast("Выберите профиль"); return; }
      if(!confirm("Удалить профиль?")) return;
      try{
        await api("/api/client-profiles/"+encodeURIComponent(id), { method:"DELETE" });
        await refreshAll(false);
        // Обновляем список профилей без перезагрузки страницы
        if(typeof renderProductTemplatesList === 'function') {
          renderProductTemplatesList();
        }
        toast("✅ Профиль удален");
      }catch(e){ 
        toast("❌ Ошибка удаления: " + e.message);
      }
    };
  }
  if($("cp_items_add")){
    $("cp_items_add").onclick = ()=>{
      const tb = $("cp_items_t");
      if(!tb) return;
      // Удаляем строки-заглушки (без data-k элементов)
      const existingRows = tb.querySelectorAll("tr");
      for(const row of existingRows){
        if(!row.querySelector('[data-k="product_type"]')){
          row.remove();
        }
      }
      const templates = state.productTemplates || [];
      const type = "Коробка";
      const typeOptions = ['Коробка','Крышка','Ложемент'].map(t=>`<option>${esc(t)}</option>`).join("");
      const tplOptions = (type)=>['<option value="">— выбрать —</option>']
        .concat(templates.filter(x=>String(x.type||"")===type).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`))
        .join("");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><select data-k="product_type" style="min-width:140px">${typeOptions}</select></td>
        <td><select data-k="template_id" style="min-width:320px">${tplOptions(type)}</select></td>
        <td><input data-k="multiplier" type="number" min="1" step="1" value="1" style="width:120px"></td>
        <td><button class="btn ghost danger" data-a="rm">×</button></td>
      `;
      const typeSel = tr.querySelector('[data-k="product_type"]');
      const tplSel = tr.querySelector('[data-k="template_id"]');
      typeSel.onchange = ()=>{ tplSel.innerHTML = tplOptions(typeSel.value); };
      tr.querySelector('[data-a="rm"]').onclick = ()=> tr.remove();
      tb.appendChild(tr);
    };
  }
  if($("cp_items_save")){
    $("cp_items_save").onclick = async ()=>{
      const profileId = ($("cp_select")?.value || "").trim();
      if(!profileId){ toast("Выберите профиль"); return; }
      const rows = Array.from($("cp_items_t").querySelectorAll("tr"));
      const items = [];
      let sortNo = 1;
      for(const tr of rows){
        const typeSel = tr.querySelector('[data-k="product_type"]');
        const tplSel = tr.querySelector('[data-k="template_id"]');
        const multInp = tr.querySelector('[data-k="multiplier"]');
        if(!typeSel || !tplSel || !multInp) continue; // Пропускаем строки-заглушки
        const product_type = typeSel.value;
        const template_id = tplSel.value;
        const multiplier = parseInt(multInp.value||"1",10)||1;
        if(product_type){
          items.push({
            id: tr.dataset.id || undefined,
            product_type,
            template_id: template_id || null,
            multiplier,
            sort_no: sortNo++
          });
        }
      }
      try{
        await api("/api/client-profiles/"+encodeURIComponent(profileId)+"/items", { method:"PUT", body: JSON.stringify({ items }) });
        toast("Набор сохранён");
        await refreshAll(false);
        renderClientProfilesList();
      }catch(e){ alert("Ошибка: "+e.message); }
    };
  }

  // Template selector change
  $("tpl_select").onchange = ()=>{
    state.currentTemplate = $("tpl_select").value;
    renderTemplates();
  };


  const tplBomBtn = $("tplBom");
  if(tplBomBtn){
    tplBomBtn.onclick = ()=>{
      const name = (state.currentTemplate || "").trim();
      if(!name){ toast("Выберите шаблон"); return; }
      openTemplateBomModal(name);
    };
  }

  // Create empty template
  $("createEmptyTemplate").onclick = async ()=>{
    const name = prompt("Введите название нового пустого шаблона:");
    if(!name || !name.trim()){
      return;
    }
    const templateName = name.trim();
    
    // Check if exists
    const exists = state.templates.find(t => t.name === templateName);
    if(exists){
      alert("Шаблон с таким названием уже существует");
      return;
    }
    
    try{
      // Создаём пустой шаблон (без операций)
      await refreshAll(false);
      state.currentTemplate = templateName;
      renderTemplateSelector();
      renderTemplates();
      toast("✅ Пустой шаблон создан: " + templateName);
    }catch(e){
      alert("Ошибка создания: " + e.message);
    }
  };

  // Create template from source (копируем все операции из выбранных шаблонов без агрегирования)
  $("createTemplateFromSource").onclick = async ()=>{
    const sourceSel = $("tpl_source_select");
    if(!sourceSel){
      alert("Селектор шаблонов не найден");
      return;
    }
    
    const selectedNames = Array.from(sourceSel.selectedOptions).map(opt => opt.value).filter(Boolean);
    if(selectedNames.length === 0){
      alert("Выберите хотя бы один шаблон-источник для копирования");
      return;
    }
    
    const name = prompt("Введите название нового шаблона:");
    if(!name || !name.trim()){
      return;
    }
    const templateName = name.trim();
    
    // Check if exists
    const exists = state.templates.find(t => t.name === templateName);
    if(exists){
      alert("Шаблон с таким названием уже существует");
      return;
    }
    
    try{
      const normalize = (s)=>String(s||"").trim().toLowerCase().replace(/\s+/g," ");
      
      // Собираем все операции из всех выбранных шаблонов в правильном порядке
      const allOps = [];
      for(const sourceName of selectedNames){
        const ops = state.templates
          .filter(t => sourceName && normalize(t.name) === normalize(sourceName))
        .sort((a,b)=>(+a.no||0)-(+b.no||0));
        allOps.push(...ops);
      }

      if(allOps.length === 0){
        alert("Выбранные шаблоны не содержат операций");
        return;
      }

      // Копируем ВСЕ операции как есть, без агрегирования
      let opNo = 1;
      const createdOps = [];
      
      for(const base of allOps){
        // Копируем все поля операции точно как в исходном шаблоне
        // Важно: копируем все поля, включая пустые значения
          const newTpl = {
            id: uid(),
            name: templateName,
          no: opNo++, // Нумеруем последовательно
          machine: base.machine !== undefined ? base.machine : "",
          operator: base.operator !== undefined ? base.operator : "",
          operation_name: base.operation_name !== undefined ? base.operation_name : "", // Копируем название операции
          time: base.time !== undefined ? base.time : "",
            planned_duration: +base.planned_duration || 0,
          setup_time: +base.setup_time || 0,
          // Копируем пути: откуда пришло и куда пойдёт
          input_sources: base.input_sources !== undefined && base.input_sources !== null ? base.input_sources : null,
          output_targets: base.output_targets !== undefined && base.output_targets !== null ? base.output_targets : null,
          input_critical: base.input_critical !== undefined ? (+base.input_critical || 0) : 0,
          output_critical: base.output_critical !== undefined ? (+base.output_critical || 0) : 0
        };
        
          await api("/api/templates", { method:"POST", body: JSON.stringify(newTpl) });
        
          // Копируем материалы (если есть)
          try{
            const src = await api("/api/templates/"+encodeURIComponent(base.id)+"/materials");
          const items = Array.isArray(src?.items) ? src.items.map(x=>({ 
            material_id: x.material_id, 
            qty: x.qty, 
            qty_from_material: x.qty_from_material || 1 
          })) : [];
            if(items.length){
            await api("/api/templates/"+encodeURIComponent(newTpl.id)+"/materials", { 
              method:"PUT", 
              body: JSON.stringify({ items }) 
            });
            }
          }catch(_e){}
        
        createdOps.push(newTpl);
      }

      await refreshAll(false);
      state.currentTemplate = templateName;
      renderTemplateSelector();
      renderTemplates();
      toast(`✅ Шаблон создан по типу из ${selectedNames.length} шаблонов: ${templateName} (${createdOps.length} операций скопировано)`);
    }catch(e){
      alert("Ошибка создания: " + e.message);
    }
  };

  // Delete template
  $("deleteTemplate").onclick = async ()=>{
    const templateName = state.currentTemplate;
    if(!templateName){
      alert("Нет выбранного шаблона");
      return;
    }
    
    const templates = state.templates.filter(t => t.name === templateName);
    if(templates.length === 0){
      alert("Шаблон не найден");
      return;
    }
    
    if(!confirm(`Удалить шаблон "${templateName}" и все его операции (${templates.length} шт.)?`)){
      return;
    }
    
    try{
      for(const tpl of templates){
        await api("/api/templates/"+encodeURIComponent(tpl.id), { method:"DELETE" });
      }
      await refreshAll(false);
      const remaining = getTemplateNames();
      state.currentTemplate = remaining[0] || "";
      renderTemplateSelector();
      // Обновляем таблицу шаблонов без перезагрузки страницы
      renderTemplates();
      toast("✅ Шаблон удален: " + templateName);
    }catch(e){
      toast("❌ Ошибка удаления: " + e.message);
    }
  };

  // Template insert
  $("tplBox").onclick = async ()=>{
    const orderId = $("tpl_order").value;
    const selectedValue = ($("tpl_item")?.value || "").trim();
    const templateName = state.currentTemplate;
    const startDate = $("tpl_start_date").value;
    
    if(!orderId){
      alert("Сначала создайте заказ и выберите его из списка");
      return;
    }
    
    if(!templateName){
      alert("Сначала выберите шаблон");
      return;
    }

    if(!selectedValue){
      alert("Выберите изделие, куда вставлять операции");
      return;
    }
    
    // Проверяем, выбран ли шаблон MVP
    let orderItemId = selectedValue;
    const selectedOption = $("tpl_item").querySelector(`option[value="${selectedValue}"]`);
    const isTemplate = selectedOption?.dataset.isTemplate === "true";
    
    // Если выбран шаблон MVP, создаем изделие в заказе
    if(isTemplate){
      const templateId = selectedOption.dataset.templateId;
      const templateType = selectedOption.dataset.templateType || "";
      const productTemplate = state.productTemplates?.find(t => t.id === templateId);
      
      if(!productTemplate){
        alert("Шаблон MVP не найден");
        return;
      }
      
      try {
        // Создаем изделие в заказе из шаблона MVP
        const orderItem = {
          id: uid(),
          order_id: orderId,
          type: templateType,
          title: productTemplate.name || "",
          template_id: templateId,
          qty_plan: 0, // Будет установлено из заказа
          status: "Открыто"
        };
        
        const ord = state.orders.find(o => o.id === orderId);
        if(ord && ord.qty){
          orderItem.qty_plan = parseInt(ord.qty) || 0;
        }
        
        await api("/api/order-items", {
          method: "POST",
          body: JSON.stringify(orderItem)
        });
        
        orderItemId = orderItem.id;
        toast("Изделие создано из шаблона MVP");
        
        // Обновляем данные
        await refreshAll(false);
        
        // Обновляем селектор
        if(typeof window.renderSelectors === 'function'){
          window.renderSelectors();
        } else if(typeof renderSelectors === 'function'){
          renderSelectors();
        }
        
        // Устанавливаем созданное изделие в селекторе
        $("tpl_item").value = orderItemId;
      } catch(e) {
        alert("Ошибка создания изделия из шаблона MVP: " + e.message);
        return;
      }
    }
    
    if(!startDate){
      alert("Выберите дату начала для операций");
      return;
    }
    
    // Check if order already has operations
    const existingOps = state.ops.filter(op => op.order_id === orderId);
    if(existingOps.length > 0){
      if(!confirm(`В заказе ${orderId} уже есть ${existingOps.length} операций. Добавить ещё операции из шаблона?`)){
        return;
      }
    }
    
    const ord = state.orders.find(o=>o.id===orderId);
    const plan = +(ord?.qty||0);
    const dt = startDate; // Используем выбранную дату начала
    
    // Load template operations from database
    const templateOps = state.templates.filter(t=>t.name===templateName)
      .sort((a,b)=>(+a.no||0)-(+b.no||0));
    
    if(templateOps.length === 0){
      alert("Шаблон пуст. Добавьте операции в шаблон сначала.");
      return;
    }
    
    try{
      for(const x of templateOps){
        // Вычисляем общее плановое время: время_на_единицу × тираж
        const timePerUnit = x.planned_duration || 0; // секунд на единицу
        const totalPlannedTime = timePerUnit * plan; // общее время в секундах
        const setupTime = x.setup_time || 0; // время наладки в секундах (не зависит от тиража)
        
        const opId = uid();
        await api("/api/ops", { method:"POST", body: JSON.stringify({
          id: opId, order_id: orderId, order_item_id: orderItemId, no: parseInt(x.no) || 1, date:dt, time:x.time||"",
          machine:x.machine||"", operator:x.operator||"", name:x.operation_name||"", 
          plan, fact:0, scrap:0, status:"Запланировано", dep:0, 
          planned_duration: totalPlannedTime,
          planned_setup_time: setupTime
        })});
      }
      // Копируем BOM изделия из рецептуры шаблона (на 1 изделие)
      try{
        await api("/api/order-items/"+encodeURIComponent(orderItemId)+"/bom/copy-from-template", {
          method:"POST",
          body: JSON.stringify({ templateName })
        });
      }catch(_e){}
      await refreshAll(false);
      // Обновляем селекторы после вставки
      if(typeof window.renderSelectors === 'function'){
        window.renderSelectors();
      } else if(typeof renderSelectors === 'function'){
        renderSelectors();
      }
      toast(`Шаблон "${templateName}" вставлен в заказ ${orderId}: ${templateOps.length} операций (тираж: ${plan}, дата начала: ${formatDate(dt)})`);
    }catch(e){ alert("Ошибка: "+e.message); }
  };
  
  // Обновление списка изделий при изменении заказа
  if($("tpl_order")){
    $("tpl_order").onchange = ()=>{
      if(typeof window.renderSelectors === 'function'){
        window.renderSelectors();
      } else if(typeof renderSelectors === 'function'){
        renderSelectors();
      }
    };
  }

  // Add template operation
  $("addTemplateOp").onclick = async ()=>{
    const templateName = state.currentTemplate;
    if(!templateName){
      alert("Сначала выберите или создайте шаблон");
      return;
    }
    
    const templates = state.templates.filter(t=>t.name===templateName);
    const maxNo = templates.length > 0 ? Math.max(...templates.map(t => parseInt(t.no) || 0)) : 0;
    const nextNo = parseInt(maxNo) + 1;
    
    const newTpl = {
      id: uid(),
      name: templateName,
      no: parseInt(nextNo),
      machine: state.machines[0] || "",
      operator: state.operators[0] || "",
      operation_name: "Новая операция",
      time: "",
      planned_duration: 0,
      setup_time: 0
    };
    
    try{
      await api("/api/templates", { method:"POST", body: JSON.stringify(newTpl) });
      await refreshAll(false);
      toast("Операция №" + nextNo + " добавлена в шаблон");
    }catch(e){
      alert("Ошибка добавления: " + e.message);
    }
  };

  // Stats
  $("loadStats").onclick = loadStats;
  $("exportStatsCSV").onclick = exportStatsToCSV;
  $("exportStatsExcel").onclick = exportStatsToExcel;
  $("getForecast").onclick = getForecast;
  $("getOrderForecast").onclick = getOrderForecast;
  $("loadAnalytics").onclick = loadAnalytics;
  
  $("statsToday").onclick = ()=>{
    $("stats_start").value = todayISO();
    $("stats_end").value = todayISO();
    loadStats();
  };
  
  $("statsWeek").onclick = ()=>{
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    $("stats_start").value = weekAgo.toISOString().slice(0,10);
    $("stats_end").value = todayISO();
    loadStats();
  };
  
  $("statsMonth").onclick = ()=>{
    const today = new Date();
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    $("stats_start").value = monthAgo.toISOString().slice(0,10);
    $("stats_end").value = todayISO();
    loadStats();
  };
  
  $("stats3Months").onclick = ()=>{
    const today = new Date();
    const threeMonthsAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    $("stats_start").value = threeMonthsAgo.toISOString().slice(0,10);
    $("stats_end").value = todayISO();
    loadStats();
  };
  
  $("stats6Months").onclick = ()=>{
    const today = new Date();
    const sixMonthsAgo = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000);
    $("stats_start").value = sixMonthsAgo.toISOString().slice(0,10);
    $("stats_end").value = todayISO();
    loadStats();
  };
  
  $("statsYear").onclick = ()=>{
    const today = new Date();
    const yearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
    $("stats_start").value = yearAgo.toISOString().slice(0,10);
    $("stats_end").value = todayISO();
    loadStats();
  };
  
  $("statsClear").onclick = ()=>{
    $("stats_start").value = "";
    $("stats_end").value = "";
    $("stats_operator").value = "";
    $("stats_machine").value = "";
    $("stats_order").value = "";
    $("stats_sort").value = "date";
  };

  // Кеш таймеров будет сброшен при обновлении данных
  // Глобальная функция updateTimers уже определена выше и используется

  // Designer state, controls and lifecycle are owned by js/modules/designer.js.

  // First load
  await refreshAll(false);
  
  // Восстанавливаем активную вкладку после перезагрузки (для кнопки обновить)
  const savedPane = sessionStorage.getItem('activePane');
  if(savedPane) {
    sessionStorage.removeItem('activePane');
    const savedLayoutId = sessionStorage.getItem('designerLayoutId');
    if(savedLayoutId) sessionStorage.removeItem('designerLayoutId');
    
    // Переключаемся на сохранённую вкладку
    const restoreOwner = currentUser;
    setTimeout(async () => {
      if(currentUser !== restoreOwner) return;
      const opened = await switchPane(savedPane);
      if(opened && savedPane === 'designer' && savedLayoutId) {
        await window.DesignerModule?.loadFloorLayoutFull(savedLayoutId);
      }
    }, 300);
  }
  
  // Инициализируем визуальный индикатор сортировки после загрузки данных
  setTimeout(() => {
    if(typeof updateSortVisualIndicator === 'function'){
      updateSortVisualIndicator();
    }
  }, 100);
  
  // Инициализируем изменение размера столбцов для всех таблиц
  setTimeout(() => {
    if(typeof initAllTableColumnResize === 'function'){
      initAllTableColumnResize();
    }
  }, 200);
  applicationControlsReady = true;
}
init().then(async () => {
  // Load critical modules immediately after init
  try {
    await ModuleLoader.preloadCritical();
    console.log('Critical modules loaded');
    
    // ЗАГРУЖАЕМ ширины колонок ПЕРЕД рендерингом
    if (currentUser && currentUser.userId) {
      if (typeof loadColumnWidthsFromServer === 'function') {
        await loadColumnWidthsFromServer();
        console.log("📥 Ширины колонок загружены при инициализации");
      }
    }
    
    // Re-render after modules load
    if(typeof renderAll === 'function') await renderAll();
  } catch(e) {
    console.error('Error loading modules:', e);
  }
}).catch(e=>{ console.error(e); alert("Ошибка запуска: "+e.message); });

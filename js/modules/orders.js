/**
 * B'BOX Production - Orders Module
 * Модуль управления заказами и изделиями
 */

(function() {
  'use strict';
  
  if (window.OrdersModule && window.OrdersModule.loaded) {
    console.log('Orders module already loaded');
    return;
  }
  
  console.log('Loading Orders module...');
  
  // --- Render Functions ---
  
  function renderSelectors() {
    const orders = state.orders.slice().sort((a,b) => a.id.localeCompare(b.id));
    const active = state.activeOrderId || orders[0]?.id || "";
    if(active) state.activeOrderId = active;

    fillSelect($("r_order"), orders.map(o => o.id), active);
    
    const savedFilterOrder = localStorage.getItem("filterOrder") || "(все)";
    fillSelect($("f_order"), ["(все)"].concat(orders.map(o => o.id)), savedFilterOrder);
    
    fillSelect($("tpl_order"), orders.map(o => o.id), $("tpl_order")?.value || active);
    
    // Items for template insertion - показываем и существующие изделия, и шаблоны MVP
    const tplItemSel = $("tpl_item");
    if(tplItemSel) {
      const orderId = $("tpl_order")?.value || active;
      const existingItems = Array.isArray(state.orderItemsByOrder?.[orderId]) 
        ? state.orderItemsByOrder[orderId] : [];
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
        
        for(const it of existingItems) {
        const opt = document.createElement("option");
        opt.value = it.id;
          opt.dataset.isOrderItem = "true";
        const title = it.title ? ` · ${it.title}` : "";
        opt.textContent = `${it.type}${title} · план ${it.qty_plan || 0}`;
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
        
        for(const tpl of productTemplates) {
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

    // Item filter
    const itemFilter = $("f_item");
    if(itemFilter) {
      const fo = $("f_order")?.value;
      const orderId = (fo && fo !== "(все)") ? fo : "";
      const items = orderId ? (state.orderItemsByOrder?.[orderId] || []) : [];
      const saved = localStorage.getItem("filterItem") || "";
      itemFilter.innerHTML = "";
      const optAll = document.createElement("option");
      optAll.value = "";
      optAll.textContent = orderId ? "(Все изделия)" : "(Выберите заказ)";
      itemFilter.appendChild(optAll);
      if(orderId) {
        for(const it of items) {
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
    
    // Operator selector
    let defaultOperator = $("my_op")?.value || state.operators[0] || "";
    if(currentUser && currentUser.role === 'operator' && currentUser.operatorName) {
      defaultOperator = currentUser.operatorName;
    }
    fillSelect($("my_op"), state.operators, defaultOperator);
    
    const savedMyOrder = localStorage.getItem("myOrderFilter") || "(все)";
    fillSelect($("my_order"), ["(все)"].concat(orders.map(o => o.id)), savedMyOrder);
    
    fillSelect($("r_operator"), state.operators, $("r_operator")?.value || state.operators[0] || "");
    fillSelect($("r_machine"), state.machines, $("r_machine")?.value || state.machines[0] || "");
    fillSelect($("m_m"), state.machines, $("m_m")?.value || state.machines[0] || "");

    renderClientDatalist();
    
    if(typeof fillOrderProfileSelector === "function") fillOrderProfileSelector();
    if(typeof fillOrderTemplateSelector === "function") fillOrderTemplateSelector();
  }
  
  function getClientNames() {
    const set = new Set();
    for(const o of (state.orders || [])) {
      const c = String(o?.client || "").trim();
      if(c) set.add(c);
    }
    return [...set].sort((a,b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'ru'));
  }
  
  function renderClientDatalist() {
    const list = $("clientsList");
    if(!list) return;
    list.innerHTML = getClientNames().map(c => `<option value="${esc(c)}">`).join("");
  }
  
  function renderKPIs() {
    if ($("k_orders")) $("k_orders").textContent = state.orders.length;
    if ($("k_ops")) $("k_ops").textContent = state.ops.length;
    const average = state.ops.length ? state.ops.reduce((sum, op) => sum + completion(op), 0) / state.ops.length : 0;
    if ($("k_done")) $("k_done").textContent = Math.round(average * 100) + "%";
    const activeOps = state.ops.filter(o => o.order_id === state.activeOrderId);
    const total = activeOps.length;
    const done = activeOps.filter(o => isDone(o)).length;
    const el = $("activeKpi");
    if(el) el.textContent = `${done}/${total}`;
  }
  
  function renderOrders() {
    const q = ($("q")?.value || "").toLowerCase().trim();
    const tb = $("ordersT");
    if(!tb) return;
    tb.innerHTML = "";
    
    const rows = state.orders.filter(o => {
      if(!q) return true;
      return [o.id, o.client, o.product].join(" ").toLowerCase().includes(q);
    }).sort((a,b) => a.id.localeCompare(b.id));

    for(const o of rows) {
      const orderOps = state.ops.filter(x => x.order_id === o.id);
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

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${esc(o.id)}${o.id === state.activeOrderId ? ` <span class="pill">активен</span>` : ""}</td>
        <td class="editable" data-field="client" style="cursor:pointer" title="Кликните, чтобы изменить клиента">${esc(o.client || "")}</td>
        <td>${esc(o.product || "")}</td>
        <td>${o.qty || 0}</td>
        <td class="mono">${totalProc}</td>
        <td class="mono">${doneProc}</td>
        <td>${statusHtml}</td>
        <td><span class="pill ${prog >= 1 ? "ok" : "bad"}" style="${prog > 1 ? "background:rgba(0,207,181,.2);border-color:rgba(0,207,181,.5);font-weight:900" : ""}">${Math.round(prog * 100)}%</span></td>
        <td class="row" style="gap:6px">
          <button class="btn ghost" data-a="open">Открыть</button>
          <button class="btn ghost" data-a="loadCutting" title="Загрузить раскрой для этого заказа">✂️ Крой</button>
          <button class="btn ghost" data-a="dup" title="Дублировать заказ (без операций)">Дубль</button>
          <button class="btn ghost" data-a="edit">✎</button>
          <button class="btn ghost danger" data-a="del">Удалить</button>
        </td>`;

      const openBtn = tr.querySelector('[data-a="open"]');
      if (openBtn) openBtn.onclick = () => { 
        state.activeOrderId = o.id; 
        renderAll(); 
        toast("Активный: " + o.id); 
      };
      
      const dupBtn = tr.querySelector('[data-a="dup"]');
      if (dupBtn) dupBtn.onclick = () => duplicateOrder(o);
      
      const delBtn = tr.querySelector('[data-a="del"]');
      if (delBtn) delBtn.onclick = async () => {
        if(!confirm("Удалить заказ и все операции?")) return;
        await api("/api/orders/" + encodeURIComponent(o.id), { method: "DELETE" });
        await refreshAll();
        toast("Удалено: " + o.id);
      };
      const editBtn = tr.querySelector('[data-a="edit"]');
      if (editBtn) editBtn.onclick = () => openOrderEditModal(o);
      
      const loadCuttingBtn = tr.querySelector('[data-a="loadCutting"]');
      if (loadCuttingBtn) {
        loadCuttingBtn.onclick = async () => {
          console.log("Кнопка 'Крой' нажата для заказа:", o);
          try {
            await openLoadCuttingModal(o);
          } catch (error) {
            console.error("Ошибка при открытии модального окна раскроя:", error);
            toast("❌ Ошибка: " + (error.message || String(error)));
          }
        };
      } else {
        console.warn("Кнопка [data-a='loadCutting'] не найдена для заказа:", o.id);
      }
      
      const clientTd = tr.querySelector('td[data-field="client"]');
      if(clientTd) {
        clientTd.onclick = () => makeOrderClientEditable(clientTd, o);
      }

      tb.appendChild(tr);
    }
  }

  // Open modal for loading cutting layout for order
  async function openLoadCuttingModal(order) {
    if (!order || !order.id) {
      toast("❌ Ошибка: не указан заказ");
      return;
    }
    
    try {
      // Helper для экранирования HTML (используем window.esc если доступен, иначе локальную функцию)
      const esc = window.esc || ((str) => {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      });
      
      console.log("Loading cutting layouts for order:", order.id);
      
      // Загружаем все сохраненные раскрои
      const layouts = await api("/api/cutting/layouts");
      console.log("Loaded layouts:", layouts);
      
      // Фильтруем: показываем все раскрои + те, что уже привязаны к этому заказу
      const availableLayouts = layouts.filter(l => !l.order_id || l.order_id === order.id);
      console.log("Available layouts:", availableLayouts);
      
      // Удаляем предыдущее модальное окно, если оно существует
      const existingModal = document.querySelector('.modal[data-cutting-modal]');
      if (existingModal) {
        existingModal.remove();
      }
      
      const modal = document.createElement("div");
      modal.className = "modal show";
      modal.setAttribute("data-cutting-modal", "true");
      modal.innerHTML = `
        <div class="modal-content" style="max-width:800px;max-height:90vh;overflow-y:auto">
          <div class="card">
            <h3>✂️ Загрузка раскроя для заказа: ${esc(order.id)}</h3>
            <div class="hint" style="margin-bottom:15px">
              Выберите сохраненный раскрой для привязки к этому заказу
            </div>
            
            ${availableLayouts.length === 0 ? `
              <div class="hint" style="text-align:center;padding:20px;color:var(--muted)">
                Нет сохраненных раскроев. Создайте раскрой в разделе "Крой" и сохраните его.
              </div>
            ` : `
              <div class="list" id="cuttingLayoutsList" style="max-height:400px;overflow-y:auto"></div>
            `}
            
            <div class="row" style="margin-top:15px;justify-content:flex-end;gap:10px">
              <button class="btn ghost" id="closeCuttingModal">Закрыть</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      const closeBtn = modal.querySelector("#closeCuttingModal");
      closeBtn.onclick = () => {
        document.body.removeChild(modal);
      };
      
      modal.onclick = (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
        }
      };
      
      // Рендерим список раскроев
      if (availableLayouts.length > 0) {
        renderCuttingLayoutsList(modal.querySelector("#cuttingLayoutsList"), availableLayouts, order);
      }
    } catch (e) {
      console.error("Error loading cutting layouts:", e);
      toast("❌ Ошибка загрузки раскроев: " + (e.message || String(e)));
    }
  }

  // Render cutting layouts list for selection
  function renderCuttingLayoutsList(container, layouts, order) {
    if (!container) return;
    
    // Helper для экранирования HTML (используем window.esc если доступен, иначе локальную функцию)
    const esc = window.esc || ((str) => {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    });
    
    container.innerHTML = layouts.map(layout => {
      const layoutData = layout.layout_data_json ? (typeof layout.layout_data_json === 'string' ? JSON.parse(layout.layout_data_json) : layout.layout_data_json) : {};
      const pieceWidth = layout.piece_width_mm || layout.box_width_mm || layoutData.pieceWidth || 0;
      const pieceLength = layout.piece_length_mm || layout.box_length_mm || layoutData.pieceLength || 0;
      const isLinked = layout.order_id === order.id;
      const linkedClass = isLinked ? "ok" : "neutral";
      
      return `
        <div class="card" style="padding:12px;margin-bottom:10px;border:2px solid ${isLinked ? 'var(--success)' : 'var(--border)'};${isLinked ? 'background:rgba(46,204,113,0.05)' : ''}">
          <div class="row" style="justify-content:space-between;align-items:start;margin-bottom:8px">
            <div style="flex:1">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px">
                ${layout.material_name || 'Материал'} | Лист: ${layout.sheet_width_mm}×${layout.sheet_length_mm}мм
              </div>
              <div style="font-size:11px;color:var(--muted);margin-bottom:4px">
                Заготовка: ${pieceWidth}×${pieceLength}мм | Заготовок: ${layout.pieces_count || 0} | Отходы: ${layout.waste_percent || 0}%
              </div>
              <div style="font-size:10px;color:var(--muted)">
                Создан: ${new Date(layout.created_at).toLocaleString('ru-RU')}
                ${layout.order_id ? ` | Привязан к заказу: ${layout.order_id}` : ''}
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              ${isLinked ? '<span class="pill ok" style="font-size:11px;padding:4px 8px">✓ Привязан</span>' : ''}
              <button class="btn ${isLinked ? 'ghost' : 'accent'}" data-layout-id="${layout.id}" style="padding:6px 12px;font-size:12px">
                ${isLinked ? 'Отвязать' : 'Привязать'}
              </button>
              <button class="btn ghost" data-layout-id="${layout.id}" data-action="preview" style="padding:6px 12px;font-size:12px" title="Превью">
                👁️
              </button>
            </div>
          </div>
          ${layout.layout_svg ? `
            <div style="margin-top:8px;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:#fff">
              <div style="padding:4px;background:var(--bg-secondary);font-size:10px;font-weight:600;text-align:center">
                Схема раскроя
              </div>
              <div style="max-height:200px;overflow:auto;text-align:center">${layout.layout_svg}</div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
    
    // Обработчики кнопок
    container.querySelectorAll('button[data-layout-id]').forEach(btn => {
      btn.onclick = async () => {
        const layoutId = btn.dataset.layoutId;
        const action = btn.dataset.action;
        
        if (action === 'preview') {
          // Открываем превью в отдельном окне
          const layout = layouts.find(l => l.id === layoutId);
          if (layout && layout.layout_svg) {
            const esc = window.esc || ((str) => {
              if (!str) return '';
              return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            });
            
            const previewWindow = window.open('', '_blank', 'width=900,height=700');
            if (previewWindow) {
              previewWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <title>Превью раскроя</title>
                  <style>
                    body { margin: 0; padding: 20px; font-family: sans-serif; background: #f5f5f5; }
                    .header { margin-bottom: 20px; }
                    .header h2 { margin: 0 0 10px 0; }
                    .info { color: #666; font-size: 14px; }
                  </style>
                </head>
                <body>
                  <div class="header">
                    <h2>✂️ Превью раскроя</h2>
                    <div class="info">
                      Материал: ${esc(layout.material_name || '')} | Лист: ${layout.sheet_width_mm}×${layout.sheet_length_mm}мм<br>
                      Заготовок: ${layout.pieces_count || 0} | Отходы: ${layout.waste_percent || 0}%
                    </div>
                  </div>
                  <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:15px">
                    ${layout.layout_svg}
                  </div>
                </body>
                </html>
              `);
              previewWindow.document.close();
            } else {
              alert("Разрешите всплывающие окна для превью");
            }
          }
          return;
        }
        
        const layout = layouts.find(l => l.id === layoutId);
        const isLinked = layout.order_id === order.id;
        
        try {
          if (isLinked) {
            // Отвязываем раскрой от заказа
            await api(`/api/cutting/layouts/${layoutId}/order`, {
              method: "PUT",
              body: JSON.stringify({ order_id: null })
            });
            toast("✅ Раскрой отвязан от заказа");
          } else {
            // Привязываем раскрой к заказу
            await api(`/api/cutting/layouts/${layoutId}/order`, {
              method: "PUT",
              body: JSON.stringify({ order_id: order.id })
            });
            toast("✅ Раскрой привязан к заказу");
          }
          
          // Обновляем список
          await refreshAll(false);
          const updatedLayouts = await api("/api/cutting/layouts");
          const availableLayouts = updatedLayouts.filter(l => !l.order_id || l.order_id === order.id);
          renderCuttingLayoutsList(container, availableLayouts, order);
        } catch (e) {
          console.error("Error updating layout order:", e);
          toast("❌ Ошибка: " + (e.message || String(e)));
        }
      };
    });
  }
  
  window.openLoadCuttingModal = openLoadCuttingModal;
  
  function renderOrderItems() {
    const tb = $("orderItemsT");
    if(!tb) return;
    const orderId = state.activeOrderId || "";
    tb.innerHTML = "";

    if(!currentUser || currentUser.role !== "admin") {
      tb.innerHTML = `<tr><td colspan="5" style="padding:14px;color:var(--muted)">Только для администратора</td></tr>`;
      return;
    }
    if(!orderId) {
      tb.innerHTML = `<tr><td colspan="5" style="padding:14px;color:var(--muted)">Нет активного заказа</td></tr>`;
      return;
    }
    const items = Array.isArray(state.orderItemsByOrder?.[orderId]) 
      ? state.orderItemsByOrder[orderId].slice() : [];
    if(items.length === 0) {
      tb.innerHTML = `<tr><td colspan="5" style="padding:14px;color:var(--muted)">Добавьте изделие выше</td></tr>`;
      return;
    }

    for(const it of items) {
      const tr = document.createElement("tr");
      const status = it.status || "Открыто";
      tr.innerHTML = `
        <td><b>${esc(it.type || "")}</b></td>
        <td>${esc(it.title || "")}</td>
        <td class="mono" style="font-weight:800">${esc(String(it.qty_plan || 0))}</td>
        <td>${esc(status)}${it.closed_at ? ` <span class="hint">(${esc(String(it.closed_at).slice(0, 19))})</span>` : ""}</td>
        <td class="row" style="gap:6px;flex-wrap:wrap;white-space:nowrap;min-width:300px">
          <button class="btn ghost" data-a="bom" style="padding:6px 8px;font-size:12px" title="Рецептура">📦</button>
          <button class="btn ghost" data-a="cutting" style="padding:6px 8px;font-size:12px" title="Раскрой">✂️</button>
          <button class="btn ghost" data-a="barcode" style="padding:6px 8px;font-size:12px" title="Печать">🖨</button>
          <button class="btn ghost" data-a="edit" style="padding:6px 8px;font-size:12px" title="Редактировать">✏️</button>
          ${["closed", "выполнено"].includes(String(status).toLowerCase())
            ? `<button class="btn ghost danger" data-a="reopen" style="padding:6px 8px;font-size:12px" title="Открыть">↩︎</button>` 
            : `<button class="btn accent" data-a="close" style="padding:6px 8px;font-size:12px" title="Закрыть">✅</button>`}
          <button class="btn danger" data-a="del" style="padding:6px 12px;font-size:12px;font-weight:600;min-width:100px" title="Удалить изделие">🗑 Удалить</button>
        </td>
      `;
      
      tr.querySelector('[data-a="edit"]').onclick = async () => {
        const type = prompt("Тип изделия (Коробка/Крышка/Ложемент):", it.type || "");
        if(type === null) return;
        const title = prompt("Название (необязательно):", it.title || "");
        if(title === null) return;
        const qty = prompt("План (шт):", String(it.qty_plan || 0));
        if(qty === null) return;
        const qty_plan = parseInt(qty, 10);
        if(isNaN(qty_plan) || qty_plan < 0) { alert("Введите число"); return; }
        try {
          await api("/api/order-items/" + encodeURIComponent(it.id), {
            method: "PUT",
            body: JSON.stringify({ type: type.trim(), title: title.trim(), qty_plan })
          });
          await refreshAll(false);
          toast("Изделие обновлено");
        } catch(e) { alert("Ошибка: " + e.message); }
      };
      
      const delBtn = tr.querySelector('[data-a="del"]');
      if(delBtn) {
        delBtn.onclick = async () => {
          const itemName = `${it.type}${it.title ? ' "' + it.title + '"' : ''}`;
          if(!confirm(`Удалить изделие "${itemName}"?\n\nВнимание: все связанные операции отвяжутся от этого изделия, но не будут удалены.`)) return;
          try {
            await api("/api/order-items/" + encodeURIComponent(it.id), { method: "DELETE" });
            await refreshAll(false);
            renderOrderItems(); // Обновляем таблицу изделий
            toast("✅ Изделие удалено");
          } catch(e) { 
            console.error("Ошибка удаления изделия:", e);
            alert("Ошибка удаления: " + (e.message || String(e))); 
          }
        };
      }
      
      tr.querySelector('[data-a="bom"]').onclick = () => openItemBomModal(it);
      tr.querySelector('[data-a="cutting"]').onclick = () => openItemCuttingModal(it, orderId);
      tr.querySelector('[data-a="barcode"]').onclick = () => openItemBarcodeModal(it, orderId);
      
      const closeBtn = tr.querySelector('[data-a="close"]');
      if(closeBtn) {
        closeBtn.onclick = async () => {
          if(!confirm(`Закрыть изделие "${it.type}" и выполнить списание материалов + приход продукции?\nОперации при этом не закрываются автоматически.`)) return;
          try {
            await api("/api/order-items/" + encodeURIComponent(it.id) + "/close", { method: "POST" });
            await refreshAll(false);
            toast("Изделие закрыто");
          } catch(e) {
            alert("Ошибка закрытия: " + e.message);
          }
        };
      }
      
      const reopenBtn = tr.querySelector('[data-a="reopen"]');
      if(reopenBtn) {
        reopenBtn.onclick = async () => {
          if(!confirm("Открыть изделие назад? Будет выполнен откат списания/прихода.")) return;
          try {
            await api("/api/order-items/" + encodeURIComponent(it.id) + "/reopen", { method: "POST" });
            await refreshAll(false);
            toast("Изделие снова открыто");
          } catch(e) {
            alert("Ошибка: " + e.message);
          }
        };
      }
      
      tb.appendChild(tr);
    }
  }
  
  // Модальное окно для прикрепления раскроя к изделию
  async function openItemCuttingModal(item, orderId) {
    if(!currentUser || currentUser.role !== "admin"){
      toast("Только для администратора");
      return;
    }
    
    // Helper для экранирования HTML
    const esc = window.esc || ((str) => {
      if(str == null) return "";
      return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    });
    
    try {
      // Загружаем все сохраненные раскрои
      const allLayouts = await api("/api/cutting/layouts");
      const availableLayouts = Array.isArray(allLayouts) ? allLayouts : [];
      
      // Загружаем раскрой, прикрепленный к этому изделию
      const itemLayouts = availableLayouts.filter(l => l.order_item_id === item.id);
      const currentLayout = itemLayouts.length > 0 ? itemLayouts[0] : null;
      
      const modal = document.createElement("div");
      modal.className = "modal";
      modal.innerHTML = `
        <div class="modal-content" style="max-width:700px;width:100%">
          <div class="modal-header">
            <h3 style="margin:0">✂️ Раскрой для изделия</h3>
            <button class="modal-close" data-a="close">×</button>
          </div>
          <div class="modal-body" style="padding:20px">
            <div class="hint" style="margin-bottom:12px">
              <b>${esc(item.type || "")}</b> ${item.title ? `· ${esc(item.title)}` : ""} · План: ${item.qty_plan || 0} шт
            </div>
            
            ${currentLayout ? `
              <div class="card" style="margin-bottom:16px;background:rgba(0,207,181,.08);border-color:var(--accent)">
                <div style="font-weight:700;margin-bottom:8px">📎 Прикрепленный раскрой:</div>
                <div style="font-size:13px;line-height:1.6">
                  <div><b>Материал:</b> ${esc(currentLayout.material_name || '')}</div>
                  <div><b>Лист:</b> ${currentLayout.sheet_width_mm}×${currentLayout.sheet_length_mm}мм</div>
                  <div><b>Заготовок:</b> ${currentLayout.pieces_count || 0} | <b>Отходы:</b> ${currentLayout.waste_percent || 0}%</div>
                </div>
                <button class="btn ghost danger" data-a="unlink" style="margin-top:10px">Отвязать раскрой</button>
              </div>
            ` : `
              <div class="hint" style="margin-bottom:16px;padding:12px;background:rgba(255,176,32,.1);border-radius:6px">
                К этому изделию не прикреплен раскрой. Выберите раскрой из списка ниже.
              </div>
            `}
            
            <div style="margin-bottom:12px;font-weight:700">Выберите раскрой:</div>
            ${availableLayouts.length === 0 ? `
              <div class="hint" style="text-align:center;padding:20px;color:var(--muted)">
                Нет сохраненных раскроев. Создайте раскрой в разделе "Крой" и сохраните его.
              </div>
            ` : `
              <div class="list" id="itemCuttingLayoutsList" style="max-height:400px;overflow-y:auto"></div>
            `}
            
            <div class="row" style="margin-top:15px;justify-content:flex-end;gap:10px">
              <button class="btn ghost" data-a="close">Закрыть</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      setTimeout(() => modal.classList.add("show"), 10);
      
      const close = () => {
        modal.classList.remove("show");
        setTimeout(() => modal.remove(), 200);
      };
      
      modal.querySelector('[data-a="close"]').onclick = close;
      modal.onclick = (e) => { if(e.target === modal) close(); };
      
      // Отвязать раскрой
      if(currentLayout) {
        const unlinkBtn = modal.querySelector('[data-a="unlink"]');
        if(unlinkBtn) {
          unlinkBtn.onclick = async () => {
            if(!confirm("Отвязать раскрой от этого изделия?")) return;
            try {
              await api(`/api/cutting/layouts/${currentLayout.id}/order-item`, {
                method: "PUT",
                body: JSON.stringify({ order_item_id: null })
              });
              await refreshAll(false);
              renderOrderItems();
              toast("✅ Раскрой отвязан");
              close();
            } catch(e) {
              alert("Ошибка: " + e.message);
            }
          };
        }
      }
      
      // Рендерим список раскроев
      if(availableLayouts.length > 0) {
        const listEl = modal.querySelector("#itemCuttingLayoutsList");
        renderItemCuttingLayoutsList(listEl, availableLayouts, item, currentLayout, esc);
      }
      
    } catch(e) {
      console.error("Ошибка загрузки раскроев:", e);
      alert("Ошибка: " + e.message);
    }
  }
  
  // Рендеринг списка раскроев для выбора для изделия
  function renderItemCuttingLayoutsList(container, layouts, item, currentLayout, esc) {
    container.innerHTML = "";
    
    for(const layout of layouts) {
      const isLinked = layout.order_item_id === item.id;
      const isLinkedToOther = layout.order_item_id && layout.order_item_id !== item.id;
      
      const card = document.createElement("div");
      card.className = "card";
      card.style.cssText = `margin-bottom:10px;padding:12px;${isLinked ? 'background:rgba(0,207,181,.1);border-color:var(--accent);' : ''}`;
      
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div style="flex:1">
            <div style="font-weight:700;margin-bottom:6px">
              ${isLinked ? '📎 ' : ''}${esc(layout.material_name || 'Без названия')}
            </div>
            <div style="font-size:12px;color:var(--muted);line-height:1.5">
              Лист: ${layout.sheet_width_mm}×${layout.sheet_length_mm}мм<br>
              Заготовок: ${layout.pieces_count || 0} | Отходы: ${layout.waste_percent || 0}%
            </div>
            ${isLinkedToOther ? `<div style="margin-top:6px;font-size:11px;color:#ff4d4d">⚠️ Прикреплен к другому изделию</div>` : ''}
          </div>
          <div class="row" style="gap:6px;flex-wrap:nowrap">
            <button class="btn ghost" data-a="preview" style="padding:6px 10px;font-size:12px" title="Превью">👁</button>
            ${isLinked 
              ? `<button class="btn accent" disabled style="padding:6px 10px;font-size:12px">Прикреплен</button>`
              : `<button class="btn accent" data-a="link" style="padding:6px 10px;font-size:12px">Прикрепить</button>`
            }
          </div>
        </div>
      `;
      
      // Превью
      card.querySelector('[data-a="preview"]').onclick = () => {
        const previewWindow = window.open('', '_blank', 'width=900,height=700');
        if (previewWindow) {
          previewWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Превью раскроя</title>
              <style>
                body { margin: 0; padding: 20px; font-family: sans-serif; background: #f5f5f5; }
                .header { margin-bottom: 20px; }
                .header h2 { margin: 0 0 10px 0; }
                .info { color: #666; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="header">
                <h2>✂️ Превью раскроя</h2>
                <div class="info">
                  Материал: ${esc(layout.material_name || '')} | Лист: ${layout.sheet_width_mm}×${layout.sheet_length_mm}мм<br>
                  Заготовок: ${layout.pieces_count || 0} | Отходы: ${layout.waste_percent || 0}%
                </div>
              </div>
              <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:15px">
                ${layout.layout_svg || ''}
              </div>
            </body>
            </html>
          `);
          previewWindow.document.close();
        }
      };
      
      // Прикрепить
      if(!isLinked) {
        const linkBtn = card.querySelector('[data-a="link"]');
        if(linkBtn) {
          linkBtn.onclick = async () => {
            if(isLinkedToOther && !confirm("Этот раскрой прикреплен к другому изделию. Прикрепить к этому изделию?")) {
              return;
            }
            try {
              await api(`/api/cutting/layouts/${layout.id}/order-item`, {
                method: "PUT",
                body: JSON.stringify({ order_item_id: item.id })
              });
              await refreshAll(false);
              renderOrderItems();
              toast("✅ Раскрой прикреплен к изделию");
              // Закрываем модальное окно
              const modal = container.closest('.modal');
              if(modal) {
                modal.classList.remove("show");
                setTimeout(() => modal.remove(), 200);
              }
            } catch(e) {
              alert("Ошибка: " + e.message);
            }
          };
        }
      }
      
      container.appendChild(card);
    }
  }
  
  // --- Client Editing ---
  
  async function makeOrderClientEditable(td, order) {
    if(!td || !order) return;
    if(td.classList.contains("editing")) return;
    td.classList.add("editing");

    const cur = String(order.client || "");
    const sel = document.createElement("select");
    sel.style.width = "100%";
    sel.style.minWidth = "140px";

    const clients = getClientNames();
    const values = [...new Set([cur, ...clients].filter(Boolean))];
    for(const c of values) {
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

    const finish = (text) => {
      td.classList.remove("editing");
      td.textContent = text ?? (order.client || "");
    };

    const save = async () => {
      let newVal = sel.value;
      if(newVal === "__new__") {
        const v = prompt("Введите имя нового клиента:", cur);
        if(v === null) {
          finish(cur);
          return;
        }
        newVal = String(v || "").trim();
        if(!newVal) {
          finish(cur);
          return;
        }
      }

      if(String(newVal) === cur) {
        finish(cur);
        return;
      }

      try {
        await api("/api/orders/" + encodeURIComponent(order.id), {
          method: "PUT",
          body: JSON.stringify({ ...order, client: newVal })
        });
        finish(newVal);
        await refreshAll(false);
        toast("Клиент обновлён");
      } catch(e) {
        finish(cur);
        alert("Ошибка обновления клиента: " + e.message);
      }
    };

    sel.onchange = save;
    sel.onblur = save;
  }
  
  // --- Duplicate Order ---
  
  function suggestDuplicateOrderId(baseId) {
    const id = String(baseId || "").trim();
    if(!id) return "COPY-0001";
    const exists = new Set((state.orders || []).map(o => String(o.id || "")));
    if(!exists.has(id + "-копия")) return id + "-копия";
    for(let n = 2; n <= 999; n++) {
      const cand = `${id}-копия-${n}`;
      if(!exists.has(cand)) return cand;
    }
    return `${id}-копия-${Date.now()}`;
  }
  
  async function duplicateOrder(o) {
    try {
      const suggested = suggestDuplicateOrderId(o.id);
      const newId = prompt("Новый ID для дубликата заказа:", suggested);
      if(!newId || !newId.trim()) return;
      const id = newId.trim();
      if(state.orders.find(x => x.id === id)) {
        alert("Заказ с таким ID уже существует");
        return;
      }

      const payload = {
        id,
        client: (o.client || "").trim(),
        product: (o.product || "").trim(),
        size: (o.size || "").trim(),
        material: (o.material || "").trim(),
        qty: +o.qty || 0,
        notes: (o.notes || "").trim(),
        status: (o.status || "Запланировано")
      };

      await api("/api/orders", { method: "POST", body: JSON.stringify(payload) });
      await refreshAll(false);
      state.activeOrderId = id;
      renderAll();
      toast("Заказ продублирован: " + id);
    } catch(e) {
      alert("Ошибка дублирования: " + e.message);
    }
  }
  
  // --- Order Edit Modal ---
  
  function ensureOrderEditModal() {
    const modal = $("orderEditModal");
    if(!modal || modal.dataset.ready === "1") return;
    modal.dataset.ready = "1";

    const close = () => { modal.style.display = "none"; };
    $("orderEditClose").onclick = close;
    $("orderEditCancel").onclick = close;
    modal.addEventListener("click", (e) => { if(e.target === modal) close(); });
    document.addEventListener("keydown", (e) => { 
      if(e.key === "Escape" && modal.style.display !== "none") close(); 
    });
  }
  
  function openOrderEditModal(order) {
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

    $("orderEditSave").onclick = async () => {
      const o = modal._order;
      if(!o) return;
      const requestedId = ($("orderEditNewId").value || "").trim();
      if(!requestedId) {
        alert("ID заказа не может быть пустым");
        return;
      }
      const client = ($("orderEditClient").value || "").trim();
      const product = ($("orderEditProduct").value || "").trim();
      const qty = +($("orderEditQty").value || 0);
      const status = $("orderEditStatus").value || "Запланировано";

      try {
        let targetId = o.id;
        if(requestedId !== o.id) {
          await api("/api/orders/" + encodeURIComponent(o.id) + "/rename", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newId: requestedId })
          });
          targetId = requestedId;
        }

        await api("/api/orders/" + encodeURIComponent(targetId), {
          method: "PUT",
          body: JSON.stringify({ ...o, id: targetId, client, product, qty: isFinite(qty) ? qty : 0, status })
        });
        modal.style.display = "none";
        await refreshAll(false);
        if(state.activeOrderId === o.id) state.activeOrderId = targetId;
        toast("Заказ обновлён");
      } catch(e) {
        alert("Ошибка обновления: " + e.message);
      }
    };
  }
  
  // --- Expose Functions Globally ---
  
  window.renderSelectors = renderSelectors;
  window.getClientNames = getClientNames;
  window.renderClientDatalist = renderClientDatalist;
  window.renderKPIs = renderKPIs;
  window.renderOrders = renderOrders;
  window.renderOrderItems = renderOrderItems;
  window.makeOrderClientEditable = makeOrderClientEditable;
  window.suggestDuplicateOrderId = suggestDuplicateOrderId;
  window.duplicateOrder = duplicateOrder;
  window.ensureOrderEditModal = ensureOrderEditModal;
  window.openOrderEditModal = openOrderEditModal;
  
  // Module export
  window.OrdersModule = {
    loaded: true,
    renderSelectors,
    renderOrders,
    renderOrderItems,
    renderKPIs
  };
  
  // Инициализируем изменение размера столбцов после рендеринга
  setTimeout(() => {
    const ordersTable = $("ordersT");
    if (ordersTable && ordersTable.closest('.resizable-table')) {
      if(typeof initTableColumnResize === 'function'){
        initTableColumnResize(ordersTable.closest('.resizable-table'));
      }
    }
    const orderItemsTable = $("orderItemsT");
    if (orderItemsTable && orderItemsTable.closest('.resizable-table')) {
      if(typeof initTableColumnResize === 'function'){
        initTableColumnResize(orderItemsTable.closest('.resizable-table'));
      }
    }
  }, 50);
  
  console.log('Orders module loaded successfully');
  
})();

/**
 * B'BOX Production - Warehouse Module
 * Модуль управления складом: материалы и готовая продукция
 */

(function() {
  'use strict';
  
  if (window.WarehouseModule && window.WarehouseModule.loaded) {
    console.log('Warehouse module already loaded');
    return;
  }
  
  console.log('Loading Warehouse module...');
  
  // Helper: escape HTML
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  // Helper: get element by ID
  function $(id) {
    return document.getElementById(id);
  }
  
  // Helper: API call
// Read-through catalog only; mutation responses are handled once without write retries.
const api = async (path, options = {}) => {
  const owner = window.currentUser;
  const result = options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())
    ? await window.ApiClient.request(path, options)
    : await window.CatalogState.read(path);
  if (owner !== window.currentUser) throw Object.assign(new Error('Сеанс изменился.'), { name: 'AbortError' });
  return result;
};
  let renderGeneration = 0;

  const displayQuantity = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const displayPrice = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(Number(value) || 0);

  const WarehouseModule = {
    loaded: true,
    currentView: 'materials', // 'materials' | 'products' | 'movements'
    
    async init() {
      console.log('Warehouse module initialized');
      await this.render();
    },
    
    async render() {
      const container = $('warehouse');
      if (!container) return;
      
      container.innerHTML = `
        <div style="margin:10px">
          <div class="card" style="margin-bottom:10px">
            <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
              <button class="btn ${this.currentView === 'materials' ? 'accent' : 'ghost'}" data-view="materials">📦 Материалы</button>
              <button class="btn ${this.currentView === 'products' ? 'accent' : 'ghost'}" data-view="products">✅ Готовая продукция</button>
              <button class="btn ${this.currentView === 'movements' ? 'accent' : 'ghost'}" data-view="movements">📋 Движения</button>
            </div>
          </div>
          
          <div id="warehouseContent"></div>
        </div>
      `;
      
      // Обработчики переключения вкладок
      container.querySelectorAll('[data-view]').forEach(btn => {
        btn.onclick = () => {
          this.currentView = btn.dataset.view;
          this.render();
        };
      });
      
      await this.renderContent();
    },
    
    async renderContent() {
      const content = $('warehouseContent');
      if (!content) return;
      
      switch(this.currentView) {
        case 'materials':
          await this.renderMaterials();
          break;
        case 'products':
          await this.renderProducts();
          break;
        case 'movements':
          await this.renderMovements();
          break;
      }
    },
    
    async renderMaterials() {
      const content = $('warehouseContent');
      if (!content) return;
      const generation = ++renderGeneration, owner = window.currentUser;
      const current = () => generation === renderGeneration && owner === window.currentUser && content.isConnected !== false;
      
      try {
        const materials = await api('/api/warehouse/materials');
        if (!current()) return;
        
        content.innerHTML = `
          <div class="card">
            <h3>📦 Материалы на складе</h3>
            <div style="overflow:auto;margin-top:10px">
              <table class="resizable-table">
                <thead>
                  <tr>
                    <th style="width:200px">Название</th>
                    <th style="width:80px">Единица</th>
                    <th style="width:100px">Остаток</th>
                    <th style="width:80px">Размер (мм)</th>
                    <th style="width:100px">Цена/ед</th>
                    <th style="width:150px">Действия</th>
                  </tr>
                </thead>
                <tbody id="warehouseMaterialsT"></tbody>
              </table>
            </div>
          </div>
        `;
        
        const tb = $('warehouseMaterialsT');
        if (!tb) return;
        
        if (materials.length === 0) {
          tb.innerHTML = '<tr><td colspan="6" style="padding:14px;color:var(--muted);text-align:center">Нет материалов</td></tr>';
          return;
        }
        
        for (const m of materials) {
          const tr = document.createElement('tr');
          const size = [m.length_mm, m.width_mm, m.thickness_mm].filter(v => v > 0).join('×') || '—';
          tr.innerHTML = `
            <td><b>${esc(m.name || '')}</b></td>
            <td>${esc(m.unit || '')}</td>
            <td class="mono" style="font-weight:800;color:${(m.stock || 0) > 0 ? 'var(--good)' : 'var(--bad)'}">${esc(displayQuantity(m.stock))}</td>
            <td style="font-size:11px;color:var(--muted)">${esc(size)}</td>
            <td class="mono">${esc(displayPrice(m.price_per_unit))}</td>
            <td>
              <button class="btn ghost" data-a="adjust" style="padding:4px 8px;font-size:11px" title="Корректировать">✏️</button>
            </td>
          `;
          
          tr.querySelector('[data-a="adjust"]').onclick = () => {
            const newStock = prompt(`Текущий остаток: ${m.stock || 0}\nНовый остаток:`, String(m.stock || 0));
            if (newStock === null) return;
            const stock = parseFloat(newStock);
            if (isNaN(stock)) { alert('Введите число'); return; }
            this.adjustMaterialStock(m.id, stock);
          };
          
          tb.appendChild(tr);
        }
        
        // Инициализация изменения размера колонок
        setTimeout(() => {
          const table = tb.closest('.resizable-table');
          if (table && typeof window.initTableColumnResize === 'function') {
            window.initTableColumnResize(table);
          }
        }, 50);
        
      } catch (e) {
        if (!current()) return;
        console.error('Error loading materials:', e);
        content.innerHTML = `<div class="card"><div style="padding:14px;color:var(--bad)">Ошибка загрузки материалов: ${esc(e.message || String(e))}</div></div>`;
      }
    },
    
    async renderProducts() {
      const content = $('warehouseContent');
      if (!content) return;
      const generation = ++renderGeneration, owner = window.currentUser;
      const current = () => generation === renderGeneration && owner === window.currentUser && content.isConnected !== false;
      
      try {
        const products = await api('/api/warehouse/products');
        if (!current()) return;
        
        content.innerHTML = `
          <div class="card" style="margin-bottom:10px">
            <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
              <div class="field" style="min-width:150px">
                <label>Тип</label>
                <select id="new_product_type">
                  <option value="">Выберите тип</option>
                  <option value="Коробка">Коробка</option>
                  <option value="Крышка">Крышка</option>
                  <option value="Ложемент">Ложемент</option>
                </select>
              </div>
              <div class="field" style="min-width:200px;flex:1">
                <label>Название (необязательно)</label>
                <input id="new_product_title" placeholder="Например: Коробка (верх)">
              </div>
              <div class="field" style="min-width:100px">
                <label>Количество</label>
                <input id="new_product_qty" type="number" min="0" step="1" placeholder="100">
              </div>
              <button class="btn accent" id="addWarehouseProduct">+ Добавить продукцию</button>
            </div>
          </div>
          
          <div class="card">
            <h3>✅ Готовая продукция на складе</h3>
            <div style="overflow:auto;margin-top:10px">
              <table class="resizable-table">
                <thead>
                  <tr>
                    <th style="width:150px">Тип</th>
                    <th style="width:200px">Название</th>
                    <th style="width:100px">Остаток</th>
                    <th style="width:150px">Заказ</th>
                    <th style="width:100px">Статус</th>
                    <th style="width:200px">Действия</th>
                  </tr>
                </thead>
                <tbody id="warehouseProductsT"></tbody>
              </table>
            </div>
          </div>
        `;
        
        // Обработчик добавления продукции
        $('addWarehouseProduct').onclick = async () => {
          const type = $('new_product_type').value.trim();
          const title = $('new_product_title').value.trim();
          const qty = parseInt($('new_product_qty').value, 10) || 0;
          
          if (!type || qty <= 0) {
            alert('Заполните тип и количество');
            return;
          }
          
          try {
            await api('/api/warehouse/products', {
              method: 'POST',
              body: JSON.stringify({ type, title, qty, reason: 'Ручной приход' })
            });
            await this.renderProducts();
            if (window.toast) window.toast('✅ Продукция добавлена на склад');
          } catch (e) {
        if (!current()) return;
            alert('Ошибка: ' + (e.message || String(e)));
          }
        };
        
        const tb = $('warehouseProductsT');
        if (!tb) return;
        
        if (products.length === 0) {
          tb.innerHTML = '<tr><td colspan="6" style="padding:14px;color:var(--muted);text-align:center">Нет готовой продукции на складе</td></tr>';
          return;
        }
        
        for (const p of products) {
          const tr = document.createElement('tr');
          const balance = (p.balance || 0);
          tr.innerHTML = `
            <td><b>${esc(p.type || '')}</b></td>
            <td>${esc(p.title || '')}</td>
            <td class="mono" style="font-weight:800;color:${balance > 0 ? 'var(--good)' : 'var(--bad)'}">${esc(String(balance))}</td>
            <td style="font-size:11px;color:var(--muted)">${esc(p.order_name || p.order_client || '—')}</td>
            <td>${esc(p.status || 'available')}</td>
            <td class="row" style="gap:4px;flex-wrap:nowrap">
              <button class="btn ghost" data-a="in" style="padding:4px 8px;font-size:11px" title="Приход">➕</button>
              <button class="btn ghost" data-a="out" style="padding:4px 8px;font-size:11px" title="Расход">➖</button>
              <button class="btn ghost danger" data-a="del" style="padding:4px 8px;font-size:11px" title="Удалить">🗑</button>
            </td>
          `;
          
          tr.querySelector('[data-a="in"]').onclick = () => {
            const qty = prompt('Количество для прихода:', '1');
            if (qty === null) return;
            const q = parseInt(qty, 10);
            if (isNaN(q) || q <= 0) { alert('Введите положительное число'); return; }
            this.createMovement(p.id, 'in', q, 'Ручной приход');
          };
          
          tr.querySelector('[data-a="out"]').onclick = () => {
            const qty = prompt('Количество для расхода:', '1');
            if (qty === null) return;
            const q = parseInt(qty, 10);
            if (isNaN(q) || q <= 0) { alert('Введите положительное число'); return; }
            this.createMovement(p.id, 'out', q, 'Ручной расход');
          };
          
          tr.querySelector('[data-a="del"]').onclick = async () => {
            if (!confirm(`Удалить продукцию "${p.type}${p.title ? ' ' + p.title : ''}"?`)) return;
            try {
              await api(`/api/warehouse/products/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
              await this.renderProducts();
              if (window.toast) window.toast('✅ Продукция удалена');
            } catch (e) {
        if (!current()) return;
              alert('Ошибка: ' + (e.message || String(e)));
            }
          };
          
          tb.appendChild(tr);
        }
        
        // Инициализация изменения размера колонок
        setTimeout(() => {
          const table = tb.closest('.resizable-table');
          if (table && typeof window.initTableColumnResize === 'function') {
            window.initTableColumnResize(table);
          }
        }, 50);
        
      } catch (e) {
        if (!current()) return;
        console.error('Error loading products:', e);
        content.innerHTML = `<div class="card"><div style="padding:14px;color:var(--bad)">Ошибка загрузки продукции: ${esc(e.message || String(e))}</div></div>`;
      }
    },
    
    async renderMovements() {
      const content = $('warehouseContent');
      if (!content) return;
      const generation = ++renderGeneration, owner = window.currentUser;
      const current = () => generation === renderGeneration && owner === window.currentUser && content.isConnected !== false;
      
      try {
        const movements = await api('/api/warehouse/movements?limit=200');
        if (!current()) return;
        
        content.innerHTML = `
          <div class="card">
            <h3>📋 История движений товаров</h3>
            <div style="overflow:auto;margin-top:10px">
              <table class="resizable-table">
                <thead>
                  <tr>
                    <th style="width:150px">Дата</th>
                    <th style="width:100px">Тип</th>
                    <th style="width:150px">Продукция</th>
                    <th style="width:100px">Количество</th>
                    <th style="width:200px">Причина</th>
                    <th style="width:150px">Заказ</th>
                    <th style="width:200px">Примечания</th>
                  </tr>
                </thead>
                <tbody id="warehouseMovementsT"></tbody>
              </table>
            </div>
          </div>
        `;
        
        const tb = $('warehouseMovementsT');
        if (!tb) return;
        
        if (movements.length === 0) {
          tb.innerHTML = '<tr><td colspan="7" style="padding:14px;color:var(--muted);text-align:center">Нет движений</td></tr>';
          return;
        }
        
        for (const m of movements) {
          const tr = document.createElement('tr');
          const date = m.created_at ? new Date(m.created_at).toLocaleString('ru-RU') : '—';
          const typeLabel = m.movement_type === 'in' ? '➕ Приход' : '➖ Расход';
          const typeColor = m.movement_type === 'in' ? 'var(--good)' : 'var(--bad)';
          tr.innerHTML = `
            <td style="font-size:11px;color:var(--muted)">${esc(date)}</td>
            <td style="color:${typeColor};font-weight:600">${esc(typeLabel)}</td>
            <td><b>${esc(m.product_type || '—')}</b> ${esc(m.product_title || '')}</td>
            <td class="mono" style="font-weight:800">${esc(String(m.qty || 0))}</td>
            <td>${esc(m.reason || '—')}</td>
            <td style="font-size:11px;color:var(--muted)">${esc(m.order_name || m.order_client || '—')}</td>
            <td style="font-size:11px;color:var(--muted)">${esc(m.notes || '—')}</td>
          `;
          tb.appendChild(tr);
        }
        
        // Инициализация изменения размера колонок
        setTimeout(() => {
          const table = tb.closest('.resizable-table');
          if (table && typeof window.initTableColumnResize === 'function') {
            window.initTableColumnResize(table);
          }
        }, 50);
        
      } catch (e) {
        if (!current()) return;
        console.error('Error loading movements:', e);
        content.innerHTML = `<div class="card"><div style="padding:14px;color:var(--bad)">Ошибка загрузки движений: ${esc(e.message || String(e))}</div></div>`;
      }
    },
    
    async adjustMaterialStock(materialId, newStock) {
      try {
        const material = await api(`/api/materials/${encodeURIComponent(materialId)}`);
        const currentStock = material.stock || 0;
        await api(`/api/materials/${encodeURIComponent(materialId)}`, {
          method: 'PUT',
          body: JSON.stringify({ ...material, stock: newStock })
        });
        await this.renderMaterials();
        if (window.toast) window.toast(`✅ Остаток материала обновлён: ${currentStock} → ${newStock}`);
      } catch (e) {
        alert('Ошибка: ' + (e.message || String(e)));
      }
    },
    
    async createMovement(productId, type, qty, reason) {
      try {
        await api('/api/warehouse/movements', {
          method: 'POST',
          body: JSON.stringify({ product_id: productId, movement_type: type, qty, reason })
        });
        await this.renderProducts();
        if (window.toast) window.toast(`✅ Движение создано: ${type === 'in' ? 'Приход' : 'Расход'} ${qty} шт`);
      } catch (e) {
        alert('Ошибка: ' + (e.message || String(e)));
      }
    }
  };
  
  window.WarehouseModule = WarehouseModule;
  
  console.log('Warehouse module loaded');
})();

/**
 * B'BOX Production - Clients Module
 * Модуль управления клиентами и статистикой
 */

(function() {
  'use strict';
  
  if (window.ClientsModule && window.ClientsModule.loaded) {
    console.log('Clients module already loaded');
    return;
  }
  
  console.log('Loading Clients module...');
  
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
  const api = window.api || async function(url, options) {
    const response = await (window.PagesClient?.request || fetch)(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {})
      }
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return await response.json();
  };
  
  const ClientsModule = {
    loaded: true,
    currentClient: null,
    clientsList: [],
    currentClientData: null,
    ordersChart: null
  };
  
  // Helper: format duration
  function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0 мин';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} ч ${minutes} мин`;
    }
    return `${minutes} мин`;
  }
  
  // Helper: format date
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('ru-RU', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch (e) {
      return dateStr;
    }
  }
  
  // Helper: format file size
  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
  
  // State for sorting and filtering
  let sortBy = null;
  let sortDir = 'asc';
  let searchFilter = '';
  
  // Render clients list
  async function renderClientsList() {
    const pane = $("clients");
    if (!pane) return;
    
    try {
      const clients = await api("/api/clients");
      ClientsModule.clientsList = clients || [];
      
      // Apply search filter
      let filteredClients = clients || [];
      if (searchFilter) {
        const searchLower = searchFilter.toLowerCase();
        filteredClients = filteredClients.filter(client => 
          (client.name || '').toLowerCase().includes(searchLower)
        );
      }
      
      // Apply sorting
      if (sortBy) {
        filteredClients.sort((a, b) => {
          let valA, valB;
          
          switch (sortBy) {
            case 'name':
              valA = (a.name || '').toLowerCase();
              valB = (b.name || '').toLowerCase();
              return sortDir === 'asc' ? valA.localeCompare(valB, 'ru') : valB.localeCompare(valA, 'ru');
            
            case 'orders':
              valA = a.orders_count || 0;
              valB = b.orders_count || 0;
              return sortDir === 'asc' ? valA - valB : valB - valA;
            
            case 'ops':
              valA = a.ops_count || 0;
              valB = b.ops_count || 0;
              return sortDir === 'asc' ? valA - valB : valB - valA;
            
            case 'layouts':
              valA = a.layouts_count || 0;
              valB = b.layouts_count || 0;
              return sortDir === 'asc' ? valA - valB : valB - valA;
            
            case 'first_order':
              valA = a.first_order ? new Date(a.first_order).getTime() : 0;
              valB = b.first_order ? new Date(b.first_order).getTime() : 0;
              return sortDir === 'asc' ? valA - valB : valB - valA;
            
            case 'last_order':
              valA = a.last_order ? new Date(a.last_order).getTime() : 0;
              valB = b.last_order ? new Date(b.last_order).getTime() : 0;
              return sortDir === 'asc' ? valA - valB : valB - valA;
            
            default:
              return 0;
          }
        });
      }
      
      const html = `
        <div style="padding:20px">
          <div style="margin-bottom:20px">
            <h2 style="margin:0;font-size:24px;font-weight:800">👥 Клиенты</h2>
            <div style="margin-top:8px;color:var(--muted);font-size:14px">
              Всего клиентов: <b>${clients.length}</b>
              ${searchFilter ? ` · Найдено: <b>${filteredClients.length}</b>` : ''}
            </div>
          </div>
          
          <!-- Filters -->
          <div class="card" style="margin-bottom:16px;padding:16px">
            <div class="row" style="gap:12px;flex-wrap:wrap;align-items:flex-end">
              <div class="field" style="flex:1;min-width:200px">
                <label>Поиск по имени</label>
                <input type="text" id="clientsSearch" placeholder="Введите имя клиента..." 
                       value="${esc(searchFilter)}"
                       oninput="ClientsModule.applyFilters()">
              </div>
              <div class="field" style="min-width:120px">
                <label>Сортировка</label>
                <select id="clientsSortBy" onchange="ClientsModule.applyFilters()">
                  <option value="">Без сортировки</option>
                  <option value="name" ${sortBy === 'name' ? 'selected' : ''}>По имени</option>
                  <option value="orders" ${sortBy === 'orders' ? 'selected' : ''}>По заказам</option>
                  <option value="ops" ${sortBy === 'ops' ? 'selected' : ''}>По операциям</option>
                  <option value="layouts" ${sortBy === 'layouts' ? 'selected' : ''}>По раскроям</option>
                  <option value="first_order" ${sortBy === 'first_order' ? 'selected' : ''}>По первой дате</option>
                  <option value="last_order" ${sortBy === 'last_order' ? 'selected' : ''}>По последней дате</option>
                </select>
              </div>
              <div class="field" style="min-width:120px">
                <label>Направление</label>
                <select id="clientsSortDir" onchange="ClientsModule.applyFilters()">
                  <option value="asc" ${sortDir === 'asc' ? 'selected' : ''}>По возрастанию</option>
                  <option value="desc" ${sortDir === 'desc' ? 'selected' : ''}>По убыванию</option>
                </select>
              </div>
              ${searchFilter ? `
                <button class="btn ghost" onclick="ClientsModule.clearFilters()" style="margin-top:18px">
                  Сбросить фильтры
                </button>
              ` : ''}
            </div>
          </div>
          
          <!-- Table -->
          <div class="card" style="overflow:auto">
            ${filteredClients.length === 0 ? `
              <div style="padding:40px;text-align:center;color:var(--muted)">
                <div style="font-size:48px;margin-bottom:16px">👥</div>
                <div style="font-size:18px;margin-bottom:8px">Клиенты не найдены</div>
                <div style="font-size:14px">${searchFilter ? 'Попробуйте изменить фильтры поиска' : 'Создайте заказы, чтобы появились клиенты'}</div>
              </div>
            ` : `
              <table class="resizable-table" id="clientsTable" data-table-key="clients">
                <thead>
                  <tr>
                    <th data-sort="name" style="width:250px;cursor:pointer" 
                        onclick="ClientsModule.sortBy('name')"
                        title="Нажмите для сортировки">
                      Клиент ${sortBy === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
                    </th>
                    <th data-sort="orders" style="width:100px;cursor:pointer;text-align:center" 
                        onclick="ClientsModule.sortBy('orders')"
                        title="Нажмите для сортировки">
                      Заказы ${sortBy === 'orders' ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
                    </th>
                    <th data-sort="ops" style="width:100px;cursor:pointer;text-align:center" 
                        onclick="ClientsModule.sortBy('ops')"
                        title="Нажмите для сортировки">
                      Операции ${sortBy === 'ops' ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
                    </th>
                    <th data-sort="layouts" style="width:100px;cursor:pointer;text-align:center" 
                        onclick="ClientsModule.sortBy('layouts')"
                        title="Нажмите для сортировки">
                      Раскрои ${sortBy === 'layouts' ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
                    </th>
                    <th data-sort="first_order" style="width:120px;cursor:pointer;text-align:center" 
                        onclick="ClientsModule.sortBy('first_order')"
                        title="Нажмите для сортировки">
                      Первый заказ ${sortBy === 'first_order' ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
                    </th>
                    <th data-sort="last_order" style="width:120px;cursor:pointer;text-align:center" 
                        onclick="ClientsModule.sortBy('last_order')"
                        title="Нажмите для сортировки">
                      Последний заказ ${sortBy === 'last_order' ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
                    </th>
                    <th style="width:150px;text-align:center">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredClients.map(client => `
                    <tr style="border-bottom:1px solid var(--border)">
                      <td style="padding:12px;font-weight:600;color:var(--accent)">
                        ${esc(client.name)}
                      </td>
                      <td style="padding:12px;text-align:center">
                        <span style="padding:4px 8px;background:rgba(0,207,181,.1);border-radius:4px;font-weight:600">
                          ${client.orders_count || 0}
                        </span>
                      </td>
                      <td style="padding:12px;text-align:center">
                        <span style="padding:4px 8px;background:rgba(46,204,113,.1);border-radius:4px;font-weight:600">
                          ${client.ops_count || 0}
                        </span>
                      </td>
                      <td style="padding:12px;text-align:center">
                        <span style="padding:4px 8px;background:rgba(255,176,32,.1);border-radius:4px;font-weight:600">
                          ${client.layouts_count || 0}
                        </span>
                      </td>
                      <td style="padding:12px;text-align:center;font-size:12px;color:var(--muted)">
                        ${formatDate(client.first_order)}
                      </td>
                      <td style="padding:12px;text-align:center;font-size:12px;color:var(--muted)">
                        ${formatDate(client.last_order)}
                      </td>
                      <td style="padding:12px;text-align:center">
                        <button class="btn accent" 
                                onclick="ClientsModule.showClientDetails('${esc(client.name)}')"
                                style="padding:6px 12px;font-size:12px">
                          📊 Просмотреть статистику
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>
      `;
      
      pane.innerHTML = html;
      
      // Initialize column resizing
      setTimeout(() => {
        const table = $("clientsTable");
        if (table && typeof initTableColumnResize === 'function') {
          initTableColumnResize(table);
        }
      }, 50);
      
    } catch (e) {
      console.error("Error loading clients:", e);
      pane.innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--bad)">
          <div style="font-size:48px;margin-bottom:16px">❌</div>
          <div style="font-size:18px;margin-bottom:8px">Ошибка загрузки клиентов</div>
          <div style="font-size:14px">${e.message || String(e)}</div>
        </div>
      `;
    }
  }
  
  // Apply filters
  function applyFilters() {
    const searchInput = $("clientsSearch");
    const sortBySelect = $("clientsSortBy");
    const sortDirSelect = $("clientsSortDir");
    
    if (searchInput) searchFilter = searchInput.value.trim();
    if (sortBySelect) sortBy = sortBySelect.value || null;
    if (sortDirSelect) sortDir = sortDirSelect.value || 'asc';
    
    renderClientsList();
  }
  
  // Clear filters
  function clearFilters() {
    searchFilter = '';
    sortBy = null;
    sortDir = 'asc';
    renderClientsList();
  }
  
  // Sort by column
  function sortByColumn(column) {
    if (sortBy === column) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = column;
      sortDir = 'asc';
    }
    renderClientsList();
  }
  
  // Show client details
  async function showClientDetails(clientName) {
    const pane = $("clients");
    if (!pane) return;
    
    ClientsModule.currentClient = clientName;
    
    try {
      pane.innerHTML = `
        <div style="padding:20px">
          <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px">
            <button class="btn ghost" onclick="ClientsModule.renderClientsList()" style="padding:8px 12px">
              ← Назад к списку
            </button>
            <h2 style="margin:0;font-size:24px;font-weight:800">👤 ${esc(clientName)}</h2>
          </div>
          <div id="clientDetailsContent" style="min-height:400px">
            <div style="text-align:center;padding:40px">
              <div class="spinner"></div>
              <div style="margin-top:16px;color:var(--muted)">Загрузка данных...</div>
            </div>
          </div>
        </div>
      `;
      
      const data = await api(`/api/clients/${encodeURIComponent(clientName)}`);
      
      renderClientDetails(data);
    } catch (e) {
      console.error("Error loading client details:", e);
      $("clientDetailsContent").innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--bad)">
          <div style="font-size:48px;margin-bottom:16px">❌</div>
          <div style="font-size:18px;margin-bottom:8px">Ошибка загрузки данных</div>
          <div style="font-size:14px">${e.message || String(e)}</div>
        </div>
      `;
    }
  }
  
  // Render client details
  function renderClientDetails(data) {
    const container = $("clientDetailsContent");
    if (!container) return;
    
    const { stats, orders, operations, layouts, materials, files, timeline } = data;
    
    const html = `
      <!-- Общая статистика -->
      <div style="margin-bottom:32px">
        <h3 style="margin-bottom:16px;font-size:18px;font-weight:800">📊 Общая статистика</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">
          <div class="card" style="padding:16px;background:rgba(0,207,181,.1);border:1px solid rgba(0,207,181,.3)">
            <div style="font-size:11px;color:var(--muted);margin-bottom:6px">Всего заказов</div>
            <div style="font-weight:800;font-size:24px;margin-bottom:4px">${stats.orders.total || 0}</div>
            <div style="font-size:12px;color:var(--muted)">
              Завершено: ${stats.orders.completed || 0} · В работе: ${stats.orders.in_progress || 0}
            </div>
          </div>
          
          <div class="card" style="padding:16px;background:rgba(46,204,113,.1);border:1px solid rgba(46,204,113,.3)">
            <div style="font-size:11px;color:var(--muted);margin-bottom:6px">Всего операций</div>
            <div style="font-weight:800;font-size:24px;margin-bottom:4px">${stats.operations.total || 0}</div>
            <div style="font-size:12px;color:var(--muted)">
              Выполнено: ${stats.operations.completed || 0} · В работе: ${stats.operations.in_progress || 0}
            </div>
          </div>
          
          <div class="card" style="padding:16px;background:rgba(255,176,32,.1);border:1px solid rgba(255,176,32,.3)">
            <div style="font-size:11px;color:var(--muted);margin-bottom:6px">Раскрои</div>
            <div style="font-weight:800;font-size:24px;margin-bottom:4px">${stats.layouts.total || 0}</div>
            <div style="font-size:12px;color:var(--muted)">
              Деталей: ${stats.layouts.total_pieces || 0} · Отходы: ${(stats.layouts.avg_waste || 0).toFixed(1)}%
            </div>
          </div>
          
          <div class="card" style="padding:16px;background:rgba(155,89,182,.1);border:1px solid rgba(155,89,182,.3)">
            <div style="font-size:11px;color:var(--muted);margin-bottom:6px">Общее время</div>
            <div style="font-weight:800;font-size:24px;margin-bottom:4px">${formatDuration(stats.time.total_seconds || 0)}</div>
            <div style="font-size:12px;color:var(--muted)">
              Работа: ${formatDuration(stats.time.total_work_seconds || 0)} · Наладка: ${formatDuration(stats.time.total_setup_seconds || 0)}
            </div>
          </div>
        </div>
      </div>
      
      <!-- Операторы -->
      ${stats.operators && stats.operators.length > 0 ? `
        <div style="margin-bottom:32px">
          <h3 style="margin-bottom:16px;font-size:18px;font-weight:800">👷 Операторы</h3>
          <div class="card" style="padding:16px">
            <table class="resizable-table" style="width:100%;border-collapse:collapse" id="operatorsTable">
              <thead>
                <tr style="border-bottom:2px solid var(--border)">
                  <th style="text-align:left;padding:8px;font-weight:600">Оператор</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Операций</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Время работы</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Время наладки</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Выполнено</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Занятость</th>
                </tr>
              </thead>
              <tbody>
                ${(() => {
                  const totalTime = stats.time.total_seconds || 1; // Избегаем деления на ноль
                  return stats.operators.map(op => {
                    const opTotalTime = (op.total_duration || 0) + (op.total_setup_duration || 0);
                    const occupancyPercent = totalTime > 0 ? ((opTotalTime / totalTime) * 100) : 0;
                    const occupancyColor = occupancyPercent > 50 ? 'var(--good)' : occupancyPercent > 25 ? 'var(--accent)' : 'var(--muted)';
                    return `
                      <tr style="border-bottom:1px solid var(--border)">
                        <td style="padding:8px;font-weight:600">${esc(op.operator || '—')}</td>
                        <td style="padding:8px;text-align:center">${op.ops_count || 0}</td>
                        <td style="padding:8px;text-align:center">${formatDuration(op.total_duration || 0)}</td>
                        <td style="padding:8px;text-align:center">${formatDuration(op.total_setup_duration || 0)}</td>
                        <td style="padding:8px;text-align:center">${op.total_qty_done || 0}</td>
                        <td style="padding:8px;text-align:center">
                          <div style="display:flex;align-items:center;gap:8px;justify-content:center">
                            <div style="flex:1;max-width:100px;height:8px;background:rgba(0,0,0,.1);border-radius:4px;overflow:hidden">
                              <div style="width:${occupancyPercent}%;height:100%;background:${occupancyColor};transition:width 0.3s"></div>
                            </div>
                            <span style="font-weight:600;color:${occupancyColor};min-width:50px;text-align:right">${occupancyPercent.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('');
                })()}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
      
      <!-- Материалы -->
      ${materials && materials.length > 0 ? `
        <div style="margin-bottom:32px">
          <h3 style="margin-bottom:16px;font-size:18px;font-weight:800">📦 Использованные материалы</h3>
          <div class="card" style="padding:16px">
            <table class="resizable-table" style="width:100%;border-collapse:collapse" id="materialsTable">
              <thead>
                <tr style="border-bottom:2px solid var(--border)">
                  <th style="text-align:left;padding:8px;font-weight:600">Материал</th>
                  <th style="text-align:left;padding:8px;font-weight:600">Тип</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Толщина</th>
                  <th style="text-align:right;padding:8px;font-weight:600">Количество</th>
                  <th style="text-align:left;padding:8px;font-weight:600">Единица</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Заказов</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Раскроев</th>
                </tr>
              </thead>
              <tbody>
                ${materials.map(m => {
                  const qty = m.total_qty_used || 0;
                  const unit = m.unit || 'шт';
                  const formattedQty = qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2);
                  return `
                  <tr style="border-bottom:1px solid var(--border)">
                    <td style="padding:8px;font-weight:600">${esc(m.name || '—')}</td>
                    <td style="padding:8px">${esc(m.type || '—')}</td>
                    <td style="padding:8px;text-align:center">${m.thickness_mm ? m.thickness_mm + ' мм' : '—'}</td>
                    <td style="padding:8px;text-align:right;font-weight:600;color:var(--accent)">${formattedQty}</td>
                    <td style="padding:8px;text-align:left;color:var(--muted);font-size:12px">${esc(unit)}</td>
                    <td style="padding:8px;text-align:center">${m.orders_count || 0}</td>
                    <td style="padding:8px;text-align:center">${m.layouts_count || 0}</td>
                  </tr>
                `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
      
      <!-- Заказы -->
      <div style="margin-bottom:32px">
        <h3 style="margin-bottom:16px;font-size:18px;font-weight:800">📋 Заказы (${orders.length})</h3>
        ${orders.length > 2 ? `
          <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <div class="field" style="min-width:150px">
              <label style="font-size:12px">Сортировка</label>
              <select id="clientOrdersSortBy" style="width:100%;padding:6px;font-size:12px" onchange="ClientsModule.sortClientOrders()">
                <option value="date">По дате создания</option>
                <option value="id">По ID</option>
                <option value="qty">По количеству</option>
                <option value="items">По изделиям</option>
                <option value="ops">По операциям</option>
                <option value="status">По статусу</option>
              </select>
            </div>
            <div class="field" style="min-width:120px">
              <label style="font-size:12px">Направление</label>
              <select id="clientOrdersSortDir" style="width:100%;padding:6px;font-size:12px" onchange="ClientsModule.sortClientOrders()">
                <option value="desc">По убыванию</option>
                <option value="asc">По возрастанию</option>
              </select>
            </div>
          </div>
        ` : ''}
        <div class="card" style="padding:16px;max-height:400px;overflow-y:auto">
          ${orders.length > 0 ? `
            <table class="resizable-table" style="width:100%;border-collapse:collapse" id="clientOrdersTable">
              <thead>
                <tr style="border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--bg)">
                  <th style="text-align:left;padding:8px;font-weight:600">ID</th>
                  <th style="text-align:left;padding:8px;font-weight:600">Название</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Кол-во</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Изделий</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Операций</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Статус</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Дата создания</th>
                </tr>
              </thead>
              <tbody id="clientOrdersTbody">
                ${orders.map(order => `
                  <tr style="border-bottom:1px solid var(--border);cursor:pointer" 
                      onclick="switchPane('orders');if(window.OrdersModule)window.OrdersModule.selectOrder('${esc(order.id)}')">
                    <td style="padding:8px;font-family:monospace;font-size:12px">${esc(order.id)}</td>
                    <td style="padding:8px">${esc(order.name || '—')}</td>
                    <td style="padding:8px;text-align:center">${order.qty || 0}</td>
                    <td style="padding:8px;text-align:center">${order.items_count || 0}</td>
                    <td style="padding:8px;text-align:center">${order.ops_count || 0}</td>
                    <td style="padding:8px;text-align:center">
                      <span style="padding:4px 8px;border-radius:4px;font-size:11px;background:${
                        order.status === 'Завершён' ? 'rgba(46,204,113,.2)' :
                        order.status === 'В работе' ? 'rgba(255,176,32,.2)' :
                        'rgba(155,155,155,.2)'
                      }">
                        ${esc(order.status || '—')}
                      </span>
                    </td>
                    <td style="padding:8px;text-align:center;font-size:12px;color:var(--muted)">
                      ${formatDate(order.created_at)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<div style="text-align:center;padding:20px;color:var(--muted)">Заказы не найдены</div>'}
        </div>
      </div>
      
      <!-- График по времени заказов -->
      ${orders.length > 0 ? `
        <div style="margin-bottom:32px">
          <h3 style="margin-bottom:16px;font-size:18px;font-weight:800">📊 График выполнения заказов</h3>
          <div class="card" style="padding:16px">
            <div style="position:relative;height:400px">
              <canvas id="clientOrdersChart"></canvas>
            </div>
          </div>
        </div>
      ` : ''}
      
      <!-- Раскрои -->
      ${layouts && layouts.length > 0 ? `
        <div style="margin-bottom:32px">
          <h3 style="margin-bottom:16px;font-size:18px;font-weight:800">✂️ Раскрои (${layouts.length})</h3>
          <div class="card" style="padding:16px;max-height:400px;overflow-y:auto">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--bg)">
                  <th style="text-align:left;padding:8px;font-weight:600">ID</th>
                  <th style="text-align:left;padding:8px;font-weight:600">Материал</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Лист</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Деталь</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Деталей</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Отходы</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Дата</th>
                </tr>
              </thead>
              <tbody>
                ${layouts.map(layout => `
                  <tr style="border-bottom:1px solid var(--border)">
                    <td style="padding:8px;font-family:monospace;font-size:12px">${esc(layout.id || '—')}</td>
                    <td style="padding:8px">${esc(layout.material_name || '—')}</td>
                    <td style="padding:8px;text-align:center;font-size:12px">
                      ${layout.sheet_width_mm || 0}×${layout.sheet_length_mm || 0} мм
                    </td>
                    <td style="padding:8px;text-align:center;font-size:12px">
                      ${layout.box_width_mm || 0}×${layout.box_length_mm || 0}×${layout.box_height_mm || 0} мм
                    </td>
                    <td style="padding:8px;text-align:center">${layout.pieces_count || 0}</td>
                    <td style="padding:8px;text-align:center">${(layout.waste_percent || 0).toFixed(1)}%</td>
                    <td style="padding:8px;text-align:center;font-size:12px;color:var(--muted)">
                      ${formatDate(layout.created_at)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
      
      <!-- Файлы -->
      ${files && files.length > 0 ? `
        <div style="margin-bottom:32px">
          <h3 style="margin-bottom:16px;font-size:18px;font-weight:800">📎 Загруженные файлы (${files.length})</h3>
          <div class="card" style="padding:16px;max-height:400px;overflow-y:auto">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--bg)">
                  <th style="text-align:left;padding:8px;font-weight:600">Файл</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Размер</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Операция</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Дата</th>
                  <th style="text-align:center;padding:8px;font-weight:600">Действие</th>
                </tr>
              </thead>
              <tbody>
                ${files.map(file => `
                  <tr style="border-bottom:1px solid var(--border)">
                    <td style="padding:8px;font-weight:600">${esc(file.name)}</td>
                    <td style="padding:8px;text-align:center;font-size:12px">${formatFileSize(file.size)}</td>
                    <td style="padding:8px;text-align:center;font-family:monospace;font-size:11px">${esc(file.op_id || '—')}</td>
                    <td style="padding:8px;text-align:center;font-size:12px;color:var(--muted)">
                      ${formatDate(file.modified)}
                    </td>
                    <td style="padding:8px;text-align:center">
                      <a href="${esc(file.path)}" target="_blank" class="btn ghost" style="padding:4px 8px;font-size:11px">
                        Скачать
                      </a>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : '<div style="margin-bottom:32px;padding:20px;text-align:center;color:var(--muted)">Файлы не найдены</div>'}
    `;
    
    container.innerHTML = html;
    
    // Инициализация resizable columns
    setTimeout(() => {
      const materialsTable = $('#materialsTable');
      if (materialsTable && typeof window.initTableColumnResize === 'function') {
        window.initTableColumnResize(materialsTable);
      }
      const operatorsTable = $('#operatorsTable');
      if (operatorsTable && typeof window.initTableColumnResize === 'function') {
        window.initTableColumnResize(operatorsTable);
      }
      const ordersTable = $('#clientOrdersTable');
      if (ordersTable && typeof window.initTableColumnResize === 'function') {
        window.initTableColumnResize(ordersTable);
      }
    }, 50);
    
    // Инициализация графика заказов
    if (orders.length > 0 && window.Chart) {
      setTimeout(() => {
        renderClientOrdersChart(orders, operations);
      }, 100);
    }
  }
  
  // Функция сортировки заказов клиента
  function sortClientOrders() {
    const sortBy = $('#clientOrdersSortBy')?.value || 'date';
    const sortDir = $('#clientOrdersSortDir')?.value || 'desc';
    const tbody = $('#clientOrdersTbody');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const container = $("clientDetailsContent");
    if (!container) return;
    
    // Получаем данные из глобального состояния или из DOM
    const data = ClientsModule.currentClientData;
    if (!data || !data.orders) return;
    
    let sortedOrders = data.orders.slice();
    sortedOrders.sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
        case 'date':
          valA = a.created_at ? new Date(a.created_at).getTime() : 0;
          valB = b.created_at ? new Date(b.created_at).getTime() : 0;
          break;
        case 'id':
          valA = String(a.id || '').toLowerCase();
          valB = String(b.id || '').toLowerCase();
          break;
        case 'qty':
          valA = Number(a.qty || 0) || 0;
          valB = Number(b.qty || 0) || 0;
          break;
        case 'items':
          valA = Number(a.items_count || 0) || 0;
          valB = Number(b.items_count || 0) || 0;
          break;
        case 'ops':
          valA = Number(a.ops_count || 0) || 0;
          valB = Number(b.ops_count || 0) || 0;
          break;
        case 'status':
          valA = String(a.status || '').toLowerCase();
          valB = String(b.status || '').toLowerCase();
          break;
        default:
          return 0;
      }
      
      if (typeof valA === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB, 'ru') : valB.localeCompare(valA, 'ru');
      } else {
        return sortDir === 'asc' ? valA - valB : valB - valA;
      }
    });
    
    // Обновляем таблицу
    tbody.innerHTML = sortedOrders.map(order => `
      <tr style="border-bottom:1px solid var(--border);cursor:pointer" 
          onclick="switchPane('orders');if(window.OrdersModule)window.OrdersModule.selectOrder('${esc(order.id)}')">
        <td style="padding:8px;font-family:monospace;font-size:12px">${esc(order.id)}</td>
        <td style="padding:8px">${esc(order.name || '—')}</td>
        <td style="padding:8px;text-align:center">${order.qty || 0}</td>
        <td style="padding:8px;text-align:center">${order.items_count || 0}</td>
        <td style="padding:8px;text-align:center">${order.ops_count || 0}</td>
        <td style="padding:8px;text-align:center">
          <span style="padding:4px 8px;border-radius:4px;font-size:11px;background:${
            order.status === 'Завершён' ? 'rgba(46,204,113,.2)' :
            order.status === 'В работе' ? 'rgba(255,176,32,.2)' :
            'rgba(155,155,155,.2)'
          }">
            ${esc(order.status || '—')}
          </span>
        </td>
        <td style="padding:8px;text-align:center;font-size:12px;color:var(--muted)">
          ${formatDate(order.created_at)}
        </td>
      </tr>
    `).join('');
  }
  
  // Функция отрисовки графика заказов
  function renderClientOrdersChart(orders, operations) {
    if (!window.Chart || orders.length === 0) return;
    
    const canvas = document.getElementById('clientOrdersChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Уничтожаем старый график, если есть
    if (ClientsModule.ordersChart) {
      ClientsModule.ordersChart.destroy();
    }
    
    // Группируем операции по заказам для вычисления дат
    const opsByOrder = {};
    if (operations && operations.length > 0) {
      for (const op of operations) {
        const orderId = op.order_id;
        if (!opsByOrder[orderId]) {
          opsByOrder[orderId] = {
            planned_duration: 0,
            actual_duration: 0,
            last_completion: null,
            first_start: null
          };
        }
        opsByOrder[orderId].planned_duration += (op.planned_duration || 0) + (op.planned_setup_time || 0);
        opsByOrder[orderId].actual_duration += (op.total_duration || 0) + (op.setup_duration || 0);
        
        if (op.completed_at) {
          const completionDate = new Date(op.completed_at);
          if (!opsByOrder[orderId].last_completion || completionDate > new Date(opsByOrder[orderId].last_completion)) {
            opsByOrder[orderId].last_completion = op.completed_at;
          }
        }
        if (op.started_at) {
          const startDate = new Date(op.started_at);
          if (!opsByOrder[orderId].first_start || startDate < new Date(opsByOrder[orderId].first_start)) {
            opsByOrder[orderId].first_start = op.started_at;
          }
        }
      }
    }
    
    // Подготавливаем данные для графика
    const chartData = orders.map(order => {
      const orderData = opsByOrder[order.id] || {};
      const createdDate = order.created_at ? new Date(order.created_at) : null;
      
      // Планируемая дата завершения = дата создания + планируемое время (в днях)
      const plannedDays = orderData.planned_duration ? Math.ceil(orderData.planned_duration / (8 * 3600)) : 0; // Предполагаем 8 часов в день
      const plannedDate = createdDate ? new Date(createdDate.getTime() + plannedDays * 24 * 60 * 60 * 1000) : null;
      
      // Фактическая дата завершения
      const actualDate = orderData.last_completion ? new Date(orderData.last_completion) : null;
      
      return {
        orderId: order.id,
        created: createdDate,
        planned: plannedDate,
        actual: actualDate
      };
    }).filter(d => d.created); // Фильтруем только заказы с датой создания
    
    // Сортируем по дате создания
    chartData.sort((a, b) => a.created - b.created);
    
    const labels = chartData.map(d => d.orderId);
    const createdDates = chartData.map(d => d.created ? d.created.getTime() : null);
    const plannedDates = chartData.map(d => d.planned ? d.planned.getTime() : null);
    const actualDates = chartData.map(d => d.actual ? d.actual.getTime() : null);
    
    ClientsModule.ordersChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Дата создания заказа',
            data: createdDates,
            borderColor: 'rgba(0, 207, 181, 1)',
            backgroundColor: 'rgba(0, 207, 181, 0.1)',
            pointRadius: 6,
            pointHoverRadius: 8,
            fill: false
          },
          {
            label: 'Планируемая дата завершения',
            data: plannedDates,
            borderColor: 'rgba(255, 176, 32, 1)',
            backgroundColor: 'rgba(255, 176, 32, 0.1)',
            pointRadius: 6,
            pointHoverRadius: 8,
            borderDash: [5, 5],
            fill: false
          },
          {
            label: 'Фактическая дата завершения',
            data: actualDates,
            borderColor: 'rgba(46, 204, 113, 1)',
            backgroundColor: 'rgba(46, 204, 113, 0.1)',
            pointRadius: 6,
            pointHoverRadius: 8,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context) {
                if (context.parsed.y === null) return context.dataset.label + ': нет данных';
                const date = new Date(context.parsed.y);
                return context.dataset.label + ': ' + date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
              }
            }
          }
        },
        scales: {
          y: {
            type: 'linear',
            ticks: {
              callback: function(value) {
                return new Date(value).toLocaleDateString('ru-RU');
              }
            }
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        }
      }
    });
  }
  
  // Main render function
  function renderClients() {
    renderClientsList();
  }
  
  // Export
  ClientsModule.renderClients = renderClients;
  ClientsModule.renderClientsList = renderClientsList;
  ClientsModule.showClientDetails = showClientDetails;
  ClientsModule.applyFilters = applyFilters;
  ClientsModule.clearFilters = clearFilters;
  ClientsModule.sortBy = sortByColumn;
  ClientsModule.sortClientOrders = sortClientOrders;
  
  window.ClientsModule = ClientsModule;
  
  // Auto-init if pane is visible
  if (document.getElementById("clients")) {
    setTimeout(() => {
      renderClients();
    }, 100);
  }
  
  console.log('Clients module loaded');
})();

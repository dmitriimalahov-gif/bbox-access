/**
 * B'BOX Production - Process Tracking Module
 * Модуль отслеживания процессов производства
 */

(function() {
  'use strict';
  
  if (window.ProcessTrackingModule && window.ProcessTrackingModule.loaded) {
    console.log('Process Tracking module already loaded');
    return;
  }
  
  console.log('Loading Process Tracking module...');

  // Состояние модуля
  const processState = {
    flows: [],
    selectedOrderId: null,
    selectedItemId: null,
    filterStatus: 'all'
  };

  // Загрузка данных о перемещениях
  async function loadOperationFlows(orderId, itemId) {
    try {
      let url = '/api/operation-flow';
      const params = [];
      if (orderId) params.push(`order_id=${encodeURIComponent(orderId)}`);
      if (itemId) params.push(`order_item_id=${encodeURIComponent(itemId)}`);
      if (params.length > 0) url += '?' + params.join('&');
      
      const flows = await api(url);
      processState.flows = Array.isArray(flows) ? flows : [];
      return processState.flows;
    } catch (e) {
      console.error('Ошибка загрузки operation_flow:', e);
      return [];
    }
  }

  // Получение перемещений по заказу
  async function getFlowsByOrder(orderId) {
    try {
      const flows = await api(`/api/operation-flow/by-order/${encodeURIComponent(orderId)}`);
      return Array.isArray(flows) ? flows : [];
    } catch (e) {
      console.error('Ошибка загрузки перемещений по заказу:', e);
      return [];
    }
  }

  // Получение перемещений по изделию
  async function getFlowsByItem(itemId) {
    try {
      const flows = await api(`/api/operation-flow/by-item/${encodeURIComponent(itemId)}`);
      return Array.isArray(flows) ? flows : [];
    } catch (e) {
      console.error('Ошибка загрузки перемещений по изделию:', e);
      return [];
    }
  }

  // Форматирование источника/цели
  function formatSourceTarget(source, target, opId) {
    const labels = {
      'warehouse': '🏭 Склад',
      'warehouse_rest': '💤 Отдых',
      'operation': '⚙️ Операция',
      'external': '📦 Внешний'
    };
    
    if (source === 'operation' && opId) {
      const op = state.ops?.find(o => o.id === opId);
      return op ? `⚙️ ${op.name || op.machine || opId}` : `⚙️ ${opId}`;
    }
    
    if (target === 'operation' && opId) {
      const op = state.ops?.find(o => o.id === opId);
      return op ? `⚙️ ${op.name || op.machine || opId}` : `⚙️ ${opId}`;
    }
    
    return labels[source] || labels[target] || source || target || '—';
  }

  // Форматирование статуса
  function formatStatus(status) {
    const statusLabels = {
      'planned': '📋 Запланировано',
      'in_transit': '🚚 В пути',
      'delivered': '✅ Доставлено',
      'cancelled': '❌ Отменено'
    };
    return statusLabels[status] || status || '—';
  }

  // Рендеринг таблицы перемещений
  function renderFlowsTable(flows, containerId) {
    const container = $(containerId);
    if (!container) return;
    
    if (!flows || flows.length === 0) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Нет данных о перемещениях</div>';
      return;
    }
    
    const filteredFlows = processState.filterStatus === 'all' 
      ? flows 
      : flows.filter(f => f.status === processState.filterStatus);
    
    const rows = filteredFlows.map(flow => {
      const fromLabel = formatSourceTarget(flow.from_source, null, flow.from_op_id);
      const toLabel = formatSourceTarget(null, flow.to_target, flow.to_op_id);
      const statusLabel = formatStatus(flow.status);
      const criticalBadge = flow.is_critical ? ' <span style="color:#ff4d4d;font-weight:bold" title="Критичная точка">⚠</span>' : '';
      
      return `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:8px;font-size:12px">${fromLabel}</td>
          <td style="padding:8px;font-size:12px">${toLabel}</td>
          <td style="padding:8px;font-size:12px">${flow.qty_planned || 0}</td>
          <td style="padding:8px;font-size:12px">${flow.qty_actual || 0}</td>
          <td style="padding:8px;font-size:12px">${statusLabel}${criticalBadge}</td>
          <td style="padding:8px;font-size:11px;color:var(--muted)">${flow.notes || '—'}</td>
        </tr>
      `;
    }).join('');
    
    container.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--bg-secondary);border-bottom:2px solid var(--border)">
            <th style="padding:10px;text-align:left;font-size:12px;font-weight:700">Откуда</th>
            <th style="padding:10px;text-align:left;font-size:12px;font-weight:700">Куда</th>
            <th style="padding:10px;text-align:center;font-size:12px;font-weight:700">План</th>
            <th style="padding:10px;text-align:center;font-size:12px;font-weight:700">Факт</th>
            <th style="padding:10px;text-align:center;font-size:12px;font-weight:700">Статус</th>
            <th style="padding:10px;text-align:left;font-size:12px;font-weight:700">Примечания</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  // Рендеринг графа процессов (упрощенная версия)
  function renderProcessGraph(flows, containerId) {
    const container = $(containerId);
    if (!container) return;
    
    if (!flows || flows.length === 0) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Нет данных для визуализации</div>';
      return;
    }
    
    // Простая текстовая визуализация графа
    const nodes = new Set();
    const edges = [];
    
    flows.forEach(flow => {
      if (flow.from_op_id) nodes.add(flow.from_op_id);
      if (flow.to_op_id) nodes.add(flow.to_op_id);
      edges.push({
        from: flow.from_op_id || flow.from_source,
        to: flow.to_op_id || flow.to_target,
        status: flow.status,
        critical: flow.is_critical
      });
    });
    
    let html = '<div style="padding:20px;font-family:monospace;font-size:11px;line-height:1.6">';
    
    edges.forEach(edge => {
      const fromLabel = edge.from ? (state.ops?.find(o => o.id === edge.from)?.name || edge.from) : 'Склад';
      const toLabel = edge.to ? (state.ops?.find(o => o.id === edge.to)?.name || edge.to) : 'Склад';
      const statusIcon = edge.status === 'delivered' ? '✅' : edge.status === 'in_transit' ? '🚚' : '📋';
      const criticalIcon = edge.critical ? ' ⚠' : '';
      html += `<div>${statusIcon} ${fromLabel} → ${toLabel}${criticalIcon}</div>`;
    });
    
    html += '</div>';
    container.innerHTML = html;
  }

  // Обновление визуализации процессов
  async function updateProcessVisualization(orderId, itemId) {
    processState.selectedOrderId = orderId;
    processState.selectedItemId = itemId;
    
    const flows = itemId 
      ? await getFlowsByItem(itemId)
      : orderId 
        ? await getFlowsByOrder(orderId)
        : await loadOperationFlows(orderId, itemId);
    
    processState.flows = flows;
    
    renderFlowsTable(flows, 'processFlowsTable');
    renderProcessGraph(flows, 'processGraph');
  }

  // Экспорт функций
  window.ProcessTrackingModule = {
    loaded: true,
    loadOperationFlows,
    getFlowsByOrder,
    getFlowsByItem,
    updateProcessVisualization,
    renderFlowsTable,
    renderProcessGraph,
    formatSourceTarget,
    formatStatus,
    state: processState
  };

  console.log('Process Tracking module loaded');
})();

/**
 * B'BOX Production - Designer Module
 * Конструктор производства (Floor Plan Designer)
 */

(function() {
  'use strict';
  
  // Check if already loaded
  if (window.DesignerModule) {
    console.log('Designer module already loaded');
    return;
  }
  
  // Designer state - гарантируем все поля по умолчанию
  const createDesignerState = () => ({
    layouts: [],
    currentLayoutId: null,
    currentLayout: null,
    floorMachines: [],
    floorConnections: [],
    floorOperators: [],
    floorZones: [],
    floorProductTemplates: [],
    floorWarehouses: [],
    cameras: [],
    machineStatuses: {},
    
    // === НОВЫЕ ПОЛЯ для работы с заказами ===
    selectedOrderId: null,        // ID выбранного заказа
    selectedItemId: null,         // ID выбранного изделия (одно изделие)
    selectedItemIds: [],          // ID выбранных изделий (множественный выбор)
    orderItems: [],               // Изделия выбранного заказа
    orderOps: [],                 // Операции выбранного изделия
    routeGraph: {},               // Граф маршрута: { itemId: { nodes: [], edges: [] } }
    routeNodes: [],               // Узлы маршрута для отображения на canvas
    routeEdges: [],               // Ребра маршрута для отображения на canvas
    itemColors: {},               // Цвета для изделий: { itemId: color }
    itemOpsCount: {},             // Количество операций для каждого изделия: { itemId: count }
    routeTemplates: [],           // Сохранённые шаблоны маршрутов
    itemRoutes: {},               // Сохранённые карты: { itemId: route }
    fixedMachinePositions: {},    // Фиксированные позиции машин: { machineName: { x, y } }
    fixedMachineNodes: [],        // Фиксированные узлы машин из state.machines (всегда на канвасе)
    
    // Canvas state
    zoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    
    // Tool state
    currentTool: 'select',
    selectedElement: null,
    selectedType: null,
    
    // Connection drawing
    isDrawingConnection: false,
    connectionStartMachine: null,
    
    // Dragging state
    isDragging: false,
    
    // Live update interval
    liveUpdateInterval: null,
    
    // Event handlers initialized flag
    eventHandlersInitialized: false,
    
    // Flag to prevent duplicate initialization
    isInitializing: false
  });

  // One stable object is shared by the canvas, controls and compatibility API.
  const designer = Object.assign(window.designer || {}, createDesignerState());
  window.designer = designer;
  let viewEpoch = 0;
  let viewOwner = null;
  let dataOwner = null;
  let viewActive = false;
  let entryPromise = null;
  let polling = false;
  let statusFlight = null;
  let layoutRequest = 0;
  let orderRequest = 0;
  const captureView = () => ({ epoch: viewEpoch, owner: currentUser });
  const isCurrentView = token => viewActive && token.epoch === viewEpoch &&
    token.owner === currentUser && token.owner === viewOwner && Boolean(currentUser);

  
  // --- API Functions ---
  function floorMessage(message) {
    const el = $("designerFloorStatus");
    if (el) el.textContent = message;
  }
  async function loadFloorLayouts() {
    const token = captureView();
    if (!isCurrentView(token)) return;
    try {
      const res = await api('/api/floor-layouts');
      if (!isCurrentView(token)) return;
      designer.layouts = Array.isArray(res) ? res : [];
      renderDesignerLayoutSelect();
      let remembered = '';
      try { remembered = window.localStorage?.getItem('bbox.floor:' + currentUser.role + ':' + currentUser.userId) || ''; } catch {}
      const chosen = designer.layouts.find(l => l.id === designer.currentLayoutId) || designer.layouts.find(l => l.id === remembered) || designer.layouts.find(l => l.is_default) || designer.layouts[0];
      if (chosen) {
        if ($('designerLayoutSelect')) $('designerLayoutSelect').value = chosen.id;
        await loadFloorLayoutFull(chosen.id);
      } else {
        designer.currentLayoutId = null;
        designer.currentLayout = null;
        for (const key of ['floorMachines','floorConnections','floorOperators','floorZones','floorProductTemplates','floorWarehouses','cameras']) designer[key] = [];
        renderDesignerCanvas(); renderDesignerCamerasList();
        floorMessage('Цехов пока нет. Добавьте цех, чтобы настроить камеры и посмотреть связи.');
        if ($('designerBottlenecks')) $('designerBottlenecks').textContent = 'Сначала выберите цех.';
      }
    } catch (e) { if (isCurrentView(token)) floorMessage('Не удалось загрузить цеха: ' + e.message); }
  }

  async function loadFloorLayoutFull(layoutId) {
    const token = captureView();
    if (!isCurrentView(token)) return;
    const request = ++layoutRequest;
    const canApply = () => isCurrentView(token) && request === layoutRequest;
    if(!layoutId) {
      console.warn("[DESIGNER] loadFloorLayoutFull called without layoutId");
      return;
    }
    try {
      console.log("[DESIGNER] Loading full layout:", layoutId);
      const res = await api("/api/floor-layouts/" + encodeURIComponent(layoutId) + "/full");
      if (!canApply()) return;
      console.log("[DESIGNER] Layout loaded, machines:", res.machines?.length || 0, "operators:", res.operators?.length || 0);
      
      designer.currentLayoutId = layoutId;
      if ($('designerLayoutSelect')) $('designerLayoutSelect').value = layoutId;
      floorMessage('Камеры и анализ связей для цеха «' + res.layout.name + '».');
      try { window.localStorage?.setItem('bbox.floor:' + currentUser.role + ':' + currentUser.userId, layoutId); } catch {}
      designer.currentLayout = res.layout;
      designer.floorMachines = res.machines || [];
      designer.floorConnections = res.connections || [];
      designer.floorOperators = res.operators || [];
      designer.floorZones = res.zones || [];
      designer.floorProductTemplates = res.productTemplates || [];
      designer.floorWarehouses = res.warehouses || [];
      designer.cameras = res.cameras || [];
      
      console.log("[DESIGNER] Layout loaded, connections:", designer.floorConnections.length);
      if(designer.floorConnections.length > 0) {
        console.log("[DESIGNER] Connection details:", designer.floorConnections.map(c => ({
          id: c.id,
          from_type: c.from_type,
          from_id: c.from_id,
          from_machine_id: c.from_machine_id,
          to_type: c.to_type,
          to_id: c.to_id,
          to_machine_id: c.to_machine_id
        })));
      }
      
      console.log("[DESIGNER] Rendering canvas and lists...");
      renderDesignerCanvas();
      renderDesignerMachinesList();
      renderDesignerOperatorsList();
      renderDesignerZonesList();
      renderDesignerCamerasList();
      
      // Загружаем статусы и аналитику в фоне, не блокируя рендеринг
      loadMachineStatuses().catch(e => console.error("[DESIGNER] Error loading machine statuses:", e));
      loadDesignerAnalytics().catch(e => console.error("[DESIGNER] Error loading analytics:", e));
      
      console.log("[DESIGNER] Layout fully loaded and rendered");
    } catch(e) {
      if (!canApply()) return;
      console.error("[DESIGNER] Failed to load layout:", e);
      console.error("[DESIGNER] Error details:", e.message, e.stack);
      console.error("Ошибка загрузки layout: " + (e.message || String(e)));
      floorMessage('Не удалось открыть цех: ' + e.message);
      if ($('designerLayoutSelect')) $('designerLayoutSelect').value = designer.currentLayoutId || '';

    }
  }
  
  function loadMachineStatuses() {
    const token = captureView();
    if (!isCurrentView(token)) return Promise.resolve(false);
    // Layout reloads, manual camera refresh and polling share one request.
    if (statusFlight) return statusFlight.promise;
    const flight = { controller: new AbortController(), promise: null };
    statusFlight = flight;
    flight.promise = (async () => {
      try {
        const res = await api("/api/machine-status", { signal: flight.controller.signal });
        if (!isCurrentView(token)) return false;
        const statuses = {};
        (Array.isArray(res) ? res : []).forEach(s => { statuses[s.machine_id] = s; });
        designer.machineStatuses = statuses;
        updateMachineStatusesOnCanvas();
        return true;
      } catch(e) {
        if (isCurrentView(token) && e.name !== 'AbortError') console.error("Failed to load machine statuses:", e);
        return false;
      } finally {
        if (statusFlight === flight) statusFlight = null;
      }
    })();
    return flight.promise;
  }

  async function loadDesignerAnalytics() {
    const token = captureView();
    const layoutId = designer.currentLayoutId;
    if (!isCurrentView(token) || !layoutId) return false;
    try {
      const res = await api("/api/floor-layouts/" + encodeURIComponent(layoutId) + "/analytics");
      if (!isCurrentView(token) || layoutId !== designer.currentLayoutId) return false;
      renderDesignerBottlenecks(res);
      return true;
    } catch(e) {
      if (isCurrentView(token)) console.error("Failed to load analytics:", e);
      return false;
    }
  }

  // === НОВЫЕ ФУНКЦИИ: Загрузка и построение маршрута заказа ===
  
  // Цвета для изделий
  const ITEM_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', 
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  
  // Загрузка заказа для конструктора
  async function loadOrderForDesigner(orderId) {
    const token = captureView();
    if (!isCurrentView(token)) return;
    const request = ++orderRequest;
    const canApply = () => isCurrentView(token) && request === orderRequest;
    if(!orderId) {
      designer.selectedOrderId = null;
      designer.selectedItemId = null;
      designer.selectedItemIds = [];
      designer.orderItems = [];
      const info = $("designerOrderInfo");
      if (info) info.style.display = 'none';
      designer.orderOps = [];
      designer.routeGraph = {};
      designer.routeNodes = [];
      designer.routeEdges = [];
      renderDesignerItemsList();
      renderDesignerItemSelect();
      renderDesignerCanvas();
      // Секции цеха скрыты
      
      // Скрыть кнопку сохранения карты (пока не выбрано изделие)
      const saveBtn = $("designerSaveItemRoute");
      if(saveBtn) saveBtn.style.display = "none";
      // Кнопки "Обновить связи" и "Удалить связи" всегда видны
      
      return;
    }
    
    console.log("[DESIGNER] Loading order for designer:", orderId);
    designer.selectedOrderId = orderId;
    designer.selectedItemId = null; // Сбрасываем выбранное изделие
    
    try {
      // Загружаем информацию о заказе
      const order = await api("/api/orders/" + encodeURIComponent(orderId));
      if (!canApply()) return;
      const info = $("designerOrderInfo");
      if (info) info.style.display = '';
      
      // Обновляем информацию в UI
      const clientEl = $("designerOrderClient");
      const productEl = $("designerOrderProduct");
      const statusEl = $("designerOrderStatus");
      const qtyEl = $("designerOrderQty");
      
      if(clientEl) clientEl.textContent = order.client || orderId;
      if(productEl) productEl.textContent = order.product || "";
      if(statusEl) {
        statusEl.textContent = order.status || "Открыт";
        statusEl.style.background = order.status === "Выполнено" ? "#2ecc71" : 
                                    order.status === "В работе" ? "#f39c12" : "#eee";
        statusEl.style.color = order.status === "Выполнено" || order.status === "В работе" ? "#fff" : "#333";
      }
      if(qtyEl) qtyEl.textContent = order.qty ? `Тираж: ${order.qty}` : "";
      
      // Загружаем только изделия заказа (не операции)
      const itemsRes = await api("/api/order-items?orderId=" + encodeURIComponent(orderId));
      if (!canApply()) return;
      designer.orderItems = Array.isArray(itemsRes) ? itemsRes : [];
      
      // Загружаем количество операций для каждого изделия
      designer.itemOpsCount = {};
      if(designer.orderItems.length > 0) {
        await Promise.all(designer.orderItems.map(async (item) => {
          try {
            const opsRes = await api(`/api/ops?orderId=${encodeURIComponent(orderId)}&orderItemId=${encodeURIComponent(item.id)}`);
            if (!canApply()) return;
            const ops = Array.isArray(opsRes) ? opsRes : [];
            designer.itemOpsCount[item.id] = ops.length;
          } catch(e) {
            if (!canApply()) return;
            console.error(`[DESIGNER] Failed to load ops count for item ${item.id}:`, e);
            designer.itemOpsCount[item.id] = 0;
          }
        }));
      }
      
      if (!canApply()) return;
      // Назначаем цвета изделиям
      designer.itemColors = {};
      designer.orderItems.forEach((item, idx) => {
        designer.itemColors[item.id] = ITEM_COLORS[idx % ITEM_COLORS.length];
      });
      
      // Очищаем операции (будут загружены после выбора изделия)
      designer.orderOps = [];
      designer.routeNodes = [];
      designer.routeEdges = [];
      
      console.log("[DESIGNER] Loaded items for order:", designer.orderItems.length);
      if(designer.orderItems.length > 0) {
        console.log("[DESIGNER] Items:", designer.orderItems.map(i => ({ id: i.id, type: i.type, title: i.title, opsCount: designer.itemOpsCount[i.id] })));
      }
      
      // Рендерим селектор изделий
      renderDesignerItemsList();
      renderDesignerItemSelect();
      renderDesignerCanvas();
      
      // Секции цеха скрыты
      
      // Скрыть кнопку сохранения карты (пока не выбрано изделие)
      const saveBtn = $("designerSaveItemRoute");
      if(saveBtn) saveBtn.style.display = "none";
      
    } catch(e) {
      if (!canApply()) return;
      console.error("[DESIGNER] Failed to load order:", e);
      toast("Ошибка загрузки заказа: " + (e.message || String(e)));
    }
  }
  
  // Загрузка выбранных изделий на канвас (множественный выбор)
  async function loadSelectedItems() {
    if(!designer.selectedOrderId || !designer.selectedItemIds || designer.selectedItemIds.length === 0) {
      toast("⚠️ Выберите изделия для загрузки (используйте чекбоксы)");
      return;
    }
    
    console.log("[DESIGNER] Loading selected items:", designer.selectedItemIds);
    designer.selectedItemId = null; // Сбрасываем одиночный выбор
    
    try {
      const allOps = [];
      const allRouteNodes = [];
      
      // Добавляем служебные узлы (только один раз)
      allRouteNodes.push({
        id: 'warehouse',
        type: 'warehouse',
        label: '🏭 Склад',
        x: 50,
        y: 300,
        color: '#4CAF50'
      });
      allRouteNodes.push({
        id: 'warehouse_rest',
        type: 'warehouse',
        label: '💤 Отдых',
        x: 50,
        y: 100,
        color: '#FF9800'
      });
      
      // Загружаем операции для выбранных изделий в порядке их выбора
      for(const itemId of designer.selectedItemIds) {
        const item = designer.orderItems.find(i => i.id === itemId);
        if(!item) continue;
        
        try {
          const opsRes = await api(`/api/ops?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(itemId)}`);
          const itemOps = Array.isArray(opsRes) ? opsRes : [];
          
          if(itemOps.length > 0) {
            const itemColor = designer.itemColors[itemId] || '#888';
            
            // Создаём узлы для машин этого изделия
            itemOps.forEach((op, opIdx) => {
              if(!op.machine) return;
              
              const nodeId = `machine_${op.machine}_${itemId}_${opIdx}`;
              const machineNode = {
                id: nodeId,
                type: 'machine',
                machine: op.machine,
                label: op.machine,
                operations: [op],
                x: 0,
                y: 0,
                color: itemColor,
                itemId: itemId
              };
              
              allRouteNodes.push(machineNode);
            });
            
            allOps.push(...itemOps);
          }
        } catch(e) {
          console.error(`[DESIGNER] Failed to load operations for item ${itemId}:`, e);
        }
      }
      
      // Сохраняем все операции и узлы
      designer.orderOps = allOps;
      designer.routeNodes = allRouteNodes;
      designer.routeEdges = [];
      
      // НЕ вызываем autoLayoutNodesForMultipleItems - используем только фиксированные позиции машин
      // autoLayoutNodesForMultipleItems(); // УДАЛЕНО - сбрасывает координаты машин
      
      // Восстанавливаем позиции из фиксированных узлов для всех машин
      designer.routeNodes.forEach(node => {
        if(node.type === 'machine' && node.machine) {
          const fixedNode = designer.fixedMachineNodes.find(n => n.machine === node.machine);
          if(fixedNode && (node.x === undefined || node.x === 0 || node.y === undefined || node.y === 0)) {
            node.x = fixedNode.x;
            node.y = fixedNode.y;
          }
        }
      });
      
      // Строим связи из операций
      buildConnectionsFromOperations();
      
      console.log("[DESIGNER] Loaded selected items:", {
        items: designer.selectedItemIds.length,
        operations: allOps.length,
        nodes: allRouteNodes.length,
        edges: designer.routeEdges.length
      });
      
      // Скрываем кнопку сохранения (нельзя сохранить карту для множественных изделий)
      const saveBtn = $("designerSaveItemRoute");
      if(saveBtn) saveBtn.style.display = "none";
      
      // Рендерим canvas
      renderDesignerCanvas();
      
      toast(`✅ Загружено ${designer.selectedItemIds.length} изделий, ${allOps.length} операций`);
      
    } catch(e) {
      console.error("[DESIGNER] Failed to load selected items:", e);
      toast("Ошибка загрузки изделий: " + (e.message || String(e)));
    }
  }
  
  // Загрузка всех изделий заказа на канвас
  async function loadAllOrderItems() {
    if(!designer.selectedOrderId || !designer.orderItems || designer.orderItems.length === 0) {
      toast("⚠️ Сначала выберите заказ");
      return;
    }
    
    console.log("[DESIGNER] Loading all items for order:", designer.selectedOrderId);
    designer.selectedItemId = null; // Сбрасываем выбранное изделие
    
    try {
      // Загружаем операции для всех изделий заказа
      const allOps = [];
      const allRouteNodes = [];
      
      // Добавляем служебные узлы (только один раз)
      allRouteNodes.push({
        id: 'warehouse',
        type: 'warehouse',
        label: '🏭 Склад',
        x: 50,
        y: 300,
        color: '#4CAF50'
      });
      allRouteNodes.push({
        id: 'warehouse_rest',
        type: 'warehouse',
        label: '💤 Отдых',
        x: 50,
        y: 100,
        color: '#FF9800'
      });
      
      // Загружаем операции для каждого изделия
      for(const item of designer.orderItems) {
        try {
          const opsRes = await api(`/api/ops?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(item.id)}`);
          const itemOps = Array.isArray(opsRes) ? opsRes : [];
          
          if(itemOps.length > 0) {
            const itemColor = designer.itemColors[item.id] || '#888';
            
            // Создаём узлы для машин этого изделия
            itemOps.forEach((op, opIdx) => {
              if(!op.machine) return;
              
              const nodeId = `machine_${op.machine}_${item.id}_${opIdx}`;
              const machineNode = {
                id: nodeId,
                type: 'machine',
                machine: op.machine,
                label: op.machine,
                operations: [op],
                x: 0,
                y: 0,
                color: itemColor,
                itemId: item.id
              };
              
              allRouteNodes.push(machineNode);
            });
            
            allOps.push(...itemOps);
          }
        } catch(e) {
          console.error(`[DESIGNER] Failed to load operations for item ${item.id}:`, e);
        }
      }
      
      // Сохраняем все операции и узлы
      designer.orderOps = allOps;
      designer.routeNodes = allRouteNodes;
      designer.routeEdges = [];
      
      // НЕ вызываем autoLayoutNodes - используем только фиксированные позиции машин
      // autoLayoutNodes(); // УДАЛЕНО - сбрасывает координаты машин
      
      // Восстанавливаем позиции из фиксированных узлов для всех машин
      designer.routeNodes.forEach(node => {
        if(node.type === 'machine' && node.machine) {
          const fixedNode = designer.fixedMachineNodes.find(n => n.machine === node.machine);
          if(fixedNode && (node.x === undefined || node.x === 0 || node.y === undefined || node.y === 0)) {
            node.x = fixedNode.x;
            node.y = fixedNode.y;
          }
        }
      });
      
      // Строим связи из операций
      buildConnectionsFromOperations();
      
      console.log("[DESIGNER] Loaded all items:", {
        items: designer.orderItems.length,
        operations: allOps.length,
        nodes: allRouteNodes.length,
        edges: designer.routeEdges.length
      });
      
      // Скрываем кнопку сохранения (нельзя сохранить карту для всех изделий)
      const saveBtn = $("designerSaveItemRoute");
      if(saveBtn) saveBtn.style.display = "none";
      
      // Рендерим canvas
      renderDesignerCanvas();
      
      toast(`✅ Загружено ${designer.orderItems.length} изделий, ${allOps.length} операций`);
      
    } catch(e) {
      console.error("[DESIGNER] Failed to load all items:", e);
      toast("Ошибка загрузки изделий: " + (e.message || String(e)));
    }
  }
  
  // Загрузка операций для выбранного изделия
  async function loadItemOperations(itemId) {
    if(!itemId || !designer.selectedOrderId) {
      designer.selectedItemId = null;
      designer.orderOps = [];
      designer.routeGraph = {};
      designer.routeNodes = [];
      designer.routeEdges = [];
      renderDesignerCanvas();
      
      // Скрыть кнопку сохранения карты (пока не выбрано изделие)
      const saveBtn = $("designerSaveItemRoute");
      if(saveBtn) saveBtn.style.display = "none";
      // Кнопки "Обновить связи" и "Удалить связи" всегда видны
      
      return;
    }
    
    console.log("[DESIGNER] Loading operations for item:", itemId);
    designer.selectedItemId = itemId;
    
    try {
      // Загружаем операции только для выбранного изделия
      const opsRes = await api(`/api/ops?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(itemId)}`);
      designer.orderOps = Array.isArray(opsRes) ? opsRes : [];
      
      console.log("[DESIGNER] Loaded operations for item:", designer.orderOps.length);
      const machinesInOps = [...new Set(designer.orderOps.filter(op => op.machine).map(op => op.machine))];
      console.log("[DESIGNER] Operations with machines:", machinesInOps);
      
      // Сначала проверяем наличие сохранённой карты для изделия
      const hasSavedRoute = await loadSavedItemRoute(itemId);
      
      // Флаг для отслеживания, были ли координаты загружены из сохранённого маршрута
      let savedCoordsLoaded = false;
      
      // Загружаем фиксированный шаблон машин (если ещё не загружен)
      if(designer.fixedMachineNodes.length === 0) {
        await loadFixedMachineTemplate();
      }
      
      // Если сохранённой карты нет - строим граф маршрута для этого изделия
      if(!hasSavedRoute) {
        console.log("[DESIGNER] No saved route, building from operations");
        // Строим граф узлов (машины) - ИЗМЕНЕНО: использует фиксированные узлы
        // buildRouteGraph() использует фиксированные узлы и связывает их с операциями
        buildRouteGraph();
        // Строим связи из операций (input_sources/output_targets)
        buildConnectionsFromOperations();
        
        // Если нет сохранённой карты и есть операции - показываем модальное окно для создания
        if(designer.orderOps.length > 0) {
          await showSaveItemRouteModal(itemId);
        }
      } else {
        // Если есть сохранённая карта, загружаем её узлы и связи БЕЗ изменений
        console.log("[DESIGNER] Saved route loaded, nodes:", designer.routeNodes.length, "edges:", designer.routeEdges.length);
        
        // Проверяем, есть ли у загруженных узлов ВАЛИДНЫЕ координаты ДО любых других операций
        // Валидные = не (0,0) для машин (склады могут быть в фиксированных позициях)
        const nodesWithValidCoords = designer.routeNodes.filter(n => {
          if(n === null || n === undefined) return false;
          if(n.x === undefined || n.y === undefined || isNaN(n.x) || isNaN(n.y) || typeof n.x !== 'number' || typeof n.y !== 'number') {
            return false;
          }
          // Для складов - координаты валидны, если они определены
          if(n.type === 'warehouse') {
            return true;
          }
          // Для машин - координаты валидны только если они НЕ (0,0)
          return n.x !== 0 || n.y !== 0;
        });
        
        if(nodesWithValidCoords.length > 0) {
          savedCoordsLoaded = true;
          console.log("[DESIGNER] Loaded", nodesWithValidCoords.length, "nodes with valid saved coordinates");
          console.log("[DESIGNER] Sample coordinates:", nodesWithValidCoords.slice(0, 3).map(n => ({ id: n.id, x: n.x, y: n.y })));
          console.log("[DESIGNER] Using saved route exactly as saved - no modifications");
        } else {
          console.warn("[DESIGNER] Saved route loaded but no valid coordinates found (all nodes are at 0,0 or invalid)");
        }
        
        // НЕ вызываем buildConnectionsFromOperations() для сохранённого маршрута
        // Используем только те связи, которые были сохранены
        // Если нужно обновить связи из операций, пользователь может нажать "Обновить связи"
      }
      
      // Убеждаемся, что узлы созданы
      console.log("[DESIGNER] Final routeNodes count:", designer.routeNodes?.length || 0);
      console.log("[DESIGNER] Final routeEdges count:", designer.routeEdges?.length || 0);
      
      // Если узлов нет, но есть операции - создаём узлы заново
      // НО: НЕ делаем этого, если мы загрузили сохранённый маршрут с координатами
      if((!designer.routeNodes || designer.routeNodes.length === 0) && designer.orderOps && designer.orderOps.length > 0 && !savedCoordsLoaded) {
        console.log("[DESIGNER] No nodes found, rebuilding route graph");
        buildRouteGraph();
        buildConnectionsFromOperations();
      } else if(savedCoordsLoaded && (!designer.routeNodes || designer.routeNodes.length === 0)) {
        console.warn("[DESIGNER] Saved coordinates loaded but routeNodes is empty - this should not happen!");
      }
      
      // НЕ вызываем autoLayoutNodes - используем только фиксированные позиции машин
      // Если у узла нет координат - используем позицию из фиксированного узла
      if(designer.routeNodes && designer.routeNodes.length > 0) {
        designer.routeNodes.forEach(node => {
          if(node.type === 'machine' && node.machine) {
            // Ищем фиксированный узел для этой машины
            const fixedNode = designer.fixedMachineNodes.find(n => n.machine === node.machine);
            if(fixedNode && (node.x === undefined || node.x === 0 || node.y === undefined || node.y === 0)) {
              // Используем позицию из фиксированного узла
              node.x = fixedNode.x;
              node.y = fixedNode.y;
              console.log(`[DESIGNER] Восстановлена позиция машины ${node.machine} из фиксированного узла:`, node.x, node.y);
            }
          }
        });
      }
      
      // Показываем кнопку сохранения карты
      const saveBtn = $("designerSaveItemRoute");
      if(saveBtn) saveBtn.style.display = "";
      // Кнопки "Обновить связи" и "Удалить связи" всегда видны
      
      // ФИНАЛЬНАЯ проверка координат перед рендерингом
      if(designer.routeNodes && designer.routeNodes.length > 0) {
        const finalNodesWithCoords = designer.routeNodes.filter(n => 
          n !== null && n !== undefined &&
          n.x !== undefined && n.y !== undefined && 
          !isNaN(n.x) && !isNaN(n.y) && 
          typeof n.x === 'number' && typeof n.y === 'number'
        );
        console.log("[DESIGNER] BEFORE RENDER - Final check:");
        console.log("[DESIGNER] Total nodes:", designer.routeNodes.length);
        console.log("[DESIGNER] Nodes with valid coordinates:", finalNodesWithCoords.length);
        console.log("[DESIGNER] savedCoordsLoaded flag:", savedCoordsLoaded);
        if(finalNodesWithCoords.length > 0) {
          console.log("[DESIGNER] Final coordinates sample:", finalNodesWithCoords.slice(0, 3).map(n => ({ 
            id: n.id, 
            label: n.label, 
            x: n.x, 
            y: n.y 
          })));
        } else {
          console.error("[DESIGNER] ERROR: No valid coordinates before render! This should not happen if savedCoordsLoaded=true");
          console.log("[DESIGNER] All nodes:", designer.routeNodes.map(n => ({
            id: n?.id,
            x: n?.x,
            y: n?.y,
            xType: typeof n?.x,
            yType: typeof n?.y
          })));
        }
      }
      
      // Рендерим canvas (в самом конце, после всех операций)
      console.log("[DESIGNER] Calling renderDesignerCanvas - nodes:", designer.routeNodes?.length || 0);
      renderDesignerCanvas();
      
    } catch(e) {
      console.error("[DESIGNER] Failed to load item operations:", e);
      toast("Ошибка загрузки операций: " + (e.message || String(e)));
    }
  }
  
  // Скрыть/показать секции (не используется, цех удалён)
  function toggleFloorSections(show) {
    const sections = [
      'designerMachinesSection',
      'designerOperatorsSection',
      'designerCamerasSection',
      'designerAnalyticsSection',
      'designerProcessSection'
    ];
    sections.forEach(id => {
      const el = $(id);
      if(el) el.style.display = show ? '' : 'none';
    });
  }
  
  // Рендер списка изделий в боковой панели
  function renderDesignerItemsList() {
    const container = $("designerItemsList");
    if(!container) return;
    
    if(!designer.orderItems || designer.orderItems.length === 0) {
      container.innerHTML = '<div style="color:var(--muted);font-size:10px;padding:8px;text-align:center">Нет изделий в заказе</div>';
      return;
    }
    
    container.innerHTML = designer.orderItems.map(item => {
      const color = designer.itemColors[item.id] || '#ccc';
      const isSelected = designer.selectedItemId === item.id;
      const isMultiSelected = designer.selectedItemIds?.includes(item.id) || false;
      // Используем реальное количество операций для каждого изделия
      const opsCount = designer.itemOpsCount?.[item.id] || 0;
      return `
        <div class="designer-item-row ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''}" 
             data-item-id="${item.id}" 
             style="display:flex;align-items:center;gap:6px;padding:6px;cursor:pointer;border-radius:4px;margin-bottom:4px;background:${isSelected ? 'rgba(0,207,181,0.2)' : (isMultiSelected ? 'rgba(0,207,181,0.1)' : 'transparent')};border-left:4px solid ${color}">
          <input type="checkbox" class="designer-item-checkbox" data-item-id="${item.id}" 
                 ${isMultiSelected ? 'checked' : ''} 
                 style="cursor:pointer;margin:0"
                 onclick="event.stopPropagation()">
          <span style="font-weight:600;font-size:11px;flex:1">${esc(item.type || 'Изделие')}</span>
          <span style="font-size:10px;color:var(--muted)">${esc(item.title || '')}</span>
          <span style="font-size:9px;color:var(--muted);margin-left:auto">${opsCount} оп.</span>
        </div>
      `;
    }).join('');
    
    // Обработчики чекбоксов для множественного выбора
    container.querySelectorAll('.designer-item-checkbox').forEach(checkbox => {
      checkbox.onchange = (e) => {
        e.stopPropagation();
        const itemId = checkbox.dataset.itemId;
        if(!designer.selectedItemIds) designer.selectedItemIds = [];
        
        if(checkbox.checked) {
          if(!designer.selectedItemIds.includes(itemId)) {
            designer.selectedItemIds.push(itemId);
          }
        } else {
          designer.selectedItemIds = designer.selectedItemIds.filter(id => id !== itemId);
        }
        
        // Обновляем визуальное выделение
        const row = checkbox.closest('.designer-item-row');
        if(row) {
          if(checkbox.checked) {
            row.classList.add('multi-selected');
            row.style.background = 'rgba(0,207,181,0.1)';
        } else {
            row.classList.remove('multi-selected');
            row.style.background = designer.selectedItemId === itemId ? 'rgba(0,207,181,0.2)' : 'transparent';
          }
        }
      };
    });
    
    // Обработчики клика (синхронизация с селектором)
    container.querySelectorAll('.designer-item-row').forEach(row => {
      row.onclick = (e) => {
        // Если клик по чекбоксу - не обрабатываем
        if(e.target.type === 'checkbox') return;
        
        const itemId = row.dataset.itemId;
        const select = $("designerItemSelect");
        if(select && select.value !== itemId) {
          select.value = itemId;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
    });
  }
  
  // Рендер селектора изделий в header (чекбоксы для мульти-выбора)
  function renderDesignerItemSelect() {
    const select = $("designerItemSelect");
    if(!select) return;
    
    const items = designer.orderItems || [];
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">— Выберите изделие —</option>';
    
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      const displayText = item.title 
        ? `${item.type || 'Изделие'} — ${item.title}`
        : (item.type || 'Изделие');
      opt.textContent = displayText;
      select.appendChild(opt);
    });
    
    // Восстанавливаем выбранное значение
    if(currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
      select.value = currentValue;
    } else if(designer.selectedItemId) {
      select.value = designer.selectedItemId;
    }
  }
  
  // Рендер главного селектора заказов
  function renderDesignerOrderSelectMain() {
    const sel = $("designerOrderSelectMain");
    if(!sel) return;
    
    const orders = state.orders || [];
    sel.innerHTML = '<option value="">— Выберите заказ —</option>';
    
    orders.forEach(order => {
      const opt = document.createElement('option');
      opt.value = order.id;
      opt.textContent = `${order.id} — ${order.client || 'Без клиента'}`;
      sel.appendChild(opt);
    });
    
    if(designer.selectedOrderId) {
      sel.value = designer.selectedOrderId;
    }
  }
  
  // Загрузка сохранённых позиций машин и складов
  async function loadFixedMachinePositions() {
    const token = captureView();
    try {
      // Загружаем из user settings или из специальной таблицы
      const settings = await api("/api/settings/user").catch(() => ({}));
      if (!isCurrentView(token)) return;
      const positionsKey = 'designer_fixed_machine_positions';
      
      if(settings && settings[positionsKey]) {
        const positions = typeof settings[positionsKey] === 'string' 
          ? JSON.parse(settings[positionsKey]) 
          : settings[positionsKey];
        
        if(positions && typeof positions === 'object') {
          designer.fixedMachinePositions = positions;
          console.log("[DESIGNER] Загружены сохранённые позиции машин:", Object.keys(positions).length, "машин");
          
          // Обновляем позиции в фиксированных узлах
          if(designer.fixedMachineNodes && designer.fixedMachineNodes.length > 0) {
            designer.fixedMachineNodes.forEach(node => {
              const savedPos = positions[node.machine];
              if(savedPos && savedPos.x !== undefined && savedPos.y !== undefined) {
                node.x = Number(savedPos.x);
                node.y = Number(savedPos.y);
              }
            });
          }
        }
      }
      
      // Загружаем позиции складов
      const warehousePositionsKey = 'designer_fixed_warehouse_positions';
      if(settings && settings[warehousePositionsKey]) {
        const warehousePositions = typeof settings[warehousePositionsKey] === 'string' 
          ? JSON.parse(settings[warehousePositionsKey]) 
          : settings[warehousePositionsKey];
        
        if(warehousePositions && typeof warehousePositions === 'object') {
          console.log("[DESIGNER] Загружены сохранённые позиции складов:", Object.keys(warehousePositions).length, "складов");
          
          // Обновляем позиции складов в floorWarehouses и routeNodes
          if(designer.floorWarehouses && designer.floorWarehouses.length > 0) {
            designer.floorWarehouses.forEach(warehouse => {
              const savedPos = warehousePositions[warehouse.id];
              if(savedPos && savedPos.x !== undefined && savedPos.y !== undefined) {
                warehouse.x = Number(savedPos.x);
                warehouse.y = Number(savedPos.y);
              }
            });
          }
          
          // Обновляем позиции складов в routeNodes
          if(designer.routeNodes && designer.routeNodes.length > 0) {
            designer.routeNodes.forEach(node => {
              if(node.type === 'warehouse' && node.id) {
                const savedPos = warehousePositions[node.id];
                if(savedPos && savedPos.x !== undefined && savedPos.y !== undefined) {
                  node.x = Number(savedPos.x);
                  node.y = Number(savedPos.y);
                }
              }
            });
          }
        }
      }
    } catch(e) {
      console.warn("[DESIGNER] Ошибка загрузки позиций машин и складов:", e);
    }
  }
  
  // Сохранение позиций машин
  async function saveFixedMachinePositions() {
    try {
      // Собираем позиции всех фиксированных машин
      const positions = {};
      if(designer.fixedMachineNodes && designer.fixedMachineNodes.length > 0) {
        designer.fixedMachineNodes.forEach(node => {
          if(node.machine && node.x !== undefined && node.y !== undefined) {
            positions[node.machine] = {
              x: Number(node.x),
              y: Number(node.y)
            };
          }
        });
      }
      
      // Сохраняем в user settings
      const positionsKey = 'designer_fixed_machine_positions';
      await api("/api/settings/user/" + encodeURIComponent(positionsKey), {
        method: 'PUT',
        body: JSON.stringify({ value: JSON.stringify(positions) })
      });
      
      designer.fixedMachinePositions = positions;
      console.log("[DESIGNER] Сохранены позиции машин:", Object.keys(positions).length, "машин");
    } catch(e) {
      console.error("[DESIGNER] Ошибка сохранения позиций машин:", e);
    }
  }
  
  // Функция для получения координат машины по жёсткому шаблону из рисунка
  function getMachinePositionFromTemplate(machineName) {
    // ЖЁСТКИЙ ШАБЛОН расположения машин на основе рисунка
    // Левая колонка (x=200):
    // - 917 - FK - клей по т... (y=80)
    // - 8 - А - робот короб (y=170)
    // - 8 - А - углы (y=260)
    // - 8 - А - визуал (y=350)
    // - 8. А - автомат кле... (y=440)
    // - 4 - ZXT - плоттер, V... (y=530)
    
    // Средняя левая колонка (x=430):
    // - 7 - SC - крышкаделк... (y=170)
    // - 915 - ТР - вино клап... (y=260)
    // - 914 - SP - вино коро... (y=350)
    // - 91 - GL - 8 - клей (y=440)
    // - 4 - ТЈ - вырубка, ти... (y=530)
    
    // Средняя правая колонка (x=660):
    // - 913 - R3 - паспорту (y=170)
    // - 912 - R2 - робот кор... (y=260)
    // - 911 - R1 - робот кор... (y=350)
    // - 9 - GL - 6 - клей (y=440)
    // - 3 - YFMA - ламинатор (y=530)
    
    // Правая колонка (x=890):
    // - 6 - VM-590 - магниты... (y=80)
    // - 916 - ТМ - двусторон... (y=170)
    // - 910 - R - углы (y=260)
    // - 918 - ofset 70x100 -... (y=350)
    // - 5 - LS-1200 - фаска... (y=440)
    // - 1 - SENATOR - реза... (y=530)
    
    const template = {
      // Левая колонка
      '917 - FK - клей по т...': { x: 200, y: 80 },
      '8 - А - робот короб': { x: 200, y: 170 },
      '8 - А - углы': { x: 200, y: 260 },
      '8 - А - визуал': { x: 200, y: 350 },
      '8. А - автомат кле...': { x: 200, y: 440 },
      '4 - ZXT - плоттер, V...': { x: 200, y: 530 },
      
      // Средняя левая колонка
      '7 - SC - крышкаделк...': { x: 430, y: 170 },
      '915 - ТР - вино клап...': { x: 430, y: 260 },
      '914 - SP - вино коро...': { x: 430, y: 350 },
      '91 - GL - 8 - клей': { x: 430, y: 440 },
      '4 - ТЈ - вырубка, ти...': { x: 430, y: 530 },
      
      // Средняя правая колонка
      '913 - R3 - паспорту': { x: 660, y: 170 },
      '912 - R2 - робот кор...': { x: 660, y: 260 },
      '911 - R1 - робот кор...': { x: 660, y: 350 },
      '9 - GL - 6 - клей': { x: 660, y: 440 },
      '3 - YFMA - ламинатор': { x: 660, y: 530 },
      
      // Правая колонка
      '6 - VM-590 - магниты...': { x: 890, y: 80 },
      '916 - ТМ - двусторон...': { x: 890, y: 170 },
      '910 - R - углы': { x: 890, y: 260 },
      '918 - ofset 70x100 -...': { x: 890, y: 350 },
      '5 - LS-1200 - фаска...': { x: 890, y: 440 },
      '1 - SENATOR - реза...': { x: 890, y: 530 }
    };
    
    // Ищем точное совпадение
    if(template[machineName]) {
      return template[machineName];
    }
    
    // Ищем частичное совпадение (если название немного отличается)
    // Используем более точные ключевые слова для сопоставления
    for(const [key, pos] of Object.entries(template)) {
      // Извлекаем ключевые идентификаторы из шаблона (первое слово, код машины)
      const keyParts = key.split(' - ');
      const firstPart = keyParts[0]?.trim(); // Номер/код (например, "917", "8 - А")
      const secondPart = keyParts[1]?.trim(); // Код машины (например, "FK", "SC", "GL")
      const thirdPart = keyParts[2]?.trim(); // Описание (например, "клей", "робот короб")
      
      // Проверяем совпадение по ключевым частям
      let matchScore = 0;
      
      // Совпадение первого элемента (номер/код)
      if(firstPart && machineName.includes(firstPart)) {
        matchScore += 2;
      }
      
      // Совпадение второго элемента (код машины)
      if(secondPart && machineName.includes(secondPart)) {
        matchScore += 2;
      }
      
      // Совпадение ключевых слов из описания
      if(thirdPart) {
        const descWords = thirdPart.split(' ').filter(w => w.length > 3);
        descWords.forEach(word => {
          if(machineName.toLowerCase().includes(word.toLowerCase())) {
            matchScore += 1;
          }
        });
      }
      
      // Если найдено достаточно совпадений - используем эту позицию
      if(matchScore >= 2) {
        console.log(`[DESIGNER] Найдено частичное совпадение для машины "${machineName}" с шаблоном "${key}" (score: ${matchScore})`);
        return pos;
      }
    }
    
    // Если не найдено - возвращаем null (будет использовано стандартное размещение)
    return null;
  }
  
  // Загрузка фиксированного шаблона машин - все машины всегда на одних и тех же местах
  async function loadFixedMachineTemplate() {
    console.log("[DESIGNER] Загрузка фиксированного шаблона машин...");
    
    // Получаем все машины из state.machines
    const machines = state.machines || [];
    if(machines.length === 0) {
      console.warn("[DESIGNER] Нет машин в state.machines для создания фиксированного шаблона");
      designer.fixedMachineNodes = [];
      return;
    }
    
    // Создаём фиксированные узлы для каждой машины
    const fixedNodes = [];
    
    machines.forEach((machineName, idx) => {
      // Проверяем, есть ли сохранённая позиция для этой машины
      const savedPos = designer.fixedMachinePositions[machineName];
      
      // Если есть сохранённая позиция - используем её
      let pos = savedPos ? { x: savedPos.x, y: savedPos.y } : null;
      
      // Если нет сохранённой позиции - пытаемся найти в жёстком шаблоне
      if(!pos) {
        pos = getMachinePositionFromTemplate(machineName);
      }
      
      // Если не найдено в шаблоне - используем стандартное размещение (8 колонок)
      if(!pos) {
        const totalColumns = 8; // Разделяем канвас на 8 колонок
        const startX = 200;
        const startY = 80;
        const columnWidth = 150; // Ширина колонки для 8 колонок
        const nodeHeight = 90;
        
        // Распределяем машины равномерно по 8 колонкам
        const columnIndex = idx % totalColumns; // Колонка от 0 до 7
        const rowInColumn = Math.floor(idx / totalColumns); // Строка в колонке
        
        pos = {
          x: startX + (columnIndex * columnWidth),
          y: startY + (rowInColumn * nodeHeight)
        };
      }
      
      const node = {
        id: `fixed_machine_${machineName}`,
        type: 'machine',
        machine: machineName,
        label: machineName,
        operations: [], // Будет заполнено при выборе изделия
        x: Number(pos.x),
        y: Number(pos.y),
        color: '#888', // Цвет по умолчанию
        isFixed: true // Флаг, что это фиксированный узел
      };
      
      fixedNodes.push(node);
    });
    
    // Сохраняем позиции в шаблон для последующего использования
    fixedNodes.forEach(node => {
      if(node.x !== undefined && node.y !== undefined) {
        designer.fixedMachinePositions[node.machine] = {
          x: Number(node.x),
          y: Number(node.y)
        };
      }
    });
    
    // Сохраняем шаблон в базу данных (только если позиции не были сохранены ранее)
    const hasSavedPositions = Object.keys(designer.fixedMachinePositions).length > 0;
    if(!hasSavedPositions) {
      saveFixedMachinePositions();
      console.log("[DESIGNER] Фиксированные машины размещены по жёсткому шаблону из рисунка:", fixedNodes.length, "машин");
    } else {
      console.log("[DESIGNER] Используются сохранённые позиции машин из шаблона:", fixedNodes.length, "машин");
    }
    
    designer.fixedMachineNodes = fixedNodes;
    console.log("[DESIGNER] Фиксированный шаблон машин загружен:", fixedNodes.length, "машин");
  }
  
  // Построение графа маршрута (ИЗМЕНЕНО: использует фиксированные узлы машин)
  function buildRouteGraph() {
    designer.routeGraph = {};
    
    // Используем фиксированные узлы машин из designer.fixedMachineNodes (если они загружены)
    // Если фиксированные узлы не загружены - загружаем их сейчас
    let fixedNodes = designer.fixedMachineNodes || [];
    
    if(fixedNodes.length === 0) {
      console.warn("[DESIGNER] Фиксированные узлы машин не загружены, загружаем сейчас...");
      // Вызываем синхронную загрузку фиксированных узлов (или используем state.machines напрямую)
      const machines = state.machines || [];
      if(machines.length > 0) {
        fixedNodes = machines.map((machineName, idx) => {
          const nodesPerColumn = 6;
          const startX = 200;
          const startY = 80;
          const columnWidth = 230;
          const nodeHeight = 90;
          
          const columnIndex = Math.floor(idx / nodesPerColumn);
          const rowInColumn = idx % nodesPerColumn;
          
          return {
            id: `fixed_machine_${machineName}`,
            type: 'machine',
            machine: machineName,
            label: machineName,
            operations: [],
            x: startX + (columnIndex * columnWidth),
            y: startY + (rowInColumn * nodeHeight),
            color: '#888',
            isFixed: true
          };
        });
        designer.fixedMachineNodes = fixedNodes;
        console.log("[DESIGNER] Создано", fixedNodes.length, "фиксированных узлов машин из state.machines");
      } else {
        console.error("[DESIGNER] Нет машин в state.machines для создания фиксированных узлов");
      }
    }
    
    // Сортируем операции по порядковому номеру (no)
    let ops = (designer.orderOps || []).slice();
    ops.sort((a, b) => {
      const noA = Number(a.no || 0);
      const noB = Number(b.no || 0);
      return noA - noB;
    });
    
    // Получаем список уникальных машин из операций выбранного изделия
    const machinesInOps = [...new Set(ops.filter(op => op.machine).map(op => op.machine))];
    console.log("[DESIGNER] Машины в операциях выбранного изделия:", machinesInOps);
    
    // Создаём узлы ТОЛЬКО для машин, которые есть в операциях выбранного изделия
    // Используем фиксированные позиции из designer.fixedMachineNodes
    const machineNodes = [];
    
    machinesInOps.forEach(machineName => {
      // Ищем фиксированный узел для этой машины
      let fixedNode = fixedNodes.find(n => n.machine === machineName);
      
      // Если фиксированного узла нет - создаём его с auto-layout
      if(!fixedNode) {
        console.warn(`[DESIGNER] Фиксированный узел для машины "${machineName}" не найден, создаём новый`);
        const idx = fixedNodes.length;
        const nodesPerColumn = 6;
        const startX = 200;
        const startY = 80;
        const columnWidth = 230;
        const nodeHeight = 90;
        
        const columnIndex = Math.floor(idx / nodesPerColumn);
        const rowInColumn = idx % nodesPerColumn;
        
        fixedNode = {
          id: `fixed_machine_${machineName}`,
          type: 'machine',
          machine: machineName,
          label: machineName,
          operations: [],
          x: startX + (columnIndex * columnWidth),
          y: startY + (rowInColumn * nodeHeight),
          color: '#888',
          isFixed: true
        };
        
        fixedNodes.push(fixedNode);
        designer.fixedMachineNodes.push(fixedNode);
      }
      
      // Копируем фиксированный узел с сохранением позиции
      const nodeCopy = {
        ...fixedNode,
        operations: [], // Очищаем операции - заполним позже
        color: fixedNode.color || '#888',
        x: fixedNode.x, // ВАЖНО: Используем позицию из фиксированного узла
        y: fixedNode.y,
        isFixed: true // Помечаем как фиксированный
      };
      
      // Связываем операции с этим узлом машины
      ops.forEach(op => {
        if(op.machine === machineName) {
          nodeCopy.operations.push(op);
        }
      });
      
      machineNodes.push(nodeCopy);
    });
    
    // Добавляем служебные узлы
    const specialNodes = [
      {
      id: 'warehouse',
      type: 'warehouse',
      label: '🏭 Склад',
      x: 50,
      y: 300,
      color: '#4CAF50'
      },
      {
      id: 'warehouse_rest',
      type: 'warehouse',
      label: '💤 Отдых',
      x: 50,
      y: 100,
      color: '#FF9800'
      }
    ];
    
    // Собираем все узлы (сначала служебные, потом фиксированные машины)
    designer.routeNodes = [
      ...specialNodes,
      ...machineNodes
    ];
    
    // Если нет сохранённых связей - начинаем с пустого списка
    if(designer.routeEdges.length === 0) {
      designer.routeEdges = [];
    }
    
    console.log("[DESIGNER] Route graph built using FIXED machine nodes:", 
      designer.routeNodes.length, "nodes (", specialNodes.length, "special +", machineNodes.length, "machines),", 
      designer.routeEdges.length, "edges");
  }
  
  // Построение связей из операций (input_sources/output_targets)
  function buildConnectionsFromOperations() {
    if(!designer.orderOps || designer.orderOps.length === 0) {
      console.log("[DESIGNER] No operations to build connections from");
      return;
    }
    
    const newEdges = [];
    // Строим карту: opId -> nodeId (для каждой операции находим её конкретный узел)
    const opNodeMap = new Map(); // opId -> nodeId
    
    // Для каждой операции находим её конкретный узел (по порядку операций)
    designer.orderOps.forEach((op, opIdx) => {
      const opMachine = op.machine;
      if(!opMachine) return;
      
      // Ищем узел, который соответствует этой конкретной операции
      // Узлы создаются в порядке операций, поэтому используем индекс операции
      const expectedNodeId = `machine_${opMachine}_${opIdx}`;
      const opNode = designer.routeNodes.find(n => n.id === expectedNodeId && (n.operations || []).some(o => o.id === op.id));
      
      if(opNode) {
        opNodeMap.set(op.id, opNode.id);
      } else {
        // Fallback: ищем любой узел этой машины с этой операцией
        const fallbackNode = designer.routeNodes.find(n => 
          n.type === 'machine' && 
          n.machine === opMachine && 
          (n.operations || []).some(o => o.id === op.id)
        );
        if(fallbackNode) {
          opNodeMap.set(op.id, fallbackNode.id);
        }
      }
    });
    
    // Строим карту узлов по машинам для поиска источников/целей
    const machineNodeMap = new Map(); // machine_name -> [nodeIds] (в порядке операций)
    designer.routeNodes.forEach(node => {
      if(node.type === 'machine' && node.machine) {
        if(!machineNodeMap.has(node.machine)) {
          machineNodeMap.set(node.machine, []);
        }
        machineNodeMap.get(node.machine).push(node.id);
      }
    });
    
    // Для каждой операции в порядке их следования
    designer.orderOps.forEach((op, opIdx) => {
      const opNodeId = opNodeMap.get(op.id);
      if(!opNodeId) {
        console.warn(`[DESIGNER] No node found for operation: ${op.id} (${op.name})`);
        return;
      }
      
      const opNode = designer.routeNodes.find(n => n.id === opNodeId);
      if(!opNode) return;
      
      // Парсим input_sources
      const inputSources = parseJsonSafe(op.input_sources) || [];
      const isInputCritical = op.input_critical === 1;
      
      // Создаём связи от источников к этой конкретной операции
      inputSources.forEach(source => {
        let sourceNodeId = null;
        
        // Склады обрабатываем как строковые идентификаторы
        if(source === 'warehouse') {
          sourceNodeId = 'warehouse';
        } else if(source === 'warehouse_rest') {
          sourceNodeId = 'warehouse_rest';
        } else {
          // Ищем узел машины-источника
          // Если машина-источник встречается раньше в порядке операций, используем последний узел перед текущей операцией
          const sourceMachineNodes = machineNodeMap.get(source) || [];
          if(sourceMachineNodes.length > 0) {
            // Находим индекс текущей операции
            const currentOpNodeIdx = designer.routeNodes.findIndex(n => n.id === opNodeId);
            // Ищем последний узел машины-источника, который идёт до текущего узла
            let bestSourceNode = null;
            for(let i = currentOpNodeIdx - 1; i >= 0; i--) {
              const node = designer.routeNodes[i];
              if(node.type === 'machine' && node.machine === source) {
                bestSourceNode = node.id;
                break;
              }
            }
            // Если не нашли до текущего узла, берём первый узел этой машины
            sourceNodeId = bestSourceNode || sourceMachineNodes[0];
          }
        }
        
        if(sourceNodeId) {
          const edgeId = `edge_${sourceNodeId}_${opNodeId}_${op.id}`;
          // Проверяем, нет ли уже такой связи
          if(!designer.routeEdges.find(e => e.id === edgeId)) {
            newEdges.push({
              id: edgeId,
              from: sourceNodeId,
              to: opNodeId,
              color: opNode.color || '#888',
              isCritical: isInputCritical,
              isBidirectional: false
            });
          }
        }
      });
      
      // Парсим output_targets
      const outputTargets = parseJsonSafe(op.output_targets) || [];
      const isOutputCritical = op.output_critical === 1;
      
      // Создаём связи от этой конкретной операции к целям
      outputTargets.forEach(target => {
        let targetNodeId = null;
        
        // Склады обрабатываем как строковые идентификаторы
        if(target === 'warehouse') {
          targetNodeId = 'warehouse';
        } else if(target === 'warehouse_rest') {
          targetNodeId = 'warehouse_rest';
        } else {
          // Ищем узел машины-цели
          // Если машина-цель встречается позже в порядке операций, используем первый узел после текущей операции
          const targetMachineNodes = machineNodeMap.get(target) || [];
          if(targetMachineNodes.length > 0) {
            // Находим индекс текущей операции
            const currentOpNodeIdx = designer.routeNodes.findIndex(n => n.id === opNodeId);
            // Ищем первый узел машины-цели, который идёт после текущего узла
            let bestTargetNode = null;
            for(let i = currentOpNodeIdx + 1; i < designer.routeNodes.length; i++) {
              const node = designer.routeNodes[i];
              if(node.type === 'machine' && node.machine === target) {
                bestTargetNode = node.id;
                break;
              }
            }
            // Если не нашли после текущего узла, берём первый узел этой машины
            targetNodeId = bestTargetNode || targetMachineNodes[0];
          }
        }
        
        if(targetNodeId) {
          const edgeId = `edge_${opNodeId}_${targetNodeId}_${op.id}`;
          // Проверяем, нет ли уже такой связи
          if(!designer.routeEdges.find(e => e.id === edgeId)) {
            newEdges.push({
              id: edgeId,
              from: opNodeId,
              to: targetNodeId,
              color: opNode.color || '#888',
              isCritical: isOutputCritical,
              isBidirectional: false
            });
          }
        }
      });
    });
    
    // Если routeEdges пуст (например, при refreshConnections), просто добавляем все новые связи
    // Если routeEdges не пуст (например, при начальной загрузке), объединяем с существующими
    if(designer.routeEdges.length === 0) {
      // Просто добавляем все новые связи
      designer.routeEdges = newEdges;
      console.log(`[DESIGNER] Built ${newEdges.length} connections from operations (fresh build)`);
    } else {
      // Объединяем существующие связи с новыми (избегаем дубликатов)
      const existingEdgeIds = new Set(designer.routeEdges.map(e => e.id));
      const uniqueNewEdges = newEdges.filter(e => !existingEdgeIds.has(e.id));
      
      designer.routeEdges.push(...uniqueNewEdges);
      console.log(`[DESIGNER] Built ${uniqueNewEdges.length} new connections from operations (merged with existing)`);
    }
  }
  
  // Обновление связей операции при редактировании на карте маршрута
  async function updateRouteConnection(fromMachine, toMachine, opId) {
    if(!opId) {
      toast("⚠️ Операция не найдена");
      return;
    }
    
    try {
      // Получаем текущую операцию
      const op = designer.orderOps.find(o => o.id === opId);
      if(!op) {
        toast("⚠️ Операция не найдена в данных заказа");
        return;
      }
      
      // Парсим текущие input_sources
      let inputSources = [];
      try {
        if(op.input_sources) {
          inputSources = typeof op.input_sources === 'string' ? JSON.parse(op.input_sources) : op.input_sources;
        }
      } catch(e) { inputSources = []; }
      if(!Array.isArray(inputSources)) inputSources = [];
      
      // Добавляем новый источник если его нет
      if(!inputSources.includes(fromMachine)) {
        inputSources.push(fromMachine);
      }
      
      // Обновляем операцию в БД
      await window.OperationUpdates.update(op, {
          input_sources: JSON.stringify(inputSources)
        });
      
      // Перезагружаем данные заказа
      if(designer.selectedOrderId) {
        await loadOrderForDesigner(designer.selectedOrderId);
      }
      
      toast("✅ Связь обновлена");
    } catch(e) {
      console.error("[DESIGNER] Error updating route connection:", e);
      toast("⚠️ Ошибка обновления связи: " + (e.message || String(e)));
    }
  }
  
  // Удаление связи маршрута
  async function deleteRouteConnection(fromMachine, toMachine, opId) {
    if(!opId) return;
    
    try {
      const op = designer.orderOps.find(o => o.id === opId);
      if(!op) return;
      
      // Парсим текущие input_sources
      let inputSources = [];
      try {
        if(op.input_sources) {
          inputSources = typeof op.input_sources === 'string' ? JSON.parse(op.input_sources) : op.input_sources;
        }
      } catch(e) { inputSources = []; }
      if(!Array.isArray(inputSources)) inputSources = [];
      
      // Удаляем источник
      inputSources = inputSources.filter(s => s !== fromMachine);
      
      // Если пустой, ставим warehouse по умолчанию
      if(inputSources.length === 0) {
        inputSources = ['warehouse'];
      }
      
      // Обновляем операцию в БД
      await window.OperationUpdates.update(op, {
          input_sources: JSON.stringify(inputSources)
        });
      
      // Перезагружаем данные заказа
      if(designer.selectedOrderId) {
        await loadOrderForDesigner(designer.selectedOrderId);
      }
      
      toast("✅ Связь удалена");
    } catch(e) {
      console.error("[DESIGNER] Error deleting route connection:", e);
      toast("⚠️ Ошибка удаления связи: " + (e.message || String(e)));
    }
  }
  
  // Автоматическое размещение узлов для множественного выбора (последовательно одно за другим)
  function autoLayoutNodesForMultipleItems(force = false) {
    const nodes = designer.routeNodes;
    
    if(nodes.length === 0) return;
    
    // Если force = true, принудительно размещаем все узлы, даже если у них есть координаты
    if(!force) {
      // Проверяем, есть ли узлы с валидными сохранёнными координатами
      // Валидные координаты = не (0,0) для машин (склады могут быть в фиксированных позициях)
      const nodesWithValidCoords = nodes.filter(n => {
        if(!n || n.x === undefined || n.y === undefined || isNaN(n.x) || isNaN(n.y) || typeof n.x !== 'number' || typeof n.y !== 'number') {
          return false;
        }
        // Для складов - координаты валидны, если они определены (даже (0,0))
        if(n.type === 'warehouse') {
          return true;
        }
        // Для машин - координаты валидны только если они НЕ (0,0)
        return n.x !== 0 || n.y !== 0;
      });
      
      if(nodesWithValidCoords.length > 0) {
        console.log("[DESIGNER] autoLayoutNodesForMultipleItems: Found", nodesWithValidCoords.length, "nodes with valid saved coordinates - SKIPPING auto-layout to preserve them");
        return; // НЕ перезаписываем координаты, если они уже есть
      }
    }
    
    console.log("[DESIGNER] autoLayoutNodesForMultipleItems: Performing auto-layout", force ? "(forced)" : "");
    
    // Разделяем узлы на служебные (warehouse) и машины
    const specialNodes = nodes.filter(n => n.type === 'warehouse');
    const machineNodes = nodes.filter(n => n.type === 'machine');
    
    // Размещаем служебные узлы в фиксированных позициях
    specialNodes.forEach((node, idx) => {
      if(node.id === 'warehouse') {
        node.x = 50;
        node.y = 300;
      } else if(node.id === 'warehouse_rest') {
        node.x = 50;
        node.y = 100;
      } else {
        node.x = 50;
        node.y = 100 + (idx * 100);
      }
    });
    
    // Группируем машины по изделиям
    const nodesByItem = new Map();
    machineNodes.forEach(node => {
      const itemId = node.itemId || 'default';
      if(!nodesByItem.has(itemId)) {
        nodesByItem.set(itemId, []);
      }
      nodesByItem.get(itemId).push(node);
    });
    
    // Размещаем узлы последовательно по изделиям (одно за другим)
    const startX = 200;
    const startY = 80;
    const columnWidth = 230; // Увеличено на 10 пикселей (было 220)
    const nodeHeight = 90; // Увеличено на 10 пикселей (было 80)
    const nodesPerColumn = 6;
    const itemSpacingX = 300; // Дополнительное расстояние между изделиями
    
    let currentX = startX;
    
    // Размещаем по порядку выбранных изделий
    const itemOrder = designer.selectedItemIds || [];
    const orderedItems = itemOrder.length > 0 
      ? itemOrder.map(itemId => designer.orderItems.find(i => i.id === itemId)).filter(Boolean)
      : Array.from(nodesByItem.keys()).map(itemId => designer.orderItems.find(i => i.id === itemId)).filter(Boolean);
    
    orderedItems.forEach((item, itemIdx) => {
      const itemNodes = nodesByItem.get(item.id) || [];
      
      if(itemNodes.length > 0) {
        // Если это не первое изделие, добавляем отступ
        if(itemIdx > 0) {
          currentX += itemSpacingX;
        }
        
        itemNodes.forEach((node, idx) => {
          const columnIndex = Math.floor(idx / nodesPerColumn);
          const rowInColumn = idx % nodesPerColumn;
          node.x = currentX + (columnIndex * columnWidth);
          node.y = startY + (rowInColumn * nodeHeight);
        });
        
        // Обновляем currentX для следующего изделия
        const maxColumns = Math.ceil(itemNodes.length / nodesPerColumn);
        if(maxColumns > 0) {
          currentX += maxColumns * columnWidth;
              }
            }
          });
    
    // Если изделия не в selectedItemIds, размещаем их после
    nodesByItem.forEach((itemNodes, itemId) => {
      const item = orderedItems.find(i => i.id === itemId);
      if(!item && itemNodes.length > 0) {
        itemNodes.forEach((node, idx) => {
          const columnIndex = Math.floor(idx / nodesPerColumn);
          const rowInColumn = idx % nodesPerColumn;
          node.x = currentX + (columnIndex * columnWidth);
          node.y = startY + (rowInColumn * nodeHeight);
        });
        
        const maxColumns = Math.ceil(itemNodes.length / nodesPerColumn);
        if(maxColumns > 0) {
          currentX += maxColumns * columnWidth + itemSpacingX;
        }
      }
    });
    
    console.log("[DESIGNER] autoLayoutNodesForMultipleItems: placed", nodes.length, "nodes");
  }
  
  // Автоматическое размещение узлов (по изделиям и уровням)
  function autoLayoutNodes(force = false) {
    const nodes = designer.routeNodes;
    
    if(nodes.length === 0) return;
    
    // Если force = true, принудительно размещаем все узлы, даже если у них есть координаты
    if(!force) {
      // Проверяем, есть ли узлы с валидными сохранёнными координатами
      // Валидные координаты = не (0,0) для машин (склады могут быть в фиксированных позициях)
      const nodesWithValidCoords = nodes.filter(n => {
        if(!n || n.x === undefined || n.y === undefined || isNaN(n.x) || isNaN(n.y) || typeof n.x !== 'number' || typeof n.y !== 'number') {
          return false;
        }
        // Для складов - координаты валидны, если они определены (даже (0,0))
        if(n.type === 'warehouse') {
          return true;
        }
        // Для машин - координаты валидны только если они НЕ (0,0)
        return n.x !== 0 || n.y !== 0;
      });
      
      if(nodesWithValidCoords.length > 0) {
        console.log("[DESIGNER] autoLayoutNodes: Found", nodesWithValidCoords.length, "nodes with valid saved coordinates - SKIPPING auto-layout to preserve them");
        console.log("[DESIGNER] autoLayoutNodes: Sample saved coordinates:", nodesWithValidCoords.slice(0, 3).map(n => ({ id: n.id, x: n.x, y: n.y })));
        return; // НЕ перезаписываем координаты, если они уже есть
      }
    }
    
    console.log("[DESIGNER] autoLayoutNodes: Performing auto-layout", force ? "(forced)" : "");
    
    // Разделяем узлы на служебные (warehouse) и машины
    const specialNodes = nodes.filter(n => n.type === 'warehouse');
    let machineNodes = nodes.filter(n => n.type === 'machine');
    
    // Сортируем узлы машин по порядку операций (no)
    // Каждый узел имеет операции, берем первую операцию для сортировки
    machineNodes.sort((a, b) => {
      const opA = (a.operations || [])[0];
      const opB = (b.operations || [])[0];
      if(!opA || !opB) return 0;
      
      // Получаем полные данные операции из designer.orderOps
      const fullOpA = designer.orderOps?.find(o => o.id === opA.id) || opA;
      const fullOpB = designer.orderOps?.find(o => o.id === opB.id) || opB;
      
      const noA = Number(fullOpA.no || 0);
      const noB = Number(fullOpB.no || 0);
      return noA - noB;
    });
    
    // Размещаем служебные узлы в фиксированных позициях
    specialNodes.forEach((node, idx) => {
      if(node.id === 'warehouse') {
        node.x = 50;
        node.y = 300;
      } else if(node.id === 'warehouse_rest') {
        node.x = 50;
        node.y = 100;
      } else {
        node.x = 50;
        node.y = 100 + (idx * 100);
      }
    });
    
    // Группируем машины по изделиям (если есть itemId)
    const nodesByItem = new Map();
    machineNodes.forEach(node => {
      const itemId = node.itemId || 'default';
      if(!nodesByItem.has(itemId)) {
        nodesByItem.set(itemId, []);
      }
      nodesByItem.get(itemId).push(node);
    });
    
    // Размещаем машины по изделиям
    const nodesPerColumn = 6;
    const startX = 200;
    const startY = 80;
    const columnWidth = 230; // Увеличено на 10 пикселей (было 220)
    const nodeHeight = 90; // Увеличено на 10 пикселей (было 80)
    const itemColumnOffset = 250; // Смещение между изделиями
    
    let globalIdx = 0;
    let currentItemStartX = startX;
    
    // Если все узлы одного изделия или нет itemId - размещаем последовательно
    if(nodesByItem.size <= 1) {
      machineNodes.forEach((node, idx) => {
        // Если force = false, пропускаем узлы с валидными координатами
        if(!force) {
          if(node.x !== undefined && node.y !== undefined && !isNaN(node.x) && !isNaN(node.y) && (node.x !== 0 || node.y !== 0)) {
            return;
          }
        }
        
        const columnIndex = Math.floor(idx / nodesPerColumn);
        const rowInColumn = idx % nodesPerColumn;
        node.x = startX + (columnIndex * columnWidth);
        node.y = startY + (rowInColumn * nodeHeight);
      });
    } else {
      // Размещаем по изделиям (каждое изделие в своей колонке)
      nodesByItem.forEach((itemNodes, itemId) => {
        itemNodes.forEach((node, idx) => {
          // Если force = false, пропускаем узлы с валидными координатами
          if(!force) {
            if(node.x !== undefined && node.y !== undefined && !isNaN(node.x) && !isNaN(node.y) && (node.x !== 0 || node.y !== 0)) {
              return;
            }
          }
          
          const columnIndex = Math.floor(idx / nodesPerColumn);
          const rowInColumn = idx % nodesPerColumn;
          // Смещаем по X для каждого изделия
          const itemIndex = Array.from(nodesByItem.keys()).indexOf(itemId);
          node.x = currentItemStartX + (itemIndex * itemColumnOffset) + (columnIndex * columnWidth);
          node.y = startY + (rowInColumn * nodeHeight);
        });
      });
    }
    
    // Логируем результат размещения
    const placedNodes = nodes.filter(n => n.x !== 0 || n.y !== 0);
    console.log("[DESIGNER] autoLayoutNodes: placed", placedNodes.length, "of", nodes.length, "nodes");
    console.log("[DESIGNER] Layout: columns =", Math.ceil(machineNodes.length / nodesPerColumn), ", machines =", machineNodes.length);
    if(placedNodes.length < nodes.length) {
      const unplacedNodes = nodes.filter(n => n.x === 0 && n.y === 0);
      console.warn("[DESIGNER] Nodes without coordinates after autoLayout:", unplacedNodes.map(n => ({ id: n.id, type: n.type })));
    }
  }
  
  // Сохранение layout узлов для заказа
  async function saveRouteLayout() {
    if(!designer.selectedOrderId) {
      toast("⚠️ Сначала выберите заказ");
      return;
    }
    
    const layoutData = {};
    (designer.routeNodes || []).forEach(node => {
      layoutData[node.id] = { x: node.x, y: node.y };
    });
    
    const key = `designer_route_layout_${designer.selectedOrderId}`;
    
    try {
      await api("/api/settings", {
        method: "POST",
        body: JSON.stringify({ key, value: JSON.stringify(layoutData) })
      });
      toast("✅ Layout сохранён");
    } catch(e) {
      console.error("[DESIGNER] Error saving route layout:", e);
      toast("⚠️ Ошибка сохранения layout");
    }
  }
  
  // Загрузка layout узлов для заказа
  async function loadRouteLayout(orderId) {
    if(!orderId) return;
    
    const key = `designer_route_layout_${orderId}`;
    
    try {
      const settings = await api("/api/settings/user");
      const layoutJson = settings[key];
      
      if(layoutJson) {
        const layoutData = typeof layoutJson === 'string' ? JSON.parse(layoutJson) : layoutJson;
        
        // Применяем сохранённые позиции к узлам
        (designer.routeNodes || []).forEach(node => {
          if(layoutData[node.id]) {
            node.x = layoutData[node.id].x;
            node.y = layoutData[node.id].y;
          }
        });
        
        console.log("[DESIGNER] Route layout loaded for order:", orderId);
      }
    } catch(e) {
      console.error("[DESIGNER] Error loading route layout:", e);
    }
  }
  
  // --- Render Functions ---
  function renderDesignerLayoutSelect() {
    const sel = $("designerLayoutSelect");
    if(!sel) {
      console.warn("[DESIGNER] renderDesignerLayoutSelect: selector not found");
      return;
    }
    console.log("[DESIGNER] Rendering layout select, layouts count:", designer.layouts?.length || 0);
    const currentValue = sel.value;
    sel.innerHTML = (designer.layouts || []).map(l => 
      `<option value="${esc(l.id)}">${esc(l.name)}${l.is_default ? ' ⭐' : ''}</option>`
    ).join('') || '<option value="">Цеха ещё нет</option>';
    if(currentValue && Array.from(sel.options).some(opt => opt.value === currentValue)) {
      sel.value = currentValue;
    } else if(designer.layouts && designer.layouts.length > 0 && designer.currentLayoutId) {
      if(Array.from(sel.options).some(opt => opt.value === designer.currentLayoutId)) {
        sel.value = designer.currentLayoutId;
      }
    }
    console.log("[DESIGNER] Layout select rendered, current value:", sel.value);
  }
  
  function renderDesignerMachinesList() {
    const container = $("designerMachinesList");
    if(!container) return;
    
    // Используем machinesData (объекты с id и name) если есть, иначе fallback на machines
    const machinesData = state.machinesData || [];
    const machines = state.machines || [];
    
    // Определяем есть ли у нас полные данные
    const hasFullData = machinesData.length > 0 && typeof machinesData[0] === 'object' && 'id' in machinesData[0];
    console.log("renderDesignerMachinesList: machinesData =", machinesData.length, "hasFullData:", hasFullData);
    
    if((hasFullData ? machinesData : machines).length === 0) {
      container.innerHTML = '<div style="color:var(--muted);font-size:12px">Нет машин (загружаются...)</div>';
      return;
    }
    
    const onCanvasIds = new Set((designer.floorMachines || []).map(fm => fm.machine_id));
    const machineStatuses = designer.machineStatuses || {};
    
    if(hasFullData) {
      // Полные данные: используем реальные id из БД
      container.innerHTML = machinesData.map(m => {
        const machineId = m.id;
        const machineName = m.name;
        const isOnCanvas = onCanvasIds.has(machineId);
        const status = machineStatuses[machineId];
        const statusClass = status?.status || 'offline';
        return `<label class="designer-checkbox-item ${isOnCanvas ? 'on-canvas' : ''}">
          <input type="checkbox" data-machine-id="${machineId}" ${isOnCanvas ? 'checked' : ''}>
          <span class="status-dot ${statusClass}"></span>
          <span>${esc(machineName)}</span>
        </label>`;
      }).join('');
    } else {
      // Fallback: старый формат (массив строк)
      container.innerHTML = machines.map((machineName, idx) => {
        const machineId = idx + 1;
        const isOnCanvas = onCanvasIds.has(machineId);
        const status = machineStatuses[machineId];
        const statusClass = status?.status || 'offline';
        return `<label class="designer-checkbox-item ${isOnCanvas ? 'on-canvas' : ''}">
          <input type="checkbox" data-machine-id="${machineId}" ${isOnCanvas ? 'checked' : ''}>
          <span class="status-dot ${statusClass}"></span>
          <span>${esc(machineName)}</span>
        </label>`;
      }).join('');
    }
    
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.onchange = async () => {
        const machineId = parseInt(cb.dataset.machineId);
        if(cb.checked) {
          await addMachineToCanvas(machineId);
        } else {
          await removeMachineFromCanvas(machineId);
        }
      };
    });
  }
  
  function renderDesignerOperatorsList() {
    const container = $("designerOperatorsList");
    if(!container) return;
    
    // Используем operatorsData (объекты с id и name) если есть
    const operatorsData = state.operatorsData || [];
    const operators = state.operators || [];
    
    const hasFullData = operatorsData.length > 0 && typeof operatorsData[0] === 'object' && 'id' in operatorsData[0];
    console.log("renderDesignerOperatorsList: operatorsData =", operatorsData.length, "hasFullData:", hasFullData, "first:", operatorsData[0]);
    
    if((hasFullData ? operatorsData : operators).length === 0) {
      container.innerHTML = '<div style="color:var(--muted);font-size:12px">Нет операторов (загружаются...)</div>';
      return;
    }
    
    const onCanvasIds = new Set((designer.floorOperators || []).map(fo => fo.operator_id));
    
    if(hasFullData) {
      // Полные данные: используем реальные id из БД
      container.innerHTML = operatorsData.map(o => {
        const operatorId = o.id;
        const operatorName = o.name;
        const isOnCanvas = onCanvasIds.has(operatorId);
        return `<label class="designer-checkbox-item ${isOnCanvas ? 'on-canvas' : ''}">
          <input type="checkbox" data-operator-id="${operatorId}" ${isOnCanvas ? 'checked' : ''}>
          <span>👤 ${esc(operatorName)}</span>
        </label>`;
      }).join('');
    } else {
      // Fallback: старый формат
      container.innerHTML = operators.map((operatorName, idx) => {
        const operatorId = idx + 1;
        const isOnCanvas = onCanvasIds.has(operatorId);
        return `<label class="designer-checkbox-item ${isOnCanvas ? 'on-canvas' : ''}">
          <input type="checkbox" data-operator-id="${operatorId}" ${isOnCanvas ? 'checked' : ''}>
          <span>👤 ${esc(operatorName)}</span>
        </label>`;
      }).join('');
    }
    
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.onchange = async () => {
        const operatorId = parseInt(cb.dataset.operatorId);
        if(cb.checked) {
          await addOperatorToCanvas(operatorId);
        } else {
          await removeOperatorFromCanvas(operatorId);
        }
      };
    });
  }
  
  function renderDesignerZonesList() {
    const container = $("designerZonesList");
    if(!container) return;
    
    container.innerHTML = designer.floorZones.map(z => 
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
        <span style="display:flex;align-items:center;gap:6px">
          <span style="width:12px;height:12px;border-radius:2px;background:${esc(z.color)}"></span>
          ${esc(z.name)}
        </span>
        <button class="btn ghost" data-zone-delete="${esc(z.id)}" style="padding:2px 6px;font-size:10px">×</button>
      </div>`
    ).join('') || '<div style="color:var(--muted)">Нет зон</div>';
    
    container.querySelectorAll('[data-zone-delete]').forEach(btn => {
      btn.onclick = async () => {
        const zoneId = btn.dataset.zoneDelete;
        if(confirm("Удалить зону?")) {
          await deleteFloorZone(zoneId);
        }
      };
    });
  }
  
  function renderDesignerCamerasList() {
    const container = $("designerCamerasList");
    if(!container) return;
    
    container.innerHTML = designer.cameras.map(c =>
      `<button type="button" class="btn ghost" data-camera-settings="${esc(c.id)}" style="width:100%;min-height:44px;margin:4px 0;white-space:normal;text-align:left">📹 ${esc(c.name)} · настроить</button>`
    ).join('') || '<div style="color:var(--muted)">Камер пока нет. Добавьте камеру кнопкой +.</div>';
    container.querySelectorAll('[data-camera-settings]').forEach(button => {
      button.onclick = () => {
        const camera = designer.cameras.find(c => c.id === button.dataset.cameraSettings);
        if (!camera) return;
        designer.selectedType = 'camera'; designer.selectedData = camera;
        showInfoPanel('camera', camera);
      };
    });
  }
  
  function renderDesignerBottlenecks(analytics) {
    const container = $("designerBottlenecks");
    if(!container) return;
    
    if(!analytics || !analytics.bottlenecks || analytics.bottlenecks.length === 0) {
      container.innerHTML = '<div style="color:var(--muted);font-style:italic">По схеме связей узкие места не найдены. Это не оценка реальной загрузки оборудования.</div>';
      return;
    }
    
    container.innerHTML = analytics.bottlenecks.map(b => `
      <div class="card" style="padding:10px;background:rgba(255,77,77,0.08);border:1px solid var(--bad)">
        <div style="font-weight:600;margin-bottom:4px">${esc(b.machine_name)}</div>
        <div style="font-size:11px;color:var(--muted)">Входящих связей: ${Number(b.inbound_connections) || 0} · исходящих: ${Number(b.outbound_connections) || 0}</div>
      </div>
    `).join('');
  }
  
  // Continue with canvas rendering, drag & drop, etc...
  // (This is a partial implementation - the full module would include all designer functions)
  
  function renderDesignerCanvas() {
    const machinesLayer = $("designerMachinesLayer");
    const connectionsLayer = $("designerConnectionsLayer");
    const operatorsLayer = $("designerOperatorsLayer");
    const zonesLayer = $("designerZonesLayer");
    const warehousesLayer = $("designerWarehousesLayer");
    const camerasLayer = $("designerCamerasLayer");
    const svg = $("designerSvg");
    
    if(!machinesLayer || !connectionsLayer) {
      console.log("[DESIGNER] Missing layers - machinesLayer:", !!machinesLayer, "connectionsLayer:", !!connectionsLayer);
      return;
    }
    
    // Clear layers
    machinesLayer.innerHTML = '';
    if(connectionsLayer) connectionsLayer.innerHTML = '';
    operatorsLayer.innerHTML = '';
    zonesLayer.innerHTML = '';
    if(warehousesLayer) warehousesLayer.innerHTML = '';
    if(camerasLayer) camerasLayer.innerHTML = '';
    
    // Рендерим визуальную сетку 8x8 (64 квадрата)
    // Создаём или получаем слой для сетки
    let gridLayer = document.getElementById("designerGridLayer");
    if(!gridLayer && svg) {
      gridLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gridLayer.id = "designerGridLayer";
      gridLayer.style.pointerEvents = "none"; // Сетка не должна мешать взаимодействию
      // Вставляем сетку после фона, но перед всеми остальными элементами
      const background = svg.querySelector("#designerBackground");
      if(background && background.parentNode) {
        background.parentNode.insertBefore(gridLayer, background.nextSibling);
      } else if(svg.firstChild) {
        svg.insertBefore(gridLayer, svg.firstChild.nextSibling);
      } else {
        svg.appendChild(gridLayer);
      }
    }
    
    if(gridLayer) {
      gridLayer.innerHTML = ''; // Очищаем предыдущую сетку
      
      // Параметры сетки 8x8
      const totalColumns = 8;
      const totalRows = 8;
      const startX = 200;
      const startY = 80;
      const columnWidth = 150;
      const rowHeight = 90;
      const gridWidth = totalColumns * columnWidth;
      const gridHeight = totalRows * rowHeight;
      
      // Рисуем вертикальные линии (8 колонок = 9 линий)
      for(let i = 0; i <= totalColumns; i++) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", startX + (i * columnWidth));
        line.setAttribute("y1", startY);
        line.setAttribute("x2", startX + (i * columnWidth));
        line.setAttribute("y2", startY + gridHeight);
        line.setAttribute("stroke", "#d0d0d0");
        line.setAttribute("stroke-width", "1");
        line.setAttribute("stroke-dasharray", "4 4");
        line.setAttribute("opacity", "0.6");
        gridLayer.appendChild(line);
      }
      
      // Рисуем горизонтальные линии (8 строк = 9 линий)
      for(let i = 0; i <= totalRows; i++) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", startX);
        line.setAttribute("y1", startY + (i * rowHeight));
        line.setAttribute("x2", startX + gridWidth);
        line.setAttribute("y2", startY + (i * rowHeight));
        line.setAttribute("stroke", "#d0d0d0");
        line.setAttribute("stroke-width", "1");
        line.setAttribute("stroke-dasharray", "4 4");
        line.setAttribute("opacity", "0.6");
        gridLayer.appendChild(line);
      }
      
      // Добавляем номера колонок и строк для удобства
      for(let col = 0; col < totalColumns; col++) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", startX + (col * columnWidth) + (columnWidth / 2));
        text.setAttribute("y", startY - 10);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "12");
        text.setAttribute("font-weight", "600");
        text.setAttribute("fill", "#999");
        text.textContent = `Колонка ${col + 1}`;
        gridLayer.appendChild(text);
      }
      
      for(let row = 0; row < totalRows; row++) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", startX - 10);
        text.setAttribute("y", startY + (row * rowHeight) + (rowHeight / 2));
        text.setAttribute("text-anchor", "end");
        text.setAttribute("font-size", "12");
        text.setAttribute("font-weight", "600");
        text.setAttribute("fill", "#999");
        text.setAttribute("dominant-baseline", "middle");
        text.textContent = `Строка ${row + 1}`;
        gridLayer.appendChild(text);
      }
    }
    
    // Render product templates FIRST (большие круги - первый элемент маршрута)
    designer.floorProductTemplates.forEach(fpt => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.classList.add("designer-product-template");
      g.dataset.floorProductTemplateId = fpt.id;
      g.dataset.productTemplateId = fpt.product_template_id;
      
      const x = fpt.x || 50;
      const y = fpt.y || 50;
      const radius = fpt.radius || 40;
      const color = fpt.color || '#FF6B6B';
      const label = fpt.label || fpt.template_name || fpt.template_type || 'Шаблон';
      
      g.innerHTML = `
        <circle cx="${x}" cy="${y}" r="${radius}" 
          fill="${color}" 
          stroke="white" 
          stroke-width="3"
          opacity="0.9"/>
        <circle cx="${x}" cy="${y}" r="${radius - 3}" 
          fill="none" 
          stroke="white" 
          stroke-width="1"
          stroke-dasharray="4 2"
          opacity="0.5"/>
        <text class="designer-product-template-icon" x="${x}" y="${y - 8}" text-anchor="middle" font-size="24">📦</text>
        <text class="designer-product-template-label" x="${x}" y="${y + radius + 16}" text-anchor="middle" font-size="11" font-weight="600" fill="#333">${esc(label)}</text>
      `;
      
      machinesLayer.appendChild(g);
      makeElementDraggable(g, 'product-template', fpt);
      
      g.onclick = (e) => {
        if(!designer.isDragging) {
          e.stopPropagation();
          if(designer.currentTool === 'connect') {
            handleConnectionClick(fpt, 'product-template');
          } else {
            selectElement(g, 'product-template', fpt);
          }
        }
      };
      
      // Сохраняем ID в data для использования в handleConnectionClick
      fpt.floorProductTemplateId = fpt.id;
    });
    
    // Render zones
    designer.floorZones.forEach(zone => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.classList.add("designer-zone");
      g.dataset.zoneId = zone.id;
      g.innerHTML = `
        <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}" 
          fill="${zone.color || 'rgba(0,207,181,0.1)'}" stroke="${zone.border_color || '#00CFB5'}" stroke-width="2" rx="8"/>
        <text class="designer-zone-label" x="${zone.x + 10}" y="${zone.y + 20}">${esc(zone.name)}</text>
      `;
      zonesLayer.appendChild(g);
      makeElementDraggable(g, 'zone', zone);
    });
    
    // Render warehouses (склады)
    if(warehousesLayer) {
      designer.floorWarehouses.forEach(warehouse => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.classList.add("designer-warehouse");
        g.dataset.warehouseId = warehouse.id;
        g.dataset.warehouseType = warehouse.warehouse_type;
        
        const x = warehouse.x || 50;
        const y = warehouse.y || 50;
        const width = warehouse.width || 120;
        const height = warehouse.height || 80;
        const color = warehouse.color || (warehouse.warehouse_type === 'warehouse' ? '#4CAF50' : '#FF9800');
        const label = warehouse.label || (warehouse.warehouse_type === 'warehouse' ? '🏭 Склад' : '💤 Отдых');
        const icon = warehouse.warehouse_type === 'warehouse' ? '🏭' : '💤';
        
        g.innerHTML = `
          <rect x="${x}" y="${y}" width="${width}" height="${height}" 
            fill="${color}" fill-opacity="0.8" stroke="white" stroke-width="3" rx="8"/>
          <rect x="${x}" y="${y}" width="${width}" height="${height}" 
            fill="none" stroke="white" stroke-width="1" stroke-dasharray="4 2" rx="8" opacity="0.5"/>
          <text class="designer-warehouse-icon" x="${x + width/2}" y="${y + height/2 - 8}" text-anchor="middle" font-size="32">${icon}</text>
          <text class="designer-warehouse-label" x="${x + width/2}" y="${y + height + 18}" text-anchor="middle" font-size="12" font-weight="600" fill="#333">${esc(label)}</text>
        `;
        
        warehousesLayer.appendChild(g);
        makeElementDraggable(g, 'warehouse', warehouse);
        
        g.onclick = (e) => {
          if(!designer.isDragging) {
            e.stopPropagation();
            if(designer.currentTool === 'connect') {
              handleConnectionClick(warehouse, 'warehouse');
            } else {
              selectElement(g, 'warehouse', warehouse);
            }
          }
        };
      });
    }
    
    // Render connections (гибкие кривые, обходящие машины)
    // Если выбран заказ - связи рендерятся в renderRouteGraph(), иначе floorConnections
    if(!designer.selectedOrderId) {
      // Отрисовываем floorConnections (legacy, не используется в новом режиме)
      console.log('[DESIGNER] renderDesignerCanvas: Отрисовка floorConnections, всего:', designer.floorConnections?.length || 0);
      (designer.floorConnections || []).forEach(conn => {
      // Поддержка нового и старого формата
      const fromType = conn.from_type || 'machine';
      const toType = conn.to_type || 'machine';
      const fromId = conn.from_id || conn.from_machine_id;
      const toId = conn.to_id || conn.to_machine_id;
      
      const fromPos = getConnectionPoint(fromType, fromId, conn);
      const toPos = getConnectionPoint(toType, toId, conn);
      
      if(!fromPos || !toPos) {
          // Тихо пропускаем связи, которые не могут быть отрисованы
        return;
      }
      
      // Вычисляем путь с обходом машин
      const pathData = calculateSmartPath(fromPos, toPos, fromId, toId, conn);
      
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("designer-connection");
      path.classList.add(`conn-${fromType}-${toType}`);
      if(conn.is_critical) path.classList.add("critical");
      path.dataset.connectionId = conn.id;
      path.dataset.fromType = fromType;
      path.dataset.toType = toType;
      path.setAttribute("d", pathData.d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-width", "2");
      
      // Разные стили для разных типов связей
      if(fromType === 'camera' || toType === 'camera') {
        path.setAttribute("stroke-dasharray", "4 2");
        path.setAttribute("stroke", "#ff4d4d");
      } else if(fromType === 'operator' || toType === 'operator') {
        path.setAttribute("stroke-dasharray", "6 3");
        path.setAttribute("stroke", "#00CFB5");
      } else if(fromType === 'warehouse' || toType === 'warehouse') {
        path.setAttribute("stroke-dasharray", "8 4");
        path.setAttribute("stroke", "#FF9800");
      } else if(fromType === 'product-template' || toType === 'product-template') {
        path.setAttribute("stroke-dasharray", "10 5");
        path.setAttribute("stroke", "#FF6B6B");
      } else {
        // Связи между машинами - сплошная линия
        path.setAttribute("stroke", conn.is_critical ? "#ff4d4d" : "#030056");
      }
      
      path.setAttribute("marker-end", conn.is_critical ? "url(#arrowEndRed)" : "url(#arrowEnd)");
      
      // Добавляем номер последовательности если есть
      if(conn.seq_order > 0) {
        const midX = pathData.midX;
        const midY = pathData.midY;
        const seqBadge = document.createElementNS("http://www.w3.org/2000/svg", "g");
        seqBadge.innerHTML = `
          <circle cx="${midX}" cy="${midY}" r="12" fill="white" stroke="#030056" stroke-width="1"/>
          <text x="${midX}" y="${midY + 4}" text-anchor="middle" font-size="10" font-weight="600" fill="#030056">${conn.seq_order}</text>
        `;
        connectionsLayer.appendChild(seqBadge);
      }
      
      path.onclick = (e) => {
        e.stopPropagation();
        selectElement(path, 'connection', conn);
      };
      
      connectionsLayer.appendChild(path);
      
      // Добавляем анимированную точку движения по маршруту
      if(fromType === 'machine' && toType === 'machine') {
        const flowDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        flowDot.classList.add("flow-dot");
        flowDot.setAttribute("r", "5");
        flowDot.setAttribute("fill", conn.is_critical ? "#ff4d4d" : "#030056");
        flowDot.setAttribute("opacity", "0.8");
        flowDot.dataset.pathId = conn.id;
        connectionsLayer.appendChild(flowDot);
        
        // Запускаем анимацию
        animateFlowDot(flowDot, path, conn.is_critical ? 2000 : 3000);
      }
    });
    }
    
    // Анимация точки вдоль пути
    function animateFlowDot(dot, path, duration) {
      const pathLength = path.getTotalLength();
      let startTime = null;
      
      function animate(timestamp) {
        if(!document.body.contains(dot)) return; // Прекращаем если элемент удалён
        
        if(!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = (elapsed % duration) / duration;
        
        try {
          const point = path.getPointAtLength(progress * pathLength);
          dot.setAttribute("cx", point.x);
          dot.setAttribute("cy", point.y);
        } catch(e) {
          return; // Path был удалён
        }
        
        requestAnimationFrame(animate);
      }
      
      requestAnimationFrame(animate);
    }
    
    // Функция расчёта умного пути с обходом машин
    function calculateSmartPath(from, to, fromId, toId, conn) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Получаем все машины-препятствия (исключая начальную и конечную)
      const obstacles = designer.floorMachines.filter(m => 
        m.id !== fromId && m.id !== toId
      ).map(m => ({
        x: m.x,
        y: m.y,
        w: m.width || 60,
        h: m.height || 40,
        cx: m.x + (m.width || 60) / 2,
        cy: m.y + (m.height || 40) / 2
      }));
      
      // Проверяем, пересекает ли прямая линия какие-либо машины
      const intersecting = obstacles.filter(obs => 
        lineIntersectsRect(from.x, from.y, to.x, to.y, obs.x, obs.y, obs.w, obs.h)
      );
      
      if(intersecting.length === 0) {
        // Нет пересечений - используем плавную кривую Безье
        const curve = 0.15; // Небольшой изгиб для красоты
        const perpX = -dy * curve;
        const perpY = dx * curve;
        const cx1 = from.x + dx * 0.3 + perpX;
        const cy1 = from.y + dy * 0.3 + perpY;
        const cx2 = from.x + dx * 0.7 + perpX;
        const cy2 = from.y + dy * 0.7 + perpY;
        
        return {
          d: `M ${from.x} ${from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${to.x} ${to.y}`,
          midX: from.x + dx * 0.5 + perpX * 0.5,
          midY: from.y + dy * 0.5 + perpY * 0.5
        };
      }
      
      // Есть пересечения - строим обходной путь
      const waypoints = calculateWaypoints(from, to, intersecting, obstacles);
      
      if(waypoints.length === 0) {
        // Fallback: обходим сверху или снизу
        const avgObsY = intersecting.reduce((sum, o) => sum + o.cy, 0) / intersecting.length;
        const goAbove = from.y < avgObsY;
        const offset = goAbove ? -60 : 60;
        
        const midX = (from.x + to.x) / 2;
        const midY = Math.min(from.y, to.y) + offset * (goAbove ? 1 : -1);
        
        return {
          d: `M ${from.x} ${from.y} Q ${midX} ${midY}, ${to.x} ${to.y}`,
          midX: midX,
          midY: midY
        };
      }
      
      // Строим путь через waypoints с кривыми
      let d = `M ${from.x} ${from.y}`;
      let prevPoint = from;
      
      for(let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const nextPoint = i < waypoints.length - 1 ? waypoints[i + 1] : to;
        
        // Контрольные точки для сглаживания
        const cx = (prevPoint.x + wp.x) / 2;
        const cy = (prevPoint.y + wp.y) / 2;
        
        d += ` Q ${cx} ${cy}, ${wp.x} ${wp.y}`;
        prevPoint = wp;
      }
      
      // Финальный сегмент до конечной точки
      const cx = (prevPoint.x + to.x) / 2;
      const cy = (prevPoint.y + to.y) / 2;
      d += ` Q ${cx} ${cy}, ${to.x} ${to.y}`;
      
      const midIdx = Math.floor(waypoints.length / 2);
      const midPoint = waypoints.length > 0 ? waypoints[midIdx] : { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      
      return {
        d: d,
        midX: midPoint.x,
        midY: midPoint.y
      };
    }
    
    function calculateWaypoints(from, to, intersecting, allObstacles) {
      const waypoints = [];
      
      // Сортируем препятствия по расстоянию от начальной точки
      intersecting.sort((a, b) => {
        const distA = Math.sqrt(Math.pow(a.cx - from.x, 2) + Math.pow(a.cy - from.y, 2));
        const distB = Math.sqrt(Math.pow(b.cx - from.x, 2) + Math.pow(b.cy - from.y, 2));
        return distA - distB;
      });
      
      // Для каждого препятствия выбираем точку обхода
      for(const obs of intersecting) {
        const margin = 30; // Отступ от края машины
        
        // Определяем лучшую сторону для обхода
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        
        // 4 возможные точки обхода (углы + отступ)
        const candidates = [
          { x: obs.x - margin, y: obs.cy, side: 'left' },
          { x: obs.x + obs.w + margin, y: obs.cy, side: 'right' },
          { x: obs.cx, y: obs.y - margin, side: 'top' },
          { x: obs.cx, y: obs.y + obs.h + margin, side: 'bottom' }
        ];
        
        // Выбираем точку, которая минимизирует общую длину пути
        let best = candidates[0];
        let bestScore = Infinity;
        
        for(const c of candidates) {
          const distFromStart = Math.sqrt(Math.pow(c.x - from.x, 2) + Math.pow(c.y - from.y, 2));
          const distToEnd = Math.sqrt(Math.pow(c.x - to.x, 2) + Math.pow(c.y - to.y, 2));
          const score = distFromStart + distToEnd;
          
          // Проверяем, не пересекает ли этот путь другие препятствия
          const blocked = allObstacles.some(other => 
            other !== obs && 
            (lineIntersectsRect(from.x, from.y, c.x, c.y, other.x, other.y, other.w, other.h) ||
             lineIntersectsRect(c.x, c.y, to.x, to.y, other.x, other.y, other.w, other.h))
          );
          
          if(!blocked && score < bestScore) {
            bestScore = score;
            best = c;
          }
        }
        
        waypoints.push(best);
      }
      
      return waypoints;
    }
    
    function lineIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
      // Проверяем пересечение отрезка с прямоугольником
      const padding = 10; // Небольшой отступ
      rx -= padding;
      ry -= padding;
      rw += padding * 2;
      rh += padding * 2;
      
      // Проверяем пересечение с каждой стороной прямоугольника
      return lineIntersectsLine(x1, y1, x2, y2, rx, ry, rx + rw, ry) ||
             lineIntersectsLine(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh) ||
             lineIntersectsLine(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh) ||
             lineIntersectsLine(x1, y1, x2, y2, rx, ry, rx, ry + rh) ||
             (x1 > rx && x1 < rx + rw && y1 > ry && y1 < ry + rh); // Начало внутри
    }
    
    function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
      const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
      if(Math.abs(denom) < 0.0001) return false;
      
      const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
      const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
      
      return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
    }
    
    function getConnectionPoint(type, id, conn) {
      // Поддержка product-template (шаблон изделия)
      if(type === 'product-template') {
        const fpt = designer.floorProductTemplates.find(t => t.id === id);
        if(fpt) {
          const radius = fpt.radius || 40;
          // Точка выхода справа от круга
          return {
            x: (fpt.x || 50) + radius,
            y: fpt.y || 50
          };
        }
        return null;
      }
      if(type === 'machine') {
        const m = designer.floorMachines.find(m => m.id === id);
        if(!m) {
          // Тихо пропускаем, если машина не найдена (может быть удалена или ещё не загружена)
          return null;
        }
        
        const w = m.width || 60;
        const h = m.height || 40;
        
        // Используем сохранённые позиции портов
        if(conn) {
          const isFrom = conn.from_id === id || conn.from_machine_id === id;
          
          if(isFrom) {
            // Выход (output port)
            const offsetX = m.output_port_offset_x ?? 8;
            const offsetY = m.output_port_offset_y ?? 0.5;
            return { 
              x: m.x + (offsetX < 0 ? offsetX : w + offsetX), 
              y: m.y + h * offsetY 
            };
          } else {
            // Вход (input port)
            const offsetX = m.input_port_offset_x ?? -8;
            const offsetY = m.input_port_offset_y ?? 0.5;
            return { 
              x: m.x + (offsetX < 0 ? offsetX : w + offsetX), 
              y: m.y + h * offsetY 
            };
          }
        }
        
        return { x: m.x + w / 2, y: m.y + h / 2 };
      } else if(type === 'operator') {
        const o = designer.floorOperators.find(o => o.id === id);
        if(!o) return null;
        return { x: o.x || 0, y: o.y || 0 };
      } else if(type === 'camera') {
        const c = designer.cameras.find(c => c.id === id);
        if(!c) return null;
        return { x: c.x || 0, y: c.y || 0 };
      } else if(type === 'warehouse') {
        const wh = designer.floorWarehouses.find(wh => wh.id === id);
        if(!wh) return null;
        return { x: (wh.x || 0) + (wh.width || 120) / 2, y: (wh.y || 0) + (wh.height || 80) / 2 };
      }
      return null;
    }
    
    // Render machines
    designer.floorMachines.forEach(fm => {
      const status = designer.machineStatuses[fm.machine_id]?.status || 'offline';
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.classList.add("designer-machine");
      g.dataset.floorMachineId = fm.id;
      g.dataset.machineId = fm.machine_id;
      g.dataset.status = status;
      
      const w = fm.width || 60;
      const h = fm.height || 40;
      // state.machines - массив строк, индекс = ID - 1
      const machineName = fm.machine_name || (state.machines || [])[fm.machine_id - 1] || `Машина #${fm.machine_id}`;
      
      // Порты входа/выхода - используем сохранённые смещения или дефолтные
      const portRadius = 8;
      // offset_y хранится как доля от высоты (0-1), offset_x как абсолютное смещение
      const inputOffsetX = fm.input_port_offset_x ?? -8;
      const inputOffsetY = fm.input_port_offset_y ?? 0.5;
      const outputOffsetX = fm.output_port_offset_x ?? 8;
      const outputOffsetY = fm.output_port_offset_y ?? 0.5;
      
      // Вычисляем абсолютные позиции портов
      const inputX = fm.x + (inputOffsetX < 0 ? inputOffsetX : w + inputOffsetX);
      const inputY = fm.y + h * inputOffsetY;
      const outputX = fm.x + (outputOffsetX < 0 ? outputOffsetX : w + outputOffsetX);
      const outputY = fm.y + h * outputOffsetY;
      const bufferX = fm.x + w / 2;
      const bufferY = fm.y + h + 15;
      
      g.innerHTML = `
        <rect x="${fm.x}" y="${fm.y}" width="${w}" height="${h}" 
          fill="${fm.color || '#00CFB5'}" rx="8" stroke="#030056" stroke-width="2"/>
        <text class="designer-machine-label" x="${fm.x + w/2}" y="${fm.y + h/2 - 5}" text-anchor="middle">${esc(machineName)}</text>
        <text class="designer-machine-status" x="${fm.x + w/2}" y="${fm.y + h/2 + 12}" text-anchor="middle">${getStatusText(status)}</text>
        
        <!-- Порт ВХОДА (зелёный) - перетаскиваемый -->
        <g class="port port-input draggable-port" data-port="input" data-machine-id="${fm.id}">
          <circle cx="${inputX}" cy="${inputY}" r="${portRadius}" fill="#4caf50" stroke="white" stroke-width="2"/>
          <text x="${inputX}" y="${inputY + 3}" text-anchor="middle" font-size="10" fill="white" style="pointer-events:none">▶</text>
        </g>
        
        <!-- Порт ВЫХОДА (оранжевый) - перетаскиваемый -->
        <g class="port port-output draggable-port" data-port="output" data-machine-id="${fm.id}">
          <circle cx="${outputX}" cy="${outputY}" r="${portRadius}" fill="#ff9800" stroke="white" stroke-width="2"/>
          <text x="${outputX}" y="${outputY + 3}" text-anchor="middle" font-size="10" fill="white" style="pointer-events:none">▶</text>
        </g>
        
        <!-- Порт БУФЕРА/ОТДЫХ (синий, снизу) -->
        <g class="port port-buffer" data-port="buffer" data-machine-id="${fm.id}" style="opacity:0.6">
          <rect x="${bufferX - 12}" y="${bufferY - 6}" width="24" height="12" rx="3" fill="#2196f3" stroke="white" stroke-width="1"/>
          <text x="${bufferX}" y="${bufferY + 3}" text-anchor="middle" font-size="8" fill="white" style="pointer-events:none">⏸</text>
        </g>
      `;
      
      // Сохраняем позиции портов для связей
      fm.ports = {
        input: { x: inputX, y: inputY },
        output: { x: outputX, y: outputY },
        buffer: { x: bufferX, y: bufferY }
      };
      
      machinesLayer.appendChild(g);
      makeElementDraggable(g, 'machine', fm);
      
      // Делаем порты перетаскиваемыми
      makePortDraggable(g.querySelector('.port-input'), fm, 'input');
      makePortDraggable(g.querySelector('.port-output'), fm, 'output');
      
      // Обработчики кликов на портах
      g.querySelectorAll('.port').forEach(port => {
        port.style.cursor = 'pointer';
        port.onclick = (e) => {
          e.stopPropagation();
          const portType = port.dataset.port;
          if(designer.currentTool === 'connect') {
            handlePortConnectionClick(fm, portType);
          } else {
            showPortInfo(fm, portType);
          }
        };
      });
      
      g.onclick = (e) => {
        if(!designer.isDragging) {
          e.stopPropagation();
          if(designer.currentTool === 'connect') {
            handleConnectionClick(fm, 'machine');
          } else {
            selectElement(g, 'machine', fm);
          }
        }
      };
    });
    
    // Render operators
    designer.floorOperators.forEach(fo => {
      let x = fo.x || 0;
      let y = fo.y || 0;
      
      if(fo.machine_floor_id) {
        const machine = designer.floorMachines.find(m => m.id === fo.machine_floor_id);
        if(machine) {
          x = machine.x + (machine.width || 60) / 2 + (fo.offset_x || 0);
          y = machine.y + (machine.height || 40) + (fo.offset_y || 20);
        }
      }
      
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.classList.add("designer-operator");
      g.dataset.floorOperatorId = fo.id;
      g.dataset.operatorId = fo.operator_id;
      
      // state.operators - массив строк, индекс = ID - 1
      const operatorName = fo.operator_name || (state.operators || [])[fo.operator_id - 1] || `Оператор #${fo.operator_id}`;
      
      g.innerHTML = `
        <circle cx="${x}" cy="${y}" r="16" fill="var(--accent)" stroke="white" stroke-width="2"/>
        <text class="designer-operator-icon" x="${x}" y="${y + 6}" text-anchor="middle">👤</text>
        <text class="designer-operator-label" x="${x}" y="${y + 32}" text-anchor="middle">${esc(operatorName)}</text>
      `;
      
      operatorsLayer.appendChild(g);
      makeElementDraggable(g, 'operator', fo);
      
      g.onclick = (e) => {
        if(!designer.isDragging) {
          e.stopPropagation();
          if(designer.currentTool === 'connect') {
            handleConnectionClick(fo, 'operator');
          } else {
            selectElement(g, 'operator', fo);
          }
        }
      };
    });
    
    // Render cameras
    if(camerasLayer) {
      designer.cameras.forEach(cam => {
        // Дефолтные координаты если не заданы
        const x = cam.x || 100;
        const y = cam.y || 100;
        cam.x = x; // Сохраняем для drag
        cam.y = y;
        
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.classList.add("designer-camera");
        g.dataset.cameraId = cam.id;
        g.innerHTML = `
          <circle cx="${x}" cy="${y}" r="14" fill="#ff4d4d" stroke="white" stroke-width="2" style="cursor:move"/>
          <text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" fill="white" style="pointer-events:none">📹</text>
          <text class="designer-camera-label" x="${x}" y="${y + 32}" text-anchor="middle" font-size="10" style="pointer-events:none">${esc(cam.name || 'Камера')}</text>
        `;
        camerasLayer.appendChild(g);
        makeCameraDraggable(g, cam);
        
        g.onclick = (e) => {
          if(!designer.isDragging) {
            e.stopPropagation();
            if(designer.currentTool === 'connect') {
              handleConnectionClick(cam, 'camera');
            } else {
              selectElement(g, 'camera', cam);
            }
          }
        };
      });
    }
    
    // === НОВЫЙ КОД: Рендеринг узлов и ребер маршрута заказа ===
    // Отрисовываем узлы маршрута только если выбран заказ
    if(designer.selectedOrderId && designer.routeNodes && designer.routeNodes.length > 0) {
      console.log("[DESIGNER] Rendering route graph - nodes:", designer.routeNodes.length, "edges:", designer.routeEdges?.length || 0);
    renderRouteGraph(machinesLayer, connectionsLayer);
    } else {
      console.log("[DESIGNER] Skipping route graph render - selectedOrderId:", designer.selectedOrderId, "routeNodes:", designer.routeNodes?.length || 0);
    }
    
    applyCanvasTransform();
    updateMinimap();
  }
  
  // Рендеринг графа маршрута заказа
  function renderRouteGraph(machinesLayer, connectionsLayer) {
    if(!designer.routeNodes || designer.routeNodes.length === 0) {
      console.log('[DESIGNER] No route nodes to render');
      return;
    }
    if(!machinesLayer || !connectionsLayer) {
      console.log('[DESIGNER] Missing layers for rendering');
      return;
    }
    
    const nodesWithCoords = designer.routeNodes.filter(n => 
      n.x !== undefined && n.y !== undefined && 
      !isNaN(n.x) && !isNaN(n.y) && 
      typeof n.x === 'number' && typeof n.y === 'number'
    );
    console.log('[DESIGNER] Rendering route graph:', designer.routeNodes.length, 'nodes,', designer.routeEdges.length, 'edges');
    console.log('[DESIGNER] Nodes with valid coordinates:', nodesWithCoords.length, 'of', designer.routeNodes.length);
    
    if(nodesWithCoords.length > 0 && nodesWithCoords.length < designer.routeNodes.length) {
      const nodesWithoutCoords = designer.routeNodes.filter(n => 
        n.x === undefined || n.y === undefined || isNaN(n.x) || isNaN(n.y)
      );
      console.warn('[DESIGNER] Some nodes missing coordinates:', nodesWithoutCoords.map(n => ({ id: n.id, label: n.label })));
    }
    
    // Рендерим заголовки групп изделий
    const renderedGroups = new Set();
    (designer.routeNodes || []).forEach(node => {
      if(node._groupLabel && !renderedGroups.has(node.itemId)) {
        renderedGroups.add(node.itemId);
        const label = document.createElementNS("http://www.w3.org/2000/svg", "g");
        label.classList.add("route-group-label");
        label.innerHTML = `
          <rect x="${node.x - 50}" y="${node.y - 35}" width="${node._groupLabel.length * 10 + 60}" height="24" 
            fill="${node._groupColor || '#888'}" fill-opacity="0.15" rx="6"/>
          <circle cx="${node.x - 38}" cy="${node.y - 23}" r="6" fill="${node._groupColor || '#888'}"/>
          <text x="${node.x - 25}" y="${node.y - 19}" font-size="13" font-weight="700" fill="${node._groupColor || '#333'}">
            ${esc(node._groupLabel)}
          </text>
        `;
        machinesLayer.appendChild(label);
      }
    });
    
  // Функция расчета пути с учетом взаимного расположения узлов
  // Построение пути через контрольные точки (waypoints) с плавными кривыми Безье
  function buildPathWithWaypoints(fromX, fromY, toX, toY, waypoints) {
    if(!waypoints || waypoints.length === 0) {
      // Если нет контрольных точек - прямая линия
      return `M ${fromX} ${fromY} L ${toX} ${toY}`;
    }
    
    // Строим путь через все контрольные точки с плавными кривыми
    let path = `M ${fromX} ${fromY}`;
    
    // Если одна контрольная точка - квадратичная кривая Безье
    if(waypoints.length === 1) {
      const wp = waypoints[0];
      path += ` Q ${wp.x} ${wp.y}, ${toX} ${toY}`;
    } else {
      // Несколько контрольных точек - используем кубические кривые Безье
      for(let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const nextWp = i < waypoints.length - 1 ? waypoints[i + 1] : { x: toX, y: toY };
        
        // Контрольные точки для плавного перехода
        const cp1x = i === 0 ? fromX + (wp.x - fromX) * 0.5 : waypoints[i - 1].x + (wp.x - waypoints[i - 1].x) * 0.5;
        const cp1y = i === 0 ? fromY + (wp.y - fromY) * 0.5 : waypoints[i - 1].y + (wp.y - waypoints[i - 1].y) * 0.5;
        const cp2x = wp.x + (nextWp.x - wp.x) * 0.5;
        const cp2y = wp.y + (nextWp.y - wp.y) * 0.5;
        
        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${wp.x} ${wp.y}`;
      }
      
      // Финальный сегмент до конечной точки
      const lastWp = waypoints[waypoints.length - 1];
      const cp1x = lastWp.x + (toX - lastWp.x) * 0.5;
      const cp1y = lastWp.y + (toY - lastWp.y) * 0.5;
      path += ` C ${cp1x} ${cp1y}, ${toX} ${toY}, ${toX} ${toY}`;
    }
    
    return path;
  }
  
  function calculateRoutePath(fromX, fromY, toX, toY, fromNodeId, toNodeId) {
      // Получаем узлы для определения их размеров
      const fromNode = designer.routeNodes.find(n => n.id === fromNodeId);
      const toNode = designer.routeNodes.find(n => n.id === toNodeId);
      
      // Определяем размеры узлов
      let fromRadius, toRadius;
      let fromCenterX, fromCenterY, toCenterX, toCenterY;
      
      if(fromNode?.type === 'warehouse') {
        // Склад - прямоугольный
        const fromNodeWidth = 120;
        const fromNodeHeight = 50;
        fromRadius = 0; // Не круг
        fromCenterX = fromX; // Уже установлен как правая сторона
        fromCenterY = fromY; // Уже установлен как центр
      } else {
        // Машина - круглая
        fromRadius = fromNode?._radius || 30;
        fromCenterX = fromNode?._centerX || (fromNode?.x + fromRadius) || fromX;
        fromCenterY = fromNode?._centerY || (fromNode?.y + fromRadius) || fromY;
        // Корректируем координаты для выхода справа
        fromX = fromCenterX + fromRadius;
        fromY = fromCenterY;
      }
      
      if(toNode?.type === 'warehouse') {
        // Склад - прямоугольный
        const toNodeWidth = 120;
        const toNodeHeight = 50;
        toRadius = 0; // Не круг
        toCenterX = toX; // Уже установлен как левая сторона
        toCenterY = toY; // Уже установлен как центр
      } else {
        // Машина - круглая
        toRadius = toNode?._radius || 30;
        toCenterX = toNode?._centerX || (toNode?.x + toRadius) || toX;
        toCenterY = toNode?._centerY || (toNode?.y + toRadius) || toY;
        // Корректируем координаты для входа слева
        toX = toCenterX - toRadius;
        toY = toCenterY;
      }
      
      // Определяем взаимное расположение узлов
      const fromTop = fromCenterY - (fromRadius || 25);
      const fromBottom = fromCenterY + (fromRadius || 25);
      const toTop = toCenterY - (toRadius || 25);
      const toBottom = toCenterY + (toRadius || 25);
      
      // Определяем, куда должна идти связь (верх/низ/центр) на основе взаимного расположения
      let exitY = fromY; // Начальная точка выхода
      let entryY = toY; // Начальная точка входа
      
      // Для круглых узлов вычисляем точку выхода/входа на окружности по углу
      if(fromRadius > 0 && toRadius > 0) {
        // Вычисляем угол от центра исходного узла к центру целевого
        const dx = toCenterX - fromCenterX;
        const dy = toCenterY - fromCenterY;
        const angle = Math.atan2(dy, dx);
        
        // Выход справа от круга (по направлению к целевому узлу)
        fromX = fromCenterX + fromRadius * Math.cos(angle);
        exitY = fromCenterY + fromRadius * Math.sin(angle);
        
        // Вход слева от круга (против направления от исходного узла)
        toX = toCenterX - toRadius * Math.cos(angle);
        entryY = toCenterY - toRadius * Math.sin(angle);
      } else {
        // Для прямоугольных узлов или смешанных - используем логику определения верха/низа
        // Если целевой блок значительно ниже - выход снизу, вход сверху
        if(toCenterY > fromBottom + 20) {
          exitY = fromBottom;
          entryY = toTop;
        }
        // Если целевой блок значительно выше - выход сверху, вход снизу
        else if(toCenterY < fromTop - 20) {
          exitY = fromTop;
          entryY = toBottom;
        }
        // Если блоки на одном уровне или рядом - используем центры
        else {
          exitY = fromCenterY;
          entryY = toCenterY;
        }
      }
      
      // Получаем все узлы-препятствия (исключая начальный и конечный)
      const obstacles = designer.routeNodes
        .filter(n => n.id !== fromNodeId && n.id !== toNodeId && n.type === 'machine')
        .map(n => {
          // Для круглых узлов используем радиус, для прямоугольных - размеры
          if(n._radius) {
            const radius = n._radius || 30;
            const centerX = n._centerX || (n.x + radius);
            const centerY = n._centerY || (n.y + radius);
            return {
              x: centerX - radius,
              y: centerY - radius,
              width: radius * 2,
              height: radius * 2,
              right: centerX + radius,
              bottom: centerY + radius,
              isCircle: true,
              centerX,
              centerY,
              radius
            };
          } else {
            return {
              x: n.x,
              y: n.y,
              width: 180,
              height: 50,
              right: n.x + 180,
              bottom: n.y + 50,
              isCircle: false
            };
          }
        });
      
      // Проверяем, пересекает ли путь какие-либо узлы
      const pathIntersectsObstacle = (startX, startY, endX, endY, obs) => {
        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);
        
        // Если прямоугольник узла не пересекается с bounding box пути - нет пересечения
        if(obs.right < minX || obs.x > maxX || obs.bottom < minY || obs.y > maxY) {
          return false;
        }
        
        // Проверяем пересечение с прямоугольником
        if(startX >= obs.x && startX <= obs.right && startY >= obs.y && startY <= obs.bottom) return true;
        if(endX >= obs.x && endX <= obs.right && endY >= obs.y && endY <= obs.bottom) return true;
        
        // Проверяем пересечение прямой линии с прямоугольником
        if(Math.abs(endX - startX) < 0.001) {
          // Вертикальная линия
          if(startX >= obs.x && startX <= obs.right && !(maxY < obs.y || minY > obs.bottom)) return true;
        } else if(Math.abs(endY - startY) < 0.001) {
          // Горизонтальная линия
          if(startY >= obs.y && startY <= obs.bottom && !(maxX < obs.x || minX > obs.right)) return true;
        } else {
          const lineSlope = (endY - startY) / (endX - startX);
          const lineIntercept = startY - lineSlope * startX;
          
          // Проверяем пересечение с каждой стороной
          const yAtLeft = lineSlope * obs.x + lineIntercept;
          if(yAtLeft >= obs.y && yAtLeft <= obs.bottom && obs.x >= minX && obs.x <= maxX) return true;
          
          const yAtRight = lineSlope * obs.right + lineIntercept;
          if(yAtRight >= obs.y && yAtRight <= obs.bottom && obs.right >= minX && obs.right <= maxX) return true;
          
          const xAtTop = (obs.y - lineIntercept) / lineSlope;
          if(xAtTop >= obs.x && xAtTop <= obs.right && obs.y >= minY && obs.y <= maxY) return true;
          
          const xAtBottom = (obs.bottom - lineIntercept) / lineSlope;
          if(xAtBottom >= obs.x && xAtBottom <= obs.right && obs.bottom >= minY && obs.bottom <= maxY) return true;
        }
        
        return false;
      };
      
      // Проверяем, нужно ли обходить препятствия
      let needsAvoidance = false;
      for(const obs of obstacles) {
        if(pathIntersectsObstacle(fromX, exitY, toX, entryY, obs)) {
          needsAvoidance = true;
          break;
        }
      }
      
      // Если не нужно обходить - используем плавную кривую Безье (самый короткий путь)
      if(!needsAvoidance) {
        const dx = toX - fromX;
        const dy = entryY - exitY;
        const cx1 = fromX + dx * 0.4;
        const cy1 = exitY;
        const cx2 = fromX + dx * 0.6;
        const cy2 = entryY;
        return `M ${fromX} ${exitY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${toX} ${entryY}`;
      }
      
      // Вычисляем путь с обходом препятствий
      // Определяем направление обхода на основе взаимного расположения
      const isTargetBelow = entryY > exitY;
      const isTargetAbove = entryY < exitY;
      
      // Находим максимальную границу препятствий
      let maxBottom = Math.max(exitY, entryY);
      let minTop = Math.min(exitY, entryY);
      
      for(const obs of obstacles) {
        if(pathIntersectsObstacle(fromX, exitY, toX, entryY, obs)) {
          maxBottom = Math.max(maxBottom, obs.bottom);
          minTop = Math.min(minTop, obs.y);
        }
      }
      
      const curveOffset = 15; // Отступ для плавности кривых
      let pathOffset;
      
      // Если целевой блок ниже - обходим снизу
      if(isTargetBelow) {
        pathOffset = Math.max(30, maxBottom - Math.min(exitY, entryY) + 20);
        return `M ${fromX} ${exitY} C ${fromX} ${exitY + curveOffset}, ${fromX} ${exitY + pathOffset - curveOffset}, ${fromX} ${exitY + pathOffset} L ${toX} ${entryY + pathOffset} C ${toX} ${entryY + pathOffset - curveOffset}, ${toX} ${entryY + curveOffset}, ${toX} ${entryY}`;
      }
      // Если целевой блок выше - обходим сверху
      else if(isTargetAbove) {
        pathOffset = Math.max(30, Math.min(exitY, entryY) - minTop + 20);
        return `M ${fromX} ${exitY} C ${fromX} ${exitY - curveOffset}, ${fromX} ${exitY - pathOffset + curveOffset}, ${fromX} ${exitY - pathOffset} L ${toX} ${entryY - pathOffset} C ${toX} ${entryY - pathOffset + curveOffset}, ${toX} ${entryY - curveOffset}, ${toX} ${entryY}`;
      }
      // Если на одном уровне - обходим снизу
      else {
        pathOffset = Math.max(30, maxBottom - Math.min(exitY, entryY) + 20);
        return `M ${fromX} ${exitY} C ${fromX} ${exitY + curveOffset}, ${fromX} ${exitY + pathOffset - curveOffset}, ${fromX} ${exitY + pathOffset} L ${toX} ${entryY + pathOffset} C ${toX} ${entryY + pathOffset - curveOffset}, ${toX} ${entryY + curveOffset}, ${toX} ${entryY}`;
      }
    }
    
    // Рендеринг ребер маршрута
    (designer.routeEdges || []).forEach(edge => {
      const fromNode = designer.routeNodes.find(n => n.id === edge.from);
      const toNode = designer.routeNodes.find(n => n.id === edge.to);
      
      if(!fromNode || !toNode) return;
      
      // Определяем размеры и центр узлов
      let fromX, fromY, toX, toY;
      
      if(fromNode.type === 'warehouse') {
        // Склад - прямоугольный
        const fromNodeWidth = 120;
        const fromNodeHeight = 50;
        fromX = fromNode.x + fromNodeWidth; // Выход справа
        fromY = fromNode.y + fromNodeHeight / 2; // По центру
      } else {
        // Машина - круглая
        const fromRadius = fromNode._radius || 30;
        const fromCenterX = fromNode._centerX || (fromNode.x + fromRadius);
        const fromCenterY = fromNode._centerY || (fromNode.y + fromRadius);
        fromX = fromCenterX; // Начинаем от центра, будет скорректировано в calculateRoutePath
        fromY = fromCenterY;
      }
      
      if(toNode.type === 'warehouse') {
        // Склад - прямоугольный
        const toNodeWidth = 120;
        const toNodeHeight = 50;
        toX = toNode.x; // Вход слева
        toY = toNode.y + toNodeHeight / 2; // По центру
      } else {
        // Машина - круглая
        const toRadius = toNode._radius || 30;
        const toCenterX = toNode._centerX || (toNode.x + toRadius);
        const toCenterY = toNode._centerY || (toNode.y + toRadius);
        toX = toCenterX; // Начинаем от центра, будет скорректировано в calculateRoutePath
        toY = toCenterY;
      }
      
      // Вычисляем путь с учетом контрольных точек (waypoints) или автоматически
      let pathData;
      if(edge.waypoints && edge.waypoints.length > 0) {
        // Используем контрольные точки для построения пути
        pathData = buildPathWithWaypoints(fromX, fromY, toX, toY, edge.waypoints);
      } else {
        // Автоматический путь с обходом препятствий
        pathData = calculateRoutePath(fromX, fromY, toX, toY, fromNode.id, toNode.id);
      }
      
      // Основной путь (невидимый широкий для кликабельности)
      const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hitArea.setAttribute("d", pathData);
      hitArea.setAttribute("fill", "none");
      hitArea.setAttribute("stroke", "transparent");
      hitArea.setAttribute("stroke-width", "12");
      hitArea.style.cursor = "pointer";
      
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("route-edge");
      // Явно управляем классом critical - добавляем или удаляем в зависимости от значения
      if(edge.isCritical === true) {
        path.classList.add("critical");
      } else {
        path.classList.remove("critical");
      }
      if(edge.isBidirectional) path.classList.add("bidirectional");
      if(designer.selectedEdge?.id === edge.id) path.classList.add("selected");
      path.dataset.edgeId = edge.id;
      path.setAttribute("d", pathData);
      path.setAttribute("fill", "none");
      // Цвет для критических связей - красный, для остальных - цвет узла-источника
      const strokeColor = edge.isCritical === true ? "#ff4d4d" : (edge.color || "#888");
      path.setAttribute("stroke", strokeColor);
      path.setAttribute("stroke-width", edge.isCritical === true ? "4" : "2");
      path.setAttribute("stroke-opacity", edge.isCritical === true ? "1" : "0.8");
      
      // Для двусторонних связей - стрелки в обе стороны, для односторонних - одна стрелка
      // Для критических связей используем красные маркеры
      if(edge.isBidirectional) {
        path.setAttribute("marker-start", edge.isCritical ? "url(#arrowStart)" : "url(#arrowStart)");
        path.setAttribute("marker-end", edge.isCritical ? "url(#arrowEndRed)" : "url(#arrowEnd)");
      } else {
        path.setAttribute("marker-end", edge.isCritical ? "url(#arrowEndRed)" : "url(#arrowEnd)");
      }
      path.style.cursor = "pointer";
      path.style.transition = "stroke-width 0.2s ease, stroke-opacity 0.2s ease";
      
      // Hover эффекты
      path.onmouseenter = () => {
        path.setAttribute("stroke-width", String(parseInt(path.getAttribute("stroke-width")) + 1));
        path.setAttribute("stroke-opacity", "1");
      };
      path.onmouseleave = () => {
        path.setAttribute("stroke-width", edge.isCritical === true ? "4" : "2");
        path.setAttribute("stroke-opacity", edge.isCritical === true ? "1" : "0.8");
      };
      
      // Обработчики клика на связи
      const handleEdgeClick = (e) => {
        e.stopPropagation();
        // Снимаем выделение с предыдущей
        document.querySelectorAll('.route-edge.selected').forEach(el => el.classList.remove('selected'));
        path.classList.add('selected');
        designer.selectedEdge = edge;
        designer.selectedRouteNode = null;
      };
      
      const handleEdgeContext = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showEdgeContextMenu(e, edge, path);
      };
      
      // Двойной клик - удаление связи
      const handleEdgeDoubleClick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if(confirm(`Удалить связь между "${fromNode.label}" и "${toNode.label}"?`)) {
          designer.selectedEdge = edge;
          deleteSelectedRouteEdge();
        }
      };
      
      hitArea.onclick = handleEdgeClick;
      hitArea.oncontextmenu = handleEdgeContext;
      hitArea.ondblclick = handleEdgeDoubleClick;
      path.onclick = handleEdgeClick;
      path.oncontextmenu = handleEdgeContext;
      path.ondblclick = handleEdgeDoubleClick;
      
      connectionsLayer.appendChild(hitArea);
      connectionsLayer.appendChild(path);
      
      // Рендеринг контрольных точек (waypoints) для редактирования пути
      if(edge.waypoints && edge.waypoints.length > 0) {
        edge.waypoints.forEach((wp, wpIdx) => {
          const waypointCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          waypointCircle.classList.add("route-waypoint");
          waypointCircle.setAttribute("cx", wp.x);
          waypointCircle.setAttribute("cy", wp.y);
          waypointCircle.setAttribute("r", "6");
          waypointCircle.setAttribute("fill", "#030056");
          waypointCircle.setAttribute("stroke", "white");
          waypointCircle.setAttribute("stroke-width", "2");
          waypointCircle.style.cursor = "move";
          waypointCircle.dataset.edgeId = edge.id;
          waypointCircle.dataset.waypointIndex = wpIdx;
          
          // Hover эффект
          waypointCircle.onmouseenter = () => {
            waypointCircle.setAttribute("r", "8");
            waypointCircle.setAttribute("fill", "#ff4d4d");
          };
          waypointCircle.onmouseleave = () => {
            waypointCircle.setAttribute("r", "6");
            waypointCircle.setAttribute("fill", "#030056");
          };
          
          // Перетаскивание контрольной точки
          let isDraggingWaypoint = false;
          let waypointStartX, waypointStartY;
          
          waypointCircle.onmousedown = (e) => {
            e.stopPropagation();
            e.preventDefault();
            isDraggingWaypoint = true;
            designer.isDragging = true;
            
            const svg = $("designerSvg");
            const ctm = svg.getScreenCTM().inverse();
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgP = pt.matrixTransform(ctm);
            
            waypointStartX = svgP.x / designer.zoom;
            waypointStartY = svgP.y / designer.zoom;
          };
          
          const onWaypointMouseMove = (e) => {
            if(!isDraggingWaypoint) return;
            
            const svg = $("designerSvg");
            const ctm = svg.getScreenCTM().inverse();
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgP = pt.matrixTransform(ctm);
            
            const newX = svgP.x / designer.zoom;
            const newY = svgP.y / designer.zoom;
            
            // Обновляем позицию контрольной точки
            wp.x = newX;
            wp.y = newY;
            
            // Перерисовываем канвас
            renderDesignerCanvas();
          };
          
          const onWaypointMouseUp = () => {
            if(isDraggingWaypoint) {
              isDraggingWaypoint = false;
              designer.isDragging = false;
              document.removeEventListener('mousemove', onWaypointMouseMove);
              document.removeEventListener('mouseup', onWaypointMouseUp);
            }
          };
          
          document.addEventListener('mousemove', onWaypointMouseMove);
          document.addEventListener('mouseup', onWaypointMouseUp);
          
          connectionsLayer.appendChild(waypointCircle);
        });
      }
      
      // Двойной клик на линию - добавление новой контрольной точки
      const handleEdgeDoubleClickForWaypoint = (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        // Получаем координаты клика на SVG
        const svg = $("designerSvg");
        const ctm = svg.getScreenCTM().inverse();
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(ctm);
        
        const clickX = svgP.x / designer.zoom;
        const clickY = svgP.y / designer.zoom;
        
        // Инициализируем waypoints если их нет
        if(!edge.waypoints) {
          edge.waypoints = [];
        }
        
        // Добавляем новую контрольную точку
        edge.waypoints.push({ x: clickX, y: clickY });
        
        // Перерисовываем канвас
        renderDesignerCanvas();
        toast("✅ Контрольная точка добавлена");
      };
      
      // Заменяем обработчик двойного клика - сначала проверяем, не был ли это клик по контрольной точке
      const originalDblClick = handleEdgeDoubleClick;
      hitArea.ondblclick = (e) => {
        // Если клик по контрольной точке - не обрабатываем
        if(e.target.classList.contains('route-waypoint')) return;
        handleEdgeDoubleClickForWaypoint(e);
      };
      path.ondblclick = (e) => {
        if(e.target.classList.contains('route-waypoint')) return;
        handleEdgeDoubleClickForWaypoint(e);
      };
    });
    
    // Рендеринг узлов маршрута
    (designer.routeNodes || []).forEach((node, nodeIdx) => {
      // Пропускаем узлы без координат (но не вызываем autoLayoutNodes здесь - это должно быть сделано ДО рендеринга)
      if(node.x === undefined || node.y === undefined || isNaN(node.x) || isNaN(node.y)) {
        console.warn('[DESIGNER] RENDER: Skipping node without valid coordinates:', node.id, 'x:', node.x, 'y:', node.y, 'index:', nodeIdx);
        return;
      }
      
      // Проверяем, что координаты - это числа
      if(typeof node.x !== 'number' || typeof node.y !== 'number') {
        console.warn('[DESIGNER] RENDER: Skipping node with invalid coordinate types:', node.id, 'x:', typeof node.x, 'y:', typeof node.y, 'index:', nodeIdx);
        return;
      }
      
      // Логируем первые 3 узла для отладки
      if(nodeIdx < 3) {
        console.log('[DESIGNER] RENDER: Rendering node', nodeIdx, ':', { id: node.id, label: node.label, x: node.x, y: node.y });
      }
      
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.classList.add("route-node");
      g.classList.add(`route-node-${node.type}`);
      if(designer.selectedRouteNode?.id === node.id) g.classList.add("selected");
      g.dataset.nodeId = node.id;
      
      const ops = node.operations || [];
      const opsCount = ops.length;
      const firstOp = ops[0];
      
      // Получаем порядковый номер операции для отображения в кружочке
      let operationOrder = null;
      if(firstOp && node.type === 'machine') {
        const fullOp = designer.orderOps?.find(o => o.id === firstOp.id) || firstOp;
        operationOrder = fullOp.no || null;
      }
      
      // Определяем статус машины на основе операций
      let machineStatus = 'planned'; // planned, completed, working, stop, setup
      let statusIcon = '📋';
      let statusText = 'Запланировано';
      let nodeColor = '#3498db'; // Синий по умолчанию (Запланировано)
      let totalFact = 0;
      let totalPlan = 0;
      
      if(node.type === 'machine' && ops.length > 0) {
        // Собираем статистику по операциям и определяем приоритетный статус
        let hasCompleted = false;
        let hasWorking = false;
        let hasStop = false;
        let hasSetup = false;
        
        ops.forEach(op => {
          const opData = designer.orderOps?.find(o => o.id === op.id) || op;
          totalFact += Number(opData.fact || 0);
          totalPlan += Number(opData.plan || 0);
          
          const status = opData.status || 'Запланировано';
          if(status === 'Выполнено') {
            hasCompleted = true;
          } else if(status === 'В работе') {
            hasWorking = true;
          } else if(status === 'Стоп') {
            hasStop = true;
          } else if(status === 'Наладка') {
            hasSetup = true;
          }
        });
        
        // Приоритет статусов: Выполнено > В работе > Стоп > Наладка > Запланировано
        if(hasCompleted) {
          machineStatus = 'completed';
          statusIcon = '✅';
          statusText = 'Выполнено';
          nodeColor = '#2ecc71'; // Зелёный
        } else if(hasWorking) {
          machineStatus = 'working';
          statusIcon = '🟡';
          statusText = 'В работе';
          nodeColor = '#f39c12'; // Жёлтый
        } else if(hasStop) {
          machineStatus = 'stop';
          statusIcon = '⏸️';
          statusText = 'Стоп';
          nodeColor = '#e74c3c'; // Красный
        } else if(hasSetup) {
          machineStatus = 'setup';
          statusIcon = '🔧';
          statusText = 'Наладка';
          nodeColor = '#95a5a6'; // Серый
        } else {
          machineStatus = 'planned';
          statusIcon = '📋';
          statusText = 'Запланировано';
          nodeColor = '#3498db'; // Синий
        }
      }
      
      // Формируем tooltip с информацией
      let tooltipText = node.label;
      if(node.type === 'machine') {
        tooltipText = `${node.label}\nСтатус: ${statusText}`;
        if(totalPlan > 0) {
          tooltipText += `\nВыполнено: ${totalFact} / План: ${totalPlan}`;
          const progress = Math.round((totalFact / totalPlan) * 100);
          tooltipText += ` (${progress}%)`;
        }
        if(ops.length > 0) {
          tooltipText += `\nОпераций: ${ops.length}`;
          ops.slice(0, 3).forEach(op => {
            const opData = designer.orderOps?.find(o => o.id === op.id) || op;
            tooltipText += `\n- ${opData.name || 'Операция'}`;
          });
          if(ops.length > 3) {
            tooltipText += `\n... и ещё ${ops.length - 3}`;
          }
        }
      }
      
      if(node.type === 'warehouse') {
        // Узел склада
        const width = 120;
        const height = 50;
        const color = node.id.includes('rest') ? '#FF9800' : '#4CAF50';
        const icon = node.id.includes('rest') ? '💤' : '🏭';
        
        g.innerHTML = `
          <title>${esc(tooltipText)}</title>
          <rect x="${node.x}" y="${node.y}" width="${width}" height="${height}" 
            fill="${color}" fill-opacity="0.9" stroke="${designer.selectedRouteNode?.id === node.id ? '#fff' : 'transparent'}" stroke-width="3" rx="8"/>
          <text x="${node.x + width/2}" y="${node.y + height/2 + 5}" text-anchor="middle" font-size="20">${icon}</text>
          <text x="${node.x + width/2}" y="${node.y + height + 16}" text-anchor="middle" font-size="10" font-weight="600" fill="#333">${esc(node.label)}</text>
          <!-- Кнопка удаления (появляется при hover) -->
          <g class="delete-btn" style="opacity:0;cursor:pointer" data-node-id="${node.id}">
            <circle cx="${node.x + width}" cy="${node.y}" r="10" fill="#e74c3c" stroke="white" stroke-width="2"/>
            <text x="${node.x + width}" y="${node.y + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="white">×</text>
          </g>
        `;
      } else {
        // Узел машины - круглый
        const radius = 30; // Радиус круга
        const centerX = node.x + radius; // Центр круга по X (node.x - это левая координата)
        const centerY = node.y + radius; // Центр круга по Y (node.y - это верхняя координата)
        const opText = firstOp ? (firstOp.name || '').slice(0, 20) : '';
        
        // Используем цвет на основе статуса операций
        const fillColor = nodeColor; // Определён выше на основе статуса операций
        
        // Цвет границы для выделения
        const borderColor = designer.selectedRouteNode?.id === node.id ? '#fff' : 'transparent';
        const borderWidth = designer.selectedRouteNode?.id === node.id ? '3' : '0';
        
        g.innerHTML = `
          <title>${esc(tooltipText)}</title>
          <circle cx="${centerX}" cy="${centerY}" r="${radius}" 
            fill="${fillColor}" fill-opacity="0.9" 
            stroke="${borderColor}" 
            stroke-width="${borderWidth}"/>
          <!-- Название машины выше круга (с тенью) -->
          <text x="${centerX + 0.5}" y="${centerY - radius - 8.5}" text-anchor="middle" font-size="12" font-weight="600" fill="#333" opacity="0.3">${esc(node.label.length > 20 ? node.label.slice(0, 20) + '...' : node.label)}</text>
          <text x="${centerX}" y="${centerY - radius - 9}" text-anchor="middle" font-size="12" font-weight="600" fill="#222">${esc(node.label.length > 20 ? node.label.slice(0, 20) + '...' : node.label)}</text>
          <!-- Название задачи внутри круга -->
          ${opText ? `<text x="${centerX + 0.5}" y="${centerY + 2.5}" text-anchor="middle" font-size="9" fill="#333" opacity="0.3">${esc(opText)}</text><text x="${centerX}" y="${centerY + 2}" text-anchor="middle" font-size="9" fill="#333">${esc(opText)}</text>` : ''}
          <!-- Статус машины (справа вверху) -->
          <text x="${centerX + radius - 18}" y="${centerY - radius + 18}" font-size="14" fill="white" title="${statusText}">${statusIcon}</text>
          <!-- Порядковый номер операции (справа внизу) -->
          ${operationOrder !== null ? `<circle cx="${centerX + radius - 15}" cy="${centerY + radius - 15}" r="12" fill="rgba(0,0,0,0.4)" stroke="white" stroke-width="1"/>
          <text x="${centerX + radius - 15}" y="${centerY + radius - 11}" text-anchor="middle" font-size="10" font-weight="600" fill="white">${operationOrder}</text>` : ''}
          <!-- Кнопка удаления (появляется при hover) -->
          <g class="delete-btn" style="opacity:0;cursor:pointer" data-node-id="${node.id}">
            <circle cx="${centerX + radius}" cy="${centerY - radius}" r="10" fill="#e74c3c" stroke="white" stroke-width="2"/>
            <text x="${centerX + radius}" y="${centerY - radius + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="white">×</text>
          </g>
        `;
        
        // Обновляем координаты узла для правильного подключения связей
        // node.x и node.y теперь указывают на левый верхний угол, а центры нужно сохранить
        node._centerX = centerX;
        node._centerY = centerY;
        node._radius = radius;
      }
      
      machinesLayer.appendChild(g);
      
      // Обработчик кнопки удаления
      const deleteBtn = g.querySelector('.delete-btn');
      if(deleteBtn) {
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          if(confirm(`Удалить узел "${node.label}"?`)) {
            designer.selectedRouteNode = node;
            deleteSelectedRouteNode();
          }
        };
      }
      
      // Делаем узлы маршрута перетаскиваемыми
      makeRouteNodeDraggable(g, node);
    });
  }
  
  // Делаем узел маршрута перетаскиваемым
  // ЛКМ = перетаскивание, ПКМ = создание связи
  // Функция привязки к сетке 8x8
  function snapToGrid(x, y, currentX, currentY) {
    const totalColumns = 8;
    const totalRows = 8;
    const startX = 200;
    const startY = 80;
    const columnWidth = 150;
    const rowHeight = 90;
    
    let column, row;
    
    // Если есть текущая позиция узла - определяем квадрат на её основе
    // Это предотвращает сдвиг узла при небольшом перемещении мыши
    if(currentX !== undefined && currentY !== undefined) {
      // Определяем квадрат на основе текущей позиции узла (центра)
      column = Math.floor((currentX - startX) / columnWidth);
      row = Math.floor((currentY - startY) / rowHeight);
      
      // Определяем квадрат на основе новой позиции мыши
      const newColumn = Math.floor((x - startX) / columnWidth);
      const newRow = Math.floor((y - startY) / rowHeight);
      
      // Если мышь переместилась в другой квадрат - используем новый квадрат
      if(newColumn !== column || newRow !== row) {
        column = newColumn;
        row = newRow;
      }
      // Иначе остаёмся в текущем квадрате
    } else {
      // Если нет текущей позиции - определяем квадрат на основе координат мыши
      column = Math.floor((x - startX) / columnWidth);
      row = Math.floor((y - startY) / rowHeight);
    }
    
    // Ограничиваем индексы колонок и строк
    const clampedColumn = Math.max(0, Math.min(totalColumns - 1, column));
    const clampedRow = Math.max(0, Math.min(totalRows - 1, row));
    
    // Возвращаем координаты центра квадрата
    return {
      x: startX + (clampedColumn * columnWidth) + (columnWidth / 2),
      y: startY + (clampedRow * rowHeight) + (rowHeight / 2)
    };
  }
  
  // Функция определения квадрата сетки по координатам
  function getGridCell(x, y) {
    const totalColumns = 8;
    const totalRows = 8;
    const startX = 200;
    const startY = 80;
    const columnWidth = 150;
    const rowHeight = 90;
    
    const column = Math.round((x - startX) / columnWidth);
    const row = Math.round((y - startY) / rowHeight);
    
    const clampedColumn = Math.max(0, Math.min(totalColumns - 1, column));
    const clampedRow = Math.max(0, Math.min(totalRows - 1, row));
    
    return {
      column: clampedColumn,
      row: clampedRow,
      x: startX + (clampedColumn * columnWidth),
      y: startY + (clampedRow * rowHeight),
      width: columnWidth,
      height: rowHeight
    };
  }
  
  // Функция подсветки квадрата сетки
  function highlightGridCell(column, row) {
    const gridLayer = document.getElementById("designerGridLayer");
    if(!gridLayer) return null;
    
    // Удаляем предыдущую подсветку
    const oldHighlight = gridLayer.querySelector(".grid-cell-highlight");
    if(oldHighlight) oldHighlight.remove();
    
    if(column === undefined || row === undefined) return null;
    
    const startX = 200;
    const startY = 80;
    const columnWidth = 150;
    const rowHeight = 90;
    
    const x = startX + (column * columnWidth);
    const y = startY + (row * rowHeight);
    
    // Создаём подсвеченный квадрат
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.classList.add("grid-cell-highlight");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", columnWidth);
    rect.setAttribute("height", rowHeight);
    rect.setAttribute("fill", "#4CAF50");
    rect.setAttribute("opacity", "0.3");
    rect.setAttribute("stroke", "#4CAF50");
    rect.setAttribute("stroke-width", "2");
    rect.style.pointerEvents = "none";
    
    gridLayer.appendChild(rect);
    return rect;
  }
  
  function makeRouteNodeDraggable(g, node) {
    let isDragging = false;
    let startX, startY, origX, origY;
    let highlightedCell = null;
    
    g.style.cursor = 'grab';
    
    // ЛКМ - перетаскивание узла
    g.onmousedown = (e) => {
      if(e.button !== 0) return; // Только ЛКМ
      e.stopPropagation();
      e.preventDefault();
      isDragging = true;
      designer.isDragging = true;
      g.style.cursor = 'grabbing';
      
      const svg = $("designerSvg");
      const ctm = svg.getScreenCTM().inverse();
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(ctm);
      
      startX = svgP.x / designer.zoom;
      startY = svgP.y / designer.zoom;
      origX = node.x;
      origY = node.y;
      
      g.classList.add('dragging');
    };
    
    // ПКМ - начать/завершить создание связи
    g.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if(!designer.connectionStartNode) {
        // Первый клик - начинаем связь
        startRouteConnection(node, g);
      } else {
        // Второй клик - завершаем связь
        finishRouteConnection(node, g);
      }
    };
    
    // Клик ЛКМ также может завершить связь или открыть модальное окно для изменения порядка
    g.onclick = (e) => {
      if(designer.isDragging) return;
      if(designer.connectionStartNode && designer.connectionStartNode.id !== node.id) {
        e.stopPropagation();
        finishRouteConnection(node, g);
      } else if(node.type === 'machine' && !designer.connectionStartNode) {
        // Одинарный клик на узел машины - открываем модальное окно для изменения порядка
        e.stopPropagation();
        e.preventDefault();
        showNodeOrderModal(node);
      }
    };
    
    // Двойной клик - удаление узла (только для машин)
    g.ondblclick = (e) => {
      if(node.type === 'machine') {
        e.stopPropagation();
        e.preventDefault();
        designer.selectedRouteNode = node;
        deleteSelectedRouteNode();
      }
    };
    
    const onMouseMove = (e) => {
      if(!isDragging) return;
      
      const svg = $("designerSvg");
      const ctm = svg.getScreenCTM().inverse();
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(ctm);
      
      const dx = svgP.x / designer.zoom - startX;
      const dy = svgP.y / designer.zoom - startY;
      
      let newX = origX + dx;
      let newY = origY + dy;
      
      // Привязываем к сетке (snap to grid) - передаём текущую позицию узла
      const snapped = snapToGrid(newX, newY, origX, origY);
      node.x = snapped.x;
      node.y = snapped.y;
      
      // Подсвечиваем квадрат сетки, в который попадёт узел
      const cell = getGridCell(snapped.x, snapped.y);
      highlightedCell = highlightGridCell(cell.column, cell.row);
      
      renderDesignerCanvas();
    };
    
    const onMouseUp = async () => {
      if(isDragging) {
        isDragging = false;
        designer.isDragging = false;
        g.classList.remove('dragging');
        g.style.cursor = 'grab';
        
        // Убираем подсветку квадрата
        if(highlightedCell) {
          highlightedCell.remove();
          highlightedCell = null;
        }
        
        // Привязываем к сетке окончательно (используем текущую позицию)
        const snapped = snapToGrid(node.x, node.y, node.x, node.y);
        node.x = snapped.x;
        node.y = snapped.y;
        
        // Если это фиксированная машина - сохраняем её позицию
        if(node.isFixed && node.type === 'machine' && node.machine) {
          // Обновляем позицию в фиксированных узлах
          const fixedNode = designer.fixedMachineNodes.find(n => n.machine === node.machine);
          if(fixedNode) {
            fixedNode.x = node.x;
            fixedNode.y = node.y;
          }
        }
        
        // Если это склад - сохраняем его позицию
        if(node.type === 'warehouse') {
          // Находим склад в floorWarehouses и обновляем позицию
          const warehouse = designer.floorWarehouses.find(w => w.id === node.id);
          if(warehouse) {
            warehouse.x = node.x;
            warehouse.y = node.y;
          }
        }
        
        renderDesignerCanvas();
      }
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
  
  // Начать создание связи от узла (ПКМ)
  function startRouteConnection(fromNode, fromElement) {
    designer.connectionStartNode = fromNode;
    designer.connectionStartElement = fromElement;
    designer.isDrawingConnection = true;
    
    // Подсвечиваем исходный узел
    fromElement.classList.add('connection-source');
    
    // Показываем временную линию
    const tempLine = $("designerTempConnection");
    if(tempLine) {
      const cx = fromNode.x + (fromNode.type === 'warehouse' ? 60 : 90);
      const cy = fromNode.y + 25;
      tempLine.setAttribute('x1', cx);
      tempLine.setAttribute('y1', cy);
      tempLine.setAttribute('x2', cx);
      tempLine.setAttribute('y2', cy);
      tempLine.style.display = 'block';
    }
    
    toast(`🔗 Нажмите ПКМ/ЛКМ на целевой узел для создания связи`);
    
    // Курсор-перекрестие
    const svg = $("designerSvg");
    if(svg) svg.style.cursor = 'crosshair';
  }
  
  // Завершить создание связи
  async function finishRouteConnection(toNode, toElement) {
    if(!designer.connectionStartNode) return;
    
    const fromNode = designer.connectionStartNode;
    
    // Нельзя связать с самим собой
    if(fromNode.id === toNode.id) {
      cancelRouteConnection();
      return;
    }
    
    // Проверяем, есть ли уже обратная связь
    const hasReverseEdge = designer.routeEdges.some(
      e => e.from === toNode.id && e.to === fromNode.id
    );
    
    if(hasReverseEdge) {
      // Показываем диалог для двусторонней связи
      showBidirectionalConnectionModal(fromNode, toNode);
    } else {
      // Создаём односторонную связь
      await createRouteEdge(fromNode.id, toNode.id, false);
      cancelRouteConnection();
    }
  }
  
  // Отмена создания связи
  function cancelRouteConnection() {
    if(designer.connectionStartElement) {
      designer.connectionStartElement.classList.remove('connection-source');
    }
    designer.connectionStartNode = null;
    designer.connectionStartElement = null;
    designer.isDrawingConnection = false;
    
    const tempLine = $("designerTempConnection");
    if(tempLine) tempLine.style.display = 'none';
    
    const svg = $("designerSvg");
    if(svg) svg.style.cursor = '';
    
    // Убираем подсветку целей
    document.querySelectorAll('.connection-target').forEach(el => el.classList.remove('connection-target'));
  }
  
  // Создать ребро маршрута
  async function createRouteEdge(fromId, toId, isBidirectional = false) {
    const fromNode = designer.routeNodes.find(n => n.id === fromId);
    const toNode = designer.routeNodes.find(n => n.id === toId);
    
    if(!fromNode || !toNode) {
      toast("Ошибка: узлы не найдены");
      return;
    }
    
    // Проверяем, есть ли уже такая связь
    const existing = designer.routeEdges.find(e => e.from === fromId && e.to === toId);
    if(existing) {
      toast("Связь уже существует");
      return;
    }
    
    // Добавляем ребро с поддержкой контрольных точек (waypoints)
    const newEdge = {
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      from: fromId,
      to: toId,
      color: fromNode.color || '#888',
      isCritical: false,
      isBidirectional: isBidirectional,
      waypoints: [] // Контрольные точки для изгиба линии: [{ x, y }, ...]
    };
    
    designer.routeEdges.push(newEdge);
    
    // Если двусторонняя - добавляем обратную связь
    if(isBidirectional) {
      const reverseEdge = {
        id: `edge_${Date.now()}_${Math.random().toString(36).slice(2,8)}_rev`,
        from: toId,
        to: fromId,
        color: toNode.color || '#888',
        isCritical: false,
          isBidirectional: true,
          waypoints: [] // Контрольные точки для обратной связи
      };
      designer.routeEdges.push(reverseEdge);
    }
    
    // Обновляем input_sources и output_targets операций
    await updateOperationConnections(fromNode, toNode);
    
    renderDesignerCanvas();
    toast(isBidirectional ? "✅ Создана двусторонняя связь" : "✅ Связь создана");
  }
  
  // Обновить связи операций (input_sources, output_targets)
  async function updateOperationConnections(fromNode, toNode) {
    // Находим операции узлов
    const fromOps = fromNode.operations || [];
    const toOps = toNode.operations || [];
    
    // Если у узла нет операций (например, новый узел вручную), всё равно сохраняем связь в маршрут
    if(fromOps.length === 0 && toOps.length === 0) {
      // Сохраняем связь в сохранённый маршрут (если он существует)
      if(designer.selectedItemId) {
        try {
          const routes = await api(`/api/item-routes?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(designer.selectedItemId)}`);
          if(routes && Array.isArray(routes) && routes.length > 0) {
            const route = routes[0];
            await api(`/api/item-routes/${route.id}`, {
              method: 'PUT',
              body: JSON.stringify({
                nodes: designer.routeNodes,
                edges: designer.routeEdges
              })
            });
            console.log("[DESIGNER] Saved connection for manual node to route");
          }
        } catch(e) {
          console.error("[DESIGNER] Error saving connection for manual node:", e);
        }
      }
      return;
    }
    
    if(fromOps.length === 0 || toOps.length === 0) return;
    
    // Загружаем актуальные данные операций с актуальными версиями перед обновлением
    if(designer.selectedItemId && designer.selectedOrderId) {
      try {
        console.log("[DESIGNER] Загружаем актуальные операции перед обновлением связи...");
        const opsRes = await api(`/api/ops?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(designer.selectedItemId)}`);
        designer.orderOps = Array.isArray(opsRes) ? opsRes : [];
        console.log("[DESIGNER] Операции перезагружены:", designer.orderOps.length);
      } catch(e) {
        console.error("[DESIGNER] Ошибка загрузки операций перед обновлением связи:", e);
        // Продолжаем с текущими данными, если не удалось загрузить
      }
    }
    
    try {
      // Обновляем output_targets для операций исходного узла
      for(const opRef of fromOps) {
        // Загружаем актуальную версию операции перед каждым обновлением
        let fullOp;
        try {
          const freshOp = await api(`/api/ops/${opRef.id}`);
          if(freshOp && freshOp.id) {
            fullOp = freshOp;
            // Обновляем операцию в designer.orderOps для следующих операций
            const opIdx = designer.orderOps?.findIndex(o => o.id === opRef.id);
            if(opIdx !== undefined && opIdx >= 0 && designer.orderOps) {
              designer.orderOps[opIdx] = fullOp;
            }
          } else {
            fullOp = designer.orderOps?.find(o => o.id === opRef.id) || opRef;
          }
        } catch(e) {
          console.warn(`[DESIGNER] Не удалось загрузить операцию ${opRef.id}, используем кэшированную версию`);
          fullOp = designer.orderOps?.find(o => o.id === opRef.id) || opRef;
        }
        
        const currentTargets = parseJsonSafe(fullOp.output_targets) || [];
        const targetMachine = toNode.machine || toNode.label;
        if(!currentTargets.includes(targetMachine)) {
          currentTargets.push(targetMachine);
          
          const patchBody = {
            output_targets: JSON.stringify(currentTargets)
          };
          
          await window.OperationUpdates.update(fullOp, patchBody);
          console.log(`[DESIGNER] Обновлена операция ${fullOp.id} (output_targets), version: ${fullOp.version}`);
        }
      }
      
      // Обновляем input_sources для операций целевого узла
      for(const opRef of toOps) {
        // Загружаем актуальную версию операции перед каждым обновлением
        let fullOp;
        try {
          const freshOp = await api(`/api/ops/${opRef.id}`);
          if(freshOp && freshOp.id) {
            fullOp = freshOp;
            // Обновляем операцию в designer.orderOps для следующих операций
            const opIdx = designer.orderOps?.findIndex(o => o.id === opRef.id);
            if(opIdx !== undefined && opIdx >= 0 && designer.orderOps) {
              designer.orderOps[opIdx] = fullOp;
            }
          } else {
            fullOp = designer.orderOps?.find(o => o.id === opRef.id) || opRef;
          }
        } catch(e) {
          console.warn(`[DESIGNER] Не удалось загрузить операцию ${opRef.id}, используем кэшированную версию`);
          fullOp = designer.orderOps?.find(o => o.id === opRef.id) || opRef;
        }
        
        const currentSources = parseJsonSafe(fullOp.input_sources) || [];
        const sourceMachine = fromNode.machine || fromNode.label;
        if(!currentSources.includes(sourceMachine)) {
          currentSources.push(sourceMachine);
          
          const patchBody = {
            input_sources: JSON.stringify(currentSources)
          };
          
          await window.OperationUpdates.update(fullOp, patchBody);
          console.log(`[DESIGNER] Обновлена операция ${fullOp.id} (input_sources), version: ${fullOp.version}`);
        }
      }
    } catch(e) {
      console.error("[DESIGNER] Error updating operation connections:", e);
      throw e; // Пробрасываем ошибку дальше
    }
  }
  
  // Синхронизация всех связей на канвасе в операции (с учетом порядка операций)
  async function syncAllConnectionsToOperations() {
    console.log("==========================================");
    console.log("[DESIGNER] 🚀 НАЧАЛО СИНХРОНИЗАЦИИ СВЯЗЕЙ");
    console.log("[DESIGNER] Выбранное изделие:", designer.selectedItemId);
    console.log("[DESIGNER] Выбранные изделия:", designer.selectedItemIds);
    console.log("[DESIGNER] Выбранный заказ:", designer.selectedOrderId);
    console.log("[DESIGNER] Узлов на канвасе:", designer.routeNodes?.length || 0);
    console.log("[DESIGNER] Связей на канвасе:", designer.routeEdges?.length || 0);
    
    // Сначала загружаем актуальные данные операций с актуальными версиями
    if((designer.selectedItemId || (designer.selectedItemIds && designer.selectedItemIds.length > 0)) && designer.selectedOrderId) {
      try {
        const itemId = designer.selectedItemId || (designer.selectedItemIds && designer.selectedItemIds[0]);
        console.log("[DESIGNER] 📥 Загружаем актуальные операции для изделия:", itemId);
        const opsRes = await api(`/api/ops?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(itemId)}`);
        designer.orderOps = Array.isArray(opsRes) ? opsRes : [];
        console.log("[DESIGNER] ✅ Загружено операций:", designer.orderOps.length);
        console.log("[DESIGNER] Операции:", designer.orderOps.map(op => ({ id: op.id, name: op.name, machine: op.machine, no: op.no, version: op.version })));
      } catch(e) {
        console.error("[DESIGNER] ❌ Ошибка загрузки операций:", e);
        // Продолжаем с текущими данными, если не удалось загрузить
      }
    }
    
    if(!designer.orderOps || designer.orderOps.length === 0) {
      console.error("[DESIGNER] ❌ Нет операций для синхронизации");
      toast("⚠️ Нет операций для синхронизации");
      return;
    }
    
    try {
      console.log("[DESIGNER] 📊 АНАЛИЗ КАНВАСА:");
      console.log("[DESIGNER] Все узлы на канвасе:", designer.routeNodes.map(n => ({ id: n.id, type: n.type, machine: n.machine, label: n.label })));
      console.log("[DESIGNER] Все связи на канвасе:", designer.routeEdges.map(e => ({ from: e.from, to: e.to, isCritical: e.isCritical, isBidirectional: e.isBidirectional })));
      
      // Строим карту: opId -> nodeId (для каждой операции находим её конкретный узел)
      const opNodeMap = new Map(); // opId -> nodeId
      
      console.log("[DESIGNER] 🔗 СОСТАВЛЕНИЕ КАРТЫ ОПЕРАЦИЙ -> УЗЛОВ:");
      // Для каждой операции в порядке их следования находим её конкретный узел
      designer.orderOps.forEach((op, opIdx) => {
        const opMachine = op.machine;
        if(!opMachine) return;
        
        // Ищем узел, который соответствует этой конкретной операции
        const expectedNodeId = `machine_${opMachine}_${opIdx}`;
        const opNode = designer.routeNodes.find(n => n.id === expectedNodeId && (n.operations || []).some(o => o.id === op.id));
        
        if(opNode) {
          opNodeMap.set(op.id, opNode.id);
          console.log(`[DESIGNER]   ✅ Операция ${op.id} (${op.name}) -> Узел ${opNode.id} (${opMachine})`);
        } else {
          // Fallback: ищем любой узел этой машины с этой операцией
          const fallbackNode = designer.routeNodes.find(n => 
            n.type === 'machine' && 
            n.machine === opMachine && 
            (n.operations || []).some(o => o.id === op.id)
          );
          if(fallbackNode) {
            opNodeMap.set(op.id, fallbackNode.id);
            console.log(`[DESIGNER]   ⚠️ Операция ${op.id} (${op.name}) -> Узел ${fallbackNode.id} (fallback для ${opMachine})`);
          } else {
            console.warn(`[DESIGNER]   ❌ Операция ${op.id} (${op.name}) -> УЗЕЛ НЕ НАЙДЕН для машины ${opMachine}`);
          }
        }
      });
      
      console.log(`[DESIGNER] 📋 Карта операций -> узлов составлена: ${opNodeMap.size} операций`);
      
      // Собираем входящие/исходящие связи для каждого узла
      const nodeConnections = new Map(); // nodeId -> { inputs: [sourceNames], outputs: [targetNames], inputCritical, outputCritical }
      
      console.log("[DESIGNER] 🔍 СБОР СВЯЗЕЙ ДЛЯ КАЖДОГО УЗЛА:");
      // Собираем связи только для узлов машин (склады не имеют операций, их связи сохраняются в операциях машин)
      designer.routeNodes.forEach(node => {
        if(node.type === 'machine') {
          const inputs = [];
          const outputs = [];
          let inputCritical = false;
          let outputCritical = false;
          
          // Находим входящие связи (откуда приходит к этой машине)
          designer.routeEdges.forEach(edge => {
            if(edge.to === node.id) {
              const fromNode = designer.routeNodes.find(n => n.id === edge.from);
              if(fromNode) {
                // Для машин используем имя машины, для складов - строковый идентификатор
                let sourceName = null;
                if(fromNode.type === 'warehouse') {
                  sourceName = fromNode.id; // 'warehouse' или 'warehouse_rest'
                } else if(fromNode.type === 'machine') {
                  sourceName = fromNode.machine || fromNode.label;
                }
                if(sourceName) {
                  if(!inputs.includes(sourceName)) {
                    inputs.push(sourceName);
                  }
                  if(edge.isCritical) inputCritical = true;
                }
              }
            }
            
            // Находим исходящие связи (куда идёт от этой машины)
            if(edge.from === node.id) {
              const toNode = designer.routeNodes.find(n => n.id === edge.to);
              if(toNode) {
                // Для машин используем имя машины, для складов - строковый идентификатор
                let targetName = null;
                if(toNode.type === 'warehouse') {
                  targetName = toNode.id; // 'warehouse' или 'warehouse_rest'
                } else if(toNode.type === 'machine') {
                  targetName = toNode.machine || toNode.label;
                }
                if(targetName) {
                  if(!outputs.includes(targetName)) {
                    outputs.push(targetName);
                  }
                  if(edge.isCritical) outputCritical = true;
                }
              }
            }
          });
          
          // Сохраняем связи для узла машины
          nodeConnections.set(node.id, { inputs, outputs, inputCritical, outputCritical });
          
          // Логируем все узлы для диагностики
          console.log(`[DESIGNER]   📌 Узел ${node.id} (${node.machine || node.label}):`);
          console.log(`[DESIGNER]      Входящие (${inputs.length}):`, inputs);
          console.log(`[DESIGNER]      Исходящие (${outputs.length}):`, outputs);
          console.log(`[DESIGNER]      Критические: вход=${inputCritical}, выход=${outputCritical}`);
        }
      });
      
      console.log(`[DESIGNER] 📝 СБОРКА ОБНОВЛЕНИЙ ДЛЯ БАЗЫ ДАННЫХ:`);
      
      // Обновляем операции в порядке их следования
      const updatePromises = [];
      
      designer.orderOps.forEach((op, opIdx) => {
        const opMachine = op.machine;
        if(!opMachine) return;
        
        // Находим конкретный узел для этой операции
        const opNodeId = opNodeMap.get(op.id);
        if(!opNodeId) {
          console.warn(`[DESIGNER] No node found for operation: ${op.id} (${op.name})`);
          return;
        }
        
        let connections = nodeConnections.get(opNodeId);
        if(!connections) {
          // Если нет связей для узла, очищаем связи в операции
          connections = { inputs: [], outputs: [], inputCritical: false, outputCritical: false };
        }
        
        // Логируем подробную информацию об обновлении
        console.log(`[DESIGNER]   🔄 Операция ${op.id} (${op.name || 'Без названия'}) - Машина: ${op.machine}:`);
        console.log(`[DESIGNER]      Узел на канвасе: ${opNodeId}`);
        console.log(`[DESIGNER]      Текущая версия в БД: ${op.version || 0}`);
        console.log(`[DESIGNER]      Будет записано в БД:`);
        console.log(`[DESIGNER]         input_sources: ${JSON.stringify(connections.inputs)}`);
        console.log(`[DESIGNER]         output_targets: ${JSON.stringify(connections.outputs)}`);
        console.log(`[DESIGNER]         input_critical: ${connections.inputCritical ? 1 : 0}`);
        console.log(`[DESIGNER]         output_critical: ${connections.outputCritical ? 1 : 0}`);
        
        // Подготавливаем обновление
        const update = {
          input_sources: JSON.stringify(connections.inputs),
          output_targets: JSON.stringify(connections.outputs),
          input_critical: connections.inputCritical ? 1 : 0,
          output_critical: connections.outputCritical ? 1 : 0
        };
        
        updatePromises.push(
          window.OperationUpdates.update(op, update).then(result => {
            console.log(`[DESIGNER]      ✅ Успешно обновлено в БД: ${op.id}`);
            return result;
          }).catch(e => {
            console.error(`[DESIGNER]      ❌ ОШИБКА обновления в БД: ${op.id}`, e);
            console.error(`[DESIGNER]      Детали ошибки:`, e.message || String(e));
            return null;
          })
        );
      });
      
      console.log(`[DESIGNER] 💾 ОТПРАВКА ${updatePromises.length} ОБНОВЛЕНИЙ В БАЗУ ДАННЫХ...`);
      const results = await Promise.all(updatePromises);
      const successCount = results.filter(r => r !== null).length;
      const failCount = results.filter(r => r === null).length;
      console.log(`[DESIGNER] ✅ Успешно обновлено: ${successCount}, ❌ Ошибок: ${failCount}`);
      
      // Перезагружаем операции для обновления данных
      if(designer.selectedItemId || (designer.selectedItemIds && designer.selectedItemIds.length > 0)) {
        const itemId = designer.selectedItemId || (designer.selectedItemIds && designer.selectedItemIds[0]);
        console.log("[DESIGNER] 🔄 Перезагружаем операции после обновления...");
        const opsRes = await api(`/api/ops?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(itemId)}`);
        designer.orderOps = Array.isArray(opsRes) ? opsRes : [];
        console.log("[DESIGNER] ✅ Операции перезагружены:", designer.orderOps.length);
      }
      
      // Сохраняем расположение узлов и связи в сохранённый маршрут (если он существует)
      if(designer.selectedItemId) {
        try {
          const routes = await api(`/api/item-routes?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(designer.selectedItemId)}`);
          
          if(routes && Array.isArray(routes) && routes.length > 0) {
            // Обновляем существующий маршрут с текущими узлами (с координатами) и связями
            const route = routes[0];
            
            await api(`/api/item-routes/${route.id}`, {
              method: 'PUT',
              body: JSON.stringify({
                nodes: designer.routeNodes, // Сохраняем все узлы с их текущими координатами
                edges: designer.routeEdges  // Сохраняем все связи (включая для новых узлов)
              })
            });
            
            console.log("[DESIGNER] Updated saved route with current node positions and connections");
          }
        } catch(e) {
          console.error("[DESIGNER] Error updating saved route:", e);
          // Не показываем ошибку пользователю, так как основная синхронизация прошла успешно
        }
      }
      
      console.log("[DESIGNER] ✅ СИНХРОНИЗАЦИЯ ЗАВЕРШЕНА УСПЕШНО");
      console.log("==========================================");
      toast("✅ Взаимосвязи синхронизированы");
    } catch(e) {
      console.error("[DESIGNER] ❌ КРИТИЧЕСКАЯ ОШИБКА при синхронизации:", e);
      console.error("[DESIGNER] Stack trace:", e.stack);
      console.log("==========================================");
      toast("⚠️ Ошибка синхронизации: " + (e.message || String(e)));
    }
  }
  
  // Обновление связей при изменении операций в других модулях
  async function refreshConnections() {
    if(!designer.selectedItemId || !designer.selectedOrderId) {
      console.log("[DESIGNER] refreshConnections: No item selected, skipping");
      return;
    }
    
    try {
      console.log("[DESIGNER] Refreshing connections from operations...");
      
      // Перезагружаем операции для этого изделия
      const opsRes = await api(`/api/ops?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(designer.selectedItemId)}`);
      designer.orderOps = Array.isArray(opsRes) ? opsRes : [];
      
      console.log("[DESIGNER] Loaded", designer.orderOps.length, "operations for refresh");
      
      // Очищаем все существующие связи перед перестройкой
      const oldEdgesCount = designer.routeEdges?.length || 0;
      designer.routeEdges = [];
      
      // Перестраиваем связи из операций (теперь они будут единственными)
      buildConnectionsFromOperations();
      
      const newEdgesCount = designer.routeEdges?.length || 0;
      console.log("[DESIGNER] Connections refreshed: removed", oldEdgesCount, "old edges, added", newEdgesCount, "new edges");
      
      // Перерисовываем канвас
      renderDesignerCanvas();
      
      console.log("[DESIGNER] Connections refreshed and canvas rendered");
    } catch(e) {
      console.error("[DESIGNER] Error refreshing connections:", e);
      toast("⚠️ Ошибка обновления связей: " + (e.message || String(e)));
    }
  }
  
  function parseJsonSafe(str) {
    if(!str) return null;
    if(Array.isArray(str)) return str;
    try {
      return JSON.parse(str);
    } catch(e) {
      return null;
    }
  }
  
  function getStatusText(status) {
    const map = {
      'idle': '🟢 Свободна',
      'working': '🟡 В работе',
      'setup': '🔵 Наладка',
      'critical': '🔴 Критическая',
      'offline': '⚪ Отключена'
    };
    return map[status] || status;
  }
  
  function updateMachineStatusesOnCanvas() {
    const machinesLayer = $("designerMachinesLayer");
    if(!machinesLayer) return;
    
    machinesLayer.querySelectorAll('.designer-machine').forEach(g => {
      const machineId = parseInt(g.dataset.machineId);
      const status = designer.machineStatuses[machineId]?.status || 'offline';
      g.dataset.status = status;
      
      const statusText = g.querySelector('.designer-machine-status');
      if(statusText) {
        statusText.textContent = getStatusText(status);
      }
    });
  }
  
  // Специальная функция для drag камер (более простая и надёжная)
  function makeCameraDraggable(g, cam) {
    if(currentUser?.role !== 'admin') return;
    
    let isDragging = false;
    let startX, startY, origX, origY;
    
    g.style.cursor = 'move';
    
    g.onmousedown = (e) => {
      if(designer.currentTool === 'connect') return;
      e.preventDefault();
      e.stopPropagation();
      
      isDragging = true;
      designer.isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origX = cam.x;
      origY = cam.y;
      
      const circle = g.querySelector('circle');
      const texts = g.querySelectorAll('text');
      
      const onMouseMove = (e2) => {
        if(!isDragging) return;
        
        const dx = (e2.clientX - startX) / (designer.zoom || 1);
        const dy = (e2.clientY - startY) / (designer.zoom || 1);
        
        const newX = Math.max(20, origX + dx);
        const newY = Math.max(20, origY + dy);
        
        circle.setAttribute('cx', newX);
        circle.setAttribute('cy', newY);
        if(texts[0]) { texts[0].setAttribute('x', newX); texts[0].setAttribute('y', newY + 5); }
        if(texts[1]) { texts[1].setAttribute('x', newX); texts[1].setAttribute('y', newY + 32); }
        
        cam.x = newX;
        cam.y = newY;
      };
      
      const onMouseUp = async () => {
        if(!isDragging) return;
        isDragging = false;
        designer.isDragging = false;
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // Сохраняем позицию на сервере
        await api(`/api/cameras/${cam.id}`, {
          method: 'PUT',
          body: JSON.stringify({ x: cam.x, y: cam.y })
        }).catch(e => console.error("Ошибка сохранения камеры:", e));
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
  }
  
  // Перетаскивание портов входа/выхода
  function makePortDraggable(portElement, machineData, portType) {
    if(!portElement || currentUser?.role !== 'admin') return;
    
    let isDragging = false;
    let startY;
    
    const circle = portElement.querySelector('circle');
    const text = portElement.querySelector('text');
    if(!circle) return;
    
    portElement.style.cursor = 'ns-resize';
    
    portElement.onmousedown = (e) => {
      if(designer.currentTool === 'connect') return; // Не перетаскиваем в режиме связи
      e.stopPropagation();
      e.preventDefault();
      
      isDragging = true;
      startY = e.clientY;
      
      const onMouseMove = (e2) => {
        if(!isDragging) return;
        
        const svg = document.getElementById('designerSVG');
        const pt = svg.createSVGPoint();
        pt.x = e2.clientX;
        pt.y = e2.clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
        
        const w = machineData.width || 120;
        const h = machineData.height || 80;
        
        // Ограничиваем движение по вертикали в пределах машины
        const minY = machineData.y;
        const maxY = machineData.y + h;
        const newY = Math.max(minY, Math.min(maxY, svgP.y));
        
        // Обновляем визуально
        circle.setAttribute('cy', newY);
        text.setAttribute('y', newY + 3);
        
        // Обновляем данные порта для связей
        if(machineData.ports && machineData.ports[portType]) {
          machineData.ports[portType].y = newY;
        }
        
        // Обновляем связи в реальном времени
        updateConnectionsForElement(machineData, 'machine');
      };
      
      const onMouseUp = async () => {
        if(!isDragging) return;
        isDragging = false;
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        const w = machineData.width || 120;
        const h = machineData.height || 80;
        const newY = parseFloat(circle.getAttribute('cy'));
        const newOffsetY = (newY - machineData.y) / h; // Сохраняем как долю от высоты
        
        // Сохраняем в БД
        const updateData = {};
        if(portType === 'input') {
          updateData.input_port_offset_y = newOffsetY;
          machineData.input_port_offset_y = newOffsetY;
        } else if(portType === 'output') {
          updateData.output_port_offset_y = newOffsetY;
          machineData.output_port_offset_y = newOffsetY;
        }
        
        await api(`/api/floor-machines/${machineData.id}`, {
          method: 'PUT',
          body: JSON.stringify(updateData)
        }).catch(err => console.error('Ошибка сохранения порта:', err));
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
  }
  
  // Drag & Drop placeholder (simplified)
  function makeElementDraggable(element, type, data) {
    if(currentUser?.role !== 'admin') return;
    
    let isDragging = false;
    let isResizing = false;
    let startX, startY, origX, origY, origW, origH;
    let resizeDir = null;
    
    // Получаем основной элемент (rect)
    const rect = element.querySelector('rect') || element.querySelector('circle');
    if(!rect) return;
    
    // Добавляем resize handles для машин
    if(type === 'machine') {
      addResizeHandles(element, data);
    }
    
    element.style.cursor = 'move';
    
    element.onmousedown = (e) => {
      if(designer.currentTool === 'connect') return;
      if(e.target.classList.contains('resize-handle')) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      isDragging = true;
      designer.isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      if(type === 'machine' || type === 'zone' || type === 'warehouse') {
        origX = parseFloat(rect.getAttribute('x'));
        origY = parseFloat(rect.getAttribute('y'));
      } else if(type === 'operator' || type === 'camera' || type === 'product-template') {
        const circle = element.querySelector('circle');
        origX = parseFloat(circle.getAttribute('cx'));
        origY = parseFloat(circle.getAttribute('cy'));
      }
      
      selectElement(element, type, data);
      
      let highlightedCell = null;
      
      const onMouseMove = (e2) => {
        if(!isDragging) return;
        
        const dx = (e2.clientX - startX) / (designer.zoom || 1);
        const dy = (e2.clientY - startY) / (designer.zoom || 1);
        
        let newX = Math.max(0, origX + dx);
        let newY = Math.max(0, origY + dy);
        
        // Привязываем к сетке для машин и складов
        if(type === 'machine' || type === 'warehouse') {
          const snapped = snapToGrid(newX, newY, origX, origY);
          newX = snapped.x;
          newY = snapped.y;
          
          // Подсвечиваем квадрат сетки
          const cell = getGridCell(newX, newY);
          if(highlightedCell) highlightedCell.remove();
          highlightedCell = highlightGridCell(cell.column, cell.row);
        }
        
        // Обновляем координаты в data объекте для связей
        data.x = newX;
        data.y = newY;
        
        if(type === 'machine') {
          rect.setAttribute('x', newX);
          rect.setAttribute('y', newY);
          // Обновляем текст и handles
          updateMachinePosition(element, newX, newY, data);
        } else if(type === 'zone') {
          rect.setAttribute('x', newX);
          rect.setAttribute('y', newY);
          data.x = newX;
          data.y = newY;
          const label = element.querySelector('.designer-zone-label');
          if(label) {
            label.setAttribute('x', newX + 10);
            label.setAttribute('y', newY + 20);
          }
        } else if(type === 'operator') {
          const circle = element.querySelector('circle');
          const icon = element.querySelector('.designer-operator-icon');
          const label = element.querySelector('.designer-operator-label');
          circle.setAttribute('cx', newX);
          circle.setAttribute('cy', newY);
          if(icon) { icon.setAttribute('x', newX); icon.setAttribute('y', newY + 6); }
          if(label) { label.setAttribute('x', newX); label.setAttribute('y', newY + 32); }
        } else if(type === 'camera') {
          const circle = element.querySelector('circle');
          const texts = element.querySelectorAll('text');
          circle.setAttribute('cx', newX);
          circle.setAttribute('cy', newY);
          if(texts[0]) { texts[0].setAttribute('x', newX); texts[0].setAttribute('y', newY + 4); }
          if(texts[1]) { texts[1].setAttribute('x', newX); texts[1].setAttribute('y', newY + 28); }
        } else if(type === 'product-template') {
          const circle = element.querySelector('circle');
          const icon = element.querySelector('.designer-product-template-icon');
          const label = element.querySelector('.designer-product-template-label');
          const radius = data.radius || 40;
          circle.setAttribute('cx', newX);
          circle.setAttribute('cy', newY);
          // Обновляем внутренний круг (если есть)
          const innerCircle = element.querySelector('circle:nth-of-type(2)');
          if(innerCircle) {
            innerCircle.setAttribute('cx', newX);
            innerCircle.setAttribute('cy', newY);
          }
          if(icon) { icon.setAttribute('x', newX); icon.setAttribute('y', newY - 8); }
          if(label) { label.setAttribute('x', newX); label.setAttribute('y', newY + radius + 16); }
          // Обновляем координаты в data для связей
          data.x = newX;
          data.y = newY;
        } else if(type === 'warehouse') {
          rect.setAttribute('x', newX);
          rect.setAttribute('y', newY);
          const icon = element.querySelector('.designer-warehouse-icon');
          const label = element.querySelector('.designer-warehouse-label');
          if(icon) { icon.setAttribute('x', newX + (data.width || 120) / 2); icon.setAttribute('y', newY + (data.height || 80) / 2 - 8); }
          if(label) { label.setAttribute('x', newX + (data.width || 120) / 2); label.setAttribute('y', newY + (data.height || 80) + 18); }
        }
        
        // Обновляем связи в реальном времени
        updateConnectionsForElement(data, type);
      };
      
      const onMouseUp = async (e2) => {
        if(!isDragging) return;
        isDragging = false;
        designer.isDragging = false;
        
        // Убираем подсветку квадрата
        if(highlightedCell) {
          highlightedCell.remove();
          highlightedCell = null;
        }
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // Сохраняем новую позицию
        let newX, newY;
        if(type === 'machine' || type === 'zone' || type === 'warehouse') {
          newX = parseFloat(rect.getAttribute('x'));
          newY = parseFloat(rect.getAttribute('y'));
        } else if(type === 'operator' || type === 'camera' || type === 'product-template') {
          const circle = element.querySelector('circle');
          newX = parseFloat(circle.getAttribute('cx'));
          newY = parseFloat(circle.getAttribute('cy'));
        }
        
        const apiEndpoints = {
          machine: '/api/floor-machines',
          operator: '/api/floor-operators',
          zone: '/api/floor-zones',
          camera: '/api/cameras',
          'product-template': '/api/floor-product-templates',
          warehouse: '/api/floor-warehouses'
        };
        
        if(apiEndpoints[type]) {
          await api(`${apiEndpoints[type]}/${data.id}`, {
            method: 'PUT',
            body: JSON.stringify({ x: newX, y: newY })
          }).catch(e => console.error(`Ошибка сохранения позиции ${type}:`, e));
        }
      };
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
  }
  
  function addResizeHandles(element, data) {
    const rect = element.querySelector('rect');
    if(!rect) return;
    
    const handles = ['se', 'sw', 'ne', 'nw', 'e', 'w', 'n', 's'];
    const size = 8;
    
    handles.forEach(dir => {
      const handle = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      handle.classList.add('resize-handle');
      handle.dataset.dir = dir;
      handle.setAttribute('width', size);
      handle.setAttribute('height', size);
      handle.setAttribute('fill', '#030056');
      handle.setAttribute('stroke', 'white');
      handle.setAttribute('stroke-width', '1');
      handle.style.cursor = getCursorForDirection(dir);
      
      updateHandlePosition(handle, rect, dir, size);
      
      handle.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = parseFloat(rect.getAttribute('x'));
        const origY = parseFloat(rect.getAttribute('y'));
        const origW = parseFloat(rect.getAttribute('width'));
        const origH = parseFloat(rect.getAttribute('height'));
        
        const onMouseMove = (e2) => {
          const dx = (e2.clientX - startX) / (designer.zoom || 1);
          const dy = (e2.clientY - startY) / (designer.zoom || 1);
          
          let newX = origX, newY = origY, newW = origW, newH = origH;
          
          if(dir.includes('e')) newW = Math.max(50, origW + dx);
          if(dir.includes('w')) { newX = origX + dx; newW = Math.max(50, origW - dx); }
          if(dir.includes('s')) newH = Math.max(40, origH + dy);
          if(dir.includes('n')) { newY = origY + dy; newH = Math.max(40, origH - dy); }
          
          rect.setAttribute('x', newX);
          rect.setAttribute('y', newY);
          rect.setAttribute('width', newW);
          rect.setAttribute('height', newH);
          
          updateMachinePosition(element, newX, newY, { ...data, width: newW, height: newH });
          updateAllHandles(element, rect, size);
          updateConnectionsForElement(data, 'machine');
        };
        
        const onMouseUp = async () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          
          const newX = parseFloat(rect.getAttribute('x'));
          const newY = parseFloat(rect.getAttribute('y'));
          const newW = parseFloat(rect.getAttribute('width'));
          const newH = parseFloat(rect.getAttribute('height'));
          
          await api(`/api/floor-machines/${data.id}`, {
            method: 'PUT',
            body: JSON.stringify({ x: newX, y: newY, width: newW, height: newH })
          }).catch(e => console.error("Ошибка сохранения размера:", e));
          
          // Обновляем локальные данные
          data.x = newX; data.y = newY; data.width = newW; data.height = newH;
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };
      
      element.appendChild(handle);
    });
  }
  
  function updateHandlePosition(handle, rect, dir, size) {
    const x = parseFloat(rect.getAttribute('x'));
    const y = parseFloat(rect.getAttribute('y'));
    const w = parseFloat(rect.getAttribute('width'));
    const h = parseFloat(rect.getAttribute('height'));
    
    let hx, hy;
    switch(dir) {
      case 'nw': hx = x - size/2; hy = y - size/2; break;
      case 'ne': hx = x + w - size/2; hy = y - size/2; break;
      case 'sw': hx = x - size/2; hy = y + h - size/2; break;
      case 'se': hx = x + w - size/2; hy = y + h - size/2; break;
      case 'n': hx = x + w/2 - size/2; hy = y - size/2; break;
      case 's': hx = x + w/2 - size/2; hy = y + h - size/2; break;
      case 'e': hx = x + w - size/2; hy = y + h/2 - size/2; break;
      case 'w': hx = x - size/2; hy = y + h/2 - size/2; break;
    }
    handle.setAttribute('x', hx);
    handle.setAttribute('y', hy);
  }
  
  function updateAllHandles(element, rect, size) {
    element.querySelectorAll('.resize-handle').forEach(h => {
      updateHandlePosition(h, rect, h.dataset.dir, size);
    });
  }
  
  function updateMachinePosition(element, x, y, data) {
    const w = data.width || 120;
    const h = data.height || 80;
    const labelText = element.querySelector('.designer-machine-label');
    const statusText = element.querySelector('.designer-machine-status');
    if(labelText) { labelText.setAttribute('x', x + w/2); labelText.setAttribute('y', y + h/2 - 5); }
    if(statusText) { statusText.setAttribute('x', x + w/2); statusText.setAttribute('y', y + h/2 + 12); }
    
    // Обновляем resize handles
    const rect = element.querySelector('rect');
    if(rect) {
      updateAllHandles(element, rect, 8);
    }
    
    // Обновляем позиции портов
    const portRadius = 8;
    const inputOffsetX = data.input_port_offset_x ?? -8;
    const inputOffsetY = data.input_port_offset_y ?? 0.5;
    const outputOffsetX = data.output_port_offset_x ?? 8;
    const outputOffsetY = data.output_port_offset_y ?? 0.5;
    
    const inputPort = element.querySelector('.port-input circle');
    const inputText = element.querySelector('.port-input text');
    if(inputPort) {
      const inputX = x + (inputOffsetX < 0 ? inputOffsetX : w + inputOffsetX);
      const inputY = y + h * inputOffsetY;
      inputPort.setAttribute('cx', inputX);
      inputPort.setAttribute('cy', inputY);
      if(inputText) { inputText.setAttribute('x', inputX); inputText.setAttribute('y', inputY + 3); }
    }
    
    const outputPort = element.querySelector('.port-output circle');
    const outputText = element.querySelector('.port-output text');
    if(outputPort) {
      const outputX = x + (outputOffsetX < 0 ? outputOffsetX : w + outputOffsetX);
      const outputY = y + h * outputOffsetY;
      outputPort.setAttribute('cx', outputX);
      outputPort.setAttribute('cy', outputY);
      if(outputText) { outputText.setAttribute('x', outputX); outputText.setAttribute('y', outputY + 3); }
    }
    
    const bufferPort = element.querySelector('.port-buffer rect');
    const bufferText = element.querySelector('.port-buffer text');
    if(bufferPort) {
      const bufferX = x + w / 2;
      const bufferY = y + h + 15;
      bufferPort.setAttribute('x', bufferX - 12);
      bufferPort.setAttribute('y', bufferY - 6);
      if(bufferText) { bufferText.setAttribute('x', bufferX); bufferText.setAttribute('y', bufferY + 3); }
    }
  }
  
  function updateConnectionsForElement(data, type) {
    // Поддержка универсальных связей (machine, operator, camera, product-template, warehouse)
    designer.floorConnections.forEach(conn => {
      const fromType = conn.from_type || 'machine';
      const toType = conn.to_type || 'machine';
      const fromId = conn.from_id || conn.from_machine_id;
      const toId = conn.to_id || conn.to_machine_id;
      
      // Проверяем, связан ли текущий элемент с этой связью
      const isFrom = fromType === type && fromId === data.id;
      const isTo = toType === type && toId === data.id;
      if(!isFrom && !isTo) return;
      
      // Получаем позиции портов из DOM или из данных
      let fromPos, toPos;
      
      // Если это шаблон изделия, используем данные напрямую (так как он может иметь много связей)
      if(isFrom && type === 'product-template') {
        const radius = data.radius || 40;
        fromPos = { x: (data.x || 50) + radius, y: data.y || 50 }; // Точка выхода справа
      } else {
        fromPos = getConnectionPointFromDOM(fromType, fromId, true);
      }
      
      if(isTo && type === 'product-template') {
        const radius = data.radius || 40;
        toPos = { x: (data.x || 50) + radius, y: data.y || 50 }; // Точка входа справа
      } else {
        toPos = getConnectionPointFromDOM(toType, toId, false);
      }
      
      // Fallback: используем getConnectionPoint если getConnectionPointFromDOM не сработал
      if(!fromPos && isFrom) {
        fromPos = getConnectionPoint(fromType, fromId, conn);
      }
      if(!toPos && isTo) {
        toPos = getConnectionPoint(toType, toId, conn);
      }
      
      if(!fromPos || !toPos) return;
      
      const path = document.querySelector(`[data-connection-id="${conn.id}"]`);
      if(path) {
        // Пересчитываем умный путь
        const pathData = recalculateSmartPath(fromPos, toPos, fromId, toId);
        path.setAttribute('d', pathData.d);
      }
    });
  }
  
  // Получение позиции порта из DOM (для обновления при drag)
  function getConnectionPointFromDOM(type, id, isOutput) {
    if(type === 'machine') {
      const machineG = document.querySelector(`[data-floor-machine-id="${id}"]`);
      if(!machineG) return null;
      
      // Берём позицию напрямую из элемента порта
      const portClass = isOutput ? '.port-output' : '.port-input';
      const portCircle = machineG.querySelector(`${portClass} circle`);
      if(portCircle) {
        return { 
          x: parseFloat(portCircle.getAttribute('cx')), 
          y: parseFloat(portCircle.getAttribute('cy')) 
        };
      }
      
      // Fallback: стандартные позиции
      const rect = machineG.querySelector('rect');
      if(!rect) return null;
      const x = parseFloat(rect.getAttribute('x'));
      const y = parseFloat(rect.getAttribute('y'));
      const w = parseFloat(rect.getAttribute('width'));
      const h = parseFloat(rect.getAttribute('height'));
      if(isOutput) {
        return { x: x + w + 8, y: y + h / 2 };
      } else {
        return { x: x - 8, y: y + h / 2 };
      }
    } else if(type === 'operator') {
      const el = document.querySelector(`[data-floor-operator-id="${id}"] circle`);
      if(!el) return null;
      return { x: parseFloat(el.getAttribute('cx')), y: parseFloat(el.getAttribute('cy')) };
    } else if(type === 'camera') {
      const el = document.querySelector(`[data-camera-id="${id}"] circle`);
      if(!el) return null;
      return { x: parseFloat(el.getAttribute('cx')), y: parseFloat(el.getAttribute('cy')) };
    } else if(type === 'warehouse') {
      const el = document.querySelector(`[data-warehouse-id="${id}"] rect`);
      if(!el) return null;
      const x = parseFloat(el.getAttribute('x'));
      const y = parseFloat(el.getAttribute('y'));
      const width = parseFloat(el.getAttribute('width'));
      const height = parseFloat(el.getAttribute('height'));
      return { x: x + width / 2, y: y + height / 2 };
    }
    return null;
  }
  
  // Пересчёт пути (упрощённая версия для drag)
  function recalculateSmartPath(from, to, fromId, toId) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    
    // Получаем все машины-препятствия из DOM (актуальные позиции при drag)
    const obstacles = [];
    document.querySelectorAll('.designer-machine rect').forEach(rect => {
      const g = rect.closest('.designer-machine');
      const id = g?.dataset?.floorMachineId;
      if(id === fromId || id === toId) return; // Исключаем связанные машины
      const x = parseFloat(rect.getAttribute('x')) || 0;
      const y = parseFloat(rect.getAttribute('y')) || 0;
      const w = parseFloat(rect.getAttribute('width')) || 120;
      const h = parseFloat(rect.getAttribute('height')) || 80;
      obstacles.push({ x, y, w, h, cx: x + w/2, cy: y + h/2 });
    });
    
    // Проверяем пересечения
    const intersecting = obstacles.filter(obs => 
      lineIntersectsRectSimple(from.x, from.y, to.x, to.y, obs.x, obs.y, obs.w, obs.h)
    );
    
    if(intersecting.length === 0) {
      // Плавная кривая без препятствий
      const curve = 0.15;
      const perpX = -dy * curve;
      const perpY = dx * curve;
      const cx1 = from.x + dx * 0.3 + perpX;
      const cy1 = from.y + dy * 0.3 + perpY;
      const cx2 = from.x + dx * 0.7 + perpX;
      const cy2 = from.y + dy * 0.7 + perpY;
      
      return {
        d: `M ${from.x} ${from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${to.x} ${to.y}`
      };
    }
    
    // Обход препятствий
    const avgObsY = intersecting.reduce((sum, o) => sum + o.cy, 0) / intersecting.length;
    const avgObsX = intersecting.reduce((sum, o) => sum + o.cx, 0) / intersecting.length;
    
    // Определяем лучшее направление обхода
    const goAbove = (from.y + to.y) / 2 < avgObsY;
    const goLeft = (from.x + to.x) / 2 < avgObsX;
    
    // Находим крайние точки препятствий
    const minY = Math.min(...intersecting.map(o => o.y)) - 40;
    const maxY = Math.max(...intersecting.map(o => o.y + o.h)) + 40;
    const minX = Math.min(...intersecting.map(o => o.x)) - 40;
    const maxX = Math.max(...intersecting.map(o => o.x + o.w)) + 40;
    
    const midX = (from.x + to.x) / 2;
    const midY = goAbove ? minY : maxY;
    
    // Строим путь с двумя контрольными точками
    const wp1 = { x: from.x + (midX - from.x) * 0.3, y: midY };
    const wp2 = { x: to.x - (to.x - midX) * 0.3, y: midY };
    
    return {
      d: `M ${from.x} ${from.y} Q ${wp1.x} ${wp1.y}, ${midX} ${midY} Q ${wp2.x} ${wp2.y}, ${to.x} ${to.y}`
    };
  }
  
  function lineIntersectsRectSimple(x1, y1, x2, y2, rx, ry, rw, rh) {
    const padding = 10;
    rx -= padding;
    ry -= padding;
    rw += padding * 2;
    rh += padding * 2;
    
    // Простая проверка: отрезок пересекает прямоугольник
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    
    // Проверяем перекрытие bounding boxes
    if(maxX < rx || minX > rx + rw || maxY < ry || minY > ry + rh) {
      return false;
    }
    
    // Проверяем пересечение линии с прямоугольником
    const dx = x2 - x1;
    const dy = y2 - y1;
    
    // Параметрическое уравнение линии
    const edges = [
      { x1: rx, y1: ry, x2: rx + rw, y2: ry },           // top
      { x1: rx + rw, y1: ry, x2: rx + rw, y2: ry + rh }, // right
      { x1: rx, y1: ry + rh, x2: rx + rw, y2: ry + rh }, // bottom
      { x1: rx, y1: ry, x2: rx, y2: ry + rh }            // left
    ];
    
    for(const edge of edges) {
      if(segmentsIntersect(x1, y1, x2, y2, edge.x1, edge.y1, edge.x2, edge.y2)) {
        return true;
      }
    }
    
    return false;
  }
  
  function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if(Math.abs(denom) < 0.0001) return false;
    
    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
    
    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }
  
  function getElementPositionFromDOM(type, id) {
    if(type === 'machine') {
      const el = document.querySelector(`[data-floor-machine-id="${id}"] rect`);
      if(!el) return null;
      const x = parseFloat(el.getAttribute('x'));
      const y = parseFloat(el.getAttribute('y'));
      const w = parseFloat(el.getAttribute('width'));
      const h = parseFloat(el.getAttribute('height'));
      return { x: x + w/2, y: y + h/2 };
    } else if(type === 'operator') {
      const el = document.querySelector(`[data-floor-operator-id="${id}"] circle`);
      if(!el) return null;
      return { x: parseFloat(el.getAttribute('cx')), y: parseFloat(el.getAttribute('cy')) };
    } else if(type === 'camera') {
      const el = document.querySelector(`[data-camera-id="${id}"] circle`);
      if(!el) return null;
      return { x: parseFloat(el.getAttribute('cx')), y: parseFloat(el.getAttribute('cy')) };
    } else if(type === 'product-template') {
      const el = document.querySelector(`[data-floor-product-template-id="${id}"] circle`);
      if(!el) return null;
      const cx = parseFloat(el.getAttribute('cx'));
      const cy = parseFloat(el.getAttribute('cy'));
      const r = parseFloat(el.getAttribute('r')) || 40;
      // Возвращаем точку выхода справа от круга
      return { x: cx + r, y: cy };
    }
    return null;
  }
  
  function getCursorForDirection(dir) {
    const cursors = { nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize',
                      n: 'n-resize', s: 's-resize', e: 'e-resize', w: 'w-resize' };
    return cursors[dir] || 'pointer';
  }
  
  function selectElement(element, type, data) {
    deselectAll();
    element.classList.add('selected');
    designer.selectedElement = element;
    designer.selectedType = type;
    designer.selectedData = data;
    showInfoPanel(type, data);
  }
  
  function deselectAll() {
    document.querySelectorAll('.designer-machine.selected, .designer-operator.selected, .designer-zone.selected, .designer-product-template.selected').forEach(el => {
      el.classList.remove('selected');
    });
    designer.selectedElement = null;
    designer.selectedType = null;
    designer.selectedData = null;
  }
  
  function handleConnectionClick(element, elementType) {
    if(designer.currentTool !== 'connect') return;
    
    // Получаем центр элемента
    const pos = getElementCenter(element, elementType);
    
    if(!designer.connectionStart) {
      // Первый клик - начинаем связь
      designer.connectionStart = { element, type: elementType, ...pos };
      designer.isDrawingConnection = true;
      
      // Показываем пунктирную линию
      const tempLine = $("designerTempConnection");
      if(tempLine) {
        tempLine.setAttribute('x1', pos.x);
        tempLine.setAttribute('y1', pos.y);
        tempLine.setAttribute('x2', pos.x);
        tempLine.setAttribute('y2', pos.y);
        tempLine.style.display = 'block';
      }
      
      // Подсвечиваем начальный элемент
      highlightConnectionElement(element, elementType, 'source');
      
      const labels = { 
        machine: 'машину', 
        operator: 'оператора', 
        camera: 'камеру',
        'product-template': 'шаблон изделия',
        warehouse: 'склад'
      };
      toast(`🔗 Выберите ${labels[elementType] || 'элемент'} для связи`);
    } else {
      // Второй клик - показываем модальное окно для выбора направления связи
      if(designer.connectionStart.element.id === element.id && designer.connectionStart.type === elementType) {
        cancelConnection();
        return;
      }
      
      // Показываем модальное окно для выбора направления связи
      showConnectionDirectionModal(
        designer.connectionStart.type,
        designer.connectionStart.element,
        elementType,
        element
      );
    }
  }
  
  // Модальное окно для выбора направления связи
  function showConnectionDirectionModal(fromType, fromElement, toType, toElement) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    
    const getElementLabel = (type, element) => {
      const labels = {
        machine: element.machine_name || `Машина #${element.machine_id}`,
        operator: element.operator_name || `Оператор #${element.operator_id}`,
        camera: element.name || 'Камера',
        'product-template': element.template_name || element.label || 'Шаблон изделия',
        warehouse: element.label || (element.warehouse_type === 'warehouse' ? '🏭 Склад заготовительный' : '💤 Склад отдыха')
      };
      return labels[type] || 'Элемент';
    };
    
    const fromLabel = getElementLabel(fromType, fromElement);
    const toLabel = getElementLabel(toType, toElement);
    
    modal.innerHTML = `
      <div class="modal-content" style="max-width:500px">
        <div class="modal-header">
          <h3 style="margin:0">🔗 Направление связи</h3>
          <span class="close-button" onclick="this.closest('.modal').remove(); window.DesignerModule.cancelConnection();">&times;</span>
        </div>
        <div class="modal-body" style="padding:20px">
          <div style="margin-bottom:16px;padding:12px;background:var(--bg-secondary);border-radius:8px;font-size:12px">
            <div style="font-weight:600;margin-bottom:8px">Создать связь между:</div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-weight:600">От:</span>
              <span>${esc(fromLabel)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-weight:600">К:</span>
              <span>${esc(toLabel)}</span>
            </div>
          </div>
          
          <div style="margin-bottom:16px">
            <label style="display:block;margin-bottom:8px;font-weight:600;font-size:13px">Выберите направление связи:</label>
            <div style="display:flex;flex-direction:column;gap:8px">
              <label style="display:flex;align-items:center;gap:10px;padding:12px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all 0.2s" 
                     onmouseover="this.style.borderColor='var(--accent)';this.style.background='rgba(0,207,181,0.05)'"
                     onmouseout="this.style.borderColor='var(--border)';this.style.background='transparent'">
                <input type="radio" name="connectionDirection" value="forward" checked style="cursor:pointer">
                <div style="flex:1">
                  <div style="font-weight:600;margin-bottom:4px">→ Односторонняя (от первого ко второму)</div>
                  <div style="font-size:11px;color:var(--muted)">${esc(fromLabel)} → ${esc(toLabel)}</div>
                </div>
              </label>
              
              <label style="display:flex;align-items:center;gap:10px;padding:12px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all 0.2s"
                     onmouseover="this.style.borderColor='var(--accent)';this.style.background='rgba(0,207,181,0.05)'"
                     onmouseout="this.style.borderColor='var(--border)';this.style.background='transparent'">
                <input type="radio" name="connectionDirection" value="backward" style="cursor:pointer">
                <div style="flex:1">
                  <div style="font-weight:600;margin-bottom:4px">← Обратная (от второго к первому)</div>
                  <div style="font-size:11px;color:var(--muted)">${esc(toLabel)} → ${esc(fromLabel)}</div>
                </div>
              </label>
              
              <label style="display:flex;align-items:center;gap:10px;padding:12px;border:2px solid var(--border);border-radius:8px;cursor:pointer;transition:all 0.2s"
                     onmouseover="this.style.borderColor='var(--accent)';this.style.background='rgba(0,207,181,0.05)'"
                     onmouseout="this.style.borderColor='var(--border)';this.style.background='transparent'">
                <input type="radio" name="connectionDirection" value="bidirectional" style="cursor:pointer">
                <div style="flex:1">
                  <div style="font-weight:600;margin-bottom:4px">⇄ Двусторонняя (в обе стороны)</div>
                  <div style="font-size:11px;color:var(--muted)">${esc(fromLabel)} ⇄ ${esc(toLabel)}</div>
                </div>
              </label>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end">
          <button class="btn ghost" onclick="this.closest('.modal').remove(); window.DesignerModule.cancelConnection();">Отмена</button>
          <button class="btn accent" onclick="window.DesignerModule.confirmConnectionDirection(this.closest('.modal'));">Создать связь</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
    
    // Закрытие по клику вне модального окна
    modal.onclick = (e) => {
      if(e.target === modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
        cancelConnection();
      }
    };
    
    // Сохраняем данные для использования в confirmConnectionDirection
    window.pendingConnection = {
      fromType,
      fromElement,
      toType,
      toElement,
      modal
    };
  }
  
  // Подтверждение создания связи с выбранным направлением
  async function confirmConnectionDirection(modal) {
    if(!window.pendingConnection) {
      modal.remove();
      cancelConnection();
      return;
    }
    
    const { fromType, fromElement, toType, toElement } = window.pendingConnection;
    const direction = modal.querySelector('input[name="connectionDirection"]:checked')?.value || 'forward';
    
    try {
      if(direction === 'forward') {
        // Односторонняя связь: от первого ко второму
        await createUniversalConnection(fromType, fromElement.id, toType, toElement.id);
      } else if(direction === 'backward') {
        // Обратная связь: от второго к первому
        await createUniversalConnection(toType, toElement.id, fromType, fromElement.id);
      } else if(direction === 'bidirectional') {
        // Двусторонняя связь: создаем две связи
        await createUniversalConnection(fromType, fromElement.id, toType, toElement.id);
        await createUniversalConnection(toType, toElement.id, fromType, fromElement.id);
        toast("✅ Создана двусторонняя связь");
      }
      
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
      cancelConnection();
      delete window.pendingConnection;
    } catch(e) {
      console.error("Ошибка создания связи:", e);
      toast("Ошибка: " + (e.message || String(e)));
    }
  }
  
  function getElementCenter(element, type) {
    if(type === 'machine') {
      const w = element.width || 120;
      const h = element.height || 80;
      return { x: element.x + w/2, y: element.y + h/2 };
    } else if(type === 'operator' || type === 'camera') {
      return { x: element.x || 0, y: element.y || 0 };
    } else if(type === 'product-template') {
      const r = element.radius || 40;
      return { x: (element.x || 50) + r, y: element.y || 50 }; // Точка выхода справа
    } else if(type === 'warehouse') {
      const w = element.width || 120;
      const h = element.height || 80;
      return { x: (element.x || 50) + w / 2, y: (element.y || 50) + h / 2 };
    }
    return { x: 0, y: 0 };
  }
  
  function highlightConnectionElement(element, type, role) {
    const selectors = {
      machine: `[data-floor-machine-id="${element.id}"]`,
      operator: `[data-floor-operator-id="${element.id}"]`,
      camera: `[data-camera-id="${element.id}"]`,
      'product-template': `[data-floor-product-template-id="${element.id}"]`,
      warehouse: `[data-warehouse-id="${element.id}"]`
    };
    const el = document.querySelector(selectors[type]);
    if(el) el.classList.add(`connection-${role}`);
  }
  
  function cancelConnection() {
    designer.connectionStart = null;
    designer.isDrawingConnection = false;
    
    const tempLine = $("designerTempConnection");
    if(tempLine) tempLine.style.display = 'none';
    
    document.querySelectorAll('.connection-source, .connection-target').forEach(el => {
      el.classList.remove('connection-source', 'connection-target');
    });
  }
  
  // Обработка клика на порт для создания связи
  function handlePortConnectionClick(machine, portType) {
    if(designer.currentTool !== 'connect') return;
    
    const portPos = machine.ports?.[portType] || { 
      x: machine.x + (machine.width || 120) / 2, 
      y: machine.y + (machine.height || 80) / 2 
    };
    
    if(!designer.connectionStart) {
      // Первый клик - начинаем связь с порта
      designer.connectionStart = { 
        element: machine, 
        type: 'machine', 
        portType: portType,
        x: portPos.x, 
        y: portPos.y 
      };
      designer.isDrawingConnection = true;
      
      const tempLine = $("designerTempConnection");
      if(tempLine) {
        tempLine.setAttribute('x1', portPos.x);
        tempLine.setAttribute('y1', portPos.y);
        tempLine.setAttribute('x2', portPos.x);
        tempLine.setAttribute('y2', portPos.y);
        tempLine.style.display = 'block';
      }
      
      const portLabels = { input: 'вход', output: 'выход', buffer: 'буфер' };
      toast(`🔗 Порт "${portLabels[portType]}" выбран. Кликните на целевой порт.`);
    } else {
      // Второй клик - завершаем связь
      if(designer.connectionStart.element.id === machine.id) {
        // Клик на ту же машину - отмена или связь между портами
        if(designer.connectionStart.portType === portType) {
          cancelConnection();
          return;
        }
      }
      
      // Создаём связь между портами
      createUniversalConnection(
        'machine', 
        designer.connectionStart.element.id,
        'machine',
        machine.id,
        designer.connectionStart.portType,
        portType
      );
      
      cancelConnection();
    }
  }
  
  // Показать информацию о порте
  function showPortInfo(machine, portType) {
    const portLabels = { 
      input: '▶ ВХОД в процесс', 
      output: '▶ ВЫХОД из процесса', 
      buffer: '⏸ БУФЕР (ожидание)' 
    };
    const portDescriptions = {
      input: 'Сюда поступает материал для обработки',
      output: 'Отсюда материал идёт на следующий этап или на отдых',
      buffer: 'Временное хранение между процессами'
    };
    
    toast(`${portLabels[portType]}: ${portDescriptions[portType]}`);
  }
  
  // Функция для обновления операций заказа на основе связей конструктора
  async function updateOrderOpsFromConnections(orderId) {
    if(!orderId) return;
    
    try {
      // Получаем все операции заказа
      const orderOps = await api(`/api/ops?orderId=${encodeURIComponent(orderId)}`);
      if(!orderOps || orderOps.length === 0) return;
      
      // Получаем все связи для текущего layout (legacy)
      const connections = designer.floorConnections || [];
      
      // Получаем маппинг machine_id -> machine_name из floorMachines
      const machineIdToName = {};
      (designer.floorMachines || []).forEach(fm => {
        if(fm.machine_id && fm.machine_name) {
          machineIdToName[fm.machine_id] = fm.machine_name;
        }
      });
      
      // Если нет маппинга из floorMachines, используем state.machines
      if(Object.keys(machineIdToName).length === 0) {
        (state.machines || []).forEach((name, idx) => {
          machineIdToName[idx + 1] = name;
        });
      }
      
      // Обновляем каждую операцию
      for(const op of orderOps) {
        if(!op.machine) continue;
        
        // Находим machine_id по имени машины
        let opMachineId = null;
        for(const [machineId, machineName] of Object.entries(machineIdToName)) {
          if(machineName === op.machine) {
            opMachineId = machineId;
            break;
          }
        }
        
        if(!opMachineId) continue;
        
        // Находим все связи, где эта машина является получателем (to_machine_id)
        const inputConnections = connections.filter(conn => 
          conn.to_machine_id === opMachineId || 
          (conn.to_type === 'machine' && conn.to_id === opMachineId)
        );
        
        // Находим все связи, где эта машина является источником (from_machine_id)
        const outputConnections = connections.filter(conn => 
          conn.from_machine_id === opMachineId || 
          (conn.from_type === 'machine' && conn.from_id === opMachineId)
        );
        
        // Формируем input_sources
        const inputSources = [];
        let inputCritical = 0;
        for(const conn of inputConnections) {
          const fromMachineId = conn.from_machine_id || conn.from_id;
          if(fromMachineId && machineIdToName[fromMachineId]) {
            inputSources.push(machineIdToName[fromMachineId]);
            if(conn.is_critical) inputCritical = 1;
          }
        }
        // Если нет связей, добавляем склад по умолчанию
        if(inputSources.length === 0) {
          inputSources.push('warehouse');
        }
        
        // Формируем output_targets
        const outputTargets = [];
        let outputCritical = 0;
        for(const conn of outputConnections) {
          const toMachineId = conn.to_machine_id || conn.to_id;
          if(toMachineId && machineIdToName[toMachineId]) {
            outputTargets.push(machineIdToName[toMachineId]);
            if(conn.is_critical) outputCritical = 1;
          }
        }
        // Если нет связей, добавляем склад по умолчанию
        if(outputTargets.length === 0) {
          outputTargets.push('warehouse');
        }
        
        // Обновляем операцию
        try {
          await window.OperationUpdates.update(op, {
              input_sources: JSON.stringify(inputSources),
              output_targets: JSON.stringify(outputTargets),
              input_critical: inputCritical,
              output_critical: outputCritical
            });
        } catch(e) {
          console.error(`Ошибка обновления операции ${op.id}:`, e);
        }
      }
      
      // Обновляем данные на клиенте
      if(typeof refreshAll === 'function') {
        await refreshAll(false);
      }
      
      toast(`✅ Обновлено ${orderOps.length} операций заказа на основе связей конструктора`);
    } catch(e) {
      console.error("Ошибка обновления операций заказа:", e);
      toast("⚠️ Ошибка обновления операций: " + (e.message || String(e)));
    }
  }
  
  async function createUniversalConnection(fromType, fromId, toType, toId, fromPort, toPort) {
    try {
      // Для связей между складами, шаблонами и другими элементами НЕ требуем выбора заказа/шаблона
      // Требуем только для связей, которые влияют на операции заказа
      const orderSelect = document.getElementById("designerOrderSelect");
      const templateSelect = document.getElementById("designerTemplateSelect");
      const orderId = orderSelect?.value || null;
      const templateId = templateSelect?.value || null;
      
      // Если связь не связана с заказом/шаблоном (например, между складами, шаблонами),
      // разрешаем создание без выбора заказа/шаблона
      const isOrderRelated = orderId || templateId;
      const isTemplateToTemplate = fromType === 'product-template' && toType === 'product-template';
      const isWarehouseRelated = fromType === 'warehouse' || toType === 'warehouse';
      
      if(!isOrderRelated && !isTemplateToTemplate && !isWarehouseRelated) {
        // Для связей между машинами/операторами требуем выбор заказа/шаблона
        if(!orderId && !templateId) {
          toast("⚠️ Сначала выберите заказ или шаблон для работы с маршрутом");
          return;
        }
      }
      
      // Получаем выбранный заказ и шаблон (если выбраны)
      const selectedOrderId = orderId || null;
      const selectedTemplateId = templateId || null;
      
      console.log('[DESIGNER] createUniversalConnection: Создание связи', {
        fromType,
        fromId,
        toType,
        toId,
        layoutId: designer.currentLayoutId,
        orderId: selectedOrderId,
        templateId: selectedTemplateId
      });
      
      const connectionRes = await api("/api/floor-connections", {
        method: "POST",
          body: JSON.stringify({
            layout_id: designer.currentLayoutId,
            from_type: fromType,
            from_id: fromId,
            to_type: toType,
            to_id: toId,
            order_id: selectedOrderId, // Передаем order_id для обновления операций (если выбран заказ)
            template_id: selectedTemplateId // Передаем template_id для обновления операций шаблона (если выбран шаблон)
          })
        });
      
      console.log('[DESIGNER] createUniversalConnection: Связь создана, ответ:', connectionRes);
      
      // Перезагружаем полную схему для получения обновленных связей
      await loadFloorLayoutFull(designer.currentLayoutId);
      
      console.log('[DESIGNER] createUniversalConnection: Схема перезагружена, связей:', designer.floorConnections?.length || 0);
        
        // ОТКЛЮЧЕНО: Синхронизация из конструктора в операции отключена
        // Проверяем, выбран ли заказ, и обновляем операции
        // if(selectedOrderId) {
        //   await updateOrderOpsFromConnections(selectedOrderId);
        // }
      
      toast("✅ Связь создана");
    } catch(e) {
      console.error("Ошибка создания связи:", e);
      toast("Ошибка: " + (e.message || String(e)));
    }
  }
  
  // Backward compatibility
  async function createFloorConnection(fromMachineId, toMachineId) {
    return createUniversalConnection('machine', fromMachineId, 'machine', toMachineId);
  }
  
  function showInfoPanel(type, data) {
    const panel = $("designerInfoPanel");
    const title = $("designerInfoTitle");
    const content = $("designerInfoContent");
    if(!panel || !title || !content) return;
    
    panel.style.display = 'block';
    
    if(type === 'machine') {
      const machineName = data.machine_name || (state.machines || [])[data.machine_id - 1] || `Машина #${data.machine_id}`;
      title.textContent = machineName;
      content.innerHTML = `
        <div class="info-row"><span class="info-label">Размер:</span><span class="info-value">${data.width || 120} × ${data.height || 80}</span></div>
        <div class="info-row"><span class="info-label">Позиция:</span><span class="info-value">${Math.round(data.x)}, ${Math.round(data.y)}</span></div>
        <div style="margin-top:10px;display:flex;gap:6px">
          <button class="btn ghost" onclick="window.DesignerModule.deleteSelectedMachine()">🗑️ Удалить</button>
        </div>
      `;
    } else if(type === 'operator') {
      const operatorName = data.operator_name || (state.operators || [])[data.operator_id - 1] || `Оператор #${data.operator_id}`;
      title.textContent = operatorName;
      content.innerHTML = `
        <div class="info-row"><span class="info-label">Позиция:</span><span class="info-value">${Math.round(data.x || 0)}, ${Math.round(data.y || 0)}</span></div>
        <div style="margin-top:10px">
          <button class="btn ghost" onclick="window.DesignerModule.deleteSelectedOperator()">🗑️ Удалить</button>
        </div>
      `;
    } else if(type === 'product-template') {
      const templateName = data.template_name || data.label || 'Шаблон изделия';
      title.textContent = templateName;
      content.innerHTML = `
        <div class="info-row"><span class="info-label">Позиция:</span><span class="info-value">${Math.round(data.x || 50)}, ${Math.round(data.y || 50)}</span></div>
        <div class="info-row"><span class="info-label">Размер:</span><span class="info-value">Радиус ${data.radius || 40}</span></div>
        <div style="margin-top:10px;display:flex;gap:6px">
          <button class="btn ghost" onclick="window.DesignerModule.deleteSelectedProductTemplate()">🗑️ Удалить</button>
        </div>
      `;
    } else if(type === 'warehouse') {
      const warehouseName = data.label || (data.warehouse_type === 'warehouse' ? '🏭 Склад' : '💤 Отдых');
      title.textContent = warehouseName;
      content.innerHTML = `
        <div class="info-row"><span class="info-label">Тип:</span><span class="info-value">${data.warehouse_type === 'warehouse' ? '🏭 Склад заготовительный' : '💤 Склад отдыха'}</span></div>
        <div class="info-row"><span class="info-label">Размер:</span><span class="info-value">${data.width || 120} × ${data.height || 80}</span></div>
        <div class="info-row"><span class="info-label">Позиция:</span><span class="info-value">${Math.round(data.x || 50)}, ${Math.round(data.y || 50)}</span></div>
        <div style="margin-top:10px">
          <button class="btn ghost" onclick="window.DesignerModule.deleteSelectedWarehouse()">🗑️ Удалить</button>
        </div>
      `;
    } else if(type === 'camera') {
      const isOnline = data.last_ping && (Date.now() - new Date(data.last_ping).getTime() < 60000);
      const statusClass = isOnline ? 'color:#00CF5B' : 'color:#999';
      const statusText = isOnline ? '🟢 Онлайн' : '⚪ Офлайн';
      
      // Привязанная машина
      const linkedMachine = data.machine_id ? 
        (state.machines || [])[data.machine_id - 1] || `Машина #${data.machine_id}` : 
        'Не привязана';
      
      title.textContent = `📹 ${data.name || 'Камера'}`;
      content.innerHTML = `
        <div class="info-row"><span class="info-label">Статус:</span><span class="info-value" style="${statusClass}">${statusText}</span></div>
        <div class="info-row"><span class="info-label">Позиция:</span><span class="info-value">${Math.round(data.x || 0)}, ${Math.round(data.y || 0)}</span></div>
        
        <div style="margin:10px 0;border-top:1px solid var(--border);padding-top:8px">
          <div style="font-weight:600;margin-bottom:8px">🌐 IP Настройки</div>
          <div style="display:flex;flex-direction:column;gap:6px;font-size:11px">
            <div style="display:flex;gap:4px;align-items:center">
              <label style="width:50px">IP:</label>
              <input type="text" id="cameraIP" value="${esc(data.ip_address || '')}" placeholder="192.168.1.x"
                style="flex:1;padding:4px;border:1px solid var(--border);border-radius:4px;font-size:11px">
            </div>
            <div style="display:flex;gap:4px;align-items:center">
              <label style="width:50px">Порт:</label>
              <input type="number" id="cameraPort" value="${data.port || 80}" 
                style="width:70px;padding:4px;border:1px solid var(--border);border-radius:4px;font-size:11px">
            </div>
            <div style="display:flex;gap:4px;align-items:center">
              <label style="width:50px">API:</label>
              <input type="text" id="cameraAPI" value="${esc(data.api_endpoint || '')}" placeholder="/api/status"
                style="flex:1;padding:4px;border:1px solid var(--border);border-radius:4px;font-size:11px">
            </div>
            <div style="display:flex;gap:4px;align-items:center">
              <label style="width:50px">Ключ:</label>
              <input type="password" id="cameraKey" value="${esc(data.api_key || '')}" placeholder="API Key"
                style="flex:1;padding:4px;border:1px solid var(--border);border-radius:4px;font-size:11px">
            </div>
          </div>
        </div>
        
        <div style="margin:10px 0;border-top:1px solid var(--border);padding-top:8px">
          <div style="font-weight:600;margin-bottom:6px">🔗 Привязка к машине</div>
          <select id="cameraMachineLink" style="width:100%;padding:4px;border:1px solid var(--border);border-radius:4px;font-size:11px">
            <option value="">— Не привязана —</option>
            ${(state.machinesData || []).map(m => `<option value="${esc(m.id)}" ${String(data.machine_id) === String(m.id) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
          </select>
        </div>
        
        <div style="margin:10px 0;border-top:1px solid var(--border);padding-top:8px">
          <div style="font-weight:600;margin-bottom:6px">Ручной статус машины</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn ghost" style="font-size:10px;padding:4px 8px;background:#f0f0f0" onclick="window.DesignerModule.sendCameraStatus('${data.id}', 'stop')">🔴 СТОП</button>
            <button class="btn ghost" style="font-size:10px;padding:4px 8px;background:#f0f0f0" onclick="window.DesignerModule.sendCameraStatus('${data.id}', 'setup')">🔵 Наладка</button>
            <button class="btn ghost" style="font-size:10px;padding:4px 8px;background:#f0f0f0" onclick="window.DesignerModule.sendCameraStatus('${data.id}', 'working')">🟡 Работа</button>
            <button class="btn ghost" style="font-size:10px;padding:4px 8px;background:#f0f0f0" onclick="window.DesignerModule.sendCameraStatus('${data.id}', 'done')">🟢 Готово</button>
          </div>
        </div>
        
        <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn primary" style="font-size:11px" onclick="window.DesignerModule.saveCameraSettings('${data.id}')">💾 Сохранить</button>
          <button class="btn ghost" style="font-size:11px" onclick="window.DesignerModule.testCameraConnection('${data.id}')">🔍 Тест</button>
          <button class="btn ghost" style="font-size:11px;color:#ff4444" onclick="window.DesignerModule.deleteSelectedCamera()">🗑️</button>
        </div>
      `;
    } else if(type === 'connection') {
      const fromType = data.from_type || 'machine';
      const toType = data.to_type || 'machine';
      title.textContent = `Связь (${fromType} → ${toType})`;
      content.innerHTML = `
        <div class="info-row"><span class="info-label">Порядок:</span><span class="info-value">${data.seq_order || '-'}</span></div>
        <div style="margin:10px 0">
          <label style="font-size:11px">Номер в последовательности:</label>
          <input type="number" id="connSeqOrder" value="${data.seq_order || 0}" min="0" style="width:60px" 
            onchange="window.DesignerModule.updateConnectionSeq('${data.id}', this.value)">
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn ghost" onclick="window.DesignerModule.toggleConnectionCritical('${data.id}')">⚠️ ${data.is_critical ? 'Снять критичность' : 'Критическая'}</button>
          <button class="btn ghost" onclick="window.DesignerModule.deleteSelectedConnection()">🗑️ Удалить</button>
        </div>
      `;
    }
  }
  
  function applyCanvasTransform() {
    const svg = $("designerSvg");
    if(!svg) return;
    
    const layout = designer.currentLayout || {};
    // Увеличиваем размер canvas для маршрутов
    const width = layout.width || 4000;
    const height = layout.height || 3000;
    const zoom = designer.zoom || 1;
    const panX = designer.panX || 0;
    const panY = designer.panY || 0;
    
    svg.setAttribute('width', width * zoom);
    svg.setAttribute('height', height * zoom);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    svg.style.transformOrigin = '0 0';
    
    // Обновляем размер фона сетки
    const bgRect = svg.querySelector('#designerBackground');
    if(bgRect) {
      bgRect.setAttribute('width', width);
      bgRect.setAttribute('height', height);
    }
    const bgLarge = svg.querySelector('rect[fill="url(#designerGridLarge)"]');
    if(bgLarge) {
      bgLarge.setAttribute('width', width);
      bgLarge.setAttribute('height', height);
    }
    
    // Адаптивная видимость сетки в зависимости от масштаба
    const gridExtraLarge = document.getElementById('designerGridExtraLargeRect');
    const gridLarge = svg.querySelector('rect[fill="url(#designerGridLarge)"]');
    const gridSmall = document.getElementById('designerBackground');
    
    if(zoom < 0.5) {
      // При масштабе меньше 50% показываем все три уровня сетки с полной видимостью
      if(gridExtraLarge) {
        gridExtraLarge.style.opacity = '1';
        gridExtraLarge.style.display = 'block';
      }
      if(gridLarge) {
        gridLarge.style.opacity = '1';
        gridLarge.style.display = 'block';
      }
      if(gridSmall) {
        gridSmall.style.opacity = '1';
        gridSmall.style.display = 'block';
      }
    } else if(zoom < 0.8) {
      // При масштабе 50-80% показываем крупную и мелкую сетку
      if(gridExtraLarge) {
        gridExtraLarge.style.opacity = '0.3';
        gridExtraLarge.style.display = 'block';
      }
      if(gridLarge) {
        gridLarge.style.opacity = '1';
        gridLarge.style.display = 'block';
      }
      if(gridSmall) {
        gridSmall.style.opacity = '1';
        gridSmall.style.display = 'block';
      }
    } else {
      // При масштабе больше 80% показываем только мелкую сетку
      if(gridExtraLarge) {
        gridExtraLarge.style.opacity = '0';
        gridExtraLarge.style.display = 'none';
      }
      if(gridLarge) {
        gridLarge.style.opacity = '0.6';
        gridLarge.style.display = 'block';
      }
      if(gridSmall) {
        gridSmall.style.opacity = '1';
        gridSmall.style.display = 'block';
      }
    }
  }
  function updateMinimap() {
    const minimapContent = $("designerMinimapContent");
    const viewport = $("designerMinimapViewport");
    const wrapper = $("designerCanvasWrapper");
    if(!minimapContent || !viewport || !wrapper) return;

    // Clone main content to minimap
    const machinesLayer = $("designerMachinesLayer");
    const connectionsLayer = $("designerConnectionsLayer");
    const zonesLayer = $("designerZonesLayer");

    minimapContent.innerHTML = '';
    if(zonesLayer) minimapContent.appendChild(zonesLayer.cloneNode(true));
    if(connectionsLayer) minimapContent.appendChild(connectionsLayer.cloneNode(true));
    if(machinesLayer) minimapContent.appendChild(machinesLayer.cloneNode(true));

    // Update viewport indicator
    const layout = designer.currentLayout || { width: 2400, height: 1600 };
    const scale = 150 / layout.width;
    const wrapperRect = wrapper.getBoundingClientRect();

    const vpX = (-designer.panX / designer.zoom) * scale;
    const vpY = (-designer.panY / designer.zoom) * scale;
    const vpW = (wrapperRect.width / designer.zoom) * scale;
    const vpH = (wrapperRect.height / designer.zoom) * scale;

    viewport.setAttribute('x', Math.max(0, vpX));
    viewport.setAttribute('y', Math.max(0, vpY));
    viewport.setAttribute('width', Math.min(150, vpW));
    viewport.setAttribute('height', Math.min(100, vpH));
  }

  function updateZoomDisplay() {
    const el = $("designerZoomLevel");
    if(el) el.textContent = Math.round(designer.zoom * 100) + '%';
  }
  
  // CRUD Operations
  async function addMachineToCanvas(machineId) {
    if(!designer.currentLayoutId || currentUser?.role !== 'admin') {
      toast("Ошибка: нет прав администратора");
      return;
    }
    try {
      const machineIdNum = parseInt(machineId);
      if (isNaN(machineIdNum)) {
        toast("Ошибка: неверный ID машины");
        return;
      }
      
      await api("/api/floor-machines", {
        method: "POST",
        body: JSON.stringify({
          layout_id: designer.currentLayoutId,
          machine_id: machineIdNum,
          x: 100 + Math.random() * 200,
          y: 100 + Math.random() * 200
        })
      });
      await loadFloorLayoutFull(designer.currentLayoutId);
      toast("✅ Машина добавлена на схему");
    } catch(e) {
      console.error("Ошибка добавления машины:", e);
      toast("Ошибка: " + (e.message || String(e)));
    }
  }
  
  async function removeMachineFromCanvas(machineId) {
    if(currentUser?.role !== 'admin') return;
    const fm = designer.floorMachines.find(m => m.machine_id === machineId);
    if(!fm) return;
    await deleteFloorMachine(fm.id);
  }
  
  async function addOperatorToCanvas(operatorId) {
    if(!designer.currentLayoutId || currentUser?.role !== 'admin') {
      toast("Ошибка: нет прав администратора");
      return;
    }
    try {
      const operatorIdNum = parseInt(operatorId);
      if (isNaN(operatorIdNum)) {
        toast("Ошибка: неверный ID оператора");
        return;
      }
      
      await api("/api/floor-operators", {
        method: "POST",
        body: JSON.stringify({
          layout_id: designer.currentLayoutId,
          operator_id: operatorIdNum,
          x: 150 + Math.random() * 200,
          y: 150 + Math.random() * 200
        })
      });
      await loadFloorLayoutFull(designer.currentLayoutId);
      toast("✅ Оператор добавлен на схему");
    } catch(e) {
      console.error("Ошибка добавления оператора:", e);
      toast("Ошибка: " + (e.message || String(e)));
    }
  }
  
  async function removeOperatorFromCanvas(operatorId) {
    if(currentUser?.role !== 'admin') return;
    const fo = designer.floorOperators.find(o => o.operator_id === operatorId);
    if(!fo) return;
    await deleteFloorOperator(fo.id);
  }
  
  // Global delete functions
  window.deleteFloorMachine = async function(id) {
    try {
      await api("/api/floor-machines/" + encodeURIComponent(id), { method: "DELETE" });
      designer.floorMachines = designer.floorMachines.filter(m => m.id !== id);
      designer.floorConnections = designer.floorConnections.filter(c => 
        c.from_machine_id !== id && c.to_machine_id !== id);
      deselectAll();
      renderDesignerCanvas();
      renderDesignerMachinesList();
      toast("Машина удалена со схемы");
    } catch(e) {
      toast("Ошибка: " + e.message);
    }
  };
  
  window.deleteFloorOperator = async function(id) {
    try {
      await api("/api/floor-operators/" + encodeURIComponent(id), { method: "DELETE" });
      designer.floorOperators = designer.floorOperators.filter(o => o.id !== id);
      deselectAll();
      renderDesignerCanvas();
      renderDesignerOperatorsList();
      toast("Оператор удален со схемы");
    } catch(e) {
      toast("Ошибка: " + e.message);
    }
  };
  
  async function deleteFloorZone(id) {
    try {
      await api("/api/floor-zones/" + encodeURIComponent(id), { method: "DELETE" });
      designer.floorZones = designer.floorZones.filter(z => z.id !== id);
      renderDesignerCanvas();
      renderDesignerZonesList();
      toast("Зона удалена");
    } catch(e) {
      toast("Ошибка: " + e.message);
    }
  }
  
  window.deleteFloorZone = deleteFloorZone;
  
  window.deleteFloorCamera = async function(id) {
    try {
      await api("/api/cameras/" + encodeURIComponent(id), { method: "DELETE" });
      designer.cameras = designer.cameras.filter(c => c.id !== id);
      renderDesignerCanvas();
      renderDesignerCamerasList();
      toast("Камера удалена");
    } catch(e) {
      toast("Ошибка: " + e.message);
    }
  };
  
  // Poll only after the previous read settles; leaving invalidates in-flight reads.
  function startLiveUpdate() {
    const token = captureView();
    if (polling || !isCurrentView(token)) return;
    polling = true;
    const schedule = () => {
      if (!polling || !isCurrentView(token)) return;
      designer.liveUpdateInterval = setTimeout(async () => {
        designer.liveUpdateInterval = null;
        if (!isCurrentView(token)) { stopLiveUpdate(); return; }
        await loadMachineStatuses();
        schedule();
      }, 5000);
    };
    schedule();
  }

  function stopLiveUpdate() {
    viewActive = false;
    viewEpoch++;
    polling = false;
    if (designer.liveUpdateInterval != null) clearTimeout(designer.liveUpdateInterval);
    designer.liveUpdateInterval = null;
    statusFlight?.controller.abort();
    designer.isPanning = false;
    designer.isDragging = false;
    cancelConnection();
    cancelRouteConnection();
    const wrapper = $("designerCanvasWrapper");
    if (wrapper) { wrapper.style.cursor = 'grab'; wrapper.classList.remove('grabbing'); }
  }

  function resetDesigner() {
    stopLiveUpdate();
    const mounted = designer.eventHandlersInitialized;
    const keydownAdded = designer.keydownHandlerAdded;
    Object.keys(designer).forEach(key => delete designer[key]);
    Object.assign(designer, createDesignerState(), { eventHandlersInitialized: mounted, keydownHandlerAdded: keydownAdded });
    dataOwner = null;
    viewOwner = null;
    entryPromise = null;
    ['designerOrderSelectMain', 'designerOrderSelect', 'designerTemplateSelect', 'designerItemSelect'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
    for (const id of ['designerOrderInfo', 'designerInfoPanel']) {
      const el = $(id); if (el) el.style.display = 'none';
    }
    renderDesignerCanvas();
    renderDesignerCamerasList();
    renderDesignerItemsList();
    updateZoomDisplay();
  }

  async function enterDesigner() {
    const entryEpoch = viewEpoch;
    const entryOwner = currentUser;
    await initDesigner();
    if (!currentUser || currentUser !== entryOwner || viewEpoch !== entryEpoch) return false;
    if (viewActive && viewOwner === currentUser) return entryPromise || true;
    if (viewOwner && viewOwner !== currentUser) resetDesigner();
    viewActive = true;
    viewOwner = currentUser;
    const token = captureView();
    const pending = (async () => {
      if (dataOwner !== currentUser) {
        if (!await loadDesignerViewData(token)) return false;
        dataOwner = currentUser;
      }
      if (!isCurrentView(token)) return false;
      renderDesignerOrderSelectMain();
      fillLegacySelectors();
      startLiveUpdate();
      return true;
    })();
    entryPromise = pending;
    try { return await pending; }
    finally { if (entryPromise === pending) entryPromise = null; }
  }

  async function loadDesignerViewData(token) {
    // Ensure data is loaded
    if(!state.machines || state.machines.length === 0) {
      console.log("Waiting for data to load, calling refreshAll...");
      if(typeof refreshAll === 'function') {
        await refreshAll(false);
        if (!isCurrentView(token)) return false;
      }
    }
    
    // Wait for state.machines to be loaded (max 3 seconds)
    let attempts = 0;
    while((!state.machines || state.machines.length === 0) && attempts < 6) {
      console.log("Waiting for state.machines to load...", attempts);
      await new Promise(r => setTimeout(r, 500));
      if (!isCurrentView(token)) return false;
      attempts++;
    }
    
    console.log("[DESIGNER] State machines:", state.machines?.length || 0, "operators:", state.operators?.length || 0);

    // Загружаем фиксированный шаблон машин (если ещё не загружен)
    if(designer.fixedMachineNodes.length === 0 && state.machines && state.machines.length > 0) {
      await loadFixedMachineTemplate();
      if (!isCurrentView(token)) return false;
      // Загружаем сохранённые позиции машин (если есть)
      await loadFixedMachinePositions();
      if (!isCurrentView(token)) return false;
    }

    // Рендерим главный селектор заказов
    renderDesignerOrderSelectMain();

    // Показываем все фиксированные машины на канвасе (даже если не выбран заказ/изделие)
    if(designer.fixedMachineNodes && designer.fixedMachineNodes.length > 0) {
      designer.routeNodes = [
        {
          id: 'warehouse',
          type: 'warehouse',
          label: '🏭 Склад',
          x: 50,
          y: 300,
          color: '#4CAF50'
        },
        {
          id: 'warehouse_rest',
          type: 'warehouse',
          label: '💤 Отдых',
          x: 50,
          y: 100,
          color: '#FF9800'
        },
        ...designer.fixedMachineNodes.map(n => ({ ...n, operations: [] }))
      ];
      designer.routeEdges = [];
      renderDesignerCanvas();
      console.log("[DESIGNER] Отображены все фиксированные машины на канвасе:", designer.fixedMachineNodes.length, "машин");
    }

    await loadRouteTemplates();
    if (isCurrentView(token)) await loadFloorLayouts();
    return isCurrentView(token);
  }

  // All DOM listeners are mounted once, including the former inline controls.
  async function initDesigner() {
    if (designer.eventHandlersInitialized) return;
    designer.eventHandlersInitialized = true;
    {
      // Показываем кнопку удаления только для администраторов
      const deleteBtn = $("designerDeleteLayout");
      if(deleteBtn) {
        // Проверяем роль пользователя при каждой инициализации
        if(currentUser && currentUser.role === 'admin') {
          deleteBtn.style.display = '';
        } else {
          deleteBtn.style.display = 'none';
        }
      }
      
      $('designerLayoutSelect')?.addEventListener('change', e => loadFloorLayoutFull(e.target.value));
      $('designerCreateFloor')?.addEventListener('submit', async event => {
        event.preventDefault();
        const token = captureView(), button = event.target.querySelector('button');
        const name = $('designerFloorName').value.trim();
        if (!name || !isCurrentView(token)) return;
        button.disabled = true;
        try {
          const layout = await api('/api/floor-layouts', { method: 'POST', body: JSON.stringify({ name }) });
          if (!isCurrentView(token)) return;
          designer.currentLayoutId = layout.id;
          $('designerFloorName').value = '';
          await loadFloorLayouts();
        } catch (e) { if (isCurrentView(token)) floorMessage(e.message); }
        finally { button.disabled = false; }
      });
      
      // === НОВЫЕ ОБРАБОТЧИКИ: Выбор заказа и изделия ===
      
      // Главный селектор заказа
      $("designerOrderSelectMain")?.addEventListener('change', async (e) => {
        const orderId = e.target.value;
        await loadOrderForDesigner(orderId);
        // Синхронизируем скрытый селектор для совместимости
        const hiddenSelect = $("designerOrderSelect");
        if(hiddenSelect && designer.selectedOrderId === orderId) hiddenSelect.value = orderId;
      });
      
      // Селектор изделия (одиночный выбор или все изделия)
      $("designerItemSelect")?.addEventListener('change', async (e) => {
        const itemId = e.target.value;
        if(itemId === '__all__') {
          // Загружаем все изделия заказа
          await loadAllOrderItems();
        } else if(itemId) {
          await loadItemOperations(itemId);
        } else {
          // Если выбрано пустое значение - показываем только фиксированные машины (без операций)
          designer.selectedItemId = null;
          designer.orderOps = [];
          designer.routeEdges = [];
          
          // Используем фиксированные узлы машин (без операций)
          if(designer.fixedMachineNodes && designer.fixedMachineNodes.length > 0) {
            designer.routeNodes = [
              {
                id: 'warehouse',
                type: 'warehouse',
                label: '🏭 Склад',
                x: 50,
                y: 300,
                color: '#4CAF50'
              },
              {
                id: 'warehouse_rest',
                type: 'warehouse',
                label: '💤 Отдых',
                x: 50,
                y: 100,
                color: '#FF9800'
              },
              ...designer.fixedMachineNodes.map(n => ({ ...n, operations: [] }))
            ];
          } else {
            designer.routeNodes = [];
          }
          
          const saveBtn = $("designerSaveItemRoute");
          if(saveBtn) saveBtn.style.display = "none";
        renderDesignerCanvas();
        }
      });
      
      // Кнопка сохранения карты для изделия
      $("designerSaveItemRoute")?.addEventListener('click', async () => {
        if(!designer.selectedItemId) {
          toast("⚠️ Сначала выберите изделие");
          return;
        }
        await showSaveItemRouteModal(designer.selectedItemId);
      });
      
      // Кнопка обновления связей - синхронизирует связи из канваса в операции
      $("designerRefreshConnections")?.addEventListener('click', async () => {
        if((!designer.selectedItemId && (!designer.selectedItemIds || designer.selectedItemIds.length === 0)) || !designer.selectedOrderId) {
          toast("⚠️ Сначала выберите изделие");
          return;
        }
        await syncAllConnectionsToOperations();
        toast("✅ Связи из канваса синхронизированы в операции");
      });
      
      // Кнопка загрузки выбранных изделий (множественный выбор)
      $("designerLoadSelectedItems")?.addEventListener('click', async () => {
        await loadSelectedItems();
      });
      
      // Кнопка удаления всех связей - удаляет связи на канвасе И в операциях
      $("designerClearConnections")?.addEventListener('click', async () => {
        if((!designer.selectedItemId && (!designer.selectedItemIds || designer.selectedItemIds.length === 0)) || !designer.selectedOrderId) {
          toast("⚠️ Сначала выберите изделие");
          return;
        }
        if(confirm("Удалить все взаимосвязи на канвасе и в операциях?")) {
          try {
            // Очищаем связи на канвасе
            designer.routeEdges = [];
            
            // Очищаем связи в операциях (удаляем input_sources и output_targets)
            if(designer.orderOps && designer.orderOps.length > 0) {
              const updatePromises = designer.orderOps.map(op => {
                const fullOp = designer.orderOps.find(o => o.id === op.id) || op;
                return window.OperationUpdates.update(fullOp, {
                    input_sources: JSON.stringify([]),
                    output_targets: JSON.stringify([]),
                    input_critical: 0,
                    output_critical: 0
                  }).catch(e => {
                  console.error(`[DESIGNER] Error clearing connections for op ${op.id}:`, e);
                  return null;
                });
              });
              
              await Promise.all(updatePromises);
              
              // Перезагружаем операции для обновления данных
              const opsRes = await api(`/api/ops?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(designer.selectedItemId)}`);
              designer.orderOps = Array.isArray(opsRes) ? opsRes : [];
            }
            
            // Перерисовываем канвас
            renderDesignerCanvas();
            
            toast("✅ Все взаимосвязи удалены из канваса и операций");
          } catch(e) {
            console.error("[DESIGNER] Error clearing connections:", e);
            toast("⚠️ Ошибка удаления связей: " + (e.message || String(e)));
          }
        }
      });
      
      // Кнопка авто-расположения - НЕ сбрасывает координаты фиксированных машин
      $("designerAutoLayout")?.addEventListener('click', async () => {
        // Восстанавливаем позиции из фиксированных узлов для всех машин
        // НЕ вызываем autoLayoutNodes - он сбрасывает координаты
        if(designer.routeNodes && designer.routeNodes.length > 0) {
          let restoredCount = 0;
          designer.routeNodes.forEach(node => {
            if(node.type === 'machine' && node.machine) {
              const fixedNode = designer.fixedMachineNodes.find(n => n.machine === node.machine);
              if(fixedNode) {
                // Восстанавливаем позицию из фиксированного узла
                node.x = fixedNode.x;
                node.y = fixedNode.y;
                restoredCount++;
              } else if(node.x === undefined || node.x === 0 || node.y === undefined || node.y === 0) {
                // Только для машин без координат - размещаем автоматически
                const idx = designer.fixedMachineNodes.length;
                const nodesPerColumn = 6;
                const startX = 200;
                const startY = 80;
                const columnWidth = 230;
                const nodeHeight = 90;
                
                const columnIndex = Math.floor(idx / nodesPerColumn);
                const rowInColumn = idx % nodesPerColumn;
                node.x = startX + (columnIndex * columnWidth);
                node.y = startY + (rowInColumn * nodeHeight);
                restoredCount++;
              }
            }
          });
          
          renderDesignerCanvas();
          toast(`✅ Позиции ${restoredCount} машин восстановлены из фиксированного шаблона`);
        } else {
          toast("⚠️ Нет узлов для размещения");
        }
      });
      
      // Кнопка сохранения расположения
      $("designerSaveLayout")?.addEventListener('click', async () => {
        if((!designer.selectedItemId && (!designer.selectedItemIds || designer.selectedItemIds.length === 0)) || !designer.selectedOrderId) {
          toast("⚠️ Сначала выберите изделие");
          return;
        }
        
        // Для множественного выбора используем первый выбранный itemId
        const itemId = designer.selectedItemId || (designer.selectedItemIds?.length > 0 ? designer.selectedItemIds[0] : null);
        if(!itemId) {
          toast("⚠️ Выберите изделие для сохранения расположения");
          return;
        }
        
        if(designer.routeNodes.length === 0) {
          toast("⚠️ Нет узлов для сохранения расположения");
          return;
        }
        
        await saveLayoutPositions(itemId);
      });
      
      // Кнопка сохранения базового шаблона машин
      $("designerSaveMachineTemplate")?.addEventListener('click', async () => {
        // Собираем позиции всех машин и складов из текущего канваса
        const positions = {};
        const warehousePositions = {};
        let savedCount = 0;
        let warehouseCount = 0;
        
        // Сначала собираем из routeNodes (текущий канвас)
        if(designer.routeNodes && designer.routeNodes.length > 0) {
          designer.routeNodes.forEach(node => {
            if(node.type === 'machine' && node.machine && node.x !== undefined && node.y !== undefined) {
              // Привязываем к сетке перед сохранением
              const snapped = snapToGrid(node.x, node.y);
              positions[node.machine] = {
                x: Number(snapped.x),
                y: Number(snapped.y)
              };
              savedCount++;
            } else if(node.type === 'warehouse' && node.id && node.x !== undefined && node.y !== undefined) {
              // Сохраняем позиции складов
              const snapped = snapToGrid(node.x, node.y);
              warehousePositions[node.id] = {
                x: Number(snapped.x),
                y: Number(snapped.y)
              };
              warehouseCount++;
            }
          });
        }
        
        // Также обновляем фиксированные узлы машин
        if(designer.fixedMachineNodes && designer.fixedMachineNodes.length > 0) {
          designer.fixedMachineNodes.forEach(fixedNode => {
            // Если позиция есть в routeNodes - используем её
            if(positions[fixedNode.machine]) {
              fixedNode.x = positions[fixedNode.machine].x;
              fixedNode.y = positions[fixedNode.machine].y;
            } else if(fixedNode.x !== undefined && fixedNode.y !== undefined) {
              // Иначе используем текущую позицию фиксированного узла (с привязкой к сетке)
              const snapped = snapToGrid(fixedNode.x, fixedNode.y);
              positions[fixedNode.machine] = {
                x: Number(snapped.x),
                y: Number(snapped.y)
              };
              fixedNode.x = snapped.x;
              fixedNode.y = snapped.y;
              savedCount++;
            }
          });
        }
        
        // Обновляем позиции складов в floorWarehouses
        if(designer.floorWarehouses && designer.floorWarehouses.length > 0) {
          designer.floorWarehouses.forEach(warehouse => {
            if(warehousePositions[warehouse.id]) {
              warehouse.x = warehousePositions[warehouse.id].x;
              warehouse.y = warehousePositions[warehouse.id].y;
            }
          });
        }
        
        if(savedCount === 0 && warehouseCount === 0) {
          toast("⚠️ На канвасе нет машин или складов для сохранения шаблона");
          return;
        }
        
        // Сохраняем позиции машин в состояние
        designer.fixedMachinePositions = positions;
        
        // Сохраняем в базу данных
        try {
          await saveFixedMachinePositions();
          
          // Сохраняем позиции складов в отдельный ключ настроек
          if(warehouseCount > 0) {
            const warehousePositionsKey = 'designer_fixed_warehouse_positions';
            await api("/api/settings/user/" + encodeURIComponent(warehousePositionsKey), {
              method: 'PUT',
              body: JSON.stringify({ value: JSON.stringify(warehousePositions) })
            });
          }
          
          toast(`✅ Базовый шаблон сохранён: ${savedCount} машин, ${warehouseCount} складов`);
          console.log("[DESIGNER] Базовый шаблон сохранён:", savedCount, "машин,", warehouseCount, "складов");
        } catch(e) {
          console.error("[DESIGNER] Ошибка сохранения базового шаблона:", e);
          toast("❌ Ошибка сохранения шаблона: " + (e.message || String(e)));
        }
      });
    }
    
    // Canvas mouse move for connection drawing
    const canvasWrapper = $("designerCanvasWrapper");
    if(canvasWrapper) {
      canvasWrapper.addEventListener('mousemove', (e) => {
        if(!designer.isDrawingConnection) return;
        
        const tempLine = $("designerTempConnection");
        if(!tempLine) return;
        
        const rect = canvasWrapper.getBoundingClientRect();
        const x = (e.clientX - rect.left) / (designer.zoom || 1);
        const y = (e.clientY - rect.top) / (designer.zoom || 1);
        
        tempLine.setAttribute('x2', x);
        tempLine.setAttribute('y2', y);
        
        // Магнитное прилипание к узлам маршрута
        const nearNode = findNearestRouteNode(x, y, 80);
        if(nearNode && nearNode.id !== designer.connectionStartNode?.id) {
          const cx = nearNode.x + (nearNode.type === 'warehouse' ? 60 : 90);
          const cy = nearNode.y + 25;
          tempLine.setAttribute('x2', cx);
          tempLine.setAttribute('y2', cy);
          
          // Подсвечиваем целевой узел
          document.querySelectorAll('.connection-target').forEach(el => el.classList.remove('connection-target'));
          const targetEl = document.querySelector(`[data-node-id="${nearNode.id}"]`);
          if(targetEl) targetEl.classList.add('connection-target');
        } else {
          // Fallback: магнитное прилипание к машинам (для совместимости)
          const nearMachine = findNearestMachine(x, y, 50);
          if(nearMachine && nearMachine.id !== designer.connectionStartMachine?.id) {
            const w = nearMachine.width || 120;
            const h = nearMachine.height || 80;
            tempLine.setAttribute('x2', nearMachine.x + w/2);
            tempLine.setAttribute('y2', nearMachine.y + h/2);
            
            document.querySelectorAll('.connection-target').forEach(el => el.classList.remove('connection-target'));
            const targetEl = document.querySelector(`[data-floor-machine-id="${nearMachine.id}"]`);
            if(targetEl) targetEl.classList.add('connection-target');
          } else {
            document.querySelectorAll('.connection-target').forEach(el => el.classList.remove('connection-target'));
          }
        }
      });
      
      // Клик по пустому месту отменяет связь
      canvasWrapper.addEventListener('click', (e) => {
        if(e.target === canvasWrapper || e.target.id === 'designerSvg' || e.target.id === 'designerBackground') {
          if(designer.isDrawingConnection) {
            cancelConnection();
            cancelRouteConnection();
            toast("Связь отменена");
          } else {
            deselectAll();
            const panel = $("designerInfoPanel");
            if(panel) panel.style.display = 'none';
          }
        }
      });
      
      // Панорамирование ЛКМ на пустом месте canvas
      canvasWrapper.addEventListener('mousedown', (e) => {
        if (!isCurrentView(captureView())) return;
        const panTool = designer.currentTool === 'pan';
        if (e.button !== 1 && !(e.button === 0 && panTool) &&
          !(e.button === 0 && (e.target === canvasWrapper || e.target.id === 'designerSvg' ||
            e.target.id === 'designerBackground' || e.target.closest('rect[fill*="designerGrid"]')))) return;
        if(designer.isDrawingConnection) return;
        
        e.preventDefault();
        designer.isPanning = true;
        designer.panStartX = e.clientX - designer.panX;
        designer.panStartY = e.clientY - designer.panY;
        canvasWrapper.style.cursor = 'grabbing';
      });
      
      window.addEventListener('mousemove', (e) => {
        if(!designer.isPanning) return;
        designer.panX = e.clientX - designer.panStartX;
        designer.panY = e.clientY - designer.panStartY;
        applyCanvasTransform();
      });
      
      window.addEventListener('mouseup', () => {
        if(designer.isPanning) {
          designer.isPanning = false;
          const canvasWrapper = $("designerCanvasWrapper");
          if(canvasWrapper) canvasWrapper.style.cursor = 'grab';
        }
      });
      
      // Клик правой кнопкой на пустом месте - контекстное меню canvas
      canvasWrapper.addEventListener('contextmenu', (e) => {
        if(designer.isDrawingConnection) {
          e.preventDefault();
          cancelConnection();
          cancelRouteConnection();
        } else if(e.target === canvasWrapper || e.target.id === 'designerSvg' || e.target.id === 'designerBackground') {
          e.preventDefault();
          showCanvasContextMenu(e);
        }
      });
    }
    
    // Горячие клавиши
    if(!designer.keydownHandlerAdded) {
      document.addEventListener('keydown', handleDesignerKeydown);
      designer.keydownHandlerAdded = true;
    }
    
    // Tool buttons
    document.querySelectorAll('.designerTool').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.designerTool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        designer.currentTool = btn.dataset.tool;
        
        // Отменяем связь при смене инструмента
        if(designer.isDrawingConnection) cancelConnection();
      });
    });
    
    // Zoom buttons
    $("designerZoomIn")?.addEventListener('click', () => { designer.zoom = Math.min(2, (designer.zoom || 1) * 1.2); applyCanvasTransform(); updateZoomDisplay(); });
    $("designerZoomOut")?.addEventListener('click', () => { designer.zoom = Math.max(0.3, (designer.zoom || 1) / 1.2); applyCanvasTransform(); updateZoomDisplay(); });
    $("designerZoomReset")?.addEventListener('click', () => { designer.zoom = 1; designer.panX = 0; designer.panY = 0; applyCanvasTransform(); updateZoomDisplay(); });
    
    // Delete layout button (admin only)
    $("designerDeleteLayout")?.addEventListener('click', async () => {
      // Проверка прав доступа
      if(!currentUser || currentUser.role !== 'admin') {
        toast("Только администратор может удалять layouts");
        return;
      }
      
      const layoutId = designer.currentLayoutId;
      if(!layoutId) {
        toast("Нет выбранного layout для удаления");
        return;
      }
      
      const layout = designer.layouts.find(l => l.id === layoutId);
      const layoutName = layout?.name || layoutId;
      
      // Подсчитываем количество связанных элементов
      const machinesCount = designer.floorMachines?.length || 0;
      const connectionsCount = designer.floorConnections?.length || 0;
      const operatorsCount = designer.floorOperators?.length || 0;
      const zonesCount = designer.floorZones?.length || 0;
      
      const details = [];
      if(machinesCount > 0) details.push(`- ${machinesCount} машин${machinesCount > 1 ? '' : 'а'}`);
      if(connectionsCount > 0) details.push(`- ${connectionsCount} связей`);
      if(operatorsCount > 0) details.push(`- ${operatorsCount} операторов`);
      if(zonesCount > 0) details.push(`- ${zonesCount} зон`);
      
      const detailsText = details.length > 0 ? `\n\nЭто действие удалит:\n${details.join('\n')}\n\n` : '\n\n';
      
      if(!confirm(`Удалить цех "${layoutName}"?${detailsText}Действие необратимо!`)) {
        return;
      }
      
      try {
        await api(`/api/floor-layouts/${encodeURIComponent(layoutId)}`, { method: 'DELETE' });
        toast("✅ Цех удалён");
        
        // Перезагружаем список цехов
        await loadFloorLayouts();
        
        // Если есть другие цеха, загружаем первый
        if(designer.layouts.length > 0) {
          const nextLayout = designer.layouts[0];
          const sel = $("designerLayoutSelect");
          if(sel) {
            sel.value = nextLayout.id;
            await loadFloorLayoutFull(nextLayout.id);
          }
        } else {
          // Если цехов не осталось, очищаем canvas
          designer.currentLayoutId = null;
          designer.currentLayout = null;
          designer.floorMachines = [];
          designer.floorConnections = [];
          designer.floorOperators = [];
          designer.floorZones = [];
          designer.cameras = [];
          renderDesignerCanvas();
          renderDesignerMachinesList();
          renderDesignerOperatorsList();
          renderDesignerZonesList();
          renderDesignerCamerasList();
        }
      } catch(e) {
        console.error("Failed to delete layout:", e);
        toast("❌ Ошибка удаления цеха: " + (e.message || String(e)));
      }
    });
    
    // Info panel close
    $("designerInfoClose")?.addEventListener('click', () => {
      const panel = $("designerInfoPanel");
      if(panel) panel.style.display = 'none';
      deselectAll();
    });
    
    designer.eventHandlersInitialized = true;
    
    bindCompatibilityControls();
    console.log("Designer module initialized");
  }
  
  function fillLegacySelectors() {
    const orders = $("designerOrderSelect");
    if (orders) {
      orders.innerHTML = '<option value="">— Выберите заказ —</option>' + (state.orders || []).map(order =>
        `<option value="${esc(order.id)}">${esc(order.id)} - ${esc(order.client || 'Без клиента')}</option>`).join('');
      orders.value = designer.selectedOrderId || '';
    }
    const templates = $("designerTemplateSelect");
    if (templates) templates.innerHTML = '<option value="">— Выберите шаблон —</option>' + (state.productTemplates || []).map(template =>
      `<option value="${esc(template.id)}">${esc(template.type || '')} · ${esc(template.name || '')}</option>`).join('');
  }

  function bindCompatibilityControls() {
    $("designerPrint")?.addEventListener('click', printRouteMap);
    $("designerRefreshAnalytics")?.addEventListener('click', async () => {
      if (!designer.currentLayoutId) { toast("Сначала выберите цех"); return; }
      if (await loadDesignerAnalytics()) toast("Аналитика обновлена");
    });
    // Hidden selectors remain available to older connection code. Order changes
    // use the same read-only route loader as the visible selector.
    $("designerOrderSelect")?.addEventListener('change', async e => {
      const template = $("designerTemplateSelect");
      if (template) template.value = '';
      const main = $("designerOrderSelectMain");
      if (main) main.value = e.target.value;
      await loadOrderForDesigner(e.target.value);
    });
    $("designerTemplateSelect")?.addEventListener('change', e => {
      if (e.target.value) toast("Загрузка шаблонов MVP в конструкторе отключена. Используйте заказы для работы с конструктором.");
    });
    $("designerAddCamera")?.addEventListener('click', async () => {
      if (currentUser?.role !== 'admin') return;
      if (!designer.currentLayoutId) { toast("Сначала выберите цех"); return; }
      const name = prompt("Название камеры:");
      if (!name) return;
      const token = captureView();
      const layoutId = designer.currentLayoutId;
      try {
        await api("/api/cameras", { method: "POST", body: JSON.stringify({
          name, layout_id: layoutId, x: 200 + Math.random() * 200, y: 200 + Math.random() * 200
        }) });
        if (!isCurrentView(token)) return;
        await loadFloorLayoutFull(layoutId);
        if (isCurrentView(token)) toast("📹 Камера добавлена");
      } catch(e) { if (isCurrentView(token)) toast("Ошибка: " + e.message); }
    });
    $("designerCanvasWrapper")?.addEventListener('wheel', e => {
      if (!isCurrentView(captureView())) return;
      e.preventDefault();
      const newZoom = Math.min(3, Math.max(0.25, designer.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      const rect = $("designerCanvasWrapper").getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      designer.panX = x - (x - designer.panX) * (newZoom / designer.zoom);
      designer.panY = y - (y - designer.panY) * (newZoom / designer.zoom);
      designer.zoom = newZoom;
      applyCanvasTransform();
      updateZoomDisplay();
      updateMinimap();
    }, { passive: false });
  }

  function findNearestMachine(x, y, threshold) {
    let nearest = null;
    let minDist = threshold;
    
    designer.floorMachines.forEach(fm => {
      const cx = fm.x + (fm.width || 120) / 2;
      const cy = fm.y + (fm.height || 80) / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if(dist < minDist) {
        minDist = dist;
        nearest = fm;
      }
    });
    
    return nearest;
  }
  
  // Найти ближайший узел маршрута
  function findNearestRouteNode(x, y, threshold) {
    let nearest = null;
    let minDist = threshold;
    
    (designer.routeNodes || []).forEach(node => {
      const w = node.type === 'warehouse' ? 120 : 180;
      const h = 50;
      const cx = node.x + w / 2;
      const cy = node.y + h / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if(dist < minDist) {
        minDist = dist;
        nearest = node;
      }
    });
    
    return nearest;
  }
  
  // Обработка горячих клавиш
  function handleDesignerKeydown(e) {
    if (!isCurrentView(captureView())) return;
    // Только если мы в конструкторе
    const designerPane = $("designer");
    if(!designerPane || designerPane.style.display === 'none') return;
    
    // Escape - отмена связи
    if(e.key === 'Escape') {
      if(designer.isDrawingConnection) {
        cancelConnection();
        cancelRouteConnection();
        toast("Связь отменена");
      }
      deselectAll();
      hideContextMenu();
    }
    
    // Delete/Backspace - удаление выделенного
    if(e.key === 'Delete' || e.key === 'Backspace') {
      // Не удаляем если фокус в input
      if(document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      if(designer.selectedEdge) {
        e.preventDefault();
        deleteSelectedRouteEdge();
      } else if(designer.selectedRouteNode) {
        e.preventDefault();
        deleteSelectedRouteNode();
      } else if(designer.selectedData) {
        e.preventDefault();
        if(designer.selectedType === 'connection') {
          deleteSelectedConnection();
        }
      }
    }
    
    // Ctrl+P - печать
    if(e.ctrlKey && e.key === 'p') {
      e.preventDefault();
      printRouteMap();
    }
    
    // +/- масштаб
    if(e.key === '+' || e.key === '=') {
      designer.zoom = Math.min(2, (designer.zoom || 1) * 1.2);
      applyCanvasTransform();
      updateZoomDisplay();
    }
    if(e.key === '-') {
      designer.zoom = Math.max(0.3, (designer.zoom || 1) / 1.2);
      applyCanvasTransform();
      updateZoomDisplay();
    }
    if(e.key === '0') {
      designer.zoom = 1;
      designer.panX = 0;
      designer.panY = 0;
      applyCanvasTransform();
      updateZoomDisplay();
    }
  }
  
  // Удалить выбранное ребро маршрута
  async function deleteSelectedRouteEdge() {
    if(!designer.selectedEdge) return;
    if(!confirm("Удалить связь?")) return;
    
    const edge = designer.selectedEdge;
    const edgeId = edge.id;
    
    // Находим узлы связи
    const fromNode = designer.routeNodes.find(n => n.id === edge.from);
    const toNode = designer.routeNodes.find(n => n.id === edge.to);
    
    // Удаляем связь из массива
    designer.routeEdges = designer.routeEdges.filter(e => e.id !== edgeId);
    
    // Если это двусторонняя связь, удаляем и обратную связь
    if(edge.isBidirectional) {
      const reverseEdge = designer.routeEdges.find(e => 
        e.from === edge.to && e.to === edge.from && e.id !== edge.id
      );
      if(reverseEdge) {
        designer.routeEdges = designer.routeEdges.filter(e => e.id !== reverseEdge.id);
      }
    }
    
    // Обновляем операции в базе данных - удаляем связь из input_sources и output_targets
    if(fromNode && toNode && designer.orderOps) {
      try {
        // Загружаем актуальные данные операций перед обновлением
        if(designer.selectedItemId && designer.selectedOrderId) {
          const opsRes = await api(`/api/ops?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(designer.selectedItemId)}`);
          designer.orderOps = Array.isArray(opsRes) ? opsRes : [];
        }
        
        const fromOps = fromNode.operations || [];
        const toOps = toNode.operations || [];
        
        // Удаляем связь из output_targets операций исходного узла
        for(const opRef of fromOps) {
          // Загружаем актуальную версию операции перед каждым обновлением
          let fullOp;
          try {
            const freshOp = await api(`/api/ops/${opRef.id}`);
            if(freshOp && freshOp.id) {
              fullOp = freshOp;
              // Обновляем операцию в designer.orderOps для следующих операций
              const opIdx = designer.orderOps?.findIndex(o => o.id === opRef.id);
              if(opIdx !== undefined && opIdx >= 0 && designer.orderOps) {
                designer.orderOps[opIdx] = fullOp;
              }
            } else {
              fullOp = designer.orderOps?.find(o => o.id === opRef.id) || opRef;
            }
          } catch(e) {
            // 404 означает, что операция уже удалена - просто пропускаем её
            if(e.message && (e.message.includes('404') || e.message.includes('Not Found'))) {
              console.log(`[DESIGNER] Операция ${opRef.id} уже удалена, пропускаем`);
              continue; // Пропускаем эту операцию и переходим к следующей
            }
            // Для других ошибок используем кэшированную версию
            console.warn(`[DESIGNER] Не удалось загрузить операцию ${opRef.id}, используем кэшированную версию:`, e.message);
            fullOp = designer.orderOps?.find(o => o.id === opRef.id) || opRef;
          }
          
          // Если операция не найдена (например, уже удалена), пропускаем её
          if(!fullOp || !fullOp.id) {
            console.log(`[DESIGNER] Операция ${opRef.id} не найдена, пропускаем обновление`);
            continue;
          }
          
          const currentTargets = parseJsonSafe(fullOp.output_targets) || [];
          const targetMachine = toNode.machine || toNode.label;
          const targetId = toNode.type === 'warehouse' ? toNode.id : targetMachine;
          
          if(currentTargets.includes(targetMachine) || currentTargets.includes(targetId)) {
            const updatedTargets = currentTargets.filter(t => t !== targetMachine && t !== targetId);
            
            const patchBody = {
              output_targets: JSON.stringify(updatedTargets)
            };
            
            await window.OperationUpdates.update(fullOp, patchBody);
            console.log(`[DESIGNER] Удалена связь из output_targets операции ${fullOp.id}, version: ${fullOp.version}`);
          }
        }
        
        // Удаляем связь из input_sources операций целевого узла
        for(const opRef of toOps) {
          // Загружаем актуальную версию операции перед каждым обновлением
          let fullOp;
          try {
            const freshOp = await api(`/api/ops/${opRef.id}`);
            if(freshOp && freshOp.id) {
              fullOp = freshOp;
              // Обновляем операцию в designer.orderOps для следующих операций
              const opIdx = designer.orderOps?.findIndex(o => o.id === opRef.id);
              if(opIdx !== undefined && opIdx >= 0 && designer.orderOps) {
                designer.orderOps[opIdx] = fullOp;
              }
            } else {
              fullOp = designer.orderOps?.find(o => o.id === opRef.id) || opRef;
            }
          } catch(e) {
            // 404 означает, что операция уже удалена - просто пропускаем её
            if(e.message && (e.message.includes('404') || e.message.includes('Not Found'))) {
              console.log(`[DESIGNER] Операция ${opRef.id} уже удалена, пропускаем`);
              continue; // Пропускаем эту операцию и переходим к следующей
            }
            // Для других ошибок используем кэшированную версию
            console.warn(`[DESIGNER] Не удалось загрузить операцию ${opRef.id}, используем кэшированную версию:`, e.message);
            fullOp = designer.orderOps?.find(o => o.id === opRef.id) || opRef;
          }
          
          // Если операция не найдена (например, уже удалена), пропускаем её
          if(!fullOp || !fullOp.id) {
            console.log(`[DESIGNER] Операция ${opRef.id} не найдена, пропускаем обновление`);
            continue;
          }
          
          const currentSources = parseJsonSafe(fullOp.input_sources) || [];
          const sourceMachine = fromNode.machine || fromNode.label;
          const sourceId = fromNode.type === 'warehouse' ? fromNode.id : sourceMachine;
          
          if(currentSources.includes(sourceMachine) || currentSources.includes(sourceId)) {
            const updatedSources = currentSources.filter(s => s !== sourceMachine && s !== sourceId);
            
            const patchBody = {
              input_sources: JSON.stringify(updatedSources)
            };
            
            await window.OperationUpdates.update(fullOp, patchBody);
            console.log(`[DESIGNER] Удалена связь из input_sources операции ${fullOp.id}, version: ${fullOp.version}`);
          }
        }
      } catch(e) {
        console.error("[DESIGNER] Ошибка при удалении связи из операций:", e);
        toast("⚠️ Связь удалена с канваса, но произошла ошибка при обновлении операций");
      }
    }
    
    designer.selectedEdge = null;
    
    renderDesignerCanvas();
    toast("✅ Связь удалена");
  }
  
  // Показать модальное окно для изменения порядка узла
  async function showNodeOrderModal(node) {
    if(!node || node.type !== 'machine') return;
    
    // Получаем операции для этого узла
    const ops = node.operations || [];
    if(ops.length === 0) {
      toast("⚠️ У узла нет связанных операций");
      return;
    }
    
    // Берем первую операцию для получения текущего порядка
    const firstOp = ops[0];
    const opData = designer.orderOps?.find(o => o.id === firstOp.id) || firstOp;
    const currentOrder = opData.no || 1;
    
    // Получаем максимальный порядковый номер для этого изделия
    const itemOps = designer.orderOps?.filter(o => o.order_item_id === opData.order_item_id) || [];
    const maxOrder = itemOps.length > 0 ? Math.max(...itemOps.map(o => Number(o.no || 1))) : currentOrder;
    
    // Создаем модальное окно
    const modal = document.createElement("div");
    modal.className = "designer-order-modal";
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.6);
      padding: 16px;
    `;
    
    modal.innerHTML = `
      <div style="
        background: #fff;
        border-radius: 12px;
        max-width: 400px;
        width: 100%;
        padding: 20px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
      ">
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        ">
          <h3 style="margin: 0; font-size: 18px; font-weight: 700;">📋 Изменить порядок</h3>
          <button class="btn ghost" id="closeOrderModal" style="padding: 6px 10px; font-weight: 700;">×</button>
        </div>
        
        <div style="margin-bottom: 12px; font-size: 13px; color: #666;">
          <div><strong>Оборудование:</strong> ${esc(node.label)}</div>
          <div><strong>Операция:</strong> ${esc(opData.name || '—')}</div>
          <div><strong>Текущий порядок:</strong> ${currentOrder}</div>
        </div>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600;">
            Новый порядковый номер:
          </label>
          <input 
            type="number" 
            id="newOrderNumber" 
            min="1" 
            max="${maxOrder + 10}" 
            value="${currentOrder}"
            style="
              width: 100%;
              padding: 10px;
              font-size: 14px;
              border: 1px solid var(--border);
              border-radius: 6px;
              box-sizing: border-box;
            "
          />
          <div style="font-size: 11px; color: #888; margin-top: 4px;">
            Доступный диапазон: 1 - ${maxOrder + 10}
          </div>
        </div>
        
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button class="btn ghost" id="cancelOrderModal" style="padding: 10px 16px;">Отмена</button>
          <button class="btn accent" id="saveOrderModal" style="padding: 10px 16px; font-weight: 700;">Сохранить</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = () => modal.remove();
    
    modal.querySelector('#closeOrderModal').onclick = closeModal;
    modal.querySelector('#cancelOrderModal').onclick = closeModal;
    modal.onclick = (e) => {
      if(e.target === modal) closeModal();
    };
    
    // Обработчик сохранения
    modal.querySelector('#saveOrderModal').onclick = async () => {
      const newOrderInput = modal.querySelector('#newOrderNumber');
      const newOrder = parseInt(newOrderInput.value, 10);
      
      if(isNaN(newOrder) || newOrder < 1) {
        toast("⚠️ Введите корректный порядковый номер");
        return;
      }
      
      try {
        // Обновляем порядок для всех операций этого узла
        for(const op of ops) {
          const fullOp = designer.orderOps?.find(o => o.id === op.id) || op;
          
          await window.OperationUpdates.update(fullOp, {
              no: newOrder
            });
        }
        
        toast(`✅ Порядок изменён на ${newOrder}`);
        closeModal();
        
        // Перезагружаем данные заказа
        if(designer.selectedOrderId) {
          await loadOrderForDesigner(designer.selectedOrderId);
          // Перезагружаем операции для выбранного изделия
          if(designer.selectedItemId) {
            await loadItemOperations(designer.selectedItemId);
          } else if(designer.selectedItemIds?.length > 0) {
            await loadSelectedItems();
          }
        }
      } catch(e) {
        console.error("[DESIGNER] Error updating operation order:", e);
        toast("⚠️ Ошибка обновления порядка: " + (e.message || String(e)));
      }
    };
    
    // Фокус на поле ввода
    setTimeout(() => {
      const input = modal.querySelector('#newOrderNumber');
      if(input) {
        input.focus();
        input.select();
      }
    }, 100);
  }
  
  // Удалить выбранный узел маршрута
  async function deleteSelectedRouteNode() {
    if(!designer.selectedRouteNode) return;
    
    const node = designer.selectedRouteNode;
    const nodeId = node.id;
    
    // Для узлов машин нужно удалить связанные операции
    if(node.type === 'machine') {
      const ops = node.operations || [];
      if(ops.length > 0) {
        const confirmMessage = `Удалить узел "${node.label}" и ${ops.length} ${ops.length === 1 ? 'операцию' : ops.length < 5 ? 'операции' : 'операций'}?`;
        if(!confirm(confirmMessage)) return;
        
        try {
          // Удаляем все операции, связанные с этим узлом
          for(const op of ops) {
            if(op.id) {
              await api(`/api/ops/${encodeURIComponent(op.id)}`, {
                method: "DELETE"
              });
              console.log(`[DESIGNER] Deleted operation: ${op.id}`);
            }
          }
          
          // Удаляем операции из designer.orderOps
          if(designer.orderOps) {
            const opIds = ops.map(op => op.id).filter(Boolean);
            designer.orderOps = designer.orderOps.filter(op => !opIds.includes(op.id));
          }
          
          toast(`✅ Узел и ${ops.length} ${ops.length === 1 ? 'операция' : 'операций'} удалены`);
        } catch(e) {
          console.error("[DESIGNER] Error deleting operations:", e);
          toast("⚠️ Ошибка удаления операций: " + (e.message || String(e)));
          return;
        }
      } else {
        if(!confirm("Удалить узел и все его связи?")) return;
      }
    } else {
      if(!confirm("Удалить узел и все его связи?")) return;
    }
    
    // Удаляем все связи с этим узлом
    designer.routeEdges = designer.routeEdges.filter(e => e.from !== nodeId && e.to !== nodeId);
    
    // Удаляем узел
    designer.routeNodes = designer.routeNodes.filter(n => n.id !== nodeId);
    designer.selectedRouteNode = null;
    
    // Перезагружаем данные заказа, чтобы обновить операции
    if(designer.selectedOrderId && node.type === 'machine') {
      await loadOrderForDesigner(designer.selectedOrderId);
      // После перезагрузки заказа, нужно перезагрузить операции для выбранного изделия
      if(designer.selectedItemId || designer.selectedItemIds?.length > 0) {
        if(designer.selectedItemIds?.length > 0) {
          // Если выбрано несколько изделий, перезагружаем все
          await loadSelectedItems();
        } else if(designer.selectedItemId) {
          await loadItemOperations(designer.selectedItemId);
        }
      }
    } else {
    renderDesignerCanvas();
    }
  }
  
  // Контекстное меню canvas
  function showCanvasContextMenu(e) {
    hideContextMenu();
    
    const rect = $("designerCanvasWrapper").getBoundingClientRect();
    const x = (e.clientX - rect.left) / (designer.zoom || 1);
    const y = (e.clientY - rect.top) / (designer.zoom || 1);
    
    const menu = document.createElement('div');
    menu.id = 'designerContextMenu';
    menu.className = 'context-menu';
    menu.style.cssText = `
      position: fixed; left: ${e.clientX}px; top: ${e.clientY}px;
      background: var(--bg-primary); border: 1px solid var(--border);
      border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      padding: 4px 0; min-width: 180px; z-index: 10000;
    `;
    
    menu.innerHTML = `
      <div class="context-menu-item" data-action="add-node" style="padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <span>➕</span> Добавить узел
      </div>
      <div class="context-menu-item" data-action="reset-zoom" style="padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <span>🔄</span> Сбросить масштаб
      </div>
      <div class="context-menu-item" data-action="auto-layout" style="padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <span>📐</span> Авто-расположение
      </div>
      <hr style="margin: 4px 0; border: none; border-top: 1px solid var(--border);">
      <div class="context-menu-item" data-action="print" style="padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <span>🖨️</span> Печать маршрута
      </div>
    `;
    
    // Стили hover
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      item.onmouseenter = () => item.style.background = 'var(--bg-secondary)';
      item.onmouseleave = () => item.style.background = '';
    });
    
    // Сохраняем координаты для добавления узла
    menu.dataset.addX = x;
    menu.dataset.addY = y;
    
    menu.onclick = (ev) => {
      const action = ev.target.closest('[data-action]')?.dataset.action;
      if(action === 'add-node') {
        showAddNodeModal(parseFloat(menu.dataset.addX), parseFloat(menu.dataset.addY));
      } else if(action === 'reset-zoom') {
        designer.zoom = 1; designer.panX = 0; designer.panY = 0;
        applyCanvasTransform(); updateZoomDisplay();
      } else if(action === 'auto-layout') {
        // НЕ вызываем autoLayoutNodes - используем только фиксированные позиции машин
        // autoLayoutNodes(); // УДАЛЕНО - сбрасывает координаты машин
        renderDesignerCanvas();
        // Восстанавливаем позиции из фиксированных узлов
        if(designer.routeNodes && designer.routeNodes.length > 0) {
          designer.routeNodes.forEach(node => {
            if(node.type === 'machine' && node.machine) {
              const fixedNode = designer.fixedMachineNodes.find(n => n.machine === node.machine);
              if(fixedNode) {
                node.x = fixedNode.x;
                node.y = fixedNode.y;
              }
            }
          });
        }
        renderDesignerCanvas();
        toast("Позиции машин восстановлены из фиксированного шаблона");
      } else if(action === 'print') {
        printRouteMap();
      }
      hideContextMenu();
    };
    
    document.body.appendChild(menu);
    
    // Закрытие при клике вне меню
    setTimeout(() => {
      document.addEventListener('click', hideContextMenu, { once: true });
    }, 10);
  }
  
  // Скрыть контекстное меню
  function hideContextMenu() {
    const menu = document.getElementById('designerContextMenu');
    if(menu) menu.remove();
  }
  
  // Модальное окно для двусторонней связи
  function showBidirectionalConnectionModal(fromNode, toNode) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    
    modal.innerHTML = `
      <div class="modal-content" style="max-width:400px">
        <div class="modal-header">
          <h3 style="margin:0">🔗 Обнаружена обратная связь</h3>
          <span class="close-button" onclick="this.closest('.modal').remove(); window.DesignerModule.cancelRouteConnection();">&times;</span>
        </div>
        <div class="modal-body" style="padding:20px">
          <p>Уже существует связь от <strong>${esc(toNode.label)}</strong> к <strong>${esc(fromNode.label)}</strong>.</p>
          <p>Хотите сделать её двусторонней?</p>
        </div>
        <div class="modal-footer" style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end">
          <button class="btn ghost" onclick="this.closest('.modal').remove(); window.DesignerModule.cancelRouteConnection();">Отмена</button>
          <button class="btn" onclick="window.DesignerModule.createRouteEdge('${fromNode.id}', '${toNode.id}', false); this.closest('.modal').remove(); window.DesignerModule.cancelRouteConnection();">Односторонняя</button>
          <button class="btn accent" onclick="window.DesignerModule.makeBidirectional('${fromNode.id}', '${toNode.id}'); this.closest('.modal').remove(); window.DesignerModule.cancelRouteConnection();">Двусторонняя</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
  }
  
  // Сделать связь двусторонней
  function makeBidirectional(fromId, toId) {
    // Находим существующую обратную связь
    const reverseEdge = designer.routeEdges.find(e => e.from === toId && e.to === fromId);
    if(reverseEdge) {
      reverseEdge.isBidirectional = true;
    }
    
    // Добавляем прямую связь как двустороннюю
    const newEdge = {
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      from: fromId,
      to: toId,
      color: designer.routeNodes.find(n => n.id === fromId)?.color || '#888',
      isCritical: false,
      isBidirectional: true
    };
    designer.routeEdges.push(newEdge);
    
    renderDesignerCanvas();
    toast("✅ Создана двусторонняя связь");
  }
  
  // Модальное окно добавления узла
  function showAddNodeModal(x, y) {
    // Получаем список машин из state или из глобального window (если state еще не загружен)
    const machinesRaw = state.machines || window.machines || [];
    
    // Обрабатываем разные форматы: массив строк или массив объектов
    const machines = machinesRaw.map(m => {
      if(typeof m === 'string') {
        return { name: m };
      } else if(m && typeof m === 'object') {
        return { name: m.name || m };
      }
      return null;
    }).filter(m => m !== null);
    
    if(machines.length === 0) {
      toast("⚠️ Список машин не загружен. Обновите страницу.");
      console.warn("[DESIGNER] state.machines пуст. State:", Object.keys(state));
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    
    const machineOptions = machines.map(m => 
      `<option value="${esc(m.name)}">${esc(m.name)}</option>`
    ).join('');
    
    modal.innerHTML = `
      <div class="modal-content" style="max-width:400px">
        <div class="modal-header">
          <h3 style="margin:0">➕ Добавить узел</h3>
          <span class="close-button" onclick="this.closest('.modal').remove();">&times;</span>
        </div>
        <div class="modal-body" style="padding:20px">
          <label style="display:block;margin-bottom:8px;font-weight:600">Тип узла:</label>
          <select id="addNodeType" style="width:100%;padding:8px;margin-bottom:16px;border-radius:6px;border:1px solid var(--border)">
            <option value="machine">Машина</option>
            <option value="warehouse">Склад заготовительный</option>
            <option value="warehouse_rest">Склад отдыха</option>
          </select>
          
          <div id="addNodeMachineSelect" style="margin-bottom:16px">
            <label style="display:block;margin-bottom:8px;font-weight:600">Машина:</label>
            <select id="addNodeMachine" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border)">
              ${machineOptions}
            </select>
          </div>
          
          <label style="display:block;margin-bottom:8px;font-weight:600">Название операции (опционально):</label>
          <input type="text" id="addNodeOpName" placeholder="Название операции" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border)">
        </div>
        <div class="modal-footer" style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end">
          <button class="btn ghost" onclick="this.closest('.modal').remove();">Отмена</button>
          <button class="btn accent" id="addNodeConfirmBtn">Добавить</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
    
    // Переключение типа
    modal.querySelector('#addNodeType').onchange = (e) => {
      const machineSelect = modal.querySelector('#addNodeMachineSelect');
      machineSelect.style.display = e.target.value === 'machine' ? 'block' : 'none';
    };
    
    // Подтверждение
    modal.querySelector('#addNodeConfirmBtn').onclick = () => {
      const nodeType = modal.querySelector('#addNodeType').value;
      const machineName = modal.querySelector('#addNodeMachine')?.value || '';
      const opName = modal.querySelector('#addNodeOpName')?.value || '';
      
      addManualNode(x, y, nodeType, machineName, opName);
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    };
  }
  
  // Добавить узел вручную
  function addManualNode(x, y, nodeType, machineName, opName) {
    let label, color, id;
    
    if(nodeType === 'warehouse') {
      id = 'warehouse_manual_' + Date.now();
      label = '🏭 Склад заготовительный';
      color = '#4CAF50';
    } else if(nodeType === 'warehouse_rest') {
      id = 'warehouse_rest_manual_' + Date.now();
      label = '💤 Склад отдыха';
      color = '#FF9800';
    } else {
      id = `machine_${machineName}_manual_${Date.now()}`;
      label = machineName;
      // Берём цвет выбранного изделия или дефолтный
      const selectedItemId = designer.selectedItemId;
      color = selectedItemId ? (designer.itemColors[selectedItemId] || '#3498db') : '#3498db';
    }
    
    const newNode = {
      id,
      type: nodeType === 'machine' ? 'machine' : 'warehouse',
      machine: machineName,
      label,
      x,
      y,
      color,
      operations: opName ? [{ name: opName, id: null }] : [],
      isManual: true
    };
    
    designer.routeNodes.push(newNode);
    renderDesignerCanvas();
    toast("✅ Узел добавлен");
  }
  
  // Печать маршрута
  function printRouteMap() {
    const svg = $("designerSvg");
    if(!svg) {
      toast("Нет данных для печати");
      return;
    }
    
    const orderName = designer.selectedOrderId ? 
      (state.orders?.find(o => o.id === designer.selectedOrderId)?.name || designer.selectedOrderId) : 
      'Без заказа';
    const selectedItem = designer.selectedItemId ? designer.orderItems?.find(i => i.id === designer.selectedItemId) : null;
    const itemName = selectedItem ? (selectedItem.title || selectedItem.type || 'Изделие') : 'Все изделия';
    const date = new Date().toLocaleDateString('ru-RU');
    
    const svgClone = svg.cloneNode(true);
    // Удаляем фоновые элементы
    svgClone.querySelector('#designerBackground')?.remove();
    svgClone.querySelector('#designerTempConnection')?.remove();
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Маршрут: ${esc(orderName)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 18px; margin-bottom: 5px; }
          .meta { font-size: 12px; color: #666; margin-bottom: 20px; }
          svg { max-width: 100%; height: auto; border: 1px solid #ddd; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>🗺️ Маршрут заказа: ${esc(orderName)}</h1>
        <div class="meta">Изделие: ${esc(itemName)} | Дата: ${date}</div>
        ${svgClone.outerHTML}
        <button class="no-print" onclick="window.print()" style="margin-top:20px;padding:10px 20px;cursor:pointer">🖨️ Печать</button>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
  
  // ============= ШАБЛОНЫ МАРШРУТОВ =============
  
  // Загрузить все шаблоны маршрутов
  async function loadRouteTemplates() {
    const token = captureView();
    try {
      const templates = await api('/api/route-templates');
      if (!isCurrentView(token)) return;
      designer.routeTemplates = templates;
      renderRouteTemplatesList();
    } catch(e) {
      console.error('Ошибка загрузки шаблонов:', e);
    }
  }
  
  // Модальное окно сохранения шаблона
  function showSaveTemplateModal() {
    return new Promise((resolve) => {
      const orderName = state.orders?.find(o => o.id === designer.selectedOrderId)?.client || '';
      const selectedItem = designer.selectedItemId ? designer.orderItems?.find(i => i.id === designer.selectedItemId) : null;
      const itemName = selectedItem ? (selectedItem.type || selectedItem.title || 'Изделие') : 'Все изделия';
      const defaultName = `${orderName} - ${itemName}`.slice(0, 50);
      
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10001';
      modal.innerHTML = `
        <div style="background:var(--card);border-radius:12px;padding:24px;min-width:400px;max-width:500px">
          <h3 style="margin:0 0 16px;color:var(--text)">💾 Сохранить маршрут как шаблон</h3>
          <div style="margin-bottom:12px">
            <label style="display:block;margin-bottom:4px;color:var(--muted);font-size:12px">Название шаблона</label>
            <input type="text" id="templateNameInput" value="${esc(defaultName)}" 
                   style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
          </div>
          <div style="margin-bottom:16px">
            <label style="display:block;margin-bottom:4px;color:var(--muted);font-size:12px">Описание (опционально)</label>
            <textarea id="templateDescInput" rows="2" 
                      style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);resize:vertical"></textarea>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn ghost" id="cancelSaveBtn">Отмена</button>
            <button class="btn accent" id="confirmSaveBtn">💾 Сохранить</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      const nameInput = modal.querySelector('#templateNameInput');
      nameInput.focus();
      nameInput.select();
      
      modal.querySelector('#cancelSaveBtn').onclick = () => {
        modal.remove();
        resolve(null);
      };
      
      modal.querySelector('#confirmSaveBtn').onclick = () => {
        const name = nameInput.value.trim();
        const description = modal.querySelector('#templateDescInput').value.trim();
        modal.remove();
        resolve(name ? { name, description } : null);
      };
      
      nameInput.onkeydown = (e) => {
        if(e.key === 'Enter') modal.querySelector('#confirmSaveBtn').click();
        if(e.key === 'Escape') modal.querySelector('#cancelSaveBtn').click();
      };
      
      modal.onclick = (e) => {
        if(e.target === modal) modal.querySelector('#cancelSaveBtn').click();
      };
    });
  }
  
  // Сохранить текущий маршрут как шаблон
  async function saveRouteAsTemplate() {
    if(designer.routeNodes.length === 0) {
      toast("Нет узлов для сохранения");
      return;
    }
    
    const data = await showSaveTemplateModal();
    if(!data) return;
    
    try {
      await api('/api/route-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          nodes: designer.routeNodes,
          edges: designer.routeEdges
        })
      });
      toast("✅ Шаблон маршрута сохранён");
      await loadRouteTemplates();
    } catch(e) {
      toast("❌ Ошибка сохранения: " + e.message);
    }
  }
  
  // Загрузить шаблон на canvas
  async function loadRouteTemplate(template) {
    designer.routeNodes = template.nodes || [];
    designer.routeEdges = template.edges || [];
    renderDesignerCanvas();
    
    // Если есть активный заказ, обновляем operation_flow на основе операций
    // operation_flow будет синхронизирован автоматически при обновлении операций
    // через эндпоинт PUT /api/ops/:id, который вызывает buildOperationFlowFromOps
    const activeOrderId = state.activeOrderId;
    if (activeOrderId && template.nodes && template.nodes.length > 0) {
      // Загружаем операции заказа и обновляем их, чтобы синхронизировать operation_flow
      // Это происходит автоматически через обновление операций
      try {
        // После загрузки шаблона нужно обновить операции заказа,
        // чтобы синхронизировать operation_flow
        // Для этого вызываем refreshAll, который обновит операции и автоматически создаст operation_flow
        setTimeout(async () => {
          try {
            // Обновляем операции, чтобы синхронизировать operation_flow
            // Это происходит через эндпоинт PUT /api/ops/:id, который вызывает buildOperationFlowFromOps
            if (typeof refreshAll === 'function') {
              await refreshAll(false);
            }
          } catch (e) {
            console.error("Ошибка синхронизации operation_flow из шаблона:", e);
          }
        }, 500);
      } catch (e) {
        console.error("Ошибка создания operation_flow из шаблона:", e);
        // Не прерываем загрузку шаблона
      }
    }
    
    toast(`📂 Загружен шаблон: ${template.name}`);
  }
  
  // Удалить шаблон
  async function deleteRouteTemplate(templateId) {
    if(!confirm("Удалить шаблон маршрута?")) return;
    
    try {
      await api(`/api/route-templates/${templateId}`, { method: 'DELETE' });
      toast("🗑️ Шаблон удалён");
      await loadRouteTemplates();
    } catch(e) {
      toast("❌ Ошибка удаления: " + e.message);
    }
  }
  
  // ============= КАРТЫ МАРШРУТОВ ДЛЯ ИЗДЕЛИЙ =============
  
  // Модальное окно сохранения карты для изделия
  function showSaveItemRouteModal(itemId) {
    return new Promise((resolve) => {
      const item = designer.orderItems?.find(i => i.id === itemId);
      const orderName = designer.selectedOrderId || '';
      const itemType = item?.type || 'Изделие';
      const itemTitle = item?.title || '';
      const defaultName = itemTitle 
        ? `${orderName} - ${itemType} - ${itemTitle}`.slice(0, 80)
        : `${orderName} - ${itemType}`.slice(0, 80);
      
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10001';
      modal.innerHTML = `
        <div style="background:var(--card);border-radius:12px;padding:24px;min-width:400px;max-width:500px">
          <h3 style="margin:0 0 16px;color:var(--text)">💾 Сохранить карту маршрута для изделия</h3>
          <div style="margin-bottom:12px">
            <label style="display:block;margin-bottom:4px;color:var(--muted);font-size:12px">Название карты <span style="color:#ff4d4d">*</span></label>
            <input type="text" id="itemRouteNameInput" value="${esc(defaultName)}" 
                   style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
          </div>
          <div style="margin-bottom:16px">
            <label style="display:block;margin-bottom:4px;color:var(--muted);font-size:12px">Описание (опционально)</label>
            <textarea id="itemRouteDescInput" rows="2" 
                      style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);resize:vertical"></textarea>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn ghost" id="cancelItemRouteBtn">Отмена</button>
            <button class="btn accent" id="confirmItemRouteBtn">💾 Сохранить</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      const nameInput = modal.querySelector('#itemRouteNameInput');
      nameInput.focus();
      nameInput.select();
      
      modal.querySelector('#cancelItemRouteBtn').onclick = () => {
        modal.remove();
        resolve(null);
      };
      
      modal.querySelector('#confirmItemRouteBtn').onclick = async () => {
        const name = nameInput.value.trim();
        if(!name) {
          toast("⚠️ Название карты обязательно");
          return;
        }
        const description = modal.querySelector('#itemRouteDescInput').value.trim();
        modal.remove();
        
        // Сохраняем карту
        await saveItemRoute(itemId, name, description);
        resolve({ name, description });
      };
      
      nameInput.onkeydown = (e) => {
        if(e.key === 'Enter') modal.querySelector('#confirmItemRouteBtn').click();
        if(e.key === 'Escape') modal.querySelector('#cancelItemRouteBtn').click();
      };
      
      modal.onclick = (e) => {
        if(e.target === modal) modal.querySelector('#cancelItemRouteBtn').click();
      };
    });
  }
  
  // Сохранить карту маршрута для изделия
  async function saveItemRoute(itemId, routeName, description) {
    if(!itemId || !designer.selectedOrderId) {
      toast("⚠️ Выберите заказ и изделие");
      return;
    }
    
    if(designer.routeNodes.length === 0) {
      toast("⚠️ Нет узлов для сохранения");
      return;
    }
    
    try {
      const routeData = {
        order_id: designer.selectedOrderId,
        order_item_id: itemId,
        name: routeName,
        description: description || '',
        nodes: designer.routeNodes,
        edges: designer.routeEdges
      };
      
      await api('/api/item-routes', {
        method: 'POST',
        body: JSON.stringify(routeData)
      });
      
      toast("✅ Карта маршрута сохранена");
      
      // Сохраняем в локальный кэш
      designer.itemRoutes[itemId] = routeData;
      
    } catch(e) {
      console.error("[DESIGNER] Error saving item route:", e);
      toast("❌ Ошибка сохранения: " + (e.message || String(e)));
    }
  }
  
  // Загрузить сохранённую карту для изделия
  async function loadSavedItemRoute(itemId) {
    if(!itemId || !designer.selectedOrderId) {
      return false;
    }
    
    try {
      const routes = await api(`/api/item-routes?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(itemId)}`);
      
      if(routes && Array.isArray(routes) && routes.length > 0) {
        // Загружаем последнюю сохранённую карту
        const route = routes[0];
        
        // Парсим nodes и edges если они строки
        let nodes = typeof route.nodes === 'string' ? JSON.parse(route.nodes) : route.nodes;
        let edges = typeof route.edges === 'string' ? JSON.parse(route.edges) : route.edges;
        
        // Убеждаемся, что nodes - это массив
        if(!Array.isArray(nodes)) {
          console.error("[DESIGNER] Parsed nodes is not an array:", typeof nodes, nodes);
          nodes = [];
        }
        
        // Убеждаемся, что edges - это массив
        if(!Array.isArray(edges)) {
          console.error("[DESIGNER] Parsed edges is not an array:", typeof edges, edges);
          edges = [];
        }
        
        // ИСПОЛЬЗУЕМ ФИКСИРОВАННЫЕ УЗЛЫ МАШИН вместо создания новых из сохранённого маршрута
        // Загружаем фиксированные узлы если они ещё не загружены
        if(designer.fixedMachineNodes.length === 0) {
          await loadFixedMachineTemplate();
        }
        
        // Создаём узлы маршрута на основе фиксированных узлов машин
        const routeNodes = [];
        
        // Добавляем служебные узлы (склады)
        const specialNodes = nodes.filter(n => n.type === 'warehouse');
        specialNodes.forEach(node => {
          const copiedNode = { ...node };
          const savedX = node.x !== undefined && !isNaN(node.x) ? Number(node.x) : undefined;
          const savedY = node.y !== undefined && !isNaN(node.y) ? Number(node.y) : undefined;
          copiedNode.x = savedX !== undefined ? savedX : (node.id === 'warehouse' ? 50 : 50);
          copiedNode.y = savedY !== undefined ? savedY : (node.id === 'warehouse' ? 300 : 100);
          routeNodes.push(copiedNode);
        });
        
        // Добавляем фиксированные узлы машин с операциями из сохранённого маршрута
        const savedMachineNodes = nodes.filter(n => n.type === 'machine');
        designer.fixedMachineNodes.forEach(fixedNode => {
          // Ищем сохранённый узел для этой машины
          const savedNode = savedMachineNodes.find(n => n.machine === fixedNode.machine);
          
          const nodeCopy = {
            ...fixedNode,
            operations: savedNode?.operations || [],
            x: savedNode && savedNode.x !== undefined && !isNaN(savedNode.x) ? Number(savedNode.x) : fixedNode.x,
            y: savedNode && savedNode.y !== undefined && !isNaN(savedNode.y) ? Number(savedNode.y) : fixedNode.y,
            color: savedNode?.color || fixedNode.color || '#888'
          };
          
          // Обновляем позицию в фиксированных узлах
          fixedNode.x = nodeCopy.x;
          fixedNode.y = nodeCopy.y;
          designer.fixedMachinePositions[fixedNode.machine] = { x: nodeCopy.x, y: nodeCopy.y };
          
          routeNodes.push(nodeCopy);
        });
        
        designer.routeNodes = routeNodes;
        // Загружаем связи с явной инициализацией waypoints
        designer.routeEdges = (edges || []).map(edge => ({
          ...edge,
          waypoints: edge.waypoints || [] // Явно инициализируем waypoints (даже если пустой массив)
        }));
        
        // Проверяем, сколько узлов имеют сохранённые координаты
        const nodesWithCoords = designer.routeNodes.filter(n => 
          n !== null && n !== undefined &&
          n.x !== undefined && n.y !== undefined && 
          !isNaN(n.x) && !isNaN(n.y) && 
          typeof n.x === 'number' && typeof n.y === 'number'
        );
        
        console.log("[DESIGNER] Loaded saved route for item:", itemId, 
          "nodes:", designer.routeNodes.length, 
          "edges:", designer.routeEdges.length,
          "nodes with coordinates:", nodesWithCoords.length);
        
        if(nodesWithCoords.length > 0) {
          console.log("[DESIGNER] Sample node coordinates:", nodesWithCoords.slice(0, 3).map(n => ({ 
            id: n.id, 
            label: n.label, 
            x: n.x, 
            y: n.y,
            type: typeof n.x,
            valid: !isNaN(n.x) && !isNaN(n.y)
          })));
        } else {
          console.warn("[DESIGNER] No nodes with valid coordinates found in loaded route!");
          console.log("[DESIGNER] First 3 nodes:", designer.routeNodes.slice(0, 3).map(n => ({
            id: n?.id,
            x: n?.x,
            y: n?.y,
            xType: typeof n?.x,
            yType: typeof n?.y
          })));
        }
        
        // Обновляем позиции фиксированных машин из загруженного маршрута
        if(designer.fixedMachineNodes && designer.fixedMachineNodes.length > 0) {
          nodes.forEach(loadedNode => {
            if(loadedNode.type === 'machine' && loadedNode.machine) {
              const fixedNode = designer.fixedMachineNodes.find(n => n.machine === loadedNode.machine);
              if(fixedNode && loadedNode.x !== undefined && loadedNode.y !== undefined) {
                fixedNode.x = Number(loadedNode.x);
                fixedNode.y = Number(loadedNode.y);
                // Обновляем также в designer.fixedMachinePositions для сохранения
                designer.fixedMachinePositions[loadedNode.machine] = {
                  x: Number(loadedNode.x),
                  y: Number(loadedNode.y)
                };
              }
            }
          });
        }
        
        // Сохраняем в локальный кэш
        designer.itemRoutes[itemId] = route;
        
        // НЕ вызываем renderDesignerCanvas() здесь - он будет вызван в loadItemOperations
        return true;
      }
      
      return false;
    } catch(e) {
      console.error("[DESIGNER] Error loading saved route:", e);
      return false;
    }
  }
  
  // Сохранить расположение узлов на канвасе
  async function saveLayoutPositions(itemId) {
    if(!itemId || !designer.selectedOrderId) {
      toast("⚠️ Выберите заказ и изделие");
      return;
    }
    
    if(designer.routeNodes.length === 0) {
      toast("⚠️ Нет узлов для сохранения расположения");
      return;
    }
    
    try {
      // Проверяем, есть ли уже сохранённый маршрут для этого изделия
      const routes = await api(`/api/item-routes?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(itemId)}`);
      
      // Копируем текущие узлы с их координатами (сохраняем точно как есть)
      // Получаем координаты напрямую из DOM элементов для более точного сохранения
      const nodesWithPositions = designer.routeNodes.map(node => {
        const savedNode = { ...node };
        
        // Пробуем получить координаты из DOM (если узел уже отрендерен)
        const nodeElement = document.querySelector(`[data-node-id="${node.id}"]`);
        let nodeX = node.x;
        let nodeY = node.y;
        
        if(nodeElement && node.type === 'machine') {
          // Для машин - получаем координаты из circle элемента
          const circle = nodeElement.querySelector('circle');
          if(circle) {
            const cx = parseFloat(circle.getAttribute('cx')) || 0;
            const cy = parseFloat(circle.getAttribute('cy')) || 0;
            const radius = parseFloat(circle.getAttribute('r')) || 30;
            // Преобразуем из центра круга в левый верхний угол
            nodeX = cx - radius;
            nodeY = cy - radius;
          }
        } else if(nodeElement && node.type === 'warehouse') {
          // Для складов - получаем координаты из rect элемента
          const rect = nodeElement.querySelector('rect');
          if(rect) {
            nodeX = parseFloat(rect.getAttribute('x')) || 0;
            nodeY = parseFloat(rect.getAttribute('y')) || 0;
          }
        }
        
        // Явно преобразуем координаты в числа для правильного сохранения в JSON
        savedNode.x = nodeX !== undefined && !isNaN(nodeX) ? Number(nodeX) : 0;
        savedNode.y = nodeY !== undefined && !isNaN(nodeY) ? Number(nodeY) : 0;
        
        // Удаляем временные поля, которые используются только для рендеринга
        delete savedNode._centerX;
        delete savedNode._centerY;
        delete savedNode._radius;
        
        // Логируем первые 3 узла для отладки
        if(designer.routeNodes.indexOf(node) < 3) {
          console.log(`[DESIGNER] Saving node ${node.id}:`, { 
            fromDOM: !!nodeElement, 
            x: savedNode.x, 
            y: savedNode.y,
            nodeX_original: node.x,
            nodeY_original: node.y
          });
        }
        
        return savedNode;
      });
      
      // Сохраняем ТОЛЬКО те связи, которые уже есть на канвасе (не добавляем новые)
      // Включаем контрольные точки (waypoints) для каждой связи
      const edgesToSave = designer.routeEdges.map(edge => ({
        ...edge,
        waypoints: edge.waypoints || [] // Явно сохраняем waypoints (даже если пустой массив)
      }));
      
      console.log("[DESIGNER] Saving layout positions:", {
        itemId,
        nodesCount: nodesWithPositions.length,
        edgesCount: edgesToSave.length,
        nodesWithCoords: nodesWithPositions.filter(n => n.x !== 0 || n.y !== 0).length
      });
      
      if(routes && Array.isArray(routes) && routes.length > 0) {
        // Обновляем существующий маршрут
        const route = routes[0];
        
        await api(`/api/item-routes/${route.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            nodes: nodesWithPositions,
            edges: edgesToSave
          })
        });
        
        // Сохраняем также позиции фиксированных машин
        await saveFixedMachinePositions();
        
        console.log("[DESIGNER] Layout positions updated for route:", route.id, "edges saved:", edgesToSave.length);
        toast("✅ Расположение узлов сохранено");
      } else {
        // Создаём новый маршрут с именем по умолчанию
        const item = designer.orderItems?.find(i => i.id === itemId);
        const routeName = item?.title ? `Маршрут: ${item.title}` : 'Маршрут по умолчанию';
        
        await api('/api/item-routes', {
          method: 'POST',
          body: JSON.stringify({
            order_id: designer.selectedOrderId,
            order_item_id: itemId,
            name: routeName,
            description: 'Автоматически созданный маршрут',
            nodes: nodesWithPositions,
            edges: edgesToSave
          })
        });
        
        console.log("[DESIGNER] New route created with layout positions, edges saved:", edgesToSave.length);
        toast("✅ Расположение узлов сохранено (создан новый маршрут)");
      }
      
      // Обновляем локальный кэш
      const updatedRoutes = await api(`/api/item-routes?orderId=${encodeURIComponent(designer.selectedOrderId)}&orderItemId=${encodeURIComponent(itemId)}`);
      if(updatedRoutes && Array.isArray(updatedRoutes) && updatedRoutes.length > 0) {
        designer.itemRoutes[itemId] = updatedRoutes[0];
      }
      
    } catch(e) {
      console.error("[DESIGNER] Error saving layout positions:", e);
      toast("❌ Ошибка сохранения расположения: " + (e.message || String(e)));
    }
  }
  
  // Рендер списка сохранённых шаблонов
  function renderRouteTemplatesList() {
    const container = $('designerRouteTemplatesList');
    if(!container) return;
    
    const templates = designer.routeTemplates || [];
    
    if(templates.length === 0) {
      container.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:8px;text-align:center">Нет сохранённых шаблонов</div>';
      return;
    }
    
    container.innerHTML = `
      <table style="width:100%;font-size:11px;border-collapse:collapse">
        <thead>
          <tr style="text-align:left;color:var(--muted)">
            <th style="padding:4px">Название</th>
            <th style="padding:4px;width:70px">Дата</th>
            <th style="padding:4px;width:60px"></th>
          </tr>
        </thead>
        <tbody>
          ${templates.map(t => `
            <tr data-id="${t.id}" style="border-top:1px solid var(--border)">
              <td style="padding:4px" title="${esc(t.description || '')}">${esc(t.name)}</td>
              <td style="padding:4px;color:var(--muted)">${new Date(t.updated_at || t.created_at).toLocaleDateString('ru-RU')}</td>
              <td style="padding:4px;text-align:right">
                <button class="btn ghost" style="padding:2px 4px;font-size:10px" data-action="load" title="Загрузить">📥</button>
                <button class="btn ghost" style="padding:2px 4px;font-size:10px" data-action="delete" title="Удалить">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    
    container.querySelectorAll('button[data-action]').forEach(btn => {
      btn.onclick = (e) => {
        const id = btn.closest('tr').dataset.id;
        const action = btn.dataset.action;
        const template = templates.find(t => t.id === id);
        
        if(action === 'load' && template) loadRouteTemplate(template);
        if(action === 'delete') deleteRouteTemplate(id);
        
        e.stopPropagation();
      };
    });
  }
  
  // Контекстное меню для узла
  function showNodeContextMenu(e, node, element) {
    hideContextMenu();
    
    const menu = document.createElement('div');
    menu.id = 'designerContextMenu';
    menu.className = 'context-menu';
    menu.style.cssText = `
      position: fixed; left: ${e.clientX}px; top: ${e.clientY}px;
      background: var(--bg-primary); border: 1px solid var(--border);
      border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      padding: 4px 0; min-width: 180px; z-index: 10000;
    `;
    
    menu.innerHTML = `
      <div class="context-menu-item" data-action="connect-from" style="padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <span>🔗</span> Создать связь отсюда
      </div>
      <div class="context-menu-item" data-action="edit" style="padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <span>✏️</span> Редактировать
      </div>
      <div class="context-menu-item" data-action="change-color" style="padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <span>🎨</span> Изменить цвет
        <input type="color" value="${node.color || '#3498db'}" style="width:20px;height:20px;border:none;cursor:pointer;margin-left:auto">
      </div>
      <hr style="margin: 4px 0; border: none; border-top: 1px solid var(--border);">
      <div class="context-menu-item" data-action="delete" style="padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px; color: #e74c3c;">
        <span>🗑️</span> Удалить узел
      </div>
    `;
    
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      item.onmouseenter = () => item.style.background = 'var(--bg-secondary)';
      item.onmouseleave = () => item.style.background = '';
    });
    
    // Обработчик изменения цвета
    const colorInput = menu.querySelector('input[type="color"]');
    if(colorInput) {
      colorInput.onclick = (e) => e.stopPropagation();
      colorInput.onchange = (e) => {
        node.color = e.target.value;
        renderDesignerCanvas();
        hideContextMenu();
      };
    }
    
    menu.onclick = (ev) => {
      if(ev.target.type === 'color') return; // Пропускаем клик на color input
      
      const action = ev.target.closest('[data-action]')?.dataset.action;
      if(action === 'connect-from') {
        startRouteConnection(node, element);
      } else if(action === 'edit') {
        showNodeEditModal(node);
      } else if(action === 'change-color') {
        colorInput?.click();
        return; // Не закрываем меню
      } else if(action === 'delete') {
        designer.selectedRouteNode = node;
        deleteSelectedRouteNode();
      }
      hideContextMenu();
    };
    
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', hideContextMenu, { once: true }), 10);
  }
  
  // Контекстное меню для связи
  function showEdgeContextMenu(e, edge, element) {
    hideContextMenu();
    
    const menu = document.createElement('div');
    menu.id = 'designerContextMenu';
    menu.className = 'context-menu';
    menu.style.cssText = `
      position: fixed; left: ${e.clientX}px; top: ${e.clientY}px;
      background: var(--bg-primary); border: 1px solid var(--border);
      border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      padding: 4px 0; min-width: 200px; z-index: 10000;
    `;
    
    const biText = edge.isBidirectional ? 'Сделать односторонней' : 'Сделать двусторонней';
    const critText = edge.isCritical ? 'Снять критическую' : 'Пометить как критическую';
    
    menu.innerHTML = `
      <div class="context-menu-item" data-action="toggle-bi" style="padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <span>⇄</span> ${biText}
      </div>
      <div class="context-menu-item" data-action="toggle-crit" style="padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <span>⚠️</span> ${critText}
      </div>
      <div class="context-menu-item" data-action="change-color" style="padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <span>🎨</span> Изменить цвет
        <input type="color" value="${edge.color || '#888'}" style="width:20px;height:20px;border:none;cursor:pointer;margin-left:auto">
      </div>
      <hr style="margin: 4px 0; border: none; border-top: 1px solid var(--border);">
      <div class="context-menu-item" data-action="delete" style="padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 8px; color: #e74c3c;">
        <span>🗑️</span> Удалить связь
      </div>
    `;
    
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      item.onmouseenter = () => item.style.background = 'var(--bg-secondary)';
      item.onmouseleave = () => item.style.background = '';
    });
    
    // Обработчик изменения цвета связи
    const colorInput = menu.querySelector('input[type="color"]');
    if(colorInput) {
      colorInput.onclick = (e) => e.stopPropagation();
      colorInput.onchange = (e) => {
        edge.color = e.target.value;
        renderDesignerCanvas();
        hideContextMenu();
      };
    }
    
    menu.onclick = (ev) => {
      if(ev.target.type === 'color') return;
      
      const action = ev.target.closest('[data-action]')?.dataset.action;
      if(action === 'toggle-bi') {
        toggleEdgeBidirectional(edge);
      } else if(action === 'toggle-crit') {
        // Переключаем критичность связи
        edge.isCritical = !edge.isCritical;
        
        // Также обновляем критичность обратной связи (если она двусторонняя)
        if(edge.isBidirectional) {
          const reverseEdge = designer.routeEdges.find(e => 
            e.from === edge.to && e.to === edge.from && e.id !== edge.id
          );
          if(reverseEdge) {
            reverseEdge.isCritical = edge.isCritical;
          }
        }
        
        console.log(`[DESIGNER] Критичность связи ${edge.id} изменена на:`, edge.isCritical);
        renderDesignerCanvas();
      } else if(action === 'change-color') {
        colorInput?.click();
        return;
      } else if(action === 'delete') {
        designer.selectedEdge = edge;
        deleteSelectedRouteEdge();
      }
      hideContextMenu();
    };
    
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', hideContextMenu, { once: true }), 10);
  }
  
  // Переключить двусторонность связи
  function toggleEdgeBidirectional(edge) {
    if(edge.isBidirectional) {
      // Убираем двусторонность
      edge.isBidirectional = false;
      // Удаляем обратную связь
      designer.routeEdges = designer.routeEdges.filter(
        e => !(e.from === edge.to && e.to === edge.from && e.isBidirectional)
      );
    } else {
      // Делаем двусторонней
      edge.isBidirectional = true;
      // Добавляем обратную связь если её нет
      const hasReverse = designer.routeEdges.some(e => e.from === edge.to && e.to === edge.from);
      if(!hasReverse) {
        designer.routeEdges.push({
          id: `edge_${Date.now()}_rev`,
          from: edge.to,
          to: edge.from,
          color: edge.color,
          isCritical: edge.isCritical,
          isBidirectional: true
        });
      }
    }
    renderDesignerCanvas();
  }
  
  // Модальное окно редактирования узла
  function showNodeEditModal(node) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    
    const ops = node.operations || [];
    const opsHtml = ops.length > 0 ? ops.map((op, i) => 
      `<div style="padding:8px;background:var(--bg-secondary);border-radius:4px;margin-bottom:4px">
        ${i+1}. ${esc(op.name || 'Без названия')} ${op.id ? `<small style="color:var(--muted)">#${op.id.slice(0,8)}</small>` : ''}
      </div>`
    ).join('') : '<p style="color:var(--muted)">Нет операций</p>';
    
    modal.innerHTML = `
      <div class="modal-content" style="max-width:450px">
        <div class="modal-header">
          <h3 style="margin:0">✏️ Редактировать узел</h3>
          <span class="close-button" onclick="this.closest('.modal').remove();">&times;</span>
        </div>
        <div class="modal-body" style="padding:20px">
          <label style="display:block;margin-bottom:8px;font-weight:600">Название:</label>
          <input type="text" id="editNodeLabel" value="${esc(node.label)}" style="width:100%;padding:8px;margin-bottom:16px;border-radius:6px;border:1px solid var(--border)">
          
          <label style="display:block;margin-bottom:8px;font-weight:600">Операции узла:</label>
          <div style="max-height:150px;overflow-y:auto">${opsHtml}</div>
        </div>
        <div class="modal-footer" style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end">
          <button class="btn ghost" onclick="this.closest('.modal').remove();">Отмена</button>
          <button class="btn accent" id="editNodeSaveBtn">Сохранить</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
    
    modal.querySelector('#editNodeSaveBtn').onclick = () => {
      node.label = modal.querySelector('#editNodeLabel').value || node.label;
      renderDesignerCanvas();
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
      toast("✅ Узел обновлён");
    };
  }

  // Delete functions for info panel
  async function deleteSelectedMachine() {
    if(!designer.selectedData || designer.selectedType !== 'machine') return;
    if(!confirm("Удалить машину со схемы?")) return;
    
    await deleteFloorMachine(designer.selectedData.id);
    const panel = $("designerInfoPanel");
    if(panel) panel.style.display = 'none';
  }
  
  async function deleteSelectedOperator() {
    if(!designer.selectedData || designer.selectedType !== 'operator') return;
    if(!confirm("Удалить оператора со схемы?")) return;
    
    await deleteFloorOperator(designer.selectedData.id);
    const panel = $("designerInfoPanel");
    if(panel) panel.style.display = 'none';
  }
  
  async function deleteSelectedConnection() {
    if(!designer.selectedData) return;
    const connId = designer.selectedData.id;
    if(!confirm("Удалить связь?")) return;
    
    await api(`/api/floor-connections/${connId}`, { method: 'DELETE' });
    await loadFloorLayoutFull(designer.currentLayoutId);
    const panel = $("designerInfoPanel");
    if(panel) panel.style.display = 'none';
    toast("Связь удалена");
  }
  
  async function toggleConnectionCritical(connId) {
    const conn = designer.floorConnections.find(c => c.id === connId);
    if(!conn) return;
    
    await api(`/api/floor-connections/${connId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_critical: !conn.is_critical })
    });
    await loadFloorLayoutFull(designer.currentLayoutId);
  }
  
  async function updateConnectionSeq(connId, seq) {
    await api(`/api/floor-connections/${connId}`, {
      method: 'PUT',
      body: JSON.stringify({ seq_order: parseInt(seq) || 0 })
    });
    await loadFloorLayoutFull(designer.currentLayoutId);
    toast("Порядок обновлён");
  }
  
  async function deleteSelectedCamera() {
    if(!designer.selectedData || designer.selectedType !== 'camera') return;
    if(!confirm("Удалить камеру со схемы?")) return;
    
    await api(`/api/cameras/${designer.selectedData.id}`, { method: 'DELETE' });
    await loadFloorLayoutFull(designer.currentLayoutId);
    const panel = $("designerInfoPanel");
    if(panel) panel.style.display = 'none';
    toast("Камера удалена");
  }
  
  async function deleteSelectedProductTemplate() {
    if(!designer.selectedData || designer.selectedType !== 'product-template') return;
    if(!confirm("Удалить шаблон изделия с канваса?")) return;
    
    try {
      await api(`/api/floor-product-templates/${designer.selectedData.id}`, { method: 'DELETE' });
      designer.floorProductTemplates = designer.floorProductTemplates.filter(t => t.id !== designer.selectedData.id);
      renderDesignerCanvas();
      deselectAll();
      toast("Шаблон удален");
    } catch(e) {
      console.error("Ошибка удаления шаблона:", e);
      toast("Ошибка: " + (e.message || String(e)));
    }
  }
  
  async function deleteSelectedWarehouse() {
    if(!designer.selectedData || designer.selectedType !== 'warehouse') return;
    if(!confirm("Удалить склад с канваса?")) return;
    
    try {
      await api(`/api/floor-warehouses/${designer.selectedData.id}`, { method: 'DELETE' });
      designer.floorWarehouses = designer.floorWarehouses.filter(w => w.id !== designer.selectedData.id);
      renderDesignerCanvas();
      deselectAll();
      toast("Склад удален");
    } catch(e) {
      console.error("Ошибка удаления склада:", e);
      toast("Ошибка: " + (e.message || String(e)));
    }
  }
  
  function configureCameraZones(cameraId) {
    const cam = designer.cameras.find(c => c.id === cameraId);
    if(!cam) return;
    
    // Модальное окно для настройки зон камеры
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:500px">
        <div class="modal-header">
          <span style="font-weight:700">⚙️ Настройка камеры: ${esc(cam.name || 'Камера')}</span>
          <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body" style="padding:16px">
          <div style="margin-bottom:16px">
            <label style="font-weight:600">📍 Зоны определения статуса:</label>
            <p style="font-size:12px;color:var(--muted)">Названия зон для внешнего обработчика камеры. Само распознавание здесь не запускается.</p>
          </div>
          
          <div style="display:grid;gap:12px">
            <div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(46,204,113,0.1);border-radius:6px">
              <span style="font-size:24px">🟢</span>
              <div>
                <div style="font-weight:600">СТОП (перед машиной)</div>
                <input type="text" value="${esc(cam.zone_stop || 'front')}" placeholder="front" style="width:100px;margin-top:4px" data-zone="stop">
              </div>
            </div>
            
            <div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(255,176,32,0.1);border-radius:6px">
              <span style="font-size:24px">🟡</span>
              <div>
                <div style="font-weight:600">В РАБОТЕ (сбоку машины)</div>
                <input type="text" value="${esc(cam.zone_working || 'side')}" placeholder="side" style="width:100px;margin-top:4px" data-zone="working">
              </div>
            </div>
            
            <div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(52,152,219,0.1);border-radius:6px">
              <span style="font-size:24px">🔵</span>
              <div>
                <div style="font-weight:600">НАЛАДКА (сзади машины)</div>
                <input type="text" value="${esc(cam.zone_setup || 'back')}" placeholder="back" style="width:100px;margin-top:4px" data-zone="setup">
              </div>
            </div>
          </div>
          
          <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
            <button class="btn accent" onclick="window.DesignerModule.saveCameraZones('${cameraId}', this.closest('.modal'))">💾 Сохранить</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  async function saveCameraZones(cameraId, modal) {
    const zones = {};
    modal.querySelectorAll('[data-zone]').forEach(input => {
      zones['zone_' + input.dataset.zone] = input.value;
    });
    
    await api(`/api/cameras/${cameraId}`, {
      method: 'PUT',
      body: JSON.stringify(zones)
    });
    
    modal.remove();
    await loadFloorLayoutFull(designer.currentLayoutId);
    toast("Настройки камеры сохранены");
  }
  
  // === IP-МОДУЛЬ КАМЕР ===
  
  async function saveCameraSettings(cameraId) {
    const cam = designer.cameras.find(c => c.id === cameraId);
    if(!cam) return;
    
    const ip = $("cameraIP")?.value || '';
    const port = parseInt($("cameraPort")?.value) || 80;
    const apiEndpoint = $("cameraAPI")?.value || '';
    const apiKey = $("cameraKey")?.value || '';
    const machineId = $("cameraMachineLink")?.value ? parseInt($("cameraMachineLink").value) : null;
    
    try {
      await api(`/api/cameras/${cameraId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ip_address: ip,
          port: port,
          api_endpoint: apiEndpoint,
          api_key: apiKey,
          machine_id: machineId
        })
      });
      
      // Обновляем локальные данные
      cam.ip_address = ip;
      cam.port = port;
      cam.api_endpoint = apiEndpoint;
      cam.api_key = apiKey;
      cam.machine_id = machineId;
      
      toast("✅ Настройки камеры сохранены");
    } catch(e) {
      toast("❌ Ошибка: " + e.message);
    }
  }
  
  async function testCameraConnection(cameraId) {
    const cam = designer.cameras.find(c => c.id === cameraId);
    if(!cam) return;
    
    if(!cam.ip_address) {
      toast("⚠️ Укажите IP адрес камеры");
      return;
    }
    
    toast("🔍 Проверка подключения...");
    
    try {
      // Пингуем камеру через API сервера
      const res = await api(`/api/cameras/${cameraId}/ping`, { method: 'POST' });
      
      if(res.online) {
        toast("✅ TCP-порт доступен. Время подключения: " + res.responseTime + "ms");
        // Обновляем статус
        cam.last_ping = new Date().toISOString();
        showInfoPanel('camera', cam);
      } else {
        toast("❌ Камера не отвечает");
      }
    } catch(e) {
      toast("❌ Ошибка подключения: " + e.message);
    }
  }
  
  async function sendCameraStatus(cameraId, status) {
    const cam = designer.cameras.find(c => c.id === cameraId);
    if(!cam) return;
    
    if(!cam.machine_id) {
      toast("⚠️ Камера не привязана к машине");
      return;
    }
    
    const statusMap = {
      'stop': { status: 'idle', text: '🔴 СТОП' },
      'setup': { status: 'setup', text: '🔵 Наладка' },
      'working': { status: 'working', text: '🟡 В работе' },
      'done': { status: 'idle', text: '🟢 Готово' }
    };
    
    const statusInfo = statusMap[status] || statusMap['stop'];
    
    try {
      // Отправляем событие от камеры
      await api('/api/camera-events', {
        method: 'POST',
        body: JSON.stringify({
          camera_id: cameraId,
          api_key: cam.api_key || '',
          event_type: 'manual_status',
          machine_status: statusInfo.status,
          operator_detected: status !== 'stop',
          confidence: 1.0,
          metadata: { source: 'manual', user: currentUser?.username }
        })
      });
      
      toast(`${statusInfo.text} - статус отправлен`);
      
      // Обновляем статус машины на canvas
      await loadMachineStatuses();
    } catch(e) {
      toast("❌ Ошибка: " + e.message);
    }
  }
  
  // Expose module
  // Экспорт функций для внешнего доступа
  window.DesignerModule = {
    init: initDesigner,
    enter: enterDesigner,
    reset: resetDesigner,
    loadDesignerAnalytics,
    loadFloorLayouts,
    loadFloorLayoutFull,
    renderDesignerCanvas,
    renderDesignerMachinesList,
    updateOrderOpsFromConnections,
    renderDesignerOperatorsList,
    startLiveUpdate,
    stopLiveUpdate,
    deleteSelectedMachine,
    deleteSelectedOperator,
    deleteSelectedProductTemplate,
    deleteSelectedWarehouse,
    deleteSelectedCamera,
    deleteSelectedConnection,
    toggleConnectionCritical,
    updateConnectionSeq,
    configureCameraZones,
    saveCameraZones,
    // IP-модуль камер
    saveCameraSettings,
    testCameraConnection,
    sendCameraStatus,
    // Связи
    cancelConnection,
    confirmConnectionDirection,
    // Новые функции для работы с заказами
    loadOrderForDesigner,
    buildRouteGraph,
    buildConnectionsFromOperations,
    syncAllConnectionsToOperations,
    refreshConnections,
    loadAllOrderItems,
    createRouteEdge,
    makeBidirectional,
    cancelRouteConnection,
    autoLayoutNodes,
    saveRouteLayout,
    loadRouteLayout,
    updateRouteConnection,
    deleteRouteConnection,
    // Новые функции для управления связями (ПКМ)
    cancelRouteConnection,
    createRouteEdge,
    makeBidirectional,
    printRouteMap,
    addManualNode,
    // Шаблоны маршрутов
    loadRouteTemplates,
    saveRouteAsTemplate,
    loadRouteTemplate,
    deleteRouteTemplate,
    renderRouteTemplatesList,
    // Карты маршрутов для изделий
    loadItemOperations,
    showSaveItemRouteModal,
    saveItemRoute,
    loadSavedItemRoute
  };
  
  // Auto-init if designer pane is visible
  // НЕ вызываем автоматически - будет вызван через switchPane
  // if($("designer")?.style.display !== 'none') {
  //   initDesigner();
  // }
  
})();


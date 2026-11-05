/**
 * B'BOX Production - Simple Cutting Master Module
 * ===============================================
 * Простой мастер кроя - упрощенная версия для быстрого расчета
 */

(function() {
  'use strict';

  if (window.SimpleCuttingModule && window.SimpleCuttingModule.loaded) {
    console.log('Simple Cutting module already loaded');
    return;
  }

  console.log('Loading Simple Cutting Master module...');

  // Helper functions - ensure they're available
  const $ = window.$ || ((id) => document.getElementById(id));
  const toast = window.toast || ((msg) => {
    console.log("Toast:", msg);
    const el = document.getElementById("toast");
    const msgEl = document.getElementById("toastMsg");
    if (el && msgEl) {
      msgEl.textContent = msg;
      el.style.display = "block";
      setTimeout(() => { el.style.display = "none"; }, 3000);
    } else {
      alert(msg);
    }
  });
  const esc = window.esc || ((str) => {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  });
  const api = window.api || (async (path, opts = {}) => {
    console.error("API function not available!");
    throw new Error("API function not available");
  });

  // Simple cutting state
  const simpleCutting = {
    currentMaterial: null,
    currentLayout: null,
    taskId: null,
    importedSvg: null,
    svgContent: null,
    svgWidth: 0,
    svgLength: 0,
    sortBy: null,
    sortDir: "asc"
  };

  window.simpleCutting = simpleCutting;

  // Render simple cutting (called on pane switch)
  async function renderSimpleCutting() {
    console.log("Rendering Simple Cutting Master...");
    
    // Check if state is available, wait if needed
    let retries = 0;
    while (typeof window.state === 'undefined' && retries < 10) {
      console.log(`Waiting for window.state... (attempt ${retries + 1}/10)`);
      await new Promise(resolve => setTimeout(resolve, 200));
      retries++;
    }
    
    if (typeof window.state === 'undefined') {
      console.error("window.state is not defined after waiting!");
      toast("❌ Ошибка: state не загружен. Перезагрузите страницу или нажмите кнопку обновления.");
      return;
    }
    
    const state = window.state;
    console.log("State available:", {
      materials: !!state.materials,
      materialsCount: state.materials?.length || 0,
      orders: !!state.orders,
      ordersCount: state.orders?.length || 0
    });
    
    // Если материалы не загружены, пытаемся загрузить их
    if (!state.materials || state.materials.length === 0) {
      console.log("Materials not loaded, attempting to refresh...");
      const refreshAll = window.refreshAll;
      if (typeof refreshAll === 'function') {
        try {
          await refreshAll(false);
          console.log("Materials refreshed, count:", state.materials?.length || 0);
        } catch (e) {
          console.error("Error refreshing materials:", e);
        }
      }
    }
    
    try {
      // Wait a bit to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log("Calling renderMaterialSelect...");
      // Load materials from state
      renderMaterialSelect();

      console.log("Calling setupEventHandlers...");
      // Setup event handlers
      setupEventHandlers();

      console.log("Calling loadAndRenderSavedLayouts...");
      // Load and display saved layouts
      await loadAndRenderSavedLayouts();

      console.log("Simple Cutting Master rendered successfully");
    } catch (error) {
      console.error("Error rendering Simple Cutting Master:", error);
      console.error("Error stack:", error.stack);
      toast("❌ Ошибка инициализации кроя: " + (error.message || String(error)));
    }
  }

  // Initialize the simple cutting module
  async function init() {
    console.log("SimpleCuttingModule.init() called");
    console.log("Checking dependencies...");
    console.log("window.api:", typeof window.api);
    console.log("window.state:", typeof window.state);
    console.log("window.$:", typeof window.$);
    console.log("window.toast:", typeof window.toast);
    
    if (typeof window.api !== 'function') {
      console.error("window.api is not a function! Available:", window.api);
      toast("❌ Ошибка: API функция не доступна. Перезагрузите страницу.");
      return;
    }
    
    if (typeof window.state === 'undefined') {
      console.error("window.state is undefined!");
      toast("❌ Ошибка: state не загружен. Перезагрузите страницу.");
      return;
    }
    
    try {
      await renderSimpleCutting();
      console.log("SimpleCuttingModule.init() completed successfully");
    } catch (error) {
      console.error("SimpleCuttingModule.init() failed:", error);
      console.error("Error stack:", error.stack);
      toast("❌ Ошибка инициализации кроя: " + (error.message || String(error)));
      throw error;
    }
  }

  // Render material select
  function renderMaterialSelect() {
    console.log("renderMaterialSelect called");
    const state = window.state || {};
    const sel = $("simpleCuttingMaterialSelect");
    if (!sel) {
      console.error("simpleCuttingMaterialSelect element not found!");
      return;
    }
    console.log("simpleCuttingMaterialSelect element found:", sel);

    const materials = (window.state || {}).materials || [];
    console.log(`Rendering simple material select with ${materials.length} materials`);
    console.log("Materials sample:", materials.slice(0, 3).map(m => ({
      id: m.id,
      name: m.name,
      width_mm: m.width_mm,
      length_mm: m.length_mm
    })));

    // Filter only sheet materials
    const sheetMaterials = materials.filter(m => {
      const hasLength = m.length_mm && parseFloat(m.length_mm) > 0;
      const hasWidth = m.width_mm && parseFloat(m.width_mm) > 0;
      return hasLength && hasWidth;
    });

    if (sheetMaterials.length === 0) {
      if (materials.length === 0) {
        sel.innerHTML = '<option value="">— Загрузите материалы (нажмите 🔄) —</option>';
      } else {
        sel.innerHTML = '<option value="">— Нет листовых материалов в базе —</option>';
      }
      return;
    }

    // Sort by name
    sheetMaterials.sort((a, b) => {
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB, "ru");
    });

    sel.innerHTML = '<option value="">— Выберите материал —</option>' +
      sheetMaterials.map(m => {
        const width = parseFloat(m.width_mm) || 0;
        const length = parseFloat(m.length_mm) || 0;
        const thickness = m.thickness_mm ? `, ${m.thickness_mm}мм` : '';

        return `<option value="${esc(m.id)}"
                data-width="${width}"
                data-length="${length}"
                data-thickness="${m.thickness_mm || ''}">
            ${esc(m.name)} — ${width}×${length}мм${thickness}
          </option>`;
      }).join('');

    // Material change handler
    sel.onchange = () => {
      const option = sel.options[sel.selectedIndex];
      if (option && option.dataset.width && option.value) {
        simpleCutting.currentMaterial = {
          id: sel.value,
          name: option.textContent.split(' — ')[0],
          width: parseFloat(option.dataset.width),
          length: parseFloat(option.dataset.length),
          thickness: parseFloat(option.dataset.thickness) || 0
        };

        // Auto-fill sheet dimensions
        const widthInput = $("simpleSheetWidth");
        const lengthInput = $("simpleSheetLength");
        const thicknessInput = $("simpleThickness");

        if (widthInput) widthInput.value = simpleCutting.currentMaterial.width;
        if (lengthInput) lengthInput.value = simpleCutting.currentMaterial.length;
        if (thicknessInput) thicknessInput.value = simpleCutting.currentMaterial.thickness;

        toast(`✅ Выбран материал: ${simpleCutting.currentMaterial.name}`);
      } else {
        simpleCutting.currentMaterial = null;
        $("simpleSheetWidth").value = "";
        $("simpleSheetLength").value = "";
        $("simpleThickness").value = "";
      }
    };
  }

  // Setup event handlers
  function setupEventHandlers() {
    console.log("Setting up event handlers...");
    
    // Ensure global functions are available
    const refreshAll = window.refreshAll || (async () => {
      console.warn("refreshAll not available");
      throw new Error("refreshAll function not available");
    });
    
    // Refresh materials button
    const refreshBtn = $("simpleRefreshMaterials");
    console.log("refreshBtn found:", !!refreshBtn);
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = "⏳";
        try {
          await refreshAll(false);
          renderMaterialSelect();
          toast("✅ Список материалов обновлен");
        } catch (e) {
          console.error("Failed to refresh materials:", e);
          toast("❌ Ошибка обновления материалов: " + (e.message || String(e)));
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.textContent = "🔄";
        }
      };
    } else {
      console.warn("simpleRefreshMaterials button not found");
    }

    // Calculate button
    const calcBtn = $("simpleCuttingCalculate");
    if (calcBtn) {
      calcBtn.onclick = () => {
        const materialId = $("simpleCuttingMaterialSelect")?.value;
        const pieceWidth = parseFloat($("simplePieceWidth")?.value) || 0;
        const pieceLength = parseFloat($("simplePieceLength")?.value) || 0;
        const kerf = parseFloat($("simpleKerf")?.value) || 0;

        // Validation
        if (!materialId) {
          toast("❌ Выберите листовый материал");
          return;
        }
        if (!pieceWidth || !pieceLength) {
          toast("❌ Укажите размеры заготовки");
          return;
        }
        if (pieceWidth <= 0 || pieceLength <= 0) {
          toast("❌ Размеры заготовки должны быть больше 0");
          return;
        }

        // Show results area
        const resultDiv = $("simpleCuttingResult");
        if (resultDiv) resultDiv.style.display = "block";

        // Calculate cutting layout for identical pieces
        calculateSimpleLayout(materialId, pieceWidth, pieceLength, kerf);
      };
    }

    // Print label button
    const printBtn = $("simplePrintLabel");
    if (printBtn) {
      printBtn.onclick = async () => {
        if (simpleCutting.currentLayout && simpleCutting.taskId) {
          await printSimpleLabel();
        } else {
          toast("❌ Сначала рассчитайте раскрой");
        }
      };
    }

    // Save layout button
    const saveBtn = $("simpleCuttingSave");
    if (saveBtn) {
      saveBtn.onclick = async () => {
        if (!simpleCutting.currentLayout) {
          toast("❌ Сначала рассчитайте раскрой");
          return;
        }
        await saveSimpleCuttingLayout();
      };
    }

    // SVG Import button
    const svgImportBtn = $("simpleSvgImportBtn");
    const svgImportInput = $("simpleSvgImport");
    const svgClearBtn = $("simpleSvgClearBtn");
    const svgInfo = $("simpleSvgInfo");

    if (svgImportBtn && svgImportInput) {
      svgImportBtn.onclick = () => {
        svgImportInput.click();
      };

      svgImportInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.svg')) {
          toast("❌ Выберите SVG файл");
          return;
        }

        try {
          const text = await file.text();
          await loadSvgFromText(text);
          toast("✅ SVG загружен");
        } catch (error) {
          console.error("Error loading SVG:", error);
          toast("❌ Ошибка загрузки SVG: " + error.message);
        }
      };
    }

    // Clear SVG button
    if (svgClearBtn) {
      svgClearBtn.onclick = () => {
        simpleCutting.importedSvg = null;
        simpleCutting.svgContent = null;
        simpleCutting.svgWidth = 0;
        simpleCutting.svgLength = 0;

        if (svgImportInput) svgImportInput.value = "";
        if (svgInfo) {
          svgInfo.style.display = "none";
          svgInfo.textContent = "";
        }
        if (svgClearBtn) svgClearBtn.style.display = "none";

        // Очищаем поля размеров заготовки
        const pieceWidth = $("simplePieceWidth");
        const pieceLength = $("simplePieceLength");
        if (pieceWidth) pieceWidth.value = "";
        if (pieceLength) pieceLength.value = "";

        // Очищаем превью
        const resultDiv = $("simpleCuttingResult");
        if (resultDiv) resultDiv.style.display = "none";

        toast("✅ SVG очищен");
      };
    }

    // Refresh saved layouts button
    const refreshLayoutsBtn = $("simpleRefreshLayouts");
    if (refreshLayoutsBtn) {
      refreshLayoutsBtn.onclick = async () => {
        refreshLayoutsBtn.disabled = true;
        try {
          await loadAndRenderSavedLayouts();
          toast("✅ Список раскроев обновлен");
        } catch (e) {
          console.error("Error refreshing layouts:", e);
          toast("❌ Ошибка обновления: " + (e.message || String(e)));
        } finally {
          refreshLayoutsBtn.disabled = false;
        }
      };
    }

    // Setup table header click handlers for sorting
    setTimeout(() => {
      const table = document.querySelector("#simpleCuttingLayoutsTable")?.closest("table");
      if (table) {
        const headers = table.querySelectorAll("thead th[data-sort]");
        headers.forEach(th => {
          th.onclick = () => {
            const sortBy = th.dataset.sort;
            const currentSort = simpleCutting.sortBy || null;
            const currentDir = simpleCutting.sortDir || "asc";
            
            // Toggle direction if same column
            if (currentSort === sortBy) {
              simpleCutting.sortDir = currentDir === "asc" ? "desc" : "asc";
            } else {
              simpleCutting.sortBy = sortBy;
              simpleCutting.sortDir = "asc";
            }
            
            // Update visual indicators
            headers.forEach(h => {
              const col = h.dataset.sort;
              let txt = h.textContent.replace(/[▲▼]/g, "").trim();
              if (col === simpleCutting.sortBy) {
                txt += simpleCutting.sortDir === "asc" ? " ▲" : " ▼";
              } else {
                txt += " ▲▼";
              }
              h.textContent = txt;
            });
            
            // Reload table with sorting
            loadAndRenderSavedLayouts();
          };
        });
      }
    }, 100);
  }

  // Load SVG from text and extract dimensions
  async function loadSvgFromText(svgText) {
    try {
      // Парсим SVG для получения размеров
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
      const svgElement = svgDoc.querySelector("svg");

      if (!svgElement) {
        throw new Error("SVG элемент не найден");
      }

      // Получаем размеры из viewBox или width/height
      let width = 0;
      let length = 0;

      // Пробуем viewBox
      const viewBox = svgElement.getAttribute("viewBox");
      if (viewBox) {
        const parts = viewBox.split(/\s+/);
        if (parts.length >= 4) {
          width = parseFloat(parts[2]) - parseFloat(parts[0]);
          length = parseFloat(parts[3]) - parseFloat(parts[1]);
        }
      }

      // Если нет viewBox, пробуем width и height
      if (!width || !length) {
        const svgWidth = svgElement.getAttribute("width");
        const svgHeight = svgElement.getAttribute("height");

        if (svgWidth) {
          width = parseFloat(svgWidth.replace(/[^0-9.]/g, ""));
        }
        if (svgHeight) {
          length = parseFloat(svgHeight.replace(/[^0-9.]/g, ""));
        }
      }

      // Если всё ещё нет размеров, вычисляем bounding box
      if (!width || !length) {
        const bbox = svgElement.getBBox();
        if (bbox.width && bbox.height) {
          width = bbox.width;
          length = bbox.height;
        } else {
          throw new Error("Не удалось определить размеры SVG");
        }
      }

      // Сохраняем данные
      simpleCutting.importedSvg = svgText;
      simpleCutting.svgContent = svgElement.outerHTML;
      simpleCutting.svgWidth = width;
      simpleCutting.svgLength = length;

      // Заполняем поля размеров заготовки
      const pieceWidth = $("simplePieceWidth");
      const pieceLength = $("simplePieceLength");
      if (pieceWidth) pieceWidth.value = Math.round(width * 10) / 10;
      if (pieceLength) pieceLength.value = Math.round(length * 10) / 10;

      // Показываем информацию о загруженном SVG
      const svgInfo = $("simpleSvgInfo");
      const svgClearBtn = $("simpleSvgClearBtn");
      if (svgInfo) {
        svgInfo.style.display = "block";
        svgInfo.textContent = `✅ SVG загружен: ${Math.round(width)}×${Math.round(length)}мм`;
      }
      if (svgClearBtn) svgClearBtn.style.display = "inline-block";

      console.log("SVG loaded:", { width, length, svgText: svgText.substring(0, 100) });
    } catch (error) {
      console.error("Error parsing SVG:", error);
      throw error;
    }
  }

  // Calculate cutting layout for identical pieces
  async function calculateSimpleLayout(materialId, pieceWidth, pieceLength, kerf) {
    const sheetWidth = simpleCutting.currentMaterial?.width || 0;
    const sheetLength = simpleCutting.currentMaterial?.length || 0;

    if (sheetWidth <= 0 || sheetLength <= 0) {
      toast("❌ Размеры листа не определены");
      return;
    }

    // Рассчитываем размещение одинаковых заготовок с учетом отступа реза
    const result = packIdenticalPieces(sheetWidth, sheetLength, pieceWidth, pieceLength, kerf);

    console.log("Simple calculation result:", result);
    simpleCutting.currentLayout = result;
    simpleCutting.currentPieceWidth = pieceWidth;
    simpleCutting.currentPieceLength = pieceLength;
    simpleCutting.currentKerf = kerf;

    // Generate task ID
    simpleCutting.taskId = `SIMPLE-${Date.now().toString(36).toUpperCase().slice(-8)}`;

    // Render results
    renderSimpleResults(result, pieceWidth, pieceLength, kerf);
    renderSimplePreview(result, sheetWidth, sheetLength);
    renderSimpleLabel();

    // Показываем кнопку "Сохранить"
    const saveBtn = $("simpleCuttingSave");
    if (saveBtn) {
      saveBtn.style.display = "inline-block";
      saveBtn.disabled = false;
    }
    
    // Показываем поле выбора клиента и заполняем его
    const clientField = $("simpleCuttingClientField");
    const clientSelect = $("simpleCuttingClientSelect");
    if (clientField && clientSelect) {
      // Заполняем селектор клиентов из заказов
      const state = window.state || {};
      const clients = new Set();
      if (state.orders && Array.isArray(state.orders)) {
        state.orders.forEach(order => {
          if (order.client && order.client.trim()) {
            clients.add(order.client.trim());
          }
        });
      }
      
      const clientList = Array.from(clients).sort((a, b) => a.localeCompare(b, "ru"));
      const esc = window.esc || ((str) => {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      });
      
      clientSelect.innerHTML = '<option value="">— Без клиента —</option>' +
        clientList.map(client => `<option value="${esc(client)}">${esc(client)}</option>`).join('');
      
      clientField.style.display = "block";
    }
    
    // Сообщение с информацией об ориентации
    const rotationMsg = result.rotated ? ' (заготовки повернуты на 90° для оптимизации)' : '';
    toast(`✅ На листе размещено: ${result.piecesCount} заготовок, отходы: ${result.wastePercent}%${rotationMsg}`);
  }

  // Save cutting layout to database
  async function saveSimpleCuttingLayout() {
    const layout = simpleCutting.currentLayout;
    const material = simpleCutting.currentMaterial;
    const pieceWidth = simpleCutting.currentPieceWidth || 0;
    const pieceLength = simpleCutting.currentPieceLength || 0;
    const kerf = simpleCutting.currentKerf || 0;

    if (!layout || !material) {
      toast("❌ Нет данных для сохранения");
      return;
    }

    // Проверяем, что отходы есть в layout
    console.log("Saving layout with waste:", {
      wasteWidth: layout.wasteWidth,
      wasteLength: layout.wasteLength,
      wasteArea: layout.wasteArea,
      wastePercent: layout.wastePercent
    });
    
    // Генерируем SVG для сохранения ТОЧНО ТАК ЖЕ, как в предпросмотре после нажатия "Рассчитать"
    // Используем те же параметры: mode: 'preview', scaleMultiplier: 1, fontScale: 1
    // Это гарантирует, что сохранённый SVG будет выглядеть точно так же, как в предпросмотре
    const previewSvg = generateSvgForLayout(layout, material.width, material.length, pieceWidth, pieceLength, kerf, {
      mode: 'preview',
      scaleMultiplier: 1,
      fontScale: 1
    });

    try {
      const saveBtn = $("simpleCuttingSave");
      if (saveBtn) saveBtn.disabled = true;

      // Формируем ID на основе размеров: размер_заготовки_размер_бумаги
      // Например: 110_200_1200_890_2 (width_length_sheetWidth_sheetLength_thickness)
      const thickness = material.thickness || 0;
      const cuttingId = `${Math.round(pieceWidth)}_${Math.round(pieceLength)}_${Math.round(material.width)}_${Math.round(material.length)}_${Math.round(thickness)}`;

      // Получаем выбранного клиента
      const clientSelect = $("simpleCuttingClientSelect");
      const selectedClient = clientSelect && clientSelect.value ? clientSelect.value.trim() : null;

      const layoutData = {
        id: cuttingId, // Используем ID на основе размеров
        material_id: material.id || null,
        sheet_width_mm: material.width,
        sheet_length_mm: material.length,
        box_width_mm: pieceWidth, // Используем размеры заготовки
        box_length_mm: pieceLength,
        box_height_mm: 0, // Не используется в простом крое
        thickness_mm: thickness,
        layout_svg: previewSvg,
        pieces_count: layout.piecesCount || 0,
        waste_percent: layout.wastePercent || 0,
        waste_width_mm: layout.wasteWidth || 0,
        waste_length_mm: layout.wasteLength || 0,
        waste_area_mm2: layout.wasteArea || 0,
        client: selectedClient || null,
        layout_data_json: {
          pieceWidth: pieceWidth,
          pieceLength: pieceLength,
          pieceWidthWithKerf: pieceWidth + (kerf * 2), // Размер заготовки с выносом (с учетом kerf)
          pieceLengthWithKerf: pieceLength + (kerf * 2), // Размер заготовки с выносом (с учетом kerf)
          kerf: kerf,
          rotated: layout.rotated || false,
          pieces: layout.pieces || [],
          materialName: material.name,
          sheetWidth: material.width,
          sheetLength: material.length,
          wasteWidth: layout.wasteWidth || 0,
          wasteLength: layout.wasteLength || 0,
          wasteArea: layout.wasteArea || 0
        },
        order_id: null // Можно будет привязать позже через маршруты
      };

      const saved = await api("/api/cutting/layouts", {
        method: "POST",
        body: JSON.stringify(layoutData)
      });

      if (saved && saved.id) {
        simpleCutting.savedLayoutId = saved.id;
        toast(`✅ Раскрой сохранен (ID: ${saved.id.substring(0, 8)}...)`);
        
        // Обновляем список сохраненных раскроев
        await loadAndRenderSavedLayouts();
      }
    } catch (e) {
      console.error("Error saving layout:", e);
      toast("❌ Ошибка сохранения: " + (e.message || String(e)));
    } finally {
      const saveBtn = $("simpleCuttingSave");
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  // Pack identical pieces on sheet with kerf - оптимизация ориентации
  function packIdenticalPieces(sheetWidth, sheetLength, pieceWidth, pieceLength, kerf) {
    // Отступ реза добавляется к размеру заготовки для расчета раскроя
    // Размер заготовки в раскрое = размер_заготовки + отступ_слева + отступ_справа
    // Например: заготовка 340мм + отступ 6мм с каждой стороны = 352мм в раскрое

    // Вариант 1: Заготовка как есть (нормальная ориентация)
    const variant1 = packPiecesOrientation(sheetWidth, sheetLength, pieceWidth, pieceLength, kerf, false);
    
    // Вариант 2: Заготовка повернута на 90° (swap width/length)
    const variant2 = packPiecesOrientation(sheetWidth, sheetLength, pieceLength, pieceWidth, kerf, true);

    // Рассчитываем эффективность для каждого варианта
    const totalArea = sheetWidth * sheetLength;
    
    const usedArea1 = variant1.pieces.length * pieceWidth * pieceLength;
    const wasteArea1 = totalArea - usedArea1;
    const wastePercent1 = totalArea > 0 ? ((wasteArea1 / totalArea) * 100) : 100;
    variant1.wastePercent = parseFloat(wastePercent1.toFixed(1));
    variant1.efficiency = variant1.pieces.length > 0 ? (usedArea1 / totalArea * 100) : 0;

    const usedArea2 = variant2.pieces.length * pieceLength * pieceWidth; // Площадь та же, но ориентация другая
    const wasteArea2 = totalArea - usedArea2;
    const wastePercent2 = totalArea > 0 ? ((wasteArea2 / totalArea) * 100) : 100;
    variant2.wastePercent = parseFloat(wastePercent2.toFixed(1));
    variant2.efficiency = variant2.pieces.length > 0 ? (usedArea2 / totalArea * 100) : 0;

    // Выбираем лучший вариант (меньше отходов = больше эффективность)
    let best;
    if (variant1.efficiency > variant2.efficiency) {
      best = variant1;
      best.rotated = false;
    } else if (variant2.efficiency > variant1.efficiency) {
      best = variant2;
      best.rotated = true;
    } else {
      // Если эффективность одинаковая, выбираем вариант с большим количеством заготовок
      best = variant1.pieces.length >= variant2.pieces.length ? variant1 : variant2;
      best.rotated = variant2.pieces.length > variant1.pieces.length;
    }

    // Сохраняем информацию об ориентации
    best.originalWidth = pieceWidth;
    best.originalLength = pieceLength;
    best.finalWidth = best.rotated ? pieceLength : pieceWidth;
    best.finalLength = best.rotated ? pieceWidth : pieceLength;

    return {
      ...best,
      piecesCount: best.pieces.length,
      rotated: best.rotated || false,
      wasteWidth: best.wasteWidth || 0,
      wasteLength: best.wasteLength || 0,
      wasteArea: best.wasteArea || 0
    };
  }

  // Pack pieces in specific orientation
  // kerf - отступ реза (добавляется к размеру заготовки с каждой стороны)
  // Размер заготовки в раскрое = pieceWidth + kerf*2 (слева и справа)
  function packPiecesOrientation(sheetWidth, sheetLength, pieceWidth, pieceLength, kerf, rotated) {
    const pieces = [];
    
    // Размер заготовки в раскрое с учетом отступа реза
    // Отступ добавляется к размеру заготовки: заготовка + отступ_слева + отступ_справа
    const pieceWidthInLayout = pieceWidth + kerf * 2;
    const pieceLengthInLayout = pieceLength + kerf * 2;
    
    // Рассчитываем сколько заготовок поместится в ширину и длину
    // Просто делим размер листа на размер заготовки в раскрое
    const piecesPerRow = Math.floor(sheetWidth / pieceWidthInLayout);
    const piecesPerColumn = Math.floor(sheetLength / pieceLengthInLayout);

    // Размещаем заготовки по сетке
    // Каждая заготовка занимает место: размер_заготовки + отступ_слева + отступ_справа
    for (let row = 0; row < piecesPerColumn; row++) {
      const currentY = row * pieceLengthInLayout;
      
      // Проверяем, что заготовка полностью помещается по длине
      if (currentY + pieceLengthInLayout > sheetLength) {
        break;
      }
      
      for (let col = 0; col < piecesPerRow; col++) {
        const currentX = col * pieceWidthInLayout;
        
        // Проверяем, что заготовка полностью помещается по ширине
        if (currentX + pieceWidthInLayout > sheetWidth) {
          break;
        }
        
        // Позиция заготовки в раскрое (с учетом отступа)
        // Отступ уже включен в pieceWidthInLayout, поэтому позиция = col * pieceWidthInLayout
        pieces.push({
          x: currentX + kerf, // Позиция заготовки внутри блока (с учетом отступа слева)
          y: currentY + kerf, // Позиция заготовки внутри блока (с учетом отступа сверху)
          width: pieceWidth,  // Фактический размер заготовки (без отступа)
          length: pieceLength, // Фактический размер заготовки (без отступа)
          type: 'piece',
          rotated: rotated || false
        });
      }
    }

    // Рассчитываем размеры отходов
    const usedWidth = piecesPerRow * pieceWidthInLayout;
    const usedLength = piecesPerColumn * pieceLengthInLayout;
    const wasteWidth = sheetWidth - usedWidth; // Отходы справа
    const wasteLength = sheetLength - usedLength; // Отходы снизу
    const wasteArea = (wasteWidth * sheetLength) + (wasteLength * sheetWidth) - (wasteWidth * wasteLength); // Общая площадь отходов (с учетом перекрытия)

    return { 
      pieces,
      wasteWidth: wasteWidth > 0 ? wasteWidth : 0,
      wasteLength: wasteLength > 0 ? wasteLength : 0,
      wasteArea: wasteArea > 0 ? wasteArea : 0
    };
  }

  // Render results statistics (компактно)
  function renderSimpleResults(layout, pieceWidth, pieceLength, kerf) {
    const statsDiv = $("simpleCuttingStats");
    if (!statsDiv) return;

    const materialName = simpleCutting.currentMaterial?.name || "Материал";
    const sheetWidth = simpleCutting.currentMaterial?.width || 0;
    const sheetLength = simpleCutting.currentMaterial?.length || 0;

    statsDiv.innerHTML = `
      <div style="padding:8px;background:var(--bg-secondary);border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px">
          📦 ${esc(materialName)} | Лист: ${sheetWidth}×${sheetLength}мм | Заготовка: ${pieceWidth}×${pieceLength}мм | Отступ реза: ${kerf}мм
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin:0">
          <div class="chip" style="font-size:12px;padding:4px 8px;background:var(--success-light);border-color:var(--success)">
            ✅ Заготовок: <b>${layout.piecesCount}</b>
          </div>
          <div class="chip" style="font-size:12px;padding:4px 8px;background:var(--warning-light);border-color:var(--warning)">
            ⚠️ Отходы: <b>${layout.wastePercent}%</b>
          </div>
          <div class="chip" style="font-size:12px;padding:4px 8px;background:var(--info-light);border-color:var(--info)">
            📊 Использовано: <b>${((1 - layout.wastePercent/100) * 100).toFixed(1)}%</b>
          </div>
        </div>
        ${layout.wasteWidth > 0 || layout.wasteLength > 0 ? `
        <div style="margin-top:8px;padding:6px;background:var(--warning-light);border-radius:4px;border:1px solid var(--warning)">
          <div style="font-size:11px;font-weight:600;color:var(--warning);margin-bottom:4px">📐 Размеры отходов:</div>
          <div style="font-size:10px;color:#666;line-height:1.4">
            ${layout.wasteWidth > 0 ? `• Справа: <b>${layout.wasteWidth.toFixed(1)}×${sheetLength}мм</b> (${((layout.wasteWidth * sheetLength / 1000000).toFixed(2))} м²)<br>` : ''}
            ${layout.wasteLength > 0 ? `• Снизу: <b>${sheetWidth}×${layout.wasteLength.toFixed(1)}мм</b> (${((sheetWidth * layout.wasteLength / 1000000).toFixed(2))} м²)<br>` : ''}
            ${layout.wasteArea > 0 ? `• Общая площадь: <b>${(layout.wasteArea / 1000000).toFixed(2)} м²</b>` : ''}
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  // Render preview with dimensions (как в черчении) - использует универсальную функцию
  function renderSimplePreview(layout, sheetWidth, sheetLength) {
    const previewDiv = $("simpleCuttingPreview");
    if (!previewDiv) return;

    if (!layout || !layout.pieces || layout.pieces.length === 0) {
      previewDiv.innerHTML = '<div class="hint" style="text-align:center;padding:20px">Нет данных для отображения</div>';
      return;
    }
    
    const pieceWidth = simpleCutting.currentPieceWidth || 0;
    const pieceLength = simpleCutting.currentPieceLength || 0;
    const kerf = simpleCutting.currentKerf || 0;
    
    const svg = generateSvgForLayout(layout, sheetWidth, sheetLength, pieceWidth, pieceLength, kerf, {
      mode: 'preview',
      scaleMultiplier: 1,
      fontScale: 1
    });
    
    previewDiv.innerHTML = svg;
  }

  // Render label for printing

  // Render label for printing
  function renderSimpleLabel() {
    const labelDiv = $("simpleCuttingLabel");
    if (!labelDiv) return;

    const layout = simpleCutting.currentLayout;
    const materialName = simpleCutting.currentMaterial?.name || "Материал";
    const sheetWidth = simpleCutting.currentMaterial?.width || 0;
    const sheetLength = simpleCutting.currentMaterial?.length || 0;
    const pieceWidth = simpleCutting.currentPieceWidth || 0;
    const pieceLength = simpleCutting.currentPieceLength || 0;
    const kerf = simpleCutting.currentKerf || 0;
    const taskId = simpleCutting.taskId || "UNKNOWN";
    
    // Получаем выбранного клиента
    const clientSelect = $("simpleCuttingClientSelect");
    const selectedClient = clientSelect && clientSelect.value ? clientSelect.value.trim() : null;
    const clientDisplay = selectedClient ? `👤 ${esc(selectedClient)}` : '';

    labelDiv.innerHTML = `
      <div style="font-weight:700;font-size:13px;margin-bottom:4px">Задание на резку</div>
      ${clientDisplay ? `<div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:4px">${clientDisplay}</div>` : ''}
      <div style="font-size:10px;color:#666;margin-bottom:3px">${esc(materialName)}</div>
      <div style="font-size:9px;color:#666;margin-bottom:4px;line-height:1.3">
        Лист: ${sheetWidth}×${sheetLength}мм | Заготовка: ${pieceWidth}×${pieceLength}мм
      </div>
      <div style="font-size:9px;color:#666;margin-bottom:6px;line-height:1.3">
        Заготовок: ${layout?.piecesCount || 0} | Отходы: ${layout?.wastePercent || 0}% | Отступ реза: ${kerf}мм
      </div>
      <svg id="simpleBarcodeSvg" style="max-width:100%;height:45px;margin:6px 0"></svg>
      <div style="font-family:monospace;font-size:10px;font-weight:600;margin-top:3px">${taskId}</div>
      <div style="font-size:8px;color:#888;margin-top:4px">
        ${new Date().toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})}
      </div>
    `;

    // Generate barcode
    generateSimpleBarcode(taskId);
  }

  // Generate barcode
  function generateSimpleBarcode(code) {
    const svg = $("simpleBarcodeSvg");
    if (!svg) return;

    // Try to use JsBarcode if available
    if (typeof JsBarcode !== "undefined") {
      try {
        JsBarcode(svg, code, {
          format: "CODE128",
          displayValue: false,
          width: 2,
          height: 45,
          margin: 2
        });
        return;
      } catch (e) {
        console.error("Barcode generation error:", e);
      }
    }

    // Load JsBarcode if not available
    if (!window.JsBarcode) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js";
      script.onload = () => {
        try {
          JsBarcode(svg, code, {
            format: "CODE128",
            displayValue: false,
            width: 2,
            height: 45,
            margin: 2
          });
        } catch (e) {
          svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" font-size="10" fill="var(--muted)">Штрихкод</text>`;
        }
      };
      script.onerror = () => {
        svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" font-size="10" fill="var(--muted)">Штрихкод</text>`;
      };
      document.head.appendChild(script);
    }
  }

  // Универсальная функция генерации SVG на основе renderSimplePreview
  // options: { mode: 'preview' | 'print' | 'thumbnail', scaleMultiplier: number, fontScale: number }
  function generateSvgForLayout(layout, sheetWidth, sheetLength, pieceWidth, pieceLength, kerf, options = {}) {
    const mode = options.mode || 'preview';
    const scaleMultiplier = options.scaleMultiplier || (mode === 'print' ? 2 : 1);
    const fontScale = options.fontScale || (mode === 'print' ? 1.6 : 1);
    
    if (!layout || !layout.pieces || layout.pieces.length === 0) {
      return '<div style="text-align:center;padding:20px;color:#999">Нет данных для отображения</div>';
    }

    // Определяем фактические размеры заготовки (уже с учетом ориентации)
    const isRotated = layout?.rotated || false;
    const originalWidth = pieceWidth;
    const originalLength = pieceLength;
    const actualPieceWidth = isRotated ? originalLength : originalWidth;
    const actualPieceLength = isRotated ? originalWidth : originalLength;

    // Параметры для разных режимов
    let maxDisplayWidth, maxDisplayHeight, dimensionSpace, wasteDimensionSpace, pieceDimensionSpace;
    
    if (mode === 'print') {
      maxDisplayWidth = 2400;
      maxDisplayHeight = 1800;
      dimensionSpace = 80 * scaleMultiplier;
      wasteDimensionSpace = 50 * scaleMultiplier;
      pieceDimensionSpace = 40 * scaleMultiplier;
    } else if (mode === 'thumbnail') {
      maxDisplayWidth = 200;
      maxDisplayHeight = 150;
      dimensionSpace = 20;
      wasteDimensionSpace = 10;
      pieceDimensionSpace = 10;
    } else { // preview
      maxDisplayWidth = 800;
      maxDisplayHeight = 500;
      dimensionSpace = 80;
      wasteDimensionSpace = 50;
      pieceDimensionSpace = 40;
    }
    
    const scale = Math.min(
      (maxDisplayWidth - dimensionSpace - wasteDimensionSpace - pieceDimensionSpace) / sheetWidth,
      (maxDisplayHeight - dimensionSpace - wasteDimensionSpace - pieceDimensionSpace) / sheetLength,
      1
    ) * scaleMultiplier;
    
    const displayWidth = sheetWidth * scale;
    const displayLength = sheetLength * scale;
    const offsetX = dimensionSpace;
    const offsetY = dimensionSpace;
    
    // Рассчитываем реальные размеры SVG с учетом всех выносов
    const wasteWidth = layout.wasteWidth || 0;
    const wasteLength = layout.wasteLength || 0;
    const totalSvgWidth = Math.max(offsetX + displayWidth + (wasteWidth * scale) + wasteDimensionSpace, maxDisplayWidth);
    const totalSvgHeight = Math.max(offsetY + displayLength + (wasteLength * scale) + wasteDimensionSpace, maxDisplayHeight);

    // Цвет для всех заготовок
    const pieceColor = '#4caf50';
    
    // Размеры шрифтов с учетом масштаба
    const sheetFontSize = Math.round(12 * fontScale);
    const pieceFontSize = Math.round(10 * fontScale);
    const wasteFontSize = Math.round(11 * fontScale);
    const pieceNumberFontSize = Math.round(9 * fontScale);
    const arrowSize = Math.round(10 * fontScale);

    // Генерируем SVG с правильными размерами и viewBox
    let svg = `<svg width="${totalSvgWidth}" height="${totalSvgHeight}" viewBox="0 0 ${totalSvgWidth} ${totalSvgHeight}" preserveAspectRatio="xMidYMid meet" style="border:1px solid ${mode === 'print' ? '#ddd' : 'var(--border)'};background:#fff;max-width:100%;height:auto">
      <defs>
        <marker id="arrowhead${mode}" markerWidth="${arrowSize}" markerHeight="${arrowSize}" refX="${arrowSize - 1}" refY="${arrowSize / 2}" orient="auto">
          <polygon points="0 0, ${arrowSize} ${arrowSize / 2}, 0 ${arrowSize}" fill="#333" />
        </marker>
      </defs>
      
      <!-- Лист -->
      <rect x="${offsetX}" y="${offsetY}" width="${displayWidth}" height="${displayLength}" 
            fill="#f8f9fa" stroke="#333" stroke-width="${mode === 'print' ? '2' : '2'}"/>
      
      <!-- Вынос размеров (как в черчении) -->
      <!-- Ширина листа (сверху) -->
      <line x1="${offsetX}" y1="${offsetY - 20}" x2="${offsetX + displayWidth}" y2="${offsetY - 20}" 
            stroke="#333" stroke-width="1.5" marker-end="url(#arrowhead${mode})" marker-start="url(#arrowhead${mode})"/>
      <line x1="${offsetX}" y1="${offsetY - 5}" x2="${offsetX}" y2="${offsetY - 35}" stroke="#333" stroke-width="1"/>
      <line x1="${offsetX + displayWidth}" y1="${offsetY - 5}" x2="${offsetX + displayWidth}" y2="${offsetY - 35}" stroke="#333" stroke-width="1"/>
      <text x="${offsetX + displayWidth/2}" y="${offsetY - 25}" text-anchor="middle" 
            font-size="${sheetFontSize}" font-weight="600" fill="#333">${sheetWidth}мм</text>
      
      <!-- Длина листа (слева) -->
      <line x1="${offsetX - 20}" y1="${offsetY}" x2="${offsetX - 20}" y2="${offsetY + displayLength}" 
            stroke="#333" stroke-width="1.5" marker-end="url(#arrowhead${mode})" marker-start="url(#arrowhead${mode})"/>
      <line x1="${offsetX - 5}" y1="${offsetY}" x2="${offsetX - 35}" y2="${offsetY}" stroke="#333" stroke-width="1"/>
      <line x1="${offsetX - 5}" y1="${offsetY + displayLength}" x2="${offsetX - 35}" y2="${offsetY + displayLength}" stroke="#333" stroke-width="1"/>
      <text x="${offsetX - 25}" y="${offsetY + displayLength/2}" text-anchor="middle" 
            font-size="${sheetFontSize}" font-weight="600" fill="#333" transform="rotate(-90 ${offsetX - 25} ${offsetY + displayLength/2})">${sheetLength}мм</text>
    `;

    // Заготовки
    layout.pieces.forEach((piece, index) => {
      const x = offsetX + piece.x * scale;
      const y = offsetY + piece.y * scale;
      const w = (piece.width || actualPieceWidth) * scale;
      const l = (piece.length || actualPieceLength) * scale;

      // Если есть импортированный SVG, используем его
      if (simpleCutting.importedSvg && simpleCutting.svgContent) {
        const svgScale = Math.min(w / simpleCutting.svgWidth, l / simpleCutting.svgLength);
        const svgScaledWidth = simpleCutting.svgWidth * svgScale;
        const svgScaledHeight = simpleCutting.svgLength * svgScale;
        const svgOffsetX = x + (w - svgScaledWidth) / 2;
        const svgOffsetY = y + (l - svgScaledHeight) / 2;
        const rotateTransform = isRotated ? `rotate(90 ${x + w/2} ${y + l/2})` : '';
        
        svg += `
          <g transform="translate(${svgOffsetX}, ${svgOffsetY}) scale(${svgScale}) ${rotateTransform}">
            ${simpleCutting.svgContent.replace(/width="[^"]*"/, '').replace(/height="[^"]*"/, '')}
          </g>
          <rect x="${x}" y="${y}" width="${w}" height="${l}"
                fill="none" stroke="${pieceColor}" stroke-width="1" stroke-dasharray="3,3" opacity="0.5"/>
        `;
        
        if (isRotated && w > 30 && l > 20) {
          svg += `
            <path d="M ${x + w - 8} ${y + 4} L ${x + w - 4} ${y + 4} L ${x + w - 6} ${y + 2}" 
                  fill="${pieceColor}" stroke="none"/>
            <text x="${x + w - 4}" y="${y + 12}" font-size="${Math.round(8 * fontScale)}" fill="${pieceColor}" font-weight="700">90°</text>
          `;
        }
      } else {
        // Обычный прямоугольник заготовки
        svg += `
          <rect x="${x}" y="${y}" width="${w}" height="${l}"
                fill="${pieceColor}" fill-opacity="0.6" stroke="${pieceColor}" stroke-width="1.5"/>
        `;

        // Номер заготовки
        if (w > 35 && l > 20) {
          svg += `
            <text x="${x + w/2}" y="${y + l/2}" text-anchor="middle" 
                  dominant-baseline="middle" font-size="${pieceNumberFontSize}" font-weight="600" fill="#000">${index + 1}</text>
          `;
        }
        
        if (isRotated && w > 30 && l > 20) {
          svg += `
            <path d="M ${x + w - 8} ${y + 4} L ${x + w - 4} ${y + 4} L ${x + w - 6} ${y + 2}" 
                  fill="${pieceColor}" stroke="none"/>
            <text x="${x + w - 4}" y="${y + 12}" font-size="${Math.round(8 * fontScale)}" fill="${pieceColor}" font-weight="700">90°</text>
          `;
        }
      }

      // Красные линии реза (kerf)
      if (kerf > 0) {
        const kerfWidth = kerf * scale;
        const pieceWidthInLayout = actualPieceWidth + kerf * 2;
        const pieceLengthInLayout = actualPieceLength + kerf * 2;
        const piecesPerRow = Math.floor(sheetWidth / pieceWidthInLayout);
        const piecesPerColumn = Math.floor(sheetLength / pieceLengthInLayout);
        const row = Math.floor(index / piecesPerRow);
        const col = index % piecesPerRow;
        
        if (col < piecesPerRow - 1) {
          const nextPieceIndex = index + 1;
          if (nextPieceIndex < layout.pieces.length) {
            const nextPiece = layout.pieces[nextPieceIndex];
            if (Math.abs(nextPiece.y - piece.y) < 1) {
              svg += `
                <rect x="${x + w}" y="${y}" width="${kerfWidth}" height="${l}"
                      fill="#ff0000" fill-opacity="0.4" stroke="#ff0000" stroke-width="1"/>
              `;
            }
          }
        }

        if (row < piecesPerColumn - 1) {
          const nextRowPieceIndex = index + piecesPerRow;
          if (nextRowPieceIndex < layout.pieces.length) {
            const nextRowPiece = layout.pieces[nextRowPieceIndex];
            if (nextRowPiece.y > piece.y) {
              svg += `
                <rect x="${x}" y="${y + l}" width="${w}" height="${kerfWidth}"
                      fill="#ff0000" fill-opacity="0.4" stroke="#ff0000" stroke-width="1"/>
              `;
            }
          }
        }

        if (col < piecesPerRow - 1 && row < piecesPerColumn - 1) {
          const nextPieceIndex = index + 1;
          const nextRowPieceIndex = index + piecesPerRow;
          if (nextPieceIndex < layout.pieces.length && nextRowPieceIndex < layout.pieces.length) {
            svg += `
              <rect x="${x + w}" y="${y + l}" width="${kerfWidth}" height="${kerfWidth}"
                    fill="#ff0000" fill-opacity="0.6" stroke="#ff0000" stroke-width="1"/>
            `;
          }
        }
      }

      // Размеры реза с выносом для первой заготовки
      const pieceActualWidth = piece.width || actualPieceWidth;
      const pieceActualLength = piece.length || actualPieceLength;
      
      if (index === 0 && kerf > 0) {
        const pieceWidthWithKerf = actualPieceWidth + (kerf * 2);
        const pieceLengthWithKerf = actualPieceLength + (kerf * 2);
        const wWithKerf = pieceWidthWithKerf * scale;
        const lWithKerf = pieceLengthWithKerf * scale;
        const dimensionOffset = 25;
        const dimensionLineY = y - dimensionOffset;
        const dimensionLineX = x - dimensionOffset;
        
        if (w > 40) {
          svg += `
            <line x1="${x}" y1="${y}" x2="${x}" y2="${dimensionLineY}" stroke="#333" stroke-width="1"/>
            <line x1="${x + wWithKerf}" y1="${y}" x2="${x + wWithKerf}" y2="${dimensionLineY}" stroke="#333" stroke-width="1"/>
            <line x1="${x}" y1="${dimensionLineY}" x2="${x + wWithKerf}" y2="${dimensionLineY}" 
                  stroke="#333" stroke-width="1.5" marker-end="url(#arrowhead${mode})" marker-start="url(#arrowhead${mode})"/>
            <text x="${x + wWithKerf/2}" y="${dimensionLineY - 5}" text-anchor="middle" 
                  font-size="${pieceFontSize}" fill="#333" font-weight="600">${pieceWidthWithKerf.toFixed(1)}мм</text>
          `;
        }

        if (l > 40) {
          svg += `
            <line x1="${x}" y1="${y}" x2="${dimensionLineX}" y2="${y}" stroke="#333" stroke-width="1"/>
            <line x1="${x}" y1="${y + lWithKerf}" x2="${dimensionLineX}" y2="${y + lWithKerf}" stroke="#333" stroke-width="1"/>
            <line x1="${dimensionLineX}" y1="${y}" x2="${dimensionLineX}" y2="${y + lWithKerf}" 
                  stroke="#333" stroke-width="1.5" marker-end="url(#arrowhead${mode})" marker-start="url(#arrowhead${mode})"/>
            <text x="${dimensionLineX - 5}" y="${y + lWithKerf/2}" text-anchor="middle" 
                  font-size="${pieceFontSize}" fill="#333" font-weight="600" transform="rotate(-90 ${dimensionLineX - 5} ${y + lWithKerf/2})">${pieceLengthWithKerf.toFixed(1)}мм</text>
          `;
        }
      } else if (index === 0 && kerf === 0) {
        const dimensionOffset = 25;
        const dimensionLineY = y - dimensionOffset;
        const dimensionLineX = x - dimensionOffset;
        
        if (w > 40) {
          svg += `
            <line x1="${x}" y1="${y}" x2="${x}" y2="${dimensionLineY}" stroke="#333" stroke-width="1"/>
            <line x1="${x + w}" y1="${y}" x2="${x + w}" y2="${dimensionLineY}" stroke="#333" stroke-width="1"/>
            <line x1="${x}" y1="${dimensionLineY}" x2="${x + w}" y2="${dimensionLineY}" 
                  stroke="#333" stroke-width="1.5" marker-end="url(#arrowhead${mode})" marker-start="url(#arrowhead${mode})"/>
            <text x="${x + w/2}" y="${dimensionLineY - 5}" text-anchor="middle" 
                  font-size="${pieceFontSize}" fill="#333" font-weight="600">${pieceActualWidth.toFixed(1)}мм</text>
          `;
        }

        if (l > 40) {
          svg += `
            <line x1="${x}" y1="${y}" x2="${dimensionLineX}" y2="${y}" stroke="#333" stroke-width="1"/>
            <line x1="${x}" y1="${y + l}" x2="${dimensionLineX}" y2="${y + l}" stroke="#333" stroke-width="1"/>
            <line x1="${dimensionLineX}" y1="${y}" x2="${dimensionLineX}" y2="${y + l}" 
                  stroke="#333" stroke-width="1.5" marker-end="url(#arrowhead${mode})" marker-start="url(#arrowhead${mode})"/>
            <text x="${dimensionLineX - 5}" y="${y + l/2}" text-anchor="middle" 
                  font-size="${pieceFontSize}" fill="#333" font-weight="600" transform="rotate(-90 ${dimensionLineX - 5} ${y + l/2})">${pieceActualLength.toFixed(1)}мм</text>
          `;
        }
      }
    });

    // Отходы
    const wasteColor = '#ff6b6b';
    const sheetRight = offsetX + displayWidth;
    const sheetBottom = offsetY + displayLength;

    if (wasteWidth > 0) {
      const wasteWidthScaled = wasteWidth * scale;
      const wasteX = sheetRight - wasteWidthScaled;
      
      svg += `
        <rect x="${wasteX}" y="${offsetY}" width="${wasteWidthScaled}" height="${displayLength}"
              fill="${wasteColor}" fill-opacity="0.2" stroke="${wasteColor}" stroke-width="2" stroke-dasharray="8,4"/>
        <line x1="${wasteX}" y1="${offsetY - 30}" x2="${sheetRight}" y2="${offsetY - 30}" 
              stroke="${wasteColor}" stroke-width="1.5" marker-end="url(#arrowhead${mode})" marker-start="url(#arrowhead${mode})"/>
        <line x1="${wasteX}" y1="${offsetY - 5}" x2="${wasteX}" y2="${offsetY - 45}" stroke="${wasteColor}" stroke-width="1"/>
        <line x1="${sheetRight}" y1="${offsetY - 5}" x2="${sheetRight}" y2="${offsetY - 45}" stroke="${wasteColor}" stroke-width="1"/>
        <text x="${wasteX + wasteWidthScaled/2}" y="${offsetY - 35}" text-anchor="middle" 
              font-size="${wasteFontSize}" font-weight="600" fill="${wasteColor}">${wasteWidth.toFixed(1)}мм</text>
        <line x1="${sheetRight + 15}" y1="${offsetY}" x2="${sheetRight + 15}" y2="${sheetBottom}" 
              stroke="${wasteColor}" stroke-width="1.5" marker-end="url(#arrowhead${mode})" marker-start="url(#arrowhead${mode})"/>
        <line x1="${sheetRight - 5}" y1="${offsetY}" x2="${sheetRight + 35}" y2="${offsetY}" stroke="${wasteColor}" stroke-width="1"/>
        <line x1="${sheetRight - 5}" y1="${sheetBottom}" x2="${sheetRight + 35}" y2="${sheetBottom}" stroke="${wasteColor}" stroke-width="1"/>
        <text x="${sheetRight + 20}" y="${offsetY + displayLength/2}" text-anchor="middle" 
              font-size="${wasteFontSize}" font-weight="600" fill="${wasteColor}" transform="rotate(-90 ${sheetRight + 20} ${offsetY + displayLength/2})">${sheetLength}мм</text>
      `;
    }

    if (wasteLength > 0) {
      const wasteLengthScaled = wasteLength * scale;
      const wasteY = sheetBottom - wasteLengthScaled;
      
      svg += `
        <rect x="${offsetX}" y="${wasteY}" width="${displayWidth}" height="${wasteLengthScaled}"
              fill="${wasteColor}" fill-opacity="0.2" stroke="${wasteColor}" stroke-width="2" stroke-dasharray="8,4"/>
        <line x1="${offsetX - 30}" y1="${wasteY}" x2="${offsetX - 30}" y2="${sheetBottom}" 
              stroke="${wasteColor}" stroke-width="1.5" marker-end="url(#arrowhead${mode})" marker-start="url(#arrowhead${mode})"/>
        <line x1="${offsetX - 5}" y1="${wasteY}" x2="${offsetX - 45}" y2="${wasteY}" stroke="${wasteColor}" stroke-width="1"/>
        <line x1="${offsetX - 5}" y1="${sheetBottom}" x2="${offsetX - 45}" y2="${sheetBottom}" stroke="${wasteColor}" stroke-width="1"/>
        <text x="${offsetX - 35}" y="${wasteY + wasteLengthScaled/2}" text-anchor="middle" 
              font-size="${wasteFontSize}" font-weight="600" fill="${wasteColor}" transform="rotate(-90 ${offsetX - 35} ${wasteY + wasteLengthScaled/2})">${wasteLength.toFixed(1)}мм</text>
        <line x1="${offsetX}" y1="${sheetBottom + 15}" x2="${sheetRight}" y2="${sheetBottom + 15}" 
              stroke="${wasteColor}" stroke-width="1.5" marker-end="url(#arrowhead${mode})" marker-start="url(#arrowhead${mode})"/>
        <line x1="${offsetX}" y1="${sheetBottom - 5}" x2="${offsetX}" y2="${sheetBottom + 35}" stroke="${wasteColor}" stroke-width="1"/>
        <line x1="${sheetRight}" y1="${sheetBottom - 5}" x2="${sheetRight}" y2="${sheetBottom + 35}" stroke="${wasteColor}" stroke-width="1"/>
        <text x="${offsetX + displayWidth/2}" y="${sheetBottom + 25}" text-anchor="middle" 
              font-size="${wasteFontSize}" font-weight="600" fill="${wasteColor}">${sheetWidth}мм</text>
      `;
    }

    svg += '</svg>';
    return svg;
  }

  // Generate preview SVG for printing (использует универсальную функцию)
  function generatePreviewSvgForPrint(layout, sheetWidth, sheetLength, pieceWidth, pieceLength, kerf) {
    return generateSvgForLayout(layout, sheetWidth, sheetLength, pieceWidth, pieceLength, kerf, {
      mode: 'print',
      scaleMultiplier: 2,
      fontScale: 1.6
    });
  }

  // Print label with preview
  async function printSimpleLabel() {
    const layout = simpleCutting.currentLayout;
    const materialName = simpleCutting.currentMaterial?.name || "Материал";
    const sheetWidth = simpleCutting.currentMaterial?.width || 0;
    const sheetLength = simpleCutting.currentMaterial?.length || 0;
    const originalWidth = simpleCutting.currentPieceWidth || 0;
    const originalLength = simpleCutting.currentPieceLength || 0;
    const kerf = simpleCutting.currentKerf || 0;
    const taskId = simpleCutting.taskId || "UNKNOWN";
    
    // Получаем выбранного клиента
    const clientSelect = $("simpleCuttingClientSelect");
    const selectedClient = clientSelect && clientSelect.value ? clientSelect.value.trim() : null;

    // Определяем фактические размеры заготовки (с учетом ориентации)
    const isRotated = layout?.rotated || false;
    const pieceWidth = isRotated ? originalLength : originalWidth;
    const pieceLength = isRotated ? originalWidth : originalLength;

    // Используем ТОЧНО ТОТ ЖЕ подход, что и в предпросмотре после нажатия "Рассчитать":
    // 1. Сначала пытаемся использовать сохранённый SVG из базы (он выглядит так же, как в предпросмотре)
    // 2. Если сохранённого нет, генерируем заново с теми же параметрами, что и в предпросмотре
    let previewSvg = '';
    if (simpleCutting.savedLayoutId) {
      try {
        // Загружаем сохранённый раскрой из базы
        const layouts = await api("/api/cutting/layouts");
        const savedLayout = layouts.find(l => l.id === simpleCutting.savedLayoutId);
        if (savedLayout && savedLayout.layout_svg) {
          // Используем сохранённый SVG напрямую - он выглядит ТОЧНО ТАК ЖЕ, как в предпросмотре
          previewSvg = savedLayout.layout_svg;
        }
      } catch (e) {
        console.warn("Не удалось загрузить сохранённый SVG, генерируем заново:", e);
      }
    }
    
    // Если сохранённый SVG не найден, генерируем заново с ТЕМИ ЖЕ параметрами, что в предпросмотре
    // Используем mode: 'print' только для увеличенного масштаба при печати, но данные те же
    if (!previewSvg) {
      previewSvg = generateSvgForLayout(layout, sheetWidth, sheetLength, pieceWidth, pieceLength, kerf, {
        mode: 'print',  // Режим print для лучшего качества при печати
        scaleMultiplier: 2,  // Увеличенный масштаб для печати
        fontScale: 1.6  // Увеличенный шрифт для печати
      });
    }

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Задание на резку</title>
        <style>
          @media print {
            @page { margin: 5mm; size: A4 landscape; }
            body { margin: 0; padding: 0; }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            padding: 10px;
            font-size: 11px;
          }
          .header {
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 10px;
          }
          .title {
            font-weight: 700;
            font-size: 16px;
            margin-bottom: 5px;
          }
          .client {
            font-size: 12px;
            font-weight: 600;
            color: #0066cc;
            margin: 5px 0;
            padding: 4px 0;
          }
          .info {
            font-size: 10px;
            color: #555;
            margin: 3px 0;
            line-height: 1.3;
          }
          .preview-section {
            margin: 10px 0;
            border: 1px solid #ddd;
            padding: 8px;
            background: #fafafa;
          }
          .preview-section svg {
            display: block;
            margin: 0 auto;
          }
          .preview-title {
            font-weight: 600;
            font-size: 12px;
            margin-bottom: 8px;
            color: #333;
          }
          .preview-svg {
            width: 100%;
            max-width: 100%;
            height: auto;
          }
          .barcode-section {
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px solid #ddd;
            text-align: center;
          }
          .barcode-box {
            margin: 8px 0;
          }
          .barcode-code {
            font-family: monospace;
            font-size: 11px;
            font-weight: 600;
            margin-top: 4px;
          }
          .date {
            font-size: 9px;
            color: #888;
            margin-top: 5px;
          }
          .stats {
            display: flex;
            gap: 15px;
            margin: 8px 0;
            font-size: 10px;
          }
          .stat-item {
            flex: 1;
            padding: 6px;
            background: #f0f0f0;
            border-radius: 4px;
            text-align: center;
          }
          .stat-label {
            font-size: 9px;
            color: #666;
            margin-bottom: 2px;
          }
          .stat-value {
            font-weight: 700;
            font-size: 12px;
            color: #000;
          }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
      </head>
      <body>
        <div class="header">
          <div class="title">✂️ ЗАДАНИЕ НА РЕЗКУ</div>
          ${selectedClient ? `<div class="client">👤 Клиент: ${esc(selectedClient)}</div>` : ''}
          <div class="info"><strong>Материал:</strong> ${esc(materialName)}</div>
          <div class="info" style="font-size:11px;font-weight:600;margin-top:6px;margin-bottom:6px;color:#000">
            📐 <strong>Размер заготовки:</strong> ${pieceWidth}×${pieceLength}мм${layout?.rotated ? ' (повернуто на 90°)' : ''}
            ${kerf > 0 ? ` | <strong>Размер реза:</strong> ${(pieceWidth + kerf * 2).toFixed(1)}×${(pieceLength + kerf * 2).toFixed(1)}мм` : ''}
          </div>
          <div class="stats">
            <div class="stat-item">
              <div class="stat-label">Лист</div>
              <div class="stat-value">${sheetWidth}×${sheetLength}мм</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Заготовка</div>
              <div class="stat-value">${pieceWidth}×${pieceLength}мм${layout?.rotated ? ' 🔄' : ''}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Заготовок</div>
              <div class="stat-value">${layout?.piecesCount || 0}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Отходы</div>
              <div class="stat-value">${layout?.wastePercent || 0}%</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Отступ реза</div>
              <div class="stat-value">${kerf}мм</div>
            </div>
          </div>
        </div>
        
        <div class="preview-section">
          <div class="preview-title">📐 Схема раскроя с размерами</div>
          ${previewSvg}
        </div>
        
        <div class="barcode-section">
          <div class="barcode-box">
            <svg id="barcodeSvg" style="max-width:100%;height:50px"></svg>
            <div class="barcode-code">${taskId}</div>
          </div>
          <div class="date">${new Date().toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})}</div>
        </div>
        
        <script>
          (function(){
            const codeStr = ${JSON.stringify(taskId)};
            const svg = document.getElementById("barcodeSvg");
            const gen = ()=> {
              try{
                if(typeof JsBarcode !== "undefined"){
                  JsBarcode(svg, codeStr, {
                    format: "CODE128",
                    displayValue: false,
                    width: 2,
                    height: 50,
                    margin: 2
                  });
                } else {
                  svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" font-size="10">Штрихкод</text>';
                }
                setTimeout(()=>window.print(), 200);
              }catch(e){
                svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" font-size="10">Штрихкод</text>';
                setTimeout(()=>window.print(), 200);
              }
            };
            if(typeof JsBarcode !== "undefined"){
              gen();
            } else {
              const s = document.createElement("script");
              s.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js";
              s.onload = gen;
              s.onerror = ()=> {
                svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" font-size="10">Штрихкод</text>';
                setTimeout(()=>window.print(), 200);
              };
              document.head.appendChild(s);
            }
          })();
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=350,height=250");
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
    } else {
      alert("Разрешите всплывающие окна для печати");
    }
  }

  // Load and render saved cutting layouts
  async function loadAndRenderSavedLayouts() {
    console.log("loadAndRenderSavedLayouts() called");
    const tbody = $("simpleCuttingLayoutsTable");
    if (!tbody) {
      console.error("simpleCuttingLayoutsTable not found!");
      return;
    }
    console.log("simpleCuttingLayoutsTable found:", tbody);

    try {
      console.log("Making API request to /api/cutting/layouts...");
      const layouts = await api("/api/cutting/layouts");
      console.log("API response received, layouts count:", layouts?.length || 0);
      console.log("API response type:", typeof layouts, "isArray:", Array.isArray(layouts));
      
      if (!layouts) {
        console.error("API returned null or undefined");
        tbody.innerHTML = `
          <tr>
            <td colspan="9" style="padding:20px;text-align:center;color:var(--muted)">
              <div class="hint">Ошибка загрузки раскроев. Попробуйте обновить страницу.</div>
            </td>
          </tr>
        `;
        return;
      }
      
      if (!Array.isArray(layouts) || layouts.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" style="padding:20px;text-align:center;color:var(--muted)">
              <div class="hint">Нет сохраненных раскроев. Создайте раскрой и сохраните его.</div>
            </td>
          </tr>
        `;
        return;
      }

      // Apply sorting
      let sortedLayouts = [...layouts];
      if (simpleCutting.sortBy) {
        const sortBy = simpleCutting.sortBy;
        const sortDir = simpleCutting.sortDir || "asc";
        
        sortedLayouts.sort((a, b) => {
          let valA, valB;
          
          switch (sortBy) {
            case "id":
              valA = (a.id || "").toLowerCase();
              valB = (b.id || "").toLowerCase();
              return sortDir === "asc" ? valA.localeCompare(valB, "ru") : valB.localeCompare(valA, "ru");
            
            case "material":
              valA = (a.material_name || "").toLowerCase();
              valB = (b.material_name || "").toLowerCase();
              return sortDir === "asc" ? valA.localeCompare(valB, "ru") : valB.localeCompare(valA, "ru");
            
            case "client":
              valA = (a.client || a.order_client || "—").toLowerCase();
              valB = (b.client || b.order_client || "—").toLowerCase();
              return sortDir === "asc" ? valA.localeCompare(valB, "ru") : valB.localeCompare(valA, "ru");
            
            case "sheet":
              const sheetA = (a.sheet_width_mm || 0) * (a.sheet_length_mm || 0);
              const sheetB = (b.sheet_width_mm || 0) * (b.sheet_length_mm || 0);
              return sortDir === "asc" ? sheetA - sheetB : sheetB - sheetA;
            
            case "piece":
              const layoutDataA = a.layout_data_json ? 
                (typeof a.layout_data_json === 'string' ? JSON.parse(a.layout_data_json) : a.layout_data_json) : {};
              const layoutDataB = b.layout_data_json ? 
                (typeof b.layout_data_json === 'string' ? JSON.parse(b.layout_data_json) : b.layout_data_json) : {};
              const pieceA = (a.box_width_mm || layoutDataA.pieceWidth || 0) * (a.box_length_mm || layoutDataA.pieceLength || 0);
              const pieceB = (b.box_width_mm || layoutDataB.pieceWidth || 0) * (b.box_length_mm || layoutDataB.pieceLength || 0);
              return sortDir === "asc" ? pieceA - pieceB : pieceB - pieceA;
            
            case "thickness":
              const stateForSort = window.state || {};
              const materialA = stateForSort.materials?.find(m => m.id === a.material_id) || {};
              const materialB = stateForSort.materials?.find(m => m.id === b.material_id) || {};
              const thickA = materialA.thickness_mm || a.thickness_mm || 0;
              const thickB = materialB.thickness_mm || b.thickness_mm || 0;
              return sortDir === "asc" ? thickA - thickB : thickB - thickA;
            
            case "pieces":
              return sortDir === "asc" ? (a.pieces_count || 0) - (b.pieces_count || 0) : (b.pieces_count || 0) - (a.pieces_count || 0);
            
            case "waste":
              return sortDir === "asc" ? (a.waste_percent || 0) - (b.waste_percent || 0) : (b.waste_percent || 0) - (a.waste_percent || 0);
            
            case "date":
              const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
              const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
              return sortDir === "asc" ? dateA - dateB : dateB - dateA;
            
            default:
              return 0;
          }
        });
      }

      // Helper для экранирования HTML
      const esc = window.esc || ((str) => {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      });

      tbody.innerHTML = sortedLayouts.map(layout => {
        // Получаем данные о материале для толщины
        const stateForRender = window.state || {};
        const material = stateForRender.materials?.find(m => m.id === layout.material_id) || {};
        const thickness = material.thickness_mm || layout.thickness_mm || 0;
        
        // Получаем размеры заготовки из layout_data_json или из полей
        const layoutData = layout.layout_data_json ? 
          (typeof layout.layout_data_json === 'string' ? JSON.parse(layout.layout_data_json) : layout.layout_data_json) : {};
        const pieceWidth = layout.box_width_mm || layoutData.pieceWidth || 0;
        const pieceLength = layout.box_length_mm || layoutData.pieceLength || 0;
        
        const createdDate = layout.created_at ? new Date(layout.created_at).toLocaleDateString('ru-RU') : '—';
        
        // Получаем клиента из раскроя или из связанного заказа
        const client = layout.client || layout.order_client || '';
        
        // Получаем список всех клиентов для селектора
        const stateForClients = window.state || {};
        const allClients = new Set();
        if (stateForClients.orders && Array.isArray(stateForClients.orders)) {
          stateForClients.orders.forEach(order => {
            if (order.client && order.client.trim()) {
              allClients.add(order.client.trim());
            }
          });
        }
        // Добавляем текущего клиента, если его нет в списке
        if (client && client.trim()) {
          allClients.add(client.trim());
        }
        const clientList = Array.from(allClients).sort((a, b) => a.localeCompare(b, "ru"));
        const clientOptions = '<option value="">— Без клиента —</option>' +
          clientList.map(c => `<option value="${esc(c)}" ${c === client ? 'selected' : ''}>${esc(c)}</option>`).join('');
        
        return `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px">
              <input type="text" class="editable-id" data-layout-id="${esc(layout.id)}" 
                     value="${esc(layout.id)}" 
                     style="width:100%;padding:4px 6px;font-family:monospace;font-size:11px;border:1px solid var(--border);border-radius:4px;background:#fff"
                     title="Нажмите Enter для сохранения ID">
            </td>
            <td style="padding:8px">
              <div style="font-weight:600;font-size:12px">${esc(layout.material_name || 'Неизвестно')}</div>
            </td>
            <td style="padding:8px">
              <select class="editable-client" data-layout-id="${esc(layout.id)}" data-original-client="${esc(client)}"
                      style="width:100%;padding:4px 6px;font-size:12px;border:1px solid var(--border);border-radius:4px;background:#fff;color:${client ? 'var(--accent)' : 'var(--muted)'}"
                      title="Выберите клиента">
                ${clientOptions}
              </select>
            </td>
            <td style="padding:8px;text-align:center;font-size:12px">
              ${layout.sheet_width_mm || 0}×${layout.sheet_length_mm || 0}мм
            </td>
            <td style="padding:8px;text-align:center;font-size:12px">
              ${Math.round(pieceWidth)}×${Math.round(pieceLength)}мм
              ${layoutData.rotated ? ' 🔄' : ''}
            </td>
            <td style="padding:8px;text-align:center;font-size:12px">
              ${thickness ? `${thickness}мм` : '—'}
            </td>
            <td style="padding:8px;text-align:center;font-size:13px;font-weight:700;color:var(--accent)">
              ${layout.pieces_count || 0}
            </td>
            <td style="padding:8px;text-align:center;font-size:12px">
              <span class="pill ${(layout.waste_percent || 0) < 10 ? 'ok' : (layout.waste_percent < 20 ? 'warn' : 'bad')}" 
                    style="font-size:11px;padding:2px 6px">
                ${layout.waste_percent || 0}%
              </span>
            </td>
            <td style="padding:8px;text-align:center;font-size:11px;color:var(--muted)">
              ${createdDate}
            </td>
            <td style="padding:8px;text-align:center">
              ${layout.layout_svg ? `
                <div class="layout-thumbnail" data-action="assign" data-layout-id="${esc(layout.id)}" 
                     style="width:80px;height:60px;border:1px solid var(--border);border-radius:4px;overflow:hidden;cursor:pointer;background:#fff;display:inline-block;position:relative"
                     title="Кликните для назначения операции">
                  <div style="width:100%;height:100%;position:relative;overflow:hidden">
                    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.15);transform-origin:center">
                      ${layout.layout_svg}
                    </div>
                  </div>
                </div>
              ` : '<div style="width:80px;height:60px;border:1px solid var(--border);border-radius:4px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:10px">Нет SVG</div>'}
            </td>
            <td style="padding:8px;text-align:center">
              <div class="row" style="gap:4px;justify-content:center;flex-wrap:wrap">
                <button class="btn ghost" data-action="view" data-layout-id="${esc(layout.id)}" 
                        title="Просмотр SVG" style="padding:4px 8px;font-size:11px">👁️</button>
                <button class="btn ghost" data-action="edit" data-layout-id="${esc(layout.id)}" 
                        title="Редактировать" style="padding:4px 8px;font-size:11px">✎</button>
                <button class="btn ghost danger" data-action="delete" data-layout-id="${esc(layout.id)}" 
                        title="Удалить" style="padding:4px 8px;font-size:11px">×</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Setup event handlers for editable IDs
      tbody.querySelectorAll('.editable-id').forEach(input => {
        input.onkeydown = async (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            await saveLayoutId(input);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            input.value = input.dataset.layoutId;
            input.blur();
          }
        };
        input.onblur = async () => {
          if (input.value !== input.dataset.layoutId) {
            await saveLayoutId(input);
          }
        };
      });

      // Setup event handlers for editable clients
      tbody.querySelectorAll('.editable-client').forEach(select => {
        select.onchange = async () => {
          await saveLayoutClient(select);
        };
      });

      // Update sort indicators in headers
      const table = tbody.closest("table");
      if (table) {
        const headers = table.querySelectorAll("thead th[data-sort]");
        headers.forEach(th => {
          const col = th.dataset.sort;
          let txt = th.textContent.replace(/[▲▼]/g, "").trim();
          if (col === simpleCutting.sortBy) {
            txt += simpleCutting.sortDir === "asc" ? " ▲" : " ▼";
          } else {
            txt += " ▲▼";
          }
          th.textContent = txt;
        });
      }

      // Setup action buttons
      tbody.querySelectorAll('[data-action]').forEach(btn => {
        const action = btn.dataset.action;
        const layoutId = btn.dataset.layoutId;

        if (action === 'view') {
          btn.onclick = () => viewLayout(layoutId);
        } else if (action === 'edit') {
          btn.onclick = () => editLayout(layoutId);
        } else if (action === 'assign') {
          btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              if(typeof assignLayoutToOperation === 'function'){
                await assignLayoutToOperation(layoutId);
              } else {
                toast("Функция назначения кроя недоступна");
              }
            } catch(err) {
              console.error("Ошибка назначения кроя:", err);
              toast("Ошибка: " + (err.message || err));
            }
          };
          // Добавляем hover эффект для миниатюры
          if (btn.classList.contains('layout-thumbnail')) {
            btn.onmouseenter = () => {
              btn.style.borderColor = 'var(--accent)';
              btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            };
            btn.onmouseleave = () => {
              btn.style.borderColor = 'var(--border)';
              btn.style.boxShadow = 'none';
            };
          }
        } else if (action === 'delete') {
          btn.onclick = () => deleteLayout(layoutId);
        }
      });

    } catch (e) {
      console.error("Error loading saved layouts:", e);
      tbody.innerHTML = `
        <tr>
          <td colspan="11" style="padding:20px;text-align:center;color:var(--bad)">
            <div class="hint">Ошибка загрузки раскроев: ${esc(e.message || String(e))}</div>
          </td>
        </tr>
      `;
    }
    
    // Инициализируем изменение размера столбцов после рендеринга таблицы
    setTimeout(() => {
      const layoutsTable = tbody.closest('table');
      if (layoutsTable && typeof initTableColumnResize === 'function'){
        initTableColumnResize(layoutsTable);
      }
    }, 50);
  }

  // Save layout ID (rename)
  async function saveLayoutId(input) {
    const oldId = input.dataset.layoutId;
    const newId = input.value.trim();

    if (!newId) {
      toast("❌ ID не может быть пустым");
      input.value = oldId;
      return;
    }

    if (newId === oldId) {
      return; // No change
    }

    try {
      input.disabled = true;
      
      // Обновляем ID через API (потребуется новый endpoint)
      await api(`/api/cutting/layouts/${oldId}/rename`, {
        method: "PUT",
        body: JSON.stringify({ new_id: newId })
      });

      toast("✅ ID обновлен");
      input.dataset.layoutId = newId;
      
      // Обновляем список
      await loadAndRenderSavedLayouts();
    } catch (e) {
      console.error("Error updating layout ID:", e);
      toast("❌ Ошибка обновления ID: " + (e.message || String(e)));
      input.value = oldId; // Restore old value
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  // Save layout client
  async function saveLayoutClient(select) {
    const layoutId = select.dataset.layoutId;
    const oldClient = select.dataset.originalClient || '';
    const newClient = select.value ? select.value.trim() : '';

    if (newClient === oldClient) {
      return; // No change
    }

    try {
      select.disabled = true;
      
      // Загружаем текущий раскрой
      const layouts = await api("/api/cutting/layouts");
      const layout = layouts.find(l => l.id === layoutId);
      
      if (!layout) {
        throw new Error("Раскрой не найден");
      }

      // Обновляем клиента через API
      await api(`/api/cutting/layouts`, {
        method: "POST",
        body: JSON.stringify({
          id: layout.id,
          material_id: layout.material_id,
          sheet_width_mm: layout.sheet_width_mm,
          sheet_length_mm: layout.sheet_length_mm,
          box_width_mm: layout.box_width_mm,
          box_length_mm: layout.box_length_mm,
          box_height_mm: layout.box_height_mm || 0,
          thickness_mm: layout.thickness_mm || 0,
          layout_svg: layout.layout_svg,
          pieces_count: layout.pieces_count,
          waste_percent: layout.waste_percent,
          layout_data_json: layout.layout_data_json,
          order_id: layout.order_id,
          client: newClient || null
        })
      });

      toast("✅ Клиент обновлен");
      select.dataset.originalClient = newClient;
      
      // Обновляем цвет селектора
      select.style.color = newClient ? 'var(--accent)' : 'var(--muted)';
      
      // Обновляем список
      await loadAndRenderSavedLayouts();
    } catch (e) {
      console.error("Error updating layout client:", e);
      toast("❌ Ошибка обновления клиента: " + (e.message || String(e)));
      // Восстанавливаем старое значение
      select.value = oldClient;
    } finally {
      select.disabled = false;
    }
  }

  // View layout SVG
  async function viewLayout(layoutId) {
    try {
      const layouts = await api("/api/cutting/layouts");
      const layout = layouts.find(l => l.id === layoutId);
      
      if (!layout) {
        toast("❌ Раскрой не найден");
        return;
      }

      // Открываем SVG в новом окне
      const viewWindow = window.open("", "_blank", "width=900,height=700");
      if (!viewWindow) {
        alert("Разрешите всплывающие окна для просмотра");
        return;
      }

      const layoutData = layout.layout_data_json ? 
        (typeof layout.layout_data_json === 'string' ? JSON.parse(layout.layout_data_json) : layout.layout_data_json) : {};
      
      // Используем сохранённый SVG напрямую (он уже содержит все элементы, включая импортированный SVG - кровь)
      // Это тот же SVG, который отображается в предпросмотре и должен использоваться в печати
      let svgContent = layout.layout_svg || '<div class="hint">Нет изображения</div>';
      
      // Если сохранённого SVG нет, генерируем заново (fallback)
      if (!svgContent || svgContent === '<div class="hint">Нет изображения</div>') {
        if (window.generateSvgForLayout && layoutData.pieces && Array.isArray(layoutData.pieces) && layoutData.pieces.length > 0) {
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
      
      viewWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Просмотр раскроя: ${esc(layoutId)}</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              background: #f5f5f5;
            }
            .header {
              margin-bottom: 20px;
              padding: 15px;
              background: #fff;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .header h2 {
              margin: 0 0 10px 0;
              font-size: 18px;
            }
            .info {
              font-size: 12px;
              color: #666;
              line-height: 1.6;
            }
            .info b {
              color: #000;
            }
            .svg-container {
              background: #fff;
              border-radius: 8px;
              padding: 15px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              overflow: auto;
            }
            .svg-container svg {
              max-width: 100%;
              height: auto;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>✂️ Просмотр раскроя: ${esc(layoutId)}</h2>
            <div class="info">
              <b>Материал:</b> ${esc(layout.material_name || 'Неизвестно')}<br>
              <b>Лист:</b> ${layout.sheet_width_mm || 0}×${layout.sheet_length_mm || 0}мм<br>
              <b>Заготовка:</b> ${layout.box_width_mm || layoutData.pieceWidth || 0}×${layout.box_length_mm || layoutData.pieceLength || 0}мм${layoutData.rotated ? ' (повернуто на 90°)' : ''}<br>
              <b>Заготовок:</b> ${layout.pieces_count || 0} | <b>Отходы:</b> ${layout.waste_percent || 0}%<br>
              ${layout.waste_width_mm > 0 || layout.waste_length_mm > 0 ? `<b>Отходы (размеры):</b> ${layout.waste_width_mm > 0 ? `Справа: ${layout.waste_width_mm.toFixed(1)}×${layout.sheet_length_mm || 0}мм` : ''}${layout.waste_width_mm > 0 && layout.waste_length_mm > 0 ? '; ' : ''}${layout.waste_length_mm > 0 ? `Снизу: ${layout.sheet_width_mm || 0}×${layout.waste_length_mm.toFixed(1)}мм` : ''}<br>` : ''}
              <b>Толщина:</b> ${layout.thickness_mm || layoutData.thickness || 0}мм<br>
              <b>Дата создания:</b> ${layout.created_at ? new Date(layout.created_at).toLocaleString('ru-RU') : '—'}
            </div>
          </div>
          <div class="svg-container">
            ${svgContent}
          </div>
        </body>
        </html>
      `);
      viewWindow.document.close();
    } catch (e) {
      console.error("Error viewing layout:", e);
      toast("❌ Ошибка просмотра раскроя: " + (e.message || String(e)));
    }
  }

  // Edit layout
  async function editLayout(layoutId) {
    try {
      const layouts = await api("/api/cutting/layouts");
      const layout = layouts.find(l => l.id === layoutId);
      
      if (!layout) {
        toast("❌ Раскрой не найден");
        return;
      }

      // Загружаем данные раскроя в форму
      const materialSelect = $("simpleCuttingMaterialSelect");
      const pieceWidth = $("simplePieceWidth");
      const pieceLength = $("simplePieceLength");
      const kerf = $("simpleKerf");

      if (materialSelect) materialSelect.value = layout.material_id || "";
      if (materialSelect && materialSelect.onchange) materialSelect.onchange();

      const layoutData = layout.layout_data_json ? 
        (typeof layout.layout_data_json === 'string' ? JSON.parse(layout.layout_data_json) : layout.layout_data_json) : {};

      if (pieceWidth) pieceWidth.value = layout.box_width_mm || layoutData.pieceWidth || 0;
      if (pieceLength) pieceLength.value = layout.box_length_mm || layoutData.pieceLength || 0;
      if (kerf) kerf.value = layoutData.kerf || 2;

      toast("✅ Данные раскроя загружены в форму");
    } catch (e) {
      console.error("Error loading layout for edit:", e);
      toast("❌ Ошибка загрузки раскроя: " + (e.message || String(e)));
    }
  }

  // Assign layout to operation
  async function assignLayoutToOperation(layoutId) {
    try {
      // Загружаем список операций
      const ops = await api("/api/ops");
      if (!Array.isArray(ops) || ops.length === 0) {
        toast("❌ Нет доступных операций");
        return;
      }

      // Создаем модальное окно для выбора операции
      const modal = document.createElement("div");
      modal.className = "modal";
      modal.style.display = "block";
      modal.innerHTML = `
        <div class="modal-content" style="max-width:800px;max-height:90vh;display:flex;flex-direction:column">
          <div class="modal-header">
            <h3 style="margin:0">📌 Назначить раскрой операции</h3>
            <span class="close-button" onclick="this.closest('.modal').remove()">&times;</span>
          </div>
          <div class="modal-body" style="flex:1;overflow-y:auto;padding:16px">
            <div class="hint" style="margin-bottom:12px">Выберите операцию, к которой нужно привязать раскрой</div>
            <div style="max-height:500px;overflow-y:auto">
              <table style="width:100%;font-size:12px;border-collapse:collapse">
                <thead>
                  <tr style="background:var(--bg-secondary);border-bottom:2px solid var(--border)">
                    <th style="padding:8px;text-align:left;font-weight:700;font-size:11px">№</th>
                    <th style="padding:8px;text-align:left;font-weight:700;font-size:11px">Заказ</th>
                    <th style="padding:8px;text-align:left;font-weight:700;font-size:11px">Дата</th>
                    <th style="padding:8px;text-align:left;font-weight:700;font-size:11px">Операция</th>
                    <th style="padding:8px;text-align:left;font-weight:700;font-size:11px">Машина</th>
                    <th style="padding:8px;text-align:left;font-weight:700;font-size:11px">Оператор</th>
                    <th style="padding:8px;text-align:center;font-weight:700;font-size:11px">Статус</th>
                    <th style="padding:8px;text-align:center;font-weight:700;font-size:11px">Действие</th>
                  </tr>
                </thead>
                <tbody id="assignLayoutOpsList">
                  <tr>
                    <td colspan="8" style="padding:20px;text-align:center;color:var(--muted)">
                      Загрузка операций...
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn ghost" onclick="this.closest('.modal').remove()">Отмена</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Закрытие по клику вне модального окна
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };

      // Заполняем список операций
      const tbody = modal.querySelector("#assignLayoutOpsList");
      tbody.innerHTML = ops.map(op => {
        const hasLayout = op.cutting_layout_id === layoutId;
        const statusClass = op.status === "Выполнено" ? "ok" : op.status === "В работе" ? "warn" : "bad";
        return `
          <tr style="border-bottom:1px solid var(--border);${hasLayout ? 'background:rgba(0,207,181,.1)' : ''}">
            <td style="padding:8px;font-weight:600">${op.no || ""}</td>
            <td style="padding:8px;font-family:monospace;font-size:11px">${esc(op.order_id || "")}</td>
            <td style="padding:8px;font-size:11px">${op.date ? new Date(op.date).toLocaleDateString('ru-RU') : '—'}</td>
            <td style="padding:8px">${esc(op.name || "")}</td>
            <td style="padding:8px;font-size:11px">${esc(op.machine || "")}</td>
            <td style="padding:8px;font-size:11px">${esc(op.operator || "")}</td>
            <td style="padding:8px;text-align:center">
              <span class="pill ${statusClass}" style="font-size:10px;padding:2px 6px">${esc(op.status || "")}</span>
            </td>
            <td style="padding:8px;text-align:center">
              ${hasLayout ? 
                `<span style="font-size:11px;color:var(--accent);font-weight:600">✓ Назначен</span>` :
                `<button class="btn primary" data-assign-op="${esc(op.id)}" style="padding:4px 8px;font-size:11px">Назначить</button>`
              }
            </td>
          </tr>
        `;
      }).join('');

      // Обработчики кнопок назначения
      tbody.querySelectorAll('[data-assign-op]').forEach(btn => {
        btn.onclick = async () => {
          const opId = btn.dataset.assignOp;
          try {
            btn.disabled = true;
            btn.textContent = "⏳...";
            
            // Обновляем операцию через API
            const response = await api(`/api/ops/${encodeURIComponent(opId)}/cutting-layout`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cutting_layout_id: layoutId })
            });
            
            // Обновляем данные операции в state
            if(response && state.ops){
              const opIndex = state.ops.findIndex(o => o.id === opId);
              if(opIndex !== -1){
                state.ops[opIndex] = { ...state.ops[opIndex], ...response };
              }
            }

            toast("✅ Раскрой назначен операции");
            modal.remove();
            
            // Обновляем данные и перерисовываем интерфейс
            await refreshAll(false);
            
            // Обновляем список операций, если функция renderOps доступна
            if (typeof window.renderOps === 'function') {
              window.renderOps();
            }
            // Обновляем раздел "Мои задачи", если функция renderMy доступна
            if (typeof window.renderMy === 'function') {
              window.renderMy();
            }
          } catch (e) {
            console.error("Error assigning layout to operation:", e);
            toast("❌ Ошибка назначения: " + (e.message || String(e)));
            btn.disabled = false;
            btn.textContent = "Назначить";
          }
        };
      });

    } catch (e) {
      console.error("Error loading operations for assignment:", e);
      toast("❌ Ошибка загрузки операций: " + (e.message || String(e)));
    }
  }

  // Delete layout
  async function deleteLayout(layoutId) {
    if (!confirm(`Удалить раскрой "${layoutId}"?`)) {
      return;
    }

    try {
      await api(`/api/cutting/layouts/${layoutId}`, {
        method: "DELETE"
      });

      toast("✅ Раскрой удален");
      await loadAndRenderSavedLayouts();
    } catch (e) {
      console.error("Error deleting layout:", e);
      toast("❌ Ошибка удаления: " + (e.message || String(e)));
    }
  }

  // Expose functions globally
  window.assignLayoutToOperation = assignLayoutToOperation;
  window.generatePreviewSvgForPrint = generatePreviewSvgForPrint; // Экспортируем для использования в распечатке
  window.generateSvgForLayout = generateSvgForLayout; // Экспортируем универсальную функцию генерации SVG
  window.generateSvgForLayout = generateSvgForLayout; // Экспортируем универсальную функцию
  window.SimpleCuttingModule = {
    loaded: true,
    init,
    renderSimpleCutting,
    renderMaterialSelect,
    calculateSimpleLayout,
    loadAndRenderSavedLayouts,
    generatePreviewSvgForPrint,
    generateSvgForLayout
  };

  console.log('Simple Cutting Master module loaded successfully');
  
  // Auto-init if cutting-simple pane is visible
  if (document.querySelector('#cutting-simple.pane')?.style.display !== 'none') {
    console.log('cutting-simple pane is visible, auto-initializing...');
    setTimeout(() => {
      if (window.SimpleCuttingModule?.init) {
        window.SimpleCuttingModule.init();
      }
    }, 100);
  }

})();
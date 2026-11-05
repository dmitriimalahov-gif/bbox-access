/**
 * B'BOX Production - Cutting Master Module
 * =========================================
 * Мастер кроя: оптимизация раскроя листовых материалов
 */

(function() {
  'use strict';
  
  // Check if already loaded
  if (window.CuttingModule && window.CuttingModule.loaded) {
    console.log('Cutting module already loaded');
    return;
  }
  
  console.log('Loading Cutting Master module...');
  
  // Cutting state
  const cutting = {
    templates: [],
    savedLayouts: [],
    currentMaterial: null,
    currentBox: { width: 0, length: 0, height: 0, thickness: 0 },
    currentLayout: null,
    selectedTemplate: null
  };
  
  window.cutting = cutting;
  
  // Load cutting templates
  // Load templates from database
  async function loadTemplates() {
    try {
      console.log("Loading cutting templates...");
      const templates = await api("/api/cutting/templates");
      console.log("Loaded templates:", templates.length);

      // Если шаблонов нет, создаем дефолтные
      if (!templates || templates.length === 0) {
        console.log("No templates found, creating defaults...");
        await createDefaultTemplates();
        // Перезагружаем
        const updatedTemplates = await api("/api/cutting/templates");
        cutting.templates = updatedTemplates;
      } else {
        cutting.templates = templates;
      }

      renderTemplateSelect();
      console.log("Templates loaded and rendered");
    } catch (e) {
      console.error("Failed to load cutting templates:", e);
      toast("❌ Ошибка загрузки шаблонов раскроя: " + e.message);
    }
  }

  // Create default templates if none exist
  async function createDefaultTemplates() {
    const defaults = [
      {
        name: "Коробка стандартная",
        description: "Крышка + Дно + Стенка короткая + Стенка длинная",
        formula_json: getDefaultFormula("box")
      },
      {
        name: "Крышка простая",
        description: "Только крышка коробки",
        formula_json: getDefaultFormula("lid")
      },
      {
        name: "Ложемент",
        description: "Внутренняя вставка коробки",
        formula_json: getDefaultFormula("insert")
      }
    ];

    for (const template of defaults) {
      try {
        await api("/api/cutting/templates", {
          method: "POST",
          body: JSON.stringify(template)
        });
        console.log("Created default template:", template.name);
      } catch (e) {
        console.error("Failed to create template:", template.name, e);
      }
    }
  }
  
  // Load saved layouts
  async function loadSavedLayouts() {
    try {
      const layouts = await api("/api/cutting/layouts");
      cutting.savedLayouts = layouts || [];
      renderSavedLayouts();
    } catch (e) {
      console.error("Failed to load saved layouts:", e);
      cutting.savedLayouts = [];
    }
  }
  
  // Render template select with descriptions
  function renderTemplateSelect() {
    const sel = $("cuttingTemplateSelect");
    if (!sel) {
      console.warn("cuttingTemplateSelect element not found!");
      return;
    }

    const templates = cutting.templates || [];
    console.log("Rendering template select with", templates.length, "templates");

    if (templates.length === 0) {
      sel.innerHTML = '<option value="">— Нет шаблонов раскроя —</option>';
      return;
    }

    // Сортируем по названию
    templates.sort((a, b) => {
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB, "ru");
    });

    sel.innerHTML = '<option value="">— Выберите шаблон раскроя —</option>' +
      templates.map(t => {
        const desc = t.description ? ` (${t.description})` : '';
        return `<option value="${esc(t.id)}">${esc(t.name)}${desc}</option>`;
      }).join('');

    console.log("Template select rendered");
  }
  
  // Render material select (используем только state.materials как в шаблонах)
  function renderMaterialSelect() {
    const sel = $("cuttingMaterialSelect");
    if (!sel) {
      console.warn("cuttingMaterialSelect element not found!");
      return;
    }
    
    const materials = state.materials || [];
    console.log("Rendering material select, materials in state:", materials.length);
    
    // Фильтруем только листовые материалы (с размерами)
    const sheetMaterials = materials.filter(m => {
      const hasLength = m.length_mm && parseFloat(m.length_mm) > 0;
      const hasWidth = m.width_mm && parseFloat(m.width_mm) > 0;
      return hasLength && hasWidth;
    });
    
    console.log("Filtered sheet materials:", sheetMaterials.length);
    
    if (sheetMaterials.length === 0) {
      if (materials.length === 0) {
        sel.innerHTML = '<option value="">— Загрузите материалы (нажмите 🔄) —</option>';
      } else {
        sel.innerHTML = '<option value="">— Нет листовых материалов в базе —</option>';
      }
      return;
    }
    
    // Сортируем по названию
    sheetMaterials.sort((a, b) => {
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB, "ru");
    });
    
    // Группируем по типам для лучшей организации
    const materialsByType = {};
    const materialsWithoutType = [];
    for(const m of sheetMaterials){
      const typeName = m.type_name || null;
      if(typeName){
        if(!materialsByType[typeName]) materialsByType[typeName] = [];
        materialsByType[typeName].push(m);
      } else {
        materialsWithoutType.push(m);
      }
    }
    
    let html = '<option value="">— Выберите материал —</option>';
    
    // Материалы по типам
    const typeNames = Object.keys(materialsByType).sort();
    for(const typeName of typeNames){
      const typeMaterials = materialsByType[typeName];
      html += `<optgroup label="${esc(typeName)}">`;
      for(const m of typeMaterials){
        const width = parseFloat(m.width_mm) || 0;
        const length = parseFloat(m.length_mm) || 0;
        const thickness = m.thickness_mm ? `, ${m.thickness_mm}мм` : '';
        const unit = m.unit ? ` (${m.unit})` : '';
        const stock = m.stock !== undefined ? ` | Остаток: ${m.stock}${unit}` : '';
        
        html += `<option value="${esc(m.id)}" 
                data-width="${width}" 
                data-length="${length}"
                data-thickness="${m.thickness_mm || ''}"
                data-unit="${esc(m.unit || '')}"
                data-stock="${m.stock || 0}">
            ${esc(m.name)} — ${width}×${length}мм${thickness}${stock}
          </option>`;
      }
      html += '</optgroup>';
    }
    
    // Материалы без типа
    if(materialsWithoutType.length > 0){
      html += '<optgroup label="Без типа">';
      for(const m of materialsWithoutType){
        const width = parseFloat(m.width_mm) || 0;
        const length = parseFloat(m.length_mm) || 0;
        const thickness = m.thickness_mm ? `, ${m.thickness_mm}мм` : '';
        const unit = m.unit ? ` (${m.unit})` : '';
        const stock = m.stock !== undefined ? ` | Остаток: ${m.stock}${unit}` : '';
        
        html += `<option value="${esc(m.id)}" 
                data-width="${width}" 
                data-length="${length}"
                data-thickness="${m.thickness_mm || ''}"
                data-unit="${esc(m.unit || '')}"
                data-stock="${m.stock || 0}">
            ${esc(m.name)} — ${width}×${length}мм${thickness}${stock}
          </option>`;
      }
      html += '</optgroup>';
    }
    
    sel.innerHTML = html;
    
    // Обработчик изменения выбора
    sel.onchange = () => {
      const option = sel.options[sel.selectedIndex];
      if (option && option.dataset.width && option.value) {
        cutting.currentMaterial = {
          id: sel.value,
          name: option.textContent.split(' — ')[0], // Берем только название без размеров
          width: parseFloat(option.dataset.width),
          length: parseFloat(option.dataset.length),
          thickness: parseFloat(option.dataset.thickness) || 0,
          unit: option.dataset.unit || '',
          stock: parseFloat(option.dataset.stock) || 0
        };
        
        // Автоматически заполняем размеры листа из материала
        const sheetWidthInput = $("cuttingSheetWidth");
        const sheetLengthInput = $("cuttingSheetLength");
        const thicknessInput = $("cuttingThickness");

        if (sheetWidthInput) sheetWidthInput.value = cutting.currentMaterial.width;
        if (sheetLengthInput) sheetLengthInput.value = cutting.currentMaterial.length;

        // Всегда заполняем толщину материала, если она есть
        if (thicknessInput && cutting.currentMaterial.thickness > 0) {
          thicknessInput.value = cutting.currentMaterial.thickness;
        }

        // Показываем сообщение о выбранном материале
        const materialInfo = `${cutting.currentMaterial.name} (${cutting.currentMaterial.width}×${cutting.currentMaterial.length}мм`;
        if (cutting.currentMaterial.thickness > 0) {
          materialInfo += `, ${cutting.currentMaterial.thickness}мм`;
        }
        materialInfo += ')';

        toast(`✅ Выбран материал: ${materialInfo}`);

        // Сбрасываем результат при смене материала
        const resultDiv = $("cuttingResult");
        if (resultDiv) resultDiv.style.display = "none";
      } else {
        cutting.currentMaterial = null;
      }
    };
  }
  
  // Calculate optimal layout
  async function calculateLayout() {
    const materialId = $("cuttingMaterialSelect").value;
    const sheetWidth = parseFloat($("cuttingSheetWidth").value) || 0;
    const sheetLength = parseFloat($("cuttingSheetLength").value) || 0;
    const boxWidth = parseFloat($("cuttingBoxWidth").value) || 0;
    const boxLength = parseFloat($("cuttingBoxLength").value) || 0;
    const boxHeight = parseFloat($("cuttingBoxHeight").value) || 0;
    const thickness = parseFloat($("cuttingThickness").value) || 0;
    const templateId = $("cuttingTemplateSelect").value;
    
    if (!materialId || !sheetWidth || !sheetLength || !boxWidth || !boxLength || !boxHeight) {
      toast("Заполните все обязательные поля");
      return;
    }
    
    try {
      // Получаем формулу из шаблона или используем дефолтную
      let formula = null;
      if (templateId) {
        const template = cutting.templates.find(t => t.id === templateId);
        if (template && template.formula_json) {
          formula = typeof template.formula_json === 'string' 
            ? JSON.parse(template.formula_json) 
            : template.formula_json;
        }
      }
      
      const result = await api("/api/cutting/calculate", {
        method: "POST",
        body: JSON.stringify({
          material_id: materialId,
          sheet_width_mm: sheetWidth,
          sheet_length_mm: sheetLength,
          box_width_mm: boxWidth,
          box_length_mm: boxLength,
          box_height_mm: boxHeight,
          thickness_mm: thickness,
          formula_json: formula
        })
      });
      
      cutting.currentLayout = result;
      renderPreview(result);
      toast(`✅ Найдено оптимальное расположение: ${result.piecesCount} заготовок, отходы: ${result.wastePercent}%`);
    } catch (e) {
      console.error("Calculation error:", e);
      toast("Ошибка расчета: " + (e.message || String(e)));
    }
  }
  
  // Render preview with SVG
  function renderPreview(layout) {
    const container = $("cuttingPreview");
    if (!container) return;
    
    if (!layout || !layout.pieces || layout.pieces.length === 0) {
      container.innerHTML = '<div class="hint">Нет данных для отображения</div>';
      return;
    }
    
    const sheetWidth = cutting.currentMaterial?.width || parseFloat($("cuttingSheetWidth").value) || 1000;
    const sheetLength = cutting.currentMaterial?.length || parseFloat($("cuttingSheetLength").value) || 700;
    
    // Масштаб для отображения
    const scale = Math.min(800 / sheetWidth, 600 / sheetLength, 1);
    const displayWidth = sheetWidth * scale;
    const displayLength = sheetLength * scale;
    
    // Генерируем SVG
    let svg = `<svg width="${displayWidth}" height="${displayLength}" style="border:2px solid var(--border);background:#fff;max-width:100%">
      <rect x="0" y="0" width="${displayWidth}" height="${displayLength}" fill="#f8f9fa" stroke="#ddd"/>
    `;
    
    // Цвета для разных типов заготовок
    const colors = {
      lid: '#ff9800',
      bottom: '#2196f3',
      side1: '#4caf50',
      side2: '#9c27b0'
    };
    
    layout.pieces.forEach(piece => {
      const x = piece.x * scale;
      const y = piece.y * scale;
      const w = piece.width * scale;
      const l = piece.length * scale;
      const color = colors[piece.type] || '#666';
      
      svg += `
        <rect x="${x}" y="${y}" width="${w}" height="${l}" 
              fill="${color}" fill-opacity="0.6" stroke="${color}" stroke-width="1"/>
        <text x="${x + w/2}" y="${y + l/2}" 
              text-anchor="middle" dominant-baseline="middle" 
              font-size="10" fill="#000">${piece.type}</text>
      `;
    });
    
    svg += '</svg>';
    
    const boxWidth = parseFloat($("cuttingBoxWidth").value) || 0;
    const boxLength = parseFloat($("cuttingBoxLength").value) || 0;
    const boxHeight = parseFloat($("cuttingBoxHeight").value) || 0;
    const thickness = parseFloat($("cuttingThickness").value) || 0;
    const materialName = cutting.currentMaterial?.name || "Материал";
    
    // Генерируем уникальный код для задания на резку
    const cuttingTaskId = `CUT-${Date.now().toString(36).toUpperCase().slice(-8)}`;
    
    container.innerHTML = `
      <div style="margin-bottom:12px">
        <div class="row" style="gap:12px;flex-wrap:wrap">
          <div class="chip">Заготовок: <b>${layout.piecesCount}</b></div>
          <div class="chip">Отходы: <b>${layout.wastePercent}%</b></div>
          <div class="chip">Использовано: <b>${((1 - layout.wastePercent/100) * 100).toFixed(1)}%</b></div>
        </div>
      </div>
      <div style="overflow:auto;max-height:600px;border:1px solid var(--border);border-radius:8px;padding:12px;background:#fff;margin-bottom:12px">
        ${svg}
      </div>
      
      <div class="card" style="background:#fff;border:2px solid var(--border);padding:16px;margin-bottom:12px">
        <h4 style="margin:0 0 12px;text-align:center">🏷️ Этикетка для печати</h4>
        <div id="cuttingBarcodeLabel" style="border:1px dashed var(--border);padding:12px;background:#fff;text-align:center">
          <div style="margin-bottom:8px">
            <strong style="font-size:14px">Задание на резку</strong><br>
            <span style="font-size:11px;color:var(--muted)">${esc(materialName)}</span>
          </div>
          <div style="margin:8px 0">
            <div style="font-size:10px;color:var(--muted);margin-bottom:4px">Лист: ${sheetWidth}×${sheetLength}мм</div>
            ${boxWidth > 0 ? `<div style="font-size:10px;color:var(--muted)">Коробка: ${boxWidth}×${boxLength}×${boxHeight}мм</div>` : ''}
            <div style="font-size:10px;color:var(--muted);margin-top:4px">Заготовок: ${layout.piecesCount} | Отходы: ${layout.wastePercent}%</div>
          </div>
          <div style="margin:12px 0">
            <svg id="cuttingBarcodeSvg" style="max-width:100%;height:60px"></svg>
            <div style="font-family:monospace;font-size:11px;margin-top:4px;font-weight:600">${cuttingTaskId}</div>
          </div>
          <div style="font-size:9px;color:var(--muted);margin-top:8px">
            ${new Date().toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'})}
          </div>
        </div>
        <button class="btn accent" id="cuttingPrintLabel" style="width:100%;margin-top:12px">🖨️ Печать этикетки</button>
      </div>
      
      <div style="margin-top:12px">
        <button class="btn accent" id="cuttingSaveLayout">💾 Сохранить раскрой</button>
      </div>
    `;
    
    // Генерируем штрихкод
    generateBarcode(cuttingTaskId);
    
    // Сохранение раскроя
    $("cuttingSaveLayout").onclick = async () => {
      await saveLayout(layout);
    };
    
    // Печать этикетки
    $("cuttingPrintLabel").onclick = () => {
      printCuttingLabel(cuttingTaskId, materialName, sheetWidth, sheetLength, boxWidth, boxLength, boxHeight, layout);
    };
  }
  
  // Generate barcode
  function generateBarcode(code) {
    const svg = $("cuttingBarcodeSvg");
    if (!svg) return;
    
    // Пробуем использовать JsBarcode если доступен
    if (typeof JsBarcode !== "undefined") {
      try {
        JsBarcode(svg, code, {
          format: "CODE128",
          displayValue: false,
          width: 2,
          height: 50,
          margin: 4
        });
        return;
      } catch (e) {
        console.error("Barcode generation error:", e);
      }
    }
    
    // Загружаем JsBarcode если нет
    if (!window.JsBarcode) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js";
      script.onload = () => {
        try {
          JsBarcode(svg, code, {
            format: "CODE128",
            displayValue: false,
            width: 2,
            height: 50,
            margin: 4
          });
        } catch (e) {
          svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" font-size="12" fill="var(--muted)">Штрихкод</text>`;
        }
      };
      script.onerror = () => {
        svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" font-size="12" fill="var(--muted)">Штрихкод</text>`;
      };
      document.head.appendChild(script);
    }
  }
  
  // Print cutting label
  function printCuttingLabel(taskId, materialName, sheetWidth, sheetLength, boxWidth, boxLength, boxHeight, layout) {
    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Этикетка на резку</title>
        <style>
          @media print {
            @page { margin: 5mm; size: 100mm 60mm; }
            body { margin: 0; padding: 0; }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            padding: 8px;
            font-size: 11px;
          }
          .label {
            border: 1px solid #000;
            padding: 8px;
            text-align: center;
          }
          .title {
            font-weight: 700;
            font-size: 13px;
            margin-bottom: 4px;
          }
          .info {
            font-size: 9px;
            color: #555;
            margin: 4px 0;
            line-height: 1.3;
          }
          .barcode-box {
            margin: 8px 0;
          }
          .barcode-code {
            font-family: monospace;
            font-size: 10px;
            font-weight: 600;
            margin-top: 4px;
          }
          .date {
            font-size: 8px;
            color: #888;
            margin-top: 4px;
          }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="title">Задание на резку</div>
          <div class="info">${esc(materialName)}</div>
          <div class="info">Лист: ${sheetWidth}×${sheetLength}мм</div>
          ${boxWidth > 0 ? `<div class="info">Коробка: ${boxWidth}×${boxLength}×${boxHeight}мм</div>` : ''}
          <div class="info">Заготовок: ${layout.piecesCount} | Отходы: ${layout.wastePercent}%</div>
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
                JsBarcode(svg, codeStr, {
                  format: "CODE128",
                  displayValue: false,
                  width: 2,
                  height: 45,
                  margin: 2
                });
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
    
    const printWindow = window.open("", "_blank", "width=400,height=300");
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
    } else {
      alert("Разрешите всплывающие окна для печати");
    }
  }
  
  // Save layout
  async function saveLayout(layout) {
    try {
      const materialId = $("cuttingMaterialSelect").value;
      const sheetWidth = parseFloat($("cuttingSheetWidth").value);
      const sheetLength = parseFloat($("cuttingSheetLength").value);
      const boxWidth = parseFloat($("cuttingBoxWidth").value);
      const boxLength = parseFloat($("cuttingBoxLength").value);
      const boxHeight = parseFloat($("cuttingBoxHeight").value);
      const thickness = parseFloat($("cuttingThickness").value) || 0;
      const templateId = $("cuttingTemplateSelect").value || null;
      
      // Генерируем SVG для сохранения
      const svg = generateSVG(layout, sheetWidth, sheetLength);
      
      // Генерируем ID на основе размеров: размер_заготовки_размер_бумаги
      // Например: 110_200_1200_890_2 (width_length_sheetWidth_sheetLength_thickness)
      const cuttingId = `${Math.round(boxWidth)}_${Math.round(boxLength)}_${Math.round(sheetWidth)}_${Math.round(sheetLength)}_${Math.round(thickness)}`;
      
      await api("/api/cutting/layouts", {
        method: "POST",
        body: JSON.stringify({
          id: cuttingId, // Используем ID на основе размеров
          template_id: templateId,
          material_id: materialId,
          sheet_width_mm: sheetWidth,
          sheet_length_mm: sheetLength,
          box_width_mm: boxWidth,
          box_length_mm: boxLength,
          box_height_mm: boxHeight,
          thickness_mm: thickness,
          layout_svg: svg,
          pieces_count: layout.piecesCount,
          waste_percent: layout.wastePercent,
          layout_data_json: layout
        })
      });
      
      await loadSavedLayouts();
      toast("✅ Раскрой сохранен");
    } catch (e) {
      console.error("Save error:", e);
      toast("Ошибка сохранения: " + (e.message || String(e)));
    }
  }
  
  // Generate SVG for saving
  function generateSVG(layout, sheetWidth, sheetLength) {
    const scale = 1; // Полный размер для сохранения
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetLength}" viewBox="0 0 ${sheetWidth} ${sheetLength}">
      <rect x="0" y="0" width="${sheetWidth}" height="${sheetLength}" fill="#f8f9fa" stroke="#ddd" stroke-width="2"/>
    `;
    
    const colors = {
      lid: '#ff9800',
      bottom: '#2196f3',
      side1: '#4caf50',
      side2: '#9c27b0'
    };
    
    layout.pieces.forEach(piece => {
      const color = colors[piece.type] || '#666';
      svg += `
        <rect x="${piece.x}" y="${piece.y}" width="${piece.width}" height="${piece.length}" 
              fill="${color}" fill-opacity="0.6" stroke="${color}" stroke-width="1"/>
        <text x="${piece.x + piece.width/2}" y="${piece.y + piece.length/2}" 
              text-anchor="middle" dominant-baseline="middle" 
              font-size="12" fill="#000">${piece.type}</text>
      `;
    });
    
    svg += '</svg>';
    return svg;
  }
  
  // Render saved layouts
  function renderSavedLayouts() {
    const container = $("cuttingSavedLayouts");
    if (!container) return;
    
    if (cutting.savedLayouts.length === 0) {
      container.innerHTML = '<div class="hint">Нет сохраненных раскроев</div>';
      return;
    }
    
    container.innerHTML = cutting.savedLayouts.map(layout => {
      const svgPreview = layout.layout_svg 
        ? layout.layout_svg.replace(/width="[^"]*"/, 'width="200"').replace(/height="[^"]*"/, 'height="140"')
        : '';
      
      return `
        <div class="card" style="margin-bottom:12px">
          <div class="row" style="justify-content:space-between;align-items:start">
            <div style="flex:1">
              <h4 style="margin:0 0 8px">${esc(layout.material_name || 'Материал')}</h4>
              <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
                Лист: ${layout.sheet_width_mm}×${layout.sheet_length_mm} мм<br>
                Коробка: ${layout.box_width_mm}×${layout.box_length_mm}×${layout.box_height_mm} мм<br>
                Заготовок: ${layout.pieces_count} | Отходы: ${layout.waste_percent}%
              </div>
            </div>
            <div style="width:200px;height:140px;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:#fff">
              ${svgPreview || '<div class="hint" style="padding:20px">Нет превью</div>'}
            </div>
            <div>
              <button class="btn ghost danger" onclick="deleteCuttingLayout('${esc(layout.id)}')">×</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  // Delete layout
  window.deleteCuttingLayout = async (id) => {
    if (!confirm("Удалить этот раскрой?")) return;
    try {
      await api(`/api/cutting/layouts/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadSavedLayouts();
      toast("Раскрой удален");
    } catch (e) {
      toast("Ошибка: " + (e.message || String(e)));
    }
  };
  
  // Render main cutting interface
  async function renderCutting() {
    const container = $("cuttingPane");
    if (!container) {
      console.warn("cuttingPane container not found!");
      return;
    }

    console.log("Rendering cutting interface...");
    console.log("Materials in state:", state.materials?.length || 0);

    // Если материалов нет в state, загружаем их
    if (!state.materials || state.materials.length === 0) {
      console.log("Materials not loaded, refreshing...");
      try {
        await refreshAll(false);
        console.log("Materials loaded, count:", state.materials?.length || 0);
      } catch (e) {
        console.error("Failed to load materials:", e);
      }
    }

    // Рендерим материалы из глобального состояния
    renderMaterialSelect();

    // Обработчик кнопки обновления материалов
    const refreshBtn = $("cuttingRefreshMaterials");
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = "⏳";
        try {
          await refreshAll(false);
          console.log("Materials refreshed, count:", state.materials?.length || 0);
          renderMaterialSelect();
          toast("✅ Список материалов обновлен");
        } catch (e) {
          console.error("Failed to refresh materials:", e);
          toast("❌ Ошибка обновления материалов: " + e.message);
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.textContent = "🔄";
        }
      };
    } else {
      console.warn("cuttingRefreshMaterials button not found!");
    }

    // Загружаем шаблоны раскроя
    await loadTemplates();

    // Загружаем сохраненные раскрои
    await loadSavedLayouts();
  }
  
  // Open template editor modal
  function openTemplateEditor() {
    const templateId = $("cuttingTemplateSelect")?.value;
    const template = templateId ? cutting.templates.find(t => t.id === templateId) : null;
    showFormulaEditorModal(template);
  }
  
  // Show formula editor modal
  function showFormulaEditorModal(template = null) {
    // Определяем тип шаблона
    let templateType = "box"; // box, lid, insert
    let templateName = "";
    let templateDescription = "";
    let formula = getDefaultFormula("box");
    
    if (template) {
      templateName = template.name || "";
      templateDescription = template.description || "";
      // Определяем тип по названию
      const nameLower = templateName.toLowerCase();
      if (nameLower.includes("крышка") || nameLower.includes("lid")) {
        templateType = "lid";
      } else if (nameLower.includes("ложемент") || nameLower.includes("insert")) {
        templateType = "insert";
      } else {
        templateType = "box";
      }
      
      if (template.formula_json) {
        try {
          formula = typeof template.formula_json === 'string' 
            ? JSON.parse(template.formula_json) 
            : template.formula_json;
        } catch (e) {
          console.error("Error parsing formula:", e);
          formula = getDefaultFormula(templateType);
        }
      } else {
        formula = getDefaultFormula(templateType);
      }
    }
    
    // Создаем модальное окно
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content" style="max-width:1000px;width:100%;max-height:90vh;display:flex;flex-direction:column">
        <div class="modal-header">
          <h3 style="margin:0">📐 Визуальный редактор формулы раскроя</h3>
          <button class="modal-close" data-action="close">×</button>
        </div>
        <div class="modal-body" style="padding:20px;overflow-y:auto;flex:1">
          <div class="row" style="gap:16px;margin-bottom:16px">
            <div class="field" style="flex:1">
              <label>Тип шаблона</label>
              <select id="formulaTemplateType" style="font-weight:600">
                <option value="box" ${templateType === "box" ? "selected" : ""}>📦 Коробка</option>
                <option value="lid" ${templateType === "lid" ? "selected" : ""}>🔲 Крышка</option>
                <option value="insert" ${templateType === "insert" ? "selected" : ""}>📋 Ложемент</option>
              </select>
            </div>
            <div class="field" style="flex:2">
              <label>Название шаблона</label>
              <input type="text" id="formulaTemplateName" value="${esc(templateName)}" placeholder="Например: Коробка стандартная">
            </div>
          </div>
          
          <h4 style="margin:20px 0 12px">Элементы формулы</h4>
          <div id="formulaElementsList" style="margin-bottom:16px"></div>
          <button class="btn ghost" id="formulaAddElement" style="margin-bottom:16px">+ Добавить элемент</button>
          
          <div class="grid two" style="margin-top:20px">
            <div>
              <h4 style="margin:0 0 12px">📊 Предпросмотр формулы</h4>
              <div id="formulaPreview" style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);font-family:monospace;font-size:12px;max-height:200px;overflow-y:auto"></div>
            </div>
            <div>
              <h4 style="margin:0 0 12px">🧪 Интерактивный предпросмотр</h4>
              <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border)">
                <div class="row" style="gap:8px;margin-bottom:12px">
                  <div class="field" style="flex:1">
                    <label style="font-size:11px">Ширина (мм)</label>
                    <input type="number" id="previewBoxWidth" value="100" step="1" style="font-size:12px">
                  </div>
                  <div class="field" style="flex:1">
                    <label style="font-size:11px">Длина (мм)</label>
                    <input type="number" id="previewBoxLength" value="100" step="1" style="font-size:12px">
                  </div>
                  <div class="field" style="flex:1">
                    <label style="font-size:11px">Высота (мм)</label>
                    <input type="number" id="previewBoxHeight" value="100" step="1" style="font-size:12px">
                  </div>
                  <div class="field" style="flex:1">
                    <label style="font-size:11px">Толщина (мм)</label>
                    <input type="number" id="previewThickness" value="2" step="0.1" style="font-size:12px">
                  </div>
                </div>
                <div id="formulaInteractivePreview" style="padding:8px;background:#fff;border-radius:4px;min-height:100px;font-size:11px"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end">
          <button class="btn ghost" data-action="close">Отмена</button>
          <button class="btn accent" data-action="save">💾 Сохранить шаблон</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add("show"), 10);
    
    // Рендерим элементы формулы
    renderFormulaElements(formula);
    updateFormulaPreview(formula);
    
    // Обработчики событий
    const close = () => {
      modal.classList.remove("show");
      setTimeout(() => modal.remove(), 200);
    };
    
    modal.querySelector('[data-action="close"]').onclick = close;
    modal.onclick = (e) => {
      if (e.target === modal) close();
    };
    
    modal.querySelector('[data-action="save"]').onclick = async () => {
      await saveFormulaTemplate(window.currentFormula || formula, template?.id);
      close();
    };
    
    modal.querySelector('#formulaAddElement').onclick = () => {
      addFormulaElement();
    };
    
    // Обработчик изменения типа шаблона
    const typeSelect = modal.querySelector('#formulaTemplateType');
    if (typeSelect) {
      typeSelect.onchange = () => {
        const newType = typeSelect.value;
        const newFormula = getDefaultFormula(newType);
        window.currentFormula = newFormula;
        renderFormulaElements(newFormula);
        updateFormulaPreview(newFormula);
        updateInteractivePreview();
      };
    }
    
    // Обработчики для интерактивного предпросмотра
    ['previewBoxWidth', 'previewBoxLength', 'previewBoxHeight', 'previewThickness'].forEach(id => {
      const input = modal.querySelector(`#${id}`);
      if (input) {
        input.oninput = () => updateInteractivePreview();
      }
    });
    
    // Сохраняем ссылку на модальное окно для обновления
    window.currentFormulaModal = modal;
    window.currentFormula = formula;
    
    // Инициализируем интерактивный предпросмотр
    setTimeout(() => updateInteractivePreview(), 100);
  }
  
  // Get default formula by type (визуальный формат)
  function getDefaultFormula(type = "box") {
    if (type === "lid") {
      return {
        lid: {
          name: "Крышка",
          widthParam: "boxWidth",
          widthOp: "+",
          widthMultiplier: "2 * thickness",
          lengthParam: "boxLength",
          lengthOp: "+",
          lengthMultiplier: "2 * thickness",
          qty: 1
        }
      };
    } else if (type === "insert") {
      return {
        insert: {
          name: "Ложемент",
          widthParam: "boxWidth",
          widthOp: "-",
          widthMultiplier: "2 * thickness",
          lengthParam: "boxLength",
          lengthOp: "-",
          lengthMultiplier: "2 * thickness",
          qty: 1
        }
      };
    } else {
      // box
      return {
        lid: {
          name: "Крышка",
          widthParam: "boxWidth",
          widthOp: "+",
          widthMultiplier: "2 * thickness",
          lengthParam: "boxLength",
          lengthOp: "+",
          lengthMultiplier: "2 * thickness",
          qty: 1
        },
        bottom: {
          name: "Дно",
          widthParam: "boxWidth",
          widthOp: "+",
          widthMultiplier: "2 * thickness",
          lengthParam: "boxLength",
          lengthOp: "+",
          lengthMultiplier: "2 * thickness",
          qty: 1
        },
        wall_short: {
          name: "Стенка (короткая)",
          widthParam: "boxWidth",
          widthOp: "",
          widthMultiplier: "",
          lengthParam: "boxHeight",
          lengthOp: "",
          lengthMultiplier: "",
          qty: 2
        },
        wall_long: {
          name: "Стенка (длинная)",
          widthParam: "boxLength",
          widthOp: "",
          widthMultiplier: "",
          lengthParam: "boxHeight",
          lengthOp: "",
          lengthMultiplier: "",
          qty: 2
        }
      };
    }
  }
  
  // Render formula elements (визуальный конструктор)
  function renderFormulaElements(formula) {
    const container = $("formulaElementsList");
    if (!container) return;
    
    // Парсим старый формат в новый, если нужно
    const normalizedFormula = normalizeFormula(formula);
    
    container.innerHTML = Object.entries(normalizedFormula).map(([key, element]) => {
      const widthParam = element.widthParam || "boxWidth";
      const widthOp = element.widthOp || "";
      const widthMultiplier = element.widthMultiplier || "";
      const lengthParam = element.lengthParam || "boxLength";
      const lengthOp = element.lengthOp || "";
      const lengthMultiplier = element.lengthMultiplier || "";
      
      return `
        <div class="card" style="margin-bottom:12px;padding:12px" data-element-key="${esc(key)}">
          <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px">
            <div class="field" style="flex:1;margin-right:12px">
              <label>Название элемента</label>
              <input type="text" class="formula-element-name" value="${esc(element.name || key)}" placeholder="Например: Крышка">
            </div>
            <div class="field" style="min-width:100px;margin-right:12px">
              <label>Количество</label>
              <input type="number" class="formula-element-qty" value="${element.qty || 1}" min="1" step="1">
            </div>
            <button class="btn ghost danger" data-action="remove-element" data-key="${esc(key)}" style="margin-top:18px">×</button>
          </div>
          
          <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;margin-bottom:8px">
            <label style="font-weight:600;margin-bottom:8px;display:block">Ширина:</label>
            <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
              <div class="field" style="min-width:120px">
                <label style="font-size:11px">Параметр</label>
                <select class="formula-width-param" style="font-size:12px">
                  <option value="boxWidth" ${widthParam === "boxWidth" ? "selected" : ""}>Ширина</option>
                  <option value="boxLength" ${widthParam === "boxLength" ? "selected" : ""}>Длина</option>
                  <option value="boxHeight" ${widthParam === "boxHeight" ? "selected" : ""}>Высота</option>
                  <option value="thickness" ${widthParam === "thickness" ? "selected" : ""}>Толщина</option>
                </select>
              </div>
              <div class="field" style="min-width:80px">
                <label style="font-size:11px">Операция</label>
                <select class="formula-width-op" style="font-size:12px">
                  <option value="" ${widthOp === "" ? "selected" : ""}>—</option>
                  <option value="+" ${widthOp === "+" ? "selected" : ""}>+</option>
                  <option value="-" ${widthOp === "-" ? "selected" : ""}>-</option>
                  <option value="*" ${widthOp === "*" ? "selected" : ""}>×</option>
                  <option value="/" ${widthOp === "/" ? "selected" : ""}>÷</option>
                </select>
              </div>
              <div class="field" style="flex:1;min-width:150px">
                <label style="font-size:11px">Множитель/Значение</label>
                <input type="text" class="formula-width-multiplier" value="${esc(widthMultiplier)}" placeholder="2 * thickness" style="font-size:12px">
              </div>
            </div>
          </div>
          
          <div style="background:var(--bg-secondary);padding:12px;border-radius:8px">
            <label style="font-weight:600;margin-bottom:8px;display:block">Длина:</label>
            <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
              <div class="field" style="min-width:120px">
                <label style="font-size:11px">Параметр</label>
                <select class="formula-length-param" style="font-size:12px">
                  <option value="boxWidth" ${lengthParam === "boxWidth" ? "selected" : ""}>Ширина</option>
                  <option value="boxLength" ${lengthParam === "boxLength" ? "selected" : ""}>Длина</option>
                  <option value="boxHeight" ${lengthParam === "boxHeight" ? "selected" : ""}>Высота</option>
                  <option value="thickness" ${lengthParam === "thickness" ? "selected" : ""}>Толщина</option>
                </select>
              </div>
              <div class="field" style="min-width:80px">
                <label style="font-size:11px">Операция</label>
                <select class="formula-length-op" style="font-size:12px">
                  <option value="" ${lengthOp === "" ? "selected" : ""}>—</option>
                  <option value="+" ${lengthOp === "+" ? "selected" : ""}>+</option>
                  <option value="-" ${lengthOp === "-" ? "selected" : ""}>-</option>
                  <option value="*" ${lengthOp === "*" ? "selected" : ""}>×</option>
                  <option value="/" ${lengthOp === "/" ? "selected" : ""}>÷</option>
                </select>
              </div>
              <div class="field" style="flex:1;min-width:150px">
                <label style="font-size:11px">Множитель/Значение</label>
                <input type="text" class="formula-length-multiplier" value="${esc(lengthMultiplier)}" placeholder="2 * thickness" style="font-size:12px">
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    // Обработчики изменений
    container.querySelectorAll('.formula-element-name').forEach(input => {
      input.oninput = () => {
        updateFormulaFromUI();
        updateInteractivePreview();
      };
    });
    
    container.querySelectorAll('.formula-width-param, .formula-width-op, .formula-width-multiplier').forEach(el => {
      el.onchange = el.oninput = () => {
        updateFormulaFromUI();
        updateInteractivePreview();
      };
    });
    
    container.querySelectorAll('.formula-length-param, .formula-length-op, .formula-length-multiplier').forEach(el => {
      el.onchange = el.oninput = () => {
        updateFormulaFromUI();
        updateInteractivePreview();
      };
    });
    
    container.querySelectorAll('.formula-element-qty').forEach(input => {
      input.oninput = () => {
        updateFormulaFromUI();
        updateInteractivePreview();
      };
    });
    
    container.querySelectorAll('[data-action="remove-element"]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.key;
        delete window.currentFormula[key];
        renderFormulaElements(window.currentFormula);
        updateFormulaPreview(window.currentFormula);
        updateInteractivePreview();
      };
    });
    
    // Обновляем интерактивный предпросмотр
    updateInteractivePreview();
  }
  
  // Normalize formula (convert old format to new)
  function normalizeFormula(formula) {
    const normalized = {};
    for (const [key, element] of Object.entries(formula)) {
      if (element.width && element.length) {
        // Старый формат (текстовые формулы)
        const widthMatch = element.width.match(/^(boxWidth|boxLength|boxHeight|thickness)(\s*([+\-*/])\s*(.+))?$/);
        const lengthMatch = element.length.match(/^(boxWidth|boxLength|boxHeight|thickness)(\s*([+\-*/])\s*(.+))?$/);
        
        normalized[key] = {
          name: element.name || key,
          widthParam: widthMatch ? widthMatch[1] : "boxWidth",
          widthOp: widthMatch && widthMatch[3] ? widthMatch[3] : "",
          widthMultiplier: widthMatch && widthMatch[4] ? widthMatch[4] : "",
          lengthParam: lengthMatch ? lengthMatch[1] : "boxLength",
          lengthOp: lengthMatch && lengthMatch[3] ? lengthMatch[3] : "",
          lengthMultiplier: lengthMatch && lengthMatch[4] ? lengthMatch[4] : "",
          qty: element.qty || 1
        };
      } else {
        // Новый формат (уже нормализован)
        normalized[key] = {
          name: element.name || key,
          widthParam: element.widthParam || "boxWidth",
          widthOp: element.widthOp || "",
          widthMultiplier: element.widthMultiplier || "",
          lengthParam: element.lengthParam || "boxLength",
          lengthOp: element.lengthOp || "",
          lengthMultiplier: element.lengthMultiplier || "",
          qty: element.qty || 1
        };
      }
    }
    return normalized;
  }
  
  // Build formula string from visual constructor
  function buildFormulaString(param, op, multiplier) {
    if (!op || !multiplier) return param;
    return `${param} ${op} ${multiplier}`;
  }
  
  // Update formula from UI
  function updateFormulaFromUI() {
    const container = $("formulaElementsList");
    if (!container) return;
    
    const newFormula = {};
    
    container.querySelectorAll('[data-element-key]').forEach(card => {
      const key = card.dataset.elementKey;
      const name = card.querySelector('.formula-element-name').value || key;
      const widthParam = card.querySelector('.formula-width-param').value;
      const widthOp = card.querySelector('.formula-width-op').value;
      const widthMultiplier = card.querySelector('.formula-width-multiplier').value.trim();
      const lengthParam = card.querySelector('.formula-length-param').value;
      const lengthOp = card.querySelector('.formula-length-op').value;
      const lengthMultiplier = card.querySelector('.formula-length-multiplier').value.trim();
      const qty = parseInt(card.querySelector('.formula-element-qty').value) || 1;
      
      // Строим формулы
      const width = buildFormulaString(widthParam, widthOp, widthMultiplier);
      const length = buildFormulaString(lengthParam, lengthOp, lengthMultiplier);
      
      newFormula[key] = {
        name,
        widthParam,
        widthOp,
        widthMultiplier,
        lengthParam,
        lengthOp,
        lengthMultiplier,
        width, // Для обратной совместимости
        length, // Для обратной совместимости
        qty
      };
    });
    
    window.currentFormula = newFormula;
    updateFormulaPreview(newFormula);
  }
  
  // Update interactive preview
  function updateInteractivePreview() {
    const preview = $("formulaInteractivePreview");
    if (!preview) return;
    
    const boxWidth = parseFloat($("previewBoxWidth")?.value || 100);
    const boxLength = parseFloat($("previewBoxLength")?.value || 100);
    const boxHeight = parseFloat($("previewBoxHeight")?.value || 100);
    const thickness = parseFloat($("previewThickness")?.value || 2);
    
    const context = { boxWidth, boxLength, boxHeight, thickness };
    const formula = window.currentFormula || {};
    
    try {
      const pieces = [];
      for (const [key, element] of Object.entries(formula)) {
        const width = evalFormula(buildFormulaString(element.widthParam || "boxWidth", element.widthOp || "", element.widthMultiplier || ""), context);
        const length = evalFormula(buildFormulaString(element.lengthParam || "boxLength", element.lengthOp || "", element.lengthMultiplier || ""), context);
        const qty = element.qty || 1;
        
        pieces.push({
          name: element.name || key,
          width: Math.round(width),
          length: Math.round(length),
          qty: Math.round(qty),
          area: width * length * qty
        });
      }
      
      if (pieces.length === 0) {
        preview.innerHTML = '<div class="hint">Добавьте элементы формулы</div>';
        return;
      }
      
      preview.innerHTML = pieces.map(p => 
        `<div style="padding:6px;background:#fff;border-radius:4px;margin-bottom:4px;border-left:3px solid var(--accent)">
          <strong>${esc(p.name)}</strong> × ${p.qty}шт<br>
          <span style="color:var(--muted);font-size:10px">${p.width}×${p.length}мм = ${p.area}мм²</span>
        </div>`
      ).join('');
      
      const totalArea = pieces.reduce((sum, p) => sum + p.area, 0);
      preview.innerHTML += `<div style="margin-top:8px;padding:8px;background:rgba(0,207,181,.1);border-radius:4px;font-weight:600;text-align:center">
        Всего: ${totalArea.toLocaleString()}мм²
      </div>`;
    } catch (e) {
      preview.innerHTML = `<div style="color:var(--bad);padding:8px">Ошибка: ${esc(e.message)}</div>`;
    }
  }
  
  // Add new formula element
  function addFormulaElement() {
    const key = `element_${Date.now()}`;
    window.currentFormula[key] = {
      name: "Новый элемент",
      widthParam: "boxWidth",
      widthOp: "",
      widthMultiplier: "",
      lengthParam: "boxLength",
      lengthOp: "",
      lengthMultiplier: "",
      qty: 1
    };
    renderFormulaElements(window.currentFormula);
    updateFormulaPreview(window.currentFormula);
    updateInteractivePreview();
  }
  
  // Update formula preview
  function updateFormulaPreview(formula) {
    const preview = $("formulaPreview");
    if (!preview) return;
    
    try {
      const previewText = JSON.stringify(formula, null, 2);
      preview.textContent = previewText;
      preview.style.color = "var(--text)";
    } catch (e) {
      preview.textContent = "Ошибка форматирования: " + e.message;
      preview.style.color = "var(--bad)";
    }
  }
  
  // Test formula
  function testFormula(formula) {
    const testParams = {
      boxWidth: 100,
      boxLength: 100,
      boxHeight: 100,
      thickness: 2
    };
    
    try {
      const pieces = [];
      for (const [type, def] of Object.entries(formula)) {
        const width = evalFormula(def.width, testParams);
        const length = evalFormula(def.length, testParams);
        const qty = evalFormula(String(def.qty || 1), testParams);
        
        pieces.push({
          type: def.name || type,
          width: Math.round(width),
          length: Math.round(length),
          qty: Math.round(qty),
          area: width * length
        });
      }
      
      const result = pieces.map(p => 
        `${p.type}: ${p.width}×${p.length}мм × ${p.qty}шт = ${p.width * p.length * p.qty}мм²`
      ).join('\n');
      
      alert(`Тест формулы (коробка 100×100×100мм, толщина 2мм):\n\n${result}`);
    } catch (e) {
      alert("Ошибка в формуле: " + e.message);
    }
  }
  
  // Eval formula (safe)
  function evalFormula(formula, context) {
    try {
      const func = new Function(...Object.keys(context), `return ${formula};`);
      return func(...Object.values(context));
    } catch (e) {
      console.error("Formula error:", e);
      throw new Error(`Ошибка в формуле "${formula}": ${e.message}`);
    }
  }
  
  // Save formula template
  async function saveFormulaTemplate(formula, templateId = null) {
    try {
      // Обновляем формулу из UI перед сохранением
      updateFormulaFromUI();
      const currentFormula = window.currentFormula || formula;
      
      const name = $("formulaTemplateName").value.trim();
      if (!name) {
        toast("Введите название шаблона");
        return;
      }
      
      const templateType = $("formulaTemplateType")?.value || "box";
      
      const templateData = {
        name,
        description: `Тип: ${templateType === "box" ? "Коробка" : templateType === "lid" ? "Крышка" : "Ложемент"}`,
        formula_json: currentFormula
      };
      
      if (templateId) {
        // Обновляем существующий шаблон
        await api(`/api/cutting/templates/${encodeURIComponent(templateId)}`, {
          method: "PUT",
          body: JSON.stringify(templateData)
        });
        toast("✅ Шаблон обновлен");
      } else {
        // Создаем новый шаблон
        await api("/api/cutting/templates", {
          method: "POST",
          body: JSON.stringify(templateData)
        });
        toast("✅ Шаблон создан");
      }
      
      // Обновляем список шаблонов
      await loadTemplates();
      
      // Выбираем сохраненный шаблон
      const templates = await api("/api/cutting/templates");
      const savedTemplate = templates.find(t => t.name === name);
      if (savedTemplate && $("cuttingTemplateSelect")) {
        $("cuttingTemplateSelect").value = savedTemplate.id;
      }
    } catch (e) {
      console.error("Save template error:", e);
      toast("Ошибка сохранения: " + (e.message || String(e)));
    }
  }
  
  // Initialize
  async function init() {
    console.log("Initializing Cutting Master module...");
    await renderCutting();
    console.log("Cutting Master module initialized");
  }
  
  // Expose functions
  window.CuttingModule = {
    loaded: true,
    renderCutting,
    calculateLayout,
    loadTemplates,
    loadSavedLayouts,
    renderMaterialSelect,
    openTemplateEditor,
    showFormulaEditorModal
  };
  
  // Expose globally for button handlers
  window.openCuttingTemplateEditor = openTemplateEditor;
  
  console.log('Cutting Master module loaded successfully');
  
  // Auto-init if cutting pane is visible
  if (document.querySelector('#cutting.pane')?.style.display !== 'none') {
    init();
  }
  
})();

/* Shared tech-card data and rectangular cutting estimates. No inventory mutations. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.TechCardModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  let sequence = 0;
  const id = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'tc-' + Date.now().toString(36) + '-' + (++sequence);
  const number = value => value === '' || value === null || value === undefined ? 0 : Number(value);
  const positive = value => Number.isFinite(number(value)) && number(value) > 0;
  const format = value => Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  function newMaterial() {
    return { id: id(), materialId: '', name: '', type: '', lengthMm: 0, widthMm: 0, thicknessMm: 0, grammage: 0,
      blankLengthMm: 0, blankWidthMm: 0, piecesPerProduct: 1, piecesPerBlank: 1, allowRotate: true,
      marginMm: 0, gapMm: 0, grain: 'any', plannedSheets: null, print: '', lamination: '', varnish: '', notes: '' };
  }
  function newOperation(name = '') {
    return { id: id(), name, machine: '', materialRowId: '', quantity: null, quantityBasis: 'production', unit: 'шт.', instructions: '', critical: '', imageUrl: '' };
  }
  function newComponent(name = 'Новая часть') { return { id: id(), name, materials: [], operations: [] }; }
  function newCard() {
    return { schemaVersion: 1, title: '', client: '', orderId: '', qtyDelivery: 100, qtyProduction: 100, dueDate: '', productSize: '', notes: '', components: [newComponent('Коробка')] };
  }
  function calculateMaterial(row, qtyProduction) {
    const warnings = [];
    const result = { blanks: null, piecesPerSheet: 0, sheets: null, plannedSheets: null, capacity: null, shortfall: null, rotated: false, rows: 0, columns: 0, utilization: 0, warnings };
    const explicit = row.plannedSheets !== '' && row.plannedSheets !== null && row.plannedSheets !== undefined;
    if (explicit && Number.isFinite(number(row.plannedSheets)) && number(row.plannedSheets) >= 0) result.plannedSheets = number(row.plannedSheets);
    if (!positive(qtyProduction) || !positive(row.piecesPerProduct) || !positive(row.piecesPerBlank)) {
      warnings.push('Укажите положительный тираж и количество деталей на изделие и заготовку.'); return result;
    }
    result.blanks = Math.ceil(number(qtyProduction) * number(row.piecesPerProduct) / number(row.piecesPerBlank));
    const dims = [row.lengthMm, row.widthMm, row.blankLengthMm, row.blankWidthMm];
    if (!dims.every(positive)) { warnings.push('Укажите формат листа и размеры заготовки для расчёта.'); return result; }
    const margin = number(row.marginMm), gap = number(row.gapMm);
    if (!Number.isFinite(margin) || !Number.isFinite(gap) || margin < 0 || gap < 0) { warnings.push('Поля и межзаготовочный зазор должны быть неотрицательными.'); return result; }
    const sheetLength = number(row.lengthMm), sheetWidth = number(row.widthMm);
    const usableLength = Math.max(0, sheetLength - 2 * margin), usableWidth = Math.max(0, sheetWidth - 2 * margin);
    function layout(length, width, rotated) {
      const columns = Math.max(0, Math.floor((usableLength + gap) / (length + gap) + 1e-10));
      const rows = Math.max(0, Math.floor((usableWidth + gap) / (width + gap) + 1e-10));
      return { columns, rows, piecesPerSheet: columns * rows, rotated };
    }
    let best = layout(number(row.blankLengthMm), number(row.blankWidthMm), false);
    // Grain-marked materials retain the entered orientation. Never silently rotate them.
    if (row.allowRotate !== false && (!row.grain || row.grain === 'any')) {
      const rotated = layout(number(row.blankWidthMm), number(row.blankLengthMm), true);
      if (rotated.piecesPerSheet > best.piecesPerSheet) best = rotated;
    }
    if (!Number.isSafeInteger(best.piecesPerSheet)) { warnings.push('Размеры дают недопустимое количество заготовок. Проверьте единицы измерения.'); return result; }
    Object.assign(result, best);
    if (!result.piecesPerSheet) { warnings.push('Заготовка не помещается на листе с заданными полями и направлением.'); return result; }
    result.sheets = Math.ceil(result.blanks / result.piecesPerSheet);
    result.utilization = result.piecesPerSheet * number(row.blankLengthMm) * number(row.blankWidthMm) / (sheetLength * sheetWidth) * 100;
    result.plannedSheets = explicit ? number(row.plannedSheets) : result.sheets;
    result.capacity = result.plannedSheets * result.piecesPerSheet;
    result.shortfall = Math.max(0, result.blanks - result.capacity);
    if (result.shortfall) warnings.push('Недостаточно листов: ' + format(result.plannedSheets) + ' дают ' + format(result.capacity) + ' заготовок, требуется ' + format(result.blanks) + '. Расчётный минимум — ' + format(result.sheets) + ' листов.');
    return result;
  }
  function calculate(card) {
    const warnings = [], components = []; let totalSheets = 0, totalOperations = 0;
    for (const component of card.components || []) {
      const materials = (component.materials || []).map(row => {
        const calc = calculateMaterial(row, card.qtyProduction);
        if (calc.plannedSheets !== null && Number.isFinite(calc.plannedSheets)) totalSheets += calc.plannedSheets;
        calc.warnings.forEach(w => warnings.push(component.name + ' / ' + (row.name || 'Материал') + ': ' + w));
        return Object.assign({ id: row.id }, calc);
      });
      totalOperations += (component.operations || []).length;
      components.push({ id: component.id, materials });
    }
    return { components, totalSheets, totalOperations, warnings };
  }
  function operationQuantity(card, component, operation) {
    const basis = operation.quantityBasis || (operation.quantity != null ? 'manual' : 'production');
    if (basis === 'manual') return positive(operation.quantity) ? number(operation.quantity) : null;
    if (basis === 'production') return positive(card.qtyProduction) ? number(card.qtyProduction) : null;
    const row = (component.materials || []).find(m => m.id === operation.materialRowId);
    if (!row) return null;
    const calc = calculateMaterial(row, card.qtyProduction);
    return basis === 'blanks' ? calc.blanks : calc.plannedSheets;
  }
  function safeImage(url) {
    return !url || /^\/tech-card-assets\/maib-\d{2}\.png$/.test(url) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url);
  }
  function validate(card) {
    const errors = [], warnings = [];
    if (!card || typeof card !== 'object' || Array.isArray(card)) return { errors: ['Техкарта должна быть объектом.'], warnings };
    const textField = (value, label, max = 2000) => { if (value != null && (typeof value !== 'string' || value.length > max)) errors.push(label + ': слишком длинное или некорректное значение.'); };
    const numeric = (value, label, min, max, integer = false, optional = false) => {
      if (optional && (value === null || value === undefined || value === '')) return;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) errors.push(label + ': укажите ' + (integer ? 'целое ' : '') + 'число от ' + min + ' до ' + max + '.');
    };
    if (card.schemaVersion !== 1) errors.push('Неподдерживаемая версия техкарты.');
    if (typeof card.title !== 'string' || !card.title.trim()) errors.push('Укажите название техкарты.');
    ['title', 'client', 'orderId', 'dueDate', 'productSize'].forEach(k => textField(card[k], k, 300)); textField(card.notes, 'Примечание', 10000);
    numeric(card.qtyDelivery, 'Тираж клиенту', 1, 10000000, true); numeric(card.qtyProduction, 'Тираж в работу', 1, 10000000, true);
    if (card.qtyProduction < card.qtyDelivery) errors.push('Тираж в работу не может быть меньше тиража клиенту.');
    if (!card.client) warnings.push('Не указан клиент.');
    if (!Array.isArray(card.components) || card.components.length > 30) return { errors: errors.concat('Допустимо не более 30 частей изделия.'), warnings };
    if (!card.components.length) warnings.push('Добавьте части изделия.');
    const ids = new Set(); let totalOperations = 0, totalMaterials = 0;
    function checkId(value) { if (typeof value !== 'string' || !value || value.length > 100 || ids.has(value)) errors.push('Идентификаторы частей, материалов и операций должны быть уникальными.'); else ids.add(value); }
    for (const c of card.components) {
      if (!c || typeof c !== 'object') { errors.push('Некорректная часть изделия.'); continue; }
      checkId(c.id); textField(c.name, 'Название части', 200);
      if (!c.name) warnings.push('Укажите название части изделия.');
      if (!Array.isArray(c.materials) || !Array.isArray(c.operations)) { errors.push('Материалы и операции должны быть списками.'); continue; }
      totalMaterials += c.materials.length; totalOperations += c.operations.length;
      if (!c.materials.length) warnings.push((c.name || 'Часть') + ': не добавлены материалы.');
      if (!c.operations.length) warnings.push((c.name || 'Часть') + ': не добавлены операции.');
      for (const m of c.materials) {
        if (!m || typeof m !== 'object') { errors.push('Некорректная строка материала.'); continue; }
        checkId(m.id);
        ['materialId', 'name', 'type', 'print', 'lamination', 'varnish'].forEach(k => textField(m[k], k, 300)); textField(m.notes, 'Примечание материала', 3000);
        ['lengthMm', 'widthMm', 'blankLengthMm', 'blankWidthMm', 'thicknessMm', 'grammage', 'marginMm', 'gapMm'].forEach(k => numeric(m[k], (m.name || 'Материал') + ' / ' + k, 0, 100000));
        ['lengthMm', 'widthMm', 'blankLengthMm', 'blankWidthMm', 'thicknessMm'].forEach(k => { if (m[k] > 0 && m[k] < 0.001) errors.push('Ненулевые размеры должны быть не меньше 0,001 мм.'); });
        numeric(m.piecesPerProduct, 'Деталей на изделие', 1, 10000, true); numeric(m.piecesPerBlank, 'Деталей из заготовки', 1, 10000, true);
        numeric(m.plannedSheets, 'Листов в работу', 0, 100000000, true, true);
        if (typeof m.allowRotate !== 'boolean') errors.push('Поворот заготовки должен быть разрешён или запрещён.');
        if (!['any', 'length', 'width'].includes(m.grain)) errors.push('Некорректное направление волокна.');
        if (!m.name) warnings.push(c.name + ': укажите название материала.');
      }
      for (const op of c.operations) {
        if (!op || typeof op !== 'object') { errors.push('Некорректная операция.'); continue; }
        checkId(op.id);
        ['name', 'machine', 'materialRowId', 'unit'].forEach(k => textField(op[k], k, 300));
        ['instructions', 'critical'].forEach(k => textField(op[k], k, 10000));
        numeric(op.quantity, 'Количество операции', 0.001, 100000000, false, true);
        if (op.quantityBasis && !['production', 'blanks', 'sheets', 'manual'].includes(op.quantityBasis)) errors.push('Неизвестный способ расчёта объёма операции.');
        if (op.quantityBasis === 'manual' && !positive(op.quantity)) errors.push('Укажите количество для ручного объёма операции.');
        if (['blanks', 'sheets'].includes(op.quantityBasis) && !op.materialRowId) warnings.push(c.name + ': выберите материал для расчёта объёма операции.');
        if (op.materialRowId && !c.materials.some(m => m && m.id === op.materialRowId)) errors.push('Операция ссылается на отсутствующий материал своей части.');
        if (!op.name || !op.instructions) warnings.push(c.name + ': заполните название и инструкцию операции.');
        if (op.imageUrl && (typeof op.imageUrl !== 'string' || op.imageUrl.length > 500000 || !safeImage(op.imageUrl))) errors.push('Иллюстрация должна быть PNG, JPEG или WebP размером до 350 КБ.');
      }
    }
    if (totalMaterials > 150 || totalOperations > 100) errors.push('В техкарте допускается до 150 материалов и 100 операций.');
    if (!errors.length) warnings.push(...calculate(card).warnings);
    return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
  }
  return { newCard, newComponent, newMaterial, newOperation, calculateMaterial, calculate, validate, safeImage, format, operationQuantity };
});

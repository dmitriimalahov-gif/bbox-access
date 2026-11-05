/* Printable production sheets. All document values are escaped. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tech-card-model'));
  else root.TechCardPrint = factory(root.TechCardModel);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fmt = value => value == null ? 'Уточнить' : M.format(value);
  const size = (length, width) => length > 0 && width > 0 ? fmt(length) + ' × ' + fmt(width) + ' мм' : 'Формат уточнить';
  const lines = value => esc(value).replace(/\n/g, '<br>');
  function materialLabel(m) {
    const compact = String(m.name || '').toLowerCase().replace(/\s/g, '').replace(/,/g, '.');
    const specs = [];
    if (m.thicknessMm && !compact.includes(String(m.thicknessMm) + 'мм')) specs.push(fmt(m.thicknessMm) + ' мм');
    if (m.grammage && !compact.includes(String(m.grammage) + 'г')) specs.push(fmt(m.grammage) + ' г/м²');
    return esc(m.name || 'Материал не выбран') + (specs.length ? ' (' + specs.join(', ') + ')' : '');
  }
  function header(card, subtitle) {
    return `<header><div class="brand">B’BOX <span>Производство</span></div><div class="sheet-kind">${esc(subtitle)}</div></header>
      <h1>${esc(card.title || 'Техкарта')}</h1><div class="identity"><span>Клиент <b>${esc(card.client || 'Уточнить')}</b></span><span>Заказ <b>${esc(card.orderId || '—')}</b></span><span>Срок <b>${esc(card.dueDate || 'Уточнить')}</b></span></div>
      <div class="quantities"><div>Клиенту<strong>${fmt(card.qtyDelivery)} <small>шт.</small></strong></div><div>В работу<strong>${fmt(card.qtyProduction)} <small>шт.</small></strong></div><div>Запас<strong>${fmt(card.qtyProduction - card.qtyDelivery)} <small>шт.</small></strong></div></div>`;
  }
  function footer(label) { return `<footer><span>${esc(label)}</span><span>Технолог __________________ &nbsp; Дата __________</span></footer>`; }
  function materialSummary(card) {
    const rows = [];
    (card.components || []).forEach(c => (c.materials || []).forEach(m => {
      const calc = M.calculateMaterial(m, card.qtyProduction);
      rows.push(`<tr><td><b>${esc(c.name)}</b><br>${materialLabel(m)}</td><td>${size(m.lengthMm, m.widthMm)}<br><small>Заготовка ${size(m.blankLengthMm, m.blankWidthMm)}</small></td><td>${fmt(calc.blanks)}</td><td>${calc.piecesPerSheet || '—'}</td><td>${fmt(calc.sheets)}</td><td>${m.plannedSheets == null ? fmt(calc.plannedSheets) : fmt(m.plannedSheets)}${calc.shortfall ? '<br><b class="danger">Не хватает</b>' : ''}</td></tr>`);
    }));
    return `<table><thead><tr><th>Часть и материал</th><th>Формат</th><th>Заготовок</th><th>С листа</th><th>Мин. листов</th><th>В работу</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="6">Материалы не добавлены</td></tr>'}</tbody></table>`;
  }
  function renderHTML(card, privateImages = {}) {
    const validation = M.validate(card), calculation = M.calculate(card);
    const warnings = [...validation.errors, ...validation.warnings];
    const overview = `<section class="sheet overview">${header(card, 'Технологическая карта · сводка')}
      ${card.productSize ? '<p>Готовое изделие: <b>' + esc(card.productSize) + '</b></p>' : ''}
      <h2>Потребность в материалах</h2>${materialSummary(card)}
      <p class="method">Расчёт прямоугольных заготовок с учётом полей, зазора и разрешённого поворота. Это оценка потребности: фигурный раскрой, приладка и технологические потери требуют проверки. Одинаковые материалы разных частей показаны отдельно.</p>
      <div class="signature"><span>Подготовил __________________</span><span>Проверил __________________</span></div>${footer('Сводка материалов')}</section>`;
    const review = `<section class="sheet review">${header(card, 'Проверка перед выдачей')}
      <h2>Замечания технологу</h2>${warnings.length ? '<ul class="warnings">' + warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '<p>Автоматическая проверка заполнения пройдена. Проверьте технологию и утвердите карту.</p>'}
      ${card.notes ? '<h2>Примечания</h2><p class="paragraph">' + lines(card.notes) + '</p>' : ''}
      <h2>Маршрут</h2><div class="route">${(card.components || []).map(c => '<div><b>' + esc(c.name) + '</b><p>' + c.operations.map(o => esc(o.name || 'Операция')).join(' → ') + '</p></div>').join('')}</div>
      <p class="method">Иллюстрации служат наглядными инструкциями. Для резки и высечки необходимы утверждённые файлы макетов и штанцев.</p>${footer('Проверка и согласование')}</section>`;
    let position = 0;
    const operations = (card.components || []).map(c => (c.operations || []).map((op, i) => {
      position++;
      const m = c.materials.find(row => row.id === op.materialRowId);
      const qty = M.operationQuantity(card, c, op);
      const imageSource = privateImages[op.imageUrl] || op.imageUrl;
      const image = op.imageUrl && M.safeImage(op.imageUrl) ? `<figure><img src="${esc(imageSource)}" alt="Иллюстрация операции ${esc(op.name)}"><figcaption>Иллюстрация к операции. Размеры сверять с утверждённым макетом.</figcaption></figure>` : '<div class="drawing-empty">Место для схемы / утверждённого образца</div>';
      return `<section class="sheet operation">${header(card, 'Задание ' + position + ' из ' + calculation.totalOperations)}
        <div class="op-heading"><div><p class="component">${esc(c.name)} · шаг ${i + 1}</p><h2>${esc(op.name || 'Название операции')}</h2></div><div class="op-volume"><strong>${fmt(qty)}</strong><span>${esc(op.unit || 'шт.')}</span></div></div>
        <dl><div><dt>Оборудование</dt><dd>${esc(op.machine || 'Указать при выдаче')}</dd></div>${m ? `<div><dt>Материал</dt><dd>${materialLabel(m)}</dd></div><div><dt>Заготовка</dt><dd>${size(m.blankLengthMm, m.blankWidthMm)}</dd></div><div><dt>Исходный лист</dt><dd>${size(m.lengthMm, m.widthMm)}</dd></div>` : ''}</dl>
        ${m && (m.print || m.lamination || m.varnish) ? `<div class="finish">${[['Печать', m.print], ['Ламинация', m.lamination], ['Лак', m.varnish]].filter(x => x[1]).map(x => '<span><b>' + x[0] + ':</b> ' + esc(x[1]) + '</span>').join('')}</div>` : ''}
        <div class="instructions">${lines(op.instructions || 'Инструкция не заполнена — уточнить у технолога.')}</div>
        ${op.critical ? '<div class="critical"><b>Обратить внимание</b><br>' + lines(op.critical) + '</div>' : ''}
        ${m && m.notes ? '<p class="material-note">' + lines(m.notes) + '</p>' : ''}
        ${image}
        <div class="control"><span>Принято ________</span><span>Готово ________</span><span>Брак ________</span><span>Исполнитель ______________</span></div>
        ${footer('Операция ' + position + ' / ' + calculation.totalOperations)}</section>`;
    }).join('')).join('');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(card.title)} · Техкарта</title><style>
      *{box-sizing:border-box}body{margin:0;background:#e8efec;color:#172d28;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.45}.toolbar{position:sticky;top:0;z-index:2;padding:14px 22px;background:#fff;border-bottom:1px solid #ccd9d4;display:flex;align-items:center;gap:18px}.toolbar button{background:#007a66;color:white;border:0;padding:12px 22px;border-radius:7px;font:inherit;cursor:pointer}.toolbar span{font-size:13px}.sheet{width:210mm;min-height:297mm;background:#fff;margin:22px auto;padding:13mm 15mm;position:relative;display:flex;flex-direction:column}.sheet header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #008775;padding-bottom:12px}.brand{font-size:20px;font-weight:800}.brand span{font-size:12px;font-weight:400;margin-left:8px;color:#547067}.sheet-kind{font-size:12px;color:#47645a}h1{font-size:26px;line-height:1.17;margin:24px 0 13px;overflow-wrap:anywhere}h2{font-size:20px;line-height:1.25;margin:18px 0 12px}.identity{display:flex;gap:24px;flex-wrap:wrap;font-size:12px;color:#486058}.identity b{color:#172d28;margin-left:4px}.quantities{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #d3e0da;border-radius:8px;margin:18px 0 6px}.quantities>div{padding:10px 16px;font-size:12px;color:#476158}.quantities>div+div{border-left:1px solid #d3e0da}.quantities strong{display:block;font-size:27px;color:#172d28;line-height:1.2}.quantities small{font-weight:400;font-size:13px}table{border-collapse:collapse;width:100%;font-size:11px}th{text-align:left;background:#edf5f1;padding:8px 5px;border-bottom:1px solid #a9c4b8}td{vertical-align:top;padding:8px 5px;border-bottom:1px solid #d9e4df}td small{font-size:10px;color:#50695e}.method{font-size:11px;color:#536c60;margin-top:17px}.signature{display:flex;justify-content:space-between;margin-top:25px;font-size:12px}footer{display:flex;justify-content:space-between;font-size:10px;color:#567063;border-top:1px solid #d4dfda;padding-top:12px;margin-top:auto;gap:12px}.overview footer,.review footer{margin-top:auto}.warnings{padding:0;list-style:none;margin:8px 0 18px}.warnings li{padding:10px 12px;background:#fff7e9;border-left:3px solid #bb841b;margin-bottom:7px;font-size:12px;overflow-wrap:anywhere}.danger{color:#a33125}.paragraph{font-size:12px;overflow-wrap:anywhere}.route{font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:16px}.route p{margin:5px 0}.op-heading{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-top:17px}.component{font-size:13px;color:#007963;margin:0}.op-heading h2{font-size:27px;margin:5px 0 15px}.op-volume{text-align:right;flex-shrink:0}.op-volume strong{display:block;font-size:34px;line-height:1.1}.op-volume span{font-size:12px}dl{display:grid;grid-template-columns:1fr 1fr;gap:7px 20px;margin:0 0 14px}dl div{border-bottom:1px solid #dce5e0;padding-bottom:5px}dt{font-size:10px;color:#567164}dd{margin:2px 0;font-size:13px;font-weight:600;overflow-wrap:anywhere}.instructions{font-size:18px;line-height:1.5;margin:8px 0 14px;overflow-wrap:anywhere}.critical{border-left:4px solid #b16d13;background:#fff5e4;padding:10px 14px;font-size:14px;overflow-wrap:anywhere}.finish{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;padding:9px;background:#eff6f3}.material-note{font-size:11px;color:#5b7067;margin:10px 0;overflow-wrap:anywhere}figure{margin:12px 0;flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:0}figure img{display:block;max-width:100%;max-height:76mm;object-fit:contain}figcaption{font-size:9px;color:#6b7b72;margin-top:5px}.drawing-empty{height:60mm;border:1px dashed #ccd9d2;color:#7c8d83;display:grid;place-items:center;margin:16px 0;font-size:12px}.control{display:flex;justify-content:space-between;gap:8px;margin:14px 0 18px;font-size:11px}.operation{break-before:page}.operation footer{margin-top:0}@media screen and (max-width:800px){.sheet{width:100%;padding:24px;margin:12px 0}.toolbar{flex-wrap:wrap}.route{grid-template-columns:1fr}}@page{size:A4;margin:0}@media print{html,body{background:white}.toolbar{display:none}.sheet{width:210mm;min-height:297mm;margin:0;padding:13mm 15mm;break-after:page;box-shadow:none}.sheet:last-child{break-after:auto}.sheet header, .quantities, .op-heading, dl, .critical, figure, tr,.control,footer{break-inside:avoid}thead{display:table-header-group}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style></head><body><nav class="toolbar"><button type="button" onclick="window.print()">Печать / сохранить PDF</button><span>${warnings.length ? 'Есть замечания — проверьте второй лист перед выдачей.' : 'Проверьте и подпишите техкарту перед выдачей.'}</span></nav>${overview}${review}${operations}</body></html>`;
  }
  async function open(card) {
    const win = window.open('', '_blank');
    if (!win) throw new Error('Разрешите всплывающее окно для предпросмотра техкарты.');
    win.opener = null;
    win.document.body.textContent = 'Подготавливаем техкарту и иллюстрации…';
    try {
      const privateImages = {};
      if (window.PagesClient?.enabled) {
        const urls = [...new Set(card.components.flatMap(c => c.operations.map(op => op.imageUrl)).filter(url => url?.startsWith('/tech-card-assets/') && M.safeImage(url)))];
        await Promise.all(urls.map(async url => { privateImages[url] = await window.PagesClient.privateUrl(url); }));
      }
      if (win.closed) return win;
      win.document.open(); win.document.write(renderHTML(card, privateImages)); win.document.close();
    } catch (error) { win.close(); throw error; }
    return win;
  }
  return { renderHTML, open };
});

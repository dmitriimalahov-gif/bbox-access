/* B'BOX technical cards: isolated editor using the shared material and order catalog. */
(function () {
  'use strict';
  const emptyState = () => ({ root: null, bootstrap: null, cards: [], card: null, id: null, version: null, tab: 'product', componentId: null, dirty: false, saving: false, loading: false, initialized: false, message: '', messageType: '', catalogDirty: false, ownerKey: null });
  const S = emptyState();
  let lifecycle = 0, eventController;
  const requests = new Set();
  const sessionEnded = error => error?.name === 'AbortError' || error?.name === 'TechCardSessionEnded';
  const staleSession = () => Object.assign(new Error('Сеанс изменился.'), { name: 'TechCardSessionEnded' });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = value => value === '' || value == null ? null : Number(value);
  const fmt = value => Number.isFinite(Number(value)) && value != null ? Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : '—';
  const model = () => window.TechCardModel;
  const component = () => S.card.components.find(c => c.id === S.componentId) || S.card.components[0];
  const attr = (name, value) => ` ${name}="${esc(value)}"`;
  const accountKey = () => { const user = window.currentUser; const id = user?.userId || user?.username; return user?.role === 'admin' && id ? `bbox-techcard-draft:${id}` : null; };
  const draftKey = () => S.ownerKey;
  let draftTimer;
  async function api(path = '', options = {}) {
    const generation = lifecycle;
    const controller = new AbortController(); requests.add(controller);
    try {
      const url = `/api/tech-cards${path}`;
      const data = !options.method && (path === '/bootstrap' || path === '')
        ? await window.CatalogState.read(url, { signal: controller.signal })
        : await window.ApiClient.request(url, { ...options, signal: controller.signal });
      if (generation !== lifecycle) throw staleSession();
      return data;
    } finally { requests.delete(controller); }
  }
  function reset() {
    // Bind the draft to the account that opened it, even when auth is changing.
    persistDraft(); clearTimeout(draftTimer); draftTimer = null;
    lifecycle++;
    eventController?.abort(); eventController = null;
    requests.forEach(controller => controller.abort()); requests.clear();
    if (S.root) { S.root.querySelectorAll('dialog').forEach(dialog => { if (dialog.open) dialog.close(); }); S.root.replaceChildren(); }
    Object.assign(S, emptyState());
  }
  function persistDraft() {
    if (!S.dirty || !S.card || !S.ownerKey) return;
    try { localStorage.setItem(draftKey(), JSON.stringify({ id: S.id, version: S.version, card: S.card })); } catch (_) { /* beforeunload still protects the in-memory draft when browser storage is full */ }
  }
  function changed() {
    S.dirty = true;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(persistDraft, 300);
    updateSummary();
    updateStatus();
  }
  function updateStatus() {
    if (!S.root) return;
    const status = S.root.querySelector('[data-save-status]');
    if (status) { status.textContent = S.saving ? 'Сохраняем…' : S.dirty ? 'Есть несохранённые изменения' : S.id ? `Сохранено · версия ${S.version}` : 'Новое техническое задание'; status.classList.toggle('tc-unsaved', S.dirty); }
    S.root.querySelectorAll('[data-action="save"], [data-action="save-copy"]').forEach(button => { button.disabled = S.saving; });
  }
  function message(text, type = 'error') {
    S.message = text; S.messageType = type;
    const box = S.root?.querySelector('[data-message]');
    if (box) { box.textContent = text; box.className = `tc-message ${type === 'error' ? 'tc-error' : 'tc-success'}`; box.hidden = !text; }
  }
  function confirmDiscard() { return !S.dirty || window.confirm('В этом ТЗ есть несохранённые изменения. Продолжить без сохранения?'); }
  function input(label, key, value, options = {}) {
    const { scope = 'card', type = 'text', placeholder = '', hint = '', list = '', min, step, wide = false } = options;
    return `<label class="tc-field${wide ? ' tc-span-2' : ''}"><span>${esc(label)}</span><input type="${esc(type)}" data-scope="${esc(scope)}" data-field="${esc(key)}" value="${esc(value)}"${attr('placeholder', placeholder)}${list ? attr('list', list) : ''}${min !== undefined ? attr('min', min) : ''}${step !== undefined ? attr('step', step) : ''}>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  }
  function area(label, key, value, scope = 'card', placeholder = '') {
    return `<label class="tc-field tc-span-2"><span>${esc(label)}</span><textarea data-scope="${esc(scope)}" data-field="${esc(key)}" rows="3" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
  }
  function select(label, key, value, items, scope = 'card', hint = '') {
    return `<label class="tc-field"><span>${esc(label)}</span><select data-scope="${esc(scope)}" data-field="${esc(key)}">${items.map(item => `<option value="${esc(item.value)}"${String(item.value ?? '') === String(value ?? '') ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}</select>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  }
  const units = [{ value: 'шт.', label: 'шт.' }, { value: 'лист', label: 'лист' }, { value: 'компл.', label: 'компл.' }, { value: 'м', label: 'м' }];
  function imageURL(url) {
    if (!model().safeImage(url)) return '';
    return url?.startsWith('/tech-card-assets/') && window.PagesClient?.enabled
      ? window.PagesClient.cachedPrivateUrl(url) || '' : url || '';
  }
  async function prepareImages(card) {
    if (!window.PagesClient?.enabled) return;
    const urls = [...new Set(card.components.flatMap(c => c.operations.map(op => op.imageUrl)).filter(url => url?.startsWith('/tech-card-assets/') && model().safeImage(url)))];
    await Promise.all(urls.map(url => window.PagesClient.privateUrl(url)));
  }
  function ensureCard(card) {
    if (!Array.isArray(card.components)) card.components = [];
    if (!card.components.length) card.components.push(model().newComponent());
    card.components.forEach(c => { c.materials ||= []; c.operations ||= []; });
    return card;
  }
  function render() {
    if (!S.card) return;
    const openOperations = Array.from(S.root.querySelectorAll('[data-operation]')).filter(d => d.open).map(d => d.dataset.operation);
    const hadOperations = S.root.querySelector('[data-operation]');
    const current = component();
    if (current) S.componentId = current.id;
    S.root.innerHTML = `<div class="tc-shell">
      <div class="tc-heading"><div><h1>Технические задания</h1><p>От материала до готовой коробки — в одной карте производства.</p></div><div class="tc-actions"><button class="tc-button" data-action="catalog">Сырьё и отделка</button><button class="tc-button" data-action="example">Пример MAIB</button><button class="tc-button tc-primary" data-action="new">+ Новое ТЗ</button></div></div>
      <div class="tc-library"><label for="tc-saved">Мои задания <span>${S.cards.length}</span></label><select id="tc-saved" data-action="open-card"><option value="">Открыть сохранённое задание…</option>${S.cards.map(c => `<option value="${esc(c.id)}"${String(c.id) === String(S.id) ? ' selected' : ''}>${esc(c.title || c.card?.title || 'Без названия')}${c.client ? ` — ${esc(c.client)}` : ''}</option>`).join('')}</select><span data-save-status></span></div>
      <div class="tc-message" data-message role="status"${S.message ? '' : ' hidden'}></div>
      <div class="tc-workspace"><main class="tc-editor"><div class="tc-tabs" role="tablist" aria-label="Разделы технического задания">${[['product', 'Изделие'], ['materials', 'Материалы'], ['operations', 'Операции']].map(([key, title], i) => `<button id="tc-tab-${key}" class="tc-tab${S.tab === key ? ' is-active' : ''}" data-action="tab" data-tab="${key}" role="tab" aria-controls="tc-panel" aria-selected="${S.tab === key}"><span>${i + 1}</span>${title}</button>`).join('')}</div>
      <div id="tc-panel" role="tabpanel" aria-labelledby="tc-tab-${S.tab}">${S.tab === 'product' ? productHTML() : `${componentBar()}${S.tab === 'materials' ? materialsHTML(current) : operationsHTML(current)}`}</div></main><aside class="tc-summary" aria-label="Сводка технического задания" data-summary></aside></div>
      <datalist id="tc-operation-list">${(S.bootstrap.operations || []).map(o => `<option value="${esc(o.name)}"></option>`).join('')}</datalist><datalist id="tc-machine-list">${(S.bootstrap.machines || []).map(o => `<option value="${esc(o.name)}"></option>`).join('')}</datalist>${['print', 'lamination', 'varnish'].map(k => `<datalist id="tc-finish-${k}">${(S.bootstrap.finishes?.[k] || []).map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>`).join('')}
    </div>`;
    if (hadOperations) S.root.querySelectorAll('[data-operation]').forEach(d => { d.open = openOperations.includes(d.dataset.operation); });
    updateSummary(); updateStatus(); message(S.message, S.messageType);
  }
  function productHTML() {
    return `<div class="tc-section"><div class="tc-section-title"><div><h2>Что производим</h2><p>Тираж для клиента и запуск в производство можно задать отдельно.</p></div><span class="tc-sheet-symbol" aria-hidden="true">▱</span></div><div class="tc-form-grid">
      ${input('Название изделия', 'title', S.card.title, { placeholder: 'Коробка для свечи MAIB', wide: true })}
      ${input('Клиент', 'client', S.card.client, { placeholder: 'Название компании' })}
      ${select('Связанный заказ', 'orderId', S.card.orderId, [{ value: '', label: 'Без привязки к заказу' }, ...(S.bootstrap.orders || []).map(o => ({ value: o.id, label: `${o.id} — ${o.client || ''} · ${o.product || ''}` }))], 'card', 'Выбор заполнит клиента и тираж; данные можно изменить.')}
      ${input('Тираж для клиента, шт.', 'qtyDelivery', S.card.qtyDelivery, { type: 'number', min: 1, step: 1 })}
      ${input('Запуск в производство, шт.', 'qtyProduction', S.card.qtyProduction, { type: 'number', min: 1, step: 1, hint: 'С учётом вашего запаса на наладку и брак.' })}
      ${input('Размер готового изделия, мм', 'productSize', S.card.productSize, { placeholder: 'Длина × ширина × высота' })}
      ${input('Срок готовности', 'dueDate', S.card.dueDate, { type: 'date' })}
      ${area('Общие требования', 'notes', S.card.notes, 'card', 'Цвет, образец, упаковка, требования к качеству…')}
      </div></div><div class="tc-section tc-components-section"><div class="tc-section-title"><div><h2>Состав изделия</h2><p>У каждого элемента свои материалы и последовательность операций.</p></div><button class="tc-button tc-small" data-action="add-component">+ Элемент</button></div><div class="tc-component-list">${S.card.components.map((c, index) => `<div class="tc-component-row" data-component="${esc(c.id)}"><span class="tc-component-number">${index + 1}</span><label class="tc-field"><span class="tc-sr-only">Название элемента ${index + 1}</span><input data-scope="component" data-field="name" value="${esc(c.name)}" placeholder="Например, крышка или донышко"></label><span class="tc-muted">${c.materials.length} мат. / ${c.operations.length} оп.</span><button class="tc-button tc-small" data-action="component-materials" data-id="${esc(c.id)}">Материалы</button><button class="tc-icon-button tc-danger" data-action="delete-component" data-id="${esc(c.id)}" aria-label="Удалить элемент ${esc(c.name)}"${S.card.components.length < 2 ? ' disabled' : ''}>×</button></div>`).join('')}</div><button class="tc-button tc-primary tc-next" data-action="tab" data-tab="materials">Перейти к материалам →</button></div>`;
  }
  function componentBar() {
    return `<div class="tc-component-switch"><span>Элемент изделия</span><div class="tc-component-buttons">${S.card.components.map(c => `<button class="tc-component-pill${c.id === S.componentId ? ' is-active' : ''}" data-action="select-component" data-id="${esc(c.id)}">${esc(c.name || 'Без названия')}</button>`).join('')}<button class="tc-component-pill tc-add" data-action="add-component" aria-label="Добавить элемент изделия">+</button></div></div>`;
  }
  function materialsHTML(c) {
    return `<div class="tc-section"><div class="tc-section-title"><div><h2>Материалы · ${esc(c.name || 'Элемент')}</h2><p>Выберите сырьё, задайте заготовку и отделку. Все размеры в миллиметрах.</p></div><button class="tc-button tc-small" data-action="add-material">+ Материал</button></div>${c.materials.length ? c.materials.map((row, i) => materialHTML(row, i)).join('') : '<div class="tc-empty"><div class="tc-empty-drawing" aria-hidden="true">▱</div><h3>Из чего сделан этот элемент?</h3><p>Добавьте картон, бумагу или другой материал.<br>Характеристики подставятся из вашей сырьевой базы.</p><button class="tc-button tc-primary" data-action="add-material">+ Добавить материал</button></div>'}<div class="tc-note">Расчёт раскладки — предварительный, для прямоугольных заготовок. Направление волокон, припуски, фигурный крой и технологический запас проверяет технолог.</div>${c.materials.length ? '<button class="tc-button tc-primary tc-next" data-action="tab" data-tab="operations">Перейти к операциям →</button>' : ''}</div>`;
  }
  function materialHTML(row, index) {
    const scope = `material:${row.id}`;
    const types = (S.bootstrap.materialTypes || []).map(t => ({ value: t.name, label: t.name }));
    if (row.type && !types.some(t => t.value === row.type)) types.push({ value: row.type, label: row.type });
    const stockOptions = [{ value: '', label: 'Разовый материал / ввести вручную' }, ...(S.bootstrap.materials || []).map(m => ({ value: m.id, label: `${m.name}${m.length_mm && m.width_mm ? ` · ${m.length_mm} × ${m.width_mm} мм` : ''}` }))];
    if (row.materialId && !stockOptions.some(m => String(m.value) === String(row.materialId))) stockOptions.push({ value: row.materialId, label: `${row.name} (из сохранённой карты)` });
    return `<article class="tc-material" data-row="${esc(row.id)}"><div class="tc-item-head"><span class="tc-material-index">${index + 1}</span><h3 data-material-title>${esc(row.name || 'Новый материал')}</h3><button class="tc-icon-button tc-danger" data-action="delete-material" data-id="${esc(row.id)}" aria-label="Удалить материал">×</button></div><div class="tc-form-grid">
      <div class="tc-span-2">${select('Материал из сырьевой базы', 'materialId', row.materialId, stockOptions, scope, 'Параметры сохраняются в этой карте. Изменение справочника не меняет уже созданные ТЗ.')}</div>
      ${input('Название материала', 'name', row.name, { scope })}${select('Вид материала', 'type', row.type, [{ value: '', label: 'Не указан' }, ...types], scope)}
      <fieldset class="tc-fieldset tc-span-2"><legend>Исходный лист</legend><div class="tc-grid-4">${input('Длина, мм', 'lengthMm', row.lengthMm, { scope, type: 'number', min: 0, step: 'any' })}${input('Ширина, мм', 'widthMm', row.widthMm, { scope, type: 'number', min: 0, step: 'any' })}${input('Толщина, мм', 'thicknessMm', row.thicknessMm, { scope, type: 'number', min: 0, step: 'any' })}${input('Плотность, г/м²', 'grammage', row.grammage, { scope, type: 'number', min: 0, step: 'any' })}</div></fieldset>
      <fieldset class="tc-fieldset tc-span-2"><legend>Заготовка и раскладка</legend><div class="tc-grid-4">${input('Длина, мм', 'blankLengthMm', row.blankLengthMm, { scope, type: 'number', min: 0, step: 'any' })}${input('Ширина, мм', 'blankWidthMm', row.blankWidthMm, { scope, type: 'number', min: 0, step: 'any' })}${input('Деталей на изделие', 'piecesPerProduct', row.piecesPerProduct, { scope, type: 'number', min: 1, step: 1 })}${input('Деталей из заготовки', 'piecesPerBlank', row.piecesPerBlank, { scope, type: 'number', min: 1, step: 1 })}</div><div class="tc-grid-4 tc-space-top">${input('Поля листа, мм', 'marginMm', row.marginMm, { scope, type: 'number', min: 0, step: 'any' })}${input('Зазор реза, мм', 'gapMm', row.gapMm, { scope, type: 'number', min: 0, step: 'any' })}${select('Сохранять направление', 'grain', row.grain, [{ value: 'any', label: 'Не ограничено' }, { value: 'length', label: 'По длине' }, { value: 'width', label: 'По ширине' }], scope, 'При заданном направлении поворот отключён.')}${input('Выдать листов', 'plannedSheets', row.plannedSheets, { scope, type: 'number', min: 0, step: 1, placeholder: 'По расчёту', hint: 'Можно указать запас вручную.' })}</div><label class="tc-check"><input type="checkbox" data-scope="${esc(scope)}" data-field="allowRotate"${row.allowRotate ? ' checked' : ''}> Разрешить поворот заготовки при раскладке</label></fieldset>
      <div class="tc-material-result tc-span-2" data-material-result="${esc(row.id)}"></div>
      <fieldset class="tc-fieldset tc-span-2"><legend>Печать и отделка</legend><div class="tc-grid-3">${input('Печать', 'print', row.print, { scope, list: 'tc-finish-print', placeholder: 'Выберите или впишите' })}${input('Ламинация', 'lamination', row.lamination, { scope, list: 'tc-finish-lamination', placeholder: 'Выберите или впишите' })}${input('Лак', 'varnish', row.varnish, { scope, list: 'tc-finish-varnish', placeholder: 'Выберите или впишите' })}</div></fieldset>
      ${area('Примечание к материалу', 'notes', row.notes, scope, 'Лицевая сторона, направление, образец цвета…')}</div></article>`;
  }
  function operationsHTML(c) {
    return `<div class="tc-section"><div class="tc-section-title"><div><h2>Маршрут · ${esc(c.name || 'Элемент')}</h2><p>Порядок операций станет порядком рабочих карточек при печати.</p></div><button class="tc-button tc-small" data-action="add-operation">+ Операция</button></div>${c.operations.length ? `<div class="tc-operation-list">${c.operations.map((op, i) => operationHTML(op, i, c)).join('')}</div><button class="tc-button tc-wide" data-action="add-operation">+ Добавить следующую операцию</button>` : '<div class="tc-empty"><div class="tc-empty-drawing" aria-hidden="true">↳</div><h3>Как изготовить этот элемент?</h3><p>Добавьте резку, печать, ламинацию, сборку.<br>Для каждого этапа можно приложить схему и контроль качества.</p><button class="tc-button tc-primary" data-action="add-operation">+ Первая операция</button></div>'}</div>`;
  }
  function operationHTML(op, index, c) {
    const scope = `operation:${op.id}`;
    const src = imageURL(op.imageUrl);
    const basis = op.quantityBasis || (op.quantity != null ? 'manual' : 'production');
    return `<details class="tc-operation" data-operation="${esc(op.id)}"${index < 2 ? ' open' : ''}><summary><span class="tc-route-number">${index + 1}</span><span><strong data-operation-title>${esc(op.name || 'Новая операция')}</strong><small>${esc(op.machine || 'Оборудование не указано')}</small></span><span class="tc-expand" aria-hidden="true">⌄</span></summary><div class="tc-operation-body"><div class="tc-operation-tools"><button class="tc-button tc-small" data-action="move-up" data-id="${esc(op.id)}"${index === 0 ? ' disabled' : ''}>↑ Выше</button><button class="tc-button tc-small" data-action="move-down" data-id="${esc(op.id)}"${index === c.operations.length - 1 ? ' disabled' : ''}>↓ Ниже</button><button class="tc-button tc-small tc-danger" data-action="delete-operation" data-id="${esc(op.id)}">Удалить</button></div><div class="tc-form-grid">
      ${input('Название операции', 'name', op.name, { scope, list: 'tc-operation-list', placeholder: 'Например, резка картона' })}${input('Оборудование', 'machine', op.machine, { scope, list: 'tc-machine-list', placeholder: 'Выберите или впишите' })}
      ${select('Материал операции', 'materialRowId', op.materialRowId, [{ value: '', label: 'Весь элемент / несколько материалов' }, ...c.materials.map(m => ({ value: m.id, label: m.name || 'Без названия' }))], scope)}
      ${select('Объём операции', 'quantityBasis', basis, [{ value: 'production', label: 'Весь тираж в производство' }, { value: 'blanks', label: 'Заготовки материала' }, { value: 'sheets', label: 'Листы материала к выдаче' }, { value: 'manual', label: 'Указать вручную' }], scope)}
      <div class="tc-quantity-unit">${basis === 'manual' ? input('Количество вручную', 'quantity', op.quantity, { scope, type: 'number', min: 0.001, step: 'any' }) : `<div class="tc-field"><span>Расчётное количество</span><output class="tc-operation-quantity" data-operation-quantity="${esc(op.id)}">${fmt(model().operationQuantity(S.card, c, op))}</output></div>`}${select('Единица', 'unit', op.unit, units.some(u => u.value === op.unit) ? units : [...units, { value: op.unit, label: op.unit }], scope)}</div>
      ${area('Задание оператору', 'instructions', op.instructions, scope, 'Размеры, настройки, порядок действий…')}${area('Контроль качества', 'critical', op.critical, scope, 'На что обратить особое внимание, что проверить перед тиражом…')}
      <div class="tc-attachment tc-span-2">${src ? `<img src="${esc(src)}" alt="Схема операции ${esc(op.name)}"><div><strong>Схема приложена</strong><p>${src.startsWith('/tech-card-assets/') ? 'Иллюстрация из образца MAIB. При изменении параметров замените схему.' : 'Появится в рабочей карточке операции.'}</p><button class="tc-button tc-small" data-action="remove-image" data-id="${esc(op.id)}">Удалить схему</button></div>` : `<div><strong>Схема или образец</strong><p>PNG, JPG или WebP, до 300 КБ на изображение.</p><label class="tc-button tc-small tc-file-label">Прикрепить изображение<input type="file" data-action="attach-image" data-id="${esc(op.id)}" accept="image/png,image/jpeg,image/webp"></label></div>`}</div></div></div></details>`;
  }
  function updateSummary() {
    if (!S.card || !S.root) return;
    let calc, validation;
    try { calc = model().calculate(S.card); validation = model().validate(S.card); } catch (_) { return; }
    const errors = validation.errors || [];
    const warnings = [...new Set([...(validation.warnings || []), ...(calc.warnings || [])].map(w => typeof w === 'string' ? w : w.message || String(w)))];
    const target = S.root.querySelector('[data-summary]');
    if (target) target.innerHTML = `<div class="tc-summary-top"><span class="tc-document-mark" aria-hidden="true">▤</span><div><h2>Производственная карта</h2><p>${S.id ? `Версия ${esc(S.version)}` : 'Черновик'}</p></div></div><h3 class="tc-summary-title">${esc(S.card.title || 'Новое изделие')}</h3><p class="tc-summary-client">${esc(S.card.client || 'Укажите клиента')}</p><div class="tc-tirage"><div><span>Клиенту</span><strong>${fmt(S.card.qtyDelivery)}<small> шт.</small></strong></div><div><span>В производство</span><strong>${fmt(S.card.qtyProduction)}<small> шт.</small></strong></div></div><dl class="tc-summary-facts"><div><dt>Элементов изделия</dt><dd>${S.card.components.length}</dd></div><div><dt>Материалов</dt><dd>${S.card.components.reduce((sum, c) => sum + c.materials.length, 0)}</dd></div><div><dt>Операций</dt><dd>${fmt(calc.totalOperations ?? S.card.components.reduce((sum, c) => sum + c.operations.length, 0))}</dd></div><div><dt>Листов к выдаче (известно)</dt><dd>${fmt(calc.totalSheets)}</dd></div>${S.card.dueDate ? `<div><dt>Срок готовности</dt><dd>${esc(S.card.dueDate.split('-').reverse().join('.'))}</dd></div>` : ''}</dl><div class="tc-summary-actions"><button class="tc-button tc-primary tc-wide" data-action="save"${S.saving ? ' disabled' : ''}>${S.saving ? 'Сохраняем…' : 'Сохранить ТЗ'}</button><button class="tc-button tc-wide" data-action="preview">Просмотр и печать / PDF</button>${S.id ? '<button class="tc-text-button" data-action="save-copy">Сохранить отдельную копию</button>' : ''}</div>${errors.length || warnings.length ? `<div class="tc-review-box"><strong>${errors.length ? 'Нужно заполнить' : 'Проверить перед выпуском'}</strong><ul>${errors.map(e => `<li class="tc-error-text">${esc(typeof e === 'string' ? e : e.message || String(e))}</li>`).join('')}${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '<div class="tc-ready">Основные данные заполнены. Перед выпуском проверьте ТЗ с технологом.</div>'}<p class="tc-summary-footnote">Сохранение ТЗ не запускает заказ и не списывает сырьё со склада.</p>`;
    S.root.querySelectorAll('[data-operation-quantity]').forEach(box => { const c = S.card.components.find(c => c.operations.some(o => o.id === box.dataset.operationQuantity)); const op = c?.operations.find(o => o.id === box.dataset.operationQuantity); if (op) box.textContent = fmt(model().operationQuantity(S.card, c, op)); });
    S.root.querySelectorAll('[data-material-result]').forEach(box => {
      const row = S.card.components.flatMap(c => c.materials).find(m => m.id === box.dataset.materialResult);
      if (!row) return;
      const result = model().calculateMaterial(row, S.card.qtyProduction);
      box.innerHTML = `<div><span>Заготовок нужно</span><strong>${fmt(result.blanks)}</strong></div><div><span>С одного листа</span><strong>${fmt(result.piecesPerSheet)}</strong></div><div><span>Листов по расчёту</span><strong>${fmt(result.sheets)}</strong></div><div><span>Листов к выдаче</span><strong>${fmt(result.plannedSheets)}</strong></div>${result.shortfall > 0 ? `<p class="tc-error-text">Не хватает ${fmt(result.shortfall)} заготовок. Увеличьте количество листов.</p>` : ''}${result.rotated ? '<p>Раскладка с поворотом заготовки на 90°.</p>' : ''}`;
    });
  }
  function resolveField(element) {
    const scope = element.dataset.scope;
    if (scope === 'card') return S.card;
    if (scope === 'component') return S.card.components.find(c => c.id === element.closest('[data-component]')?.dataset.component);
    const [type, id] = (scope || '').split(':');
    return S.card.components.flatMap(c => type === 'material' ? c.materials : c.operations).find(r => r.id === id);
  }
  function onInput(event) {
    const field = event.target.closest('[data-field][data-scope]');
    if (!field || field.closest('dialog') || (event.type === 'input' && (field.tagName === 'SELECT' || field.type === 'checkbox'))) return;
    const target = resolveField(field);
    if (!target) return;
    let value = field.type === 'checkbox' ? field.checked : field.type === 'number' ? num(field.value) : field.value;
    if (value === null && ['lengthMm', 'widthMm', 'blankLengthMm', 'blankWidthMm', 'thicknessMm', 'grammage', 'marginMm', 'gapMm'].includes(field.dataset.field)) value = 0;
    if (field.dataset.field === 'materialId') {
      const stock = S.bootstrap.materials.find(m => String(m.id) === String(value));
      target.materialId = stock ? String(stock.id) : '';
      if (stock) Object.assign(target, { name: stock.name, type: stock.type_name || stock.type || stock.material_type_name || S.bootstrap.materialTypes.find(t => String(t.id) === String(stock.material_type_id))?.name || '', lengthMm: Number(stock.length_mm) || 0, widthMm: Number(stock.width_mm) || 0, thicknessMm: Number(stock.thickness_mm) || 0, grammage: Number(stock.grammage) || 0, grain: stock.grain || 'any' });
      changed(); render(); return;
    }
    if (field.dataset.field === 'orderId') {
      const order = S.bootstrap.orders.find(o => String(o.id) === String(value));
      S.card.orderId = value || null;
      if (order) { S.card.client = order.client || ''; S.card.qtyDelivery = order.qty || S.card.qtyDelivery; S.card.qtyProduction = order.qty || S.card.qtyProduction; if (!S.card.title) S.card.title = order.product || ''; }
      changed(); render(); return;
    }
    if (field.type === 'number' && value === null && field.dataset.scope.startsWith('material:') && field.dataset.field !== 'plannedSheets') value = 0;
    target[field.dataset.field] = value;
    if (field.dataset.field === 'quantityBasis') { if (value !== 'manual') target.quantity = null; changed(); render(); return; }
    if (field.dataset.field === 'name') {
      const heading = field.closest('[data-row]')?.querySelector('[data-material-title]') || field.closest('[data-operation]')?.querySelector('[data-operation-title]');
      if (heading) heading.textContent = value || 'Без названия';
    }
    changed();
  }
  async function reloadList() { const data = await api(); S.cards = Array.isArray(data) ? data : data.cards || []; }
  async function save(copy = false) {
    if (S.saving) return;
    const validation = model().validate(S.card);
    if (validation.errors?.length) { message('Заполните обязательные поля, отмеченные в сводке справа. Черновик остаётся в этом браузере.'); persistDraft(); return; }
    const generation = lifecycle;
    S.saving = true; updateStatus();
    try {
      const cardSnapshot = JSON.parse(JSON.stringify(S.card));
      const before = JSON.stringify(S.card);
      const data = await api(S.id && !copy ? `/${encodeURIComponent(S.id)}` : '', { method: S.id && !copy ? 'PUT' : 'POST', body: JSON.stringify(S.id && !copy ? { version: S.version, card: cardSnapshot } : { card: cardSnapshot }) });
      if (generation !== lifecycle) return;
      S.id = data.id; S.version = data.version;
      S.dirty = JSON.stringify(S.card) !== before;
      if (S.dirty) persistDraft(); else { clearTimeout(draftTimer); try { localStorage.removeItem(draftKey()); } catch (_) {} }
      message(copy ? 'Копия технического задания сохранена.' : 'Техническое задание сохранено.', 'success');
      try { await reloadList(); } catch (error) { if (sessionEnded(error)) return; message('ТЗ сохранено. Список заданий обновится при следующем открытии.', 'success'); }
      render();
    } catch (error) { if (generation === lifecycle && !sessionEnded(error)) { message(error.message); persistDraft(); } }
    finally { if (generation === lifecycle) { S.saving = false; updateStatus(); updateSummary(); } }
  }
  async function openCard(id) {
    if (!id || !confirmDiscard() || S.loading || S.saving) { render(); return; }
    const generation = lifecycle;
    S.loading = true;
    S.root.querySelectorAll('input, select, textarea, button').forEach(control => { control.disabled = true; });
    try { const data = await api(`/${encodeURIComponent(id)}`); if (generation !== lifecycle) return; await prepareImages(data.card); if (generation !== lifecycle) return; S.card = ensureCard(data.card); S.id = data.id; S.version = data.version; S.componentId = S.card.components[0].id; S.dirty = false; S.message = ''; clearTimeout(draftTimer); try { localStorage.removeItem(draftKey()); } catch (_) {} render(); }
    catch (error) { if (generation === lifecycle && !sessionEnded(error)) message(error.message); }
    finally { if (generation === lifecycle) { S.loading = false; render(); } }
  }
  async function create(example = false) {
    if (S.loading || S.saving || !confirmDiscard()) return;
    const generation = lifecycle;
    S.loading = true;
    try {
      const card = example ? (await api('/example')).card : model().newCard();
      await prepareImages(card);
      if (generation !== lifecycle) return;
      S.card = ensureCard(card); S.id = null; S.version = null; S.componentId = S.card.components[0].id; S.tab = 'product';
      S.message = example ? 'Пример MAIB загружен как новый черновик. Проверьте материалы, запас и технологические требования перед выпуском.' : '';
      S.messageType = 'success'; changed(); render();
    } catch (error) { if (generation === lifecycle && !sessionEnded(error)) message(error.message); }
    finally { if (generation === lifecycle) S.loading = false; }
  }
  async function onClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || button.closest('dialog')) return;
    const action = button.dataset.action, id = button.dataset.id, current = component();
    if (S.loading || S.saving && !['tab', 'select-component', 'preview'].includes(action)) return;
    switch (action) {
      case 'tab': S.tab = button.dataset.tab; render(); break;
      case 'select-component': S.componentId = id; render(); break;
      case 'component-materials': S.componentId = id; S.tab = 'materials'; render(); break;
      case 'new': await create(); break;
      case 'example': await create(true); break;
      case 'save': await save(); break;
      case 'save-copy': await save(true); break;
      case 'preview': try { await window.TechCardPrint.open(S.card); } catch (error) { message(error.message); } break;
      case 'catalog': openCatalog(); break;
      case 'add-component': { const c = model().newComponent(`Элемент ${S.card.components.length + 1}`); S.card.components.push(c); S.componentId = c.id; changed(); render(); break; }
      case 'delete-component': if (S.card.components.length > 1 && window.confirm('Удалить элемент вместе с его материалами и операциями?')) { S.card.components = S.card.components.filter(c => c.id !== id); changed(); render(); } break;
      case 'add-material': current.materials.push(model().newMaterial()); changed(); render(); S.root.querySelector('[data-row]:last-of-type input')?.focus(); break;
      case 'delete-material': if (window.confirm('Удалить материал из этого ТЗ? Связанные операции останутся без привязки к материалу.')) { current.materials = current.materials.filter(m => m.id !== id); current.operations.forEach(op => { if (op.materialRowId === id) op.materialRowId = ''; }); changed(); render(); } break;
      case 'add-operation': { const op = model().newOperation(); current.operations.push(op); changed(); render(); const details = Array.from(S.root.querySelectorAll('[data-operation]')).find(d => d.dataset.operation === op.id); if (details) { details.open = true; details.querySelector('input')?.focus(); } break; }
      case 'delete-operation': if (window.confirm('Удалить эту операцию?')) { current.operations = current.operations.filter(o => o.id !== id); changed(); render(); } break;
      case 'move-up': case 'move-down': { const index = current.operations.findIndex(o => o.id === id), next = index + (action === 'move-up' ? -1 : 1); if (next >= 0 && next < current.operations.length) { [current.operations[index], current.operations[next]] = [current.operations[next], current.operations[index]]; changed(); render(); } break; }
      case 'remove-image': { const op = current.operations.find(o => o.id === id); if (op) { op.imageUrl = ''; changed(); render(); } break; }
    }
  }
  async function attachImage(inputElement) {
    const file = inputElement.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 300 * 1024) { message('Выберите PNG, JPG или WebP размером до 300 КБ.'); inputElement.value = ''; return; }
    const card = S.card, generation = lifecycle;
    const operationId = inputElement.dataset.id;
    try {
      const dataURL = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Не удалось прочитать изображение.')); reader.readAsDataURL(file); });
      await new Promise((resolve, reject) => { const img = new Image(); img.onload = resolve; img.onerror = () => reject(new Error('Файл не удалось открыть как изображение.')); img.src = dataURL; });
      if (S.card !== card || generation !== lifecycle) return;
      const op = S.card.components.flatMap(c => c.operations).find(o => o.id === operationId);
      if (op) { const before = op.imageUrl; op.imageUrl = dataURL; if (new TextEncoder().encode(JSON.stringify(S.card)).length > 1500000) { op.imageUrl = before; throw new Error('Общий размер ТЗ превышает 1,5 МБ. Уменьшите изображения или удалите лишние схемы.'); } changed(); render(); }
    } catch (error) { if (generation === lifecycle) message(error.message); }
  }
  function openCatalog() {
    if (S.root.querySelector('dialog')) return;
    const generation = lifecycle;
    const dialog = document.createElement('dialog'); dialog.className = 'tc-dialog'; dialog.setAttribute('aria-labelledby', 'tc-catalog-title');
    dialog.innerHTML = `<div class="tc-dialog-head"><div><h2 id="tc-catalog-title">Сырьё и отделка</h2><p>Общая база материалов B’BOX. Характеристики можно уточнить здесь.</p></div><button class="tc-icon-button" data-catalog="close" aria-label="Закрыть справочник">×</button></div><div class="tc-dialog-body"><div class="tc-message" data-catalog-message role="status" hidden></div><div class="tc-catalog-layout"><div><label class="tc-field"><span>Материал в базе</span><select data-catalog="select"><option value="">+ Новый материал</option>${S.bootstrap.materials.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></label><div data-catalog-editor></div></div><section class="tc-finishes"><h3>Варианты отделки</h3><p>Один вариант на строку. В ТЗ также можно вписать своё значение.</p>${[['print', 'Печать'], ['lamination', 'Ламинация'], ['varnish', 'Лак']].map(([key, label]) => `<label class="tc-field"><span>${label}</span><textarea data-finish="${key}" rows="4">${esc((S.bootstrap.finishes?.[key] || []).join('\n'))}</textarea></label>`).join('')}<button class="tc-button" data-catalog="save-finishes">Сохранить варианты отделки</button></section></div></div>`;
    S.root.appendChild(dialog); let materialId = null, materialDirty = false, finishDirty = false, busy = false;
    const editor = dialog.querySelector('[data-catalog-editor]');
    function renderEditor(m = {}) {
      editor.innerHTML = `<div class="tc-form-grid tc-space-top">${input('Название', 'name', m.name, { scope: 'catalog', wide: true })}${select('Вид материала', 'material_type_id', m.material_type_id, [{ value: '', label: 'Не указан' }, ...S.bootstrap.materialTypes.map(t => ({ value: t.id, label: t.name }))], 'catalog')}${input('Единица учёта', 'unit', m.unit || 'лист', { scope: 'catalog' })}${input('Длина листа, мм', 'length_mm', m.length_mm, { scope: 'catalog', type: 'number', min: 0, step: 'any' })}${input('Ширина листа, мм', 'width_mm', m.width_mm, { scope: 'catalog', type: 'number', min: 0, step: 'any' })}${input('Толщина, мм', 'thickness_mm', m.thickness_mm, { scope: 'catalog', type: 'number', min: 0, step: 'any' })}${input('Плотность, г/м²', 'grammage', m.grammage, { scope: 'catalog', type: 'number', min: 0, step: 'any' })}${select('Направление волокон', 'grain', m.grain || 'any', [{ value: 'any', label: 'Не указано' }, { value: 'length', label: 'Вдоль длины' }, { value: 'width', label: 'Вдоль ширины' }], 'catalog')}</div><p class="tc-note">Сохранение обновит общий справочник. Материалы в уже созданных картах сохранят свои параметры.</p><button class="tc-button tc-primary" data-catalog="save-material">${materialId ? 'Сохранить материал' : 'Добавить в базу'}</button>`;
    }
    renderEditor();
    function notice(text, error = false) { const box = dialog.querySelector('[data-catalog-message]'); box.textContent = text; box.hidden = false; box.className = `tc-message ${error ? 'tc-error' : 'tc-success'}`; }
    function close() { if (busy) return; if ((materialDirty || finishDirty) && !window.confirm('Закрыть справочник без сохранения изменений?')) return; dialog.close(); dialog.remove(); S.catalogDirty = false; render(); }
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('input', event => { if (event.target.matches('[data-finish]')) finishDirty = true; else if (event.target.closest('[data-catalog-editor]')) materialDirty = true; S.catalogDirty = materialDirty || finishDirty; });
    dialog.addEventListener('change', event => {
      if (event.target.dataset.catalog !== 'select') return;
      if (materialDirty && !window.confirm('Открыть другой материал без сохранения изменений?')) { event.target.value = materialId || ''; return; }
      materialId = event.target.value || null; materialDirty = false; S.catalogDirty = finishDirty; renderEditor(S.bootstrap.materials.find(m => String(m.id) === String(materialId)) || {});
    });
    dialog.addEventListener('click', async event => {
      const action = event.target.closest('button[data-catalog]')?.dataset.catalog;
      if (!action || busy) return;
      if (action === 'close') { close(); return; }
      busy = true; dialog.querySelectorAll('button, input, select, textarea').forEach(b => b.disabled = true);
      try {
        if (action === 'save-finishes') {
          const finishes = {}; dialog.querySelectorAll('[data-finish]').forEach(el => { finishes[el.dataset.finish] = [...new Set(el.value.split('\n').map(v => v.trim()).filter(Boolean))]; });
          await api('/finishes', { method: 'PUT', body: JSON.stringify(finishes) });
          if (generation !== lifecycle) return;
          S.bootstrap.finishes = finishes; finishDirty = false; notice('Варианты отделки сохранены.');
        } else if (action === 'save-material') {
          const value = {}; editor.querySelectorAll('[data-field]').forEach(el => { value[el.dataset.field] = el.type === 'number' ? Number(el.value || 0) : el.value.trim(); });
          value.material_type_id = value.material_type_id || null;
          if (!value.name) throw new Error('Укажите название материала.');
          const snapshot = JSON.stringify(value);
          const result = await api(materialId ? `/materials/${encodeURIComponent(materialId)}` : '/materials', { method: materialId ? 'PUT' : 'POST', body: snapshot });
          // The write response is authoritative. Never make a committed create
          // depend on a later refresh, which could make a retry create a duplicate.
          if (generation !== lifecycle) return;
          const savedMaterial = result.material || result;
          materialId = savedMaterial.id;
          S.bootstrap.materials = S.bootstrap.materials.filter(m => String(m.id) !== String(materialId));
          S.bootstrap.materials.push(savedMaterial);
          S.bootstrap.materials.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
          materialDirty = false;
          const selector = dialog.querySelector('[data-catalog="select"]'); selector.innerHTML = `<option value="">+ Новый материал</option>${S.bootstrap.materials.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}`; selector.value = materialId || ''; renderEditor(savedMaterial || value); notice('Материал сохранён в общей сырьевой базе.');
        }
        S.catalogDirty = materialDirty || finishDirty;
      } catch (error) { if (generation === lifecycle && !sessionEnded(error)) notice(error.message, true); }
      finally { busy = false; dialog.querySelectorAll('button, input, select, textarea').forEach(b => b.disabled = false); }
    });
    dialog.showModal();
  }
  // Catalog refresh never applies catalog values to the versioned card snapshot.
  async function refreshCatalog() {
    const generation = lifecycle;
    try {
      const [bootstrap, list] = await Promise.all([api('/bootstrap'), api()]);
      if (generation !== lifecycle) return;
      S.bootstrap = bootstrap; S.cards = Array.isArray(list) ? list : list.cards || [];
      // An open catalog dialog may itself contain unsaved edits.
      if (!S.root.querySelector('dialog')) render();
    } catch (error) {
      if (generation === lifecycle && !sessionEnded(error)) message('Не удалось обновить справочник. Черновик сохранён: ' + error.message);
    }
  }
  async function init() {
    const ownerKey = accountKey();
    if (S.ownerKey && S.ownerKey !== ownerKey) reset();
    if (!ownerKey) return;
    S.ownerKey = ownerKey;
    const generation = lifecycle;
    S.root = document.getElementById('techcards');
    if (!S.root || S.loading) return;
    if (S.initialized) return refreshCatalog();
    S.loading = true; S.root.innerHTML = '<div class="tc-loading" role="status">Загружаем материалы и технические задания…</div>';
    try {
      const [bootstrap, list] = await Promise.all([api('/bootstrap'), api()]);
      if (generation !== lifecycle) return;
      S.bootstrap = bootstrap; S.cards = Array.isArray(list) ? list : list.cards || [];
      S.card = ensureCard(model().newCard());
      try { const draft = JSON.parse(localStorage.getItem(draftKey())); if (draft?.card?.schemaVersion === 1 && Array.isArray(draft.card.components)) { S.card = ensureCard(draft.card); S.id = draft.id; S.version = draft.version; S.dirty = true; S.message = 'Восстановлен несохранённый черновик из этого браузера.'; S.messageType = 'success'; } } catch (_) {}
      await prepareImages(S.card);
      if (generation !== lifecycle) return;
      S.componentId = S.card.components[0].id;
      eventController?.abort(); eventController = new AbortController();
      const listenerOptions = { signal: eventController.signal };
      S.root.addEventListener('click', onClick, listenerOptions);
      S.root.addEventListener('keydown', event => {
        if (!event.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const tabs = ['product', 'materials', 'operations']; let index = tabs.indexOf(S.tab);
        index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
        S.tab = tabs[index]; render(); S.root.querySelector(`#tc-tab-${S.tab}`)?.focus();
      }, listenerOptions);
      S.root.addEventListener('input', onInput, listenerOptions);
      S.root.addEventListener('change', event => { if (event.target.matches('select[data-field], input[type="checkbox"][data-field]')) onInput(event); if (event.target.dataset.action === 'open-card') openCard(event.target.value); if (event.target.dataset.action === 'attach-image') attachImage(event.target); }, listenerOptions);
      window.addEventListener('beforeunload', event => { if (S.dirty || S.catalogDirty) { persistDraft(); event.preventDefault(); event.returnValue = ''; } }, listenerOptions);
      S.initialized = true; render();
    } catch (error) {
      if (generation !== lifecycle || sessionEnded(error)) return;
      S.root.innerHTML = `<div class="tc-loading"><h2>Не удалось открыть технические задания</h2><p>${esc(error.message)}</p><button class="tc-button tc-primary" id="tc-retry">Повторить загрузку</button></div>`; S.root.querySelector('#tc-retry').onclick = init;
    } finally { if (generation === lifecycle) S.loading = false; }
  }
  window.TechCardsModule = { init, reset, refreshCatalog };
})();

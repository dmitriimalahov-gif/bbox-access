/* Finance: recorded ledger and current-rate estimates are separate views. */
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = (value, currency = 'EUR') => value == null ? 'Не определено' : `${Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${esc(currency)}`;
  const actorKey = () => JSON.stringify(window.currentUser || null);
  const isAdmin = () => window.currentUser?.role === 'admin';
  const api = async (url, options = {}) => {
    if (window.api) return window.api(url, options);
    const response = await (window.PagesClient?.request || fetch)(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    const body = await response.json();
    if (!response.ok || body.ok === false) throw new Error(body.message || body.error || 'Ошибка запроса');
    return body.data ?? body;
  };
  const table = (headers, rows) => `<div style="overflow:auto"><table class="table" style="width:100%"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">Записей нет</td></tr>`}</tbody></table></div>`;
  const field = (name, label, value = '', type = 'text', extra = '') => `<label style="display:grid;gap:4px;min-width:140px">${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const rowForm = inner => `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">${inner}</div>`;
  const totals = groups => groups?.length ? groups.map(group => `<strong>${money(group.total, group.currency)}</strong> (${group.count} записей)`).join(' · ') : 'Записей в журнале нет';
  const reasons = { operator_missing: 'Не назначен оператор', product_template_missing: 'Не задан шаблон изделия', template_rates_missing: 'Нет таблицы тарифов', operation_rates_missing: 'Не найден тариф операции', zero_or_nonpositive_amount: 'Нулевая или отрицательная расчётная сумма' };
  const labelEstimate = value => value?.total == null ? `<span>${esc(reasons[value?.reason] || 'Недостаточно данных')}</span>` : money(value.total, value.currency);
  let generation = 0;
  let salaryRows = [];
  const state = { currentView: 'transactions', offset: 0, query: {}, activeOrder: '' };
  const pane = () => document.getElementById('finance');
  const message = text => { const element = document.getElementById('financeMessage'); if (element) { element.textContent = text; element.hidden = false; } };

  async function render(view) {
    if (view) state.currentView = view;
    if (!isAdmin() && ['order-cost', 'machines'].includes(state.currentView)) state.currentView = 'transactions';
    const root = pane();
    if (!root) return;
    const run = ++generation, owner = actorKey();
    const tabs = [['transactions', 'Начислено по журналу'], ['earnings', 'Итоги и расчёты'], ['salaries', isAdmin() ? 'Ставки операторов' : 'Моя ставка']];
    if (isAdmin()) tabs.push(['order-cost', 'Расчёт себестоимости'], ['machines', 'Ставки оборудования']);
    root.innerHTML = `<nav style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">${tabs.map(([key, label]) => `<button class="btn ${state.currentView === key ? 'accent' : 'ghost'}" data-finance-view="${key}">${label}</button>`).join('')}</nav>
      <div id="financeMessage" class="card" role="status" hidden style="padding:12px;margin-bottom:12px"></div><div id="financeContent">Загрузка…</div>`;
    root.onclick = onClick;
    root.onsubmit = onSubmit;
    try {
      const html = await ({ transactions: transactionsView, earnings: earningsView, salaries: salariesView, 'order-cost': costView, machines: machinesView })[state.currentView]();
      if (run !== generation || owner !== actorKey()) return;
      document.getElementById('financeContent').innerHTML = html;
    } catch (error) { if (run === generation && owner === actorKey()) message(error.message); }
  }
  async function transactionsView() {
    const query = new URLSearchParams(Object.entries(state.query).filter(([, value]) => value));
    const [rows, stats] = await Promise.all([api(`/api/finance/transactions?${query}&limit=50&offset=${state.offset}`), api(`/api/finance/stats?${query}`)]);
    const filter = `<form data-finance-form="filter">${rowForm(`${isAdmin() ? field('operator_name', 'Оператор', state.query.operator_name) : ''}${field('start_date', 'С даты', state.query.start_date, 'date')}${field('end_date', 'По дату', state.query.end_date, 'date')}${field('currency', 'Валюта', state.query.currency, 'text', 'maxlength="3"')}<button class="btn">Показать</button>`)}</form>`;
    const records = table(['Дата', 'Оператор / тип', 'Сумма по журналу', 'Компоненты', 'Основание'], rows.map(row => [
      esc(row.created_at), `${esc(row.operator_name || 'Без оператора')}<br><small>${esc(row.transaction_type)}</small>`, money(row.total_amount, row.currency),
      `Наладка ${money(row.setup_cost, row.currency)}<br>Работа ${money(row.operation_cost, row.currency)}<br>Брак ${money(row.scrap_cost, row.currency)}<br>Бонусы ${money(Number(row.bonus_setup || 0) + Number(row.bonus_operation || 0), row.currency)}`,
      `<details><summary>${esc(row.reason || 'Запись')}</summary><div>ID: ${esc(row.id)}<br>Заказ: ${esc(row.order_id)}<br>Изделие: ${esc(row.order_item_id)}<br>Операция: ${esc(row.op_id)}<br>${esc(row.notes)}</div>${isAdmin() ? `<button class="btn ghost" data-finance-delete="${esc(row.id)}">Удалить эту запись</button>` : ''}</details>`
    ]));
    return `<div class="card" style="padding:16px"><h3>Начислено по журналу</h3><p>Это записанные начисления и корректировки, не подтверждение выплаты денег. Знак суммы берётся из записи; тип не меняет его. Валюты показаны отдельно.</p>${filter}<p>${totals(stats.totals_by_currency)}</p>${records}<div style="display:flex;gap:8px;margin-top:12px"><button class="btn ghost" data-finance-page="prev" ${state.offset === 0 ? 'disabled' : ''}>Назад</button><span>${state.offset + 1}–${state.offset + rows.length} из ${stats.total_transactions}</span><button class="btn ghost" data-finance-page="next" ${state.offset + rows.length >= stats.total_transactions ? 'disabled' : ''}>Далее</button></div></div>${isAdmin() ? manualForm() : ''}`;
  }
  function manualForm() {
    return `<details class="card" style="padding:16px;margin-top:16px"><summary>Добавить ручную запись</summary><p>Для уменьшения итога укажите отрицательную сумму. Исторические операции не оплачиваются автоматически. Запись можно связать с операцией для последующей сверки.</p>
      <form data-finance-form="manual" data-request-key="${esc(crypto.randomUUID())}">${rowForm(`${field('operator_name', 'Оператор')}${field('total_amount', 'Сумма со знаком', '', 'number', 'step="0.01" required')}${field('currency', 'Валюта', 'EUR', 'text', 'maxlength="3" required')}<label>Назначение<select name="transaction_type"><option value="manual">Ручная запись / сверка</option><option value="operation_earnings">Подтверждённое начисление за операцию</option><option value="adjustment">Корректировка</option></select></label>${field('op_id', 'ID операции (необязательно)')}${field('reason', 'Основание', '', 'text', 'required')}`)}
      <details style="margin:12px 0"><summary>Компоненты суммы и комментарий</summary>${rowForm(['setup_cost', 'operation_cost', 'scrap_cost', 'bonus_setup', 'bonus_operation'].map((name, i) => field(name, ['Наладка', 'Работа', 'Брак', 'Бонус наладки', 'Бонус работы'][i], 0, 'number', 'step="0.01"')).join(''))}<p>Итог берётся из поля «Сумма со знаком»; компоненты могут быть неполной расшифровкой.</p>${field('notes', 'Комментарий')}</details><button class="btn accent">Записать в журнал</button></form></details>`;
  }
  async function orderChoices() {
    if (isAdmin()) return api('/api/orders');
    const ops = await api('/api/ops');
    return [...new Set(ops.map(op => op.order_id).filter(Boolean))].map(id => ({ id }));
  }
  function orderForm(orders, kind) {
    return `<form data-finance-form="${kind}">${rowForm(`<label>Заказ<select name="order_id" required><option value="">Выберите заказ</option>${orders.map(order => `<option value="${esc(order.id)}" ${state.activeOrder === order.id ? 'selected' : ''}>${esc(order.id)} ${esc(order.client || '')}</option>`).join('')}</select></label><button class="btn">Показать</button>`)}</form><div id="financeOrderResult"></div>`;
  }
  async function earningsView() {
    const [rows, orders] = await Promise.all([api('/api/finance/earnings'), orderChoices()]);
    return `<div class="card" style="padding:16px"><h3>Итоги журнала по операторам и валютам</h3><p>Источник — финансовые записи, включая отрицательные корректировки. Расчётные тарифы на эти итоги не влияют.</p>${table(['Оператор', 'Валюта', 'Итог', 'Наладка', 'Работа', 'Бонусы', 'Брак', 'Записей'], rows.map(row => [esc(row.operator_name), esc(row.currency), money(row.total_earned, row.currency), money(row.total_setup_earned, row.currency), money(row.total_operation_earned, row.currency), money(row.total_bonus_earned, row.currency), money(row.total_scrap_cost, row.currency), row.transaction_count]))}</div><div class="card" style="padding:16px;margin-top:16px"><h3>Заказ: расчёт и начисления</h3>${orderForm(orders, 'order-earnings')}</div>`;
  }
  async function loadOrderEarnings(id, element, owner) {
    const report = await api(`/api/finance/orders/${encodeURIComponent(id)}/earnings`);
    if (owner !== actorKey() || !element.isConnected) return;
    element.innerHTML = `<p><strong>Начислено по журналу:</strong> ${totals(report.totals_by_currency)}</p><p>Расчёты ниже используют текущие тарифы в EUR. Они не являются задолженностью, выплатой или исторически начисленной суммой. Брак остаётся положительным слагаемым исходной формулы.</p>${table(['Операция', 'Состояние / количество', 'План по текущим тарифам', 'Факт по текущим тарифам', 'Начислено по журналу'], report.earnings.map(row => [
      `${esc(row.no)}. ${esc(row.op_name)}<br><small>${esc(row.op_id)} · ${esc(row.operator)}</small>`, `${esc(row.status)}<br>План ${row.qty_plan} / факт ${row.qty_done} / брак ${row.qty_scrap}`, labelEstimate(row.estimated), labelEstimate(row.current_rate_calculation), `${totals(row.actual.totals_by_currency)}<br><small>${row.actual.transaction_ids.map(esc).join('<br>')}</small>`
    ]))}${report.unmatched_ledger.length ? `<p>Записи вне отображённых операций: ${report.unmatched_ledger.map(row => `${esc(row.id)} (${money(row.total_amount, row.currency)})`).join('; ')}. Они входят в итог журнала.</p>` : ''}`;
  }
  async function costView() {
    return `<div class="card" style="padding:16px"><h3>Расчёт себестоимости по текущим тарифам</h3><p>Оценка включает плановый BOM, оборудование и ставки. Это не фактические списания, не финансовый журнал и не выплата.</p>${orderForm(await orderChoices(), 'order-cost')}</div>`;
  }
  async function loadCost(id, element, owner) {
    const report = await api(`/api/finance/orders/${encodeURIComponent(id)}/cost`);
    if (owner !== actorKey() || !element.isConnected) return;
    element.innerHTML = `<h4>${report.coverage === 'partial' ? 'Неполный расчёт: только известные составляющие' : 'Расчёт по текущим данным'}</h4><p>По фактическим количествам и длительности: ${money(report.total_cost)}. План: ${money(report.estimated_total_cost)}.</p>${report.assumptions.map(text => `<p>${esc(text)}</p>`).join('')}${report.warnings.length ? `<details open><summary>Недостаточно данных: ${report.warnings.length}</summary><ul>${report.warnings.map(w => `<li>${esc(w.code)} — ${esc(w.table)}: ${esc(w.id)} ${esc(w.relatedId || w.currency || '')}</li>`).join('')}</ul></details>` : ''}
      ${table(['Составляющая', 'По фактическим данным', 'По плану'], [['Операции', money(report.operations_cost), money(report.estimated_operations_cost)], ['Материалы BOM', money(report.materials_cost), money(report.materials_cost)], ['Оборудование', money(report.machine_cost), money(report.estimated_machine_cost)], ['Базовые ставки', money(report.operator_salary_cost), money(report.estimated_operator_salary_cost)]])}
      <h4>Изделия — плановая оценка</h4>${table(['Изделие', 'Количество', 'Итого', 'На единицу'], report.breakdown.items_cost.map(item => [esc(item.item_title || item.item_type), item.item_qty, money(item.total_cost), money(item.cost_per_unit)]))}
      <h4>Материалы</h4>${table(['Изделие / материал', 'Количество / единица', 'Цена', 'Сумма'], report.breakdown.materials.details.map(item => [`${esc(item.item_id)} / ${esc(item.material_name)}`, `${item.qty_total} ${esc(item.material_unit)}`, money(item.price_per_unit), money(item.total_cost)]))}`;
  }
  async function salariesView() {
    const rows = await api('/api/finance/salaries');
    salaryRows = rows;
    const summary = table(['Оператор', 'Базовая ставка / валюта', 'За час', 'Бонус наладки', 'Бонус работы', ''], rows.map(row => [esc(row.operator_name), money(row.base_salary, row.currency), money(row.base_salary_per_hour, row.currency), `${row.bonus_on_time_setup}%`, `${row.bonus_on_time_operation}%`, isAdmin() ? `<button class="btn ghost" data-finance-salary="${esc(row.operator_name)}">Редактировать</button>` : '']));
    const form = isAdmin() ? `<h4>Изменить ставку</h4><form data-finance-form="salary">${rowForm(`${field('operator_name', 'Оператор', '', 'text', 'required')}${field('base_salary', 'Базовая месячная ставка', 0, 'number', 'min="0" step="0.01"')}${field('base_salary_per_hour', 'Ставка за час (приоритет)', 0, 'number', 'min="0" step="0.01"')}${field('currency', 'Валюта', 'EUR', 'text', 'maxlength="3"')}${field('bonus_on_time_setup', 'Бонус наладки, %', 0, 'number', 'min="0" step="0.01"')}${field('bonus_on_time_operation', 'Бонус работы, %', 0, 'number', 'min="0" step="0.01"')}<button class="btn accent">Сохранить ставку</button>`)}</form>` : '';
    return `<div class="card" style="padding:16px"><h3>${isAdmin() ? 'Ставки операторов' : 'Моя ставка'}</h3><p>Изменение ставки не пересчитывает записанные начисления.</p>${summary}${form}</div>`;
  }
  async function machinesView() {
    const rows = await api('/api/finance/machines');
    return `<div class="card" style="padding:16px"><h3>Часовые ставки оборудования</h3>${table(['Машина', 'Тариф за час', ''], rows.map(row => [esc(row.name), `<form id="finance-machine-${esc(row.id)}" data-finance-form="machine" data-id="${esc(row.id)}"><input aria-label="Ставка ${esc(row.name)}" name="cost_per_hour" type="number" min="0" step="0.01" value="${esc(row.cost_per_hour || 0)}"></form>`, `<button class="btn" type="submit" form="finance-machine-${esc(row.id)}">Сохранить</button>`]))}</div>`;
  }
  async function onClick(event) {
    const salary = event.target.closest('[data-finance-salary]');
    if (salary && isAdmin()) {
      const record = salaryRows.find(row => row.operator_name === salary.dataset.financeSalary);
      const form = pane().querySelector('[data-finance-form="salary"]');
      if (record && form) for (const input of form.elements) if (input.name && record[input.name] != null) input.value = record[input.name];
      form?.scrollIntoView({ block: 'nearest' });
      return;
    }
    const view = event.target.closest('[data-finance-view]');
    if (view) return render(view.dataset.financeView);
    const page = event.target.closest('[data-finance-page]');
    if (page) { state.offset = Math.max(0, state.offset + (page.dataset.financePage === 'next' ? 50 : -50)); return render(); }
    const remove = event.target.closest('[data-finance-delete]');
    if (remove && isAdmin() && window.confirm('Удалить выбранную запись из журнала? Итоги будут пересчитаны; повторное закрытие операции не восстановит начисление.')) {
      remove.disabled = true;
      try { await api(`/api/finance/transactions/${encodeURIComponent(remove.dataset.financeDelete)}`, { method: 'DELETE' }); await render(); message('Запись удалена. Итоги журнала обновлены.'); }
      catch (error) { remove.disabled = false; message(error.message); }
    }
  }
  async function onSubmit(event) {
    const form = event.target.closest('[data-finance-form]');
    if (!form) return;
    event.preventDefault();
    const kind = form.dataset.financeForm, values = Object.fromEntries(new FormData(form)), owner = actorKey();
    if (kind === 'filter') { state.query = values; state.offset = 0; return render(); }
    const button = form.querySelector('button[type="submit"],button');
    if (button) button.disabled = true;
    try {
      if (kind.startsWith('order-')) {
        state.activeOrder = values.order_id;
        const element = document.getElementById('financeOrderResult');
        element.textContent = 'Загрузка…';
        await (kind === 'order-cost' ? loadCost : loadOrderEarnings)(values.order_id, element, owner);
      } else {
        if (!isAdmin()) throw new Error('Требуется роль администратора');
        let url, body;
        if (kind === 'manual') { url = '/api/finance/transactions'; body = { ...values, idempotency_key: form.dataset.requestKey }; }
        else if (kind === 'salary') { url = `/api/finance/salaries/${encodeURIComponent(values.operator_name)}`; body = values; }
        else { url = `/api/finance/machines/${encodeURIComponent(form.dataset.id)}`; body = values; }
        await api(url, { method: kind === 'manual' ? 'POST' : 'PUT', body: JSON.stringify(body) });
        if (owner !== actorKey()) return;
        await render(); message(kind === 'manual' ? 'Запись сохранена в журнале. Автоматических исторических начислений не создавалось.' : 'Ставка сохранена. Старые начисления не изменены.');
      }
    } catch (error) { if (owner === actorKey()) message(error.message); }
    finally { if (button) button.disabled = false; }
  }
  window.FinanceModule = { loaded: true, init: render, render, setView: render, get currentView() { return state.currentView; } };
})();

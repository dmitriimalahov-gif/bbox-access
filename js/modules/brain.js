/* Local project advisors. Model output is text, never executable markup. */
(function () {
  'use strict';
  if (window.BrainModule) return;
  let root, status, report, poll, epoch = 0, owner = null, initialized = false, chatAnswer = null;
  const pending = new Set();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = value => value ? new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'ещё нет';
  const admin = () => window.currentUser?.role === 'admin';
  async function request(route, body, method = body ? 'POST' : 'GET') {
    const version = epoch, controller = new AbortController(); pending.add(controller);
    try {
      const result = await window.ApiClient.request('/api/brain' + route, { method, timeoutMs: route === '/chat' ? 120000 : 30000, signal: controller.signal, headers: { 'X-BBOX-Intent': 'brain' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (version !== epoch || !admin()) throw new DOMException('Сеанс завершён', 'AbortError');
      return result;
    } finally { pending.delete(controller); }
  }
  function message(value, error = false) {
    const node = root?.querySelector('[data-brain-message]');
    if (node) { node.textContent = value; node.classList.toggle('brain-error', error); }
  }
  function factsHTML() {
    const counts = report?.facts?.counts || {};
    return '<div class="brain-facts">' + [['Заказов', counts.orders], ['Операций', counts.operations], ['Материалов', counts.materials], ['Техзаданий', counts.techCards]].map(([label, value]) => `<div><strong>${Number.isFinite(value) ? value : '—'}</strong><span>${label}</span></div>`).join('') + '</div>';
  }
  function findingsHTML() {
    if (!report?.findings?.length) return '<p class="brain-muted">В доступных проверках замечаний нет. Это не подтверждает полноту всех данных проекта.</p>';
    return report.findings.map(finding => {
      const recommendations = (report.advisors || []).flatMap(row => row.recommendations || []).filter(row => row.findingId === finding.id);
      const feedback = status.feedback?.[finding.id]?.value;
      return `<article class="brain-finding" data-severity="${esc(finding.severity)}"><span class="brain-eyebrow">${finding.severity === 'high' ? 'Требует внимания' : finding.severity === 'medium' ? 'Стоит проверить' : 'Наблюдение'}</span><h3>${esc(finding.title)}</h3><p>${esc(finding.detail)}</p><div class="brain-next"><strong>Следующий шаг</strong><p>${esc(finding.nextStep)}</p></div>${recommendations.map(row => `<div class="brain-advice"><strong>Совет локального ИИ</strong><p>${esc(row.advice)}</p></div>`).join('')}<details><summary>На чём основан вывод</summary><ul>${(finding.evidence || []).map(value => `<li>${esc(typeof value === 'string' ? value : JSON.stringify(value))}</li>`).join('')}</ul></details><div class="brain-feedback"><span>Полезно для работы?</span><button type="button" data-brain-feedback="${esc(finding.id)}" data-value="useful" aria-pressed="${feedback === 'useful'}">Да</button><button type="button" data-brain-feedback="${esc(finding.id)}" data-value="dismissed" aria-pressed="${feedback === 'dismissed'}">Не подходит</button></div></article>`;
    }).join('');
  }
  function reportHTML() {
    if (!report) return '<div class="brain-empty"><h2>Первый взгляд на проект</h2><p>Запустите анализ. Мозг проверит состояние данных и кода, затем три локальных советника предложат следующие шаги.</p></div>';
    const label = { running: 'Анализ идёт', completed: 'Анализ завершён', partial: 'Частичный обзор', failed: 'Анализ не завершён', interrupted: 'Анализ был прерван' }[report.status] || report.status;
    return `<div class="brain-report-head"><div><span class="brain-eyebrow">${esc(label)}</span><h2>Обзор от ${esc(date(report.createdAt))}</h2></div></div><p class="brain-muted">${esc(report.phase)}${report.changed === false ? ' · Новых изменений в проверенных фактах и памяти нет.' : ''}</p>${report.modelReused ? '<p class="brain-muted">Проверка источников выполнена заново. Советы повторно использованы из предыдущего отчёта без нового запуска модели.</p>' : ''}${report.snapshotAt ? `<p class="brain-source-date">Снимок: ${esc(date(report.snapshotAt))}. Давность производственных данных указана в наблюдениях.</p>` : ''}${factsHTML()}<div class="brain-findings">${findingsHTML()}</div><details class="brain-panel"><summary>Три советника · детали анализа</summary>${(report.advisors || []).map(row => `<section class="brain-advisor"><h3>${esc(row.name)}</h3><p>${esc(row.summary || row.message || 'Ожидает анализа')}</p><small>${row.status === 'ok' ? 'Интерпретация локальной модели · ' + esc(date(row.analyzedAt)) : 'Проверенные факты доступны выше'}</small></section>`).join('')}<details><summary>Полнота проверки</summary><pre>${esc(JSON.stringify(report.coverage || {}, null, 2))}</pre></details></details>`;
  }
  function render() {
    if (!root || !status || !admin()) return;
    const selected = report?.id || '';
    const schedule = status.schedule?.enabled ? `Каждый день в ${status.schedule.time || '09:00'} · Кишинёв` : 'Ежедневное расписание ещё не включено';
    root.innerHTML = `<div class="brain-shell"><div class="brain-heading"><div><span class="brain-eyebrow">Локальный помощник</span><h1>Мозг B’BOX</h1><p>Замечает изменения, объясняет риски и помнит ваши решения.</p></div><span class="brain-local ${status.available ? 'ready' : ''}">${status.available ? '● ИИ на вашем Mac' : '○ ИИ недоступен'}</span></div><div class="brain-status"><div><strong>${esc(status.model)}</strong><span>${esc(status.message)}</span></div><div><strong>${esc(schedule)}</strong><span>Производство · Качество данных · Развитие</span></div></div><div class="brain-toolbar"><button type="button" class="brain-primary" data-brain-action="run"${status.busy ? ' disabled' : ''}>${status.busy ? 'Задача выполняется…' : 'Проанализировать сейчас'}</button><button type="button" data-brain-action="refresh">Обновить отчёт</button></div><p data-brain-message role="status" aria-live="polite"></p><label class="brain-history">История обзоров<select data-brain-history><option value="">${status.reports.length ? 'Выберите отчёт' : 'Отчётов пока нет'}</option>${status.reports.map(row => `<option value="${esc(row.id)}"${row.id === selected ? ' selected' : ''}>${esc(date(row.createdAt))} · ${row.kind === 'daily' ? 'ежедневный' : 'ручной'} · ${row.status === 'running' ? 'в работе' : row.status === 'failed' ? 'ошибка' : row.findings + ' наблюдений'}</option>`).join('')}</select></label><section data-brain-report>${reportHTML()}</section><section class="brain-panel brain-chat"><h2>Спросить о проекте</h2><p>Ответ опирается на свежий снимок и вашу память. Советы ИИ стоит проверять по указанным фактам.</p><form data-brain-chat><label>Ваш вопрос<textarea name="question" maxlength="2000" rows="3" required placeholder="Что сейчас проверить в первую очередь?"></textarea></label><button class="brain-primary" type="submit">Спросить локальный ИИ</button></form><div data-brain-answer role="status">${chatAnswer ? `<p>${esc(chatAnswer.answer)}</p><small>Снимок ${esc(date(chatAnswer.snapshotAt))} · ${esc(chatAnswer.model)}</small>` : ''}</div></section><section class="brain-panel"><h2>Память проекта <span class="brain-count">${status.memory.length}</span></h2><p>Сохраните правило, решение или предпочтение. Мозг учтёт его в следующих ответах.</p><form data-brain-memory><label>Что нужно запомнить<textarea name="note" maxlength="1000" rows="3" required placeholder="Например: перед новым тиражом всегда проверять направление волокна."></textarea></label><button type="submit">Запомнить</button></form><div class="brain-notes">${status.memory.map(row => `<article><p>${esc(row.text)}</p><small>${esc(date(row.createdAt))}</small><button type="button" data-brain-forget="${esc(row.id)}" aria-label="Удалить заметку из памяти">Удалить</button></article>`).join('')}</div><p class="brain-muted">${esc(status.learning)}. Боты дают советы; заказы и склад автоматически не меняют.</p></section></div>`;
  }
  function schedulePoll() {
    clearTimeout(poll);
    if (!status?.busy || !admin()) return;
    poll = setTimeout(async () => {
      if (!root || root.style.display === 'none' || !admin()) return;
      try {
        status = await request('/status');
        if (report?.id) report = await request('/reports/' + encodeURIComponent(report.id));
        // Preserve text being typed and open evidence while a report progresses.
        const output = root.querySelector('[data-brain-report]');
        if (output) output.innerHTML = reportHTML();
        const run = root.querySelector('[data-brain-action=run]');
        if (run) { run.disabled = !!status.busy; run.textContent = status.busy ? 'Задача выполняется…' : 'Проанализировать сейчас'; }
        message(status.busy ? 'Советники работают последовательно. Можно перейти в другой раздел.' : 'Обзор готов.');
        schedulePoll();
      } catch (error) { if (error.name !== 'AbortError') message(error.message, true); }
    }, 3500);
  }
  async function refresh(id) {
    status = await request('/status');
    const chosen = id || status.busy?.id || report?.id || status.reports[0]?.id;
    report = chosen ? await request('/reports/' + encodeURIComponent(chosen)) : null;
    render(); schedulePoll();
  }
  async function onClick(event) {
    const target = event.target.closest('button'); if (!target) return;
    try {
      if (target.dataset.brainAction === 'run') {
        target.disabled = true; message('Собираем факты. Первый ответ модели может занять несколько минут.');
        const result = await request('/run', {}); await refresh(result.id);
      } else if (target.dataset.brainAction === 'refresh') await refresh();
      else if (target.dataset.brainFeedback) {
        await request('/feedback', { reportId: report.id, findingId: target.dataset.brainFeedback, value: target.dataset.value });
        status.feedback[target.dataset.brainFeedback] = { value: target.dataset.value };
        target.parentElement.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button === target)));
        message('Оценка сохранена и будет учтена в следующем анализе.');
      } else if (target.dataset.brainForget) { await request('/memory/' + encodeURIComponent(target.dataset.brainForget), null, 'DELETE'); await refresh(); }
    } catch (error) { if (error.name !== 'AbortError') { message(error.message, true); target.disabled = false; } }
  }
  async function onSubmit(event) {
    if (!event.target.matches('[data-brain-chat],[data-brain-memory]')) return;
    event.preventDefault(); const form = event.target, button = form.querySelector('button'); button.disabled = true;
    try {
      if (form.matches('[data-brain-memory]')) { await request('/memory', { text: form.elements.note.value }); await refresh(); message('Заметка сохранена в памяти проекта.'); }
      else {
        const answer = root.querySelector('[data-brain-answer]'); answer.textContent = 'Локальный ИИ обдумывает ответ…';
        chatAnswer = await request('/chat', { question: form.elements.question.value });
        answer.innerHTML = `<p>${esc(chatAnswer.answer)}</p><small>Снимок ${esc(date(chatAnswer.snapshotAt))} · ${esc(chatAnswer.model)}</small>`;
      }
    } catch (error) { if (error.name !== 'AbortError') { message(error.message, true); const answer = root?.querySelector('[data-brain-answer]'); if (form.matches('[data-brain-chat]') && answer) answer.textContent = error.message; } }
    finally { button.disabled = false; }
  }
  function reset() { epoch++; clearTimeout(poll); pending.forEach(controller => controller.abort()); pending.clear(); status = report = chatAnswer = owner = null; if (root) root.replaceChildren(); }
  async function init() {
    if (!admin()) return reset();
    const currentOwner = window.currentUser.userId || window.currentUser.username;
    if (owner && owner !== currentOwner) reset(); owner = currentOwner;
    root = document.getElementById('brain'); if (!root) return;
    if (!initialized) { root.addEventListener('click', onClick); root.addEventListener('submit', onSubmit); root.addEventListener('change', event => { if (event.target.matches('[data-brain-history]') && event.target.value) refresh(event.target.value).catch(error => message(error.message, true)); }); initialized = true; }
    if (!status) root.innerHTML = '<div class="brain-shell"><p role="status">Подключаем локальный мозг…</p></div>';
    try { await refresh(); } catch (error) { if (error.name !== 'AbortError') root.innerHTML = `<div class="brain-shell"><h2>Мозг временно недоступен</h2><p>${esc(error.message)}</p><button data-brain-action="refresh">Повторить</button></div>`; }
  }
  window.BrainModule = { init, reset };
})();

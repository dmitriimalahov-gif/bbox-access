/**
 * B'BOX Production - Diagnostics Module
 * ======================================
 * Клиентский модуль для диагностики системы
 */

(function() {
  'use strict';

  if (window.DiagnosticsModule && window.DiagnosticsModule.loaded) {
    console.log('Diagnostics module already loaded');
    return;
  }

  console.log('Loading Diagnostics module...');

  // Helper functions
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
    const res = await (window.PagesClient?.request || fetch)(path, {
      headers: { "Content-Type": "application/json" },
      ...opts
    });
    const text = await res.text();
    if (text.startsWith('<!')) {
      throw new Error(`HTTP ${res.status}: сервер вернул HTML вместо JSON`);
    }
    return JSON.parse(text);
  });

  // History of diagnostics runs
  let diagnosticsHistory = JSON.parse(localStorage.getItem('diagnosticsHistory') || '[]');
  const MAX_HISTORY = 10;

  const reconciliationLabels = {
    foreign_key: 'Нарушенные внешние ключи', orphan_bom: 'Рецептуры без изделия', unknown_machine: 'Неизвестные машины',
    cross_order_item: 'Заказ операции не совпадает с изделием', duplicate_completion_credit: 'Несколько начислений за операцию',
    summary_mismatch: 'Расхождение журнала и итогов', historical_completion_unverified: 'Историческое завершение без записи журнала',
    receipt_ledger_missing: 'Отметка начисления без строки журнала'
  };
  let reconciliationGeneration = 0;
  async function showReconciliation(issue = '', offset = 0) {
    const content = $('diagnosticsContent');
    if (!content) return;
    const generation = ++reconciliationGeneration;
    const owner = JSON.stringify(window.currentUser || null);
    content.textContent = 'Читаем данные для сверки…';
    try {
      const query = new URLSearchParams({ issue, offset, limit: 50 });
      const result = await api('/api/diagnostics/reconciliation?' + query);
      const report = result?.data || result;
      if (generation !== reconciliationGeneration || owner !== JSON.stringify(window.currentUser || null)) return;
      content.innerHTML = `<div class="card" style="padding:16px"><h3>Сверка исторических данных</h3>
        <p>Отчёт только читает данные. Отсутствие начисления в журнале не доказывает долг. Одна строка может участвовать в нескольких проверках. Связи и оборудование не подставляются автоматически.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end"><label>Проверка<select id="reconciliationIssue"><option value="">Все (${Object.values(report.counts).reduce((a, b) => a + b, 0)})</option>${Object.entries(report.counts).map(([code, count]) => `<option value="${esc(code)}" ${issue === code ? 'selected' : ''}>${esc(reconciliationLabels[code] || code)} — ${count}</option>`).join('')}</select></label>
        <button class="btn" id="reconciliationExport">Экспорт JSON для сверки</button></div>
        <p>Найдено: ${report.total}; показано ${report.returned}. ${report.evidenceTruncated ? 'Список доказательств ограничен; фильтруйте конкретную проверку.' : ''} Экспорт содержит до 10 000 записей и явно отмечает ограничение.</p>
        ${report.unavailable.length ? `<p>Недоступные проверки: ${report.unavailable.map(code => esc(reconciliationLabels[code] || code)).join(', ')}. Это не подтверждение отсутствия проблем.</p>` : ''}
        ${report.records.map(record => `<article style="border:1px solid var(--border);border-radius:8px;padding:12px;margin:12px 0"><strong>${esc(reconciliationLabels[record.code] || record.code)}</strong><div>${record.severity === 'info' ? 'Требуется подтверждение, не установленный долг' : 'Требуется сверка'}</div>
          <dl><dt>Источник и точный ключ</dt><dd style="margin:4px 0;overflow-wrap:anywhere"><code>${esc(JSON.stringify(record.source))}</code></dd><dt>Наблюдаемые данные</dt><dd style="margin:4px 0;overflow-wrap:anywhere"><code>${esc(JSON.stringify(record.evidence))}</code></dd></dl>
          <strong>Следующие шаги для проверки</strong><ul>${record.reviewOptions.map(text => `<li>${esc(text)}</li>`).join('')}</ul></article>`).join('') || '<p>Для этой проверки записей нет.</p>'}
        <div style="display:flex;gap:8px"><button class="btn ghost" id="reconciliationPrev" ${offset === 0 ? 'disabled' : ''}>Назад</button><button class="btn ghost" id="reconciliationNext" ${report.hasMore ? '' : 'disabled'}>Далее</button></div></div>`;
      $('reconciliationExport').onclick = async event => {
        const button = event.currentTarget; button.disabled = true;
        try { await window.PagesClient.download('/api/diagnostics/reconciliation/export?issue=' + encodeURIComponent(issue), 'bbox-reconciliation.json'); }
        catch (error) { if (owner === JSON.stringify(window.currentUser || null)) toast('Не удалось скачать отчёт: ' + error.message); }
        finally { button.disabled = false; }
      };
      $('reconciliationIssue').onchange = event => showReconciliation(event.target.value, 0);
      $('reconciliationPrev').onclick = () => showReconciliation(issue, Math.max(0, offset - 50));
      $('reconciliationNext').onclick = () => showReconciliation(issue, offset + 50);
    } catch (error) { if (generation === reconciliationGeneration && owner === JSON.stringify(window.currentUser || null)) content.textContent = 'Не удалось прочитать отчёт: ' + error.message; }
  }

  // Render diagnostics results
  function renderDiagnosticsResults(data, checkType) {
    const content = $('diagnosticsContent');
    if (!content) return;

    let html = '';

    if (data.status) {
      const statusColor = data.status === 'ok' ? '#2ecc71' : data.status === 'warning' ? '#ffb020' : '#e74c3c';
      html += `<div style="padding:12px;background:rgba(${data.status === 'ok' ? '46,204,113' : data.status === 'warning' ? '255,176,32' : '231,76,60'},0.1);border:2px solid ${statusColor};border-radius:8px;margin-bottom:12px">
        <div style="font-weight:700;font-size:14px;color:${statusColor};margin-bottom:8px">
          Статус: ${data.status === 'ok' ? '✅ Всё работает' : data.status === 'warning' ? '⚠️ Есть предупреждения' : '❌ Обнаружены ошибки'}
        </div>
        ${data.timestamp ? `<div style="font-size:12px;color:var(--muted);margin-bottom:8px">Время проверки: ${new Date(data.timestamp).toLocaleString('ru-RU')}</div>` : ''}
      </div>`;
    }

    if (data.checks && Array.isArray(data.checks)) {
      html += '<div style="display:flex;flex-direction:column;gap:8px">';
      for (const check of data.checks) {
        const checkStatusColor = check.status === 'ok' ? '#2ecc71' : check.status === 'warning' ? '#ffb020' : '#e74c3c';
        html += `<div style="padding:12px;background:var(--card);border:1px solid var(--border);border-radius:8px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="color:${checkStatusColor};font-size:18px">${check.status === 'ok' ? '✅' : check.status === 'warning' ? '⚠️' : '❌'}</span>
            <strong style="font-size:14px">${esc(check.name || 'Unknown')}</strong>
          </div>
          <div style="font-size:13px;color:var(--text);margin-bottom:4px">${esc(check.message || '')}</div>
          ${check.details ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;padding:8px;background:var(--bg);border-radius:4px"><pre style="margin:0;white-space:pre-wrap">${esc(JSON.stringify(check.details, null, 2))}</pre></div>` : ''}
          ${check.name === 'data_integrity_ops_items' && check.status === 'warning' ? `
            <div style="margin-top:12px;padding:12px;background:rgba(255,176,32,0.1);border:1px solid #ffb020;border-radius:8px">
              <div style="display:flex;gap:8px;margin-bottom:8px">
                <button class="btn primary" onclick="window.DiagnosticsModule.showOrphanedOps()" style="padding:6px 12px;font-size:12px">
                  👁️ Показать операции
                </button>
                <button class="btn accent" onclick="window.DiagnosticsModule.deleteSelectedOps()" id="deleteOrphanedOpsBtn" style="padding:6px 12px;font-size:12px;display:none" disabled>
                  🗑️ Удалить выбранные
                </button>
              </div>
              <div id="orphanedOpsList" style="display:none;max-height:400px;overflow-y:auto;margin-top:8px"></div>
            </div>
          ` : ''}
          ${check.name === 'data_integrity_ops_cutting' && check.status === 'warning' ? `
            <div style="margin-top:12px;padding:12px;background:rgba(255,176,32,0.1);border:1px solid #ffb020;border-radius:8px">
              <div style="display:flex;gap:8px;margin-bottom:8px">
                <button class="btn primary" onclick="window.DiagnosticsModule.showOrphanedCuttingOps()" style="padding:6px 12px;font-size:12px">
                  👁️ Показать операции
                </button>
                <button class="btn accent" onclick="window.DiagnosticsModule.clearSelectedCuttingOps()" id="clearOrphanedCuttingOpsBtn" style="padding:6px 12px;font-size:12px;display:none" disabled>
                  🧹 Очистить ссылки
                </button>
              </div>
              <div id="orphanedCuttingOpsList" style="display:none;max-height:400px;overflow-y:auto;margin-top:8px"></div>
            </div>
          ` : ''}
          ${check.issues && check.issues.length > 0 ? `<div style="margin-top:8px;padding:8px;background:rgba(231,76,60,0.1);border-radius:4px">
            <strong style="color:#e74c3c;font-size:12px">Проблемы:</strong>
            <ul style="margin:4px 0;padding-left:20px;font-size:12px;color:var(--text)">
              ${check.issues.map(issue => `<li>${esc(issue)}</li>`).join('')}
            </ul>
          </div>` : ''}
        </div>`;
      }
      html += '</div>';
    }

    if (data.issues && Array.isArray(data.issues) && data.issues.length > 0) {
      html += `<div style="margin-top:12px;padding:12px;background:rgba(231,76,60,0.1);border:2px solid #e74c3c;border-radius:8px">
        <strong style="color:#e74c3c;font-size:14px;margin-bottom:8px;display:block">Обнаруженные проблемы:</strong>
        <ul style="margin:0;padding-left:20px;font-size:13px;color:var(--text)">
          ${data.issues.map(issue => `<li>${esc(issue)}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (data.endpoints && Array.isArray(data.endpoints)) {
      html += '<div style="margin-top:12px"><h4 style="margin-bottom:8px">API Endpoints:</h4><div style="display:grid;gap:4px">';
      for (const endpoint of data.endpoints.slice(0, 20)) {
        html += `<div style="padding:6px;background:var(--bg);border-radius:4px;font-size:12px;font-family:monospace">
          <span style="color:var(--accent);font-weight:700">${esc(endpoint.method)}</span> ${esc(endpoint.path)}
          ${endpoint.hasAuth ? '<span style="color:#2ecc71;margin-left:8px">🔒</span>' : ''}
          ${endpoint.hasRole ? '<span style="color:#3498db;margin-left:4px">👑</span>' : ''}
        </div>`;
      }
      if (data.endpoints.length > 20) {
        html += `<div style="padding:6px;text-align:center;color:var(--muted);font-size:12px">... и ещё ${data.endpoints.length - 20} endpoints</div>`;
      }
      html += '</div></div>';
    }

    if (data.errors && Array.isArray(data.errors)) {
      html += '<div style="margin-top:12px"><h4 style="margin-bottom:8px">Последние ошибки:</h4><div style="display:flex;flex-direction:column;gap:4px">';
      for (const error of data.errors.slice(0, 10)) {
        html += `<div style="padding:8px;background:rgba(231,76,60,0.1);border-radius:4px;font-size:12px">
          <div style="color:var(--muted);font-size:11px">${esc(error.timestamp || '')}</div>
          <div style="color:var(--text);margin-top:4px">${esc(error.message || '')}</div>
        </div>`;
      }
      html += '</div></div>';
    }

    content.innerHTML = html;
  }

  // Save to history
  function saveToHistory(checkType, data) {
    diagnosticsHistory.unshift({
      type: checkType,
      data: data,
      timestamp: new Date().toISOString()
    });
    if (diagnosticsHistory.length > MAX_HISTORY) {
      diagnosticsHistory = diagnosticsHistory.slice(0, MAX_HISTORY);
    }
    localStorage.setItem('diagnosticsHistory', JSON.stringify(diagnosticsHistory));
    renderHistory();
  }

  // Render history
  function renderHistory() {
    const historyDiv = $('diagnosticsHistory');
    if (!historyDiv) return;

    if (diagnosticsHistory.length === 0) {
      historyDiv.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:13px">История проверок пуста</div>';
      return;
    }

    let html = '<div style="display:flex;flex-direction:column;gap:8px">';
    for (const entry of diagnosticsHistory) {
      const date = new Date(entry.timestamp);
      html += `<div style="padding:8px;background:var(--card);border:1px solid var(--border);border-radius:6px">
        <div style="font-weight:700;font-size:12px;margin-bottom:4px">
          ${esc(entry.type)} - ${date.toLocaleString('ru-RU')}
        </div>
        <div style="font-size:11px;color:var(--muted)">
          Статус: <span style="color:${entry.data.status === 'ok' ? '#2ecc71' : entry.data.status === 'warning' ? '#ffb020' : '#e74c3c'}">${esc(entry.data.status || 'unknown')}</span>
        </div>
      </div>`;
    }
    html += '</div>';
    historyDiv.innerHTML = html;
  }

  // Run diagnostics
  async function runDiagnostics(checkType) {
    try {
      const content = $('diagnosticsContent');
      if (content) {
        content.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Загрузка...</div>';
      }

      let endpoint = '/api/diagnostics/health';
      if (checkType === 'database') endpoint = '/api/diagnostics/database';
      else if (checkType === 'api') endpoint = '/api/diagnostics/api';
      else if (checkType === 'errors') endpoint = '/api/diagnostics/errors';

      const data = await api(endpoint);
      renderDiagnosticsResults(data, checkType);
      saveToHistory(checkType, data);
      toast(`Диагностика ${checkType} завершена`);
    } catch (e) {
      const content = $('diagnosticsContent');
      if (content) {
        content.innerHTML = `<div style="padding:20px;background:rgba(231,76,60,0.1);border:2px solid #e74c3c;border-radius:8px;color:#e74c3c">
          <strong>Ошибка выполнения диагностики:</strong><br>
          ${esc(e.message || String(e))}
        </div>`;
      }
      toast(`Ошибка диагностики: ${e.message}`);
    }
  }

  // Run all diagnostics
  async function runAllDiagnostics() {
    const content = $('diagnosticsContent');
    try {
      if (content) {
        content.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Запуск всех проверок...</div>';
      }

      const results = {
        health: null,
        database: null,
        api: null,
        errors: null
      };

      try {
        results.health = await api('/api/diagnostics/health');
      } catch (e) {
        results.health = { status: 'error', message: e.message };
      }

      try {
        results.database = await api('/api/diagnostics/database');
      } catch (e) {
        results.database = { status: 'error', message: e.message };
      }

      try {
        results.api = await api('/api/diagnostics/api');
      } catch (e) {
        results.api = { status: 'error', message: e.message };
      }

      try {
        results.errors = await api('/api/diagnostics/errors');
      } catch (e) {
        results.errors = { status: 'error', message: e.message };
      }

      // Combine results
      const overallStatus = Object.values(results).some(r => r.status === 'error') ? 'error' :
                            Object.values(results).some(r => r.status === 'warning') ? 'warning' : 'ok';

      const combinedData = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        results: results
      };

      // Render combined results
      let html = `<div style="padding:12px;background:rgba(${overallStatus === 'ok' ? '46,204,113' : overallStatus === 'warning' ? '255,176,32' : '231,76,60'},0.1);border:2px solid ${overallStatus === 'ok' ? '#2ecc71' : overallStatus === 'warning' ? '#ffb020' : '#e74c3c'};border-radius:8px;margin-bottom:12px">
        <div style="font-weight:700;font-size:16px;color:${overallStatus === 'ok' ? '#2ecc71' : overallStatus === 'warning' ? '#ffb020' : '#e74c3c'};margin-bottom:8px">
          Общий статус: ${overallStatus === 'ok' ? '✅ Всё работает' : overallStatus === 'warning' ? '⚠️ Есть предупреждения' : '❌ Обнаружены ошибки'}
        </div>
        <div style="font-size:12px;color:var(--muted)">Время проверки: ${new Date().toLocaleString('ru-RU')}</div>
      </div>`;

      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:12px;margin-top:12px">';

      for (const [key, result] of Object.entries(results)) {
        const statusColor = result.status === 'ok' ? '#2ecc71' : result.status === 'warning' ? '#ffb020' : '#e74c3c';
        const title = key === 'health' ? 'Общая проверка' : key === 'database' ? 'Проверка БД' : key === 'api' ? 'Проверка API' : 'Ошибки из логов';
        
        html += `<div style="padding:12px;background:var(--card);border:1px solid var(--border);border-radius:8px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="color:${statusColor};font-size:18px">${result.status === 'ok' ? '✅' : result.status === 'warning' ? '⚠️' : '❌'}</span>
            <strong style="font-size:14px">${esc(title)}</strong>
          </div>
          <div style="font-size:12px;color:var(--muted)">${result.status || 'unknown'}</div>
        </div>`;
      }

      html += '</div>';

      if (content) {
        content.innerHTML = html;
      }

      saveToHistory('all', combinedData);
      toast('Все проверки завершены');
    } catch (e) {
      if (content) {
        content.innerHTML = `<div style="padding:20px;background:rgba(231,76,60,0.1);border:2px solid #e74c3c;border-radius:8px;color:#e74c3c">
          <strong>Ошибка выполнения диагностики:</strong><br>
          ${esc(e.message || String(e))}
        </div>`;
      }
      toast(`Ошибка диагностики: ${e.message}`);
    }
  }

  // Show orphaned operations
  async function showOrphanedOps() {
    const container = $('orphanedOpsList');
    if (!container) return;
    
    container.style.display = 'block';
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Загрузка проблемных операций...</div>';
    
    try {
      const result = await api('/api/diagnostics/orphaned-ops');
      const deleteBtn = $('deleteOrphanedOpsBtn');
      
      if (result.count === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#2ecc71">✅ Проблемных операций с изделиями не найдено.</div>';
        if (deleteBtn) deleteBtn.style.display = 'none';
        return;
      }

      let html = `
        <div style="margin-top:12px;padding:12px;background:rgba(255,176,32,0.1);border:2px solid #ffb020;border-radius:8px">
          <strong style="color:#ffb020;font-size:14px;margin-bottom:8px;display:block">
            ⚠️ Найдено ${result.count} операций с несуществующими или пустыми изделиями.
          </strong>
          <div style="display:flex;gap:10px;margin-bottom:10px">
            <button class="btn primary small" onclick="window.DiagnosticsModule.selectAllOrphanedOps()">Выбрать все</button>
            <button class="btn secondary small" onclick="window.DiagnosticsModule.deselectAllOrphanedOps()">Снять выбор</button>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table" style="width:100%;min-width:800px">
              <thead>
                <tr>
                  <th style="width:30px"></th>
                  <th>ID Операции</th>
                  <th>Заказ</th>
                  <th>ID Изделия</th>
                  <th>Операция</th>
                  <th>Статус</th>
                  <th>Машина</th>
                  <th>Оператор</th>
                  <th>План</th>
                  <th>Факт</th>
                </tr>
              </thead>
              <tbody>
                ${result.operations.map(op => `
                  <tr>
                    <td><input type="checkbox" class="orphaned-op-checkbox" value="${esc(op.id)}"></td>
                    <td>${esc(op.id)}</td>
                    <td>${esc(op.order_id)}</td>
                    <td>${esc(op.order_item_id || '— Пусто —')}</td>
                    <td>${esc(op.operation || '—')}</td>
                    <td>${esc(op.status || '—')}</td>
                    <td>${esc(op.machine || '—')}</td>
                    <td>${esc(op.operator || '—')}</td>
                    <td>${esc(op.plan)}</td>
                    <td>${esc(op.fact)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      container.innerHTML = html;

      // Attach event listeners for checkboxes
      const checkboxes = container.querySelectorAll('.orphaned-op-checkbox');
      checkboxes.forEach(cb => {
        cb.addEventListener('change', () => updateDeleteButton());
      });
      
      if (deleteBtn) {
        deleteBtn.style.display = 'block';
        deleteBtn.onclick = () => deleteSelectedOps();
      }
      
      updateDeleteButton();
    } catch (e) {
      container.innerHTML = `<div style="padding:20px;background:rgba(231,76,60,0.1);border:2px solid #e74c3c;border-radius:8px;color:#e74c3c">
        <strong>Ошибка загрузки проблемных операций:</strong><br>
        ${esc(e.message || String(e))}
      </div>`;
      const deleteBtn = $('deleteOrphanedOpsBtn');
      if (deleteBtn) deleteBtn.style.display = 'none';
    }
  }

  // Select all orphaned operations
  function selectAllOrphanedOps() {
    const container = $('orphanedOpsList');
    if (!container) return;
    const checkboxes = container.querySelectorAll('.orphaned-op-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    updateDeleteButton();
  }

  // Deselect all orphaned operations
  function deselectAllOrphanedOps() {
    const container = $('orphanedOpsList');
    if (!container) return;
    const checkboxes = container.querySelectorAll('.orphaned-op-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateDeleteButton();
  }

  // Update delete button state
  function updateDeleteButton() {
    const container = $('orphanedOpsList');
    const deleteBtn = $('deleteOrphanedOpsBtn');
    if (!container || !deleteBtn) return;
    
    const checkboxes = container.querySelectorAll('.orphaned-op-checkbox:checked');
    deleteBtn.disabled = checkboxes.length === 0;
  }

  // Delete selected orphaned operations
  async function deleteSelectedOps() {
    const container = $('orphanedOpsList');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('.orphaned-op-checkbox:checked');
    const operationIds = Array.from(checkboxes).map(cb => cb.value);

    if (operationIds.length === 0) {
      toast('Выберите операции для удаления.');
      return;
    }

    if (!confirm(`Вы уверены, что хотите удалить ${operationIds.length} выбранных операций? Это действие необратимо.`)) {
      return;
    }

    const deleteBtn = $('deleteOrphanedOpsBtn');
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.textContent = '⏳ Удаление...';
    }

    try {
      const result = await api('/api/diagnostics/orphaned-ops/delete', {
        method: 'POST',
        body: JSON.stringify({ operationIds })
      });
      toast(`✅ Удалено ${result.deleted} операций. Статусы заказов пересчитаны.`);
      // Refresh the list and re-run database diagnostics
      await showOrphanedOps();
      await runDiagnostics('database');
    } catch (e) {
      toast(`❌ Ошибка удаления: ${e.message}`);
      console.error('Error deleting orphaned ops:', e);
    } finally {
      if (deleteBtn) {
        deleteBtn.disabled = false;
        deleteBtn.textContent = '🗑️ Удалить выбранные';
      }
    }
  }

  // Initialize module
  function init() {
    console.log('Initializing Diagnostics module...');

    // Setup event handlers
    const healthBtn = $('diagnosticsHealthBtn');
    const databaseBtn = $('diagnosticsDatabaseBtn');
    const apiBtn = $('diagnosticsApiBtn');
    const errorsBtn = $('diagnosticsErrorsBtn');
    const runAllBtn = $('diagnosticsRunAllBtn');
    const content = $('diagnosticsContent');
    if (content && !$('diagnosticsReconciliationBtn') && window.currentUser?.role === 'admin') {
      const button = document.createElement('button');
      button.id = 'diagnosticsReconciliationBtn';
      button.className = 'btn accent';
      button.textContent = 'Сверка исторических данных';
      button.style.marginBottom = '12px';
      button.onclick = () => showReconciliation();
      content.before(button);
    }

    if (healthBtn) {
      healthBtn.onclick = () => runDiagnostics('health');
    }
    if (databaseBtn) {
      databaseBtn.onclick = () => runDiagnostics('database');
    }
    if (apiBtn) {
      apiBtn.onclick = () => runDiagnostics('api');
    }
    if (errorsBtn) {
      errorsBtn.onclick = () => runDiagnostics('errors');
    }
    if (runAllBtn) {
      runAllBtn.onclick = () => runAllDiagnostics();
    }

    // Render history on init
    renderHistory();

    console.log('Diagnostics module initialized');
  }

  // Show operations with non-existent cutting layouts
  async function showOrphanedCuttingOps() {
    const container = $('orphanedCuttingOpsList');
    if (!container) return;
    
    container.style.display = 'block';
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">Загрузка операций с несуществующими раскроями...</div>';
    
    try {
      const result = await api('/api/diagnostics/orphaned-cutting-ops');
      const clearBtn = $('clearOrphanedCuttingOpsBtn');
      
      if (result.count === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#2ecc71">✅ Операций с несуществующими раскроями не найдено.</div>';
        if (clearBtn) clearBtn.style.display = 'none';
        return;
      }

      let html = `
        <div style="margin-top:12px;padding:12px;background:rgba(255,176,32,0.1);border:2px solid #ffb020;border-radius:8px">
          <strong style="color:#ffb020;font-size:14px;margin-bottom:8px;display:block">
            ⚠️ Найдено ${result.count} операций с несуществующими раскроями.
          </strong>
          <div style="display:flex;gap:10px;margin-bottom:10px">
            <button class="btn primary small" onclick="window.DiagnosticsModule.selectAllOrphanedCuttingOps()">Выбрать все</button>
            <button class="btn secondary small" onclick="window.DiagnosticsModule.deselectAllOrphanedCuttingOps()">Снять выбор</button>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table" style="width:100%;min-width:800px">
              <thead>
                <tr>
                  <th style="width:30px"></th>
                  <th>ID Операции</th>
                  <th>Заказ</th>
                  <th>ID Изделия</th>
                  <th>Операция</th>
                  <th>Статус</th>
                  <th>Машина</th>
                  <th>Оператор</th>
                  <th>ID Раскроя (не существует)</th>
                </tr>
              </thead>
              <tbody>
                ${result.operations.map(op => `
                  <tr>
                    <td><input type="checkbox" class="orphaned-cutting-op-checkbox" value="${esc(op.id)}"></td>
                    <td>${esc(op.id)}</td>
                    <td>${esc(op.order_id || '—')}</td>
                    <td>${esc(op.order_item_id || '—')}</td>
                    <td>${esc(op.operation || '—')}</td>
                    <td>${esc(op.status || '—')}</td>
                    <td>${esc(op.machine || '—')}</td>
                    <td>${esc(op.operator || '—')}</td>
                    <td style="color:#e74c3c;font-weight:600">${esc(op.cutting_layout_id || '—')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      container.innerHTML = html;

      // Attach event listeners for checkboxes
      const checkboxes = container.querySelectorAll('.orphaned-cutting-op-checkbox');
      checkboxes.forEach(cb => {
        cb.addEventListener('change', () => updateClearButton());
      });
      
      if (clearBtn) {
        clearBtn.style.display = 'block';
        clearBtn.onclick = () => clearSelectedCuttingOps();
      }
      
      updateClearButton();
    } catch (e) {
      container.innerHTML = `<div style="padding:20px;background:rgba(231,76,60,0.1);border:2px solid #e74c3c;border-radius:8px;color:#e74c3c">
        <strong>Ошибка загрузки операций:</strong><br>
        ${esc(e.message || String(e))}
      </div>`;
      const clearBtn = $('clearOrphanedCuttingOpsBtn');
      if (clearBtn) clearBtn.style.display = 'none';
    }
  }

  // Select all orphaned cutting operations
  function selectAllOrphanedCuttingOps() {
    const container = $('orphanedCuttingOpsList');
    if (!container) return;
    const checkboxes = container.querySelectorAll('.orphaned-cutting-op-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    updateClearButton();
  }

  // Deselect all orphaned cutting operations
  function deselectAllOrphanedCuttingOps() {
    const container = $('orphanedCuttingOpsList');
    if (!container) return;
    const checkboxes = container.querySelectorAll('.orphaned-cutting-op-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateClearButton();
  }

  // Update clear button state
  function updateClearButton() {
    const container = $('orphanedCuttingOpsList');
    const clearBtn = $('clearOrphanedCuttingOpsBtn');
    if (!container || !clearBtn) return;
    
    const checkboxes = container.querySelectorAll('.orphaned-cutting-op-checkbox:checked');
    clearBtn.disabled = checkboxes.length === 0;
  }

  // Clear cutting_layout_id for selected operations
  async function clearSelectedCuttingOps() {
    const container = $('orphanedCuttingOpsList');
    if (!container) return;
    
    const checkboxes = container.querySelectorAll('.orphaned-cutting-op-checkbox:checked');
    const operationIds = Array.from(checkboxes).map(cb => cb.value);

    if (operationIds.length === 0) {
      toast('Выберите операции для очистки.');
      return;
    }

    if (!confirm(`Вы уверены, что хотите очистить ссылки на раскрой для ${operationIds.length} выбранных операций? Это действие удалит ссылку на несуществующий раскрой.`)) {
      return;
    }

    const clearBtn = $('clearOrphanedCuttingOpsBtn');
    if (clearBtn) {
      clearBtn.disabled = true;
      clearBtn.textContent = '⏳ Очистка...';
    }

    try {
      const result = await api('/api/diagnostics/orphaned-cutting-ops/clear', {
        method: 'POST',
        body: JSON.stringify({ operationIds })
      });

      toast(`✅ ${result.message || `Очищено ссылок на раскрой для ${result.clearedCount || operationIds.length} операций`}`);
      
      // Обновляем список и перезапускаем диагностику
      await showOrphanedCuttingOps();
      await runDatabaseDiagnostics();
    } catch (e) {
      toast(`❌ Ошибка: ${e.message || 'Не удалось очистить ссылки на раскрой'}`);
      if (clearBtn) {
        clearBtn.disabled = false;
        clearBtn.textContent = '🧹 Очистить ссылки';
      }
    }
  }

  // Expose module
  window.DiagnosticsModule = {
    loaded: true,
    init,
    runDiagnostics,
    runAllDiagnostics,
    renderDiagnosticsResults,
    showReconciliation,
    showOrphanedOps,
    selectAllOrphanedOps,
    deselectAllOrphanedOps,
    updateDeleteButton,
    deleteSelectedOps,
    showOrphanedCuttingOps,
    selectAllOrphanedCuttingOps,
    deselectAllOrphanedCuttingOps,
    updateClearButton,
    clearSelectedCuttingOps
  };

  // Auto-init if diagnostics pane is visible
  if (document.querySelector('#diagnostics.pane')?.style.display !== 'none') {
    init();
  }

  console.log('Diagnostics module loaded successfully');
})();

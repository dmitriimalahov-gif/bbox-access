/* One edit contract for routing, operator cards and inline controls. */
(function(root) {
  'use strict';
  async function update(op, changes, method = 'PATCH') {
    const account = root.currentUser;
    const version = op && op.version;
    if (!op || !op.id || !Number.isInteger(version) || version < 0) {
      throw new Error('Обновите список операций перед сохранением: версия записи неизвестна.');
    }
    // Only changed fields cross the API. Never submit an old entire row or
    // replace a user's observed version with a fresher one behind their back.
    const body = { ...changes, version };
    try {
      let updated = await root.api('/api/ops/' + encodeURIComponent(op.id), {
        method, body: JSON.stringify(body)
      });
      if (root.currentUser !== account) throw new Error('Сеанс изменился. Откройте операцию заново.');
      if (updated && Number.isInteger(updated.version)) {
        const row = root.state?.ops?.find(item => item.id === op.id);
        // A later refresh/edit can finish before this response reaches us.
        // Return the newest known row too: legacy callers merge the result.
        for (const candidate of [op, row]) {
          if (Number.isInteger(candidate?.version) && candidate.version > updated.version) updated = candidate;
        }
        Object.assign(op, updated);
        if (row) Object.assign(row, updated);
      }
      if (changes.status === 'Выполнено' && updated?.payroll) {
        const { status, reason } = updated.payroll;
        const reasons = {
          operator_missing: 'не назначен оператор',
          product_template_missing: 'не указан шаблон изделия',
          template_rates_missing: 'в шаблоне отсутствуют тарифы',
          operation_rates_missing: 'для операции отсутствуют тарифы',
          zero_or_nonpositive_amount: 'расчётная сумма равна нулю или меньше'
        };
        const message = status === 'not_accrued'
          ? 'Операция выполнена. Оплата не начислена: ' + (reasons[reason] || 'проверьте настройки расчёта') + '.'
          : reason === 'linked_entries_require_review'
            ? 'Есть ручные финансовые записи по операции. Требуется сверка; автоматическое начисление не добавлено.'
            : status === 'historical' ? 'Операция выполнена. Это историческая запись: оплату нужно сверить отдельно.' : '';
        if (message) {
          if (root.showNotification) root.showNotification('Начисление по операции', message, 'warning', 15000);
          else root.toast?.(message, 6000);
        }
      }
      return updated;
    } catch (error) {
      if (root.currentUser === account && /верси|version/i.test(String(error.message || ''))) {
        // Refresh for the next deliberate edit; never replay a mutation after
        // another operator has changed the record.
        try { await root.refreshAll?.(false); } catch (_) { /* preserve original error */ }
      }
      throw error;
    }
  }
  root.OperationUpdates = { update };
})(window);

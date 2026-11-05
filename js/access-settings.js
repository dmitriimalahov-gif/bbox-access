(() => {
  let epoch = 0;
  const request = (path, body) => api(path, { method: 'POST', headers: { 'X-BBOX-Intent': 'auth' }, body: JSON.stringify(body || {}) });
  function reset() { epoch++; document.getElementById('accessSettings')?.remove(); }
  async function render() {
    if (window.currentUser?.role !== 'admin') return;
    const user = window.currentUser;
    let card = document.getElementById('accessSettings');
    // Preserve unsaved password fields and the one-time code across unrelated redraws.
    if (card) {
      const generation = epoch;
      const data = await api('/api/auth/access');
      if (generation !== epoch || user !== window.currentUser || !card.isConnected) return;
      const select = card.querySelector('#accessOperator');
      if (select) {
        const selected = select.value;
        select.innerHTML = data.operators.map(op => `<option value="${esc(op.id)}" data-configured="${op.configured}">${esc(op.name)} — ${op.configured ? 'код выдан' : 'нужен код'}</option>`).join('');
        if (data.operators.some(op => String(op.id) === selected)) select.value = selected;
        card.querySelector('#issueOperatorCode').disabled = !data.operators.length || card.dataset.issuing === '1';
        select.disabled = card.dataset.issuing === '1';
      }
      return;
    }
    const generation = ++epoch;
    card = document.createElement('div'); card.id = 'accessSettings'; card.className = 'card'; card.style.margin = '10px';
    card.innerHTML = '<h3>Доступ</h3><p role="status">Загрузка настроек доступа…</p>';
    document.getElementById('settings')?.prepend(card);
    try {
      const data = await api('/api/auth/access');
      if (epoch !== generation || window.currentUser !== user) return;
      card.innerHTML = `<h3>Доступ</h3><p class="hint">Операторы входят по личному коду. Код показывается только при выдаче. Сеанс действует до ${data.sessionHours} часов.</p><div class="grid two"><div><h4>Код оператора</h4><label for="accessOperator">Оператор</label><select id="accessOperator" style="width:100%;margin:8px 0">${data.operators.map(op => `<option value="${esc(op.id)}" data-configured="${op.configured}">${esc(op.name)} — ${op.configured ? 'код выдан' : 'нужен код'}</option>`).join('')}</select><button class="btn primary" id="issueOperatorCode" ${data.operators.length ? '' : 'disabled'}>Выдать новый код</button><div id="accessCode" aria-live="polite" style="margin-top:12px;overflow-wrap:anywhere"></div><p class="hint">При замене кода прежний код и открытые сеансы оператора перестают работать.</p></div><form id="changeAdminPassword"><h4>Ваш пароль администратора</h4><label for="accessCurrentPassword">Текущий пароль</label><input id="accessCurrentPassword" type="password" autocomplete="current-password" required style="width:100%;margin:8px 0"><label for="accessNewPassword">Новый пароль · минимум 10 символов</label><input id="accessNewPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required style="width:100%;margin:8px 0"><label for="accessConfirmPassword">Повторите новый пароль</label><input id="accessConfirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required style="width:100%;margin:8px 0"><button class="btn primary" type="submit">Сохранить пароль</button></form></div><p id="accessStatus" role="status" style="overflow-wrap:anywhere"></p>`;
      const valid = () => epoch === generation && user === window.currentUser && card.isConnected;
      const status = message => { if (valid()) card.querySelector('#accessStatus').textContent = message; };
      card.querySelector('#issueOperatorCode').onclick = async event => {
        const select = card.querySelector('#accessOperator');
        if (select.selectedOptions[0]?.dataset.configured === '1' && !confirm('Заменить код? Старый код и сеансы этого оператора перестанут работать.')) return;
        const operatorId = select.value;
        card.dataset.issuing = '1';
        select.disabled = true;
        event.target.disabled = true;
        card.querySelector('#accessCode').textContent = '';
        try {
          const result = await request(`/api/auth/access/operators/${encodeURIComponent(operatorId)}/code`);
          if (!valid()) return;
          const output = card.querySelector('#accessCode');
          output.innerHTML = `<strong>${esc(result.operator)}</strong><div style="font-size:30px;letter-spacing:4px;font-weight:800;padding:12px 0">${esc(result.code)}</div><p>Передайте код оператору лично. После закрытия страницы он не отображается.</p><button class="btn ghost" type="button">Скрыть код</button>`;
          output.querySelector('button').onclick = () => { output.textContent = ''; };
          const option = [...select.options].find(option => option.value === operatorId);
          if (option) { option.dataset.configured = '1'; option.textContent = `${result.operator} — код выдан`; }
          status('Новый код сохранён. Старые сеансы оператора закрыты.');
        } catch (e) { status(e.message); }
        finally { if (valid()) { delete card.dataset.issuing; event.target.disabled = !select.options.length; select.disabled = false; } }
      };
      card.querySelector('#changeAdminPassword').onsubmit = async event => {
        event.preventDefault();
        const form = event.target, button = form.querySelector('button');
        if (card.querySelector('#accessNewPassword').value !== card.querySelector('#accessConfirmPassword').value) return status('Новые пароли не совпадают.');
        button.disabled = true;
        try {
          await request('/api/auth/access/password', { currentPassword: card.querySelector('#accessCurrentPassword').value, newPassword: card.querySelector('#accessNewPassword').value });
          if (valid()) { form.reset(); status('Пароль изменён. Другие сеансы администратора закрыты.'); }
        } catch (e) { status(e.message); }
        finally { if (valid()) button.disabled = false; }
      };
    } catch (e) { if (epoch === generation && window.currentUser === user) { card.querySelector('[role=status]').textContent = e.message; const retry = document.createElement('button'); retry.className = 'btn'; retry.textContent = 'Повторить'; retry.onclick = () => { card.remove(); render(); }; card.append(retry); } }
  }
  window.AccessSettings = { render, reset };
})();

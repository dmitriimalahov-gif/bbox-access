/* Mobile workflow refinements. Original controls remain the source of actions. */
(function () {
  'use strict';
  if (window.BboxMobileWorkflows) return;
  let scheduled = false;
  const disclosures = [];
  let wasMobile = false;
  let savebar;
  const isMobile = () => document.body.classList.contains('bbox-mobile-admin');
  const text = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };

  function disclosure(card, title) {
    if (!card || card.querySelector(':scope > .bbox-mobile-disclosure')) return;
    const heading = card.querySelector(':scope > h3');
    if (!heading) return;
    const details = document.createElement('details');
    details.className = 'bbox-mobile-disclosure';
    details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = title || heading.textContent;
    const content = document.createElement('div');
    content.className = 'bbox-mobile-disclosure-body';
    // Move original nodes so their listeners, input values and validation survive.
    while (heading.nextSibling) content.append(heading.nextSibling);
    heading.classList.add('bbox-mobile-original-heading');
    details.append(summary, content);
    card.append(details);
    disclosures.push({ details, mobileOpen: false });
  }

  function sync() {
    scheduled = false;
    const mobile = isMobile();
    document.querySelectorAll('#settings h3[id$="Toggle"]').forEach(heading => {
      const content = document.getElementById(heading.id.replace(/Toggle$/, 'Content'));
      const icon = document.getElementById(heading.id.replace(/Toggle$/, 'Icon'));
      if (!content) return;
      const expanded = content.style.display !== 'none';
      if (heading.getAttribute('aria-expanded') !== String(expanded)) heading.setAttribute('aria-expanded', String(expanded));
      if (icon) {
        text(icon, expanded ? '▾' : '▸');
        icon.setAttribute('aria-hidden', 'true');
        if (icon.style.transform !== 'none') icon.style.transform = 'none';
      }
    });
    if (mobile) document.querySelectorAll('#ordersT > tr').forEach(row => {
      const actions = row.querySelector('td:last-child');
      const open = actions?.querySelector('[data-a="open"]');
      if (!open || actions.querySelector('[data-mobile-order-more]')) return;
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn ghost';
      more.dataset.mobileOrderMore = '';
      more.textContent = 'Подробнее';
      more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', () => {
        const expanded = row.classList.toggle('bbox-mobile-order-expanded');
        more.setAttribute('aria-expanded', String(expanded));
        more.textContent = expanded ? 'Свернуть' : 'Подробнее';
      });
      open.after(more);
    });
    if (mobile !== wasMobile) {
      disclosures.forEach(item => {
        if (!mobile) item.mobileOpen = item.details.open;
        item.details.open = mobile ? item.mobileOpen : true;
      });
      wasMobile = mobile;
    }
    const root = document.getElementById('techcards');
    const visible = mobile && root && root.style.display !== 'none' && root.querySelector('[data-action="save"]');
    savebar.hidden = !visible;
    if (!visible) return;
    const save = root.querySelector('[data-action="save"]');
    const status = root.querySelector('[data-save-status]');
    savebar.querySelector('[data-mobile-save]').disabled = save.disabled;
    text(savebar.querySelector('[data-mobile-save]'), save.disabled ? 'Сохраняем…' : 'Сохранить ТЗ');
    text(savebar.querySelector('[data-mobile-save-status]'), status?.textContent || 'Черновик');
  }
  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(sync); }
  }
  function init() {
    const canvas = document.getElementById('designerCanvasWrapper');
    if (canvas) {
      const panel = canvas.parentElement;
      const workspace = panel.parentElement;
      const sidebar = workspace.firstElementChild;
      workspace.classList.add('bbox-mobile-designer-workspace');
      panel.classList.add('bbox-mobile-designer-canvas');
      sidebar.classList.add('bbox-mobile-designer-controls');
      const details = document.createElement('details');
      details.className = 'bbox-mobile-disclosure';
      details.open = true;
      const summary = document.createElement('summary');
      summary.textContent = 'Изделия, цех и камеры';
      const body = document.createElement('div');
      body.className = 'bbox-mobile-disclosure-body';
      while (sidebar.firstChild) body.append(sidebar.firstChild);
      details.append(summary, body); sidebar.append(details);
      disclosures.push({ details, mobileOpen: false });
      const select = document.getElementById('designerOrderSelectMain');
      if (select) {
        const tools = document.createElement('details');
        tools.className = 'bbox-mobile-disclosure bbox-mobile-designer-tools';
        tools.open = true;
        const heading = document.createElement('summary');
        heading.textContent = 'Инструменты схемы';
        const controls = document.createElement('div');
        controls.className = 'bbox-mobile-disclosure-body';
        while (select.nextSibling) controls.append(select.nextSibling);
        tools.append(heading, controls); select.parentElement.append(tools);
        disclosures.push({ details: tools, mobileOpen: false });
      }
    }
    const filters = document.getElementById('f_order')?.closest('.card');
    disclosure(filters, 'Фильтры и сортировка');
    disclosure(document.getElementById('timeAnalysis')?.closest('.card'), 'Анализ времени');
    const stats = document.getElementById('stats');
    Array.from(stats?.children || []).slice(0, 2).forEach(card => {
      if (card.classList.contains('card')) {
        card.classList.add('bbox-mobile-secondary');
        disclosure(card);
      }
    });
    savebar = document.createElement('div');
    savebar.className = 'bbox-mobile-savebar';
    savebar.hidden = true;
    savebar.setAttribute('aria-label', 'Действия с техническим заданием');
    savebar.innerHTML = '<span data-mobile-save-status role="status"></span><div><button type="button" data-mobile-preview>PDF / печать</button><button type="button" data-mobile-save>Сохранить ТЗ</button></div>';
    savebar.addEventListener('click', event => {
      const action = event.target.closest('[data-mobile-save]') ? 'save' : event.target.closest('[data-mobile-preview]') ? 'preview' : null;
      if (action) document.querySelector('#techcards [data-action="' + action + '"]')?.click();
    });
    document.body.append(savebar);
    document.getElementById('ordersT')?.addEventListener('click', event => {
      if (!isMobile() || !event.target.closest('[data-a="open"]')) return;
      requestAnimationFrame(() => document.getElementById('activeOrderItemsCard')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    });
    document.getElementById('activeOrderItemsCard')?.querySelector('h3')?.insertAdjacentHTML('afterend', '<button type="button" class="bbox-mobile-list-back">Вернуться к списку заказов</button>');
    document.querySelector('.bbox-mobile-list-back')?.addEventListener('click', () => document.getElementById('ordersListCard')?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const root = document.getElementById('techcards');
    if (root) observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'disabled'] });
    const orders = document.getElementById('ordersT');
    if (orders) observer.observe(orders, { childList: true, subtree: true });
    const settings = document.getElementById('settings');
    if (settings) observer.observe(settings, { subtree: true, attributes: true, attributeFilter: ['style'] });
    document.querySelectorAll('#settings h3[id$="Toggle"]').forEach(heading => {
      heading.tabIndex = 0;
      heading.setAttribute('role', 'button');
      heading.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); heading.click(); }
      });
    });
    schedule();
  }
  window.BboxMobileWorkflows = { refresh: schedule };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

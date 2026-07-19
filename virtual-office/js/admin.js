/* OfficeAdmin — admin panel for the Virtual Office.
 * Talks to the /oa/* service: set a password on first use, rename/edit agents,
 * and give agents REAL tasks executed by the local AI (Ollama). Applies agent
 * name/role overrides to the live office and reflects task results.
 */
(function (global) {
  const $ = s => document.querySelector(s);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function api(path, body) {
    const opt = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
    return fetch('/oa' + path, opt).then(r => r.json().then(j => ({ ok: r.ok, status: r.status, j })).catch(() => ({ ok: r.ok, status: r.status, j: {} }))).catch(() => ({ ok: false, status: 0, j: { error: 'нет связи с сервером' } }));
  }

  const A = { pw: null, authed: false, state: null, open_: false, polls: {} };

  A.init = function () {
    this.pw = localStorage.getItem('office_admin_pw') || null;
    this.authed = !!this.pw;
    this.refresh();
    setInterval(() => this.refresh(), 6000);
  };

  A.office = function () { return global.__office; };
  A.ui = function () { return global.OfficeUI; };

  A.refresh = async function () {
    const r = await api('/state');
    const ui = this.ui();
    if (r.ok && r.j) {
      this.state = r.j; this.applyOverrides();
      if (ui && ui.rightMode === 'admin') {
        // Never rebuild the dashboard on a poll — that would wipe fields the
        // admin is editing. Only setup/login screens re-render; the live
        // dashboard just refreshes its task list.
        if (!this.state.configured || !this.authed) this.render();
        else this.refreshTasks();
      }
    }
  };

  // push server name/role overrides onto the live agents
  A.applyOverrides = function () {
    const o = this.office(); if (!o || !this.state || !this.state.agents) return;
    let touched = null;
    for (const id in this.state.agents) {
      const ov = this.state.agents[id]; const a = o.store.getAgent(id);
      if (a && (a.name !== ov.name || a.role !== ov.role)) { a.name = ov.name; a.role = ov.role; touched = id; }
    }
    if (touched) { const ui = this.ui(); if (ui && ui.rightMode === 'agent' && ui._agentId) { const a = o.store.getAgent(ui._agentId); if (a) ui.showAgent(a); } else if (ui && ui.rightMode === 'list') ui.renderAgentList(); }
  };

  // ---------- open / render ----------
  A.open = function () {
    this.open_ = true; const ui = this.ui(); if (ui) ui.rightMode = 'admin';
    if (ui && ui.isMobile && ui.isMobile()) ui.openPanel();
    if (!this.state) { this.refresh().then(() => this.render()); this.panel('<div class="panel-head"><h3>Админ-панель</h3></div><div class="empty">Загрузка…</div>'); return; }
    this.render();
  };
  A.panel = function (html) { const p = $('#rightPanel'); if (p) p.innerHTML = html; };

  A.render = function () {
    if (!this.state) return this.refresh().then(() => this.render());
    if (!this.state.configured) return this.renderSetup();
    if (!this.authed) return this.renderLogin();
    this.renderDash();
  };

  A.renderSetup = function () {
    this.panel(`<div class="panel-head"><h3>Админ-панель</h3></div>
      <div class="adm">
        <p class="soft small">Задайте пароль администратора. Он потребуется, чтобы переименовывать сотрудников и давать им задания ИИ.</p>
        <label>Новый пароль</label><input id="admPw" type="password" placeholder="минимум 4 символа" autocomplete="new-password">
        <label>Повторите пароль</label><input id="admPw2" type="password" autocomplete="new-password">
        <div class="modal-actions"><button class="primary" id="admSet">Сохранить пароль</button></div>
        <div class="soft small" id="admErr"></div>
      </div>`);
    $('#admSet').addEventListener('click', async () => {
      const p1 = $('#admPw').value, p2 = $('#admPw2').value;
      if (p1.length < 4) return this.err('Минимум 4 символа');
      if (p1 !== p2) return this.err('Пароли не совпадают');
      const r = await api('/setup', { password: p1 });
      if (r.ok) { this.pw = p1; this.authed = true; localStorage.setItem('office_admin_pw', p1); await this.refresh(); this.render(); }
      else this.err(r.j.error || 'Ошибка');
    });
  };

  A.renderLogin = function () {
    this.panel(`<div class="panel-head"><h3>Админ-панель</h3></div>
      <div class="adm">
        <p class="soft small">Введите пароль администратора.</p>
        <label>Пароль</label><input id="admPw" type="password" autocomplete="current-password">
        <div class="modal-actions"><button class="primary" id="admLogin">Войти</button></div>
        <div class="soft small" id="admErr"></div>
      </div>`);
    const go = async () => {
      const pw = $('#admPw').value;
      const r = await api('/login', { password: pw });
      if (r.ok) { this.pw = pw; this.authed = true; localStorage.setItem('office_admin_pw', pw); this.render(); this.refreshTasks(); }
      else this.err(r.j.error || 'Неверный пароль');
    };
    $('#admLogin').addEventListener('click', go);
    $('#admPw').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  };

  A.renderDash = function () {
    const ags = Object.values(this.state.agents);
    const agRows = ags.map(a => `<div class="adm-ag" data-id="${a.id}">
        <input class="adm-name" value="${esc(a.name)}" maxlength="40">
        <input class="adm-role" value="${esc(a.role)}" maxlength="60">
        <button class="adm-save" data-id="${a.id}">✔</button>
      </div>`).join('');
    const opts = ags.map(a => `<option value="${a.id}">${esc(a.name)} — ${esc(a.role)}</option>`).join('');
    this.panel(`<div class="panel-head"><h3>Админ-панель</h3><button class="back" id="admOut" title="Выйти">⎋</button></div>
      <div class="adm">
        <div class="adm-sec">🤖 Дать задание ИИ</div>
        <label>Сотрудник</label><select id="admTaskAg">${opts}</select>
        <label>Задание</label><textarea id="admTaskPrompt" rows="3" placeholder="Напр.: составь план продвижения сервиса такси на неделю"></textarea>
        <div class="modal-actions"><button class="primary" id="admTaskSend">Отправить агенту →</button></div>
        <div class="soft small">Отвечает локальная модель на сервере. Ответ появится в карточке сотрудника и в ленте.</div>

        <div class="adm-sec">🛒 Майя — поиск на AliExpress <button class="ghost sm" id="aliCfgToggle">ключи</button></div>
        <div id="aliCfg" hidden>
          <div class="soft small">Ключи AliExpress Open Platform (Dropshipping). Хранятся на сервере, в логи не попадают.</div>
          <label>app_key</label><input id="aliKey" placeholder="app_key">
          <label>app_secret</label><input id="aliSecret" type="password" placeholder="app_secret">
          <label>access_token</label><input id="aliToken" type="password" placeholder="OAuth access_token">
          <div class="row2"><div><label>Страна</label><input id="aliCountry" value="US"></div><div><label>Валюта</label><input id="aliCur" value="USD"></div></div>
          <div class="modal-actions"><button class="primary" id="aliSave">Сохранить ключи</button></div>
        </div>
        <div class="soft small" id="aliState">Проверка настроек…</div>
        <label>Что искать</label><input id="aliQuery" value="electronics" placeholder="напр. wireless earbuds">
        <div class="row2"><div><label>Макс. цена ($)</label><input id="aliMax" type="number" value="50"></div><div style="align-self:end"><button class="primary" id="aliSearch" style="width:100%">Найти →</button></div></div>
        <div class="adm-tasks" id="aliResults"></div>

        <div class="adm-sec">✏️ Сотрудники (имя / роль)</div>
        <div class="adm-list">${agRows}</div>
        <div class="modal-actions"><button class="ghost" id="admReset">Сбросить имена</button></div>

        <div class="adm-sec">🗒 Последние задания <button class="ghost sm" id="admClear">очистить</button></div>
        <div class="adm-tasks" id="admTasks"><div class="soft small">Загрузка…</div></div>

        <div class="soft small" id="admErr"></div>
      </div>`);

    $('#admOut').addEventListener('click', () => { this.logout(); });
    $('#admReset').addEventListener('click', async () => { const r = await api('/agent/reset', { password: this.pw }); if (r.ok) { await this.refresh(); this.render(); } });
    $('#admClear').addEventListener('click', async () => { await api('/task/clear', { password: this.pw }); this.refreshTasks(); });
    $('#rightPanel').querySelectorAll('.adm-save').forEach(b => b.addEventListener('click', async () => {
      const row = b.closest('.adm-ag'); const id = b.dataset.id;
      const name = row.querySelector('.adm-name').value, role = row.querySelector('.adm-role').value;
      b.textContent = '…';
      const r = await api('/agent', { password: this.pw, id, name, role });
      if (r.ok) { this.state.agents = r.j.agents; this.applyOverrides(); b.textContent = '✓'; setTimeout(() => b.textContent = '✔', 1200); }
      else { b.textContent = '✔'; this.err(r.j.error || 'Ошибка'); }
    }));
    $('#admTaskSend').addEventListener('click', () => {
      const agentId = $('#admTaskAg').value, prompt = $('#admTaskPrompt').value.trim();
      if (!prompt) return this.err('Введите задание');
      $('#admTaskPrompt').value = ''; this.runTask(agentId, prompt);
    });
    // AliExpress / Майя
    $('#aliCfgToggle').addEventListener('click', () => { const c = $('#aliCfg'); c.hidden = !c.hidden; });
    $('#aliSave').addEventListener('click', () => this.aliSave());
    $('#aliSearch').addEventListener('click', () => this.aliSearch());
    this.aliStatus();
    this.refreshTasks();
  };

  A.aliStatus = async function () {
    const r = await api('/ali/status', { password: this.pw });
    const el = $('#aliState'); if (!el || !r.ok) return;
    const s = r.j;
    if (s.configured) { el.innerHTML = '<span class="adm-ok">✓ подключено</span> · доставка ' + (s.locale.ship_to_country) + ', ' + s.locale.target_currency; if ($('#aliCountry')) $('#aliCountry').value = s.locale.ship_to_country; if ($('#aliCur')) $('#aliCur').value = s.locale.target_currency; }
    else el.innerHTML = '<span class="adm-err">не настроено</span> — добавьте ключи (кнопка «ключи»)';
  };
  A.aliSave = async function () {
    const body = { password: this.pw, app_key: $('#aliKey').value, app_secret: $('#aliSecret').value, access_token: $('#aliToken').value, ship_to_country: $('#aliCountry').value, target_currency: $('#aliCur').value, target_language: 'EN' };
    const r = await api('/ali/config', body);
    if (r.ok) { $('#aliSecret').value = ''; $('#aliToken').value = ''; $('#aliKey').value = ''; $('#aliCfg').hidden = true; this.aliStatus(); this.err('Ключи AliExpress сохранены'); }
    else this.err(r.j.error || 'Ошибка');
  };
  A.aliSearch = async function () {
    const keywords = ($('#aliQuery').value || 'electronics').trim();
    const maxPrice = parseFloat($('#aliMax').value) || 50;
    const box = $('#aliResults'); box.innerHTML = '<div class="soft small">🔎 Майя ищет на AliExpress…</div>';
    const o = this.office(); const maya = o && o.store.getAgent('maya');
    if (maya && o) { try { o.director.workAtDesk(maya, 'RESEARCHING', 'ищет товары на AliExpress'); } catch (e) {} maya.bubbleT = 3; o.store.log('Майя: поиск на AliExpress — «' + keywords + '»', { agentId: 'maya', kind: 'task' }); }
    const r = await api('/ali/search', { password: this.pw, keywords, maxPrice });
    const j = r.j || {};
    if (j.error) { box.innerHTML = '<div class="adm-err" style="font-size:12px">' + esc(aliErr(j)) + '</div>'; this.aliDone(maya, true); return; }
    const list = j.products || [];
    if (!list.length) { box.innerHTML = '<div class="soft small">Ничего не найдено до $' + maxPrice + '.' + (j.note ? ' ' + esc(j.note) : '') + '</div>'; this.aliDone(maya, false); return; }
    box.innerHTML = list.map(p => `<a class="ali-card" href="${esc(p.url)}" target="_blank" rel="noopener">
        ${p.image ? `<img class="ali-img" src="${esc(p.image)}" alt="" loading="lazy">` : '<div class="ali-img"></div>'}
        <div class="ali-info"><div class="ali-title">${esc(p.title)}</div><div class="ali-price">$${esc(p.price)} ${esc(p.currency || '')}</div></div>
      </a>`).join('');
    if (o) o.store.log('Майя нашла ' + list.length + ' товаров (до $' + maxPrice + ')', { agentId: 'maya', kind: 'done' });
    this.aliDone(maya, false);
  };
  A.aliDone = function (maya, err) {
    const o = this.office(); if (!maya || !o) return;
    o.store.setStatus('maya', err ? 'ERROR' : 'COMPLETED', err ? 'ошибка поиска' : 'готово');
    if (!err && maya.flash) maya.flash('success');
    setTimeout(() => { const m = o.store.getAgent('maya'); if (m && (m.status === 'COMPLETED' || m.status === 'ERROR')) { try { o.director.workAtDesk(m, 'IDLE', ''); } catch (e) {} } }, 2600);
  };
  function aliErr(j) {
    const m = { no_config: 'AliExpress не настроен — добавьте ключи (кнопка «ключи»).', no_keys: 'Заполните app_key, app_secret и access_token.', no_sdk: 'SDK на сервере не установлен: ' + (j.message || ''), api_error: 'Ошибка API AliExpress: ' + (j.message || ''), run_error: 'Сбой запуска: ' + (j.message || ''), parse_error: 'Не разобрать ответ: ' + (j.message || '') };
    return m[j.error] || (j.message || 'Ошибка');
  }

  A.refreshTasks = async function () {
    if (!this.authed) return;
    const r = await api('/tasks', { password: this.pw });
    const box = $('#admTasks'); if (!box) return;
    if (!r.ok) { box.innerHTML = '<div class="soft small">—</div>'; return; }
    const ts = (r.j.tasks || []).slice().reverse();
    box.innerHTML = ts.length ? ts.map(t => {
      const st = t.status === 'running' ? '<span class="adm-run">⏳ думает…</span>' : t.status === 'error' ? '<span class="adm-err">ошибка</span>' : '<span class="adm-ok">готово</span>';
      return `<div class="adm-task" data-id="${t.id}">
        <div class="adm-task-h"><b>${esc(t.agentName)}</b> ${st}</div>
        <div class="adm-task-q">${esc(t.prompt)}</div>
        ${t.result ? `<div class="adm-task-a">${esc(t.result)}</div>` : ''}</div>`;
    }).join('') : '<div class="soft small">Пока нет заданий.</div>';
  };

  // ---------- give a task (real AI) ----------
  A.runTask = async function (agentId, prompt) {
    if (!this.authed) { this.open(); return; }
    const o = this.office();
    const r = await api('/task', { password: this.pw, agentId, prompt });
    if (!r.ok) { this.err(r.j.error || 'Не удалось отправить'); return; }
    const a = o && o.store.getAgent(agentId);
    if (a && o) { try { o.director.workAtDesk(a, 'WORKING', 'выполняет задание ИИ'); } catch (e) {} a.bubbleT = 3; o.store.log(`${a.name}: получил задание ИИ`, { agentId, kind: 'task' }); }
    this.refreshTasks();
    this.pollTask(r.j.taskId, agentId);
  };

  A.pollTask = function (taskId, agentId) {
    let tries = 0;
    const tick = async () => {
      tries++;
      const r = await api('/tasks', { password: this.pw });
      if (r.ok) { const t = (r.j.tasks || []).find(x => x.id === taskId);
        if (t && t.status !== 'running') { this.onTaskDone(t, agentId); this.refreshTasks(); return; } }
      if (tries < 80) setTimeout(tick, 3000);
    };
    setTimeout(tick, 2500);
  };

  A.onTaskDone = function (t, agentId) {
    const o = this.office(); const a = o && o.store.getAgent(agentId);
    if (a && o) {
      const err = t.status === 'error';
      o.store.setStatus(agentId, err ? 'ERROR' : 'COMPLETED', err ? 'ошибка' : 'готово');
      if (!err && a.flash) a.flash('success');
      o.store.log(`${a.name} ${err ? 'не смог выполнить' : 'ответил на'} задание ИИ`, { agentId, kind: err ? 'task' : 'done' });
      o.store.notify({ type: 'ai', title: `${a.name}: ответ готов`, agentId, text: (t.result || '').slice(0, 80) });
      setTimeout(() => { const cur = o.store.getAgent(agentId); if (cur && (cur.status === 'COMPLETED' || cur.status === 'ERROR')) { try { o.director.workAtDesk(cur, 'IDLE', ''); } catch (e) {} } }, 2600);
    }
    this.showResult(t);
  };

  A.showResult = function (t) {
    const ui = this.ui(); if (!ui) return;
    ui.modal(`<h3>${esc(t.agentName)} — ответ ИИ</h3>
      <div class="soft small" style="margin-bottom:8px">Задание: ${esc(t.prompt)}</div>
      <div class="adm-answer">${esc(t.result || '(пусто)')}</div>
      <div class="modal-actions"><button class="primary" data-close>Понятно</button></div>`);
  };

  A.logout = function () { this.pw = null; this.authed = false; localStorage.removeItem('office_admin_pw'); this.render(); };
  A.err = function (m) { const e = $('#admErr'); if (e) e.textContent = m; };
  A.close = function () { this.open_ = false; };

  global.OfficeAdmin = A;
})(window);

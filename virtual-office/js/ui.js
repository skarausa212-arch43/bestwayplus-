/* UI overlay (modern SaaS style, NOT pixel art). Renders DOM panels and
 * stays in sync with the store via the event bus. */
(function (global) {
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const timeStr = d => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const STATUS_COLORS = {
    IDLE: '#8a90a6', MOVING: '#8a90a6', THINKING: '#a78bfa', WORKING: '#38bdf8', CODING: '#34d399',
    DESIGNING: '#f472b6', RESEARCHING: '#fbbf24', READING: '#fbbf24', WRITING: '#38bdf8',
    TALKING: '#a78bfa', MEETING: '#a78bfa', WAITING_FOR_AGENT: '#fb923c', WAITING_FOR_USER: '#f59e0b',
    REVIEWING: '#38bdf8', PAUSED: '#8a90a6', ERROR: '#ef4444', COMPLETED: '#22c55e',
  };

  const UI = {};
  UI.init = function (engine, director, store, bus) {
    this.engine = engine; this.director = director; this.store = store; this.bus = bus;
    this.rightMode = 'feed';

    engine.onSelect = (a) => { if (a) this.showAgent(a); else this.showFeed(); };
    engine.onHover = (a, p) => this.tooltip(a, p);

    bus.on('activity', () => { if (this.rightMode === 'feed') this.renderFeed(); });
    bus.on('agent.status_changed', ({ agent }) => { if (this.rightMode === 'agent' && this._agentId === agent.id) this.showAgent(agent); this.refreshSidebarCounts(); });
    bus.on('agent.task_progress', (t) => { if (this.rightMode === 'agent' && this._agentId === t.assignedAgentId) this.updateProgress(t); });
    bus.on('notification', (n) => this.onNotification(n));

    this.buildTopbar(); this.buildSidebar(); this.renderFeed(); this.refreshSidebarCounts();
    this.wireButtons();
  };

  // ---------- Top bar ----------
  UI.buildTopbar = function () {
    $('#topbar').innerHTML = `
      <div class="tb-left">
        <div class="brand"><span class="brand-mark">◧</span> Virtual Office</div>
        <div class="selects">
          <button class="sel">BestWayPlus ▾</button>
          <button class="sel">All projects ▾</button>
        </div>
      </div>
      <div class="tb-mid"><input id="globalSearch" class="search" placeholder="Search agents, tasks…"></div>
      <div class="tb-right">
        <button class="tb-btn" id="btnFit" title="Fit office">⛶</button>
        <button class="tb-btn primary" id="btnCreateTask">＋ Create Task</button>
        <button class="tb-btn" id="btnAddAgent">＋ Agent</button>
        <button class="tb-btn bell" id="btnBell">🔔<span class="badge" id="notifBadge" hidden>0</span></button>
        <div class="me">IS</div>
      </div>`;
  };

  // ---------- Left sidebar ----------
  UI.buildSidebar = function () {
    const items = [['office', '🏢', 'Office'], ['agents', '👥', 'Agents'], ['tasks', '✅', 'Tasks'], ['projects', '📁', 'Projects'], ['calendar', '📅', 'Calendar'], ['files', '🗂', 'Files'], ['analytics', '📊', 'Analytics'], ['settings', '⚙', 'Settings']];
    $('#sidebar').innerHTML = `<div class="sb-logo">◧</div>` + items.map(([k, i, l], idx) =>
      `<button class="sb-item ${idx === 0 ? 'active' : ''}" data-nav="${k}"><span class="ic">${i}</span><span class="lb">${l}</span></button>`).join('');
    $('#sidebar').querySelectorAll('.sb-item').forEach(b => b.addEventListener('click', () => {
      $('#sidebar').querySelectorAll('.sb-item').forEach(x => x.classList.remove('active')); b.classList.add('active');
      this.navTo(b.dataset.nav);
    }));
  };
  UI.navTo = function (k) {
    if (k === 'agents') { this.rightMode = 'list'; this.renderAgentList(); }
    else if (k === 'tasks') { this.rightMode = 'tasks'; this.renderTaskList(); }
    else { this.showFeed(); }
  };
  UI.refreshSidebarCounts = function () {};

  // ---------- Right panel ----------
  UI.panel = function (html) { $('#rightPanel').innerHTML = html; };

  UI.showFeed = function () { this.rightMode = 'feed'; this.renderFeed(); this.engine.select(null); };
  UI.renderFeed = function () {
    const items = this.store.activity.slice(0, 60).map(e => {
      const dot = e.kind === 'approval' ? '#f59e0b' : e.kind === 'done' ? '#22c55e' : e.kind === 'meeting' ? '#a78bfa' : e.kind === 'spawn' ? '#38bdf8' : '#8a90a6';
      return `<div class="feed-row" ${e.agentId ? `data-agent="${e.agentId}"` : ''}>
        <span class="feed-dot" style="background:${dot}"></span>
        <div class="feed-body"><div class="feed-text">${esc(e.text)}</div><div class="feed-time">${timeStr(e.time)}</div></div></div>`;
    }).join('') || `<div class="empty">No activity yet.</div>`;
    this.panel(`<div class="panel-head"><h3>Live Activity</h3><span class="pill">${this.store.activity.length}</span></div><div class="feed">${items}</div>`);
    $('#rightPanel').querySelectorAll('.feed-row[data-agent]').forEach(r => r.addEventListener('click', () => {
      const a = this.store.getAgent(r.dataset.agent); if (a) { this.engine.select(a.id); this.engine.focusAgent(a); }
    }));
  };

  UI.showAgent = function (a) {
    this.rightMode = 'agent'; this._agentId = a.id;
    const col = STATUS_COLORS[a.status] || '#8a90a6';
    const task = a.currentTaskId ? this.store.getTask(a.currentTaskId) : null;
    const loc = this.roomOf(a);
    this.panel(`
      <div class="panel-head"><button class="back" id="pBack">←</button><h3>Agent</h3></div>
      <div class="agent-card">
        <div class="ava" style="background:${a.palette.shirt}">${a.name[0]}</div>
        <div><div class="a-name">${esc(a.name)}</div><div class="a-role">${esc(a.role)}</div></div>
      </div>
      <div class="status-line"><span class="dot" style="background:${col}"></span><b>${a.statusLabel()}</b>${a.currentAction ? ` · <span class="soft">${esc(a.currentAction)}</span>` : ''}</div>
      ${task ? `<div class="cur-task"><div class="ct-title">${esc(task.title)}</div><div class="progress"><div class="bar" id="agProg" style="width:${task.progress || 0}%"></div></div><div class="soft small">${task.progress || 0}% · ${task.status}</div></div>` : `<div class="soft small nb">No active task</div>`}
      <div class="kv"><span>Location</span><b>${loc}</b></div>
      <div class="chips-row"><div class="chips-label">Skills</div>${a.skills.map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div>
      <div class="chips-row"><div class="chips-label">Tools</div>${a.tools.map(s => `<span class="chip alt">${esc(s)}</span>`).join('')}</div>
      <div class="kv"><span>Task queue</span><b>${a.taskQueue.length}</b></div>
      <div class="kv"><span>Tokens</span><b>${a.tokens.toLocaleString()}</b></div>
      <div class="kv"><span>Est. cost</span><b>$${a.cost.toFixed(2)}</b></div>
      ${a.status === 'WAITING_FOR_USER' ? `<button class="w-approve" id="agApprove">Review approval →</button>` : ''}
      <div class="a-actions">
        <button data-act="assign">Assign Task</button>
        <button data-act="focus">Center</button>
        <button data-act="${a.status === 'PAUSED' ? 'resume' : 'pause'}">${a.status === 'PAUSED' ? 'Resume' : 'Pause'}</button>
        <button data-act="meet">Call Meeting</button>
      </div>`);
    $('#pBack').addEventListener('click', () => this.showFeed());
    const ap = $('#agApprove'); if (ap) ap.addEventListener('click', () => this.openApproval(a.id));
    $('#rightPanel').querySelectorAll('.a-actions button').forEach(b => b.addEventListener('click', () => this.agentAction(a, b.dataset.act)));
  };
  UI.updateProgress = function (t) { const b = $('#agProg'); if (b) b.style.width = (t.progress || 0) + '%'; const s = $('#rightPanel .cur-task .small'); if (s) s.textContent = `${t.progress || 0}% · ${t.status}`; };

  UI.agentAction = function (a, act) {
    if (act === 'focus') this.engine.focusAgent(a);
    else if (act === 'assign') this.openTaskModal(a.id);
    else if (act === 'pause') { this.store.setStatus(a.id, 'PAUSED', 'paused by you'); this.store.log(`You paused ${a.name}`, { agentId: a.id }); }
    else if (act === 'resume') { this.director.workAtDesk(a, 'IDLE', ''); this.store.log(`You resumed ${a.name}`, { agentId: a.id }); }
    else if (act === 'meet') { const others = this.store.listAgents().filter(x => x.id !== a.id).slice(0, 3).map(x => x.id); this.director.startMeeting([a.id, ...others], 'Sync with ' + a.name); }
  };

  UI.roomOf = function (a) {
    const t = a.tile;
    for (const r of this.engine.world.rooms) if (t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h) return this.engine.world.ROOM_TYPES[r.type].name;
    return 'Corridor';
  };

  UI.renderAgentList = function () {
    const rows = this.store.listAgents().map(a => { const col = STATUS_COLORS[a.status]; return `<div class="feed-row" data-agent="${a.id}">
      <div class="ava sm" style="background:${a.palette.shirt}">${a.name[0]}</div>
      <div class="feed-body"><div class="feed-text"><b>${esc(a.name)}</b> <span class="soft">· ${esc(a.role)}</span></div>
      <div class="feed-time"><span class="dot" style="background:${col}"></span>${a.statusLabel()}</div></div></div>`; }).join('');
    this.panel(`<div class="panel-head"><h3>Agents</h3><span class="pill">${this.store.agents.size}</span></div><div class="feed">${rows}</div>`);
    $('#rightPanel').querySelectorAll('.feed-row').forEach(r => r.addEventListener('click', () => { const a = this.store.getAgent(r.dataset.agent); this.engine.select(a.id); this.engine.focusAgent(a); }));
  };
  UI.renderTaskList = function () {
    const ts = this.store.listTasks();
    const rows = ts.length ? ts.map(t => `<div class="feed-row"><span class="feed-dot" style="background:#38bdf8"></span>
      <div class="feed-body"><div class="feed-text">${esc(t.title)}</div><div class="feed-time">${t.status} · ${t.progress || 0}%</div></div></div>`).join('') : `<div class="empty">No tasks yet. Create one!</div>`;
    this.panel(`<div class="panel-head"><h3>Tasks</h3><span class="pill">${ts.length}</span></div><div class="feed">${rows}</div>`);
  };

  // ---------- Modals ----------
  UI.openTaskModal = function (presetAgent) {
    const agents = this.store.listAgents();
    const opts = agents.map(a => `<option value="${a.id}" ${a.id === presetAgent ? 'selected' : ''}>${esc(a.name)} — ${esc(a.role)}</option>`).join('');
    this.modal(`<h3>Create Task</h3>
      <label>Title</label><input id="tTitle" placeholder="e.g. Build landing page">
      <label>Description</label><textarea id="tDesc" rows="3" placeholder="What should the agent do?"></textarea>
      <div class="row2"><div><label>Assign agent</label><select id="tAgent">${opts}</select></div>
      <div><label>Priority</label><select id="tPrio"><option>Low</option><option selected>Medium</option><option>High</option></select></div></div>
      <label class="ck"><input type="checkbox" id="tDeleg" checked> Allow agent delegation</label>
      <div class="modal-actions"><button class="ghost" data-close>Cancel</button><button class="primary" id="tCreate">Create Task</button></div>`);
    $('#tCreate').addEventListener('click', () => {
      const title = $('#tTitle').value.trim() || 'Untitled task';
      const t = { id: 'tsk' + Math.random().toString(36).slice(2), title, description: $('#tDesc').value.trim(),
        assignedAgentId: $('#tAgent').value, priority: $('#tPrio').value, status: 'BACKLOG', createdBy: 'you', createdAt: new Date(), progress: 0, subtasks: [], activity: [] };
      this.store.addTask(t); this.director.assignTask(t); this.closeModal();
      const a = this.store.getAgent(t.assignedAgentId); if (a) { this.engine.select(a.id); this.engine.focusAgent(a); }
    });
  };

  UI.openApproval = function (agentId) {
    const a = this.store.getAgent(agentId); if (!a) return; const t = a._pendingTask;
    this.modal(`<h3>Approval needed</h3>
      <div class="ap-agent"><div class="ava" style="background:${a.palette.shirt}">${a.name[0]}</div><div><b>${esc(a.name)}</b><div class="soft">${esc(a.role)}</div></div></div>
      <div class="ap-q">${t ? esc('Approve “' + t.title + '”?') : 'Approve to publish the website?'}</div>
      <p class="soft small">The agent is paused waiting for your decision. Approving lets it finish; rejecting sends it back to revise.</p>
      <div class="modal-actions"><button class="danger" id="apReject">Reject</button><button class="ghost" id="apInstr">Give instructions</button><button class="primary" id="apApprove">Approve</button></div>`);
    $('#apApprove').addEventListener('click', () => { this.director.resolveApproval(agentId, true); this.closeModal(); this.clearNotif('approval', agentId); if (this._agentId === agentId) this.showAgent(a); });
    $('#apReject').addEventListener('click', () => { this.director.resolveApproval(agentId, false); this.closeModal(); this.clearNotif('approval', agentId); if (this._agentId === agentId) this.showAgent(a); });
    $('#apInstr').addEventListener('click', () => { this.director.resolveApproval(agentId, false); this.closeModal(); this.clearNotif('approval', agentId); });
  };

  UI.modal = function (html) { const w = $('#modalWrap'); w.innerHTML = `<div class="modal">${html}</div>`; w.hidden = false;
    w.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => this.closeModal()));
    w.onclick = e => { if (e.target === w) this.closeModal(); }; };
  UI.closeModal = function () { $('#modalWrap').hidden = true; $('#modalWrap').innerHTML = ''; };

  // ---------- Notifications ----------
  UI.onNotification = function (n) {
    const list = this.store.notifications.filter(x => !x.read);
    const badge = $('#notifBadge'); badge.hidden = list.length === 0; badge.textContent = list.length;
    this.toast(n);
  };
  UI.clearNotif = function (type, agentId) { this.store.notifications.forEach(n => { if (n.type === type && n.agentId === agentId) n.read = true; });
    const list = this.store.notifications.filter(x => !x.read); const badge = $('#notifBadge'); badge.hidden = list.length === 0; badge.textContent = list.length; };
  UI.toast = function (n) {
    const t = el('div', 'toast', `<b>${esc(n.title)}</b><div class="soft small">${esc(n.text || '')}</div>`);
    $('#toasts').appendChild(t);
    t.addEventListener('click', () => { if (n.agentId) { const a = this.store.getAgent(n.agentId); this.engine.select(a.id); this.engine.focusAgent(a); if (n.type === 'approval') this.openApproval(n.agentId); } t.remove(); });
    setTimeout(() => { t.classList.add('show'); }, 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 5200);
  };

  UI.wireButtons = function () {
    $('#btnCreateTask').addEventListener('click', () => this.openTaskModal());
    $('#btnAddAgent').addEventListener('click', () => this.toast({ title: 'Add Agent', text: 'Agent onboarding — coming in next iteration.' }));
    $('#btnFit').addEventListener('click', () => this.engine.fit());
    $('#btnBell').addEventListener('click', () => { const pend = this.store.notifications.find(n => !n.read && n.type === 'approval'); if (pend) this.openApproval(pend.agentId); else this.showFeed(); });
    const s = $('#globalSearch'); s.addEventListener('keydown', e => { if (e.key === 'Enter') { const q = s.value.toLowerCase().trim(); const a = this.store.listAgents().find(x => x.name.toLowerCase().includes(q) || x.role.toLowerCase().includes(q)); if (a) { this.engine.select(a.id); this.engine.focusAgent(a); } } });
  };
  UI.tooltip = function (a, p) { const tp = $('#tooltip'); if (!a) { tp.hidden = true; return; } tp.hidden = false; tp.style.left = p.x + 14 + 'px'; tp.style.top = p.y + 'px'; tp.innerHTML = `<b>${esc(a.name)}</b> · ${esc(a.role)}<br><span class="soft small">${a.statusLabel()}</span>`; };

  global.OfficeUI = UI;
})(window);

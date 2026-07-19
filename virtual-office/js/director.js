/* Director: turns high-level intents (assign task, start meeting, request
 * approval, idle) into agent movement + status, emitting bus events. In a
 * real deployment most of this is replaced by backend events; the demo
 * driver here makes the office feel alive out of the box. */
(function (global) {
  const T = 32;

  const TEAM = [
    { id: 'daniel', name: 'Daniel', role: 'CEO / Manager', desk: 'd10', pal: { hair: '#6b4423', skin: '#e8b48c', shirt: '#3b6fb0' }, opts: { headset: true }, skills: ['Strategy', 'Planning', 'Leadership'], tools: ['Notion', 'Slack'] },
    { id: 'alex', name: 'Alex', role: 'Developer', desk: 'd3', pal: { hair: '#20202a', skin: '#e2a884', shirt: '#2f9d6b' }, skills: ['TypeScript', 'Node', 'React'], tools: ['VS Code', 'GitHub'] },
    { id: 'maya', name: 'Maya', role: 'Designer', desk: 'd7', pal: { hair: '#c85fd8', skin: '#f0c1a0', shirt: '#7c5ce8' }, skills: ['UI/UX', 'Figma', 'Branding'], tools: ['Figma'] },
    { id: 'sophie', name: 'Sophie', role: 'Researcher', desk: 'd1', pal: { hair: '#1c1c26', skin: '#e6b090', shirt: '#e06a5a' }, opts: { glasses: true }, skills: ['Research', 'Analysis'], tools: ['Browser', 'Docs'] },
    { id: 'oliver', name: 'Oliver', role: 'Marketing', desk: 'd2', pal: { hair: '#e8c65a', skin: '#eab98f', shirt: '#3aa15a' }, skills: ['Positioning', 'Ads', 'SEO'], tools: ['Ahrefs'] },
    { id: 'lucas', name: 'Lucas', role: 'Sales', desk: 'd4', pal: { hair: '#4a3220', skin: '#dfa079', shirt: '#c25b3a' }, skills: ['Outreach', 'CRM'], tools: ['HubSpot'] },
    { id: 'emma', name: 'Emma', role: 'Finance', desk: 'd5', pal: { hair: '#d3452f', skin: '#f0c0a2', shirt: '#e88bb0' }, skills: ['Budgeting', 'Reports'], tools: ['Excel'] },
    { id: 'noah', name: 'Noah', role: 'Support', desk: 'd6', pal: { hair: '#241d16', skin: '#dda57e', shirt: '#3b6fb0' }, skills: ['Tickets', 'Docs'], tools: ['Zendesk'] },
    { id: 'gena', name: 'Gena', role: 'GPS Dispatch', desk: 'd9', pal: { hair: '#2b2b30', skin: '#e0a985', shirt: '#2f9a8f' }, skills: ['Fleet tracking', 'Routing', 'Dispatch'], tools: ['PanGPS', 'Maps'], live: 'gps' },
  ];

  class Director {
    constructor(world, store, bus) {
      this.world = world; this.store = store; this.bus = bus;
      this.grid = new Pathfinding.Grid(world.blocked);
      this.deskById = Object.fromEntries(world.desks.map(d => [d.id, d]));
      this.agents = [];
      this.idleTimers = new Map();
    }

    spawnTeam() {
      const ent = this.world.entrance;
      TEAM.forEach((cfg, i) => {
        const a = new Agent({
          id: cfg.id, name: cfg.name, role: cfg.role, palette: cfg.pal, opts: cfg.opts,
          deskId: cfg.desk, skills: cfg.skills, tools: cfg.tools,
          x: (ent.x + 0.5) * T, y: (ent.y - 0.5) * T,
        });
        a.live = cfg.live || null;
        this.agents.push(a); this.store.addAgent(a);
        setTimeout(() => this._enter(a), 400 + i * 650);
      });
    }
    _enter(a) {
      const d = this.deskById[a.deskId];
      this.store.log(`${a.name} joined the office`, { agentId: a.id, kind: 'spawn' });
      this.bus.emit('agent.spawned', a);
      this.store.setStatus(a.id, 'MOVING', 'walking to desk');
      a.goTo(this.grid, d.stand[0], d.stand[1], () => this._sit(a, d));
    }
    _sit(a, d) {
      a.x = (d.stand[0] + 0.5) * T; a.y = (d.stand[1] + 0.5) * T; a.seated = true; a.dir = 'up';
      a.homeDesk = d;
    }

    // send agent to desk, then set a working status
    workAtDesk(a, status, action) {
      const d = a.homeDesk || this.deskById[a.deskId];
      const doWork = () => { this._sit(a, d); this.store.setStatus(a.id, status, action); };
      if (a.tile.x === d.stand[0] && a.tile.y === d.stand[1]) { doWork(); return; }
      this.store.setStatus(a.id, 'MOVING', 'walking to desk');
      a.goTo(this.grid, d.stand[0], d.stand[1], doWork);
    }

    gotoPoint(a, pt, status, action, after) {
      this.store.setStatus(a.id, 'MOVING', action || '');
      a.seated = false;
      a.goTo(this.grid, pt.x, pt.y, () => { a.seated = false; if (status) this.store.setStatus(a.id, status, action); if (after) after(); });
    }

    // ---- Tasks ----
    assignTask(task) {
      const a = this.store.getAgent(task.assignedAgentId); if (!a) return;
      task.status = 'ASSIGNED'; task.startedAt = new Date(); task.progress = 0;
      a.currentTaskId = task.id; a.taskQueue.push(task.id);
      a.flash('task'); a.bubbleT = 2.5;
      this.store.log(`${a.name} was assigned “${task.title}”`, { agentId: a.id, taskId: task.id, kind: 'task' });
      const st = statusForRole(a.role);
      this.workAtDesk(a, st.status, st.action);
      task.status = 'IN_PROGRESS'; this.bus.emit('agent.task_started', task);
      task._runT = 0; task._runDur = 14 + Math.random() * 14;
    }

    tick(dt) {
      for (const a of this.agents) a.update(dt);
      // task progress
      for (const t of this.store.listTasks()) {
        if (t.status !== 'IN_PROGRESS') continue;
        t._runT = (t._runT || 0) + dt;
        t.progress = Math.min(99, Math.round((t._runT / t._runDur) * 100));
        this.bus.emit('agent.task_progress', t);
        if (t._runT >= t._runDur) this._completeTask(t);
      }
      // idle scheduler
      this._idleTick(dt);
    }

    _completeTask(t) {
      const a = this.store.getAgent(t.assignedAgentId);
      // 25% chance the task needs human approval before completing
      if (!t._approvalAsked && Math.random() < 0.25) { t._approvalAsked = true; this.requestApproval(a, t); return; }
      t.status = 'COMPLETED'; t.progress = 100; t.completedAt = new Date();
      if (a) { a.flash('success'); this.store.setStatus(a.id, 'COMPLETED', 'done'); a.currentTaskId = null;
        this.store.log(`${a.name} completed “${t.title}”`, { agentId: a.id, taskId: t.id, kind: 'done' });
        setTimeout(() => { if (a.status === 'COMPLETED') this.store.setStatus(a.id, 'IDLE', ''); }, 2200); }
      this.bus.emit('agent.task_completed', t);
    }

    requestApproval(a, t) {
      if (!a) return;
      this.store.setStatus(a.id, 'WAITING_FOR_USER', 'needs your approval');
      a.bubbleT = 9999; a._pendingTask = t; if (t) t.status = 'NEEDS_APPROVAL';
      this.store.log(`${a.name} needs your approval${t ? ' for “' + t.title + '”' : ''}`, { agentId: a.id, taskId: t && t.id, kind: 'approval' });
      this.store.notify({ type: 'approval', title: `${a.name} needs approval`, agentId: a.id, taskId: t && t.id, text: t ? `Approve “${t.title}”?` : 'Approval requested' });
      this.bus.emit('agent.needs_approval', { agent: a, task: t });
    }
    resolveApproval(agentId, approved) {
      const a = this.store.getAgent(agentId); if (!a) return;
      const t = a._pendingTask; a._pendingTask = null; a.bubbleT = 2.5;
      if (approved) { this.store.log(`You approved ${a.name}${t ? '’s “' + t.title + '”' : ''}`, { agentId, kind: 'done' });
        if (t) { t.status = 'IN_PROGRESS'; t._runT = t._runDur; t._approvalAsked = true; this.store.setStatus(a.id, statusForRole(a.role).status, 'finishing'); }
        else this.store.setStatus(a.id, 'IDLE', ''); }
      else { this.store.log(`You sent ${a.name} back to revise`, { agentId, kind: 'task' });
        if (t) { t.status = 'IN_PROGRESS'; t._runT = 0; t._runDur = 10; } this.store.setStatus(a.id, 'REVIEWING', 'revising'); }
    }

    // ---- Meetings ----
    startMeeting(agentIds, title) {
      const id = 'mtg' + Math.random().toString(36).slice(2);
      const seats = this.world.meetingSeats;
      const meeting = { id, title: title || 'Team Sync', agents: agentIds.slice(), status: 'gathering', startedAt: new Date() };
      this.store.meetings.set(id, meeting); this.bus.emit('meeting.created', meeting);
      this.store.log(`Meeting started: “${meeting.title}”`, { kind: 'meeting' });
      agentIds.forEach((aid, i) => {
        const a = this.store.getAgent(aid); if (!a) return; const seat = seats[i % seats.length];
        a._prevStatus = a.status; a._returnDesk = a.homeDesk;
        this.gotoPoint(a, { x: seat.x, y: seat.y }, 'MEETING', 'in meeting', () => { a.seated = true; a.dir = seat.dir; });
      });
      meeting.status = 'active'; this.bus.emit('meeting.started', meeting);
      setTimeout(() => this._endMeeting(meeting), 16000);
      return meeting;
    }
    _endMeeting(m) {
      m.status = 'finished'; m.summary = 'Aligned on next steps.';
      this.bus.emit('meeting.finished', m); this.store.log(`Meeting finished: “${m.title}”`, { kind: 'meeting' });
      m.agents.forEach(aid => { const a = this.store.getAgent(aid); if (!a) return;
        this.store.setStatus(a.id, 'MOVING', 'back to desk'); a.seated = false;
        const d = a._returnDesk || this.deskById[a.deskId];
        a.goTo(this.grid, d.stand[0], d.stand[1], () => { this._sit(a, d); this.store.setStatus(a.id, a._prevStatus || 'IDLE', ''); }); });
      setTimeout(() => this.store.meetings.delete(m.id), 4000);
    }

    // ---- Idle behaviour ----
    _idleTick(dt) {
      for (const a of this.agents) {
        if (a.live) continue; // GPS/live agents stay at their post
        if (a.status !== 'IDLE' || a.moving) { this.idleTimers.set(a.id, 0); continue; }
        let t = (this.idleTimers.get(a.id) || 0) + dt;
        if (t > 6 + Math.random() * 8) {
          t = 0;
          if (Math.random() < 0.5) { // coffee/lounge trip
            const spots = Math.random() < 0.5 ? this.world.points.coffee : this.world.points.lounge;
            const pt = spots[(Math.random() * spots.length) | 0];
            this.gotoPoint(a, pt, 'THINKING', 'taking a break', () => {
              a.bubbleT = 3; setTimeout(() => { if (a.status === 'THINKING') this.workAtDesk(a, 'IDLE', ''); }, 4000 + Math.random() * 4000);
            });
          }
        }
        this.idleTimers.set(a.id, t);
      }
    }

    // ---- demo seed of initial live statuses ----
    seedDemoStates() {
      const set = (id, st, act) => { const a = this.store.getAgent(id); if (a && !a.moving) { this.workAtDesk(a, st, act); } else setTimeout(() => this.seedOne(id, st, act), 3000); };
      setTimeout(() => {
        this.seedOne('daniel', 'WORKING', 'reviewing roadmap');
        this.seedOne('alex', 'CODING', 'building frontend');
        this.seedOne('maya', 'DESIGNING', 'landing page UI');
        this.seedOne('sophie', 'RESEARCHING', 'competitor analysis');
        this.seedOne('oliver', 'THINKING', 'positioning');
        this.seedOne('lucas', 'TALKING', 'client call');
        this.seedOne('emma', 'WORKING', 'monthly report');
        this.seedOne('noah', 'WAITING_FOR_USER', 'needs your approval');
      }, 6500);
      // Noah asks approval
      setTimeout(() => { const noah = this.store.getAgent('noah'); if (noah) this.requestApproval(noah, null); }, 9000);
      // a demo meeting a bit later
      setTimeout(() => this.startMeeting(['daniel', 'maya', 'oliver'], 'Product Meeting'), 20000);
    }
    seedOne(id, st, act) { const a = this.store.getAgent(id); if (!a) return; this.workAtDesk(a, st, act); }
  }

  function statusForRole(role) {
    if (/dev/i.test(role)) return { status: 'CODING', action: 'writing code' };
    if (/design/i.test(role)) return { status: 'DESIGNING', action: 'designing' };
    if (/research/i.test(role)) return { status: 'RESEARCHING', action: 'researching' };
    if (/market/i.test(role)) return { status: 'WRITING', action: 'drafting copy' };
    if (/sales/i.test(role)) return { status: 'TALKING', action: 'reaching out' };
    if (/support/i.test(role)) return { status: 'WRITING', action: 'answering tickets' };
    return { status: 'WORKING', action: 'working' };
  }

  global.OfficeDirector = Director;
  global.OfficeTeam = TEAM;
})(window);

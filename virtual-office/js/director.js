/* Director: turns high-level intents (assign task, start meeting, request
 * approval, idle) into agent movement + status, emitting bus events. In a
 * real deployment most of this is replaced by backend events; the demo
 * driver here makes the office feel alive out of the box. */
(function (global) {
  const T = 32;

  const TEAM = [
    { id: 'daniel', name: 'Даниил', role: 'CEO / Руководитель', desk: 'd10', pal: { hair: '#6b4423', skin: '#e8b48c', shirt: '#3b6fb0' }, opts: { headset: true }, skills: ['Стратегия', 'Планирование', 'Лидерство'], tools: ['Notion', 'Slack'] },
    { id: 'alex', name: 'Алекс', role: 'Разработчик', desk: 'd3', pal: { hair: '#20202a', skin: '#e2a884', shirt: '#2f9d6b' }, skills: ['TypeScript', 'Node', 'React'], tools: ['VS Code', 'GitHub'] },
    { id: 'maya', name: 'Майя', f: true, role: 'Дизайнер', desk: 'd7', pal: { hair: '#c85fd8', skin: '#f0c1a0', shirt: '#7c5ce8' }, skills: ['UI/UX', 'Figma', 'Брендинг'], tools: ['Figma'] },
    { id: 'sophie', name: 'София', f: true, role: 'Аналитик', desk: 'd1', pal: { hair: '#1c1c26', skin: '#e6b090', shirt: '#e06a5a' }, opts: { glasses: true }, skills: ['Исследования', 'Аналитика'], tools: ['Браузер', 'Docs'] },
    { id: 'oliver', name: 'Олег', role: 'Маркетинг', desk: 'd2', pal: { hair: '#e8c65a', skin: '#eab98f', shirt: '#3aa15a' }, skills: ['Позиционирование', 'Реклама', 'SEO'], tools: ['Ahrefs'] },
    { id: 'lucas', name: 'Лука', role: 'Продажи', desk: 'd4', pal: { hair: '#4a3220', skin: '#dfa079', shirt: '#c25b3a' }, skills: ['Переговоры', 'CRM'], tools: ['HubSpot'] },
    { id: 'emma', name: 'Эмма', f: true, role: 'Финансы', desk: 'd5', pal: { hair: '#d3452f', skin: '#f0c0a2', shirt: '#e88bb0' }, skills: ['Бюджеты', 'Отчёты'], tools: ['Excel'] },
    { id: 'noah', name: 'Ной', role: 'Поддержка', desk: 'd6', pal: { hair: '#241d16', skin: '#dda57e', shirt: '#3b6fb0' }, skills: ['Тикеты', 'Документация'], tools: ['Zendesk'] },
    { id: 'gena', name: 'Гена', role: 'GPS-диспетчер', desk: 'd9', pal: { hair: '#2b2b30', skin: '#e0a985', shirt: '#2f9a8f' }, skills: ['Мониторинг парка', 'Маршруты', 'Диспетчеризация'], tools: ['PanGPS', 'Карты'], live: 'gps' },
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
        a.live = cfg.live || null; a.female = !!cfg.f;
        this.agents.push(a); this.store.addAgent(a);
        setTimeout(() => this._enter(a), 400 + i * 650);
      });
    }
    _enter(a) {
      const d = this.deskById[a.deskId];
      this.store.log(`${a.name} вош${a.female?'ла':'ёл'} в офис`, { agentId: a.id, kind: 'spawn' });
      this.bus.emit('agent.spawned', a);
      this.store.setStatus(a.id, 'MOVING', 'идёт к столу');
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
      this.store.setStatus(a.id, 'MOVING', 'идёт к столу');
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
      this.store.log(`${a.name} получил${a.female?'а':''} задачу «${task.title}»`, { agentId: a.id, taskId: task.id, kind: 'task' });
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
      if (a) { a.flash('success'); this.store.setStatus(a.id, 'COMPLETED', 'готово'); a.currentTaskId = null;
        this.store.log(`${a.name} выполнил${a.female?'а':''} «${t.title}»`, { agentId: a.id, taskId: t.id, kind: 'done' });
        setTimeout(() => { if (a.status === 'COMPLETED') this.store.setStatus(a.id, 'IDLE', ''); }, 2200); }
      this.bus.emit('agent.task_completed', t);
    }

    requestApproval(a, t) {
      if (!a) return;
      this.store.setStatus(a.id, 'WAITING_FOR_USER', 'нужно ваше решение');
      a.bubbleT = 9999; a._pendingTask = t; if (t) t.status = 'NEEDS_APPROVAL';
      this.store.log(`${a.name} нужно ваше решение${t ? ' по «' + t.title + '»' : ''}`, { agentId: a.id, taskId: t && t.id, kind: 'approval' });
      this.store.notify({ type: 'approval', title: `${a.name}: нужно решение`, agentId: a.id, taskId: t && t.id, text: t ? `Одобрить «${t.title}»?` : 'Требуется ваше решение' });
      this.bus.emit('agent.needs_approval', { agent: a, task: t });
    }
    resolveApproval(agentId, approved) {
      const a = this.store.getAgent(agentId); if (!a) return;
      const t = a._pendingTask; a._pendingTask = null; a.bubbleT = 2.5;
      if (approved) { this.store.log(`Вы одобрили ${a.name}${t ? ' · «' + t.title + '»' : ''}`, { agentId, kind: 'done' });
        if (t) { t.status = 'IN_PROGRESS'; t._runT = t._runDur; t._approvalAsked = true; this.store.setStatus(a.id, statusForRole(a.role).status, 'завершает'); }
        else this.store.setStatus(a.id, 'IDLE', ''); }
      else { this.store.log(`Вы отправили ${a.name} на доработку`, { agentId, kind: 'task' });
        if (t) { t.status = 'IN_PROGRESS'; t._runT = 0; t._runDur = 10; } this.store.setStatus(a.id, 'REVIEWING', 'дорабатывает'); }
    }

    // ---- Meetings ----
    startMeeting(agentIds, title) {
      const id = 'mtg' + Math.random().toString(36).slice(2);
      const seats = this.world.meetingSeats;
      const meeting = { id, title: title || 'Синхронизация', agents: agentIds.slice(), status: 'gathering', startedAt: new Date() };
      this.store.meetings.set(id, meeting); this.bus.emit('meeting.created', meeting);
      this.store.log(`Встреча началась: «${meeting.title}»`, { kind: 'meeting' });
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
      this.bus.emit('meeting.finished', m); this.store.log(`Встреча завершена: «${m.title}»`, { kind: 'meeting' });
      m.agents.forEach(aid => { const a = this.store.getAgent(aid); if (!a) return;
        this.store.setStatus(a.id, 'MOVING', 'возвращается к столу'); a.seated = false;
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
            this.gotoPoint(a, pt, 'THINKING', 'на перерыве', () => {
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
        this.seedOne('daniel', 'WORKING', 'смотрит дорожную карту');
        this.seedOne('alex', 'CODING', 'делает фронтенд');
        this.seedOne('maya', 'DESIGNING', 'дизайн лендинга');
        this.seedOne('sophie', 'RESEARCHING', 'анализ конкурентов');
        this.seedOne('oliver', 'THINKING', 'позиционирование');
        this.seedOne('lucas', 'TALKING', 'звонок клиенту');
        this.seedOne('emma', 'WORKING', 'месячный отчёт');
        this.seedOne('noah', 'WAITING_FOR_USER', 'нужно ваше решение');
      }, 6500);
      // Noah asks approval
      setTimeout(() => { const noah = this.store.getAgent('noah'); if (noah) this.requestApproval(noah, null); }, 9000);
      // a demo meeting a bit later
      setTimeout(() => this.startMeeting(['daniel', 'maya', 'oliver'], 'Продуктовая встреча'), 20000);
    }
    seedOne(id, st, act) { const a = this.store.getAgent(id); if (!a) return; this.workAtDesk(a, st, act); }
  }

  function statusForRole(role) {
    if (/разраб|dev/i.test(role)) return { status: 'CODING', action: 'пишет код' };
    if (/дизайн|design/i.test(role)) return { status: 'DESIGNING', action: 'рисует макет' };
    if (/аналит|research/i.test(role)) return { status: 'RESEARCHING', action: 'изучает данные' };
    if (/маркет|market/i.test(role)) return { status: 'WRITING', action: 'готовит тексты' };
    if (/продаж|sales/i.test(role)) return { status: 'TALKING', action: 'общается с клиентом' };
    if (/поддержк|support/i.test(role)) return { status: 'WRITING', action: 'отвечает на тикеты' };
    return { status: 'WORKING', action: 'работает' };
  }

  global.OfficeDirector = Director;
  global.OfficeTeam = TEAM;
})(window);

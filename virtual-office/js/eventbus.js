/* AgentEventBus + Store = single source of truth. The office scene and
 * the UI both subscribe here. A real AI-orchestration backend would push
 * the same events (agent.status_changed, agent.task_*, meeting.*) into
 * this bus over WebSocket; today they are produced by the demo driver. */
(function (global) {
  class EventBus {
    constructor() { this.map = new Map(); }
    on(type, fn) { (this.map.get(type) || this.map.set(type, []).get(type)).push(fn); return () => this.off(type, fn); }
    off(type, fn) { const a = this.map.get(type); if (a) this.map.set(type, a.filter(f => f !== fn)); }
    emit(type, payload) {
      (this.map.get(type) || []).forEach(f => { try { f(payload); } catch (e) { console.error(e); } });
      (this.map.get('*') || []).forEach(f => { try { f({ type, payload }); } catch (e) {} });
    }
  }

  const bus = new EventBus();

  const store = {
    agents: new Map(),
    tasks: new Map(),
    meetings: new Map(),
    notifications: [],
    activity: [],
    selectedAgentId: null,

    addAgent(a) { this.agents.set(a.id, a); bus.emit('agent.created', a); },
    getAgent(id) { return this.agents.get(id); },
    listAgents() { return [...this.agents.values()]; },

    setStatus(id, status, action) {
      const a = this.agents.get(id); if (!a) return;
      const prev = a.status; a.status = status; if (action !== undefined) a.currentAction = action;
      bus.emit('agent.status_changed', { agent: a, prev, status });
      bus.emit('agent.updated', a);
    },

    addTask(t) { this.tasks.set(t.id, t); bus.emit('agent.task_assigned', t); },
    getTask(id) { return this.tasks.get(id); },
    listTasks() { return [...this.tasks.values()]; },

    log(text, meta = {}) {
      const e = { id: 'ev' + (Date.now() + Math.random()).toString(36), text, time: new Date(), ...meta };
      this.activity.unshift(e); if (this.activity.length > 200) this.activity.pop();
      bus.emit('activity', e); return e;
    },
    notify(n) {
      n = { id: 'nt' + Math.random().toString(36).slice(2), read: false, time: new Date(), ...n };
      this.notifications.unshift(n); bus.emit('notification', n); return n;
    },
  };

  global.OfficeBus = bus;
  global.OfficeStore = store;
})(window);

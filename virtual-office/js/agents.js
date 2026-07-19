/* Agent = position + movement + animation. AgentSpriteController maps
 * the agent's STATUS (source of truth) onto a sprite animation. Movement
 * consumes A* paths from Pathfinding and walks pixel waypoints. */
(function (global) {
  const T = 32;
  const SPEED = 78; // px/s

  const STATUS_BUBBLE = {
    IDLE: null, MOVING: null,
    THINKING: '💭', WORKING: '⚙', CODING: '⌨', DESIGNING: '🎨',
    RESEARCHING: '🔎', READING: '📖', WRITING: '✍', TALKING: '💬',
    MEETING: '💬', WAITING_FOR_AGENT: '⏳', WAITING_FOR_USER: '❓',
    REVIEWING: '🔍', PAUSED: '⏸', ERROR: '❗', COMPLETED: '✓',
  };
  const STATUS_LABEL = {
    IDLE: 'Свободен', MOVING: 'Идёт', THINKING: 'Думает', WORKING: 'Работает',
    CODING: 'Пишет код', DESIGNING: 'Дизайнит', RESEARCHING: 'Исследует',
    READING: 'Читает', WRITING: 'Пишет', TALKING: 'Разговор', MEETING: 'На встрече',
    WAITING_FOR_AGENT: 'Ждёт коллегу', WAITING_FOR_USER: 'Нужно решение',
    REVIEWING: 'Проверяет', PAUSED: 'Пауза', ERROR: 'Ошибка', COMPLETED: 'Готово',
  };
  // which statuses render as "seated & working" vs "sitting" vs standing/idle
  const SEATED_TYPE = new Set(['WORKING', 'CODING', 'DESIGNING', 'WRITING', 'REVIEWING']);
  const SEATED_STILL = new Set(['RESEARCHING', 'READING', 'THINKING', 'TALKING', 'MEETING', 'WAITING_FOR_AGENT', 'WAITING_FOR_USER', 'PAUSED', 'ERROR', 'COMPLETED']);

  class Agent {
    constructor(cfg) {
      Object.assign(this, {
        id: cfg.id, name: cfg.name, role: cfg.role, palette: cfg.palette, opts: cfg.opts || {},
        status: 'IDLE', currentAction: '', currentTaskId: null, deskId: cfg.deskId || null,
        skills: cfg.skills || [], tools: cfg.tools || [], projectIds: cfg.projectIds || [],
        taskQueue: [], memory: cfg.memory || [], tokens: 0, cost: 0,
        x: cfg.x, y: cfg.y, dir: 'down', path: null, pathIdx: 0,
        moving: false, onArrive: null, seated: false, animTime: 0, frame: 0, bob: 0,
        bubbleT: 0, effect: null, effectT: 0,
      });
      this.sprites = AgentSprites.makeSet(cfg.palette, cfg.opts || {});
    }
    setSprites() { this.sprites = AgentSprites.makeSet(this.palette, this.opts); }
    get tile() { return { x: Math.round(this.x / T), y: Math.round(this.y / T) }; }

    goTo(grid, gx, gy, onArrive) {
      const s = this.tile;
      const path = Pathfinding.findPath(grid, s.x, s.y, gx, gy);
      if (!path || path.length < 1) { if (onArrive) onArrive(); return false; }
      this.path = path.map(p => ({ x: p.x * T + T / 2, y: p.y * T + T / 2 }));
      this.pathIdx = 0; this.moving = true; this.seated = false; this.onArrive = onArrive || null;
      OfficeBus.emit('agent.started_moving', this);
      return true;
    }

    faceDir(dx, dy) {
      if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
      else this.dir = dy > 0 ? 'down' : 'up';
    }

    update(dt) {
      this.animTime += dt;
      if (this.bubbleT > 0) this.bubbleT -= dt;
      if (this.effectT > 0) { this.effectT -= dt; if (this.effectT <= 0) this.effect = null; }
      if (this.moving && this.path) {
        const wp = this.path[this.pathIdx];
        const dx = wp.x - this.x, dy = wp.y - this.y;
        const dist = Math.hypot(dx, dy);
        const step = SPEED * dt;
        if (dist <= step) {
          this.x = wp.x; this.y = wp.y; this.pathIdx++;
          if (this.pathIdx >= this.path.length) {
            this.moving = false; this.path = null;
            OfficeBus.emit('agent.arrived', this);
            const cb = this.onArrive; this.onArrive = null; if (cb) cb();
          }
        } else {
          this.x += (dx / dist) * step; this.y += (dy / dist) * step;
          this.faceDir(dx, dy);
        }
        // walk frame
        this.frame = Math.floor(this.animTime * 8) % 4;
        this.bob = 0;
      } else {
        this.frame = Math.floor(this.animTime * 2) % 2;
        // gentle life: fast small bob while typing, slow bob while idle/standing
        const typing = this.seated && SEATED_TYPE.has(this.status);
        this.bob = Math.sin(this.animTime * (typing ? 6 : 2)) * (this.seated ? 0.7 : 1.1);
      }
    }

    // AgentSpriteController: returns the canvas frame for current state
    currentFrame() {
      if (this.moving) return this.sprites[this.dir][this.frame] || this.sprites.idle[0];
      if (this.seated) {
        if (SEATED_TYPE.has(this.status)) return this.sprites.type[this.frame % this.sprites.type.length];
        return this.sprites.sit[0];
      }
      return this.sprites.idle[0];
    }
    bubbleIcon() { return STATUS_BUBBLE[this.status] || null; }
    statusLabel() { return STATUS_LABEL[this.status] || this.status; }
    flash(effect, t = 1.2) { this.effect = effect; this.effectT = t; this.bubbleT = 2.4; }
  }

  global.Agent = Agent;
  global.AgentMeta = { STATUS_BUBBLE, STATUS_LABEL, SEATED_TYPE, SEATED_STILL, T, SPEED };
})(window);

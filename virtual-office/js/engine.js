/* OfficeScene engine: camera + layered compositor + input.
 * Layers per frame: [world prerender] -> [furniture-front shadows] ->
 * [agents y-sorted] -> [bubbles/effects] -> [selection]. UI overlay is DOM. */
(function (global) {
  const T = 32;

  class Engine {
    constructor(canvas, world) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.world = world; this.worldCanvas = OfficeRender.prerenderWorld(world);
      // camera works in ISO-canvas pixel space (the prerender's own dimensions)
      this.viewW = this.worldCanvas.width; this.viewH = this.worldCanvas.height;
      this.agents = [];
      this.cam = { x: this.viewW / 2, y: this.viewH / 2, zoom: 1, tx: null, ty: null, tzoom: null };
      this.minZoom = 0.08; this.maxZoom = 2.6;
      this.selectedId = null; this.hoverId = null; this.time = 0;
      this.locked = true; // office view is pinned: no pan/zoom, only tap-to-select
      this.onSelect = null; this.onHover = null; this.meetings = [];
      this._motes = Array.from({ length: 26 }, () => ({ x: Math.random() * world.worldW, y: Math.random() * world.worldH, s: 0.3 + Math.random() * 0.7, p: Math.random() * 6.28 }));
      this._initInput(); this.resize(); this.fit();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = this.canvas.getBoundingClientRect();
      this.vw = r.width; this.vh = r.height;
      this.canvas.width = Math.max(1, r.width * dpr); this.canvas.height = Math.max(1, r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.imageSmoothingEnabled = false;
    }
    fit() {
      const pad = this.vw < 700 ? 1.06 : 0.95; // phones: fill width (tiny corner clip ok)
      const z = Math.min(this.vw / this.viewW, this.vh / this.viewH) * pad;
      this.cam.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, z));
      this.cam.x = this.viewW / 2; this.cam.y = this.viewH / 2;
      this.cam.tx = this.cam.ty = this.cam.tzoom = null;
    }
    focusOn(wx, wy, zoom) { if (this.locked) return; this.cam.tx = wx; this.cam.ty = wy; this.cam.tzoom = zoom || Math.min(this.maxZoom, 1.6); }
    focusAgent(a) { if (a) this.focusOn(a.x, a.y, 1.7); }

    worldToScreen(wx, wy) { return { x: (wx - this.cam.x) * this.cam.zoom + this.vw / 2, y: (wy - this.cam.y) * this.cam.zoom + this.vh / 2 }; }
    screenToWorld(sx, sy) { return { x: (sx - this.vw / 2) / this.cam.zoom + this.cam.x, y: (sy - this.vh / 2) / this.cam.zoom + this.cam.y }; }

    _clampCam() {
      const m = 120; // allow some margin past edges
      this.cam.x = Math.max(-m, Math.min(this.viewW + m, this.cam.x));
      this.cam.y = Math.max(-m, Math.min(this.viewH + m, this.cam.y));
      this.cam.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.cam.zoom));
    }

    // Input: tap/click selects an agent. Camera is PINNED (this.locked) —
    // no drag-pan, wheel-zoom or pinch, so the office never moves under the user.
    _initInput() {
      const c = this.canvas; let down = false, moved = 0, lx = 0, ly = 0;
      const getXY = e => { const r = c.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
      c.addEventListener('mousedown', e => { down = true; moved = 0; const p = getXY(e); lx = p.x; ly = p.y; });
      window.addEventListener('mousemove', e => {
        const p = getXY(e);
        if (down) { const dx = p.x - lx, dy = p.y - ly; moved += Math.abs(dx) + Math.abs(dy);
          if (!this.locked) { this.cam.x -= dx / this.cam.zoom; this.cam.y -= dy / this.cam.zoom; this.cam.tx = null; lx = p.x; ly = p.y; this._clampCam(); } }
        else { const hit = this._hitAgent(p.x, p.y); const id = hit ? hit.id : null; if (id !== this.hoverId) { this.hoverId = id; c.style.cursor = id ? 'pointer' : 'default'; if (this.onHover) this.onHover(hit, p); } }
      });
      window.addEventListener('mouseup', e => { if (!down) return; down = false;
        if (moved < 6) { const p = getXY(e); const hit = this._hitAgent(p.x, p.y); this.select(hit ? hit.id : null); } });
      c.addEventListener('wheel', e => { e.preventDefault(); if (this.locked) return;
        const p = getXY(e); const before = this.screenToWorld(p.x, p.y);
        const f = e.deltaY < 0 ? 1.12 : 1 / 1.12; this.cam.zoom *= f; this.cam.tzoom = null; this._clampCam();
        const after = this.screenToWorld(p.x, p.y); this.cam.x += before.x - after.x; this.cam.y += before.y - after.y; }, { passive: false });
      c.addEventListener('touchstart', e => { if (e.touches.length === 1) { down = true; moved = 0; const p = getXY(e); lx = p.x; ly = p.y; } }, { passive: true });
      c.addEventListener('touchmove', e => { if (down && e.touches.length === 1) { const p = getXY(e); moved += Math.abs(p.x - lx) + Math.abs(p.y - ly); lx = p.x; ly = p.y; } }, { passive: true });
      c.addEventListener('touchend', () => { if (down && moved < 8) { const hit = this._hitAgent(lx, ly); this.select(hit ? hit.id : null); } down = false; });
    }

    // pick the nearest agent to the tap, comparing in SCREEN space (iso-safe)
    _hitAgent(sx, sy) {
      let best = null, bd = 26 * 26;
      for (const a of this.agents) {
        const ip = OfficeRender.projectPx(a.x, a.y, 20); // ~body centre
        const s = this.worldToScreen(ip.x, ip.y);
        const dx = sx - s.x, dy = sy - s.y; const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = a; }
      }
      return best;
    }
    select(id) { this.selectedId = id; if (this.onSelect) this.onSelect(id ? this.world._store.getAgent(id) : null); }
    clearSelection() { this.selectedId = null; } // set selection without firing onSelect (avoids feedback loops)

    step(dt) {
      this.time += dt;
      // camera easing toward target
      if (this.cam.tx != null) { this.cam.x += (this.cam.tx - this.cam.x) * Math.min(1, dt * 6); if (Math.abs(this.cam.tx - this.cam.x) < 0.5) this.cam.tx = null; }
      if (this.cam.ty != null) { this.cam.y += (this.cam.ty - this.cam.y) * Math.min(1, dt * 6); if (Math.abs(this.cam.ty - this.cam.y) < 0.5) this.cam.ty = null; }
      if (this.cam.tzoom != null) { this.cam.zoom += (this.cam.tzoom - this.cam.zoom) * Math.min(1, dt * 6); if (Math.abs(this.cam.tzoom - this.cam.zoom) < 0.01) this.cam.tzoom = null; }
    }

    render() {
      const ctx = this.ctx, z = this.cam.zoom;
      ctx.fillStyle = '#0d0a16'; ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.save();
      ctx.translate(this.vw / 2, this.vh / 2); ctx.scale(z, z); ctx.translate(-this.cam.x, -this.cam.y);
      // world
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.worldCanvas, 0, 0);
      this._ambientBack(ctx);
      // meeting labels above table
      for (const m of this.meetings) if (m.status === 'active') this._meetingLabel(ctx, m);
      // agents depth-sorted (iso: farther = smaller x+y, drawn first)
      const sorted = this.agents.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y));
      for (const a of sorted) this._drawAgent(ctx, a);
      this._ambientFront(ctx);
      ctx.restore();
    }

    // glows behind agents: monitor screens + server LEDs (iso-projected)
    _ambientBack(ctx) {
      const T = 32, t = this.time; ctx.save();
      const occ = {}; for (const a of this.agents) if (a.homeDesk && a.seated) occ[a.homeDesk.id] = a.status;
      for (const d of this.world.desks) {
        const st = occ[d.id]; const on = st && st !== 'MOVING'; if (!on) continue;
        const p = OfficeRender.projectPx((d.dx + 0.5) * T, (d.dy + 0.1) * T, 12); // monitor face
        const pulse = 0.5 + 0.16 * Math.sin(t * 2 + d.dx);
        const col = st === 'CODING' ? '90,220,150' : st === 'DESIGNING' ? '244,140,200' : st === 'RESEARCHING' ? '250,200,90' : '90,180,255';
        const gg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 22);
        gg.addColorStop(0, `rgba(${col},${pulse})`); gg.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = gg; ctx.fillRect(p.x - 22, p.y - 22, 44, 44);
      }
      // server LEDs
      for (const f of this.world.furniture) if (f.kind === 'rack') {
        for (let i = 0; i < 3; i++) {
          const blink = (Math.sin(t * (3 + i) + f.x * 2 + i) > 0.2) ? 1 : 0.2;
          const p = OfficeRender.projectPx((f.x + f.w - 0.1) * T, (f.y + 0.25) * T, 24 - i * 6);
          ctx.fillStyle = `rgba(${['80,230,130', '250,110,110', '250,200,80'][i]},${blink})`;
          ctx.fillRect(p.x - 2, p.y - 2, 3, 3);
        }
      }
      ctx.restore();
    }

    // steam + floating dust motes above everything (iso-projected)
    _ambientFront(ctx) {
      const T = 32, t = this.time; ctx.save();
      for (const f of this.world.furniture) if (f.kind === 'coffee') {
        const base = OfficeRender.projectPx((f.x + 0.5) * T, (f.y + 0.5) * T, 12);
        for (let i = 0; i < 3; i++) {
          const ph = t * 1.4 + i * 1.3; const rise = (ph % 3);
          const sx = base.x + Math.sin(ph * 2) * 3; const sy = base.y - rise * 9;
          ctx.fillStyle = `rgba(230,230,240,${0.22 * (1 - rise / 3)})`;
          ctx.beginPath(); ctx.arc(sx, sy, 2.2 - rise * 0.5, 0, 7); ctx.fill();
        }
      }
      for (const m of this._motes) {
        const p = OfficeRender.projectPx(m.x, m.y, 18 + Math.sin(t * 0.5 + m.p) * 8);
        const x = p.x + Math.cos(t * 0.2 + m.p) * 8, y = p.y + Math.sin(t * 0.3 + m.p) * 6;
        ctx.fillStyle = `rgba(255,240,210,${0.05 + 0.05 * (Math.sin(t + m.p) * 0.5 + 0.5)})`;
        ctx.beginPath(); ctx.arc(x, y, m.s * 1.6, 0, 7); ctx.fill();
      }
      ctx.restore();
    }

    _drawAgent(ctx, a) {
      const fr = a.currentFrame(); const w = AgentSprites.FW, h = AgentSprites.FH;
      const g = OfficeRender.projectPx(a.x, a.y, 0); // iso ground point
      const cx = g.x, gy = g.y;                       // sprite ground centre
      const dx = cx - w / 2, dy = gy - h + 8 + (a.bob || 0);
      // ground shadow (iso ellipse)
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, gy, 9, 4.5, 0, 0, 7); ctx.fill();
      // selection / hover outline
      if (a.id === this.selectedId) { ctx.strokeStyle = '#8b7cf0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, gy, 13, 6, 0, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(139,124,240,0.20)'; ctx.beginPath(); ctx.ellipse(cx, gy, 13, 6, 0, 0, 7); ctx.fill(); }
      else if (a.id === this.hoverId) { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.ellipse(cx, gy, 12, 5, 0, 0, 7); ctx.fill(); }
      ctx.drawImage(fr, dx, dy);
      // status bubble
      const icon = a.bubbleIcon();
      const show = icon && (a.id === this.selectedId || a.id === this.hoverId || a.bubbleT > 0 || a.status === 'WAITING_FOR_USER' || a.status === 'ERROR');
      if (show) this._bubble(ctx, cx, dy - 4, icon, a.status);
      // name tag when selected/hover
      if (a.id === this.selectedId || a.id === this.hoverId) this._nameTag(ctx, cx, dy - 22, a.name);
      // effects
      if (a.effect === 'success') { ctx.fillStyle = '#4ade80'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.fillText('✓', cx, dy - 8); }
    }
    _bubble(ctx, x, y, icon, status) {
      const col = status === 'WAITING_FOR_USER' ? '#f5a623' : status === 'ERROR' ? '#ef4444' : 'rgba(24,20,40,0.92)';
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - 8, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.fillText(icon, x, y - 8); ctx.textBaseline = 'alphabetic';
    }
    _nameTag(ctx, x, y, name) {
      ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      const w = ctx.measureText(name).width + 10;
      ctx.fillStyle = 'rgba(18,14,30,0.9)'; roundRect(ctx, x - w / 2, y - 10, w, 13, 3); ctx.fill();
      ctx.fillStyle = '#e9e4ff'; ctx.fillText(name, x, y);
    }
    _meetingLabel(ctx, m) {
      const p = OfficeRender.projectPx(9.5 * 32, 7 * 32, 40); ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      const txt = '💬 ' + m.title; const w = ctx.measureText(txt).width + 12;
      ctx.fillStyle = 'rgba(124,92,232,0.92)'; roundRect(ctx, p.x - w / 2, p.y - 8, w, 14, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(txt, p.x, p.y + 2);
    }
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  global.OfficeEngine = Engine;
})(window);

/* OfficeScene engine: camera + layered compositor + input.
 * Layers per frame: [world prerender] -> [furniture-front shadows] ->
 * [agents y-sorted] -> [bubbles/effects] -> [selection]. UI overlay is DOM. */
(function (global) {
  const T = 32;

  class Engine {
    constructor(canvas, world) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.world = world; this.worldCanvas = OfficeRender.prerenderWorld(world);
      this.agents = [];
      this.cam = { x: world.worldW / 2, y: world.worldH / 2, zoom: 1, tx: null, ty: null, tzoom: null };
      this.minZoom = 0.4; this.maxZoom = 2.4;
      this.selectedId = null; this.hoverId = null;
      this.onSelect = null; this.onHover = null; this.meetings = [];
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
      const z = Math.min(this.vw / this.world.worldW, this.vh / this.world.worldH) * 0.98;
      this.cam.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, z));
      this.cam.x = this.world.worldW / 2; this.cam.y = this.world.worldH / 2;
      this.cam.tx = this.cam.ty = this.cam.tzoom = null;
    }
    focusOn(wx, wy, zoom) { this.cam.tx = wx; this.cam.ty = wy; this.cam.tzoom = zoom || Math.min(this.maxZoom, 1.6); }
    focusAgent(a) { if (a) this.focusOn(a.x, a.y, 1.7); }

    worldToScreen(wx, wy) { return { x: (wx - this.cam.x) * this.cam.zoom + this.vw / 2, y: (wy - this.cam.y) * this.cam.zoom + this.vh / 2 }; }
    screenToWorld(sx, sy) { return { x: (sx - this.vw / 2) / this.cam.zoom + this.cam.x, y: (sy - this.vh / 2) / this.cam.zoom + this.cam.y }; }

    _clampCam() {
      const m = 120; // allow some margin past edges
      this.cam.x = Math.max(-m, Math.min(this.world.worldW + m, this.cam.x));
      this.cam.y = Math.max(-m, Math.min(this.world.worldH + m, this.cam.y));
      this.cam.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.cam.zoom));
    }

    _initInput() {
      const c = this.canvas; let dragging = false, moved = 0, lx = 0, ly = 0, downT = 0;
      const getXY = e => { const r = c.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
      c.addEventListener('mousedown', e => { dragging = true; moved = 0; const p = getXY(e); lx = p.x; ly = p.y; downT = performance.now(); });
      window.addEventListener('mousemove', e => {
        const p = getXY(e);
        if (dragging) { const dx = p.x - lx, dy = p.y - ly; moved += Math.abs(dx) + Math.abs(dy);
          this.cam.x -= dx / this.cam.zoom; this.cam.y -= dy / this.cam.zoom; this.cam.tx = null; lx = p.x; ly = p.y; this._clampCam(); }
        else { const hit = this._hitAgent(p.x, p.y); const id = hit ? hit.id : null; if (id !== this.hoverId) { this.hoverId = id; c.style.cursor = id ? 'pointer' : 'grab'; if (this.onHover) this.onHover(hit, p); } }
      });
      window.addEventListener('mouseup', e => { if (!dragging) return; dragging = false;
        if (moved < 6) { const p = getXY(e); const hit = this._hitAgent(p.x, p.y); this.select(hit ? hit.id : null); } });
      c.addEventListener('dblclick', e => { const p = getXY(e); const hit = this._hitAgent(p.x, p.y); if (hit) this.focusAgent(hit); });
      c.addEventListener('wheel', e => { e.preventDefault(); const p = getXY(e); const before = this.screenToWorld(p.x, p.y);
        const f = e.deltaY < 0 ? 1.12 : 1 / 1.12; this.cam.zoom *= f; this.cam.tzoom = null; this._clampCam();
        const after = this.screenToWorld(p.x, p.y); this.cam.x += before.x - after.x; this.cam.y += before.y - after.y; }, { passive: false });
      // touch pan + pinch
      let pinchD = 0;
      c.addEventListener('touchstart', e => { if (e.touches.length === 1) { dragging = true; moved = 0; const p = getXY(e); lx = p.x; ly = p.y; } else if (e.touches.length === 2) pinchD = touchDist(e); }, { passive: true });
      c.addEventListener('touchmove', e => { if (e.touches.length === 2) { const d = touchDist(e); if (pinchD) { this.cam.zoom *= d / pinchD; this._clampCam(); } pinchD = d; }
        else if (dragging && e.touches.length === 1) { const p = getXY(e); this.cam.x -= (p.x - lx) / this.cam.zoom; this.cam.y -= (p.y - ly) / this.cam.zoom; lx = p.x; ly = p.y; moved += 5; this._clampCam(); } }, { passive: true });
      c.addEventListener('touchend', e => { if (dragging && moved < 6) { const hit = this._hitAgent(lx, ly); this.select(hit ? hit.id : null); } dragging = false; pinchD = 0; });
      function touchDist(e) { const a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    }

    _hitAgent(sx, sy) {
      const w = this.screenToWorld(sx, sy);
      let best = null, bd = 26 * 26;
      for (const a of this.agents) { const dx = w.x - a.x, dy = w.y - (a.y - 12); const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = a; } }
      return best;
    }
    select(id) { this.selectedId = id; if (this.onSelect) this.onSelect(id ? this.world._store.getAgent(id) : null); }
    clearSelection() { this.selectedId = null; } // set selection without firing onSelect (avoids feedback loops)

    step(dt) {
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
      // meeting labels above table
      for (const m of this.meetings) if (m.status === 'active') this._meetingLabel(ctx, m);
      // agents y-sorted
      const sorted = this.agents.slice().sort((a, b) => a.y - b.y);
      for (const a of sorted) this._drawAgent(ctx, a);
      ctx.restore();
    }

    _drawAgent(ctx, a) {
      const fr = a.currentFrame(); const w = AgentSprites.FW, h = AgentSprites.FH;
      const dx = a.x - w / 2, dy = a.y - h + 6;
      // selection / hover outline
      if (a.id === this.selectedId) { ctx.strokeStyle = '#8b7cf0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(a.x, a.y - 1, 14, 6, 0, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(139,124,240,0.18)'; ctx.beginPath(); ctx.ellipse(a.x, a.y - 1, 14, 6, 0, 0, 7); ctx.fill(); }
      else if (a.id === this.hoverId) { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.ellipse(a.x, a.y - 1, 13, 5, 0, 0, 7); ctx.fill(); }
      ctx.drawImage(fr, dx, dy);
      // status bubble
      const icon = a.bubbleIcon();
      const show = icon && (a.id === this.selectedId || a.id === this.hoverId || a.bubbleT > 0 || a.status === 'WAITING_FOR_USER' || a.status === 'ERROR');
      if (show) this._bubble(ctx, a.x, dy - 4, icon, a.status);
      // name tag when selected/hover
      if (a.id === this.selectedId || a.id === this.hoverId) this._nameTag(ctx, a.x, dy - 22, a.name);
      // effects
      if (a.effect === 'success') { ctx.fillStyle = '#4ade80'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.fillText('✓', a.x, dy - 8); }
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
      const wx = 9.5 * T, wy = 4.4 * T; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      const txt = '💬 ' + m.title; const w = ctx.measureText(txt).width + 12;
      ctx.fillStyle = 'rgba(124,92,232,0.92)'; roundRect(ctx, wx - w / 2, wy - 8, w, 14, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(txt, wx, wy + 2);
    }
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  global.OfficeEngine = Engine;
})(window);

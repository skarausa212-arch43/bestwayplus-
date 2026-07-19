/* Static-world renderer — stronger "2.5D" look: tall extruded walls with lit
 * top caps + graded side faces, furniture drawn as raised blocks (top surface
 * + front face + offset drop shadow), soft ambient occlusion, per-room window
 * light, city skyline, floor gloss and a global vignette. Pre-rendered once. */
(function (global) {
  const R = {};
  const WALL_H = 20;      // wall height (px)
  const LIFT = 5;         // how much furniture "rises" off the floor

  function noise(x, y) { const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return n - Math.floor(n); }
  function shade(hex, f) {
    const c = hex.replace('#', ''); let r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    r = Math.max(0, Math.min(255, r * f)) | 0; g = Math.max(0, Math.min(255, g * f)) | 0; b = Math.max(0, Math.min(255, b * f)) | 0;
    return `rgb(${r},${g},${b})`;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  R.prerenderWorld = function (world) {
    const T = world.TILE;
    const cv = document.createElement('canvas'); cv.width = world.worldW; cv.height = world.worldH;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b0813'; g.fillRect(0, 0, cv.width, cv.height);

    // ---- floors ----
    for (const r of world.rooms) {
      const pal = world.ROOM_TYPES[r.type];
      for (let ty = r.y + 1; ty < r.y + r.h - 1; ty++) {
        for (let tx = r.x + 1; tx < r.x + r.w - 1; tx++) {
          const n = noise(tx, ty);
          g.fillStyle = n > 0.5 ? pal.floor : pal.floor2; g.fillRect(tx * T, ty * T, T, T);
          g.fillStyle = 'rgba(0,0,0,0.10)';
          if (r.type === 'KITCHEN' || r.type === 'ENTRANCE') { g.fillRect(tx * T, ty * T, T, 1); g.fillRect(tx * T, ty * T, 1, T); }
          else g.fillRect(tx * T, ty * T + T - 1, T, 1);
          if (n > 0.86) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(tx * T + 3, ty * T + 3, 2, 2); }
        }
      }
      const gx = (r.x + 1) * T, gy = (r.y + 1) * T, gw = (r.w - 2) * T, gh = (r.h - 2) * T;
      // window light from the top + floor darkening toward bottom
      let lg = g.createLinearGradient(0, gy, 0, gy + gh);
      lg.addColorStop(0, 'rgba(255,238,205,0.12)'); lg.addColorStop(0.45, 'rgba(255,238,205,0.0)'); lg.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = lg; g.fillRect(gx, gy, gw, gh);
      // diagonal floor gloss streak
      g.save(); g.globalAlpha = 0.05; g.fillStyle = '#fff'; g.beginPath();
      g.moveTo(gx, gy + gh * 0.25); g.lineTo(gx + gw * 0.5, gy); g.lineTo(gx + gw * 0.62, gy); g.lineTo(gx, gy + gh * 0.42); g.closePath(); g.fill(); g.restore();
      if (r.id === 'lounge') { g.fillStyle = 'rgba(26,26,40,0.55)'; roundRect(g, gx + 6, gy + gh - 82, gw - 40, 68, 9); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.03)'; roundRect(g, gx + 6, gy + gh - 82, gw - 40, 3, 9); g.fill(); }
      if (r.id === 'meeting') { g.fillStyle = 'rgba(64,46,96,0.30)'; roundRect(g, gx + 16, gy + 22, gw - 32, gh - 58, 11); g.fill(); }
    }

    drawWindow(g, world, 'open', T);
    drawWindow(g, world, 'mgmt', T);

    // ---- ambient occlusion along inner walls (light from top-left) ----
    for (const r of world.rooms) {
      const gx = (r.x + 1) * T, gy = (r.y + 1) * T, gw = (r.w - 2) * T, gh = (r.h - 2) * T;
      let top = g.createLinearGradient(0, gy, 0, gy + 26); top.addColorStop(0, 'rgba(0,0,0,0.40)'); top.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = top; g.fillRect(gx, gy, gw, 26);
      let left = g.createLinearGradient(gx, 0, gx + 20, 0); left.addColorStop(0, 'rgba(0,0,0,0.32)'); left.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = left; g.fillRect(gx, gy, 20, gh);
      let br = g.createLinearGradient(0, gy + gh - 14, 0, gy + gh); br.addColorStop(0, 'rgba(0,0,0,0)'); br.addColorStop(1, 'rgba(0,0,0,0.16)');
      g.fillStyle = br; g.fillRect(gx, gy + gh - 14, gw, 14);
    }

    // ---- furniture drop shadows (offset down-right = raised objects) ----
    for (const f of world.furniture) {
      if (f.kind === 'plant') continue;
      const px = f.x * T, py = f.y * T, w = f.w * T, h = f.h * T;
      g.fillStyle = 'rgba(0,0,0,0.30)'; g.beginPath(); g.ellipse(px + w / 2 + 3, py + h + 1, w / 2 + 4, 7, 0, 0, 7); g.fill();
    }

    // ---- walls (tall extruded) ----
    for (let y = 0; y < world.ROWS; y++)
      for (let x = 0; x < world.COLS; x++) {
        if (!world.blocked[y][x]) continue;
        if (isFurnitureCell(world, x, y)) continue;
        drawWall(g, x * T, y * T, T, world, x, y);
      }

    // ---- furniture (raised blocks) ----
    for (const f of world.furniture) drawFurniture(g, f, T);

    for (const r of world.rooms) drawLabel(g, (r.x + r.w / 2) * T, (r.y + 0.9) * T, r.label);

    // ---- global grade: warm top light + vignette ----
    let sun = g.createRadialGradient(cv.width * 0.5, cv.height * 0.12, 40, cv.width * 0.5, cv.height * 0.12, cv.height * 0.7);
    sun.addColorStop(0, 'rgba(255,224,180,0.08)'); sun.addColorStop(1, 'rgba(255,224,180,0)');
    g.fillStyle = sun; g.fillRect(0, 0, cv.width, cv.height);
    let vg = g.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.30, cv.width / 2, cv.height / 2, cv.height * 0.82);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = vg; g.fillRect(0, 0, cv.width, cv.height);

    R.worldCanvas = cv;
    return cv;
  };

  function isFurnitureCell(world, x, y) {
    for (const f of world.furniture) { if (f.noCollide || f.kind === 'plant') continue; if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) return true; }
    return false;
  }
  function wallFaceBelow(world, x, y) { const by = y + 1; return by < world.ROWS && !world.blocked[by][x]; }

  function drawWall(g, px, py, T, world, tx, ty) {
    // top surface
    g.fillStyle = '#332c4c'; g.fillRect(px, py, T, T);
    g.fillStyle = '#403860'; g.fillRect(px, py, T, 6);
    g.fillStyle = 'rgba(255,240,220,0.10)'; g.fillRect(px, py, T, 2);          // warm rim light
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(px, py + T - 2, T, 2);
    if ((tx + ty) % 2 === 0) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(px + T / 2, py + 8, 1, T - 10); }
    // extruded front face + baseboard + contact shadow
    if (wallFaceBelow(world, tx, ty)) {
      const fy = py + T;
      let lg = g.createLinearGradient(0, fy, 0, fy + WALL_H);
      lg.addColorStop(0, '#241d38'); lg.addColorStop(1, '#140f24');
      g.fillStyle = lg; g.fillRect(px, fy, T, WALL_H);
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(px, fy, T, 1);        // top edge of face
      g.fillStyle = '#0f0b1c'; g.fillRect(px, fy + WALL_H - 3, T, 3);          // skirting
      g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(px, fy + WALL_H, T, 5);     // shadow on floor
    }
  }

  function drawWindow(g, world, roomId, T) {
    const r = world.rooms.find(rr => rr.id === roomId); if (!r) return;
    const x0 = (r.x + 1) * T, y0 = r.y * T + 3, w = (r.w - 2) * T, h = T - 5;
    const sky = g.createLinearGradient(0, y0, 0, y0 + h); sky.addColorStop(0, '#22375f'); sky.addColorStop(1, '#4a7fb0');
    g.fillStyle = sky; g.fillRect(x0, y0, w, h);
    g.fillStyle = 'rgba(18,24,42,0.9)'; let cx = x0;
    while (cx < x0 + w) { const bw = 8 + (noise(cx, 3) * 14 | 0); const bh = 6 + (noise(cx, 7) * (h - 6) | 0);
      g.fillStyle = 'rgba(18,24,42,0.9)'; g.fillRect(cx, y0 + h - bh, bw, bh);
      g.fillStyle = 'rgba(150,180,235,0.22)'; for (let wy = y0 + h - bh + 2; wy < y0 + h - 2; wy += 4) g.fillRect(cx + 2, wy, 2, 2); cx += bw + 2; }
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x0, y0, w, 3);
    g.fillStyle = 'rgba(38,28,58,0.95)'; for (let mx = x0; mx <= x0 + w; mx += T * 2) g.fillRect(mx, y0, 2, h);
    g.fillRect(x0, y0, w, 2); g.fillRect(x0, y0 + h - 1, w, 2);
  }

  function drawLabel(g, cx, y, text) {
    g.save(); g.font = 'bold 11px monospace'; g.textAlign = 'center';
    const w = g.measureText(text).width + 18;
    g.fillStyle = 'rgba(12,8,22,0.92)'; roundRect(g, cx - w / 2, y - 9, w, 16, 6); g.fill();
    g.strokeStyle = 'rgba(150,134,250,0.5)'; g.lineWidth = 1; roundRect(g, cx - w / 2, y - 9, w, 16, 6); g.stroke();
    g.fillStyle = '#d8ccff'; g.fillText(text, cx, y + 3); g.restore();
  }

  // raised block helper: top surface (topCol) + front face of height fh (darker)
  function block(g, x, y, w, h, topCol, fh, frontCol) {
    g.fillStyle = topCol; g.fillRect(x, y, w, h - fh);
    g.fillStyle = shade(topCol, 1.14); g.fillRect(x, y, w, 3);
    let lg = g.createLinearGradient(0, y + h - fh, 0, y + h);
    lg.addColorStop(0, frontCol || shade(topCol, 0.7)); lg.addColorStop(1, shade(topCol, 0.45));
    g.fillStyle = lg; g.fillRect(x, y + h - fh, w, fh);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + h - 1, w, 1);
  }

  function drawFurniture(g, f, T) {
    const px = f.x * T, py = f.y * T - LIFT, w = f.w * T, h = f.h * T;
    const P = (a, b, c, d, col) => { g.fillStyle = col; g.fillRect(px + a, py + b, c, d); };
    switch (f.kind) {
      case 'desk': {
        block(g, px, py + 4, w, h - 2, '#9a6636', 9, '#6e441f');
        // raised monitor with bezel + stand
        P(w / 2 - 13, -16, 26, 18, '#15171f'); P(w / 2 - 11, -14, 22, 14, '#0d1220');
        P(w / 2 - 3, 0, 6, 5, '#15171f'); P(w / 2 - 7, 4, 14, 3, '#20242e');
        P(w / 2 - 12, h - 12, 24, 5, '#22262f'); P(w / 2 + 13, h - 11, 5, 4, '#22262f'); // keyboard+mouse
        P(4, 1, 6, 6, '#3a7d3a'); P(5, 5, 4, 3, '#7a5230');
        break;
      }
      case 'exec-desk': {
        block(g, px, py + 6, w, h - 2, '#7a4c27', 11, '#573619');
        P(w / 2 - 15, -14, 30, 18, '#15171f'); P(w / 2 - 13, -12, 26, 14, '#0d1220');
        P(6, 2, 12, 9, '#20242e'); P(7, 3, 10, 6, '#33465e');
        P(w - 18, 1, 10, 9, '#c9a24b'); P(w - 16, -2, 6, 4, '#dcb85e'); break;
      }
      case 'table': { block(g, px, py + 4, w, h - 2, '#875a33', 8, '#5f3f22');
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(px + 6, py + 12, w - 12, h - 20);
        P(w / 2 - 4, h / 2 - 6, 8, 8, '#3a7d3a'); break; }
      case 'whiteboard': { P(0, 0, w, h, '#eef1f5'); g.strokeStyle = '#8892a6'; g.strokeRect(px, py, w, h);
        g.fillStyle = '#7c5ce8'; g.fillRect(px + 6, py + 6, w - 40, 3); g.fillRect(px + 6, py + 14, w - 60, 3);
        g.fillStyle = '#3aa0ff'; g.fillRect(px + 6, py + 22, w - 30, 3); break; }
      case 'bookshelf': { block(g, px, py, w, h, '#6a4526', 4, '#4a2f18');
        const cols = ['#c0453a', '#3a6dc0', '#3a9d5a', '#c9a24b', '#8a4fc0'];
        for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % 5]; g.fillRect(px + 2 + i * 7, py + 3, 5, h - 8); } break; }
      case 'couch': case 'sofa': { block(g, px, py + h * 0.3, w, h * 0.7, '#c9743a', h * 0.4, '#8a4d24');
        P(0, 0, w, h * 0.44, '#d5814a'); P(-2, h * 0.14, 6, h * 0.86, '#a35a2a'); P(w - 4, h * 0.14, 6, h * 0.86, '#a35a2a');
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(px, py, w, 3); break; }
      case 'rack': { block(g, px, py - LIFT, w, h + LIFT, '#242a36', 5, '#141822');
        for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#2e3646' : '#262d3b'; g.fillRect(px + 2, py + 2 + i * (h - 4) / 6, w - 4, (h - 4) / 6 - 1); } break; }
      case 'counter': { block(g, px, py, w, h + 6, '#cfd4dc', 8, '#9aa0aa'); break; }
      case 'bar': { block(g, px, py, w, h + 6, '#c2c7d0', 8, '#8f949e'); break; }
      case 'coffee': { block(g, px + 2, py - 6, w - 4, h + 12, '#252a34', 8, '#161a22'); P(4, -3, w - 8, 5, '#caa050'); P(w / 2 - 1, 3, 2, 3, '#6b4'); break; }
      case 'fridge': { block(g, px + 1, py - 10, w - 2, h + 16, '#e2e6ec', 10, '#aeb4bf'); g.fillStyle = '#9aa0aa'; g.fillRect(px + 3, py - 3, 2, 8); break; }
      case 'coffee-table': { block(g, px, py + 2, w, h, '#875a33', 5, '#5f3f22'); break; }
      case 'aquarium': { block(g, px, py - 4, w, h + 8, '#123454', 6, '#0b2036'); P(2, -2, w - 4, h - 2, '#2f7fb5');
        g.fillStyle = '#5ad0ff'; g.fillRect(px + 4, py, 3, 2); g.fillStyle = '#3a9d5a'; g.fillRect(px + w - 8, py, 3, 6); break; }
      case 'plant': { g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(px + w / 2 + 2, py + h + LIFT, 8, 4, 0, 0, 7); g.fill();
        g.fillStyle = '#6a4526'; g.fillRect(px + w / 2 - 5, py + h - 8 + LIFT, 10, 9); g.fillStyle = '#5a391f'; g.fillRect(px + w / 2 - 5, py + h - 8 + LIFT, 10, 2);
        g.fillStyle = '#2f7d3f'; g.beginPath(); g.arc(px + w / 2, py + h - 12 + LIFT, 9, 0, 7); g.fill();
        g.fillStyle = '#3a9d4f'; g.beginPath(); g.arc(px + w / 2 - 3, py + h - 16 + LIFT, 6, 0, 7); g.fill();
        g.fillStyle = '#4bb85f'; g.beginPath(); g.arc(px + w / 2 + 4, py + h - 14 + LIFT, 5, 0, 7); g.fill(); break; }
      default: { block(g, px, py, w, h, '#666', 5, '#333'); }
    }
  }

  R.drawFurnitureSprite = drawFurniture;
  global.OfficeRender = R;
})(window);

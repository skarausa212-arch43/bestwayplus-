/* Static-world renderer — "2.5D" look: raised walls with top caps + side
 * faces, soft ambient-occlusion along inner walls, per-room floor lighting,
 * windows with a city skyline, furniture drop-shadows, and a global vignette.
 * Pre-rendered once into an offscreen canvas; the loop composites this +
 * dynamic agents + animated ambient (monitor glow, LEDs, steam) on top. */
(function (global) {
  const R = {};
  const WALL_H = 14; // visual wall height (px) for the extruded look

  function noise(x, y) { const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return n - Math.floor(n); }
  function shade(hex, f) {
    const c = hex.replace('#', ''); let r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    r = Math.max(0, Math.min(255, r * f)) | 0; g = Math.max(0, Math.min(255, g * f)) | 0; b = Math.max(0, Math.min(255, b * f)) | 0;
    return `rgb(${r},${g},${b})`;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  R.prerenderWorld = function (world) {
    const T = world.TILE;
    const cv = document.createElement('canvas');
    cv.width = world.worldW; cv.height = world.worldH;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;

    // deep backdrop
    g.fillStyle = '#0c0916'; g.fillRect(0, 0, cv.width, cv.height);

    const inside = (r, tx, ty) => tx > r.x && tx < r.x + r.w - 1 && ty > r.y && ty < r.y + r.h - 1;

    // ---- floors ----
    for (const r of world.rooms) {
      const pal = world.ROOM_TYPES[r.type];
      for (let ty = r.y + 1; ty < r.y + r.h - 1; ty++) {
        for (let tx = r.x + 1; tx < r.x + r.w - 1; tx++) {
          const n = noise(tx, ty);
          g.fillStyle = n > 0.5 ? pal.floor : pal.floor2;
          g.fillRect(tx * T, ty * T, T, T);
          g.fillStyle = 'rgba(0,0,0,0.10)';
          if (r.type === 'KITCHEN' || r.type === 'ENTRANCE') { g.fillRect(tx * T, ty * T, T, 1); g.fillRect(tx * T, ty * T, 1, T); }
          else g.fillRect(tx * T, ty * T + T - 1, T, 1);
          if (n > 0.86) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(tx * T + 3, ty * T + 3, 2, 2); }
        }
      }
      // per-room soft light from the top (window light) + corner vignette
      const gx = (r.x + 1) * T, gy = (r.y + 1) * T, gw = (r.w - 2) * T, gh = (r.h - 2) * T;
      let lg = g.createLinearGradient(0, gy, 0, gy + gh);
      lg.addColorStop(0, 'rgba(255,240,210,0.10)'); lg.addColorStop(0.5, 'rgba(255,240,210,0.0)'); lg.addColorStop(1, 'rgba(0,0,0,0.10)');
      g.fillStyle = lg; g.fillRect(gx, gy, gw, gh);
      // rugs
      if (r.id === 'lounge') { g.fillStyle = 'rgba(30,30,44,0.55)'; roundRect(g, gx + 6, gy + gh - 78, gw - 40, 66, 8); g.fill(); }
      if (r.id === 'meeting') { g.fillStyle = 'rgba(60,44,90,0.28)'; roundRect(g, gx + 18, gy + 24, gw - 36, gh - 60, 10); g.fill(); }
    }

    // ---- windows with city skyline (top wall of open workspace & management) ----
    drawWindow(g, world, 'open', T);
    drawWindow(g, world, 'mgmt', T);

    // ---- ambient occlusion: soft shadow along the inside of top & left walls ----
    for (const r of world.rooms) {
      const gx = (r.x + 1) * T, gy = (r.y + 1) * T, gw = (r.w - 2) * T, gh = (r.h - 2) * T;
      let top = g.createLinearGradient(0, gy, 0, gy + 22); top.addColorStop(0, 'rgba(0,0,0,0.34)'); top.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = top; g.fillRect(gx, gy, gw, 22);
      let left = g.createLinearGradient(gx, 0, gx + 18, 0); left.addColorStop(0, 'rgba(0,0,0,0.28)'); left.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = left; g.fillRect(gx, gy, 18, gh);
      // subtle warm bounce on bottom/right
      let bot = g.createLinearGradient(0, gy + gh - 12, 0, gy + gh); bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,0.14)');
      g.fillStyle = bot; g.fillRect(gx, gy + gh - 12, gw, 12);
    }

    // ---- furniture drop shadows (under, before sprites) ----
    for (const f of world.furniture) {
      if (f.kind === 'plant') continue;
      const px = f.x * T, py = f.y * T, w = f.w * T, h = f.h * T;
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath(); g.ellipse(px + w / 2, py + h - 1, w / 2 + 3, 6, 0, 0, 7); g.fill();
    }

    // ---- walls (2.5D extruded) ----
    for (let y = 0; y < world.ROWS; y++) {
      for (let x = 0; x < world.COLS; x++) {
        if (!world.blocked[y][x]) continue;
        if (isFurnitureCell(world, x, y)) continue;
        drawWall(g, x * T, y * T, T, world, x, y);
      }
    }

    // ---- furniture ----
    for (const f of world.furniture) drawFurniture(g, f, T);

    // ---- room labels ----
    for (const r of world.rooms) drawLabel(g, (r.x + r.w / 2) * T, (r.y + 0.9) * T, r.label);

    // ---- global vignette ----
    const vg = g.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.32, cv.width / 2, cv.height / 2, cv.height * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = vg; g.fillRect(0, 0, cv.width, cv.height);

    R.worldCanvas = cv;
    return cv;
  };

  function isFurnitureCell(world, x, y) {
    for (const f of world.furniture) {
      if (f.noCollide || f.kind === 'plant') continue;
      if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) return true;
    }
    return false;
  }

  // is the tile just BELOW this wall an interior floor? -> draw a lit side-face there
  function wallHasFaceBelow(world, x, y) {
    const by = y + 1; if (by >= world.ROWS) return false;
    return !world.blocked[by][x];
  }

  function drawWall(g, px, py, T, world, tx, ty) {
    // wall body (top surface)
    g.fillStyle = '#2b2540'; g.fillRect(px, py, T, T);
    // top face highlight (as if lit from above)
    g.fillStyle = '#3b3358'; g.fillRect(px, py, T, 7);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(px + 1, py + 1, T - 2, 2);
    // brick seams
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(px, py + T - 2, T, 2);
    if ((tx + ty) % 2 === 0) g.fillStyle = 'rgba(0,0,0,0.10)', g.fillRect(px + T / 2, py + 8, 1, T - 10);
    // extruded front face onto the floor below (the "height")
    if (wallHasFaceBelow(world, tx, ty)) {
      const fy = py + T;
      let lg = g.createLinearGradient(0, fy, 0, fy + WALL_H);
      lg.addColorStop(0, '#211b33'); lg.addColorStop(1, '#171226');
      g.fillStyle = lg; g.fillRect(px, fy, T, WALL_H);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(px, fy + WALL_H, T, 4); // contact shadow
    }
  }

  function drawWindow(g, world, roomId, T) {
    const r = world.rooms.find(rr => rr.id === roomId); if (!r) return;
    const x0 = (r.x + 1) * T, y0 = r.y * T + 4, w = (r.w - 2) * T, h = T - 6;
    // sky
    let sky = g.createLinearGradient(0, y0, 0, y0 + h);
    sky.addColorStop(0, '#243a63'); sky.addColorStop(1, '#3f5c8f');
    g.fillStyle = sky; g.fillRect(x0, y0, w, h);
    // distant city silhouette
    g.fillStyle = 'rgba(20,26,44,0.85)';
    let cx = x0;
    while (cx < x0 + w) { const bw = 8 + (noise(cx, 3) * 14 | 0); const bh = 6 + (noise(cx, 7) * (h - 6) | 0); g.fillRect(cx, y0 + h - bh, bw, bh);
      g.fillStyle = 'rgba(120,150,210,0.20)'; for (let wy = y0 + h - bh + 2; wy < y0 + h - 2; wy += 4) g.fillRect(cx + 2, wy, 2, 2); g.fillStyle = 'rgba(20,26,44,0.85)'; cx += bw + 2; }
    // glass reflection + mullions
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x0, y0, w, 3);
    g.fillStyle = 'rgba(40,30,60,0.9)';
    for (let mx = x0; mx <= x0 + w; mx += T * 2) g.fillRect(mx, y0, 2, h);
    g.fillRect(x0, y0, w, 2); g.fillRect(x0, y0 + h - 1, w, 2);
  }

  function drawLabel(g, cx, y, text) {
    g.save(); g.font = 'bold 11px monospace'; g.textAlign = 'center';
    const w = g.measureText(text).width + 16;
    g.fillStyle = 'rgba(14,10,24,0.9)'; roundRect(g, cx - w / 2, y - 9, w, 16, 5); g.fill();
    g.strokeStyle = 'rgba(139,124,240,0.45)'; g.lineWidth = 1; roundRect(g, cx - w / 2, y - 9, w, 16, 5); g.stroke();
    g.fillStyle = '#d3c6ff'; g.fillText(text, cx, y + 3); g.restore();
  }

  function drawFurniture(g, f, T) {
    const px = f.x * T, py = f.y * T, w = f.w * T, h = f.h * T;
    const P = (a, b, c, d, col) => { g.fillStyle = col; g.fillRect(px + a, py + b, c, d); };
    switch (f.kind) {
      case 'desk': {
        P(0, 6, w, h - 6, '#8a5a30'); P(0, 6, w, 4, '#a6703e'); P(0, h - 3, w, 3, '#5e3d20');
        P(2, h - 4, 3, 5, '#4e321b'); P(w - 5, h - 4, 3, 5, '#4e321b');
        // monitor with bezel + stand (screen glow drawn dynamically)
        P(w / 2 - 13, -15, 26, 17, '#171a22'); P(w / 2 - 11, -13, 22, 13, '#0e1420');
        P(w / 2 - 3, 1, 6, 5, '#171a22'); P(w / 2 - 6, 5, 12, 2, '#20242e');
        P(w / 2 - 11, h - 10, 22, 5, '#2a2f3a'); P(w / 2 + 13, h - 9, 4, 4, '#2a2f3a');
        P(4, 2, 6, 6, '#3a7d3a'); P(5, 6, 4, 3, '#7a5230');
        break;
      }
      case 'exec-desk': {
        P(0, 8, w, h - 8, '#6e4423'); P(0, 8, w, 5, '#8a5b34'); P(0, h - 3, w, 3, '#4a2e17');
        P(w / 2 - 15, -13, 30, 17, '#171a22'); P(w / 2 - 13, -11, 26, 13, '#0e1420');
        P(6, 4, 11, 8, '#20242e'); P(7, 5, 9, 5, '#33465e');
        P(w - 17, 3, 9, 7, '#c9a24b'); P(w - 15, 1, 5, 3, '#dcb85e');
        break;
      }
      case 'table': {
        P(0, 4, w, h - 6, '#7a5230'); P(0, 4, w, 5, '#96673a'); P(0, h - 3, w, 3, '#5a3c22');
        g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(px + 6, py + 10, w - 12, h - 16);
        P(w / 2 - 4, h / 2 - 4, 8, 8, '#3a7d3a');
        break;
      }
      case 'whiteboard': { P(0, 0, w, h, '#eef1f5'); g.strokeStyle = '#8892a6'; g.strokeRect(px, py, w, h);
        g.fillStyle = '#7c5ce8'; g.fillRect(px + 6, py + 6, w - 40, 3); g.fillRect(px + 6, py + 14, w - 60, 3);
        g.fillStyle = '#3aa0ff'; g.fillRect(px + 6, py + 22, w - 30, 3); break; }
      case 'bookshelf': { P(0, 0, w, h, '#5e3d20'); P(0, 0, w, 3, '#734d29');
        const cols = ['#c0453a', '#3a6dc0', '#3a9d5a', '#c9a24b', '#8a4fc0'];
        for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % 5]; g.fillRect(px + 2 + i * 7, py + 3, 5, h - 6); } break; }
      case 'couch': case 'sofa': { P(0, h * 0.32, w, h * 0.68, '#b5652f'); P(0, 0, w, h * 0.42, '#c9743a');
        P(-2, h * 0.16, 6, h * 0.84, '#9c5527'); P(w - 4, h * 0.16, 6, h * 0.84, '#9c5527');
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(px, py, w, 3); break; }
      case 'rack': { P(0, 0, w, h, '#20242e'); P(0, 0, w, 3, '#2c3240');
        for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#2e3440' : '#262c38'; g.fillRect(px + 2, py + 3 + i * (h - 6) / 6, w - 4, (h - 6) / 6 - 1); } break; }
      case 'counter': { P(0, 0, w, h, '#c7ccd4'); P(0, 0, w, 4, '#dfe3ea'); P(0, h - 2, w, 2, '#9aa0aa'); break; }
      case 'bar': { P(0, 0, w, h, '#b9bec7'); P(0, 0, w, 5, '#d3d7de'); break; }
      case 'coffee': { P(2, -6, w - 4, h + 4, '#20242e'); P(4, -2, w - 8, 5, '#caa050'); P(w / 2 - 1, 4, 2, 3, '#6b4'); break; }
      case 'fridge': { P(1, -8, w - 2, h + 6, '#dfe3ea'); g.fillStyle = '#b9bec7'; g.fillRect(px + 2, py - 2, 2, 6); break; }
      case 'coffee-table': { P(0, 2, w, h - 3, '#7a5230'); P(2, 3, w - 4, 3, '#8a5a30'); break; }
      case 'aquarium': { P(0, -4, w, h + 2, '#0f2c47'); P(2, -2, w - 4, h - 2, '#2f7fb5');
        g.fillStyle = '#5ad0ff'; g.fillRect(px + 4, py, 3, 2); g.fillStyle = '#3a9d5a'; g.fillRect(px + w - 8, py, 3, 6); break; }
      case 'plant': { g.fillStyle = '#5e3d20'; g.fillRect(px + w / 2 - 4, py + h - 8, 8, 8);
        g.fillStyle = '#2f7d3f'; g.beginPath(); g.arc(px + w / 2, py + h - 10, 8, 0, 7); g.fill();
        g.fillStyle = '#3a9d4f'; g.beginPath(); g.arc(px + w / 2 - 3, py + h - 13, 5, 0, 7); g.fill();
        g.fillStyle = '#4bb85f'; g.beginPath(); g.arc(px + w / 2 + 3, py + h - 12, 4, 0, 7); g.fill(); break; }
      default: { P(0, 0, w, h, '#555'); }
    }
  }

  R.drawFurnitureSprite = drawFurniture;
  global.OfficeRender = R;
})(window);

/* Static-world renderer. Pre-renders Floor + Wall + Furniture layers
 * into one offscreen canvas (drawn once), so the per-frame loop only
 * composites world + dynamic agents/effects. Furniture sprites are
 * simple, readable pixel shapes (placeholder art, asset-swappable). */
(function (global) {
  const R = {};

  // deterministic per-tile noise for subtle floor texture
  function noise(x, y) { const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return n - Math.floor(n); }

  R.prerenderWorld = function (world) {
    const T = world.TILE;
    const cv = document.createElement('canvas');
    cv.width = world.worldW; cv.height = world.worldH;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;

    // base dark backdrop
    g.fillStyle = '#14101e'; g.fillRect(0, 0, cv.width, cv.height);

    // floors per room
    for (const r of world.rooms) {
      const pal = world.ROOM_TYPES[r.type];
      for (let ty = r.y + 1; ty < r.y + r.h - 1; ty++) {
        for (let tx = r.x + 1; tx < r.x + r.w - 1; tx++) {
          const n = noise(tx, ty);
          g.fillStyle = n > 0.5 ? pal.floor : pal.floor2;
          g.fillRect(tx * T, ty * T, T, T);
          // plank/tile seams
          g.fillStyle = 'rgba(0,0,0,0.10)';
          if (r.type === 'KITCHEN') { g.fillRect(tx * T, ty * T, T, 1); g.fillRect(tx * T, ty * T, 1, T); }
          else g.fillRect(tx * T, ty * T + T - 1, T, 1);
          if (n > 0.85) { g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(tx * T + 3, ty * T + 3, 2, 2); }
        }
      }
    }

    // walls (blocked border cells that are on a room edge)
    for (let y = 0; y < world.ROWS; y++) {
      for (let x = 0; x < world.COLS; x++) {
        if (!world.blocked[y][x]) continue;
        if (isFurnitureCell(world, x, y)) continue; // furniture drawn separately
        drawWall(g, x * T, y * T, T);
      }
    }

    // furniture
    for (const f of world.furniture) drawFurniture(g, f, T);

    // room label plates
    for (const r of world.rooms) {
      const cx = (r.x + r.w / 2) * T;
      const ly = (r.y + 0.9) * T;
      drawLabel(g, cx, ly, r.label);
    }

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

  function drawWall(g, px, py, T) {
    g.fillStyle = '#2a2438'; g.fillRect(px, py, T, T);
    g.fillStyle = '#3a3350'; g.fillRect(px, py, T, 6);         // top highlight
    g.fillStyle = '#1d1830'; g.fillRect(px, py + T - 5, T, 5); // base shadow
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(px + 2, py + 2, T - 4, 2);
  }

  function drawLabel(g, cx, y, text) {
    g.save(); g.font = 'bold 11px monospace'; g.textAlign = 'center';
    const w = g.measureText(text).width + 16;
    g.fillStyle = 'rgba(18,14,30,0.85)';
    roundRect(g, cx - w / 2, y - 9, w, 16, 4); g.fill();
    g.strokeStyle = 'rgba(139,124,240,0.4)'; g.lineWidth = 1; roundRect(g, cx - w / 2, y - 9, w, 16, 4); g.stroke();
    g.fillStyle = '#cbb9ff'; g.fillText(text, cx, y + 3);
    g.restore();
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function drawFurniture(g, f, T) {
    const px = f.x * T, py = f.y * T, w = f.w * T, h = f.h * T;
    const P = (a, b, c, d, col) => { g.fillStyle = col; g.fillRect(px + a, py + b, c, d); };
    switch (f.kind) {
      case 'desk': {
        P(0, 6, w, h - 6, '#8a5a30'); P(0, 6, w, 4, '#a06c3c');
        P(2, h - 4, 3, 4, '#5e3d20'); P(w - 5, h - 4, 3, 4, '#5e3d20');
        // monitor
        P(w / 2 - 12, -14, 24, 16, '#20242e'); P(w / 2 - 10, -12, 20, 12, '#3aa0ff');
        g.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 3; i++) g.fillRect(px + w / 2 - 8, py - 10 + i * 3, 12, 1);
        P(w / 2 - 3, 2, 6, 4, '#20242e');
        // keyboard + mouse + plant
        P(w / 2 - 10, h - 10, 20, 5, '#2a2f3a'); P(w / 2 + 12, h - 9, 4, 4, '#2a2f3a');
        P(4, 2, 6, 6, '#3a7d3a'); P(5, 6, 4, 3, '#7a5230');
        break;
      }
      case 'exec-desk': {
        P(0, 8, w, h - 8, '#6e4423'); P(0, 8, w, 5, '#875732');
        P(w / 2 - 14, -12, 28, 16, '#20242e'); P(w / 2 - 12, -10, 24, 12, '#48b0ff');
        P(6, 4, 10, 8, '#2a2f3a'); // laptop
        P(w - 16, 4, 8, 6, '#c9a24b'); // trophy-ish
        break;
      }
      case 'table': {
        P(0, 4, w, h - 6, '#7a5230'); P(0, 4, w, 5, '#916334');
        g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(px + 6, py + 10, w - 12, h - 16);
        P(w / 2 - 4, h / 2 - 4, 8, 8, '#3a7d3a');
        break;
      }
      case 'whiteboard': {
        P(0, 0, w, h, '#eef1f5'); g.strokeStyle = '#8892a6'; g.strokeRect(px, py, w, h);
        g.fillStyle = '#7c5ce8'; g.fillRect(px + 6, py + 6, w - 40, 3); g.fillRect(px + 6, py + 14, w - 60, 3);
        g.fillStyle = '#3aa0ff'; g.fillRect(px + 6, py + 22, w - 30, 3);
        break;
      }
      case 'bookshelf': { P(0, 0, w, h, '#5e3d20');
        const cols = ['#c0453a','#3a6dc0','#3a9d5a','#c9a24b','#8a4fc0'];
        for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % 5]; g.fillRect(px + 2 + i * 7, py + 3, 5, h - 6); } break; }
      case 'couch': case 'sofa': { P(0, h * 0.35, w, h * 0.65, '#b5652f'); P(0, 0, w, h * 0.45, '#c9743a');
        P(-2, h * 0.2, 6, h * 0.8, '#9c5527'); P(w - 4, h * 0.2, 6, h * 0.8, '#9c5527'); break; }
      case 'rack': { P(0, 0, w, h, '#232833');
        for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#2e3440' : '#283040'; g.fillRect(px + 2, py + 3 + i * (h - 6) / 6, w - 4, (h - 6) / 6 - 1);
          g.fillStyle = ['#4ade80','#f87171','#fbbf24'][i % 3]; g.fillRect(px + w - 6, py + 5 + i * (h - 6) / 6, 2, 2); } break; }
      case 'counter': { P(0, 0, w, h, '#c7ccd4'); P(0, 0, w, 4, '#dfe3ea'); break; }
      case 'bar': { P(0, 0, w, h, '#b9bec7'); P(0, 0, w, 5, '#d3d7de'); break; }
      case 'coffee': { P(2, -6, w - 4, h + 4, '#2a2f3a'); P(4, -2, w - 8, 5, '#c94'); P(w/2-1, 4, 2, 3, '#6b4'); break; }
      case 'fridge': { P(1, -8, w - 2, h + 6, '#dfe3ea'); g.fillStyle = '#b9bec7'; g.fillRect(px + 2, py - 2, 2, 6); break; }
      case 'coffee-table': { P(0, 2, w, h - 3, '#7a5230'); P(2, 3, w - 4, 3, '#8a5a30'); break; }
      case 'aquarium': { P(0, -4, w, h + 2, '#1a3550'); P(2, -2, w - 4, h - 2, '#2f7fb5');
        g.fillStyle = '#5ad0ff'; g.fillRect(px + 4, py, 3, 2); g.fillStyle = '#3a9d5a'; g.fillRect(px + w - 8, py, 3, 6); break; }
      case 'plant': { g.fillStyle = '#5e3d20'; g.fillRect(px + w/2 - 4, py + h - 8, 8, 8);
        g.fillStyle = '#2f7d3f'; g.beginPath(); g.arc(px + w/2, py + h - 10, 8, 0, 7); g.fill();
        g.fillStyle = '#3a9d4f'; g.beginPath(); g.arc(px + w/2 - 3, py + h - 13, 5, 0, 7); g.fill(); break; }
      default: { P(0, 0, w, h, '#555'); }
    }
  }

  R.drawFurnitureSprite = drawFurniture;
  global.OfficeRender = R;
})(window);

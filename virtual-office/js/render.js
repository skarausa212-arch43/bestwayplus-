/* OfficeRender — TRUE ISOMETRIC "dollhouse" renderer.
 * The whole floor plan is projected into a 2:1 isometric view: floor diamonds,
 * back-left walls (front-right open, dollhouse style), and volumetric furniture
 * with visible side faces. Static geometry is prerendered to one canvas; the
 * engine draws agents + live effects on top using OfficeRender.projectPx().
 */
(function (global) {
  const R = {};
  const TILE = 32;                 // world grid unit (px) — matches layout.js
  const TWH = 18, THH = 9;         // iso tile half-width / half-height (screen)
  const WALLH = 34;                // wall height (px)
  const PAD = 48;

  // origin so every projected point is positive & padded
  let OX = 0, OY = 0;

  // grid(gx,gy,h) -> screen px on the prerender canvas
  function P(gx, gy, h) { return { x: (gx - gy) * TWH + OX, y: (gx + gy) * THH + OY - (h || 0) }; }

  // ---- colour helpers ------------------------------------------------------
  function hx(c) { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
  function shade(hex, f) { const [r, g, b] = hx(hex); const cl = v => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${cl(r)},${cl(g)},${cl(b)})`; }
  function faces(base) { return { top: shade(base, 1.14), right: shade(base, 0.80), left: shade(base, 0.60) }; }

  function poly(g, pts, fill, stroke) {
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }

  // ---- iso primitives ------------------------------------------------------
  function faceTop(g, gx, gy, w, d, h, col) { poly(g, [P(gx, gy, h), P(gx + w, gy, h), P(gx + w, gy + d, h), P(gx, gy + d, h)], col, 'rgba(0,0,0,0.10)'); }
  function faceR(g, gx, gy, w, d, h, col) { poly(g, [P(gx + w, gy, h), P(gx + w, gy + d, h), P(gx + w, gy + d, 0), P(gx + w, gy, 0)], col); }        // SE (+x) face
  function faceL(g, gx, gy, w, d, h, col) { poly(g, [P(gx, gy + d, h), P(gx + w, gy + d, h), P(gx + w, gy + d, 0), P(gx, gy + d, 0)], col); }        // SW (+y) face
  function isoBox(g, gx, gy, w, d, h, c) { faceL(g, gx, gy, w, d, h, c.left); faceR(g, gx, gy, w, d, h, c.right); faceTop(g, gx, gy, w, d, h, c.top); }

  function groundShadow(g, gx, gy, w, d) {
    const c = P(gx + w / 2, gy + d / 2, 0);
    g.save(); g.globalAlpha = 0.16; g.fillStyle = '#000';
    g.beginPath(); g.ellipse(c.x, c.y + 2, (w + d) * TWH * 0.42, (w + d) * THH * 0.42, 0, 0, 7); g.fill(); g.restore();
  }

  function tileDiamond(g, gx, gy, col, edge) {
    poly(g, [P(gx, gy, 0), P(gx + 1, gy, 0), P(gx + 1, gy + 1, 0), P(gx, gy + 1, 0)], col, edge || null);
  }

  // ---- prerender the whole static office ----------------------------------
  R.prerenderWorld = function (world) {
    const COLS = world.COLS, ROWS = world.ROWS;
    OX = ROWS * TWH + PAD;
    OY = WALLH + 56 + PAD;
    const cv = document.createElement('canvas');
    cv.width = (COLS + ROWS) * TWH + 2 * PAD;
    cv.height = (COLS + ROWS) * THH + WALLH + 56 + 2 * PAD;
    const g = cv.getContext('2d');

    // room lookup
    const roomAt = (x, y) => world.rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    const isInterior = (x, y) => x >= 1 && x < COLS - 1 && y >= 1 && y < ROWS - 1;
    const isFloor = (x, y) => isInterior(x, y);

    // 1) FLOOR — continuous interior, room palettes + subtle checker
    for (let sum = 0; sum <= COLS + ROWS; sum++) {
      for (let x = 1; x < COLS - 1; x++) {
        const y = sum - x; if (y < 1 || y >= ROWS - 1) continue;
        const r = roomAt(x, y);
        const t = r ? world.ROOM_TYPES[r.type] : null;
        let col = t ? ((x + y) & 1 ? t.floor : t.floor2) : ((x + y) & 1 ? '#4a4550' : '#443f4a');
        tileDiamond(g, x, y, col, 'rgba(0,0,0,0.05)');
      }
    }

    // 2) WALLS to draw — back-left only (north + west edges) → dollhouse open front
    const doorTiles = new Set();
    for (const d of world.doors) {
      const r = world.rooms.find(rr => rr.id === d.room); if (!r) continue;
      for (let i = 0; i < d.span; i++) {
        if (d.side === 'N') doorTiles.add((r.x + d.at + i) + ',' + r.y);
        if (d.side === 'W') doorTiles.add(r.x + ',' + (r.y + d.at + i));
      }
    }
    const wallSet = new Map(); // "x,y" -> {x,y}
    const addWall = (x, y) => { if (!doorTiles.has(x + ',' + y)) wallSet.set(x + ',' + y, { x, y }); };
    for (const r of world.rooms) {
      for (let x = r.x; x < r.x + r.w; x++) addWall(x, r.y);           // north
      for (let y = r.y; y < r.y + r.h; y++) addWall(r.x, y);           // west
    }
    for (let x = 0; x < COLS; x++) addWall(x, 0);                       // outer north
    for (let y = 0; y < ROWS; y++) addWall(0, y);                       // outer west

    const WALL = { top: '#e7ebf1', right: '#c4ccd7', left: '#a9b3c1' };

    // 3) build a depth-sorted draw list of walls + furniture + chairs
    const items = [];
    for (const w of wallSet.values()) items.push({ depth: w.x + w.y, z: 3, draw: () => wallTile(g, w.x, w.y) });

    for (const f of world.furniture) items.push({ depth: f.x + f.y + (f.w + f.h) * 0.5, z: 1, draw: () => drawFurniture(g, f) });

    // chairs at desks (behind monitor) + meeting seats
    for (const d of world.desks) {
      const [sx, sy] = d.seat;
      items.push({ depth: sx + sy - 0.2, z: 1, draw: () => drawChair(g, sx, sy) });
    }
    for (const s of world.meetingSeats) items.push({ depth: s.x + s.y - 0.2, z: 1, draw: () => drawChair(g, s.x, s.y) });

    items.sort((a, b) => (a.depth - b.depth) || (a.z - b.z));
    for (const it of items) it.draw();

    // 4) baked lighting: warm key light near top-centre + soft vignette
    const cxp = P(COLS * 0.42, ROWS * 0.30, 0);
    let lg = g.createRadialGradient(cxp.x, cxp.y, 40, cxp.x, cxp.y, cv.width * 0.62);
    lg.addColorStop(0, 'rgba(255,240,210,0.16)'); lg.addColorStop(0.5, 'rgba(255,235,205,0.05)'); lg.addColorStop(1, 'rgba(255,235,205,0)');
    g.fillStyle = lg; g.fillRect(0, 0, cv.width, cv.height);
    let vg = g.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.35, cv.width / 2, cv.height / 2, cv.width * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(6,4,12,0.42)');
    g.fillStyle = vg; g.fillRect(0, 0, cv.width, cv.height);

    function wallTile(g, x, y) {
      // door-frame walls slightly lower for a nicer read at gaps handled by omission
      const c = WALL;
      // outer walls a touch taller
      const h = (x === 0 || y === 0) ? WALLH + 4 : WALLH;
      faceL(g, x, y, 1, 1, h, c.left); faceR(g, x, y, 1, 1, h, c.right); faceTop(g, x, y, 1, 1, h, c.top);
      // warm rim light along the top edge
      const a = P(x, y, h), b = P(x + 1, y, h);
      g.strokeStyle = 'rgba(255,240,214,0.28)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }

    return cv;
  };

  // ---- furniture -----------------------------------------------------------
  function drawFurniture(g, f) {
    const x = f.x, y = f.y, w = f.w, h = f.h;
    switch (f.kind) {
      case 'desk': {
        groundShadow(g, x, y, w, h);
        isoBox(g, x, y + 0.1, w, h - 0.2, 12, faces('#6f4c2d'));
        // drawer block
        isoBox(g, x + w - 0.55, y + 0.15, 0.5, h - 0.3, 11, faces('#5a3d24'));
        // monitor on top
        monitor(g, x + w / 2 - 0.55, y + 0.12, '#8fd6ff');
        // keyboard + mug hint (flat)
        flatRect(g, x + 0.25, y + h - 0.42, 0.7, 0.28, 12, '#20222e');
        break;
      }
      case 'exec-desk': {
        groundShadow(g, x, y, w, h);
        isoBox(g, x, y + 0.1, w, h - 0.2, 14, faces('#59401f'));
        monitor(g, x + 0.55, y + 0.15, '#9be0ff');
        monitor(g, x + w - 1.5, y + 0.15, '#9be0ff');
        break;
      }
      case 'table': {
        groundShadow(g, x, y, w, h);
        isoBox(g, x + 0.15, y + 0.15, w - 0.3, h - 0.3, 12, faces('#7c5836'));
        flatRect(g, x + w / 2 - 0.3, y + h / 2 - 0.3, 0.6, 0.6, 12.5, '#2e6b46'); // plant on table
        break;
      }
      case 'whiteboard':
        isoBox(g, x, y + 0.05, w, 0.3, 26, { top: '#f4f6fa', right: '#dfe4ec', left: '#cdd4df' });
        flatRect(g, x + 0.3, y + 0.06, w - 0.6, 0.18, 26.2, '#eef1f6');
        // scribbles
        g.save(); g.strokeStyle = '#5a86e0'; g.lineWidth = 1;
        for (let i = 0; i < 3; i++) { const p1 = P(x + 0.5 + i, y + 0.1, 20 - i * 3), p2 = P(x + 1.3 + i, y + 0.1, 20 - i * 3); g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke(); }
        g.restore();
        break;
      case 'bookshelf':
        colorShelf(g, x, y, w, h, 30);
        break;
      case 'couch': case 'sofa': {
        groundShadow(g, x, y, w, h);
        const base = f.kind === 'couch' ? '#3f5d8a' : '#6d4f8a';
        isoBox(g, x, y + 0.2, w, h - 0.2, 8, faces(base));            // seat
        isoBox(g, x, y + h - 0.35, w, 0.35, 16, faces(shade(base, 0.9))); // backrest
        isoBox(g, x, y + 0.2, 0.3, h - 0.2, 13, faces(base));         // left arm
        isoBox(g, x + w - 0.3, y + 0.2, 0.3, h - 0.2, 13, faces(base)); // right arm
        break;
      }
      case 'rack': {
        groundShadow(g, x, y, w, h);
        isoBox(g, x + 0.1, y + 0.1, w - 0.2, h - 0.2, 32, faces('#23262e'));
        // baked status LEDs on SE face
        for (let r = 0; r < 5; r++) {
          const cols = ['#5be682', '#f26e6e', '#f2c84f'];
          const p = P(x + w - 0.1, y + 0.25, 27 - r * 5);
          g.fillStyle = cols[r % 3]; g.fillRect(p.x - 2, p.y - 2, 3, 3);
        }
        break;
      }
      case 'counter': case 'bar': {
        groundShadow(g, x, y, w, h);
        isoBox(g, x, y + 0.1, w, h - 0.1, f.kind === 'bar' ? 14 : 15, faces('#b7bec8'));
        break;
      }
      case 'coffee': {
        groundShadow(g, x, y, w, h);
        isoBox(g, x + 0.2, y + 0.2, 0.6, 0.6, 11, faces('#2b2f38'));
        flatRect(g, x + 0.28, y + 0.28, 0.44, 0.44, 11.2, '#c04a2a');
        break;
      }
      case 'fridge':
        groundShadow(g, x, y, w, h);
        isoBox(g, x + 0.1, y + 0.1, w - 0.2, h - 0.2, 24, faces('#d6dce3'));
        break;
      case 'coffee-table':
        groundShadow(g, x, y, w, h);
        isoBox(g, x + 0.15, y + 0.15, w - 0.3, h - 0.3, 7, faces('#4b3728'));
        break;
      case 'aquarium':
        groundShadow(g, x, y, w, h);
        isoBox(g, x + 0.1, y + 0.1, w - 0.2, h - 0.2, 10, { top: 'rgba(120,200,235,0.75)', right: 'rgba(40,110,160,0.85)', left: 'rgba(30,90,140,0.9)' });
        break;
      case 'plant':
        plant(g, x + 0.5, y + 0.5);
        break;
      default:
        groundShadow(g, x, y, w, h);
        isoBox(g, x, y, w, h, 10, faces('#6a6a78'));
    }
  }

  // colourful office bookshelf (files/books) — the hero prop from the refs
  function colorShelf(g, x, y, w, h, H) {
    groundShadow(g, x, y, w, h);
    isoBox(g, x, y + 0.05, w, Math.max(0.3, h - 0.1), H, faces('#6d4a2a'));
    const books = ['#c94f34', '#e0872f', '#d8b23a', '#4f7d4a', '#3f6fae', '#8a4fa0', '#c9553f'];
    // rows of coloured spines on the SE (right) face
    for (let row = 0; row < 4; row++) {
      const hz = H - 4 - row * (H / 4.5);
      for (let i = 0; i < Math.round(w * 3); i++) {
        const gx = x + 0.15 + i * 0.32;
        if (gx > x + w - 0.15) break;
        const p = P(gx, y + 0.06, hz);
        g.fillStyle = books[(row * 3 + i) % books.length];
        g.fillRect(p.x - 1.6, p.y - 5.5, 3.2, 5.5);
      }
    }
  }

  function drawChair(g, x, y) {
    groundShadow(g, x + 0.15, y + 0.15, 0.7, 0.7);
    isoBox(g, x + 0.2, y + 0.2, 0.6, 0.6, 9, faces('#2c2f3b'));   // seat
    isoBox(g, x + 0.2, y + 0.72, 0.6, 0.12, 20, faces('#33374a')); // backrest
  }

  function monitor(g, x, y, screen) {
    isoBox(g, x + 0.42, y + 0.02, 0.16, 0.24, 3, faces('#15161d'));   // stand base
    isoBox(g, x, y, 1.0, 0.14, 10, faces('#15161d'));                  // body
    // glowing screen on the SE face
    const a = P(x + 1.0, y, 10.5), b = P(x + 1.0, y + 0.14, 10.5), c = P(x + 1.0, y + 0.14, 2.5), e = P(x + 1.0, y, 2.5);
    poly(g, [a, b, c, e], screen);
    g.save(); g.globalAlpha = 0.5; const gg = g.createRadialGradient(a.x, (a.y + c.y) / 2, 1, a.x, (a.y + c.y) / 2, 14);
    gg.addColorStop(0, screen); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.fillRect(a.x - 14, a.y - 6, 28, 20); g.restore();
  }

  function plant(g, cx, cy) {
    groundShadow(g, cx - 0.25, cy - 0.25, 0.5, 0.5);
    isoBox(g, cx - 0.22, cy - 0.22, 0.44, 0.44, 7, faces('#9a6a44')); // pot
    const greens = ['#3c8a4e', '#4fa85f', '#2f6f42'];
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * 6.28; const r = 0.18 + (i % 2) * 0.05;
      const p = P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 12 + (i % 3) * 4);
      g.fillStyle = greens[i % 3];
      g.beginPath(); g.ellipse(p.x, p.y, 4.5, 6.5, 0, 0, 7); g.fill();
    }
    const top = P(cx, cy, 22); g.fillStyle = '#5fbf6f';
    g.beginPath(); g.ellipse(top.x, top.y, 5, 7, 0, 0, 7); g.fill();
  }

  // small flat detail sitting on a surface at height H
  function flatRect(g, x, y, w, d, H, col) { poly(g, [P(x, y, H), P(x + w, y, H), P(x + w, y + d, H), P(x, y + d, H)], col); }

  // ---- projection API for the engine (agents + live effects) --------------
  R.ISO = { TWH, THH, WALLH, TILE, get OX() { return OX; }, get OY() { return OY; } };
  R.projectPx = function (wx, wy, h) {
    const gx = wx / TILE, gy = wy / TILE;
    return { x: (gx - gy) * TWH + OX, y: (gx + gy) * THH + OY - (h || 0) };
  };

  global.OfficeRender = R;
})(window);

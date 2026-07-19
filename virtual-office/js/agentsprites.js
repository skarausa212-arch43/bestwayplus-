/* Procedural pixel-character sprite factory. Builds an animation set
 * per palette (hair/skin/shirt) and caches offscreen frames. This is
 * the swappable asset layer: replace makeSet() with a spritesheet
 * loader and nothing else changes (AgentSpriteController stays same). */
(function (global) {
  const FW = 32, FH = 40; // frame box
  const cache = new Map();

  function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

  // draw one character frame. dir: 'down'|'up'|'left'|'right', pose params
  function drawChar(g, pal, dir, legPhase, opts = {}) {
    g.clearRect(0, 0, FW, FH);
    const cx = 16, top = 5;
    const sit = opts.sit;
    const bodyY = top + 13;
    const OUT = '#1b1622';           // soft outline colour
    // soft contact shadow
    g.fillStyle = 'rgba(0,0,0,0.26)'; g.beginPath(); g.ellipse(cx, FH - 4, 9, 3.2, 0, 0, 7); g.fill();
    // legs (walk) with outline + shoes
    if (!sit) {
      const l1 = legPhase === 1 ? 2 : 0, l2 = legPhase === 2 ? 2 : 0;
      px(g, cx - 6, FH - 11 - l1, 5, 10 + l1, OUT); px(g, cx + 1, FH - 11 - l2, 5, 10 + l2, OUT);
      px(g, cx - 5, FH - 10 - l1, 3, 7 + l1, '#3a3e56'); px(g, cx + 2, FH - 10 - l2, 3, 7 + l2, '#3a3e56');
      px(g, cx - 6, FH - 4, 4, 3, '#211f2b'); px(g, cx + 1, FH - 4, 4, 3, '#211f2b'); // shoes
    } else {
      px(g, cx - 6, FH - 12, 12, 6, OUT); px(g, cx - 5, FH - 11, 10, 4, '#3a3e56');
    }
    // torso: outline then shaded shirt + collar
    px(g, cx - 9, bodyY - 1, 18, 17, OUT);
    px(g, cx - 8, bodyY, 16, 15, pal.shirt);
    px(g, cx - 8, bodyY, 16, 3, shade(pal.shirt, 1.18));   // top light
    px(g, cx - 8, bodyY + 12, 16, 3, shade(pal.shirt, 0.78)); // hem shade
    px(g, cx - 8, bodyY, 3, 15, shade(pal.shirt, 0.86));   // left shade
    px(g, cx + 5, bodyY, 3, 15, shade(pal.shirt, 1.07));   // right rim
    px(g, cx - 3, bodyY, 6, 3, shade(pal.shirt, 1.28));    // collar
    // arms
    if (opts.type) {
      px(g, cx - 9, bodyY + 6, 4, 7, pal.skin); px(g, cx + 5, bodyY + 6, 4, 7, pal.skin);
    } else {
      px(g, cx - 10, bodyY + 2, 4, 10, pal.shirt); px(g, cx + 6, bodyY + 2, 4, 10, pal.shirt);
      px(g, cx - 10, bodyY + 10, 4, 3, pal.skin); px(g, cx + 6, bodyY + 10, 4, 3, pal.skin);
    }
    // head: outline + shaded skin
    const hy = top;
    px(g, cx - 8, hy - 1, 16, 15, OUT);
    px(g, cx - 7, hy, 14, 13, pal.skin);
    px(g, cx - 7, hy, 14, 3, shade(pal.skin, 1.1));   // forehead light
    px(g, cx - 7, hy + 10, 14, 2, shade(pal.skin, 0.9)); // chin shade
    // hair with highlight
    px(g, cx - 8, hy - 2, 16, 6, pal.hair);
    px(g, cx - 8, hy - 2, 16, 2, shade(pal.hair, 1.28));
    if (dir === 'down') { px(g, cx - 8, hy - 2, 16, 5, pal.hair); px(g, cx - 8, hy + 3, 3, 6, pal.hair); px(g, cx + 5, hy + 3, 3, 6, pal.hair);
      px(g, cx - 4, hy + 6, 2, 2, '#26222e'); px(g, cx + 2, hy + 6, 2, 2, '#26222e'); // eyes
      px(g, cx - 5, hy + 8, 2, 1, 'rgba(222,120,120,0.45)'); px(g, cx + 3, hy + 8, 2, 1, 'rgba(222,120,120,0.45)'); // cheeks
      px(g, cx - 1, hy + 9, 3, 1, 'rgba(120,60,60,0.5)'); } // mouth
    else if (dir === 'up') { px(g, cx - 8, hy - 2, 16, 11, pal.hair); px(g, cx - 8, hy - 2, 16, 2, shade(pal.hair, 1.28)); }
    else if (dir === 'left') { px(g, cx - 8, hy - 2, 13, 9, pal.hair); px(g, cx - 6, hy + 6, 2, 2, '#26222e'); }
    else if (dir === 'right') { px(g, cx - 5, hy - 2, 13, 9, pal.hair); px(g, cx + 4, hy + 6, 2, 2, '#26222e'); }
    // headset accent (optional)
    if (opts.headset) { px(g, cx - 9, hy + 3, 2, 5, '#333'); px(g, cx + 7, hy + 3, 2, 5, '#333'); px(g, cx - 9, hy - 1, 18, 2, '#333'); }
    // glasses (optional)
    if (opts.glasses && (dir === 'down')) { px(g, cx - 5, hy + 6, 4, 3, 'rgba(60,80,120,0.75)'); px(g, cx + 1, hy + 6, 4, 3, 'rgba(60,80,120,0.75)'); }
  }

  function shade(hex, f) {
    const c = hex.replace('#', ''); let r = parseInt(c.substr(0,2),16), gg = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
    r = Math.min(255, r*f)|0; gg = Math.min(255, gg*f)|0; b = Math.min(255, b*f)|0;
    return `rgb(${r},${gg},${b})`;
  }

  function frame(pal, dir, legPhase, opts) {
    const cv = document.createElement('canvas'); cv.width = FW; cv.height = FH;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    drawChar(g, pal, dir, legPhase, opts); return cv;
  }

  function makeSet(pal, opts = {}) {
    const k = JSON.stringify([pal, opts]);
    if (cache.has(k)) return cache.get(k);
    const set = {
      idle:  [frame(pal, 'down', 0, opts)],
      down:  [frame(pal, 'down', 1, opts), frame(pal, 'down', 0, opts), frame(pal, 'down', 2, opts), frame(pal, 'down', 0, opts)],
      up:    [frame(pal, 'up', 1, opts), frame(pal, 'up', 0, opts), frame(pal, 'up', 2, opts), frame(pal, 'up', 0, opts)],
      left:  [frame(pal, 'left', 1, opts), frame(pal, 'left', 0, opts), frame(pal, 'left', 2, opts), frame(pal, 'left', 0, opts)],
      right: [frame(pal, 'right', 1, opts), frame(pal, 'right', 0, opts), frame(pal, 'right', 2, opts), frame(pal, 'right', 0, opts)],
      sit:   [frame(pal, 'up', 0, { ...opts, sit: true })],
      type:  [frame(pal, 'up', 0, { ...opts, sit: true, type: true }), frame(pal, 'up', 0, { ...opts, sit: true })],
    };
    cache.set(k, set); return set;
  }

  global.AgentSprites = { makeSet, FW, FH };
})(window);

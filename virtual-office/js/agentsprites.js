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
    const cx = 16, top = 6;
    const sit = opts.sit;
    const bodyY = sit ? top + 12 : top + 12;
    // shadow
    px(g, cx - 8, FH - 5, 16, 4, 'rgba(0,0,0,0.28)');
    // legs (walk)
    if (!sit) {
      const l1 = legPhase === 1 ? 2 : 0, l2 = legPhase === 2 ? 2 : 0;
      px(g, cx - 6, FH - 10 - l1, 5, 8 + l1, '#2c2f45');
      px(g, cx + 1, FH - 10 - l2, 5, 8 + l2, '#2c2f45');
    } else {
      px(g, cx - 6, FH - 12, 12, 6, '#2c2f45'); // seated legs stub
    }
    // torso / shirt
    px(g, cx - 8, bodyY, 16, 15, pal.shirt);
    px(g, cx - 8, bodyY, 16, 3, shade(pal.shirt, 1.15));
    px(g, cx - 8, bodyY + 12, 16, 3, shade(pal.shirt, 0.8));
    // arms
    if (opts.type) { // typing: arms forward
      px(g, cx - 9, bodyY + 6, 4, 7, pal.skin); px(g, cx + 5, bodyY + 6, 4, 7, pal.skin);
    } else {
      px(g, cx - 10, bodyY + 2, 4, 10, pal.shirt); px(g, cx + 6, bodyY + 2, 4, 10, pal.shirt);
      px(g, cx - 10, bodyY + 10, 4, 3, pal.skin); px(g, cx + 6, bodyY + 10, 4, 3, pal.skin);
    }
    // head
    const hy = top;
    px(g, cx - 7, hy, 14, 13, pal.skin);
    px(g, cx - 7, hy, 14, 3, shade(pal.skin, 1.08));
    // hair by direction
    px(g, cx - 8, hy - 2, 16, 6, pal.hair);
    if (dir === 'down') { px(g, cx - 8, hy - 2, 16, 5, pal.hair); px(g, cx - 8, hy + 3, 3, 6, pal.hair); px(g, cx + 5, hy + 3, 3, 6, pal.hair);
      // face
      px(g, cx - 4, hy + 6, 2, 2, '#20202a'); px(g, cx + 2, hy + 6, 2, 2, '#20202a');
      px(g, cx - 2, hy + 9, 4, 1, 'rgba(120,60,60,0.5)'); }
    else if (dir === 'up') { px(g, cx - 8, hy - 2, 16, 11, pal.hair); }
    else if (dir === 'left') { px(g, cx - 8, hy - 2, 13, 8, pal.hair); px(g, cx - 6, hy + 6, 2, 2, '#20202a'); }
    else if (dir === 'right') { px(g, cx - 5, hy - 2, 13, 8, pal.hair); px(g, cx + 4, hy + 6, 2, 2, '#20202a'); }
    // headset accent (optional)
    if (opts.headset) { px(g, cx - 9, hy + 3, 2, 5, '#333'); px(g, cx + 7, hy + 3, 2, 5, '#333'); px(g, cx - 9, hy - 1, 18, 2, '#333'); }
    // glasses (optional)
    if (opts.glasses && (dir === 'down')) { px(g, cx - 5, hy + 6, 4, 3, 'rgba(60,80,120,0.7)'); px(g, cx + 1, hy + 6, 4, 3, 'rgba(60,80,120,0.7)'); }
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

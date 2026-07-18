/* A* pathfinding on the office navigation grid (4-neighbour, with
 * cheap diagonal smoothing). Blocked cells come from OfficeLayout. */
(function (global) {
  class Grid {
    constructor(blocked) { this.blocked = blocked; this.rows = blocked.length; this.cols = blocked[0].length; }
    walkable(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows && !this.blocked[y][x]; }
    setBlocked(x, y, v) { if (this.blocked[y]) this.blocked[y][x] = v; }
  }

  function heuristic(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }

  // A* returns array of {x,y} tile centers (incl. start-adjacent..goal) or null
  function findPath(grid, sx, sy, gx, gy, opts = {}) {
    if (!grid.walkable(gx, gy)) {
      // snap goal to nearest walkable neighbour
      const alt = nearestWalkable(grid, gx, gy);
      if (!alt) return null; gx = alt.x; gy = alt.y;
    }
    if (sx === gx && sy === gy) return [{ x: gx, y: gy }];
    const key = (x, y) => y * grid.cols + x;
    const open = new MinHeap();
    const gScore = new Map(); const came = new Map();
    gScore.set(key(sx, sy), 0);
    open.push({ x: sx, y: sy, f: heuristic(sx, sy, gx, gy) });
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    let iters = 0, cap = opts.cap || 8000;
    while (open.size() && iters++ < cap) {
      const cur = open.pop();
      if (cur.x === gx && cur.y === gy) return reconstruct(came, key, cur, grid);
      const cg = gScore.get(key(cur.x, cur.y));
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!grid.walkable(nx, ny)) continue;
        const ng = cg + 1;
        const nk = key(nx, ny);
        if (ng < (gScore.has(nk) ? gScore.get(nk) : Infinity)) {
          gScore.set(nk, ng); came.set(nk, cur);
          open.push({ x: nx, y: ny, f: ng + heuristic(nx, ny, gx, gy) });
        }
      }
    }
    return null;
  }

  function reconstruct(came, key, node, grid) {
    const path = [node];
    let k = key(node.x, node.y);
    while (came.has(k)) { const p = came.get(k); path.push(p); k = key(p.x, p.y); }
    path.reverse();
    return smooth(path, grid);
  }

  // remove collinear waypoints + line-of-sight shortcut
  function smooth(path, grid) {
    if (path.length <= 2) return path;
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
      let j = path.length - 1;
      for (; j > i + 1; j--) { if (lineClear(grid, path[i], path[j])) break; }
      out.push(path[j]); i = j;
    }
    return out;
  }
  function lineClear(grid, a, b) {
    let x0 = a.x, y0 = a.y; const x1 = b.x, y1 = b.y;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      if (!grid.walkable(x0, y0)) return false;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return true;
  }

  function nearestWalkable(grid, x, y) {
    for (let r = 1; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (grid.walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
    return null;
  }

  class MinHeap {
    constructor() { this.a = []; }
    size() { return this.a.length; }
    push(n) { const a = this.a; a.push(n); let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a; const top = a[0]; const last = a.pop();
      if (a.length) { a[0] = last; let i = 0; const n = a.length;
        while (true) { let l = 2*i+1, r = 2*i+2, s = i;
          if (l < n && a[l].f < a[s].f) s = l; if (r < n && a[r].f < a[s].f) s = r;
          if (s === i) break; [a[s], a[i]] = [a[i], a[s]]; i = s; } }
      return top; }
  }

  global.Pathfinding = { Grid, findPath, nearestWalkable };
})(window);

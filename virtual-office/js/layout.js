/* ============================================================
 * office-layout — data-driven floor plan (single source of truth
 * for geometry). Compact plan: rooms packed tight with shared walls
 * so the whole office reads bigger/closer on screen. Everything
 * downstream (render, collision, navigation, desk assignment) is
 * derived from this.
 * ========================================================== */
(function (global) {
  const TILE = 32;
  const COLS = 40;
  const ROWS = 26;

  // room type -> palette (floor tints; render applies a glossy dark base)
  const ROOM_TYPES = {
    OPEN_SPACE:  { floor: '#7b5836', floor2: '#6f4f30', name: 'Рабочая зона' },
    MEETING:     { floor: '#6d4d2f', floor2: '#634629', name: 'Переговорная' },
    MANAGEMENT:  { floor: '#7a5535', floor2: '#6d4b2e', name: 'Руководство' },
    SERVER:      { floor: '#3a3f4a', floor2: '#333844', name: 'Серверная' },
    DEV:         { floor: '#71502f', floor2: '#664829', name: 'Разработка' },
    LOUNGE:      { floor: '#5f4a34', floor2: '#57432f', name: 'Зона отдыха' },
    KITCHEN:     { floor: '#8a8f98', floor2: '#7f848d', name: 'Кухня' },
    ENTRANCE:    { floor: '#5b5b5b', floor2: '#545454', name: 'Вход' },
  };

  // rooms in TILE coords {x,y,w,h}. Walls sit on the perimeter; neighbours
  // share a boundary row/column. Doors are carved as gaps below.
  const rooms = [
    { id: 'meeting',  type: 'MEETING',    x: 1,  y: 1,  w: 13, h: 11, label: 'ПЕРЕГОВОРНАЯ' },
    { id: 'open',     type: 'OPEN_SPACE', x: 13, y: 1,  w: 14, h: 13, label: 'РАБОЧАЯ ЗОНА' },
    { id: 'mgmt',     type: 'MANAGEMENT', x: 26, y: 1,  w: 13, h: 8,  label: 'РУКОВОДСТВО' },
    { id: 'server',   type: 'SERVER',     x: 26, y: 8,  w: 13, h: 7,  label: 'СЕРВЕРНАЯ' },
    { id: 'dev',      type: 'DEV',        x: 1,  y: 11, w: 13, h: 8,  label: 'РАЗРАБОТКА' },
    { id: 'lounge',   type: 'LOUNGE',     x: 1,  y: 18, w: 13, h: 7,  label: 'ЗОНА ОТДЫХА' },
    { id: 'entrance', type: 'ENTRANCE',   x: 13, y: 13, w: 14, h: 12, label: 'ВХОД' },
    { id: 'kitchen',  type: 'KITCHEN',    x: 26, y: 14, w: 13, h: 11, label: 'КУХНЯ / КОФЕ' },
  ];

  // door openings: {room, side:'N'|'S'|'E'|'W', at: tile offset along that side, span}
  const doors = [
    { room: 'meeting',  side: 'E', at: 5, span: 2 },  // -> open
    { room: 'open',     side: 'W', at: 5, span: 2 },
    { room: 'open',     side: 'E', at: 3, span: 2 },  // -> mgmt
    { room: 'mgmt',     side: 'W', at: 3, span: 2 },
    { room: 'open',     side: 'S', at: 6, span: 3 },  // -> entrance
    { room: 'entrance', side: 'N', at: 6, span: 3 },
    { room: 'meeting',  side: 'S', at: 5, span: 2 },  // -> dev
    { room: 'dev',      side: 'N', at: 5, span: 2 },
    { room: 'dev',      side: 'E', at: 4, span: 2 },  // -> entrance
    { room: 'entrance', side: 'W', at: 2, span: 2 },
    { room: 'dev',      side: 'S', at: 5, span: 2 },  // -> lounge
    { room: 'lounge',   side: 'N', at: 5, span: 2 },
    { room: 'mgmt',     side: 'S', at: 5, span: 2 },  // -> server
    { room: 'server',   side: 'N', at: 5, span: 2 },
    { room: 'server',   side: 'S', at: 5, span: 2 },  // -> kitchen
    { room: 'kitchen',  side: 'N', at: 5, span: 2 },
    { room: 'entrance', side: 'E', at: 5, span: 2 },  // -> kitchen
    { room: 'kitchen',  side: 'W', at: 4, span: 2 },
  ];

  function buildBlocked() {
    const blocked = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
    for (let x = 0; x < COLS; x++) { blocked[0][x] = true; blocked[ROWS - 1][x] = true; }
    for (let y = 0; y < ROWS; y++) { blocked[y][0] = true; blocked[y][COLS - 1] = true; }
    for (const r of rooms) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (r.y >= 0 && r.y < ROWS) blocked[r.y][x] = true;
        const yb = r.y + r.h - 1; if (yb < ROWS) blocked[yb][x] = true;
      }
      for (let y = r.y; y < r.y + r.h; y++) {
        blocked[y][r.x] = true;
        const xr = r.x + r.w - 1; if (xr < COLS) blocked[y][xr] = true;
      }
    }
    for (const d of doors) {
      const r = rooms.find(rr => rr.id === d.room);
      for (let i = 0; i < d.span; i++) {
        if (d.side === 'N') blocked[r.y][r.x + d.at + i] = false;
        if (d.side === 'S') blocked[r.y + r.h - 1][r.x + d.at + i] = false;
        if (d.side === 'W') blocked[r.y + d.at + i][r.x] = false;
        if (d.side === 'E') blocked[r.y + d.at + i][r.x + r.w - 1] = false;
      }
    }
    return blocked;
  }

  // Desks: pos = desk tile (top-left of 2x1 sprite); seat = where agent sits;
  // stand = walkable tile the agent stands on to sit. dir = facing when seated.
  const desks = [
    // open workspace — 2 columns x 3 rows
    { id: 'd1', room: 'open', dx: 15, dy: 3,  seat: [16, 4],  stand: [16, 5],  dir: 'up' },
    { id: 'd2', room: 'open', dx: 21, dy: 3,  seat: [22, 4],  stand: [22, 5],  dir: 'up' },
    { id: 'd3', room: 'open', dx: 15, dy: 6,  seat: [16, 7],  stand: [16, 8],  dir: 'up' },
    { id: 'd4', room: 'open', dx: 21, dy: 6,  seat: [22, 7],  stand: [22, 8],  dir: 'up' },
    { id: 'd5', room: 'open', dx: 15, dy: 9,  seat: [16, 10], stand: [16, 11], dir: 'up' },
    { id: 'd6', room: 'open', dx: 21, dy: 9,  seat: [22, 10], stand: [22, 11], dir: 'up' },
    // dev / design
    { id: 'd7', room: 'dev', dx: 3,  dy: 12, seat: [4, 13],  stand: [4, 14],  dir: 'up' },
    { id: 'd8', room: 'dev', dx: 9,  dy: 12, seat: [10, 13], stand: [10, 14], dir: 'up' },
    { id: 'd9', room: 'dev', dx: 3,  dy: 15, seat: [4, 16],  stand: [4, 17],  dir: 'up' },
    // management (CEO)
    { id: 'd10', room: 'mgmt', dx: 30, dy: 3, seat: [32, 4], stand: [32, 5], dir: 'up' },
  ];

  // meeting room seats (around table x5..8,y4..6)
  const meetingSeats = [
    { x: 4, y: 4, dir: 'right' }, { x: 4, y: 6, dir: 'right' },
    { x: 9, y: 4, dir: 'left' },  { x: 9, y: 6, dir: 'left' },
    { x: 6, y: 3, dir: 'down' },  { x: 7, y: 3, dir: 'down' },
    { x: 6, y: 7, dir: 'up' },    { x: 7, y: 7, dir: 'up' },
  ];

  // interaction points
  const points = {
    coffee:   [{ x: 29, y: 17 }, { x: 31, y: 17 }],
    lounge:   [{ x: 4, y: 21 }, { x: 7, y: 22 }],
    kitchen:  [{ x: 34, y: 20 }],
    watercooler: [{ x: 15, y: 3 }],
  };

  function buildFurniture() {
    const f = [];
    for (const d of desks) f.push({ kind: 'desk', x: d.dx, y: d.dy, w: 2, h: 1, deskId: d.id });
    // meeting
    f.push({ kind: 'table', x: 5, y: 4, w: 4, h: 3 });
    f.push({ kind: 'whiteboard', x: 3, y: 1, w: 4, h: 1, noCollide: true });
    // management
    f.push({ kind: 'exec-desk', x: 30, y: 2, w: 4, h: 2 });
    f.push({ kind: 'bookshelf', x: 27, y: 1, w: 2, h: 1 });
    f.push({ kind: 'couch', x: 36, y: 5, w: 2, h: 2 });
    // server
    for (let i = 0; i < 4; i++) f.push({ kind: 'rack', x: 28 + i * 2, y: 10, w: 1, h: 2 });
    // kitchen
    f.push({ kind: 'counter', x: 28, y: 15, w: 7, h: 1 });
    f.push({ kind: 'coffee', x: 31, y: 16, w: 1, h: 1 });
    f.push({ kind: 'fridge', x: 28, y: 16, w: 1, h: 1 });
    f.push({ kind: 'bar', x: 30, y: 21, w: 5, h: 1 });
    // lounge
    f.push({ kind: 'sofa', x: 3, y: 20, w: 4, h: 2 });
    f.push({ kind: 'coffee-table', x: 5, y: 23, w: 2, h: 1 });
    f.push({ kind: 'aquarium', x: 9, y: 21, w: 2, h: 1 });
    // plants (soft decor, never block)
    const plants = [[15, 2], [24, 2], [15, 11], [35, 3], [3, 17], [11, 19], [16, 22], [33, 22], [9, 9], [24, 20]];
    for (const [x, y] of plants) f.push({ kind: 'plant', x, y, w: 1, h: 1 });
    return f;
  }

  function build() {
    const blocked = buildBlocked();
    const furniture = buildFurniture();
    for (const fu of furniture) {
      if (fu.noCollide || fu.kind === 'plant') continue;
      for (let y = fu.y; y < fu.y + fu.h; y++)
        for (let x = fu.x; x < fu.x + fu.w; x++)
          if (blocked[y] && x < COLS) blocked[y][x] = true;
    }
    for (const d of desks) { if (blocked[d.stand[1]]) blocked[d.stand[1]][d.stand[0]] = false; }
    for (const s of meetingSeats) { if (blocked[s.y]) blocked[s.y][s.x] = false; }
    return {
      TILE, COLS, ROWS, ROOM_TYPES,
      rooms, doors, desks, meetingSeats, points, furniture, blocked,
      entrance: { x: 19, y: 22, door: [19, 24] },
      worldW: COLS * TILE, worldH: ROWS * TILE,
    };
  }

  global.OfficeLayout = { build, TILE, COLS, ROWS };
})(window);

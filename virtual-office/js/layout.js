/* ============================================================
 * office-layout — data-driven floor plan (single source of truth
 * for geometry). Everything downstream (render, collision,
 * navigation, desk assignment) is derived from this. Designed so
 * a future Office Editor can mutate this object and re-derive.
 * ========================================================== */
(function (global) {
  const TILE = 32;
  const COLS = 52;
  const ROWS = 38;

  // room type -> palette
  const ROOM_TYPES = {
    OPEN_SPACE:  { floor: '#7b5836', floor2: '#6f4f30', name: 'Рабочая зона' },
    MEETING:     { floor: '#6d4d2f', floor2: '#634629', name: 'Переговорная' },
    MANAGEMENT:  { floor: '#7a5535', floor2: '#6d4b2e', name: 'Руководство' },
    SERVER:      { floor: '#3a3f4a', floor2: '#333844', name: 'Серверная' },
    DEV:         { floor: '#71502f', floor2: '#664829', name: 'Дизайн / Разработка' },
    LOUNGE:      { floor: '#5f4a34', floor2: '#57432f', name: 'Зона отдыха' },
    KITCHEN:     { floor: '#8a8f98', floor2: '#7f848d', name: 'Кухня' },
    ENTRANCE:    { floor: '#5b5b5b', floor2: '#545454', name: 'Вход' },
  };

  // rooms in TILE coordinates {x,y,w,h}. Doors are gaps carved later.
  const rooms = [
    { id: 'meeting',   type: 'MEETING',    x: 2,  y: 2,  w: 15, h: 10, label: 'ПЕРЕГОВОРНАЯ' },
    { id: 'open',      type: 'OPEN_SPACE', x: 19, y: 2,  w: 18, h: 18, label: 'РАБОЧАЯ ЗОНА' },
    { id: 'mgmt',      type: 'MANAGEMENT', x: 39, y: 2,  w: 11, h: 9,  label: 'РУКОВОДСТВО' },
    { id: 'server',    type: 'SERVER',     x: 39, y: 13, w: 11, h: 8,  label: 'СЕРВЕРНАЯ' },
    { id: 'dev',       type: 'DEV',        x: 2,  y: 14, w: 15, h: 11, label: 'ДИЗАЙН / РАЗРАБОТКА' },
    { id: 'lounge',    type: 'LOUNGE',     x: 2,  y: 27, w: 15, h: 9,  label: 'ЗОНА ОТДЫХА' },
    { id: 'entrance',  type: 'ENTRANCE',   x: 21, y: 28, w: 12, h: 8,  label: 'ВХОД' },
    { id: 'kitchen',   type: 'KITCHEN',    x: 35, y: 23, w: 15, h: 13, label: 'КУХНЯ / КОФЕ' },
  ];

  // door openings: {room, side:'N'|'S'|'E'|'W', at: tile offset along that side, span}
  const doors = [
    { room: 'meeting',  side: 'E', at: 6, span: 2 },
    { room: 'open',     side: 'W', at: 6, span: 2 },
    { room: 'open',     side: 'E', at: 3, span: 2 },   // -> mgmt corridor
    { room: 'open',     side: 'S', at: 7, span: 3 },   // -> entrance/center
    { room: 'mgmt',     side: 'W', at: 4, span: 2 },
    { room: 'server',   side: 'W', at: 3, span: 2 },
    { room: 'dev',      side: 'N', at: 6, span: 3 },   // -> open
    { room: 'dev',      side: 'S', at: 6, span: 2 },   // -> lounge
    { room: 'lounge',   side: 'N', at: 6, span: 2 },
    { room: 'entrance', side: 'N', at: 5, span: 3 },
    { room: 'entrance', side: 'E', at: 3, span: 2 },   // -> kitchen
    { room: 'kitchen',  side: 'W', at: 4, span: 2 },
    { room: 'server',   side: 'S', at: 3, span: 2 },   // -> kitchen top
  ];

  // Build blocked grid (walls). true = solid.
  function buildBlocked() {
    const blocked = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
    // outer bounds solid
    for (let x = 0; x < COLS; x++) { blocked[0][x] = true; blocked[ROWS - 1][x] = true; }
    for (let y = 0; y < ROWS; y++) { blocked[y][0] = true; blocked[y][COLS - 1] = true; }
    // room perimeters
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
    // carve doors
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

  // Desks: one per work agent. pos = desk tile (top-left of desk sprite 2x1),
  // chair = where agent sits, interact = walkable tile the agent stands on to sit.
  // dir = facing when seated.
  const desks = [
    // open workspace (2 columns of desks)
    { id: 'd1', room: 'open', dx: 21, dy: 4,  seat: [22, 5], stand: [22, 6], dir: 'up' },
    { id: 'd2', room: 'open', dx: 31, dy: 4,  seat: [32, 5], stand: [32, 6], dir: 'up' },
    { id: 'd3', room: 'open', dx: 21, dy: 9,  seat: [22, 10], stand: [22, 11], dir: 'up' },
    { id: 'd4', room: 'open', dx: 31, dy: 9,  seat: [32, 10], stand: [32, 11], dir: 'up' },
    { id: 'd5', room: 'open', dx: 21, dy: 14, seat: [22, 15], stand: [22, 16], dir: 'up' },
    { id: 'd6', room: 'open', dx: 31, dy: 14, seat: [32, 15], stand: [32, 16], dir: 'up' },
    // dev/design
    { id: 'd7', room: 'dev', dx: 4,  dy: 17, seat: [5, 18], stand: [5, 19], dir: 'up' },
    { id: 'd8', room: 'dev', dx: 10, dy: 17, seat: [11, 18], stand: [11, 19], dir: 'up' },
    { id: 'd9', room: 'dev', dx: 4,  dy: 21, seat: [5, 22], stand: [6, 22], dir: 'up' },
    // management (CEO)
    { id: 'd10', room: 'mgmt', dx: 43, dy: 5, seat: [44, 6], stand: [44, 7], dir: 'up' },
  ];

  // meeting room seats (around table)
  const meetingSeats = [
    { x: 5, y: 6, dir: 'right' }, { x: 5, y: 8, dir: 'right' },
    { x: 9, y: 5, dir: 'down' },  { x: 11, y: 5, dir: 'down' },
    { x: 13, y: 6, dir: 'left' }, { x: 13, y: 8, dir: 'left' },
    { x: 9, y: 9, dir: 'up' },    { x: 11, y: 9, dir: 'up' },
  ];

  // interaction points
  const points = {
    coffee:   [{ x: 40, y: 27 }, { x: 42, y: 27 }],
    lounge:   [{ x: 5, y: 31 }, { x: 8, y: 32 }],
    kitchen:  [{ x: 44, y: 30 }],
    watercooler: [{ x: 19, y: 4 }],
  };

  // furniture for rendering + collision footprints (tile coords, w/h in tiles)
  function buildFurniture() {
    const f = [];
    // desks (2x1) render + collide
    for (const d of desks) f.push({ kind: 'desk', x: d.dx, y: d.dy, w: 2, h: 1, deskId: d.id });
    // meeting table (center of meeting room)
    f.push({ kind: 'table', x: 7, y: 6, w: 5, h: 3 });
    // whiteboard on meeting north wall
    f.push({ kind: 'whiteboard', x: 3, y: 2, w: 4, h: 1, noCollide: true });
    // CEO big desk
    f.push({ kind: 'exec-desk', x: 42, y: 5, w: 4, h: 2 });
    f.push({ kind: 'bookshelf', x: 40, y: 3, w: 2, h: 1 });
    f.push({ kind: 'couch', x: 47, y: 8, w: 2, h: 2 });
    // server racks
    for (let i = 0; i < 4; i++) f.push({ kind: 'rack', x: 41 + i * 2, y: 15, w: 1, h: 2 });
    // kitchen
    f.push({ kind: 'counter', x: 37, y: 26, w: 8, h: 1 });
    f.push({ kind: 'coffee', x: 39, y: 25, w: 1, h: 1 });
    f.push({ kind: 'fridge', x: 37, y: 25, w: 1, h: 1 });
    f.push({ kind: 'bar', x: 40, y: 31, w: 5, h: 1 });
    // lounge
    f.push({ kind: 'sofa', x: 4, y: 30, w: 4, h: 2 });
    f.push({ kind: 'coffee-table', x: 5, y: 33, w: 2, h: 1 });
    f.push({ kind: 'aquarium', x: 12, y: 31, w: 2, h: 1 });
    // plants scattered (decor, some collide)
    const plants = [[18,3],[37,3],[18,19],[37,19],[2,26],[16,26],[33,23],[49,23],[9,13],[3,12]];
    for (const [x,y] of plants) f.push({ kind: 'plant', x, y, w: 1, h: 1 });
    return f;
  }

  function build() {
    const blocked = buildBlocked();
    const furniture = buildFurniture();
    // stamp furniture collision (except decor marked noCollide, and plants are soft)
    for (const fu of furniture) {
      if (fu.noCollide || fu.kind === 'plant') continue;
      for (let y = fu.y; y < fu.y + fu.h; y++)
        for (let x = fu.x; x < fu.x + fu.w; x++)
          if (blocked[y] && x < COLS) blocked[y][x] = true;
    }
    // keep seats & stands walkable (agent occupies them)
    for (const d of desks) { if (blocked[d.stand[1]]) blocked[d.stand[1]][d.stand[0]] = false; }
    for (const s of meetingSeats) { if (blocked[s.y]) blocked[s.y][s.x] = false; }
    return {
      TILE, COLS, ROWS, ROOM_TYPES,
      rooms, doors, desks, meetingSeats, points, furniture, blocked,
      entrance: { x: 26, y: 34, door: [26, 35] },
      worldW: COLS * TILE, worldH: ROWS * TILE,
    };
  }

  global.OfficeLayout = { build, TILE, COLS, ROWS };
})(window);

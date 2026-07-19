/* GPS Dispatch — connects the "Gena" agent to the real taxi fleet.
 * Polls /cars (same origin) with the Bearer token injected server-side in
 * config.js (never committed to the repo). If no token / offline, the agent
 * still exists but shows a "not connected" fleet card. */
(function (global) {
  const GPS = { agentId: 'gena', timer: null, store: null };

  GPS.start = function (store) {
    this.store = store;
    this.tick();
    this.timer = setInterval(() => this.tick(), 15000);
  };

  GPS.token = function () {
    const c = global.__OFFICE_CFG || {};
    return c.carsToken || null; // expected form: "Bearer <token>"
  };

  GPS.tick = async function () {
    const a = this.store.getAgent(this.agentId); if (!a) return;
    const tok = this.token(); // usually null — Caddy injects the Bearer token for /cars
    try {
      const r = await fetch('/cars', { headers: tok ? { 'Authorization': tok } : {} });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const cars = Array.isArray(d.cars) ? d.cars : [];
      const moving = cars.filter(c => c.status === 'm').length;
      a.gps = {
        total: cars.length, moving, updatedAt: d.updatedAt,
        cars: cars.slice(0, 10).map(c => ({ name: c.name || c.plate || c.imei, statusText: c.statusText || '', speed: c.speed || 0, moving: c.status === 'm' })),
      };
      a._gpsDriven = true;
      if (['IDLE', 'WORKING'].includes(a.status) || a._gpsDriven && a.status !== 'MOVING' && a.status !== 'MEETING')
        this.store.setStatus(a.id, 'WORKING', `отслеживает ${cars.length} авто · ${moving} в движении`);
    } catch (e) {
      a.gps = { error: String(e.message || e) };
      if (a.status === 'IDLE') this.store.setStatus(a.id, 'WORKING', 'GPS-диспетчер');
    }
  };

  global.OfficeGPS = GPS;
})(window);

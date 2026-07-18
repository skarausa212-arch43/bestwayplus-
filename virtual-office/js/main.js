/* Bootstrap: wire world -> engine -> director -> UI, then run the loop. */
(function (global) {
  function boot() {
    const world = OfficeLayout.build();
    world._store = OfficeStore;

    const canvas = document.getElementById('scene');
    const engine = new OfficeEngine(canvas, world);
    const director = new OfficeDirector(world, OfficeStore, OfficeBus);
    engine.agents = director.agents;
    engine.meetings = { get length() { return OfficeStore.meetings.size; } };
    // expose meetings list to engine each frame
    Object.defineProperty(engine, 'meetings', { get() { return [...OfficeStore.meetings.values()]; } });

    OfficeUI.init(engine, director, OfficeStore, OfficeBus);

    director.spawnTeam();
    director.seedDemoStates();

    window.addEventListener('resize', () => engine.resize());

    let last = performance.now();
    function frame(now) {
      let dt = (now - last) / 1000; last = now; if (dt > 0.1) dt = 0.1;
      director.tick(dt);
      // token/cost accrual for actively-working agents (demo telemetry)
      for (const a of director.agents) {
        if (['CODING', 'WORKING', 'WRITING', 'DESIGNING', 'RESEARCHING', 'REVIEWING'].includes(a.status)) {
          a.tokens += Math.round(dt * 42); a.cost = a.tokens / 1_000_000 * 3;
        }
      }
      engine.step(dt);
      engine.render();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // loading splash off
    const sp = document.getElementById('splash'); if (sp) { sp.classList.add('hide'); setTimeout(() => sp.remove(), 600); }
    global.__office = { world, engine, director, store: OfficeStore, bus: OfficeBus };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);

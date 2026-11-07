/** Tiny dependency-free confetti burst in MODU colours. Respects reduced motion. */
export function confetti(origin?: { x: number; y: number }) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: `${w}px`, height: `${h}px`, pointerEvents: "none", zIndex: "100" });
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const ox = origin?.x ?? w / 2;
  const oy = origin?.y ?? h / 2;
  const colors = ["#F4B58D", "#D6A23C", "#AAB0B8", "#f6efe8", "#e8935f"];
  const parts = Array.from({ length: 140 }, () => {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * 9 + 4;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 6,
      size: Math.random() * 7 + 3,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      star: Math.random() < 0.25,
    };
  });
  const start = performance.now();
  const tick = (t: number) => {
    const age = t - start;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 2200);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.star) {
        ctx.font = `${p.size * 2}px sans-serif`;
        ctx.fillText("✦", 0, 0);
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (age < 2200) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}

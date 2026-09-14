/**
 * Motion helpers.
 *
 * Everything here is opt-out: if the visitor asked their system for reduced
 * motion, each helper applies the final state immediately instead of animating.
 * Animations only ever touch transform and opacity, so they stay off the layout
 * path and cannot cause reflow while a list is scrolling.
 */

export const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Staggers a list in. Capped so a long grid never leaves the last card waiting. */
export function stagger(container, selector = ':scope > *', { step = 55, max = 10 } = {}) {
  if (!container) return;
  const nodes = [...container.querySelectorAll(selector)];
  if (reducedMotion()) return;
  nodes.forEach((node, i) => {
    node.style.setProperty('--i', String(Math.min(i, max)));
    node.classList.add('stagger-item');
  });
}

let observer = null;

/** Reveals elements as they scroll into view; each element animates once. */
export function revealOnScroll(root = document, selector = '.reveal') {
  const nodes = [...root.querySelectorAll(selector)];
  if (!nodes.length) return;

  if (reducedMotion() || !('IntersectionObserver' in window)) {
    nodes.forEach((n) => n.classList.add('in'));
    return;
  }

  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );

  nodes.forEach((n) => {
    // Already on screen at render time: show it without waiting for a scroll.
    const box = n.getBoundingClientRect();
    if (box.top < window.innerHeight * 0.92) n.classList.add('in');
    else observer.observe(n);
  });
}

/** Counts a number up. `format` turns the running value into display text. */
export function countUp(el, to, { duration = 900, format = (v) => String(v) } = {}) {
  if (!el) return;
  const target = Number(to) || 0;
  if (reducedMotion() || target === 0) {
    el.textContent = format(target);
    return;
  }

  const from = Number(String(el.textContent).replace(/[^0-9.]/g, '')) || 0;
  const start = performance.now();
  const ease = (t) => 1 - (1 - t) ** 3;

  const frame = (nowMs) => {
    const progress = Math.min(1, (nowMs - start) / duration);
    el.textContent = format(Math.round(from + (target - from) * ease(progress)));
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Plays a one-shot class animation and cleans up after itself. */
export function pulse(el, className, ms = 800) {
  if (!el || reducedMotion()) return;
  el.classList.remove(className);
  void el.offsetWidth; // restart the animation
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), ms);
}

/** Marks a button busy while an async action runs. */
export async function withLoading(button, action) {
  if (!button) return action();
  const label = button.textContent;
  button.classList.add('loading');
  button.disabled = true;
  try {
    return await action();
  } finally {
    button.classList.remove('loading');
    button.disabled = false;
    button.textContent = label;
  }
}

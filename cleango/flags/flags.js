/**
 * LUMI feature flags (26_ROADMAP_V2.md §"Release roadmap features behind feature
 * flags"). Pure, dependency-free flag registry + evaluation.
 *
 * A flag can be:
 *   - a hard on/off (`enabled`),
 *   - scoped to roles (`roles`),
 *   - a gradual rollout by percentage (`rollout`, 0–100), bucketed by a stable
 *     hash of userId+key so a given user's bucket never flip-flops.
 *
 * Roadmap phases (Phase 1 live; 2–5 gated) map to flags so shipping a vertical
 * is one toggle, not a deploy.
 */
'use strict';

// Deterministic 0–99 bucket for (userId, key) — stable across calls/instances.
function bucket(userId, key) {
  let h = 2166136261;
  const s = String(userId || 'anon') + ':' + key;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100;
}

// Registry. `phase` is documentation of the roadmap stage; evaluation uses the
// other fields. Phase-1 features are enabled; later phases ship dark.
const FLAGS = {
  // Phase 1 — live.
  flashclean:        { phase: 1, enabled: true,  label: 'FlashClean' },
  ai_estimate:       { phase: 1, enabled: true,  label: 'AI-оценка' },
  smart_home:        { phase: 1, enabled: true,  label: 'Умный дом' },
  digital_passport:  { phase: 1, enabled: true,  label: 'Паспорт дома' },
  // Phase 2 — new verticals, dark by default.
  service_plumbing:   { phase: 2, enabled: false, label: 'Сантехника' },
  service_electrical: { phase: 2, enabled: false, label: 'Электрика' },
  service_gardening:  { phase: 2, enabled: false, label: 'Сад' },
  service_handyman:   { phase: 2, enabled: false, label: 'Мастер на час' },
  service_painting:   { phase: 2, enabled: false, label: 'Покраска' },
  // Phase 3 — segments.
  airbnb_automation: { phase: 3, enabled: false, label: 'Airbnb-автоуборка' },
  corporate:         { phase: 3, enabled: false, label: 'Корпоративным клиентам' },
  property_managers: { phase: 3, enabled: false, label: 'Управляющим недвижимостью' },
  // Phase 4 — IoT.
  iot_smart_locks:   { phase: 4, enabled: false, label: 'Умные замки' },
  iot_leak_sensors:  { phase: 4, enabled: false, label: 'Датчики протечек' },
  iot_robot_vacuums: { phase: 4, enabled: false, label: 'Роботы-пылесосы' },
  // Phase 5 — expansion.
  multi_currency:    { phase: 5, enabled: false, label: 'Мультивалютность' },
  // AI roadmap.
  ai_predictive_maintenance: { phase: 4, enabled: false, label: 'Предиктивное обслуживание' },
  ai_voice_assistant:        { phase: 5, enabled: false, label: 'Голосовой ассистент' },
};

function evaluate(flag, user) {
  if (!flag) return false;
  if (flag.enabled === false) return false;
  if (flag.roles && !(user && flag.roles.includes(user.role))) return false;
  if (typeof flag.rollout === 'number') {
    if (flag.rollout >= 100) return true;
    if (flag.rollout <= 0) return false;
    return bucket(user && user.id, flag.__key) < flag.rollout;
  }
  return flag.enabled !== false;
}

// Build the effective on/off map for a given viewer (anonymous → user null).
function flagsFor(user, overrides) {
  const out = {};
  for (const [key, base] of Object.entries(FLAGS)) {
    const flag = { ...base, ...(overrides && overrides[key]), __key: key };
    out[key] = evaluate(flag, user);
  }
  return out;
}
function isEnabled(key, user, overrides) {
  const base = FLAGS[key];
  if (!base) return false;
  return evaluate({ ...base, ...(overrides && overrides[key]), __key: key }, user);
}
// Admin catalogue: definition + current effective default (with overrides applied).
function catalogue(overrides) {
  return Object.entries(FLAGS).map(([key, base]) => {
    const merged = { ...base, ...(overrides && overrides[key]) };
    return { key, label: base.label, phase: base.phase, enabled: merged.enabled !== false, rollout: merged.rollout ?? null, roles: merged.roles || null };
  });
}

module.exports = { FLAGS, flagsFor, isEnabled, catalogue, bucket };

/**
 * LUMI AI layer (10_AI_ARCHITECTURE.md).
 *
 * "AI assists. The backend makes business decisions." This module keeps AI
 * behind a stable interface so providers can be swapped without touching
 * business logic. Every response carries {model, version, confidence, at}, and
 * low-confidence results flag a fallback so callers can use safer defaults.
 *
 *   const ai = createAIProvider();               // heuristic (deterministic) default
 *   const r  = ai.estimateBooking({...});        // → { data, meta }
 *
 * AIProvider interface:
 *   analyzeImages(images)              → photo signals
 *   estimateBooking(input)             → duration / workers / difficulty (advisory)
 *   recommendServices(tasks)           → prioritized service recommendations
 *   answerHomeQuestion(question, tl)   → answer over verified service history
 *   suggestFromText(text)              → concierge bundle from natural language
 *
 * Swap by implementing the same shape (e.g. an LLM-backed provider) and passing
 * it where createAIProvider() is used. Business code never depends on the impl.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROMPT_DIR = path.join(__dirname, 'prompts');
function promptVersion(id) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(PROMPT_DIR, `${id}.v1.json`), 'utf8'));
    return { version: p.version, model: p.model };
  } catch {
    return { version: 'v1', model: 'lumi-heuristic' };
  }
}
// Standard envelope every AI response carries (Guiding Principles §).
function envelope(id, data, confidence) {
  const { version, model } = promptVersion(id);
  const conf = Math.max(0, Math.min(1, confidence));
  return { data, meta: { module: id, model, promptVersion: version, confidence: Math.round(conf * 100) / 100, fallback: conf < 0.55, at: Date.now() } };
}

const clampN = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Number(v) || d));

/** Deterministic, explainable heuristic provider — the safe default. */
function createHeuristicAIProvider() {
  return {
    name: 'heuristic',

    // Photo analysis — signals only; never auto-charges (§ Photo Analysis).
    analyzeImages(images) {
      const list = Array.isArray(images) ? images : [];
      const valid = list.filter((u) => typeof u === 'string' && u.startsWith('data:image/'));
      // Without a real vision model we can only assert low-confidence heuristics.
      const confidence = valid.length ? 0.4 : 0.1;
      return envelope('photo_analysis', {
        imagesSeen: valid.length,
        estimatedArea: null,
        dirtLevel: 'medium',
        clutterLevel: 'medium',
        windowsDetected: false,
        note: 'Heuristic placeholder — swap in a vision model for real signals.',
      }, confidence);
    },

    // Booking signals (advisory) — pricing engine stays authoritative (§ Price Assistance).
    estimateBooking(input) {
      const rooms = clampN(input.rooms, 1, 12, 1);
      const baths = clampN(input.baths, 0, 8, 1);
      const extras = Array.isArray(input.extras) ? input.extras.length : 0;
      const svcMult = { deep: 1.35, moveout: 1.5, office: 1.15, windows: 0.9 }[input.service] || 1;
      const durationMin = Math.round((rooms * 36 + baths * 30 + extras * 18) * svcMult);
      const workers = durationMin > 300 ? 2 : 1;
      const difficulty = Math.min(100, Math.round((rooms * 6 + baths * 5 + extras * 4) * svcMult));
      // Confidence drops for very large / unusual jobs where a heuristic is weaker.
      const confidence = rooms > 8 || durationMin > 480 ? 0.5 : 0.82;
      return envelope('estimate', {
        estimatedDurationMinutes: durationMin,
        estimatedWorkers: workers,
        difficultyScore: difficulty,
      }, confidence);
    },

    // Service recommendations from maintenance freshness (§ Service Recommendations).
    recommendServices(tasks) {
      const due = (tasks || []).filter((t) => t.status && t.status !== 'ok')
        .sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 3);
      const items = due.map((t) => ({
        key: t.key, book: t.book, title: t.label,
        explanation: t.status === 'overdue'
          ? `Просрочено на ${Math.abs(t.daysLeft)} дн. — регулярность держит LUMI Score высоким.`
          : `Нужно через ${t.daysLeft} дн.`,
        confidence: t.status === 'overdue' ? 0.9 : 0.7,
      }));
      const confidence = items.length ? Math.max(...items.map((i) => i.confidence)) : 0.3;
      return envelope('recommend', { items }, confidence);
    },

    // Answer over verified service history — never fabricates (§ Smart Search / AI Safety).
    answerHomeQuestion(question, timeline) {
      const t = String(question || '').toLowerCase();
      const tl = Array.isArray(timeline) ? timeline : [];
      if (!t.trim()) return envelope('home_qa', { answer: 'Задайте вопрос об истории дома.', matches: [] }, 0.2);
      if (/потрат|сколько|стоим|расход/.test(t)) {
        const sum = tl.reduce((s, e) => s + (e.price || 0), 0);
        return envelope('home_qa', { answer: `Всего потрачено ${sum} zł за ${tl.length} услуг(и).`, matches: tl }, 0.85);
      }
      const map = [['окн', 'windows'], ['генеральн', 'deep'], ['обычн', 'standard'], ['стандарт', 'standard'], ['диван', 'deep'], ['матрас', 'deep'], ['переезд', 'moveout'], ['офис', 'office']];
      let svc = null; for (const [k, s] of map) if (t.includes(k)) { svc = s; break; }
      const matches = svc ? tl.filter((e) => e.service === svc) : tl;
      if (!matches.length) {
        return envelope('home_qa', { answer: svc ? 'По этой услуге пока нет записей.' : 'Ничего не найдено в истории.', matches: [] }, svc ? 0.6 : 0.3);
      }
      const last = matches[0];
      return envelope('home_qa', {
        answer: `Последняя запись: ${last.serviceLabel} — ${new Date(last.at).toLocaleDateString('ru-RU')}.`,
        matches: matches.slice(0, 5),
      }, 0.8);
    },
  };
}

let _default = null;
function createAIProvider(impl) {
  if (impl) return impl;                 // dependency inversion — inject any AIProvider
  if (!_default) _default = createHeuristicAIProvider();
  return _default;
}

module.exports = { createAIProvider, createHeuristicAIProvider, envelope };

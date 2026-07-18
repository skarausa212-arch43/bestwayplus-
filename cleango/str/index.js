/**
 * Short-term-rental (STR) domain logic — turnover scheduling between guests.
 *
 * Pure, deterministic and framework-free (CLAUDE.md: business logic lives in a
 * module with tests, server composes it). Handles: default check-in/out times,
 * cleaning-duration estimation, the cleaning window between two stays, time
 * conflicts, turnover generation from a reservation list, duplicate matching
 * for calendar re-imports, and a heuristic calendar text parser with a
 * confidence score (a placeholder for a real OCR/vision provider — the data
 * shape stays the same so the extractor can be swapped later).
 */
'use strict';

const MIN = 60000;
const DAY = 86400000;

const DEFAULTS = {
  defaultCheckoutTime: '11:00',
  defaultCheckinTime: '15:00',
  minimumBufferMinutes: 60,
  expectedCleaningDuration: null,   // null → auto-estimate from the property
  startDelayMinutes: 15,            // grace after checkout before the cleaner starts
  autoCreateCleaning: true,
  autoSendOrder: false,
  autopilotEnabled: false,
  preferredCleanerId: null,
  backupCleanerId: null,
  timezone: 'Europe/Warsaw',
};

const SOURCES = ['airbnb', 'booking', 'vrbo', 'direct', 'manual', 'other'];

// "11:00" → minutes since midnight (safe fallback on bad input).
function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  if (h > 23 || mm > 59) return null;               // strict: invalid time → null
  return h * 60 + mm;
}
const clampInt = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const sameDay = (a, b) => startOfDay(a) === startOfDay(b);

// Estimate a turnover cleaning duration (minutes) from the property size.
function estimateCleaningDuration(p) {
  p = p || {};
  const rooms = clampInt(p.rooms, 1, 12, 2);
  const baths = clampInt(p.baths, 0, 8, 1);
  const beds = clampInt(p.bedrooms != null ? p.bedrooms : Math.max(1, rooms - 1), 0, 12, 1);
  let mins = 60 + rooms * 15 + baths * 25 + beds * 10;
  if (p.area) mins += Math.min(120, Math.round(Number(p.area) * 0.4));
  mins = Math.round(mins / 15) * 15;                 // round to a tidy quarter-hour
  return Math.min(360, Math.max(60, mins));
}

// Validate + clamp raw STR settings, falling back to DEFAULTS.
function normalizeSettings(raw, property) {
  raw = raw || {};
  const validTime = (t, d) => (toMinutes(t) != null ? t : d);
  const dur = raw.expectedCleaningDuration;
  return {
    defaultCheckoutTime: validTime(raw.defaultCheckoutTime, DEFAULTS.defaultCheckoutTime),
    defaultCheckinTime: validTime(raw.defaultCheckinTime, DEFAULTS.defaultCheckinTime),
    minimumBufferMinutes: clampInt(raw.minimumBufferMinutes, 0, 480, DEFAULTS.minimumBufferMinutes),
    expectedCleaningDuration: (dur == null || dur === '') ? null : clampInt(dur, 30, 360, estimateCleaningDuration(property)),
    startDelayMinutes: clampInt(raw.startDelayMinutes, 0, 120, DEFAULTS.startDelayMinutes),
    autoCreateCleaning: raw.autoCreateCleaning !== false,
    autoSendOrder: !!raw.autoSendOrder,
    autopilotEnabled: !!raw.autopilotEnabled,
    preferredCleanerId: raw.preferredCleanerId || null,
    backupCleanerId: raw.backupCleanerId || null,
    timezone: String(raw.timezone || DEFAULTS.timezone).slice(0, 40),
  };
}

// Autopilot mode derived from the two toggles (spec §9): propose | auto_create | autopilot.
function autopilotMode(settings) {
  if (settings.autopilotEnabled) return 'autopilot';
  if (settings.autoCreateCleaning && settings.autoSendOrder) return 'auto_create';
  if (settings.autoCreateCleaning) return 'auto_create';   // created, but sending needs confirmation
  return 'propose';
}

// Combine a calendar date (epoch ms, any time) with an "HH:MM" time-of-day.
function atTime(dateTs, hhmm, fallbackMin) {
  const d = new Date(startOfDay(dateTs));
  const mins = toMinutes(hhmm);
  d.setMinutes((mins == null ? fallbackMin : mins));
  return d.getTime();
}

// Fill missing check-in/out times on a reservation from the property defaults.
function applyDefaultTimes(res, settings) {
  const s = normalizeSettings(settings);
  const checkoutAt = res.checkoutAt != null ? res.checkoutAt : atTime(res.checkoutDate, res.checkoutTime, toMinutes(s.defaultCheckoutTime));
  const checkinAt = res.checkinAt != null ? res.checkinAt : atTime(res.checkinDate, res.checkinTime, toMinutes(s.defaultCheckinTime));
  return { ...res, checkinAt, checkoutAt };
}

// The cleaning window + suggested slot + conflict between a checkout and the
// next check-in (next may be null → open-ended "after checkout" clean).
function computeTurnover(prev, next, settings, property) {
  const s = normalizeSettings(settings, property);
  const duration = s.expectedCleaningDuration != null ? s.expectedCleaningDuration : estimateCleaningDuration(property);
  const availableFrom = prev.checkoutAt;
  const nextCheckin = next ? next.checkinAt : null;
  const suggestedStart = availableFrom + s.startDelayMinutes * MIN;
  const suggestedEnd = suggestedStart + duration * MIN;
  const mustFinishBefore = nextCheckin != null ? nextCheckin - s.minimumBufferMinutes * MIN : null;
  const between = nextCheckin != null && sameDay(availableFrom, nextCheckin);
  const conflict = mustFinishBefore != null && suggestedEnd > mustFinishBefore;
  return {
    availableFrom, mustFinishBefore, nextCheckin,
    suggestedStart, suggestedEnd,
    estimatedDuration: duration,
    kind: between ? 'between_guests' : 'after_checkout',
    priority: between ? 'high' : 'normal',
    conflict,
    // minutes of slack beyond the cleaning (negative = short by that much)
    slackMinutes: mustFinishBefore != null ? Math.round((mustFinishBefore - suggestedEnd) / MIN) : null,
  };
}

// Build the full list of turnovers for a property's reservations (chronological).
function generateTurnovers(reservations, settings, property) {
  const list = reservations
    .filter((r) => r && r.checkoutAt != null && r.status !== 'cancelled')
    .sort((a, b) => a.checkinAt - b.checkinAt);
  return list.map((prev, i) => {
    const next = list[i + 1] || null;
    const t = computeTurnover(prev, next, settings, property);
    return {
      previousReservationId: prev.id,
      nextReservationId: next ? next.id : null,
      ...t,
    };
  });
}

// Duplicate detection for calendar re-imports (spec §21). Returns the matching
// existing reservation or null. Matches on external id, or same source + dates
// (checkin within `toleranceDays`), or overlapping stay regardless of source.
function findDuplicate(existing, cand, toleranceDays) {
  const tol = (toleranceDays == null ? 1 : toleranceDays) * DAY;
  for (const e of existing) {
    if (e.status === 'cancelled') continue;
    if (cand.externalBookingId && e.externalBookingId && cand.externalBookingId === e.externalBookingId) return e;
    const closeIn = Math.abs(e.checkinAt - cand.checkinAt) <= tol;
    const closeOut = Math.abs(e.checkoutAt - cand.checkoutAt) <= tol;
    if (closeIn && closeOut) return e;
    // overlapping ranges (one stay starts before the other ends) — likely the same booking
    if (cand.checkinAt < e.checkoutAt && e.checkinAt < cand.checkoutAt && (closeIn || closeOut)) return e;
  }
  return null;
}

// ── Heuristic calendar parser (AI-import placeholder) ──
const MONTHS = {
  ru: ['январ', 'феврал', 'март', 'апрел', 'мая|май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
  en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
};
function monthIndex(word) {
  const w = word.toLowerCase();
  for (let i = 0; i < 12; i++) {
    if (MONTHS.en[i] && w.startsWith(MONTHS.en[i])) return i;
    const ru = MONTHS.ru[i].split('|');
    if (ru.some((r) => w.startsWith(r))) return i;
  }
  return -1;
}
function detectSource(line) {
  const l = line.toLowerCase();
  if (l.includes('airbnb')) return 'airbnb';
  if (l.includes('booking')) return 'booking';
  if (l.includes('vrbo')) return 'vrbo';
  if (l.includes('direct') || l.includes('прям')) return 'direct';
  return null;
}
// Parse lines like "12–15 августа Airbnb", "Aug 12-15 Booking.com", "2026-08-12 to 2026-08-15".
function parseCalendarText(text, opts) {
  const year = (opts && opts.year) || new Date().getFullYear();
  const out = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let checkin = null, checkout = null, conf = 0, iso = false;
    // ISO range: 2026-08-12 .. 2026-08-15
    let m = /(\d{4})-(\d{2})-(\d{2}).{0,6}(\d{4})-(\d{2})-(\d{2})/.exec(line);
    if (m) {
      checkin = Date.UTC(+m[1], +m[2] - 1, +m[3]);
      checkout = Date.UTC(+m[4], +m[5] - 1, +m[6]);
      conf = 0.97; iso = true;
    }
    if (checkin == null) {
      // "12-15 <month>" or "12–15 августа" or "<month> 12-15"
      const mr = /(\d{1,2})\s*[–—-]\s*(\d{1,2})/.exec(line);
      const monWord = (line.match(/[A-Za-zА-Яа-яЁё]{3,}/g) || []).map((w) => ({ w, i: monthIndex(w) })).find((x) => x.i >= 0);
      if (mr && monWord) {
        const d1 = +mr[1], d2 = +mr[2];
        if (d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31 && d2 > d1) {
          checkin = Date.UTC(year, monWord.i, d1);
          checkout = Date.UTC(year, monWord.i, d2);
          conf = 0.85;
        }
      }
    }
    if (checkin == null || checkout == null || checkout <= checkin) continue;
    const nights = Math.round((checkout - checkin) / DAY);
    const source = detectSource(line);
    if (!source && !iso) conf = Math.max(0.5, conf - 0.15);   // month format + unknown source → lower confidence
    const nameM = /(?:guest|гость|имя)[:\s]+([A-Za-zА-Яа-яЁё][\w .'-]{1,30})/i.exec(line);
    out.push({
      checkin, checkout, nights,
      source: source || 'other',
      sourceDetected: !!source,
      guestName: nameM ? nameM[1].trim() : null,
      confidence: Math.round(conf * 100) / 100,
    });
  }
  return { reservations: out, confidence: out.length ? Math.round((out.reduce((s, r) => s + r.confidence, 0) / out.length) * 100) / 100 : 0 };
}

module.exports = {
  DEFAULTS, SOURCES, MIN, DAY,
  toMinutes, estimateCleaningDuration, normalizeSettings, autopilotMode,
  atTime, applyDefaultTimes, computeTurnover, generateTurnovers, findDuplicate,
  parseCalendarText,
};

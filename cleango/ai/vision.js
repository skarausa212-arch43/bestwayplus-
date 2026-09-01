/**
 * Vision calendar extractor (spec §5/§22 — real OCR of Airbnb/Booking screenshots).
 *
 * Optional and config-driven, exactly like the mailer: with no API key it is a
 * safe no-op and the caller falls back to the deterministic text parser
 * (str.parseCalendarText). With a key it sends the screenshot(s) to an
 * OpenAI-compatible vision endpoint and maps the answer into the SAME reservation
 * shape the text parser produces, so nothing downstream changes.
 *
 * Env (server only — secrets never in git; see deploy/instance.local.env):
 *   LUMI_VISION_API_KEY   provider API key (enables the feature)
 *   LUMI_VISION_URL       chat-completions URL (default OpenAI)
 *   LUMI_VISION_MODEL     model id (default gpt-4o-mini — any vision model works)
 *
 * The network call never throws into the request path: any error resolves null.
 */
'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

const DAY = 86400000;
const SOURCES = ['airbnb', 'booking', 'vrbo', 'direct', 'manual', 'other'];

function config() {
  return {
    key: (process.env.LUMI_VISION_API_KEY || '').trim(),
    url: (process.env.LUMI_VISION_URL || 'https://api.openai.com/v1/chat/completions').trim(),
    model: (process.env.LUMI_VISION_MODEL || 'gpt-4o-mini').trim(),
  };
}
function isEnabled() { return !!config().key; }

function clamp01(n) { n = Number(n); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.9; }
function normSource(s) {
  s = String(s || '').toLowerCase();
  const hit = SOURCES.find((x) => x !== 'other' && s.includes(x));
  if (hit) return hit;
  if (s.includes('прям') || s.includes('direct')) return 'direct';
  return 'other';
}
// Parse a date the model returned into an epoch-ms UTC midnight (ISO or D.M.Y).
function toUTC(v, year) {
  if (v == null) return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/.exec(s);
  if (m) {
    const d = +m[1], mo = +m[2];
    const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : year;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return Date.UTC(y, mo - 1, d);
  }
  return null;
}

// Pure: turn the model's text answer into our reservation shape. Robust to code
// fences and surrounding prose — grabs the first JSON array it can parse.
function parseVisionJSON(raw, opts) {
  const year = (opts && opts.year) || new Date().getFullYear();
  const text = String(raw || '').replace(/```(?:json)?/gi, '').trim();
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  if (a < 0 || b <= a) return { reservations: [], confidence: 0, provider: 'vision' };
  let arr;
  try { arr = JSON.parse(text.slice(a, b + 1)); } catch { return { reservations: [], confidence: 0, provider: 'vision' }; }
  if (!Array.isArray(arr)) return { reservations: [], confidence: 0, provider: 'vision' };
  const out = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const ci = toUTC(it.checkin || it.check_in || it.from || it.start, year);
    const co = toUTC(it.checkout || it.check_out || it.to || it.end, year);
    if (ci == null || co == null || co <= ci) continue;
    const conf = clamp01(it.confidence != null ? it.confidence : 0.9);
    out.push({
      checkin: ci, checkout: co, nights: Math.round((co - ci) / DAY),
      source: it.source ? normSource(it.source) : 'other',
      sourceDetected: !!it.source,
      guestName: (it.guest || it.guestName || it.name || null) || null,
      confidence: Math.round(conf * 100) / 100,
    });
  }
  const confidence = out.length ? Math.round((out.reduce((s, r) => s + r.confidence, 0) / out.length) * 100) / 100 : 0;
  return { reservations: out, confidence, provider: 'vision' };
}

const PROMPT = 'You parse short-term-rental booking calendars. From the screenshot(s), '
  + 'extract every reservation as a JSON array and output ONLY that array (no prose). '
  + 'Each item: {"checkin":"YYYY-MM-DD","checkout":"YYYY-MM-DD",'
  + '"source":"airbnb|booking|vrbo|direct|other","guest":string|null,"confidence":0-1}. '
  + 'Infer the source from logos/colors when visible. If a year is not shown, assume ';

// Send the images to the vision endpoint. Resolves the parsed shape, or null on
// any failure / when not configured (caller then uses the text parser).
function extractCalendar(images, opts) {
  return new Promise((resolve) => {
    const c = config();
    if (!c.key) return resolve(null);
    const imgs = (Array.isArray(images) ? images : []).filter((u) => typeof u === 'string' && u.startsWith('data:image/')).slice(0, 4);
    if (!imgs.length) return resolve(null);
    const year = (opts && opts.year) || new Date().getFullYear();
    let u; try { u = new URL(c.url); } catch { return resolve(null); }
    const body = JSON.stringify({
      model: c.model, temperature: 0, max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: PROMPT + year + '.' }].concat(imgs.map((url) => ({ type: 'image_url', image_url: { url } }))),
      }],
    });
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request({
      hostname: u.hostname, port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search, method: 'POST', timeout: 30000,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key, 'Content-Length': Buffer.byteLength(body) },
    }, (resp) => {
      let data = '';
      resp.on('data', (d) => { data += d; if (data.length > 2_000_000) req.destroy(); });
      resp.on('end', () => {
        try {
          const j = JSON.parse(data);
          const txt = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
          resolve(txt ? parseVisionJSON(txt, { year }) : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}

module.exports = { isEnabled, config, parseVisionJSON, extractCalendar };

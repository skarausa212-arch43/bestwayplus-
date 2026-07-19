/* office-admin — isolated admin service for the Virtual Office.
 * Runs separately from the taxi/trader bridge so it can never take that down.
 * Listens on 127.0.0.1:8790; Caddy proxies office.bestwayplus.pl/oa/* here.
 *
 * Provides: admin auth (password set on first use), agent rename/edit, and
 * REAL task execution through the local Ollama model (qwen2.5:0.5b) that the
 * trader already uses. State is persisted to data/office-admin.json.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 8790;
const HOST = '127.0.0.1';
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'office-admin.json');
const OLLAMA = { host: '127.0.0.1', port: 11434, path: '/api/chat', model: 'qwen2.5:0.5b' };

// canonical team (ids must match the frontend director.js)
const TEAM = [
  { id: 'daniel', name: 'Даниил', role: 'CEO / Руководитель' },
  { id: 'alex', name: 'Алекс', role: 'Разработчик' },
  { id: 'maya', name: 'Майя', role: 'Дизайнер' },
  { id: 'sophie', name: 'София', role: 'Аналитик' },
  { id: 'oliver', name: 'Олег', role: 'Маркетинг' },
  { id: 'lucas', name: 'Лука', role: 'Продажи' },
  { id: 'emma', name: 'Эмма', role: 'Финансы' },
  { id: 'noah', name: 'Ной', role: 'Поддержка' },
  { id: 'gena', name: 'Гена', role: 'GPS-диспетчер' },
];

// ---- state ---------------------------------------------------------------
let state = { salt: null, passHash: null, agents: {}, tasks: [] };
function load() {
  try { state = Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); }
  catch (e) { /* fresh */ }
}
let saving = false, saveAgain = false;
function save() {
  if (saving) { saveAgain = true; return; }
  saving = true;
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
  fs.writeFile(STATE_FILE + '.tmp', JSON.stringify(state), err => {
    if (!err) { try { fs.renameSync(STATE_FILE + '.tmp', STATE_FILE); } catch (e) {} }
    saving = false; if (saveAgain) { saveAgain = false; save(); }
  });
}

// ---- auth ----------------------------------------------------------------
function hash(pw, salt) { return crypto.createHash('sha256').update(salt + '|' + pw).digest('hex'); }
function isConfigured() { return !!state.passHash; }
function checkPass(pw) {
  if (!state.passHash || !pw) return false;
  const h = hash(String(pw), state.salt);
  const a = Buffer.from(h), b = Buffer.from(state.passHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- agents --------------------------------------------------------------
function mergedAgents() {
  const out = {};
  for (const t of TEAM) { const o = state.agents[t.id] || {}; out[t.id] = { id: t.id, name: o.name || t.name, role: o.role || t.role, defaultName: t.name, defaultRole: t.role }; }
  return out;
}

// ---- Ollama task queue (sequential — tight RAM) --------------------------
const queue = [];
let running = false;
function enqueue(task) { queue.push(task); pump(); }
function pump() {
  if (running || !queue.length) return;
  running = true;
  const task = queue.shift();
  const ag = mergedAgents()[task.agentId] || { name: 'Сотрудник', role: '' };
  const sys = `Ты ${ag.name}, ${ag.role} в компании BestWayPlus (сервис заказа такси, трансферов и аренды авто). ` +
    `Ты часть команды виртуального офиса. Отвечай на русском языке, кратко, структурно и по делу, как профессионал своей роли. ` +
    `Если уместно — дай конкретные шаги или пример. Не выдумывай факты о компании, которых не знаешь.`;
  const payload = JSON.stringify({
    model: OLLAMA.model, stream: false,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: task.prompt }],
    options: { temperature: 0.6, num_predict: 400 },
  });
  const req = http.request({ hostname: OLLAMA.host, port: OLLAMA.port, path: OLLAMA.path, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
    let data = ''; res.on('data', c => data += c);
    res.on('end', () => {
      try { const j = JSON.parse(data); task.result = (j.message && j.message.content || '').trim() || '(пустой ответ модели)'; task.status = 'done'; }
      catch (e) { task.status = 'error'; task.result = 'Не удалось разобрать ответ модели.'; }
      task.finishedAt = Date.now(); save(); running = false; setTimeout(pump, 50);
    });
  });
  req.setTimeout(180000, () => { req.destroy(); });
  req.on('error', () => { task.status = 'error'; task.result = 'Локальная модель недоступна (Ollama).'; task.finishedAt = Date.now(); save(); running = false; setTimeout(pump, 50); });
  req.write(payload); req.end();
}

// ---- http helpers --------------------------------------------------------
function sendJson(res, code, obj) { const s = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(s); }
function readBody(req) { return new Promise(resolve => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { resolve({}); } }); }); }
function publicTasks() { return state.tasks.slice(-40).map(t => ({ id: t.id, agentId: t.agentId, agentName: t.agentName, status: t.status, createdAt: t.createdAt })); }
function fullTasks() { return state.tasks.slice(-40).map(t => ({ id: t.id, agentId: t.agentId, agentName: t.agentName, prompt: t.prompt, result: t.result || '', status: t.status, createdAt: t.createdAt })); }

// ---- server --------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = (req.url || '').replace(/^\/oa/, '') || '/';
  try {
    if (req.method === 'GET' && (url === '/state' || url === '/' )) {
      return sendJson(res, 200, { configured: isConfigured(), agents: mergedAgents(), tasks: publicTasks() });
    }
    if (req.method === 'POST' && url === '/setup') {
      const b = await readBody(req);
      if (isConfigured()) return sendJson(res, 409, { error: 'Пароль уже задан' });
      const pw = String(b.password || '');
      if (pw.length < 4) return sendJson(res, 400, { error: 'Минимум 4 символа' });
      state.salt = crypto.randomBytes(12).toString('hex'); state.passHash = hash(pw, state.salt); save();
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url === '/login') {
      const b = await readBody(req);
      return checkPass(b.password) ? sendJson(res, 200, { ok: true }) : sendJson(res, 401, { error: 'Неверный пароль' });
    }
    // everything below requires auth
    if (req.method === 'POST' && ['/agent', '/task', '/tasks', '/agent/reset', '/task/clear'].includes(url)) {
      const b = await readBody(req);
      if (!checkPass(b.password)) return sendJson(res, 401, { error: 'Неверный пароль' });

      if (url === '/tasks') return sendJson(res, 200, { tasks: fullTasks() });

      if (url === '/agent') {
        const id = String(b.id || ''); if (!TEAM.find(t => t.id === id)) return sendJson(res, 400, { error: 'Нет такого сотрудника' });
        const cur = state.agents[id] || {};
        if (b.name != null) cur.name = String(b.name).slice(0, 40).trim() || undefined;
        if (b.role != null) cur.role = String(b.role).slice(0, 60).trim() || undefined;
        state.agents[id] = cur; save();
        return sendJson(res, 200, { ok: true, agents: mergedAgents() });
      }
      if (url === '/agent/reset') { state.agents = {}; save(); return sendJson(res, 200, { ok: true, agents: mergedAgents() }); }
      if (url === '/task/clear') { state.tasks = []; save(); return sendJson(res, 200, { ok: true }); }

      if (url === '/task') {
        const agentId = String(b.agentId || ''); const prompt = String(b.prompt || '').slice(0, 4000).trim();
        if (!TEAM.find(t => t.id === agentId)) return sendJson(res, 400, { error: 'Нет такого сотрудника' });
        if (!prompt) return sendJson(res, 400, { error: 'Пустое задание' });
        const ag = mergedAgents()[agentId];
        const task = { id: 't' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), agentId, agentName: ag.name, prompt, result: '', status: 'running', createdAt: Date.now() };
        state.tasks.push(task); if (state.tasks.length > 100) state.tasks = state.tasks.slice(-100);
        save(); enqueue(task);
        return sendJson(res, 200, { ok: true, taskId: task.id });
      }
    }
    sendJson(res, 404, { error: 'not found' });
  } catch (e) { sendJson(res, 500, { error: 'server error' }); }
});

load();
server.listen(PORT, HOST, () => console.log(`office-admin запущен на http://${HOST}:${PORT}/oa/state (ollama=${OLLAMA.model})`));

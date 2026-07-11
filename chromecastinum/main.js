// Chromecastinum — главный процесс Electron.
//
// Гарантии приватности:
//  1. Все вкладки живут в partition "throwaway" БЕЗ префикса "persist:" —
//     в Electron это означает чисто in-memory сессию: куки, localStorage,
//     IndexedDB и кэш существуют только в оперативной памяти.
//  2. HTTP-кэш на диск отключён флагом Chromium.
//  3. Служебный профиль Electron (userData) уносится во временную папку,
//     которая удаляется при выходе; устаревшие папки от прошлых запусков
//     подчищаются при старте (на случай аварийного завершения).
//  4. При выходе дополнительно вызывается clearStorageData() по всей сессии.

const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const zipcodes = require('zipcodes'); // офлайн-база ZIP → город/координаты США
const tzlookup = require('tz-lookup'); // офлайн: координаты → IANA часовой пояс

const PROFILE_PREFIX = 'chromecastinum-';
const PARTITION = 'throwaway'; // без "persist:" => только в памяти

// Подчистить временные профили, оставшиеся после аварийных завершений.
try {
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (name.startsWith(PROFILE_PREFIX)) {
      fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
    }
  }
} catch {}

// Служебные файлы Electron — во временную одноразовую папку, не в AppData.
const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), PROFILE_PREFIX));
app.setPath('userData', tmpProfile);

// Никакого дискового HTTP-кэша.
app.commandLine.appendSwitch('disable-http-cache');
// Не выдавать себя за автоматизацию (убирает признаки WebDriver у Blink).
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// ---- Маскировка под обычный Chrome на Windows ----
// Электроновский User-Agent содержит слова "Electron" и имя приложения — по ним
// антибот-системы (Akamai/Cloudflare и т.п.) мгновенно опознают и блокируют браузер.
// Подставляем строку ровно как у настоящего Chrome на Windows, с реальной версией
// движка, плюс приводим в порядок Client Hints (sec-ch-ua) и navigator.userAgentData.
const CHROME_VERSION = process.versions.chrome;           // напр. "126.0.6478.127"
const CHROME_MAJOR = CHROME_VERSION.split('.')[0];        // напр. "126"
const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
  `(KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;

const UA_METADATA = {
  brands: [
    { brand: 'Chromium', version: CHROME_MAJOR },
    { brand: 'Google Chrome', version: CHROME_MAJOR },
    { brand: 'Not.A/Brand', version: '24' }
  ],
  fullVersionList: [
    { brand: 'Chromium', version: CHROME_VERSION },
    { brand: 'Google Chrome', version: CHROME_VERSION },
    { brand: 'Not.A/Brand', version: '24.0.0.0' }
  ],
  fullVersion: CHROME_VERSION,
  platform: 'Windows',
  platformVersion: '15.0.0',
  architecture: 'x86',
  bitness: '64',
  model: '',
  mobile: false,
  wow64: false
};

// Значение sec-ch-ua без упоминания Electron.
const SEC_CH_UA =
  `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not.A/Brand";v="24"`;

// Скрипт, выполняемый ДО кода страницы: убирает признаки Electron/автоматизации
// и дорисовывает отпечаток до обычного Chrome (плагины, WebGL, chrome.runtime и т.п.).
const STEALTH_JS = `
(() => {
  const def = (o, p, v) => { try { Object.defineProperty(o, p, { get: () => v }); } catch (e) {} };

  // Признак автоматизации.
  def(navigator, 'webdriver', undefined);

  // Языки — как у пользователя из США (согласуется с US-геолокацией).
  def(navigator, 'languages', ['en-US', 'en']);

  // Объект window.chrome, как у настоящего Chrome.
  try {
    window.chrome = window.chrome || {};
    if (!window.chrome.runtime) window.chrome.runtime = {};
  } catch (e) {}

  // Набор PDF-плагинов, как в Chrome (у «пустого» Electron их нет).
  try {
    const data = [
      ['PDF Viewer', 'internal-pdf-viewer'],
      ['Chrome PDF Viewer', 'internal-pdf-viewer'],
      ['Chromium PDF Viewer', 'internal-pdf-viewer'],
      ['Microsoft Edge PDF Viewer', 'internal-pdf-viewer'],
      ['WebKit built-in PDF', 'internal-pdf-viewer']
    ];
    const arr = data.map(([name, filename]) => ({
      name, filename, description: 'Portable Document Format', length: 1
    }));
    def(navigator, 'plugins', arr);
    def(navigator, 'mimeTypes', [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }
    ]);
  } catch (e) {}

  // Согласованный ответ на запрос разрешения уведомлений.
  try {
    const q = navigator.permissions && navigator.permissions.query;
    if (q) {
      navigator.permissions.query = (p) =>
        (p && p.name === 'notifications')
          ? Promise.resolve({ state: (typeof Notification !== 'undefined' ? Notification.permission : 'prompt') })
          : q.call(navigator.permissions, p);
    }
  } catch (e) {}

  // WebGL: типичный производитель/видеокарта вместо «пустого» значения.
  try {
    const patch = (proto) => {
      if (!proto) return;
      const orig = proto.getParameter;
      proto.getParameter = function (p) {
        if (p === 37445) return 'Google Inc. (Intel)';
        if (p === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)';
        return orig.call(this, p);
      };
    };
    patch(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
    patch(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  } catch (e) {}
})();
`;

app.userAgentFallback = USER_AGENT;

let mainWin = null;

// Текущая подмена местоположения и времени, которую видят сайты.
// null-поля => не подменяем (реальное значение системы).
const overrides = { latitude: null, longitude: null, timezone: null };

// webContents всех вкладок — чтобы применять подмену к каждой.
const guests = new Set();

function browserSession() {
  return session.fromPartition(PARTITION);
}

// ---- Прокси-профили ----------------------------------------------------
// Список профилей и активный профиль. Хранятся в постоянном конфиге
// (не в одноразовом профиле браузера) — это настройка, а не данные слежки,
// поэтому переживает перезапуск. Активным может быть один профиль:
// Chromium задаёт прокси на всю сессию.
let proxyState = { profiles: [], activeId: null };
let PROXY_STORE = null; // путь вычисляется после app.whenReady

function loadProxies() {
  try {
    const data = JSON.parse(fs.readFileSync(PROXY_STORE, 'utf8'));
    if (data && Array.isArray(data.profiles)) {
      proxyState = { profiles: data.profiles, activeId: data.activeId || null };
    }
  } catch {}
}

function saveProxies() {
  try {
    fs.mkdirSync(path.dirname(PROXY_STORE), { recursive: true });
    fs.writeFileSync(PROXY_STORE, JSON.stringify(proxyState, null, 2));
  } catch {}
}

function activeProxy() {
  return proxyState.profiles.find(p => p.id === proxyState.activeId) || null;
}

// Что отдавать в интерфейс — без паролей.
function publicProxyState() {
  return {
    activeId: proxyState.activeId,
    profiles: proxyState.profiles.map(p => ({
      id: p.id, name: p.name, scheme: p.scheme,
      host: p.host, port: p.port,
      hasAuth: !!p.username
    }))
  };
}

async function applyProxy() {
  const ses = browserSession();
  const p = activeProxy();
  if (!p) {
    // Режим "system" — уважать системные настройки прокси/VPN, а не рвать их.
    // (mode:'direct' обходил бы системный VPN, и браузер светил бы реальный IP.)
    await ses.setProxy({ mode: 'system' });
  } else {
    const scheme = p.scheme === 'socks5' ? 'socks5'
                 : p.scheme === 'socks4' ? 'socks4' : 'http';
    await ses.setProxy({ proxyRules: `${scheme}://${p.host}:${p.port}` });
  }
  // Сбросить закешированные соединения/авторизацию через старый прокси.
  try { await ses.closeAllConnections(); } catch {}
  try { await ses.clearAuthCache(); } catch {}
}

// Применить текущую подмену к одной вкладке через протокол Chrome DevTools.
async function applyOverrides(contents) {
  if (!contents || contents.isDestroyed()) return;
  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
  } catch {
    return; // debugger уже занят кем-то другим — пропускаем
  }
  const dbg = contents.debugger;

  // Часовой пояс: пустая строка = вернуть системный.
  try {
    await dbg.sendCommand('Emulation.setTimezoneOverride', {
      timezoneId: overrides.timezone || ''
    });
  } catch {}

  // Геолокация.
  try {
    if (overrides.latitude != null && overrides.longitude != null) {
      await dbg.sendCommand('Emulation.setGeolocationOverride', {
        latitude: overrides.latitude,
        longitude: overrides.longitude,
        accuracy: 20
      });
    } else {
      await dbg.sendCommand('Emulation.clearGeolocationOverride');
    }
  } catch {}
}

function applyToAllGuests() {
  for (const c of guests) applyOverrides(c);
}

// Замаскировать вкладку под обычный Chrome: подменить User-Agent/Client Hints
// на уровне движка и спрятать navigator.webdriver ещё до загрузки страницы.
async function applyStealth(contents) {
  if (!contents || contents.isDestroyed()) return;
  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
  } catch {
    return;
  }
  const dbg = contents.debugger;
  try { await dbg.sendCommand('Page.enable'); } catch {}
  try {
    await dbg.sendCommand('Network.setUserAgentOverride', {
      userAgent: USER_AGENT,
      userAgentMetadata: UA_METADATA
    });
  } catch {}
  try {
    await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: STEALTH_JS });
  } catch {}
}

// Пускать геолокацию к сайту только когда координаты подменены —
// тогда сайт получает выдуманную точку, а не реальную.
function permissionHandler(_wc, permission, callback) {
  if (permission === 'geolocation') {
    return callback(overrides.latitude != null && overrides.longitude != null);
  }
  return callback(false);
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: '#1b1e24',
    title: 'Chromecastinum',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWin.setMenuBarVisibility(false);
  mainWin.loadFile(path.join(__dirname, 'ui', 'index.html'));
  mainWin.on('closed', () => { mainWin = null; });
}

app.whenReady().then(() => {
  const ses = browserSession();

  // Подпись браузера — как у обычного Chrome на Windows (без "Electron").
  ses.setUserAgent(USER_AGENT);

  // Чистим Client Hints во всех исходящих запросах: убираем бренд "Electron",
  // приводим sec-ch-ua к виду настоящего Chrome.
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const h = details.requestHeaders;
    h['User-Agent'] = USER_AGENT;
    if ('sec-ch-ua' in h) h['sec-ch-ua'] = SEC_CH_UA;
    if ('Sec-CH-UA' in h) h['Sec-CH-UA'] = SEC_CH_UA;
    // Язык — как у пользователя из США (согласуется с navigator.languages).
    h['Accept-Language'] = 'en-US,en;q=0.9';
    callback({ requestHeaders: h });
  });

  // Уведомления, камера и т.п. запрещены; геолокация — только если задана подмена.
  ses.setPermissionRequestHandler(permissionHandler);

  // Загрузить сохранённые прокси-профили и применить активный.
  PROXY_STORE = path.join(app.getPath('appData'), 'Chromecastinum', 'proxies.json');
  loadProxies();
  applyProxy();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Ссылки target="_blank" и window.open открываем новой вкладкой, а не новым окном.
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;

  contents.setWindowOpenHandler(({ url }) => {
    if (mainWin && (url.startsWith('https://') || url.startsWith('http://'))) {
      mainWin.webContents.send('open-in-new-tab', url);
    }
    return { action: 'deny' };
  });

  guests.add(contents);
  contents.on('destroyed', () => guests.delete(contents));

  // Не давать WebRTC светить реальный IP в обход VPN/прокси.
  try { contents.setWebRTCIPHandlingPolicy('default_public_interface_only'); } catch {}

  // Сразу маскируем вкладку под обычный Chrome (до первой загрузки страницы)
  // и применяем подмену местоположения/времени, если она задана.
  applyStealth(contents).then(() => applyOverrides(contents));
});

// Ввод ZIP-кода США: определяем координаты и часовой пояс и применяем их.
ipcMain.handle('apply-zip', (_e, rawZip) => {
  const zip = String(rawZip || '').trim().slice(0, 5);
  if (!/^\d{5}$/.test(zip)) {
    return { ok: false, error: 'Введите 5-значный ZIP-код США' };
  }
  const rec = zipcodes.lookup(zip);
  if (!rec || rec.country !== 'US') {
    return { ok: false, error: 'ZIP-код не найден в базе США' };
  }

  let timezone;
  try {
    timezone = tzlookup(rec.latitude, rec.longitude);
  } catch {
    return { ok: false, error: 'Не удалось определить часовой пояс' };
  }

  overrides.latitude = rec.latitude;
  overrides.longitude = rec.longitude;
  overrides.timezone = timezone;
  applyToAllGuests();

  return {
    ok: true,
    zip,
    city: rec.city,
    state: rec.state,
    latitude: rec.latitude,
    longitude: rec.longitude,
    timezone
  };
});

// ---- Прокси: обработчики из интерфейса ----
ipcMain.handle('proxy-list', () => publicProxyState());

ipcMain.handle('proxy-add', async (_e, prof) => {
  const name = String(prof.name || '').trim();
  const host = String(prof.host || '').trim();
  const port = parseInt(prof.port, 10);
  const scheme = ['http', 'socks5', 'socks4'].includes(prof.scheme) ? prof.scheme : 'http';
  if (!host) return { ok: false, error: 'Укажите адрес (хост) прокси' };
  if (!(port >= 1 && port <= 65535)) return { ok: false, error: 'Порт должен быть от 1 до 65535' };

  const profile = {
    id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name || `${host}:${port}`,
    scheme, host, port,
    username: String(prof.username || '').trim(),
    password: String(prof.password || '')
  };
  proxyState.profiles.push(profile);
  saveProxies();
  return { ok: true, state: publicProxyState() };
});

ipcMain.handle('proxy-delete', async (_e, id) => {
  proxyState.profiles = proxyState.profiles.filter(p => p.id !== id);
  if (proxyState.activeId === id) {
    proxyState.activeId = null;
    await applyProxy();
  }
  saveProxies();
  return { ok: true, state: publicProxyState() };
});

// Выбрать активный профиль (id = null → без прокси).
ipcMain.handle('proxy-select', async (_e, id) => {
  proxyState.activeId = id || null;
  if (id && !proxyState.profiles.some(p => p.id === id)) {
    proxyState.activeId = null;
  }
  await applyProxy();
  saveProxies();
  return { ok: true, state: publicProxyState() };
});

// Сброс подмены — вернуть реальные данные системы.
ipcMain.handle('clear-overrides', () => {
  overrides.latitude = null;
  overrides.longitude = null;
  overrides.timezone = null;
  applyToAllGuests();
  return { ok: true };
});

// Кнопка "стереть всё сейчас" — чистим куки/хранилища/кэш прямо во время работы.
ipcMain.handle('wipe-session', async () => {
  const ses = browserSession();
  await ses.clearStorageData();
  await ses.clearCache();
  await ses.clearAuthCache();
  return true;
});

// Автоматическая авторизация на прокси (логин/пароль из активного профиля).
// Для обычных сайтов НЕ отвечаем — там сработает штатное окно ввода.
app.on('login', (event, _webContents, _details, authInfo, callback) => {
  if (!authInfo.isProxy) return;
  const p = activeProxy();
  if (p && p.username) {
    event.preventDefault();
    callback(p.username, p.password || '');
  }
});

app.on('window-all-closed', () => app.quit());

app.on('will-quit', async (event) => {
  event.preventDefault();
  try { await browserSession().clearStorageData(); } catch {}
  app.exit(0);
});

app.on('quit', () => {
  // На Windows часть файлов может быть ещё заблокирована — тогда их
  // удалит зачистка при следующем запуске (см. блок в начале файла).
  try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch {}
});

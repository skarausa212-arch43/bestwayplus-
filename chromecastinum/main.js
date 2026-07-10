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

// Скрипт, выполняемый до кода страницы: прячет navigator.webdriver.
const STEALTH_JS =
  "try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined});}catch(e){}";

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
    callback({ requestHeaders: h });
  });

  // Уведомления, камера и т.п. запрещены; геолокация — только если задана подмена.
  ses.setPermissionRequestHandler(permissionHandler);

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

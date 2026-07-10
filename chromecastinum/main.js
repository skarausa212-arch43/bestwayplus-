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
  // Применяем подмену, как только у вкладки появится страница.
  contents.once('dom-ready', () => applyOverrides(contents));
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

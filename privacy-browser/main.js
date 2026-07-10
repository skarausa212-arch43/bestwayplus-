// Privacy Browser — главный процесс Electron.
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

const PROFILE_PREFIX = 'privacy-browser-';
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

function browserSession() {
  return session.fromPartition(PARTITION);
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: '#1b1e24',
    title: 'Privacy Browser',
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

  // Сайтам по умолчанию запрещены геолокация, уведомления, камера и т.п.
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Ссылки target="_blank" и window.open открываем новой вкладкой, а не новым окном.
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (mainWin && (url.startsWith('https://') || url.startsWith('http://'))) {
        mainWin.webContents.send('open-in-new-tab', url);
      }
      return { action: 'deny' };
    });
  }
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

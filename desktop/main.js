// The One MSP Phone - Electron desktop app (#230). Loads the same React Native UI as the phones, exported for the web
// (`npm run export:web` in the parent folder -> ../dist, copied into the installer as dist/). Calls use Chromium's
// WebRTC through the same JsSIP engine. ONE allows the app://phone origin for /api/softphone (backend app.ts CORS).
// 3 Nov 2026: one instance only, incoming calls bring the window forward + flash the taskbar (preload.js bridge),
// closing the window keeps the phone running in the tray so calls still ring, installer via electron-builder.
// Still to do: Microsoft sign-in (theonemspphone:// protocol), keychain via safeStorage, auto-update, code signing.
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, protocol, net, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = [path.join(__dirname, 'dist'), path.resolve(__dirname, '..', 'dist')].find((p) => fs.existsSync(path.join(p, 'index.html')))
  || path.resolve(__dirname, '..', 'dist');
const DEV_URL = process.env.ONEMSP_PHONE_DEV_URL; // e.g. http://localhost:8081 while `npx expo start --web` runs

// Expo's web export uses absolute paths (/_expo/...), which break under file:// - serve it from app://phone/ instead.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

let win = null;
let tray = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 420, height: 780, minWidth: 360, title: 'The One MSP Phone',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  win.removeMenu();
  win.loadURL(DEV_URL || 'app://phone/index.html');
  // Closing the window hides it to the tray - the phone keeps ringing. Quit from the tray menu.
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
}

function createTray() {
  const icon = [path.join(__dirname, 'icon.png'), path.resolve(__dirname, '..', 'assets', 'icon.png')].find((p) => fs.existsSync(p));
  tray = new Tray(icon ? nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }) : nativeImage.createEmpty());
  tray.setToolTip('The One MSP Phone');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Quit (calls stop ringing here)', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => showWindow());
}

// Renderer -> main: an incoming call started / stopped ringing.
ipcMain.on('phone:ringing', (_e, on, title) => {
  if (!win) return;
  if (on) {
    showWindow();
    win.flashFrame(true);
    if (title) win.setTitle(`Incoming call - ${String(title).slice(0, 80)}`);
  } else {
    win.flashFrame(false);
    win.setTitle('The One MSP Phone');
  }
});

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(DIST, rel);
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // Microphone + notifications only - nothing else the page asks for.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media' || permission === 'notifications'));
  createWindow();
  createTray();
  app.on('activate', () => showWindow());
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && quitting) app.quit(); });

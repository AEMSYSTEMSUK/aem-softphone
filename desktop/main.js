// The One MSP Phone - Electron desktop app (#230). Loads the same React Native UI as the phones, exported for the web
// (`npm run export:web` in the parent folder -> ../dist, copied into the installer as dist/). Calls use Chromium's
// WebRTC through the same JsSIP engine. ONE allows the app://phone origin for /api/softphone (backend app.ts CORS).
// 3 Nov 2026: one instance only, incoming calls bring the window forward + flash the taskbar (preload.js bridge),
// closing the window keeps the phone running in the tray so calls still ring, installer via electron-builder.
// 6 Nov 2026: dial from anywhere. tel: / callto: links and a global hotkey on selected text (dial.js) hand a number to the
// page, which sends it to the desk phone or asks first on this computer (src/components/DialHost.tsx). The hotkey is
// Windows only for now: macOS needs its own way to press Copy and the Accessibility permission.
// 11 Nov 2026 (0.3.3): Microsoft sign-in in a window of its own (microsoftSignIn below).
// Still to do: keychain via safeStorage, auto-update.
const { app, BrowserWindow, Menu, Tray, clipboard, globalShortcut, ipcMain, nativeImage, protocol, net, session, shell } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DEFAULT_HOTKEY, captureSelection, checkHotkey, copyCommand, dialRequestFromArgv } = require('./dial.js');

const DIST = [path.join(__dirname, 'dist'), path.resolve(__dirname, '..', 'dist')].find((p) => fs.existsSync(path.join(p, 'index.html')))
  || path.resolve(__dirname, '..', 'dist');
const DEV_URL = process.env.ONEMSP_PHONE_DEV_URL; // e.g. http://localhost:8081 while `npx expo start --web` runs

// Expo's web export uses absolute paths (/_expo/...), which break under file:// - serve it from app://phone/ instead.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

let win = null;
let tray = null;
let quitting = false;
let dialReady = false;   // the page is signed in and listening
let pendingDial = null;  // the latest number waiting for it
let capturing = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv) => {
  const req = dialRequestFromArgv(argv);
  if (req) deliverDial(req); else showWindow();
});
app.on('open-url', (e, url) => { e.preventDefault(); const req = dialRequestFromArgv([url]); if (req) deliverDial(req); }); // macOS

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// Comes to the front without taking the keyboard: the person may be mid-sentence in another app, and a desk phone call
// needs nothing more from them here. The page asks for focus itself when it has a question.
function bringUpQuietly() {
  if (!win) createWindow();
  if (win.isMinimized() || !win.isVisible()) win.showInactive();
  win.moveTop();
}

function deliverDial(req) {
  pendingDial = req;
  if (app.isReady()) { bringUpQuietly(); flushDial(); }
}

function flushDial() {
  if (!win || !dialReady || !pendingDial) return;
  win.webContents.send('phone:dial-request', pendingDial);
  pendingDial = null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 420, height: 780, minWidth: 360, title: 'The One MSP Phone',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  win.removeMenu();
  win.loadURL(DEV_URL || 'app://phone/index.html');
  win.webContents.on('will-navigate', (e, url) => { if (!fromOurPage(url)) e.preventDefault(); }); // the bridge is for our page only
  win.webContents.on('did-start-loading', () => { dialReady = false; });
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

const fromOurPage = (url) => String(url || '').startsWith(DEV_URL || 'app://phone/');
const trusted = (e) => fromOurPage(e.senderFrame?.url);

// ---------- hotkey: dial the selected text in any app ----------
const hotkeySupported = process.platform === 'win32';
const settingsFile = () => path.join(app.getPath('userData'), 'dial-settings.json');
let hotkey = DEFAULT_HOTKEY;
let hotkeyOn = false;

function readHotkey() {
  try {
    const c = checkHotkey(JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).hotkey);
    if (c.ok) return c.value;
  } catch { /* first run */ }
  return DEFAULT_HOTKEY;
}

const hotkeyStatus = (error = null) => ({ supported: hotkeySupported, accelerator: hotkey, registered: hotkeyOn, error });

function sendCopy() {
  const c = copyCommand(process.env.SystemRoot);
  return new Promise((done, failed) => execFile(c.file, c.args, { windowsHide: true, timeout: 5000 }, (err) => (err ? failed(err) : done())));
}

async function dialSelection() {
  if (capturing) return;
  capturing = true;
  try {
    deliverDial(await captureSelection({ clipboard, sendCopy, sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)) }));
  } catch (e) {
    console.warn('hotkey copy failed', e?.message);
    deliverDial({ source: 'hotkey', error: 'copy_failed' });
  } finally { capturing = false; }
}

function registerHotkey(accelerator) {
  try { return globalShortcut.register(accelerator, dialSelection); } catch { return false; }
}

function changeHotkey(value) {
  const c = checkHotkey(value);
  if (!c.ok) return hotkeyStatus(c.error);
  if (c.value === hotkey && hotkeyOn) return hotkeyStatus();
  if (hotkeyOn) globalShortcut.unregister(hotkey);
  if (!registerHotkey(c.value)) {
    hotkeyOn = registerHotkey(hotkey); // back to the one that worked
    return hotkeyStatus(`${c.value} is already in use by another app. Choose a different shortcut.`);
  }
  hotkey = c.value;
  hotkeyOn = true;
  try { fs.writeFileSync(settingsFile(), JSON.stringify({ hotkey })); } catch (e) { console.warn('could not save the shortcut', e?.message); }
  return hotkeyStatus();
}

ipcMain.handle('phone:hotkey-get', (e) => (trusted(e) ? hotkeyStatus() : null));
ipcMain.handle('phone:hotkey-set', (e, value) => {
  if (!trusted(e)) return null;
  return hotkeySupported ? changeHotkey(value) : hotkeyStatus();
});
ipcMain.on('phone:dial-ready', (e, on) => { if (trusted(e)) { dialReady = on === true; flushDial(); } });
ipcMain.on('phone:bring-forward', (e) => { if (trusted(e)) showWindow(); });
ipcMain.on('phone:open-default-apps', (e) => { if (trusted(e) && process.platform === 'win32') shell.openExternal('ms-settings:defaultapps'); });

// ---------- Microsoft sign-in (11 Nov 2026) ----------
// ONE's /api/softphone/auth/microsoft -> Microsoft -> ONE's callback, which 302s to theonemspphone://sso?code=... (or
// ?error=...). Instead of registering that protocol with Windows, the sign-in runs in a small window of our own and we
// catch the redirect to theonemspphone:// before it goes anywhere. The window gets its own throwaway session, no preload
// and no Node, and only ONE's own start URL is accepted from the page.
const SSO_RETURN = 'theonemspphone://sso';
const SSO_START = /^https:\/\/[a-z0-9.-]+(:\d+)?\/api\/softphone\/auth\/microsoft$/i;
let ssoWin = null;

function microsoftSignIn(startUrl) {
  if (!SSO_START.test(String(startUrl || ''))) return Promise.resolve({ error: 'bad_start' });
  if (ssoWin) { ssoWin.focus(); return Promise.resolve({ error: 'busy' }); }
  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => { if (done) return; done = true; resolve(result); if (ssoWin && !ssoWin.isDestroyed()) ssoWin.destroy(); ssoWin = null; };
    ssoWin = new BrowserWindow({
      width: 520, height: 700, parent: win || undefined, modal: !!win, title: 'Sign in with Microsoft', autoHideMenuBar: true,
      webPreferences: { partition: 'ms-signin', contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    ssoWin.removeMenu();
    const watch = (e, url) => {
      if (!String(url).startsWith(SSO_RETURN)) return;
      e.preventDefault();
      const q = new URL(String(url).replace('theonemspphone://', 'https://app/')).searchParams;
      finish({ code: q.get('code') || null, error: q.get('error') || null });
    };
    ssoWin.webContents.on('will-redirect', watch);
    ssoWin.webContents.on('will-navigate', watch);
    ssoWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    ssoWin.on('closed', () => { ssoWin = null; finish({ error: 'cancelled' }); });
    ssoWin.loadURL(startUrl).catch(() => { /* a redirect we stopped shows as an aborted load - finish() already ran */ });
  });
}

ipcMain.handle('phone:microsoft-signin', (e, startUrl) => (trusted(e) ? microsoftSignIn(startUrl) : { error: 'untrusted' }));

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
  // Only the installed app: a dev run would point these links at electron.exe. Windows still leaves the final choice to the
  // person (Settings > Dial from anywhere); desktop/build/installer.nsh lists the app there.
  if (app.isPackaged) for (const scheme of ['tel', 'callto']) app.setAsDefaultProtocolClient(scheme);
  if (hotkeySupported) { hotkey = readHotkey(); hotkeyOn = registerHotkey(hotkey); }
  const req = dialRequestFromArgv(process.argv); // first launch, from a link
  if (req) deliverDial(req);
  else if (pendingDial) deliverDial(pendingDial);
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && quitting) app.quit(); });

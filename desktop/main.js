// The One MSP Phone - Electron desktop shell (STUB, milestone 1). Loads the same React Native UI as the phones, exported for the
// web (`npm run export:web` in the parent folder -> ../dist). Calls use Chromium's WebRTC through the same JsSIP engine.
// Milestone 2+: tray icon + DND toggle, desktop incoming-call toast, theonemspphone:// deep link for Microsoft sign-in,
// keychain via safeStorage, auto-update, signed installer (Azure Trusted Signing, like the agent).
const { app, BrowserWindow, protocol, net, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = path.resolve(__dirname, '..', 'dist');
const DEV_URL = process.env.ONEMSP_PHONE_DEV_URL; // e.g. http://localhost:8081 while `npx expo start --web` runs

// Expo's web export uses absolute paths (/_expo/...), which break under file:// - serve it from app://phone/ instead.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function createWindow() {
  const win = new BrowserWindow({
    width: 420, height: 780, minWidth: 360, title: 'The One MSP Phone',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadURL(DEV_URL || 'app://phone/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(DIST, rel);
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // Microphone only - nothing else the page asks for.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// The One MSP Phone desktop: the only bridge the page gets (sandboxed, context-isolated). src/audio/index.ts calls
// window.oneMspPhone.ringing(true, "Caller - Company") when a call rings and ringing(false) when it stops.
// Dial from anywhere (6 Nov 2026, src/desktop/bridge.ts): numbers arrive through onDialRequest; the hotkey can be read and
// changed. Nothing else of Electron is exposed, and main.js checks everything again on its side.
const { contextBridge, ipcRenderer } = require('electron');

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

contextBridge.exposeInMainWorld('oneMspPhone', {
  desktop: true,
  ringing: (on, title) => ipcRenderer.send('phone:ringing', !!on, typeof title === 'string' ? title.slice(0, 120) : ''),
  // cb gets { source: 'link' | 'hotkey', text?, error? }. Calling this tells main the page can take numbers; the function
  // it returns says it can't any more (signed out), so a number waits instead of being lost.
  onDialRequest: (cb) => {
    if (typeof cb !== 'function') return () => undefined;
    const handler = (_e, req) => cb({ source: text(req?.source, 10), text: text(req?.text, 64), error: text(req?.error, 20) });
    ipcRenderer.on('phone:dial-request', handler);
    ipcRenderer.send('phone:dial-ready', true);
    return () => { ipcRenderer.removeListener('phone:dial-request', handler); ipcRenderer.send('phone:dial-ready', false); };
  },
  bringForward: () => ipcRenderer.send('phone:bring-forward'),
  getHotkey: () => ipcRenderer.invoke('phone:hotkey-get'),
  setHotkey: (accelerator) => ipcRenderer.invoke('phone:hotkey-set', text(accelerator, 40)),
  openDefaultApps: () => ipcRenderer.send('phone:open-default-apps'),
});

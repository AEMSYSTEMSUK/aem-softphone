// The One MSP Phone desktop: the only bridge the page gets (sandboxed, context-isolated). src/audio/index.ts calls
// window.oneMspPhone.ringing(true, "Caller - Company") when a call rings and ringing(false) when it stops.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oneMspPhone', {
  desktop: true,
  ringing: (on, title) => ipcRenderer.send('phone:ringing', !!on, typeof title === 'string' ? title.slice(0, 120) : ''),
});

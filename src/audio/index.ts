import { AudioStore, Route } from './types';

export * from './types';

// Web / desktop (Electron): the browser plays the call through the default output device, so there is no route
// switch. Incoming calls ring with a soft tone (Web Audio) and a desktop notification; the Electron shell also brings
// its window forward (window.oneMspPhone from desktop/preload.js).
export const store = new AudioStore();
type Desk = { ringing?: (on: boolean, title?: string) => void };
const desk = () => (globalThis as unknown as { oneMspPhone?: Desk }).oneMspPhone;

let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
function beep() {
  try {
    const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      || (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    const now = ctx.currentTime;
    for (const [f, t] of [[440, 0], [480, 0], [440, 0.45], [480, 0.45]] as const) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; g.gain.value = 0.05;
      o.connect(g); g.connect(ctx.destination);
      o.start(now + t); o.stop(now + t + 0.35);
    }
  } catch { /* no audio */ }
}

export function ring(title?: string) {
  if (timer) return;
  beep(); timer = setInterval(beep, 2500);
  desk()?.ringing?.(true, title);
  try {
    const N = (globalThis as unknown as { Notification?: typeof Notification }).Notification;
    if (N && N.permission === 'granted' && typeof document !== 'undefined' && document.hidden) new N('Incoming call', { body: title || 'The One MSP Phone' });
  } catch { /* ignore */ }
}
export function stopRing() {
  if (timer) { clearInterval(timer); timer = null; }
  desk()?.ringing?.(false);
}
export async function callStarted() { stopRing(); store.set({ inCall: true }); }
export function allCallsEnded() { stopRing(); store.set({ inCall: false }); }
export async function setRoute(_r: Route) { /* browser: default output device */ }

export async function requestMic(): Promise<boolean> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    const N = (globalThis as unknown as { Notification?: typeof Notification }).Notification;
    if (N && N.permission === 'default') await N.requestPermission().catch(() => undefined);
    return true;
  } catch { return false; }
}
export function attention(on: boolean) { desk()?.ringing?.(on); }

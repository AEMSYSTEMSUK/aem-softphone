import { JsSipEngine } from './JsSipEngine';
import { StubSipEngine } from './StubSipEngine';
import type { SipEngine } from './SipEngine';
import { ensureWebRTC } from './webrtc';

export * from './SipEngine';
export { StubSipEngine };

// Real engine when WebRTC is available (dev/store build on a phone, Electron, a browser); otherwise the stub, with the
// reason shown in the app. EXPO_PUBLIC_SIP_STUB=1 forces the stub (UI work without touching voip1).
export function createSipEngine(): SipEngine {
  if (process.env.EXPO_PUBLIC_SIP_STUB === '1') return new StubSipEngine('Simulated calls (EXPO_PUBLIC_SIP_STUB=1)');
  const w = ensureWebRTC();
  return w.ok ? new JsSipEngine() : new StubSipEngine(`Simulated calls - ${w.reason}`);
}

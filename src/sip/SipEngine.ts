// The app's only view of calling. Screens never touch JsSIP / WebRTC directly, so the engine can be swapped (stub for
// Expo Go / tests, JsSIP + react-native-webrtc on device and in Electron, or later the Wazo SDK / a native engine)
// without touching the UI. One SIP registration per company account (spec: several companies on one handset).

export type RegState = 'unregistered' | 'registering' | 'registered' | 'failed';
export type CallState = 'ringing' | 'connecting' | 'active' | 'held' | 'ended';

export interface SipAccountConfig {
  accountId: number;
  username: string;
  password: string;
  displayName: string;
  companyName: string;
}

export interface EngineConfig {
  wssUrl: string;
  sipDomain: string;
  iceServers: Array<{ urls: string[]; username?: string; credential?: string }>;
  accounts: SipAccountConfig[];
}

export interface CallInfo {
  id: string;
  accountId: number;
  companyName: string;       // spec 6 A: every ring shows the company being called...
  dialledLine: string | null; // ...and which number was dialled (X-AEM-DID from voip1, milestone 2)
  direction: 'in' | 'out';
  remoteNumber: string;
  remoteName: string | null; // ...and who is calling (X-AEM-Caller / ONE phone book lookup)
  state: CallState;
  muted: boolean;
  held: boolean;
  startedAt: number | null;  // when it was answered
  endReason?: string;
}

export type SipEvent =
  | { type: 'registration'; accountId: number; state: RegState; reason?: string }
  | { type: 'call'; call: CallInfo };

export interface SipEngine {
  readonly kind: 'jssip' | 'stub';
  /** Human-readable reason when this is the stub (shown on the accounts screen). */
  readonly note: string | null;
  start(cfg: EngineConfig): Promise<void>;
  stop(): Promise<void>;
  registrations(): Record<number, RegState>;
  call(accountId: number, number: string): Promise<string>;
  answer(callId: string): void;
  hangup(callId: string): void;
  setMuted(callId: string, muted: boolean): void;
  setHeld(callId: string, held: boolean): void;
  sendDtmf(callId: string, digits: string): void;
  on(listener: (e: SipEvent) => void): () => void;
}

export class Emitter {
  private ls = new Set<(e: SipEvent) => void>();
  on(l: (e: SipEvent) => void) { this.ls.add(l); return () => { this.ls.delete(l); }; }
  emit(e: SipEvent) { for (const l of this.ls) { try { l(e); } catch { /* a bad listener must not break calls */ } } }
}

// UK numbers and extensions only, as on the desk phones (voip1's outbound context does the real barring). 999/112 are
// let through to the PBX but the dialler offers the phone's native dialler first (spec 4.4).
export function cleanDialString(raw: string): string | null {
  const s = String(raw || '').trim();
  const plus = s.startsWith('+');
  let d = s.replace(/[^\d*#]/g, '');
  if (plus && d.startsWith('44')) d = '0' + d.slice(2);
  return d.length >= 2 && d.length <= 20 ? d : null;
}

export const isEmergency = (n: string) => ['999', '112'].includes(n.replace(/\D/g, ''));

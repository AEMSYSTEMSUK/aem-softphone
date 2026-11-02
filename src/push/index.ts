// Web / Electron: no push or system call screen (the desktop app is open while it's in use). Same API as index.native.ts.
export interface PushCall {
  uuid: string; accountId: number; company: string; did: string; caller: string; callerNumber: string; at: number;
  answered: boolean; sipCallId: string | null;
}
export type PushEvent =
  | { type: 'incoming'; call: PushCall }
  | { type: 'answer'; call: PushCall }
  | { type: 'end'; call: PushCall }
  | { type: 'mute'; call: PushCall; muted: boolean }
  | { type: 'dtmf'; call: PushCall; digits: string };
export const supported = false;
export function onPushEvent(_l: (e: PushEvent) => void) { return () => undefined; }
export async function setupCallKeep() { /* web: nothing */ }
export async function handleIncomingPush(_d: Record<string, unknown> | undefined, _o: { appActiveAndRegistered?: boolean } = {}) { /* web */ }
export function claimForSip(_accountId: number, _sipCallId: string): PushCall | null { return null; }
export function callForSip(_sipCallId: string): PushCall | null { return null; }
export function reportAnswered(_c: PushCall) { /* web */ }
export function reportEnded(_c: PushCall) { /* web */ }
export async function registerPushToken(_save: (kind: 'fcm' | 'apns_voip', token: string) => Promise<unknown>, _isRegistered: () => boolean) { /* web */ }

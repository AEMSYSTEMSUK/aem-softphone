// #230 (3 Nov 2026): call audio - ringtone for calls the system isn't already ringing, speaker / earpiece / Bluetooth.
export type Route = 'EARPIECE' | 'SPEAKER_PHONE' | 'WIRED_HEADSET' | 'BLUETOOTH';
export interface AudioState { inCall: boolean; routes: Route[]; selected: Route | null }
export const ROUTE_LABEL: Record<Route, string> = { EARPIECE: 'Phone', SPEAKER_PHONE: 'Speaker', WIRED_HEADSET: 'Headset', BLUETOOTH: 'Bluetooth' };

type L = (s: AudioState) => void;
export class AudioStore {
  state: AudioState = { inCall: false, routes: [], selected: null };
  private ls = new Set<L>();
  set(p: Partial<AudioState>) { this.state = { ...this.state, ...p }; for (const l of this.ls) { try { l(this.state); } catch { /* ignore */ } } }
  subscribe(l: L) { this.ls.add(l); return () => { this.ls.delete(l); }; }
}

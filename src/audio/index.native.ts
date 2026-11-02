import { DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { AudioStore, Route } from './types';

export * from './types';

// Phones: react-native-incall-manager (made for react-native-webrtc). Android lists the outputs it can use (earpiece,
// speaker, wired headset, Bluetooth) and switches between them; iPhone: earpiece / speaker (Bluetooth follows the
// headset as usual, or the CallKit screen's audio button). Calls the system call screen rings (push) aren't rung twice.
export const store = new AudioStore();
let ringing = false;

const parse = (v: unknown): Route[] => { try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a : []; } catch { return []; } };
if (Platform.OS === 'android') {
  DeviceEventEmitter.addListener('onAudioDeviceChanged', (d: { availableAudioDeviceList?: string; selectedAudioDevice?: string }) => {
    store.set({ routes: parse(d?.availableAudioDeviceList), selected: (d?.selectedAudioDevice || null) as Route | null });
  });
}

export function ring() {
  if (ringing) return;
  ringing = true;
  try { InCallManager.startRingtone('_DEFAULT_', [0, 600, 1000], 'playback', 30); } catch { /* no ringtone - the call screen still shows */ }
}
export function stopRing() {
  if (!ringing) return;
  ringing = false;
  try { InCallManager.stopRingtone(); } catch { /* ignore */ }
}

export async function callStarted() {
  stopRing();
  if (store.state.inCall) return;
  if (Platform.OS === 'android' && Number(Platform.Version) >= 31) {
    await PermissionsAndroid.request('android.permission.BLUETOOTH_CONNECT' as never).catch(() => undefined); // Bluetooth headsets
  }
  try { InCallManager.start({ media: 'audio' }); } catch { /* ignore */ }
  store.set({ inCall: true, ...(Platform.OS === 'ios' ? { routes: ['EARPIECE', 'SPEAKER_PHONE'] as Route[], selected: 'EARPIECE' as Route } : {}) });
}

export function allCallsEnded() {
  stopRing();
  if (!store.state.inCall) return;
  try { InCallManager.stop(); } catch { /* ignore */ }
  store.set({ inCall: false, routes: [], selected: null });
}

export async function setRoute(r: Route) {
  if (Platform.OS === 'ios') {
    InCallManager.setForceSpeakerphoneOn(r === 'SPEAKER_PHONE');
    store.set({ selected: r });
    return;
  }
  try {
    const d = await InCallManager.chooseAudioRoute(r);
    store.set({ routes: parse(d?.availableAudioDeviceList), selected: (d?.selectedAudioDevice || r) as Route });
  } catch { /* keep the old route */ }
}

/** Ask for the microphone up front (first-run screen). */
export async function requestMic(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AudioModule } = require('expo-audio');
  const r = await AudioModule.requestRecordingPermissionsAsync();
  return !!r?.granted;
}

/** Desktop only: bring the window forward / flash it. */
export function attention(_on: boolean) { /* phones: the system handles it */ }

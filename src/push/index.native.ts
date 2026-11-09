import { AppState, PermissionsAndroid, Platform } from 'react-native';
import Constants from 'expo-constants';
import RNCallKeep from 'react-native-callkeep';
import { APP_NAME } from '../config';

// #230 milestone 2 (1 Nov 2026): ringing when the app is asleep. ONE (softphone-push.service.ts) sends
//   Android: FCM high-priority data message  -> setBackgroundMessageHandler (index.ts) / onMessage -> handleIncomingPush
//            -> RNCallKeep.displayIncomingCall (system call screen over the lock screen, via ConnectionService)
//   iPhone:  Apple VoIP push (PushKit) -> native AppDelegate reports it to CallKit (plugins/withVoipPush.js) -> JS gets
//            the same payload from react-native-voip-push-notification
// and voip1 waits up to 12 s for the app to register, then sends the SIP INVITE. AppContext links that INVITE to the
// ringing system call (same company account, within 30 s) so "Answer" on the lock screen answers the real call.
// Payload (strings): type=incoming_call, uuid, callId, accountId, endpoint, company, did, caller, callerNumber, sentAt.

export interface PushCall {
  uuid: string; accountId: number; company: string; did: string; caller: string; callerNumber: string; at: number;
  answered: boolean; sipCallId: string | null;
  shownBySystem: boolean; // the system call screen is ringing it (CallKit / Android Telecom) - the app doesn't ring too
}
export type PushEvent =
  | { type: 'incoming'; call: PushCall }
  | { type: 'answer'; call: PushCall }
  | { type: 'end'; call: PushCall }
  | { type: 'mute'; call: PushCall; muted: boolean }
  | { type: 'dtmf'; call: PushCall; digits: string };

const pending = new Map<string, PushCall>();
const listeners = new Set<(e: PushEvent) => void>();
const emit = (e: PushEvent) => { for (const l of listeners) { try { l(e); } catch { /* keep going */ } } };
export function onPushEvent(l: (e: PushEvent) => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export const supported = true;

// 3 Nov 2026: true once this phone can be woken by push (token saved in ONE, or a push has just arrived). Only then does
// the app unregister its lines in the background (push mode) - without push it stays registered, as before.
let ready = false;
export const pushReady = () => ready;
// Declined on the lock screen before the SIP INVITE arrived: reject that INVITE when it comes (account -> time).
const declined = new Map<number, number>();
export function wasDeclined(accountId: number) { const t = declined.get(accountId); return !!t && Date.now() - t < 30_000; }

let setupDone = false;
export async function setupCallKeep() {
  if (setupDone) return;
  setupDone = true;
  await RNCallKeep.setup({
    ios: { appName: APP_NAME, supportsVideo: false, maximumCallGroups: '1', maximumCallsPerCallGroup: '1', includesCallsInRecents: true },
    android: {
      // 9 Nov 2026: on a Pixel the switch is one level down ("All calling accounts"), not under "Third-party apps".
      alertTitle: 'Allow calls', alertDescription: `So calls ring on your lock screen: on the next screen tap "All calling accounts", then switch on ${APP_NAME}.`,
      cancelButton: 'Not now', okButton: 'Allow', additionalPermissions: [], selfManaged: false,
      foregroundService: { channelId: 'uk.co.aemsystems.theonemspphone.calls', channelName: 'Calls', notificationTitle: `${APP_NAME} call in progress` },
    },
  });
  RNCallKeep.setAvailable(true);
  RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
    const c = pending.get(String(callUUID).toLowerCase());
    if (!c) return;
    c.answered = true;
    if (Platform.OS === 'android') RNCallKeep.backToForeground();
    emit({ type: 'answer', call: c });
  });
  RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
    const c = pending.get(String(callUUID).toLowerCase());
    if (!c) return;
    pending.delete(c.uuid);
    if (!c.sipCallId && !c.answered) declined.set(c.accountId, Date.now());
    emit({ type: 'end', call: c });
  });
  RNCallKeep.addEventListener('didPerformSetMutedCallAction', ({ callUUID, muted }) => {
    const c = pending.get(String(callUUID).toLowerCase()); if (c) emit({ type: 'mute', call: c, muted });
  });
  RNCallKeep.addEventListener('didPerformDTMFAction', ({ callUUID, digits }) => {
    const c = pending.get(String(callUUID).toLowerCase()); if (c) emit({ type: 'dtmf', call: c, digits });
  });
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

// Called for every push (foreground, background handler, PushKit). iOS has already shown CallKit natively.
export async function handleIncomingPush(data: Record<string, unknown> | undefined, opts: { appActiveAndRegistered?: boolean } = {}) {
  if (!data || str(data.type) !== 'incoming_call') return;
  const uuid = str(data.uuid).toLowerCase();
  if (!uuid || pending.has(uuid)) return;
  ready = true;
  // Old push (phone was offline for a while): the caller has gone, don't ring.
  if (Number(data.sentAt) && Date.now() - Number(data.sentAt) > 45_000) { if (Platform.OS === 'ios') RNCallKeep.endCall(uuid); return; }
  await setupCallKeep();
  const call: PushCall = {
    uuid, accountId: Number(data.accountId) || 0, company: str(data.company), did: str(data.did), caller: str(data.caller),
    callerNumber: str(data.callerNumber) || 'Unknown', at: Date.now(), answered: false, sipCallId: null, shownBySystem: Platform.OS === 'ios',
  };
  pending.set(uuid, call);
  // Android: the app's own call screen is enough when it is open and signed in; otherwise the system call screen.
  if (Platform.OS === 'android' && !(opts.appActiveAndRegistered && AppState.currentState === 'active')) {
    const name = call.company ? `${call.caller || call.callerNumber} - ${call.company}` : call.caller || call.callerNumber;
    RNCallKeep.displayIncomingCall(uuid, call.callerNumber, name, 'number', false);
    call.shownBySystem = true;
  }
  // Nobody linked it to a SIP call within 30 s (voip1 gave up / caller hung up): take it off the screen. (Not a decline.)
  setTimeout(() => { const c = pending.get(uuid); if (c && !c.sipCallId) { pending.delete(uuid); RNCallKeep.reportEndCallWithUUID(uuid, 3); emit({ type: 'end', call: c }); } }, 30_000);
  emit({ type: 'incoming', call });
}

// Link a ringing SIP INVITE to the system call for the same company account (newest first, within 30 s).
export function claimForSip(accountId: number, sipCallId: string): PushCall | null {
  const now = Date.now();
  const c = [...pending.values()].filter((p) => p.accountId === accountId && !p.sipCallId && now - p.at < 30_000).sort((a, b) => b.at - a.at)[0];
  if (!c) return null;
  c.sipCallId = sipCallId;
  return c;
}
export function callForSip(sipCallId: string) { return [...pending.values()].find((p) => p.sipCallId === sipCallId) || null; }
export function reportAnswered(c: PushCall) { RNCallKeep.setCurrentCallActive(c.uuid); }
export function reportEnded(c: PushCall) {
  pending.delete(c.uuid);
  // Answered here = our own end; never answered = the caller hung up or a colleague took it (no "missed" from us).
  if (c.answered) RNCallKeep.endCall(c.uuid); else RNCallKeep.reportEndCallWithUUID(c.uuid, 2);
}

// ---------- push token -> ONE ----------
type Save = (kind: 'fcm' | 'apns_voip', token: string) => Promise<unknown>;
let tokenStarted = false;
export async function registerPushToken(save: Save, isRegistered: () => boolean) {
  if (tokenStarted) return;
  tokenStarted = true;
  await setupCallKeep();
  if (Platform.OS === 'android') {
    if (!(Constants.expoConfig?.extra as { pushAndroid?: boolean } | undefined)?.pushAndroid) return; // built without Firebase
    if (Number(Platform.Version) >= 33) await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as never).catch(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // 9 Nov 2026: RNFirebase v27 is modular-only (no `.default()`); a push failure must never break the app.
    try {
      const fm = require('@react-native-firebase/messaging');
      const msg = fm.getMessaging();
      const t = await fm.getToken(msg);
      if (t) { await save('fcm', t); ready = true; }
      fm.onTokenRefresh(msg, (nt: string) => { save('fcm', nt).catch(() => undefined); });
      fm.onMessage(msg, (m: { data?: Record<string, unknown> }) => handleIncomingPush(m.data, { appActiveAndRegistered: isRegistered() }));
    } catch (e) {
      console.warn('push: FCM setup failed', e);
    }
  } else if (Platform.OS === 'ios') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VoipPush = require('react-native-voip-push-notification').default;
    VoipPush.addEventListener('register', (token: string) => { save('apns_voip', token).then(() => { ready = true; }).catch(() => undefined); });
    VoipPush.addEventListener('notification', (n: Record<string, unknown>) => { handleIncomingPush(n); });
    // Events that arrived before JS was ready (the push that launched the app).
    VoipPush.addEventListener('didLoadWithEvents', (events: Array<{ name: string; data: unknown }>) => {
      for (const e of events || []) {
        if (e.name === VoipPush.RNVoipPushRemoteNotificationsRegisteredEvent) save('apns_voip', String(e.data)).catch(() => undefined);
        else if (e.name === VoipPush.RNVoipPushRemoteNotificationReceivedEvent) handleIncomingPush(e.data as Record<string, unknown>);
      }
    });
    VoipPush.registerVoipToken();
  }
}

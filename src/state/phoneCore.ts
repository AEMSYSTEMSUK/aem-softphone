import { AppState } from 'react-native';
import * as api from '../api/client';
import type { SipConfig } from '../api/types';
import { createSipEngine, SipEngine } from '../sip';
import * as push from '../push';
import * as audio from '../audio';

// #230 (3 Nov 2026): the phone side that must work WITHOUT the UI. On Android a push for an incoming call can start the
// app's JS headless (no React tree, phone locked); this module then signs the lines in straight away, so voip1's INVITE
// arrives while the lock screen is still ringing, and "Answer" there answers the real call. The UI (AppContext) uses the
// same engine when it loads, so nothing is torn down in between.
//
// Push mode: once the phone can be woken by push, the lines are unregistered whenever the app goes to the background
// and nothing is in progress. voip1 then sees "no registration", pushes, and waits for the app to register (see
// backend ops/voip1/app-push) instead of sending the INVITE to a socket a sleeping phone no longer reads.

const CFG_MAX_AGE_MS = 6 * 3600_000; // TURN credentials from ONE last 12 h
let engine: SipEngine | null = null;
let cfgAt = 0;
let waking: Promise<boolean> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

export function getEngine(): SipEngine {
  if (engine) return engine;
  const e = createSipEngine();
  engine = e;
  e.on((ev) => {
    if (ev.type !== 'call') return;
    const c = ev.call;
    // Tie SIP calls to the system call screen (CallKit / Android Telecom) that a push put up.
    if (c.direction === 'in' && c.state === 'ringing') {
      const pc = push.callForSip(c.id) || push.claimForSip(c.accountId, c.id);
      if (pc?.answered) e.answer(c.id); // answered on the lock screen before the INVITE arrived
      else if (!pc && push.wasDeclined(c.accountId)) e.hangup(c.id); // declined on the lock screen before it arrived
      else if (!pc?.shownBySystem && !e.liveCalls().some((x) => x.id !== c.id && x.state !== 'ringing')) {
        // Nobody else is ringing it: ring in the app (not while already on a call - the call screen shows it instead).
        audio.ring([c.remoteName || c.remoteNumber, c.companyName].filter(Boolean).join(' - '));
      }
    } else if (c.state === 'active' || (c.direction === 'out' && c.state === 'connecting')) {
      if (c.state === 'active') { const pc = push.callForSip(c.id); if (pc) push.reportAnswered(pc); }
      audio.callStarted().catch(() => undefined);
    } else if (c.state === 'ended') {
      const pc = push.callForSip(c.id); if (pc) push.reportEnded(pc);
      const left = e.liveCalls().filter((x) => x.id !== c.id);
      if (!left.length) audio.allCallsEnded();
      else if (!left.some((x) => x.state === 'ringing')) audio.stopRing();
      sleepSoon();
    }
  });
  // Lock-screen Answer / End / mute / keypad -> the SIP call; a new push -> sign the lines in now.
  push.onPushEvent((p) => {
    const sipId = p.call.sipCallId;
    if (p.type === 'incoming') wake().catch(() => undefined);
    else if (p.type === 'answer' && sipId) e.answer(sipId);
    else if (p.type === 'end' && sipId) e.hangup(sipId);
    else if (p.type === 'mute' && sipId) e.setMuted(sipId, p.muted);
    else if (p.type === 'dtmf' && sipId) e.sendDtmf(sipId, p.digits);
    if (p.type === 'end') sleepSoon();
  });
  return e;
}

/** Start / refresh the lines from ONE's /sip answer (AppContext.reload calls this). */
export async function applySipConfig(s: SipConfig) {
  const ready = s.accounts.filter((a) => a.ready && a.username && a.password);
  await getEngine().start({
    wssUrl: s.wssUrl, sipDomain: s.sipDomain, iceServers: s.iceServers,
    accounts: ready.map((a) => ({ accountId: a.accountId, username: a.username as string, password: a.password as string, displayName: a.displayName, companyName: a.companyName })),
  });
  cfgAt = Date.now();
}

/** Register the lines now (push arrived / app came to the front). Works headless: signs in from the keychain token. */
export function wake(): Promise<boolean> {
  if (!waking) waking = doWake().finally(() => { waking = null; });
  return waking;
}

async function doWake(): Promise<boolean> {
  const e = getEngine();
  let ok: boolean;
  if (e.isConfigured() && Date.now() - cfgAt < CFG_MAX_AGE_MS) ok = await e.resume();
  else {
    try { await applySipConfig(await api.getSip()); ok = true; } catch { ok = false; } // not signed in / offline
  }
  sleepSoon(45_000); // woken in the background and no call came (caller gave up): go back to sleep
  return ok;
}

/** Background + push works + no call in progress -> unregister (push mode). */
export function sleepSoon(delayMs = 3_000) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (AppState.currentState === 'active' || !push.pushReady()) return;
    getEngine().pause().catch(() => undefined);
  }, delayMs);
}

export function anyRegistered() { return Object.values(getEngine().registrations()).includes('registered'); }

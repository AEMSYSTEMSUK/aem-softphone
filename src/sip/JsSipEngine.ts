import { Platform } from 'react-native';
import * as JsSIP from 'jssip';
import type { RTCSession } from 'jssip/lib/RTCSession';
import type { IncomingRequest } from 'jssip/lib/SIPMessage';
import { CallInfo, EngineConfig, Emitter, RegState, SipAccountConfig, SipEngine, SipEvent } from './SipEngine';

// Real calling: JsSIP (MIT, maintained) over SIP-over-WebSocket to voip1 (Wazo / Asterisk PJSIP WSS transport), media by
// WebRTC (react-native-webrtc on phones, Chromium in Electron). One JsSIP UA = one company account registration.
// NOT exercised against voip1 yet: the -app endpoints + a WebRTC template on voip1 are milestone 2 (see README).

interface Live { session: RTCSession; info: CallInfo }

const header = (req: IncomingRequest | undefined, name: string) => {
  try { const v = req?.getHeader(name); return v ? String(v) : null; } catch { return null; }
};

export class JsSipEngine implements SipEngine {
  readonly kind = 'jssip' as const;
  readonly note = null;
  private ev = new Emitter();
  private uas = new Map<number, JsSIP.UA>();
  private regs: Record<number, RegState> = {};
  private live = new Map<string, Live>();
  private cfg: EngineConfig | null = null;

  async start(cfg: EngineConfig) {
    await this.stop();
    this.cfg = cfg;
    for (const a of cfg.accounts) this.startUa(a);
  }

  private setReg(accountId: number, state: RegState, reason?: string) {
    this.regs[accountId] = state;
    this.ev.emit({ type: 'registration', accountId, state, reason });
  }

  private startUa(a: SipAccountConfig) {
    const cfg = this.cfg!;
    const socket = new JsSIP.WebSocketInterface(cfg.wssUrl);
    const ua = new JsSIP.UA({
      sockets: [socket],
      uri: `sip:${a.username}@${cfg.sipDomain}`,
      password: a.password,
      display_name: a.displayName,
      register: true,
      register_expires: 300,
      session_timers: false,
      user_agent: `TheOneMSPPhone (${Platform.OS})`,
    });
    ua.on('connecting', () => this.setReg(a.accountId, 'registering'));
    ua.on('registered', () => this.setReg(a.accountId, 'registered'));
    ua.on('unregistered', () => this.setReg(a.accountId, 'unregistered'));
    ua.on('registrationFailed', (e: { cause?: string }) => this.setReg(a.accountId, 'failed', e?.cause));
    ua.on('newRTCSession', (e: { originator: string; session: RTCSession; request: unknown }) => {
      if (e.originator !== 'remote') return; // outgoing sessions are tracked in call()
      const req = e.request as IncomingRequest;
      const id = e.session.id;
      // spec 6 A: voip1 adds X-AEM-Company / X-AEM-DID / X-AEM-Caller on the leg to the app (milestone 2 dialplan work).
      const info: CallInfo = {
        id, accountId: a.accountId, companyName: header(req, 'X-AEM-Company') || a.companyName, dialledLine: header(req, 'X-AEM-DID'),
        direction: 'in', remoteNumber: e.session.remote_identity?.uri?.user || 'Unknown',
        remoteName: header(req, 'X-AEM-Caller') || e.session.remote_identity?.display_name || null,
        state: 'ringing', muted: false, held: false, startedAt: null,
      };
      this.track(e.session, info);
    });
    ua.start();
    this.uas.set(a.accountId, ua);
  }

  private update(id: string, patch: Partial<CallInfo>) {
    const l = this.live.get(id);
    if (!l) return;
    l.info = { ...l.info, ...patch };
    if (l.info.state === 'ended') this.live.delete(id);
    this.ev.emit({ type: 'call', call: l.info });
  }

  private track(session: RTCSession, info: CallInfo) {
    this.live.set(info.id, { session, info });
    session.on('progress', () => this.update(info.id, { state: info.direction === 'in' ? 'ringing' : 'connecting' }));
    session.on('confirmed', () => this.update(info.id, { state: 'active', startedAt: Date.now() }));
    session.on('ended', (e: { cause?: string }) => this.update(info.id, { state: 'ended', endReason: e?.cause }));
    session.on('failed', (e: { cause?: string }) => this.update(info.id, { state: 'ended', endReason: e?.cause }));
    session.on('hold', () => this.update(info.id, { held: true, state: 'held' }));
    session.on('unhold', () => this.update(info.id, { held: false, state: 'active' }));
    session.on('muted', () => this.update(info.id, { muted: true }));
    session.on('unmuted', () => this.update(info.id, { muted: false }));
    // Browser / Electron: play the far end through an <audio> element. react-native-webrtc plays it natively.
    if (Platform.OS === 'web') {
      session.on('peerconnection', (e: { peerconnection: RTCPeerConnection }) => {
        e.peerconnection.addEventListener('track', (t: RTCTrackEvent) => {
          const el = new (globalThis as unknown as { Audio: new () => HTMLAudioElement }).Audio();
          el.autoplay = true;
          el.srcObject = t.streams[0];
        });
      });
    }
    this.ev.emit({ type: 'call', call: info });
  }

  private pcConfig(): RTCConfiguration {
    return { iceServers: (this.cfg?.iceServers || []) as RTCIceServer[] };
  }

  async stop() {
    for (const l of this.live.values()) { try { l.session.terminate(); } catch { /* already gone */ } }
    for (const [id, ua] of this.uas) { try { ua.stop(); } catch { /* ignore */ } this.regs[id] = 'unregistered'; }
    this.uas.clear();
  }

  registrations() { return { ...this.regs }; }

  async call(accountId: number, number: string) {
    const ua = this.uas.get(accountId);
    const a = this.cfg?.accounts.find((x) => x.accountId === accountId);
    if (!ua || !a || !this.cfg) throw new Error('That account is not signed in to the phone system');
    const session = ua.call(`sip:${number}@${this.cfg.sipDomain}`, { mediaConstraints: { audio: true, video: false }, pcConfig: this.pcConfig() });
    const info: CallInfo = { id: session.id, accountId, companyName: a.companyName, dialledLine: null, direction: 'out', remoteNumber: number, remoteName: null, state: 'connecting', muted: false, held: false, startedAt: null };
    this.track(session, info);
    return info.id;
  }

  answer(id: string) { this.live.get(id)?.session.answer({ mediaConstraints: { audio: true, video: false }, pcConfig: this.pcConfig() }); }
  hangup(id: string) { try { this.live.get(id)?.session.terminate(); } catch { this.update(id, { state: 'ended' }); } }
  setMuted(id: string, muted: boolean) { const s = this.live.get(id)?.session; if (s) { if (muted) s.mute({ audio: true }); else s.unmute({ audio: true }); } }
  setHeld(id: string, held: boolean) { const s = this.live.get(id)?.session; if (s) { if (held) s.hold(); else s.unhold(); } }
  sendDtmf(id: string, digits: string) { this.live.get(id)?.session.sendDTMF(digits); }
  on(l: (e: SipEvent) => void) { return this.ev.on(l); }
}

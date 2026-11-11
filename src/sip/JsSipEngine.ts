import { Platform } from 'react-native';
import * as JsSIP from 'jssip';
import type { RTCSession } from 'jssip/lib/RTCSession';
import type { IncomingRequest } from 'jssip/lib/SIPMessage';
import { CallInfo, EngineConfig, Emitter, RegState, SipAccountConfig, SipEngine, SipEvent } from './SipEngine';

// Real calling: JsSIP (MIT, maintained) over SIP-over-WebSocket to voip1 (Wazo / Asterisk PJSIP WSS transport), media by
// WebRTC (react-native-webrtc on phones, Chromium in Electron). One JsSIP UA = one company account registration.
// NOT exercised against voip1 yet: the -app endpoints + a WebRTC template on voip1 are milestone 2 (see README).
// 3 Nov 2026: start() is idempotent (a push-woken engine keeps its ringing call when the app UI then loads), pause() /
// resume() for push mode, transfer() (blind, SIP REFER).

interface Live { session: RTCSession; info: CallInfo }

const header = (req: IncomingRequest | undefined, name: string) => {
  try { const v = req?.getHeader(name); return v ? String(v) : null; } catch { return null; }
};

export class JsSipEngine implements SipEngine {
  readonly kind = 'jssip' as const;
  readonly note = null;
  private ev = new Emitter();
  private uas = new Map<number, JsSIP.UA>();
  private uaKeys = new Map<number, string>();
  private regs: Record<number, RegState> = {};
  private live = new Map<string, Live>();
  private cfg: EngineConfig | null = null;

  private keyOf(a: SipAccountConfig, cfg: EngineConfig) { return [cfg.wssUrl, cfg.sipDomain, a.username, a.password, a.displayName].join('|'); }
  private busy(accountId: number) { return [...this.live.values()].some((l) => l.info.accountId === accountId); }
  private stopUa(accountId: number) {
    const ua = this.uas.get(accountId);
    if (ua) { try { ua.stop(); } catch { /* already stopped */ } }
    this.uas.delete(accountId); this.uaKeys.delete(accountId);
    this.setReg(accountId, 'unregistered');
  }

  async start(cfg: EngineConfig) {
    const prev = this.cfg;
    this.cfg = cfg; // fresh TURN credentials apply to the next call
    const want = new Map(cfg.accounts.map((a) => [a.accountId, a]));
    for (const id of [...this.uas.keys()]) {
      const a = want.get(id);
      if (a && this.uaKeys.get(id) === this.keyOf(a, cfg)) continue; // same login: keep the registration (and its calls)
      if (this.busy(id) && a && prev) continue; // login changed mid-call: swap it after the call (next start)
      this.stopUa(id);
    }
    for (const a of cfg.accounts) {
      const ua = this.uas.get(a.accountId);
      if (!ua) this.startUa(a);
      else if (!ua.isRegistered()) { try { ua.register(); } catch { /* reconnecting */ } }
    }
  }

  async pause() {
    if (this.live.size) return false;
    for (const id of [...this.uas.keys()]) this.stopUa(id); // ua.stop() sends REGISTER Expires: 0 first
    return true;
  }

  async resume() {
    if (!this.cfg) return false;
    await this.start(this.cfg);
    return true;
  }

  isConfigured() { return !!this.cfg && this.cfg.accounts.length > 0; }
  liveCalls() { return [...this.live.values()].map((l) => l.info); }

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
    this.uaKeys.set(a.accountId, this.keyOf(a, cfg));
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
    // For outgoing calls JsSIP creates the peer connection INSIDE ua.call(), before we get here, so 'peerconnection' has
    // already fired - use session.connection when it exists. Keep the element referenced until the call ends.
    if (Platform.OS === 'web') {
      let el: HTMLAudioElement | null = null;
      const attach = (pc: RTCPeerConnection) => {
        const play = (stream: MediaStream) => {
          if (!el) el = new (globalThis as unknown as { Audio: new () => HTMLAudioElement }).Audio();
          el.autoplay = true;
          el.srcObject = stream;
          el.play().catch(() => { /* autoplay refused - retried on the next track */ });
        };
        pc.addEventListener('track', (t: RTCTrackEvent) => play(t.streams[0] || new MediaStream([t.track])));
        const live = pc.getReceivers().map((r) => r.track).filter((t) => t && t.kind === 'audio');
        if (live.length) play(new MediaStream(live));
      };
      const pc = (session as unknown as { connection?: RTCPeerConnection }).connection;
      if (pc) attach(pc);
      else session.on('peerconnection', (e: { peerconnection: RTCPeerConnection }) => attach(e.peerconnection));
      const stop = () => { if (el) { el.pause(); el.srcObject = null; el = null; } };
      session.on('ended', stop);
      session.on('failed', stop);
    }
    this.ev.emit({ type: 'call', call: info });
  }

  private pcConfig(): RTCConfiguration {
    return { iceServers: (this.cfg?.iceServers || []) as RTCIceServer[] };
  }

  async stop() {
    for (const l of this.live.values()) { try { l.session.terminate(); } catch { /* already gone */ } }
    for (const [id, ua] of this.uas) { try { ua.stop(); } catch { /* ignore */ } this.regs[id] = 'unregistered'; }
    this.uas.clear(); this.uaKeys.clear();
    this.cfg = null;
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
  // Blind transfer: REFER to <target>@<domain>. voip1 routes it in the caller's company context (like a desk phone's
  // Transfer key), so an extension (201) or an outside number both work. Our leg ends when the PBX accepts it.
  transfer(id: string, target: string) {
    const l = this.live.get(id);
    if (!l || !this.cfg) return;
    l.session.refer(`sip:${target}@${this.cfg.sipDomain}`, {
      eventHandlers: {
        accepted: () => { try { l.session.terminate(); } catch { /* already gone */ } },
        failed: () => this.update(id, { endReason: 'transfer failed' }),
      },
    });
  }
  // Attended: the caller (held) is REFERred to the consulted person's dialog with Replaces, so Asterisk joins them and
  // drops both of our legs. Fails = both calls stay with us (caller still on hold).
  attendedTransfer(id: string, consultId: string) {
    const a = this.live.get(id), b = this.live.get(consultId);
    if (!a || !b) return;
    a.session.refer(b.session.remote_identity.uri, {
      replaces: b.session,
      eventHandlers: {
        accepted: () => { for (const s of [a.session, b.session]) { try { s.terminate(); } catch { /* already gone */ } } },
        failed: () => this.update(id, { endReason: 'transfer failed' }),
      },
    });
  }
  on(l: (e: SipEvent) => void) { return this.ev.on(l); }
}

import { CallInfo, EngineConfig, Emitter, RegState, SipEngine, SipEvent } from './SipEngine';

// Pretend engine: "registers" every account that has a login and walks an outgoing call through connecting -> active.
// Used in Expo Go (no WebRTC native module) and anywhere real calling isn't available, so every screen still works.
export class StubSipEngine implements SipEngine {
  readonly kind = 'stub' as const;
  private ev = new Emitter();
  private regs: Record<number, RegState> = {};
  private calls = new Map<string, CallInfo>();
  private n = 0;
  private accounts: EngineConfig['accounts'] = [];

  constructor(public readonly note: string) {}

  async start(cfg: EngineConfig) {
    this.accounts = cfg.accounts;
    for (const a of cfg.accounts) {
      this.regs[a.accountId] = 'registering';
      this.ev.emit({ type: 'registration', accountId: a.accountId, state: 'registering' });
      setTimeout(() => { this.regs[a.accountId] = 'registered'; this.ev.emit({ type: 'registration', accountId: a.accountId, state: 'registered', reason: 'simulated' }); }, 400);
    }
  }

  async stop() {
    for (const id of Object.keys(this.regs)) this.regs[Number(id)] = 'unregistered';
    for (const c of this.calls.values()) this.update(c.id, { state: 'ended', endReason: 'signed out' });
  }

  registrations() { return { ...this.regs }; }

  private update(id: string, patch: Partial<CallInfo>) {
    const c = this.calls.get(id);
    if (!c) return;
    const next = { ...c, ...patch };
    if (next.state === 'ended') this.calls.delete(id); else this.calls.set(id, next);
    this.ev.emit({ type: 'call', call: next });
  }

  async call(accountId: number, number: string) {
    const a = this.accounts.find((x) => x.accountId === accountId);
    const id = `stub-${++this.n}`;
    const c: CallInfo = { id, accountId, companyName: a?.companyName || 'Account', dialledLine: null, direction: 'out', remoteNumber: number, remoteName: null, state: 'connecting', muted: false, held: false, startedAt: null };
    this.calls.set(id, c);
    this.ev.emit({ type: 'call', call: c });
    setTimeout(() => this.update(id, { state: 'active', startedAt: Date.now() }), 1500);
    return id;
  }

  /** Dev helper: simulate an incoming call (Accounts screen "Test incoming call" in stub mode). */
  simulateIncoming(accountId: number, number: string, name: string | null, dialledLine: string | null) {
    const a = this.accounts.find((x) => x.accountId === accountId);
    const id = `stub-${++this.n}`;
    const c: CallInfo = { id, accountId, companyName: a?.companyName || 'Account', dialledLine, direction: 'in', remoteNumber: number, remoteName: name, state: 'ringing', muted: false, held: false, startedAt: null };
    this.calls.set(id, c);
    this.ev.emit({ type: 'call', call: c });
  }

  answer(id: string) { this.update(id, { state: 'active', startedAt: Date.now() }); }
  hangup(id: string) { this.update(id, { state: 'ended', endReason: 'hung up' }); }
  setMuted(id: string, muted: boolean) { this.update(id, { muted }); }
  setHeld(id: string, held: boolean) { this.update(id, { held, state: held ? 'held' : 'active' }); }
  sendDtmf() { /* nothing to send */ }
  on(l: (e: SipEvent) => void) { return this.ev.on(l); }
}

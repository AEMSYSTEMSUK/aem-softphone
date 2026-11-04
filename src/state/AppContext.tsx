import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as api from '../api/client';
import type { Me, SipConfig } from '../api/types';
import { CallInfo, RegState, SipEngine } from '../sip';
import * as push from '../push';
import * as core from './phoneCore';

// App-wide state: who's signed in (ONE), their company accounts, the SIP engine and its registrations / calls.

type Phase = 'starting' | 'signed_out' | 'signed_in';

interface Ctx {
  phase: Phase;
  me: Me | null;
  sip: SipConfig | null;
  engine: SipEngine;
  regs: Record<number, RegState>;
  regReasons: Record<number, string | null>; // why a line failed to connect (setup screen)
  calls: CallInfo[];
  currentAccountId: number | null;
  setCurrentAccountId: (id: number) => void;
  error: string | null;
  signedIn: () => Promise<void>;
  signOut: () => Promise<void>;
  reload: (refreshSip?: boolean) => Promise<void>;
  setMe: (m: Me) => void;
  newVoicemail: number; // unheard messages, for the tab badge
  setNewVoicemail: React.Dispatch<React.SetStateAction<number>>;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // One engine for the whole app process (phoneCore) - a push may already have started it headless before this UI loaded.
  const engineRef = useRef<SipEngine>(core.getEngine());
  const engine = engineRef.current;
  const [phase, setPhase] = useState<Phase>('starting');
  const [me, setMe] = useState<Me | null>(null);
  const [sip, setSip] = useState<SipConfig | null>(null);
  const [regs, setRegs] = useState<Record<number, RegState>>(() => engine.registrations());
  const [calls, setCalls] = useState<CallInfo[]>(() => engine.liveCalls()); // e.g. answered on the lock screen
  const [currentAccountId, setCurrentAccountId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newVoicemail, setNewVoicemail] = useState(0);

  const regsRef = useRef<Record<number, RegState>>(engine.registrations());
  const [regReasons, setRegReasons] = useState<Record<number, string | null>>({});
  const phaseRef = useRef<Phase>('starting');
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => engine.on((e) => {
    if (e.type === 'registration') {
      regsRef.current = { ...regsRef.current, [e.accountId]: e.state }; setRegs(regsRef.current);
      setRegReasons((m) => ({ ...m, [e.accountId]: e.state === 'failed' ? e.reason || null : null }));
      return;
    }
    const c = e.call; // linking to the lock-screen call (push) is done in phoneCore, so it also works headless
    setCalls((cs) => (c.state === 'ended' ? cs.filter((x) => x.id !== c.id) : [...cs.filter((x) => x.id !== c.id), c]));
  }), [engine]);

  const refreshVoicemail = useCallback(() => {
    api.getVoicemail().then((r) => setNewVoicemail(r.items.filter((v) => v.isNew).length)).catch(() => undefined);
  }, []);

  const reload = useCallback(async (refreshSip = false) => {
    setError(null);
    try {
      const m = await api.getMe();
      setMe(m);
      setCurrentAccountId((cur) => (cur && m.accounts.some((a) => a.id === cur) ? cur : m.accounts[0]?.id ?? null));
      const s = await api.getSip(refreshSip);
      setSip(s);
      await core.applySipConfig(s);
      if (s.fetchError) setError(s.fetchError);
      refreshVoicemail();
      // Milestone 2: tell ONE where to wake this phone (FCM token / Apple VoIP token). Errors here never block calling.
      push.registerPushToken((kind, token) => api.savePushToken(kind, token), core.anyRegistered).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your accounts');
    }
  }, [engine, refreshVoicemail]);

  // Push mode (3 Nov 2026): background -> unregister once push works and nothing is in progress (phoneCore.sleepSoon);
  // front -> register again. Lock-screen Answer / End etc. and push wake-ups are handled in phoneCore.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (phaseRef.current !== 'signed_in') return;
      if (st === 'active') { core.wake().catch(() => undefined); refreshVoicemail(); }
      else if (st === 'background') core.sleepSoon();
    });
    return () => sub.remove();
  }, [refreshVoicemail]);

  const signedIn = useCallback(async () => { setPhase('signed_in'); await reload(); }, [reload]);

  const signOut = useCallback(async () => {
    await engine.stop();
    await api.logout().catch(() => undefined);
    setMe(null); setSip(null); setRegs({}); setCalls([]); setNewVoicemail(0); setPhase('signed_out');
  }, [engine]);

  useEffect(() => {
    api.setSignedOutHandler(() => { engine.stop().catch(() => undefined); setPhase('signed_out'); });
    api.resumeSession().then((ok) => (ok ? signedIn() : setPhase('signed_out'))).catch(() => setPhase('signed_out'));
  }, [engine, signedIn]);

  const value = useMemo<Ctx>(() => ({ newVoicemail, setNewVoicemail, phase, me, sip, engine, regs, regReasons, calls, currentAccountId, setCurrentAccountId, error, signedIn, signOut, reload, setMe }),
    [newVoicemail, phase, me, sip, engine, regs, regReasons, calls, currentAccountId, error, signedIn, signOut, reload]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

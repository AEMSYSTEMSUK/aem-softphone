import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api/client';
import type { Me, SipConfig } from '../api/types';
import { CallInfo, createSipEngine, RegState, SipEngine } from '../sip';

// App-wide state: who's signed in (ONE), their company accounts, the SIP engine and its registrations / calls.

type Phase = 'starting' | 'signed_out' | 'signed_in';

interface Ctx {
  phase: Phase;
  me: Me | null;
  sip: SipConfig | null;
  engine: SipEngine;
  regs: Record<number, RegState>;
  calls: CallInfo[];
  currentAccountId: number | null;
  setCurrentAccountId: (id: number) => void;
  error: string | null;
  signedIn: () => Promise<void>;
  signOut: () => Promise<void>;
  reload: (refreshSip?: boolean) => Promise<void>;
  setMe: (m: Me) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<SipEngine>(createSipEngine());
  const engine = engineRef.current;
  const [phase, setPhase] = useState<Phase>('starting');
  const [me, setMe] = useState<Me | null>(null);
  const [sip, setSip] = useState<SipConfig | null>(null);
  const [regs, setRegs] = useState<Record<number, RegState>>({});
  const [calls, setCalls] = useState<CallInfo[]>([]);
  const [currentAccountId, setCurrentAccountId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => engine.on((e) => {
    if (e.type === 'registration') setRegs((r) => ({ ...r, [e.accountId]: e.state }));
    else setCalls((cs) => (e.call.state === 'ended' ? cs.filter((c) => c.id !== e.call.id) : [...cs.filter((c) => c.id !== e.call.id), e.call]));
  }), [engine]);

  const reload = useCallback(async (refreshSip = false) => {
    setError(null);
    try {
      const m = await api.getMe();
      setMe(m);
      setCurrentAccountId((cur) => (cur && m.accounts.some((a) => a.id === cur) ? cur : m.accounts[0]?.id ?? null));
      const s = await api.getSip(refreshSip);
      setSip(s);
      const ready = s.accounts.filter((a) => a.ready && a.username && a.password);
      await engine.start({
        wssUrl: s.wssUrl, sipDomain: s.sipDomain, iceServers: s.iceServers,
        accounts: ready.map((a) => ({ accountId: a.accountId, username: a.username as string, password: a.password as string, displayName: a.displayName, companyName: a.companyName })),
      });
      if (s.fetchError) setError(s.fetchError);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your accounts');
    }
  }, [engine]);

  const signedIn = useCallback(async () => { setPhase('signed_in'); await reload(); }, [reload]);

  const signOut = useCallback(async () => {
    await engine.stop();
    await api.logout().catch(() => undefined);
    setMe(null); setSip(null); setRegs({}); setCalls([]); setPhase('signed_out');
  }, [engine]);

  useEffect(() => {
    api.setSignedOutHandler(() => { engine.stop().catch(() => undefined); setPhase('signed_out'); });
    api.resumeSession().then((ok) => (ok ? signedIn() : setPhase('signed_out'))).catch(() => setPhase('signed_out'));
  }, [engine, signedIn]);

  const value = useMemo<Ctx>(() => ({ phase, me, sip, engine, regs, calls, currentAccountId, setCurrentAccountId, error, signedIn, signOut, reload, setMe }),
    [phase, me, sip, engine, regs, calls, currentAccountId, error, signedIn, signOut, reload]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

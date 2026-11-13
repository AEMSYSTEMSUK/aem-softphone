import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api/client';
import { deleteItem, getItem, setItem } from '../api/storage';
import type { DeskPhone } from '../api/types';
import { isDesktop } from '../desktop/bridge';
import { CallFrom, hasDeskPhone, resolveCallFrom } from '../dial/callFrom';
import { useApp } from './AppContext';

// "Call from: This computer / Desk phone" (6 Nov 2026), per company account, and the status strip for desk phone calls.
// ONE says which accounts have a desk phone; the choice itself is remembered on this device. An account with a desk phone
// starts on it, so only an explicit choice is stored.

export type DeskNotice = { kind: 'busy' | 'ok' | 'error'; text: string };

interface Ctx {
  ready: boolean; // ONE has answered, so modes are real. Numbers from outside wait for this.
  deskFor: (accountId: number | null | undefined) => DeskPhone | undefined;
  canChoose: (accountId: number | null | undefined) => boolean;
  modeFor: (accountId: number | null | undefined) => CallFrom;
  setMode: (accountId: number, mode: CallFrom) => void;
  notice: DeskNotice | null;
  showNotice: (n: DeskNotice | null) => void;
  deskDial: (number: string, accountId: number) => Promise<void>;
}

const CallFromCtx = createContext<Ctx | null>(null);
const prefKey = (accountId: number) => `aem.sp.callfrom.${accountId}`;
const NOTICE_MS = { busy: 25000, ok: 10000, error: 8000 };

export function CallFromProvider({ children }: { children: React.ReactNode }) {
  const { phase, me } = useApp();
  const desktop = isDesktop();
  const [phones, setPhones] = useState<Record<number, DeskPhone>>({});
  const [prefs, setPrefs] = useState<Record<number, string | null>>({});
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<DeskNotice | null>(null);
  const sending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((n: DeskNotice | null) => {
    if (timer.current) clearTimeout(timer.current);
    setNotice(n);
    if (n) timer.current = setTimeout(() => setNotice(null), NOTICE_MS[n.kind]);
  }, []);

  const accountKey = me?.accounts.map((a) => a.id).join(',') ?? '';
  useEffect(() => {
    if (phase !== 'signed_in') { setReady(false); setPhones({}); showNotice(null); return; }
    if (!accountKey) return;
    if (!desktop) { setReady(true); return; }
    let live = true;
    const ids = accountKey.split(',').map(Number);
    (async () => {
      // An older ONE has no /desk-phones: then nobody has a desk phone and this computer carries on as before.
      const [desk, stored] = await Promise.all([
        api.getDeskPhones().catch(() => ({ accounts: [] as DeskPhone[] })),
        Promise.all(ids.map((id) => getItem(prefKey(id)).catch(() => null))),
      ]);
      if (!live) return;
      setPhones(Object.fromEntries(desk.accounts.map((d) => [d.accountId, d])));
      setPrefs(Object.fromEntries(ids.map((id, i) => [id, stored[i]])));
      setReady(true);
    })();
    return () => { live = false; };
  }, [phase, accountKey, desktop, showNotice]);

  const deskFor = useCallback((id: number | null | undefined) => (id ? phones[id] : undefined), [phones]);
  const canChoose = useCallback((id: number | null | undefined) => desktop && hasDeskPhone(deskFor(id)?.status), [desktop, deskFor]);
  const modeFor = useCallback((id: number | null | undefined) => resolveCallFrom(id ? prefs[id] ?? null : null, deskFor(id)?.status, desktop), [prefs, deskFor, desktop]);

  const setMode = useCallback((accountId: number, mode: CallFrom) => {
    setPrefs((p) => ({ ...p, [accountId]: mode }));
    setItem(prefKey(accountId), mode).catch(() => deleteItem(prefKey(accountId)).catch(() => undefined));
  }, []);

  // One at a time: the phone can only ring for one number, and a repeated click or link shouldn't queue a second.
  const deskDial = useCallback(async (number: string, accountId: number) => {
    if (sending.current) return;
    sending.current = true;
    showNotice({ kind: 'busy', text: `Calling your desk phone for ${number}...` });
    try {
      const r = await api.deskDial(accountId, number);
      showNotice({ kind: 'ok', text: `Ringing your desk phone, pick up to call ${r.number}` });
    } catch (e) {
      showNotice({ kind: 'error', text: e instanceof Error ? e.message : "Your desk phone couldn't be rung" });
    } finally { sending.current = false; }
  }, [showNotice]);

  const value = useMemo<Ctx>(() => ({ ready, deskFor, canChoose, modeFor, setMode, notice, showNotice, deskDial }),
    [ready, deskFor, canChoose, modeFor, setMode, notice, showNotice, deskDial]);
  return <CallFromCtx.Provider value={value}>{children}</CallFromCtx.Provider>;
}

export function useCallFrom() {
  const c = useContext(CallFromCtx);
  if (!c) throw new Error('useCallFrom outside CallFromProvider');
  return c;
}

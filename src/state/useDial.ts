import { Linking, Platform } from 'react-native';
import { ask } from '../components/ask';
import { parseNumber } from '../dial/number';
import { cleanDialString, isEmergency } from '../sip';
import { useApp } from './AppContext';
import { useCallFrom } from './CallFromContext';

// Place a call on the right company account: the contact's company if known (spec 6 C), else the one selected. Desk phone
// mode (6 Nov 2026) asks ONE to ring the account's desk phone; this computer or a phone uses the SIP line as before.
export function useDial() {
  const { engine, currentAccountId, regs } = useApp();
  const { modeFor, deskDial, showNotice } = useCallFrom();
  return async (raw: string, accountId?: number | null) => {
    const acc = accountId || currentAccountId;
    if (acc && modeFor(acc) === 'desk') {
      const p = parseNumber(raw);
      if (!p.ok) { showNotice({ kind: 'error', text: p.reason }); return; }
      await deskDial(p.number, acc);
      return;
    }
    const n = cleanDialString(raw);
    if (!n) { ask('Check the number', 'That doesn\'t look like a number we can dial.'); return; }
    // Spec 4.4 (Ofcom): on a phone, 999/112 go through the native dialler (GSM, with location) - never VoIP first.
    if (isEmergency(n) && Platform.OS !== 'web') { await Linking.openURL(`tel:${n}`); return; }
    if (!acc) { ask('No account', 'You have no company accounts yet - ask AEM.'); return; }
    if (regs[acc] !== 'registered') { ask('Not connected', 'That account is not connected to the phone system yet.'); return; }
    try { await engine.call(acc, n); } catch (e) { ask('Call failed', e instanceof Error ? e.message : 'Could not start the call'); }
  };
}

import { Alert, Linking, Platform } from 'react-native';
import { cleanDialString, isEmergency } from '../sip';
import { useApp } from './AppContext';

// Place a call on the right company account: the contact's company if known (spec 6 C), else the one selected.
export function useDial() {
  const { engine, currentAccountId, regs } = useApp();
  return async (raw: string, accountId?: number | null) => {
    const n = cleanDialString(raw);
    if (!n) { Alert.alert('Check the number', 'That doesn\'t look like a number we can dial.'); return; }
    // Spec 4.4 (Ofcom): on a phone, 999/112 go through the native dialler (GSM, with location) - never VoIP first.
    if (isEmergency(n) && Platform.OS !== 'web') { await Linking.openURL(`tel:${n}`); return; }
    const acc = accountId || currentAccountId;
    if (!acc) { Alert.alert('No account', 'You have no company accounts yet - ask AEM.'); return; }
    if (regs[acc] !== 'registered') { Alert.alert('Not connected', 'That account is not connected to the phone system yet.'); return; }
    try { await engine.call(acc, n); } catch (e) { Alert.alert('Call failed', e instanceof Error ? e.message : 'Could not start the call'); }
  };
}

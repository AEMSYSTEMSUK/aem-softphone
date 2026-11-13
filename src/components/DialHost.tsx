import React, { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { bringForward, DialRequest, onDialRequest } from '../desktop/bridge';
import { planOutsideDial } from '../dial/callFrom';
import { useApp } from '../state/AppContext';
import { useCallFrom } from '../state/CallFromContext';
import { useDial } from '../state/useDial';
import { colors, s } from './theme';

const ERRORS: Record<string, string> = {
  no_selection: 'Select a number first, then press the shortcut',
  not_number: "That isn't a phone number",
  copy_failed: "Couldn't read the selection. Copy the number and paste it into the Keypad",
};

// Numbers from outside the app (tel: and callto: links, the hotkey), and the desk phone status strip. Desk phone mode sends
// straight away, because the person still has to pick up the handset. This computer would start the call at once, so it
// asks first. Anything that isn't a number only ever shows a message.
export default function DialHost() {
  const { phase, currentAccountId, me } = useApp();
  const { ready, modeFor, notice, showNotice, deskDial } = useCallFrom();
  const dial = useDial();
  const [confirm, setConfirm] = useState<string | null>(null);

  const handle = (r: DialRequest) => {
    if (r.error) { showNotice({ kind: 'error', text: ERRORS[r.error] || ERRORS.not_number }); return; }
    if (!currentAccountId) { showNotice({ kind: 'error', text: 'You have no company accounts yet - ask AEM' }); return; }
    const plan = planOutsideDial(r.text, modeFor(currentAccountId));
    if (plan.action === 'message') showNotice({ kind: 'error', text: plan.text });
    else if (plan.action === 'send') deskDial(plan.number, currentAccountId);
    else { setConfirm(plan.number); bringForward(); }
  };
  const latest = useRef(handle);
  latest.current = handle;

  useEffect(() => {
    if (phase !== 'signed_in' || !ready) return undefined;
    return onDialRequest((r) => latest.current(r));
  }, [phase, ready]);

  const acc = me?.accounts.find((a) => a.id === currentAccountId);
  const tint = notice?.kind === 'error' ? colors.red : notice?.kind === 'ok' ? colors.green : colors.brand;
  return (
    <>
      {notice && (
        <TouchableOpacity onPress={() => showNotice(null)} accessibilityRole="alert" style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 50, padding: 12, borderRadius: 8, backgroundColor: tint }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>{notice.text}</Text>
        </TouchableOpacity>
      )}
      {confirm && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 60, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={s.card}>
            <Text style={s.h2}>Call {confirm}?</Text>
            <Text style={[s.muted, { marginTop: 4, marginBottom: 14 }]}>From this computer{acc ? ` as ${acc.companyName}` : ''}</Text>
            <View style={s.row}>
              <TouchableOpacity style={[s.btnGhost, { flex: 1, marginRight: 8 }]} onPress={() => setConfirm(null)} accessibilityRole="button"><Text style={s.btnGhostText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={() => { const n = confirm; setConfirm(null); dial(n); }} accessibilityRole="button"><Text style={s.btnText}>Call</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </>
  );
}

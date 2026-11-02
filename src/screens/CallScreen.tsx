import React, { useEffect, useState } from 'react';
import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as api from '../api/client';
import { cleanDialString, type CallInfo } from '../sip';
import { colors } from '../components/theme';
import { useApp } from '../state/AppContext';

// Ringing / in-call screen. Spec 6 A: shows the company being called (+ which line was dialled) AND who is calling.
// Milestone 2 replaces the ringing part with CallKit (iOS) / ConnectionService (Android) so it works on a locked phone.
const fmt = (ms: number) => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function Btn({ label, onPress, color = colors.card, text = colors.text }: { label: string; onPress: () => void; color?: string; text?: string }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ width: 84, height: 84, borderRadius: 42, margin: 10, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={label}>
      <Text style={{ color: text, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function CallScreen() {
  const { calls, engine } = useApp();
  const call: CallInfo | undefined = calls.find((c) => c.state === 'ringing') || calls[calls.length - 1];
  const [now, setNow] = useState(Date.now());
  const [lookedUp, setLookedUp] = useState<Record<string, string | null>>({});
  const [keypad, setKeypad] = useState(false);
  const [xfer, setXfer] = useState<string | null>(null); // transfer target being typed (null = closed)

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // No caller name from voip1's header? Ask ONE (phone book / customers).
  useEffect(() => {
    if (!call || call.remoteName || call.id in lookedUp) return;
    setLookedUp((m) => ({ ...m, [call.id]: null }));
    api.callerName(call.remoteNumber, call.accountId).then((r) => setLookedUp((m) => ({ ...m, [call.id]: r.name ? `${r.name}${r.company ? ` (${r.company})` : ''}` : null }))).catch(() => undefined);
  }, [call, lookedUp]);

  if (!call) return null;
  const name = call.remoteName || lookedUp[call.id] || null;
  const ringingIn = call.state === 'ringing' && call.direction === 'in';
  const stateText = ringingIn ? 'Incoming call' : call.state === 'connecting' ? 'Calling...' : call.held ? 'On hold' : call.startedAt ? fmt(now - call.startedAt) : '';

  return (
    <Modal visible animationType="slide" onRequestClose={() => undefined}>
      <View style={{ flex: 1, backgroundColor: colors.brandDark, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 60 }}>
        <View style={{ alignItems: 'center', paddingHorizontal: 24 }}>
          <Text style={{ color: '#cfe0f5', fontSize: 15, fontWeight: '600' }}>{call.companyName}{call.dialledLine ? ` - ${call.dialledLine}` : ''}</Text>
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '700', marginTop: 18, textAlign: 'center' }}>{name || call.remoteNumber}</Text>
          {name && <Text style={{ color: '#cfe0f5', fontSize: 17, marginTop: 4 }}>{call.remoteNumber}</Text>}
          <Text style={{ color: '#cfe0f5', marginTop: 12 }}>{stateText}</Text>
        </View>

        {keypad && !ringingIn && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 300, justifyContent: 'center' }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
              <TouchableOpacity key={k} onPress={() => engine.sendDtmf(call.id, k)} style={{ width: 70, height: 56, margin: 6, borderRadius: 10, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 22 }}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {xfer !== null && !ringingIn && (
          <View style={{ width: 300, alignItems: 'center' }}>
            <Text style={{ color: '#cfe0f5', marginBottom: 8 }}>Transfer to an extension (e.g. 201) or a number</Text>
            <TextInput value={xfer} onChangeText={setXfer} keyboardType="phone-pad" autoFocus placeholder="201"
              placeholderTextColor="#9fb3cc" accessibilityLabel="Transfer to"
              style={{ width: 220, fontSize: 24, color: '#fff', borderBottomWidth: 1, borderBottomColor: '#cfe0f5', textAlign: 'center', paddingVertical: 6 }} />
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <Btn label="Cancel" onPress={() => setXfer(null)} />
              <Btn label="Transfer" color={colors.green} text="#fff" onPress={() => {
                const t = cleanDialString(xfer);
                if (!t) return;
                engine.transfer(call.id, t);
                setXfer(null);
              }} />
            </View>
          </View>
        )}

        {ringingIn ? (
          <View style={{ flexDirection: 'row' }}>
            <Btn label="Decline" color={colors.red} text="#fff" onPress={() => engine.hangup(call.id)} />
            <Btn label="Answer" color={colors.green} text="#fff" onPress={() => engine.answer(call.id)} />
          </View>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row' }}>
              <Btn label={call.muted ? 'Unmute' : 'Mute'} onPress={() => engine.setMuted(call.id, !call.muted)} />
              <Btn label={call.held ? 'Resume' : 'Hold'} onPress={() => engine.setHeld(call.id, !call.held)} />
              <Btn label="Keypad" onPress={() => { setXfer(null); setKeypad((k) => !k); }} />
            </View>
            <View style={{ flexDirection: 'row' }}>
              <Btn label="Transfer" onPress={() => { setKeypad(false); setXfer((x) => (x === null ? '' : null)); }} />
              <Btn label="End" color={colors.red} text="#fff" onPress={() => engine.hangup(call.id)} />
            </View>
            {call.endReason === 'transfer failed' && <Text style={{ color: '#ffd2d2', marginTop: 6 }}>Transfer failed - the call is still with you</Text>}
          </View>
        )}
      </View>
    </Modal>
  );
}

import React, { useEffect, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import * as api from '../api/client';
import type { CallInfo } from '../sip';
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
              <Btn label="Keypad" onPress={() => setKeypad((k) => !k)} />
            </View>
            <Btn label="End" color={colors.red} text="#fff" onPress={() => engine.hangup(call.id)} />
            <Text style={{ color: '#cfe0f5', fontSize: 12, marginTop: 6 }}>Transfer, Move to my other device: next milestone</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

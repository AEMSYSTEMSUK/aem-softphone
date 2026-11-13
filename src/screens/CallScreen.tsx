import React, { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ColleagueList from '../components/ColleagueList';
import * as api from '../api/client';
import { cleanDialString, type CallInfo } from '../sip';
import * as audio from '../audio';
import { colors } from '../components/theme';
import { useApp } from '../state/AppContext';
import { MOVE_CODE } from '../sip/move';

// Ringing / in-call screen. Spec 6 A: shows the company being called (+ which line was dialled) AND who is calling.
// 3 Nov 2026: audio output (phone / speaker / headset / Bluetooth), call waiting (answer and hold the first call, swap),
// attended transfer ("Talk first": consult, then Complete) next to blind transfer ("Transfer now").
const fmt = (ms: number) => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function Btn({ label, onPress, color = colors.card, text = colors.text, disabled = false, small = false }: { label: string; onPress: () => void; color?: string; text?: string; disabled?: boolean; small?: boolean }) {
  const size = small ? 68 : 84;
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} style={{ width: size, height: size, borderRadius: size / 2, margin: 8, backgroundColor: color, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }} accessibilityLabel={label}>
      <Text style={{ color: text, fontWeight: '700', fontSize: small ? 12 : 14, textAlign: 'center' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function useAudioState() {
  const [st, setSt] = useState(audio.store.state);
  useEffect(() => audio.store.subscribe(setSt), []);
  return st;
}

export default function CallScreen() {
  const { calls, engine } = useApp();
  const [now, setNow] = useState(Date.now());
  const [lookedUp, setLookedUp] = useState<Record<string, string | null>>({});
  const [keypad, setKeypad] = useState(false);
  const [xfer, setXfer] = useState<string | null>(null); // transfer target being typed (null = closed)
  const [consult, setConsult] = useState<{ callerId: string; consultId: string } | null>(null);
  const [routes, setRoutes] = useState(false);
  const au = useAudioState();

  // Which call the screen is about: a new ringing call first, then the consultation, then the newest.
  const ringingCall = calls.find((c) => c.state === 'ringing' && c.direction === 'in');
  const consultCall = consult ? calls.find((c) => c.id === consult.consultId) : undefined;
  const call: CallInfo | undefined = ringingCall || consultCall || calls.find((c) => !c.held) || calls[calls.length - 1];
  const others = calls.filter((c) => c.id !== call?.id);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // The consultation or the held caller went away: back to a normal call screen.
  useEffect(() => {
    if (consult && (!calls.some((c) => c.id === consult.consultId) || !calls.some((c) => c.id === consult.callerId))) {
      const caller = calls.find((c) => c.id === consult.callerId);
      if (caller?.held && !calls.some((c) => c.id === consult.consultId)) engine.setHeld(caller.id, false); // consult ended: caller back
      setConsult(null);
    }
  }, [calls, consult, engine]);
  // No caller name from voip1's header? Ask ONE (phone book / customers).
  useEffect(() => {
    if (!call || call.remoteName || call.id in lookedUp) return;
    setLookedUp((m) => ({ ...m, [call.id]: null }));
    api.callerName(call.remoteNumber, call.accountId).then((r) => setLookedUp((m) => ({ ...m, [call.id]: r.name ? `${r.name}${r.company ? ` (${r.company})` : ''}` : null }))).catch(() => undefined);
  }, [call, lookedUp]);

  if (!call) return null;
  const nameOf = (c: CallInfo) => c.remoteName || lookedUp[c.id] || null;
  const name = nameOf(call);
  const ringingIn = call.state === 'ringing' && call.direction === 'in';
  const waiting = ringingIn && others.length > 0; // a second call while on one
  const stateText = ringingIn ? (waiting ? 'Call waiting' : 'Incoming call') : call.state === 'connecting' ? 'Calling...' : call.held ? 'On hold' : call.startedAt ? fmt(now - call.startedAt) : '';

  const answer = () => {
    for (const o of others) if (!o.held && o.state === 'active') engine.setHeld(o.id, true); // call waiting: hold the first call
    engine.answer(call.id);
  };
  const swap = (to: CallInfo) => {
    for (const c of calls) if (c.id !== to.id && !c.held && c.state === 'active') engine.setHeld(c.id, true);
    engine.setHeld(to.id, false);
  };
  const transferNow = () => {
    const t = cleanDialString(xfer || ''); if (!t) return;
    engine.transfer(call.id, t); setXfer(null);
  };
  const talkFirst = async () => {
    const t = cleanDialString(xfer || ''); if (!t) return;
    const callerId = call.id;
    engine.setHeld(callerId, true);
    try { const consultId = await engine.call(call.accountId, t); setConsult({ callerId, consultId }); setXfer(null); }
    catch { engine.setHeld(callerId, false); }
  };
  const routeLabel = au.selected ? audio.ROUTE_LABEL[au.selected] : 'Audio';
  const pickRoute = () => {
    const rs = au.routes.length ? au.routes : (['EARPIECE', 'SPEAKER_PHONE'] as audio.Route[]);
    if (rs.length <= 2) { const next = rs.find((r) => r !== au.selected) || 'SPEAKER_PHONE'; audio.setRoute(next).catch(() => undefined); }
    else setRoutes((v) => !v);
  };
  const showAudio = Platform.OS !== 'web';

  return (
    <Modal visible animationType="slide" onRequestClose={() => undefined}>
      <View style={{ flex: 1, backgroundColor: colors.brandDark, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 48 }}>
        <View style={{ alignItems: 'center', paddingHorizontal: 24 }}>
          {consult && consultCall && <Text style={{ color: '#ffe8a3', fontWeight: '700', marginBottom: 8 }}>Talking first - the caller is on hold</Text>}
          <Text style={{ color: '#cfe0f5', fontSize: 15, fontWeight: '600' }}>{call.companyName}{call.dialledLine ? ` - ${call.dialledLine}` : ''}</Text>
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '700', marginTop: 14, textAlign: 'center' }}>{name || call.remoteNumber}</Text>
          {name && <Text style={{ color: '#cfe0f5', fontSize: 17, marginTop: 4 }}>{call.remoteNumber}</Text>}
          <Text style={{ color: '#cfe0f5', marginTop: 10 }}>{stateText}</Text>
          {call.endReason === 'transfer failed' && <Text style={{ color: '#ffd2d2', marginTop: 6 }}>Transfer failed - the call is still with you</Text>}
          {others.map((o) => (
            <TouchableOpacity key={o.id} onPress={() => !ringingIn && !consult && swap(o)} disabled={ringingIn || !!consult} style={{ marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#ffffff1f' }}>
              <Text style={{ color: '#fff' }}>{o.held ? 'On hold' : o.state === 'ringing' ? 'Ringing' : 'Connected'}: {nameOf(o) || o.remoteNumber}{!ringingIn && o.held && !consult ? '  - tap to swap' : ''}</Text>
            </TouchableOpacity>
          ))}
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
          <View style={{ width: 320, alignItems: 'center' }}>
            {/* 13 Nov 2026: one tap - voip1 wakes the person's other device(s) and rings them; this one stays quiet. */}
            <TouchableOpacity onPress={() => { engine.transfer(call.id, MOVE_CODE); setXfer(null); }} accessibilityLabel="Move to my other device"
              style={{ marginBottom: 14, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 24, backgroundColor: colors.green }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Move to my other device</Text>
            </TouchableOpacity>
            <Text style={{ color: '#cfe0f5', marginBottom: 8, textAlign: 'center' }}>Or transfer to an extension (e.g. 201) or a number</Text>
            <TextInput value={xfer} onChangeText={setXfer} keyboardType="phone-pad" autoFocus placeholder="201"
              placeholderTextColor="#9fb3cc" accessibilityLabel="Transfer to"
              style={{ width: 220, fontSize: 24, color: '#fff', borderBottomWidth: 1, borderBottomColor: '#cfe0f5', textAlign: 'center', paddingVertical: 6 }} />
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <Btn small label="Cancel" onPress={() => setXfer(null)} />
              <Btn small label="Talk first" onPress={talkFirst} disabled={!cleanDialString(xfer)} />
              <Btn small label="Transfer now" color={colors.green} text="#fff" onPress={transferNow} disabled={!cleanDialString(xfer)} />
            </View>
            {/* 9 Nov 2026: pick a colleague instead of typing - then Transfer now (blind) or Talk first (hold, speak, Complete). */}
            <Text style={{ color: '#cfe0f5', marginTop: 12, marginBottom: 4, alignSelf: 'flex-start' }}>Or pick a colleague</Text>
            <ScrollView style={{ maxHeight: 220, alignSelf: 'stretch' }}>
              <ColleagueList dark accountId={call.accountId} selected={xfer} onPick={(c) => setXfer(c.extension)} />
            </ScrollView>
          </View>
        )}

        {routes && showAudio && !ringingIn && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
            {au.routes.map((r) => (
              <TouchableOpacity key={r} onPress={() => { audio.setRoute(r).catch(() => undefined); setRoutes(false); }}
                style={{ margin: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: r === au.selected ? '#ffffff55' : '#ffffff22' }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{audio.ROUTE_LABEL[r]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {ringingIn ? (
          <View style={{ alignItems: 'center' }}>
            {waiting && <Text style={{ color: '#cfe0f5', marginBottom: 6 }}>Answering puts your current call on hold</Text>}
            <View style={{ flexDirection: 'row' }}>
              <Btn label="Decline" color={colors.red} text="#fff" onPress={() => engine.hangup(call.id)} />
              <Btn label="Answer" color={colors.green} text="#fff" onPress={answer} />
            </View>
          </View>
        ) : consult && consultCall ? (
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row' }}>
              <Btn label={call.muted ? 'Unmute' : 'Mute'} onPress={() => engine.setMuted(call.id, !call.muted)} />
              {showAudio && <Btn label={routeLabel} onPress={pickRoute} />}
            </View>
            <View style={{ flexDirection: 'row' }}>
              <Btn label="Back to caller" onPress={() => engine.hangup(consult.consultId)} />
              <Btn label="Complete transfer" color={colors.green} text="#fff" disabled={consultCall.state !== 'active'} onPress={() => engine.attendedTransfer(consult.callerId, consult.consultId)} />
            </View>
            {consultCall.state !== 'active' && <Text style={{ color: '#cfe0f5', fontSize: 12 }}>Complete transfer works once they answer</Text>}
          </View>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row' }}>
              <Btn label={call.muted ? 'Unmute' : 'Mute'} onPress={() => engine.setMuted(call.id, !call.muted)} />
              <Btn label={call.held ? 'Resume' : 'Hold'} onPress={() => engine.setHeld(call.id, !call.held)} />
              <Btn label="Keypad" onPress={() => { setXfer(null); setRoutes(false); setKeypad((k) => !k); }} />
            </View>
            <View style={{ flexDirection: 'row' }}>
              {showAudio && <Btn label={routeLabel} onPress={pickRoute} />}
              <Btn label="Transfer" disabled={call.state !== 'active'} onPress={() => { setKeypad(false); setRoutes(false); setXfer((x) => (x === null ? '' : null)); }} />
              <Btn label="End" color={colors.red} text="#fff" onPress={() => engine.hangup(call.id)} />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

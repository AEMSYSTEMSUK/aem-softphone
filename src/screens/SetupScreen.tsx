import React, { useEffect, useState } from 'react';
import { Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as audio from '../audio';
import * as push from '../push';
import { colors, s } from '../components/theme';
import { useApp } from '../state/AppContext';
import { lineHealth } from '../state/lineStatus';
import { setItem } from '../api/storage';

export const SETUP_DONE_KEY = 'aem.sp.setupDone';

// #230 first-run setup (3 Nov 2026): shown after the first sign-in, and from Accounts > "Check my setup". Is each company
// line set up on the phone system and connected, is the microphone allowed, and will calls ring when the app is closed.
// Every problem says what to do next.
function Item({ ok, warn, title, detail, action }: { ok: boolean; warn?: boolean; title: string; detail?: string | null; action?: { label: string; onPress: () => void } }) {
  const c = ok ? colors.green : warn ? colors.amber : colors.red;
  return (
    <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: c }]}>
      <Text style={[s.h2, { color: c }]}>{ok ? '✓ ' : warn ? '! ' : '✗ '}{title}</Text>
      {detail ? <Text style={[s.muted, { marginTop: 4 }]}>{detail}</Text> : null}
      {action && <TouchableOpacity onPress={action.onPress} style={[s.btnGhost, { marginTop: 10, paddingVertical: 8 }]}><Text style={s.btnGhostText}>{action.label}</Text></TouchableOpacity>}
    </View>
  );
}

export default function SetupScreen({ onDone }: { onDone: () => void }) {
  const { me, sip, regs, regReasons, engine, reload, error } = useApp();
  const [mic, setMic] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { audio.requestMic().then(setMic).catch(() => setMic(false)); }, []);

  const accounts = me?.accounts || [];
  const lines = accounts.map((a) => ({ a, h: lineHealth(sip?.accounts.find((x) => x.accountId === a.id), regs[a.id], regReasons[a.id]) }));
  const allOk = lines.length > 0 && lines.every((l) => l.h.ok) && mic !== false;
  const web = Platform.OS === 'web';
  const pushText = push.pushReady()
    ? { ok: true, title: 'Rings when the app is closed', detail: null }
    : web
      ? { ok: false, title: 'Keep the phone window open', detail: 'The desktop phone rings while it is running - it can sit minimised.' }
      : Platform.OS === 'ios'
        ? { ok: false, title: 'Rings only while the app is open (for now)', detail: 'Ringing on a locked iPhone comes with the App Store version.' }
        : { ok: false, title: 'Rings only while the app is open (for now)', detail: "This test version can't ring on a locked phone yet - keep the app open. AEM will send an update." };

  const finish = async () => { await setItem(SETUP_DONE_KEY, '1').catch(() => undefined); onDone(); };
  const retry = async () => { setBusy(true); try { await reload(true); } finally { setBusy(false); } };
  const micAsk = () => { audio.requestMic().then(setMic).catch(() => setMic(false)); };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={busy} onRefresh={retry} />}>
      <Text style={s.h1}>Set up your phone</Text>
      <Text style={[s.muted, { marginBottom: 14 }]}>Signed in as {me?.user.name} ({me?.user.email})</Text>
      {error && <Item ok={false} title="Couldn't load your lines" detail={`${error}. Check this device is online, then try again.`} action={{ label: busy ? 'Trying...' : 'Try again', onPress: retry }} />}
      {engine.note && <Item ok={false} warn title="Practice mode" detail={`${engine.note}. Calls are simulated in this build.`} />}

      <Text style={[s.small, { marginTop: 6, marginBottom: 6 }]}>YOUR COMPANY LINES</Text>
      {!accounts.length && <Item ok={false} title="No company lines yet" detail="Your login works, but AEM hasn't given it a phone line yet. Ask AEM, then check again." action={{ label: busy ? 'Checking...' : 'Check again', onPress: retry }} />}
      {lines.map(({ a, h }) => (
        <Item key={a.id} ok={h.ok} warn={h.title === 'Connecting...'} title={`${a.companyName} (ext ${a.extension || '-'}): ${h.title}`} detail={h.detail}
          action={!h.ok && h.title !== 'Connecting...' ? { label: busy ? 'Checking...' : 'Check again', onPress: retry } : undefined} />
      ))}

      <Text style={[s.small, { marginTop: 10, marginBottom: 6 }]}>{web ? 'THIS COMPUTER' : 'THIS PHONE'}</Text>
      <Item ok={mic === true} warn={mic === null} title={mic ? 'Microphone allowed' : mic === null ? 'Checking the microphone...' : 'Microphone blocked'}
        detail={mic === false ? (web ? 'Allow the microphone for this app (the padlock / site settings), then press the button.' : "People won't hear you. Open Settings > Apps > The One MSP Phone > Permissions and allow Microphone.") : null}
        action={mic === false ? { label: 'Ask again', onPress: micAsk } : undefined} />
      <Item ok={pushText.ok} warn={!pushText.ok} title={pushText.title} detail={pushText.detail} />

      <TouchableOpacity style={[s.btn, { marginTop: 16 }]} onPress={finish}>
        <Text style={s.btnText}>{allOk ? 'All set - start using the phone' : 'Continue anyway'}</Text>
      </TouchableOpacity>
      <Text style={[s.small, { marginTop: 10, textAlign: 'center' }]}>You can come back here from Accounts &gt; Check my setup.</Text>
    </ScrollView>
  );
}

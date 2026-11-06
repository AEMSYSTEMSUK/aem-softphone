import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getHotkey, HotkeyStatus, isDesktop, openDefaultApps, setHotkey } from '../desktop/bridge';
import { colors, s } from './theme';

// Settings on the desktop app: the shortcut that dials selected text, and where Windows picks the app for tel: links.
export default function DialAnywhereCard() {
  const [hk, setHk] = useState<HotkeyStatus | null>(null);
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { getHotkey().then((h) => { setHk(h); setValue(h?.accelerator || ''); }).catch(() => undefined); }, []);
  if (!isDesktop()) return null;

  const save = async () => {
    setSaved(false);
    const h = await setHotkey(value);
    if (!h) return;
    setHk(h);
    if (!h.error) { setValue(h.accelerator); setSaved(true); }
  };

  return (
    <View style={s.card}>
      <Text style={s.h2}>Dial from anywhere</Text>
      {hk?.supported ? (
        <>
          <Text style={[s.small, { marginBottom: 8 }]}>Select a number in any app and press this shortcut.</Text>
          <View style={s.row}>
            <TextInput value={value} onChangeText={(t) => { setValue(t); setSaved(false); }} maxLength={40} autoCorrect={false} autoCapitalize="none" accessibilityLabel="Dial shortcut" style={[s.input, { flex: 1, paddingVertical: 6, marginRight: 8 }]} onSubmitEditing={save} />
            <TouchableOpacity onPress={save} style={[s.btn, { paddingHorizontal: 16, paddingVertical: 8 }]} accessibilityRole="button"><Text style={s.btnText}>Save</Text></TouchableOpacity>
          </View>
          {hk.error ? <Text style={s.error}>{hk.error}</Text> : !hk.registered ? <Text style={s.error}>{hk.accelerator} isn't working: another app may be using it. Choose a different shortcut.</Text> : null}
          {saved && !hk.error && <Text style={{ color: colors.green, marginTop: 6 }}>Saved</Text>}
        </>
      ) : <Text style={[s.small, { marginBottom: 8 }]}>The shortcut for selected text is Windows only for now.</Text>}
      <Text style={[s.small, { marginTop: 12 }]}>To click phone numbers on web pages and in other apps, choose The One MSP Phone for TEL and CALLTO in Windows.</Text>
      <TouchableOpacity onPress={openDefaultApps} style={{ paddingVertical: 8 }} accessibilityRole="button"><Text style={{ color: colors.brand, fontWeight: '600' }}>Open Windows default apps</Text></TouchableOpacity>
    </View>
  );
}

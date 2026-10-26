import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import * as api from '../api/client';
import { colors, s, statusLabel } from './theme';
import { useApp } from '../state/AppContext';

// Spec 6 D: one DND toggle on the main screen covering all my devices (state lives in ONE; voip1 asks ONE before ringing).
// Tap = on until I turn it off / off. Long press = timed choices.
export default function DndBar() {
  const { me, setMe } = useApp();
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const on = me.settings.dnd.on;
  const st = statusLabel[me.status] || statusLabel.available;

  const set = async (mode: 'off' | 'on' | '1h' | '2h' | 'until_tomorrow') => {
    setBusy(true);
    try { setMe(await api.setDnd(mode)); } catch (e) { Alert.alert('Could not change DND', e instanceof Error ? e.message : ''); } finally { setBusy(false); }
  };
  const timed = () => Alert.alert('Do not disturb', 'Calls go where your company sends unanswered calls.', [
    { text: 'For 1 hour', onPress: () => set('1h') },
    { text: 'For 2 hours', onPress: () => set('2h') },
    { text: 'Until tomorrow 08:30', onPress: () => set('until_tomorrow') },
    { text: 'Until I turn it off', onPress: () => set('on') },
    { text: 'Cancel', style: 'cancel' },
  ]);
  const until = me.settings.dnd.until ? new Date(me.settings.dnd.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <View style={[s.row, { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: st.color, marginRight: 8 }} />
      <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>
        {st.text}{on && until ? ` until ${until}` : ''}
      </Text>
      <TouchableOpacity disabled={busy} onPress={() => set(on ? 'off' : 'on')} onLongPress={timed}
        style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: on ? colors.red : colors.bg, borderWidth: 1, borderColor: on ? colors.red : colors.border }}
        accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityHint="Long press for timed do not disturb">
        <Text style={{ color: on ? '#fff' : colors.text, fontWeight: '600' }}>DND {on ? 'on' : 'off'}</Text>
      </TouchableOpacity>
    </View>
  );
}

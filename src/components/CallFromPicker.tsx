import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { colors, s } from './theme';
import { useApp } from '../state/AppContext';
import { useCallFrom } from '../state/CallFromContext';
import type { CallFrom } from '../dial/callFrom';

// "Call from" for the selected company account. Shows nothing on phones, or where the account has no desk phone: then
// there is no choice to make.
export default function CallFromPicker() {
  const { currentAccountId } = useApp();
  const { canChoose, deskFor, modeFor, setMode } = useCallFrom();
  if (!currentAccountId || !canChoose(currentAccountId)) return null;
  const mode = modeFor(currentAccountId);
  const offline = deskFor(currentAccountId)?.status === 'offline';
  const chip = (value: CallFrom, label: string) => (
    <TouchableOpacity key={value} onPress={() => setMode(currentAccountId, value)} accessibilityRole="button" accessibilityState={{ selected: mode === value }}
      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginLeft: 6, borderWidth: 1, borderColor: colors.brand, backgroundColor: mode === value ? colors.brand : colors.card }}>
      <Text style={{ color: mode === value ? '#fff' : colors.brand }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={[s.row, { paddingHorizontal: 16, paddingTop: 8, flexWrap: 'wrap' }]}>
      <Text style={s.small}>Call from</Text>
      {chip('desk', offline ? 'Desk phone (offline)' : 'Desk phone')}
      {chip('computer', 'This computer')}
    </View>
  );
}

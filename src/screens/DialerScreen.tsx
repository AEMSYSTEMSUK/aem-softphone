import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import AccountPicker from '../components/AccountPicker';
import { colors, s } from '../components/theme';
import { useApp } from '../state/AppContext';
import { useDial } from '../state/useDial';

const KEYS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['*', '0', '#']];

export default function DialerScreen() {
  const { me, currentAccountId } = useApp();
  const dial = useDial();
  const [num, setNum] = useState('');
  const acc = me?.accounts.find((a) => a.id === currentAccountId);

  return (
    <View style={s.screen}>
      <AccountPicker />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <Text style={[s.small, { marginBottom: 6 }]}>{acc ? `Calling as ${acc.companyName}${acc.callerId ? ` (${acc.callerId})` : ''}` : 'No account selected'}</Text>
        <Text style={{ fontSize: 32, minHeight: 44, color: colors.text, letterSpacing: 1 }} numberOfLines={1} adjustsFontSizeToFit>{num || ' '}</Text>
        <View style={{ marginTop: 16 }}>
          {KEYS.map((row) => (
            <View key={row.join('')} style={s.row}>
              {row.map((k) => (
                <TouchableOpacity key={k} onPress={() => setNum((n) => (n + k).slice(0, 20))} onLongPress={() => k === '0' && setNum((n) => (n + '+').slice(0, 20))}
                  style={{ width: 76, height: 76, margin: 8, borderRadius: 38, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                  accessibilityLabel={`Key ${k}`}>
                  <Text style={{ fontSize: 28, color: colors.text }}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
        <View style={[s.row, { marginTop: 12 }]}>
          <View style={{ width: 76, margin: 8 }} />
          <TouchableOpacity onPress={() => dial(num)} disabled={!num}
            style={{ width: 76, height: 76, margin: 8, borderRadius: 38, backgroundColor: num ? colors.green : colors.border, alignItems: 'center', justifyContent: 'center' }}
            accessibilityLabel="Call">
            <Text style={{ fontSize: 16, color: '#fff', fontWeight: '700' }}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setNum((n) => n.slice(0, -1))} onLongPress={() => setNum('')} style={{ width: 76, height: 76, margin: 8, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Delete">
            <Text style={{ fontSize: 18, color: colors.muted }}>⌫</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

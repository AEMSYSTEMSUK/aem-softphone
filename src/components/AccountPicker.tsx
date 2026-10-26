import React from 'react';
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { colors } from './theme';
import { useApp } from '../state/AppContext';

// Which company account an outgoing call uses (its caller ID goes with it - voip1 sets CLI per customer context).
export default function AccountPicker() {
  const { me, currentAccountId, setCurrentAccountId, regs } = useApp();
  if (!me || me.accounts.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, paddingHorizontal: 12, paddingVertical: 8 }}>
      {me.accounts.map((a) => {
        const sel = a.id === currentAccountId;
        return (
          <TouchableOpacity key={a.id} onPress={() => setCurrentAccountId(a.id)}
            style={{ marginRight: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: sel ? colors.brand : colors.card, borderWidth: 1, borderColor: sel ? colors.brand : colors.border }}>
            <Text style={{ color: sel ? '#fff' : colors.text, fontWeight: '600' }}>{regs[a.id] === 'registered' ? '' : '○ '}{a.companyName}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

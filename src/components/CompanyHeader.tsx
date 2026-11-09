import React from 'react';
import { Text, View } from 'react-native';
import { useApp } from '../state/AppContext';
import CompanyBadge from './CompanyBadge';
import { colors } from './theme';
import { APP_NAME } from '../config';

// Top bar (9 Nov 2026): the company this phone is calling as (the default account), with its logo, so staff see their
// own company rather than AEM's app name. With several companies it shows the default and "+N more".
export default function CompanyHeader() {
  const { me, currentAccountId } = useApp();
  const accounts = me?.accounts || [];
  const acc = accounts.find((a) => a.id === currentAccountId) || accounts[0];
  const others = new Set(accounts.map((a) => a.companyKey)).size - 1;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      {acc ? <CompanyBadge name={acc.companyName} logoUrl={acc.logoUrl} size={32} /> : null}
      <View style={{ flex: 1, marginLeft: acc ? 10 : 0 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }} numberOfLines={1}>{acc ? acc.companyName : APP_NAME}</Text>
        {acc && others > 0 ? <Text style={{ fontSize: 12, color: colors.muted }}>+{others} more {others === 1 ? 'company' : 'companies'}</Text> : null}
      </View>
    </View>
  );
}

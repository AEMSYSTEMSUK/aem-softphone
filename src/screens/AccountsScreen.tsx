import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as api from '../api/client';
import { colors, s, statusLabel } from '../components/theme';
import { useApp } from '../state/AppContext';
import { StubSipEngine } from '../sip';

const REG: Record<string, { text: string; color: string }> = {
  registered: { text: 'Connected', color: colors.green },
  registering: { text: 'Connecting...', color: colors.amber },
  failed: { text: 'Connection failed', color: colors.red },
  unregistered: { text: 'Not connected', color: colors.muted },
};

// Spec: several company accounts signed in at once on one handset. Each shows its company, extension, whether its SIP
// line is connected, and its own DND (spec 6 D: per company account or all at once).
export default function AccountsScreen() {
  const { me, sip, regs, engine, reload, signOut, currentAccountId, setCurrentAccountId, setMe, error } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => { setRefreshing(true); await reload(true); setRefreshing(false); };

  const toggleDnd = async (accountId: number, on: boolean) => {
    try { setMe(await api.setDnd(on ? 'off' : 'on', accountId)); } catch (e) { Alert.alert('Could not change DND', e instanceof Error ? e.message : ''); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={s.h1}>{me?.user.name}</Text>
      <Text style={[s.muted, { marginBottom: 12 }]}>{me?.user.email}</Text>
      {engine.note && <Text style={[s.card, { color: colors.amber }]}>{engine.note}</Text>}
      {error && <Text style={s.error}>{error}</Text>}
      {!me?.accounts.length && <Text style={s.muted}>No company accounts yet - AEM adds them in ONE.</Text>}
      {me?.accounts.map((a) => {
        const sa = sip?.accounts.find((x) => x.accountId === a.id);
        const reg = REG[regs[a.id] || 'unregistered'];
        const st = statusLabel[a.status] || statusLabel.available;
        const selected = a.id === currentAccountId;
        return (
          <TouchableOpacity key={a.id} style={[s.card, selected && { borderColor: colors.brand, borderWidth: 2 }]} onPress={() => setCurrentAccountId(a.id)}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.h2}>{a.companyName}</Text>
                <Text style={s.muted}>{a.label !== a.companyName ? `${a.label} · ` : ''}ext {a.extension || '-'}{a.callerId ? ` · shows ${a.callerId}` : ''}</Text>
              </View>
              {selected && <Text style={{ color: colors.brand, fontWeight: '600' }}>Default</Text>}
            </View>
            <View style={[s.row, { marginTop: 8 }]}>
              <Text style={{ color: reg.color, flex: 1 }}>● {reg.text}{sa && !sa.ready && sa.reason ? ` - ${sa.reason}` : ''}</Text>
              <Text style={{ color: st.color, marginRight: 10 }}>{st.text}</Text>
              <TouchableOpacity onPress={() => toggleDnd(a.id, a.dnd.on)} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: a.dnd.on ? colors.red : colors.border }}>
                <Text style={{ color: a.dnd.on ? colors.red : colors.text }}>DND {a.dnd.on ? 'on' : 'off'}</Text>
              </TouchableOpacity>
            </View>
            {engine instanceof StubSipEngine && (
              <TouchableOpacity style={{ marginTop: 8 }} onPress={() => engine.simulateIncoming(a.id, '01924263370', 'Test caller', `${a.companyName} - main line`)}>
                <Text style={{ color: colors.brand }}>Simulate an incoming call</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity style={[s.btnGhost, { marginTop: 20 }]} onPress={() => Alert.alert('Sign out?', 'Calls stop ringing on this device until you sign in again. To stop calls for a while, use DND instead.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => { signOut(); } },
      ])}>
        <Text style={s.btnGhostText}>Sign out of this device</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

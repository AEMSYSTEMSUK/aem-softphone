import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/state/AppContext';
import DndBar from './src/components/DndBar';
import { colors } from './src/components/theme';
import LoginScreen from './src/screens/LoginScreen';
import AccountsScreen from './src/screens/AccountsScreen';
import DialerScreen from './src/screens/DialerScreen';
import ContactsScreen from './src/screens/ContactsScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import VoicemailScreen from './src/screens/VoicemailScreen';
import CallScreen from './src/screens/CallScreen';
import CallListScreen from './src/screens/CallListScreen';
import DialHost from './src/components/DialHost';
import { CallFromProvider } from './src/state/CallFromContext';
import { isDesktop } from './src/desktop/bridge';
import SetupScreen, { SETUP_DONE_KEY } from './src/screens/SetupScreen';
import { getItem } from './src/api/storage';
import { setupOpener } from './src/state/setupOpener';

// Plain state tabs (no router) so the same tree runs unchanged in the Electron shell (web export).
const TABS = [
  { key: 'dial', label: 'Keypad', C: DialerScreen },
  { key: 'contacts', label: 'Contacts', C: ContactsScreen },
  { key: 'history', label: 'Recents', C: HistoryScreen },
  { key: 'voicemail', label: 'Voicemail', C: VoicemailScreen },
  { key: 'calllist', label: 'Call list', C: CallListScreen }, // desktop only (Shell)
  { key: 'accounts', label: 'Accounts', C: AccountsScreen },
] as const;

function Shell() {
  const { phase, calls, newVoicemail } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('dial');
  const [setup, setSetup] = useState(false);
  // First run after sign-in (3 Nov 2026): the setup check until the person has been through it once on this device.
  useEffect(() => {
    if (phase !== 'signed_in') return;
    getItem(SETUP_DONE_KEY).then((v) => { if (!v) setSetup(true); }).catch(() => undefined);
  }, [phase]);
  useEffect(() => setupOpener.set(() => setSetup(true)), []);
  if (phase === 'starting') return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.brand} /></View>;
  if (phase === 'signed_out') return <LoginScreen />;
  if (setup && !calls.length) return <SetupScreen onDone={() => setSetup(false)} />;
  const tabs = TABS.filter((t) => t.key !== 'calllist' || isDesktop());
  const Active = tabs.find((t) => t.key === tab)!.C;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <DndBar />
      <View style={{ flex: 1 }}><Active /></View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
        {tabs.map((t) => (
          <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
            <Text style={{ color: tab === t.key ? colors.brand : colors.muted, fontWeight: tab === t.key ? '700' : '500', fontSize: 12 }}>{t.label}{t.key === 'voicemail' && newVoicemail > 0 ? ` (${newVoicemail})` : ''}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {calls.length > 0 && <CallScreen />}
    </View>
  );
}

export default function App() {
  return (
    <AppProvider>
      <CallFromProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }}>
          <Shell />
          <DialHost />
        </SafeAreaView>
        <StatusBar style="dark" />
      </CallFromProvider>
    </AppProvider>
  );
}

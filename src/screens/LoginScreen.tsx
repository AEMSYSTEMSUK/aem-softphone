import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as api from '../api/client';
import { APP_NAME, APP_SCHEME, SSO_RETURN_URL } from '../config';
import { colors, s } from '../components/theme';
import { useApp } from '../state/AppContext';

// Spec decision 3: ONE login - Microsoft (any Microsoft 365 work account: AEM staff or a customer's, through ONE's
// multi-tenant partner app) or the app password AEM gives people without Microsoft 365.
const SSO_ERRORS: Record<string, string> = {
  no_account: 'There is no phone login for that Microsoft account - ask AEM to add you.',
  inactive: 'Your phone login is switched off - ask AEM.',
  not_configured: 'Microsoft sign-in is not set up on ONE yet - use your app password.',
  tenant_not_allowed: "Your organisation's Microsoft 365 isn't linked to AEM - use your app password.",
  wrong_tenant: 'That Microsoft account belongs to a different organisation than your phone login - ask AEM.',
  consent_required: "Your organisation hasn't approved AEM's sign-in app yet - ask AEM, or use your app password.",
  cancelled: 'Microsoft sign-in was cancelled',
};

export default function LoginScreen() {
  const { signedIn } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); await signedIn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Sign-in failed'); } finally { setBusy(false); }
  };

  const microsoft = () => withBusy(async () => {
    const r = await WebBrowser.openAuthSessionAsync(api.microsoftStartUrl(), SSO_RETURN_URL);
    if (r.type !== 'success') throw new Error('Microsoft sign-in was cancelled');
    const q = new URL(r.url.replace(`${APP_SCHEME}://`, 'https://app/')).searchParams;
    const code = q.get('code');
    if (!code) throw new Error(SSO_ERRORS[q.get('error') || ''] || `Microsoft sign-in failed (${q.get('error') || 'no code'})`);
    await api.exchangeSsoCode(code);
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.screen, { justifyContent: 'center' }]}>
      <View style={[s.pad, { maxWidth: 420, width: '100%', alignSelf: 'center' }]}>
        <Text style={[s.h1, { color: colors.brand, marginBottom: 4 }]}>{APP_NAME}</Text>
        <Text style={[s.muted, { marginBottom: 24 }]}>Sign in with your ONE phone login.</Text>

        <TouchableOpacity style={s.btn} onPress={microsoft} disabled={busy} accessibilityRole="button">
          <Text style={s.btnText}>Sign in with Microsoft</Text>
        </TouchableOpacity>

        <Text style={[s.muted, { textAlign: 'center', marginVertical: 18 }]}>or with an app password</Text>

        <TextInput style={[s.input, { marginBottom: 10 }]} placeholder="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={[s.input, { marginBottom: 14 }]} placeholder="App password" secureTextEntry autoCapitalize="none" value={password} onChangeText={setPassword}
          onSubmitEditing={() => withBusy(() => api.loginWithPassword(email.trim(), password))} />
        <TouchableOpacity style={s.btnGhost} disabled={busy || !email || !password} onPress={() => withBusy(() => api.loginWithPassword(email.trim(), password))}>
          <Text style={s.btnGhostText}>Sign in</Text>
        </TouchableOpacity>

        {busy && <ActivityIndicator style={{ marginTop: 16 }} color={colors.brand} />}
        {err && <Text style={s.error}>{err}</Text>}
        <Text style={[s.small, { marginTop: 24 }]}>No app password? Ask AEM - it's created in ONE and shown once.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

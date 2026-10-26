import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import * as api from '../api/client';
import type { Contact } from '../api/types';
import { colors, s } from '../components/theme';
import { useApp } from '../state/AppContext';
import { useDial } from '../state/useDial';

const SOURCE: Record<Contact['source'], string> = { one: 'ONE phone book', m365: 'Microsoft 365', customers: 'Customer', phone: 'Phone' };

// Spec 6 C: phone contacts (on the device, with permission) + ONE's phone book + Microsoft 365 directory (via ONE, no
// extra Microsoft login on the phone), merged and labelled by source. A contact's call goes out on its company account.
async function phoneContacts(q: string): Promise<Contact[]> {
  if (Platform.OS === 'web' || q.length < 2) return [];
  const perm = await Contacts.requestPermissionsAsync();
  if (perm.status !== 'granted') return [];
  const r = await Contacts.getContactsAsync({ name: q, fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Company], pageSize: 50 });
  return r.data.map((c) => ({
    id: `phone:${c.id}`, name: c.name || 'Unknown', company: c.company || null, email: null, source: 'phone' as const, accountId: null,
    numbers: (c.phoneNumbers || []).filter((p) => p.number).map((p) => ({ label: p.label || 'Phone', number: String(p.number) })),
  })).filter((c) => c.numbers.length);
}

export default function ContactsScreen() {
  const { me } = useApp();
  const dial = useDial();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Contact[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true); setErr(null);
      try {
        const usePhone = me?.settings.contactSources.phone !== false;
        const [server, local] = await Promise.all([api.searchContacts(q), usePhone ? phoneContacts(q).catch(() => []) : Promise.resolve([])]);
        if (my === seq.current) setItems([...local, ...server.items]);
      } catch (e) { if (my === seq.current) setErr(e instanceof Error ? e.message : 'Search failed'); }
      finally { if (my === seq.current) setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, me]);

  return (
    <View style={s.screen}>
      <View style={s.pad}>
        <TextInput style={s.input} placeholder="Search name, company or number" value={q} onChangeText={setQ} autoCorrect={false} clearButtonMode="while-editing" />
      </View>
      {busy && <ActivityIndicator color={colors.brand} />}
      {err && <Text style={[s.error, { paddingHorizontal: 16 }]}>{err}</Text>}
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={!busy ? <Text style={s.muted}>{q ? 'Nobody found.' : 'Type to search your contacts.'}</Text> : undefined}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.row}>
              <Text style={[s.h2, { flex: 1 }]}>{item.name}</Text>
              <Text style={s.small}>{SOURCE[item.source]}</Text>
            </View>
            {item.company && <Text style={s.muted}>{item.company}</Text>}
            {item.numbers.map((n) => (
              <TouchableOpacity key={n.label + n.number} onPress={() => dial(n.number, item.accountId)} style={[s.row, { paddingVertical: 6 }]}>
                <Text style={[s.small, { width: 70 }]}>{n.label}</Text>
                <Text style={{ color: colors.brand, fontSize: 16 }}>{n.number}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      />
    </View>
  );
}

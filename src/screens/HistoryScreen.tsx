import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as api from '../api/client';
import type { HistoryItem } from '../api/types';
import { colors, s } from '../components/theme';
import { useApp } from '../state/AppContext';
import { useDial } from '../state/useDial';

const RESULT: Record<HistoryItem['result'], { text: string; color: string }> = {
  outgoing: { text: 'Outgoing', color: colors.muted },
  answered: { text: 'Answered', color: colors.green },
  answered_elsewhere: { text: 'Answered by a colleague', color: colors.muted },
  voicemail: { text: 'Voicemail', color: colors.amber },
  missed: { text: 'Missed', color: colors.red },
};
const dur = (sec: number) => (sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '');

// From ONE's call log (voip1's aem-calls.log, pulled every 10 minutes) - so the newest calls can be up to ~10 min late.
export default function HistoryScreen() {
  const dial = useDial();
  const { me } = useApp();
  const [missedOnly, setMissedOnly] = useState(false);
  const [accountId, setAccountId] = useState<number | null>(null); // null = all companies
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setItems((await api.getHistory(accountId ?? undefined)).items); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load calls'); } finally { setLoading(false); }
  }, [accountId]);
  useEffect(() => { load(); }, [load]);

  const shown = missedOnly ? items.filter((i) => i.result === 'missed' || i.result === 'voicemail') : items;
  const chip = (label: string, on: boolean, press: () => void) => (
    <TouchableOpacity key={label} onPress={press} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginRight: 6, borderWidth: 1, borderColor: colors.brand, backgroundColor: on ? colors.brand : colors.card }}>
      <Text style={{ color: on ? '#fff' : colors.brand }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={s.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12 }}>
        {chip('Missed', missedOnly, () => setMissedOnly((v) => !v))}
        {(me?.accounts.length || 0) > 1 && chip('All companies', accountId === null, () => setAccountId(null))}
        {(me?.accounts.length || 0) > 1 && me?.accounts.map((a) => chip(a.companyName, accountId === a.id, () => setAccountId(a.id)))}
      </ScrollView>
      {err && <Text style={[s.error, { paddingHorizontal: 16 }]}>{err}</Text>}
      <FlatList
        data={shown}
        keyExtractor={(i) => String(i.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={!loading ? <Text style={s.muted}>{missedOnly ? 'No missed calls.' : 'No calls yet.'}</Text> : undefined}
        renderItem={({ item }) => {
          const r = RESULT[item.result];
          return (
            <TouchableOpacity style={s.card} disabled={!item.number} onPress={() => item.number && dial(item.number, item.accountId)}>
              <View style={s.row}>
                <Text style={[s.h2, { flex: 1 }]}>{item.direction === 'in' ? '↙ ' : '↗ '}{item.name || item.number || 'Withheld'}</Text>
                <Text style={s.small}>{new Date(item.startedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              <Text style={s.muted}>{item.companyName}{item.name && item.number ? ` · ${item.number}` : ''}</Text>
              <Text style={{ color: r.color, marginTop: 2 }}>{r.text}{item.result === 'answered_elsewhere' && item.answeredName ? ` (${item.answeredName})` : ''} {dur(item.talkSec)}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

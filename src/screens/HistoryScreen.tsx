import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import * as api from '../api/client';
import type { HistoryItem } from '../api/types';
import { colors, s } from '../components/theme';
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
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setItems((await api.getHistory()).items); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load calls'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={s.screen}>
      {err && <Text style={[s.error, { paddingHorizontal: 16 }]}>{err}</Text>}
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={!loading ? <Text style={s.muted}>No calls yet.</Text> : undefined}
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

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as api from '../api/client';
import type { Voicemail } from '../api/types';
import { colors, s } from '../components/theme';
import { useDial } from '../state/useDial';

const dur = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// Voicemail is pushed from voip1 to ONE (customer boxes + AEM/Fruity boxes), with the transcript ONE makes.
export default function VoicemailScreen() {
  const dial = useDial();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [items, setItems] = useState<Voicemail[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setItems((await api.getVoicemail()).items); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load voicemail'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const play = async (v: Voicemail) => {
    if (playing === v.id && status.playing) { player.pause(); return; }
    player.replace(await api.voicemailSource(v.id));
    player.play();
    setPlaying(v.id);
    setItems((xs) => xs.map((x) => (x.id === v.id ? { ...x, isNew: false } : x)));
  };

  return (
    <View style={s.screen}>
      {err && <Text style={[s.error, { paddingHorizontal: 16 }]}>{err}</Text>}
      <FlatList
        data={items}
        keyExtractor={(v) => v.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={!loading ? <Text style={s.muted}>No voicemail.</Text> : undefined}
        renderItem={({ item }) => (
          <View style={[s.card, item.isNew && { borderLeftWidth: 4, borderLeftColor: colors.brand }]}>
            <View style={s.row}>
              <Text style={[s.h2, { flex: 1 }]}>{item.callerName || item.callerNumber || 'Unknown caller'}</Text>
              <Text style={s.small}>{new Date(item.receivedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <Text style={s.muted}>{item.mailbox} · {dur(item.durationSec)}</Text>
            {item.transcript && <Text style={{ marginTop: 6, color: colors.text }} numberOfLines={4}>"{item.transcript}"</Text>}
            <View style={[s.row, { marginTop: 8 }]}>
              <TouchableOpacity onPress={() => play(item)} style={{ marginRight: 20 }}>
                <Text style={{ color: colors.brand, fontWeight: '600' }}>{playing === item.id && status.playing ? 'Pause' : 'Play'}</Text>
              </TouchableOpacity>
              {item.callerNumber && (
                <TouchableOpacity onPress={() => dial(item.callerNumber as string)}>
                  <Text style={{ color: colors.green, fontWeight: '600' }}>Call back</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

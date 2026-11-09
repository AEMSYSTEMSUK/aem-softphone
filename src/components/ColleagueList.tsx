import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import * as api from '../api/client';
import type { Colleague } from '../api/types';
import { colors } from './theme';

// 9 Nov 2026 (Andy): who else is on the phone system, and whether they're free. Used on Contacts (tap = call) and in the
// call screen's transfer panel (tap = pick them, then "Transfer now" or "Talk first"). Refreshes every 30 s while shown.
const DOT: Record<Colleague['status'], { color: string; text: string }> = {
  online: { color: colors.green, text: 'Online' },
  on_call: { color: '#e07b00', text: 'On a call' },
  ringing: { color: colors.amber, text: 'Ringing' },
  dnd: { color: colors.red, text: 'Do not disturb' },
  offline: { color: '#9aa5b1', text: 'Offline' },
  unknown: { color: colors.amber, text: 'Status unknown' },
};

export default function ColleagueList({ accountId, onPick, dark = false, selected }: { accountId?: number | null; onPick: (c: Colleague) => void; dark?: boolean; selected?: string | null }) {
  const [people, setPeople] = useState<Colleague[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const r = await api.getColleagues(accountId); setPeople(r.people); setNote(r.liveError); }
    catch (e) { setNote(e instanceof Error ? e.message : 'Could not load colleagues'); setPeople((p) => p || []); }
  }, [accountId]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const fg = dark ? '#fff' : colors.text;
  const sub = dark ? '#cfe0f5' : colors.muted;
  if (people === null) return <ActivityIndicator color={dark ? '#fff' : colors.brand} style={{ marginVertical: 8 }} />;
  return (
    <View>
      {note && <Text style={{ color: dark ? '#ffd2d2' : colors.amber, fontSize: 12, marginBottom: 4 }}>{note}</Text>}
      {!people.length && <Text style={{ color: sub }}>No colleagues on this company's phone system.</Text>}
      {people.map((p) => {
        const d = DOT[p.status];
        const sel = selected === p.extension;
        return (
          <TouchableOpacity key={p.extension} onPress={() => onPick(p)} accessibilityLabel={`${p.name || 'Extension ' + p.extension}, ${d.text}`}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: dark ? 10 : 0, borderRadius: 8, backgroundColor: sel ? (dark ? '#ffffff33' : '#e8f0fb') : 'transparent' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color, marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{p.name || `Extension ${p.extension}`}</Text>
              <Text style={{ color: sub, fontSize: 12 }}>ext {p.extension} · {d.text}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

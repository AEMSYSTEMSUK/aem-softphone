import React, { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as api from '../api/client';
import type { Me, Segment, WeekHours } from '../api/types';
import { ask } from '../components/ask';
import DialAnywhereCard from '../components/DialAnywhereCard';
import { colors, s } from '../components/theme';
import { useApp } from '../state/AppContext';
import { checkWeek, copyMondayToWeekdays, DAYS, DEFAULT_BLOCK, defaultWeek } from '../state/hours';

// Spec 6 D + C: working hours (mine, or different for one company) and which contact sources to search. State lives in
// ONE, which voip1 asks before ringing, so the hours work with the app closed. Outside them calls go to the company's
// unanswered route and the app comes back by itself at the next working period.
type Target = 'me' | number; // 'me' = my own hours, a number = one company account

function load(me: Me, target: Target) {
  if (target === 'me') return { follow: false, enabled: me.settings.hoursEnabled, week: me.settings.workingHours || defaultWeek() };
  const a = me.accounts.find((x) => x.id === target);
  return { follow: a?.hoursEnabled == null, enabled: !!a?.hoursEnabled, week: a?.workingHours || me.settings.workingHours || defaultWeek() };
}

function Row({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View style={{ paddingVertical: 6 }}>
      <View style={s.row}>
        <Text style={{ flex: 1, color: colors.text, fontSize: 16 }}>{label}</Text>
        <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
      </View>
      {hint && <Text style={s.small}>{hint}</Text>}
    </View>
  );
}

function TimeBox({ value, onChange, label }: { value: string; onChange: (t: string) => void; label: string }) {
  return (
    <TextInput value={value} onChangeText={onChange} accessibilityLabel={label} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="09:00"
      style={[s.input, { width: 76, paddingVertical: 6, textAlign: 'center' }]} />
  );
}

export default function SettingsScreen({ onDone }: { onDone: () => void }) {
  const { me, setMe } = useApp();
  const [target, setTarget] = useState<Target>('me');
  const [follow, setFollow] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [week, setWeek] = useState<WeekHours>(defaultWeek());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    const v = load(me, target);
    setFollow(v.follow); setEnabled(v.enabled); setWeek(v.week); setErr(null);
    // Only when switching between me and a company: a save must not reset what is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!me) return null;

  const setDay = (day: string, blocks: Segment[]) => setWeek((w) => ({ ...w, [day]: blocks }));
  const setBlock = (day: string, i: number, patch: Partial<Segment>) =>
    setDay(day, (week[day] || []).map((b, n) => (n === i ? { ...b, ...patch } : b)));

  const saveHours = async () => {
    const accountId = target === 'me' ? undefined : target;
    setErr(null);
    if (accountId && follow) {
      setBusy(true);
      try { setMe(await api.saveSettings({ accountId, followUser: true })); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
      return;
    }
    const r = checkWeek(week);
    if (r.error !== null) { setErr(r.error); return; }
    if (enabled && !Object.keys(r.week).length) { setErr('Add at least one day, or turn working hours off'); return; }
    setBusy(true);
    try { setMe(await api.saveSettings({ accountId, hoursEnabled: enabled, workingHours: r.week })); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
  };

  // These two save straight away, like the DND toggle.
  const saveNow = async (body: Parameters<typeof api.saveSettings>[0]) => {
    try { setMe(await api.saveSettings(body)); } catch (e) { ask('Could not save', e instanceof Error ? e.message : ''); }
  };
  const sources = me.settings.contactSources;
  const editing = target === 'me' || !follow;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <View style={[s.row, { marginBottom: 12 }]}>
        <Text style={[s.h1, { flex: 1 }]}>Settings</Text>
        <TouchableOpacity onPress={onDone} accessibilityRole="button"><Text style={{ color: colors.brand, fontWeight: '600', fontSize: 16 }}>Back</Text></TouchableOpacity>
      </View>

      <View style={s.card}>
        <Text style={s.h2}>Working hours</Text>
        <Text style={[s.small, { marginBottom: 8 }]}>Outside these hours calls stop ringing you and go where your company sends unanswered calls. You come back by yourself when your hours start.</Text>
        {me.accounts.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {([{ id: 'me' as Target, name: 'My hours' }, ...me.accounts.map((a) => ({ id: a.id as Target, name: a.companyName }))]).map((t) => (
              <TouchableOpacity key={String(t.id)} onPress={() => setTarget(t.id)} accessibilityRole="button" accessibilityState={{ selected: target === t.id }}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginRight: 6, marginBottom: 6, borderWidth: 1, borderColor: colors.brand, backgroundColor: target === t.id ? colors.brand : colors.card }}>
                <Text style={{ color: target === t.id ? '#fff' : colors.brand }}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {target !== 'me' && <Row label="Same as my hours" value={follow} onChange={setFollow} />}
        {editing && <Row label="Use working hours" value={enabled} onChange={setEnabled} />}
        {editing && enabled && DAYS.map(({ key, label }) => {
          const blocks = week[key] || [];
          return (
            <View key={key} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={s.row}>
                <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{label}</Text>
                <Switch value={blocks.length > 0} onValueChange={(on) => setDay(key, on ? [{ ...DEFAULT_BLOCK }] : [])} accessibilityLabel={`Work on ${label}`} />
              </View>
              {blocks.map((b, i) => (
                <View key={i} style={[s.row, { marginTop: 6 }]}>
                  <TimeBox value={b.start} label={`${label} start`} onChange={(t) => setBlock(key, i, { start: t })} />
                  <Text style={{ marginHorizontal: 8, color: colors.muted }}>to</Text>
                  <TimeBox value={b.end} label={`${label} end`} onChange={(t) => setBlock(key, i, { end: t })} />
                  {blocks.length > 1 && (
                    <TouchableOpacity onPress={() => setDay(key, blocks.filter((_, n) => n !== i))} style={{ marginLeft: 12 }} accessibilityRole="button">
                      <Text style={{ color: colors.red }}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {blocks.length > 0 && blocks.length < 6 && (
                <TouchableOpacity onPress={() => setDay(key, [...blocks, { start: blocks[blocks.length - 1].end, end: '17:30' }])} style={{ marginTop: 6 }} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Add a block (e.g. after lunch)</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        {editing && enabled && (
          <TouchableOpacity onPress={() => setWeek(copyMondayToWeekdays)} style={{ paddingVertical: 8 }} accessibilityRole="button">
            <Text style={{ color: colors.brand, fontWeight: '600' }}>Copy Monday to Tuesday-Friday</Text>
          </TouchableOpacity>
        )}
        {err && <Text style={s.error}>{err}</Text>}
        <TouchableOpacity style={[s.btn, { marginTop: 8 }, busy && { opacity: 0.6 }]} disabled={busy} onPress={saveHours} accessibilityRole="button">
          <Text style={s.btnText}>{busy ? 'Saving...' : 'Save hours'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.card}>
        <Row label="Off on UK bank holidays" value={me.settings.skipBankHolidays} onChange={(v) => saveNow({ skipBankHolidays: v })} />
      </View>

      <DialAnywhereCard />

      <View style={s.card}>
        <Text style={s.h2}>Search contacts in</Text>
        <Row label="ONE phone book" value={sources.one} onChange={(v) => saveNow({ contactSources: { ...sources, one: v } })} />
        <Row label="Microsoft 365" value={sources.m365} onChange={(v) => saveNow({ contactSources: { ...sources, m365: v } })} />
        <Row label="This phone's contacts" value={sources.phone} onChange={(v) => saveNow({ contactSources: { ...sources, phone: v } })} />
      </View>
    </ScrollView>
  );
}

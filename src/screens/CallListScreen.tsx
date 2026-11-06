import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { deleteItem, getItem, setItem } from '../api/storage';
import { pickSpreadsheet } from '../calllist/file';
import { buildRows, Field, guessMapping, ImportResult, looksLikeHeader, Mapping, Table } from '../calllist/parse';
import { CallEntry, CallList, EntryStatus, listKey, markEntry, newList, nextEntry, parseStored, progress, setNote } from '../calllist/store';
import AccountPicker from '../components/AccountPicker';
import CallFromPicker from '../components/CallFromPicker';
import { ask } from '../components/ask';
import { colors, s } from '../components/theme';
import { useApp } from '../state/AppContext';
import { useDial } from '../state/useDial';

// Call list (6 Nov 2026, desktop): import a spreadsheet, work down it. Kept on this computer only, per signed-in person,
// and not in ONE. Calls go out through useDial, so they follow "Call from".
const FIELDS: Array<{ key: Field; label: string }> = [
  { key: 'number', label: 'Phone number' }, { key: 'name', label: 'Name' }, { key: 'company', label: 'Company' }, { key: 'notes', label: 'Notes' },
];
const STATUS: Record<EntryStatus, { text: string; color: string }> = {
  todo: { text: 'To call', color: colors.muted },
  done: { text: 'Done', color: colors.green },
  no_answer: { text: 'No answer', color: colors.amber },
  call_back: { text: 'Call back', color: colors.brand },
};
const MARKS: EntryStatus[] = ['done', 'no_answer', 'call_back'];

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, marginRight: 6, marginBottom: 6, borderWidth: 1, borderColor: colors.brand, backgroundColor: on ? colors.brand : colors.card }}>
      <Text style={{ color: on ? '#fff' : colors.brand }} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function ImportStep({ fileName, table, onCancel, onDone }: { fileName: string; table: Table; onCancel: () => void; onDone: (r: ImportResult) => void }) {
  const [hasHeader, setHasHeader] = useState(() => looksLikeHeader(table));
  const [mapping, setMapping] = useState<Mapping>(() => guessMapping(table, looksLikeHeader(table)));
  const columns = useMemo(() => {
    const width = Math.max(...table.map((r) => r.length));
    return Array.from({ length: width }, (_, i) => (hasHeader && table[0][i]) || `Column ${i + 1}${table[hasHeader ? 1 : 0]?.[i] ? ` (${table[hasHeader ? 1 : 0][i].slice(0, 20)})` : ''}`);
  }, [table, hasHeader]);
  const result = useMemo(() => (mapping.number === null ? null : buildRows(table, mapping, hasHeader)), [table, mapping, hasHeader]);
  const header = (v: boolean) => { setHasHeader(v); setMapping(guessMapping(table, v)); };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Text style={s.h1}>Import {fileName}</Text>
      <Text style={[s.muted, { marginBottom: 12 }]}>{table.length} rows found. Say which column is which.</Text>
      <View style={s.card}>
        <View style={s.row}>
          <Text style={{ flex: 1, color: colors.text }}>First row is headings</Text>
          <Switch value={hasHeader} onValueChange={header} accessibilityLabel="First row is headings" />
        </View>
      </View>
      {FIELDS.map((f) => (
        <View key={f.key} style={s.card}>
          <Text style={[s.h2, { marginBottom: 8 }]}>{f.label}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {f.key !== 'number' && <Chip label="Not in this file" on={mapping[f.key] === null} onPress={() => setMapping((m) => ({ ...m, [f.key]: null }))} />}
            {columns.map((c, i) => <Chip key={i} label={c} on={mapping[f.key] === i} onPress={() => setMapping((m) => ({ ...m, [f.key]: i }))} />)}
          </View>
        </View>
      ))}
      {result && (
        <View style={s.card}>
          <Text style={s.h2}>{result.rows.length} numbers ready</Text>
          <Text style={s.muted}>Duplicates dropped: {result.duplicates}. Rows that can't be used: {result.rejected.length - result.duplicates}.</Text>
          {result.rejected.slice(0, 200).map((r) => (
            <Text key={r.row} style={[s.small, { marginTop: 6 }]}>Row {r.row}: {r.text} - {r.reason}</Text>
          ))}
          {result.rejected.length > 200 && <Text style={[s.small, { marginTop: 6 }]}>...and {result.rejected.length - 200} more</Text>}
        </View>
      )}
      {!result && <Text style={s.error}>Choose which column holds the phone number</Text>}
      <TouchableOpacity style={[s.btn, !result?.rows.length && { opacity: 0.5 }]} disabled={!result?.rows.length} onPress={() => result && onDone(result)} accessibilityRole="button">
        <Text style={s.btnText}>Use this list</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.btnGhost, { marginTop: 10 }]} onPress={onCancel} accessibilityRole="button"><Text style={s.btnGhostText}>Cancel</Text></TouchableOpacity>
    </ScrollView>
  );
}

export default function CallListScreen() {
  const { me } = useApp();
  const dial = useDial();
  const userId = me?.user.id;
  const [list, setList] = useState<CallList | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<{ fileName: string; table: Table } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    getItem(listKey(userId)).then((j) => { setList(parseStored(j)); setLoaded(true); }).catch(() => setLoaded(true));
  }, [userId]);

  // storage.ts keeps quiet when the browser's storage is full, so read it back rather than lose someone's notes silently.
  const save = async (next: CallList) => {
    setList(next);
    if (!userId) return;
    const json = JSON.stringify(next);
    await setItem(listKey(userId), json);
    setErr((await getItem(listKey(userId))) === json ? null : "Couldn't save the list on this computer: the latest changes will be lost when the app closes");
  };

  const importFile = async () => {
    setErr(null);
    try {
      const f = await pickSpreadsheet();
      if (!f) return;
      if (!f.table.length) { setErr('There is nothing in that file'); return; }
      setDraft(f);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't read that file"); }
  };

  const askImport = () => {
    if (!list) { importFile(); return; }
    ask('Replace this list?', `A new import replaces "${list.fileName}" and its notes.`, [
      { text: 'Cancel', style: 'cancel' }, { text: 'Replace', style: 'destructive', onPress: () => { importFile(); } },
    ]);
  };

  const remove = () => ask('Delete this list?', 'The list and your notes are removed from this computer. They can\'t be got back.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { setList(null); if (userId) deleteItem(listKey(userId)).catch(() => undefined); } },
  ]);

  const call = (e: CallEntry) => {
    if (list) save({ ...list, currentId: e.id });
    dial(e.number);
  };
  const callNext = () => {
    const n = list && nextEntry(list);
    if (n) call(n);
  };

  if (draft) {
    return <ImportStep fileName={draft.fileName} table={draft.table} onCancel={() => setDraft(null)} onDone={(r) => { save(newList(draft.fileName, r.rows)); setDraft(null); }} />;
  }
  if (!loaded) return <View style={s.screen} />;
  if (!list) {
    return (
      <View style={[s.screen, s.pad]}>
        <Text style={s.h1}>Call list</Text>
        <Text style={[s.muted, { marginVertical: 12 }]}>Import a .csv or .xlsx file and work down it. The list stays on this computer: it isn't saved in ONE.</Text>
        {err && <Text style={s.error}>{err}</Text>}
        <TouchableOpacity style={s.btn} onPress={importFile} accessibilityRole="button"><Text style={s.btnText}>Import a spreadsheet</Text></TouchableOpacity>
      </View>
    );
  }

  const p = progress(list);
  const next = nextEntry(list);
  return (
    <View style={s.screen}>
      <AccountPicker />
      <CallFromPicker />
      <View style={s.pad}>
        <View style={s.row}>
          <Text style={[s.h2, { flex: 1 }]} numberOfLines={1}>{list.fileName}</Text>
          <TouchableOpacity onPress={askImport} style={{ marginLeft: 12 }} accessibilityRole="button"><Text style={{ color: colors.brand }}>Import</Text></TouchableOpacity>
          <TouchableOpacity onPress={remove} style={{ marginLeft: 12 }} accessibilityRole="button"><Text style={{ color: colors.red }}>Delete</Text></TouchableOpacity>
        </View>
        <Text style={[s.small, { marginTop: 4 }]}>{p.worked} of {p.total} called, {p.left} left</Text>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: 6, overflow: 'hidden' }}>
          <View style={{ height: 6, width: `${p.percent}%`, backgroundColor: colors.green }} />
        </View>
        {err && <Text style={s.error}>{err}</Text>}
        <TouchableOpacity style={[s.btn, { marginTop: 10 }, !next && { opacity: 0.5 }]} disabled={!next} onPress={callNext} accessibilityRole="button">
          <Text style={s.btnText} numberOfLines={1}>{next ? `Next: ${next.name || next.company || next.number}` : 'All numbers called'}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={list.entries}
        keyExtractor={(e) => String(e.id)}
        extraData={list.currentId}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        renderItem={({ item }) => {
          const current = item.id === list.currentId;
          const st = STATUS[item.status];
          return (
            <View style={[s.card, current && { borderColor: colors.brand, borderWidth: 2 }]}>
              <TouchableOpacity onPress={() => call(item)} accessibilityRole="button" accessibilityLabel={`Call ${item.name || item.number}`}>
                <View style={s.row}>
                  <Text style={[s.h2, { flex: 1 }]} numberOfLines={1}>{item.name || item.company || item.number}</Text>
                  <Text style={{ color: st.color }}>{st.text}</Text>
                </View>
                {!!item.name && !!item.company && <Text style={s.muted} numberOfLines={1}>{item.company}</Text>}
                <Text style={{ color: colors.brand, fontSize: 16, marginTop: 2 }}>{item.number}</Text>
                {!!item.notes && <Text style={s.small}>{item.notes}</Text>}
              </TouchableOpacity>
              {!current && !!item.note && <Text style={[s.small, { marginTop: 4 }]}>Note: {item.note}</Text>}
              {!current && <TouchableOpacity onPress={() => save({ ...list, currentId: item.id })} style={{ marginTop: 4 }} accessibilityRole="button"><Text style={s.small}>Mark or add a note</Text></TouchableOpacity>}
              {current && (
                <View style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {MARKS.map((m) => <Chip key={m} label={STATUS[m].text} on={item.status === m} onPress={() => save(markEntry(list, item.id, item.status === m ? 'todo' : m))} />)}
                  </View>
                  <TextInput value={item.note} onChangeText={(t) => save(setNote(list, item.id, t))} placeholder="Add a note" maxLength={500} multiline style={[s.input, { paddingVertical: 6, fontSize: 14 }]} accessibilityLabel="Note" />
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

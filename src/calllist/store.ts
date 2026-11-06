import type { ImportedRow } from './parse.ts';

// One call list per person on this device (6 Nov 2026): stored locally, never sent to ONE.
export type EntryStatus = 'todo' | 'done' | 'no_answer' | 'call_back';

export interface CallEntry extends ImportedRow {
  id: number;
  status: EntryStatus;
  note: string;
  updatedAt: string | null;
}

export interface CallList {
  version: 1;
  fileName: string;
  importedAt: string;
  currentId: number | null;
  entries: CallEntry[];
}

export const listKey = (userId: number) => `aem.sp.calllist.${userId}`;
const NOTE_MAX = 500;

export function newList(fileName: string, rows: ImportedRow[], now = new Date()): CallList {
  const entries = rows.map((r, i) => ({ ...r, id: i + 1, status: 'todo' as const, note: '', updatedAt: null }));
  return { version: 1, fileName, importedAt: now.toISOString(), currentId: null, entries };
}

export function markEntry(list: CallList, id: number, status: EntryStatus, now = new Date()): CallList {
  return { ...list, entries: list.entries.map((e) => (e.id === id ? { ...e, status, updatedAt: now.toISOString() } : e)) };
}

export function setNote(list: CallList, id: number, note: string): CallList {
  return { ...list, entries: list.entries.map((e) => (e.id === id ? { ...e, note: note.slice(0, NOTE_MAX) } : e)) };
}

// The next one still to call after the current one, going round to the top and ending on the current one itself if it is
// the last left. Before the first call that is simply the first row. Null when none are left.
export function nextEntry(list: CallList): CallEntry | null {
  const at = list.entries.findIndex((e) => e.id === list.currentId);
  const order = [...list.entries.slice(at + 1), ...list.entries.slice(0, at + 1)];
  return order.find((e) => e.status === 'todo') ?? null;
}

export function progress(list: CallList) {
  const total = list.entries.length;
  const left = list.entries.filter((e) => e.status === 'todo').length;
  return { total, worked: total - left, left, percent: total ? Math.round(((total - left) / total) * 100) : 0 };
}

// What's in storage is only trusted once it has the right shape.
export function parseStored(json: string | null): CallList | null {
  if (!json) return null;
  try {
    const l = JSON.parse(json) as CallList;
    const ok = l?.version === 1 && Array.isArray(l.entries) && l.entries.every((e) => typeof e?.id === 'number' && typeof e.number === 'string' && ['todo', 'done', 'no_answer', 'call_back'].includes(e.status));
    return ok ? l : null;
  } catch { return null; }
}

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

// The results as a .csv to open in Excel (7 Nov 2026): the list only lives on this computer, so this is how outcomes and
// notes get back to whoever handed out the spreadsheet. A cell that starts like a formula gets a leading ' so Excel shows
// it as text instead of running it (imported names and notes are untrusted). Numbers keep their leading 0 the same way.
const RESULT_TEXT: Record<EntryStatus, string> = { todo: 'To call', done: 'Done', no_answer: 'No answer', call_back: 'Call back' };

function csvCell(v: string) {
  const t = /^[=+\-@\t\r]/.test(v) || /^0\d/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function resultsCsv(list: CallList): string {
  const rows = [['Name', 'Company', 'Number', 'Notes from file', 'Result', 'My note', 'Updated']];
  for (const e of list.entries) rows.push([e.name, e.company, e.number, e.notes, RESULT_TEXT[e.status], e.note, e.updatedAt ? e.updatedAt.slice(0, 16).replace('T', ' ') : '']);
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; // BOM so Excel reads it as UTF-8
}

export const resultsFileName = (list: CallList) =>
  `${list.fileName.replace(/\.(csv|xlsx)$/i, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'call list'} - results.csv`;

// What's in storage is only trusted once it has the right shape.
export function parseStored(json: string | null): CallList | null {
  if (!json) return null;
  try {
    const l = JSON.parse(json) as CallList;
    const ok = l?.version === 1 && Array.isArray(l.entries) && l.entries.every((e) => typeof e?.id === 'number' && typeof e.number === 'string' && ['todo', 'done', 'no_answer', 'call_back'].includes(e.status));
    return ok ? l : null;
  } catch { return null; }
}

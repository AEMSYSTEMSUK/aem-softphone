import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markEntry, newList, nextEntry, parseStored, progress, setNote } from './store.ts';

const rows = ['01', '02', '03'].map((n) => ({ name: n, company: '', number: `019242633${n}`, notes: '' }));

test('a new list has nothing worked and Next starts on its first row', () => {
  const l = newList('calls.xlsx', rows);
  assert.equal(nextEntry(l)?.id, 1);
  assert.deepEqual(progress(l), { total: 3, worked: 0, left: 3, percent: 0 });
});

test('marking counts towards progress and notes are kept and capped', () => {
  let l = setNote(newList('c', rows), 2, 'after 3pm');
  l = markEntry(l, 2, 'call_back');
  assert.equal(l.entries[1].status, 'call_back');
  assert.ok(l.entries[1].updatedAt);
  l = markEntry(l, 2, 'done');
  assert.equal(l.entries[1].note, 'after 3pm');
  assert.equal(progress(l).percent, 33);
  assert.equal(setNote(l, 1, 'x'.repeat(900)).entries[0].note.length, 500);
});

test('next number skips worked rows and goes round to the top', () => {
  let l = newList('c', rows);
  l = markEntry(l, 1, 'no_answer');
  assert.equal(nextEntry(l)?.id, 2);
  l = { ...l, currentId: 3 };
  assert.equal(nextEntry(l)?.id, 2);
  l = markEntry(l, 2, 'done');
  assert.equal(nextEntry(l)?.id, 3); // the current row is the only one left
  l = markEntry(l, 3, 'done');
  assert.equal(nextEntry(l), null);
});

test('stored data is checked before it is used', () => {
  const l = newList('c', rows);
  assert.deepEqual(parseStored(JSON.stringify(l)), l);
  assert.equal(parseStored('{not json'), null);
  assert.equal(parseStored(null), null);
  assert.equal(parseStored(JSON.stringify({ version: 1, entries: [{ id: 'x' }] })), null);
  assert.equal(parseStored(JSON.stringify({ ...l, version: 2 })), null);
});

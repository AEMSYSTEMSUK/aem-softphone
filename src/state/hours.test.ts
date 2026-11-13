import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkWeek, copyMondayToWeekdays, defaultWeek, normaliseTime } from './hours.ts';

test('normaliseTime accepts the ways people type a time', () => {
  assert.equal(normaliseTime('9:00'), '09:00');
  assert.equal(normaliseTime('09.30'), '09:30');
  assert.equal(normaliseTime('0830'), '08:30');
  assert.equal(normaliseTime('900'), '09:00');
  assert.equal(normaliseTime(' 17:30 '), '17:30');
});

test('normaliseTime rejects nonsense', () => {
  for (const t of ['', '24:00', '12:60', 'nine', '9', '12:5']) assert.equal(normaliseTime(t), null, t);
});

test('checkWeek tidies times, sorts blocks and drops empty days', () => {
  const r = checkWeek({ '1': [{ start: '13:00', end: '17:00' }, { start: '8:30', end: '12:00' }], '2': [] });
  assert.deepEqual(r, { error: null, week: { '1': [{ start: '08:30', end: '12:00' }, { start: '13:00', end: '17:00' }] } });
});

test('checkWeek names the day and the problem', () => {
  assert.match(String(checkWeek({ '3': [{ start: '17:00', end: '09:00' }] }).error), /^Wed: 17:00-09:00 ends before/);
  assert.match(String(checkWeek({ '5': [{ start: 'x', end: '09:00' }] }).error), /^Fri: use times/);
  assert.match(String(checkWeek({ '0': [{ start: '09:00', end: '12:00' }, { start: '11:00', end: '13:00' }] }).error), /^Sun: the time blocks overlap/);
  const seven = Array.from({ length: 7 }, (_, i) => ({ start: `0${i}:00`, end: `0${i}:30` }));
  assert.match(String(checkWeek({ '1': seven }).error), /at most 6/);
});

test('blocks that touch are allowed', () => {
  assert.equal(checkWeek({ '1': [{ start: '09:00', end: '12:00' }, { start: '12:00', end: '17:00' }] }).error, null);
});

test('copyMondayToWeekdays leaves the weekend and shares no objects', () => {
  const w = copyMondayToWeekdays({ '1': [{ start: '08:00', end: '16:00' }], '6': [{ start: '10:00', end: '12:00' }] });
  assert.deepEqual(Object.keys(w).sort(), ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(w['5'], [{ start: '08:00', end: '16:00' }]);
  assert.notEqual(w['5'][0], w['1'][0]);
  assert.deepEqual(w['6'], [{ start: '10:00', end: '12:00' }]);
});

test('defaultWeek is Monday to Friday and passes its own check', () => {
  const w = defaultWeek();
  assert.deepEqual(Object.keys(w).sort(), ['1', '2', '3', '4', '5']);
  assert.equal(checkWeek(w).error, null);
});

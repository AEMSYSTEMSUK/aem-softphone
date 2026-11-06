import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planOutsideDial, resolveCallFrom } from './callFrom.ts';

test('desk phone is the default where the account has one', () => {
  assert.equal(resolveCallFrom(null, 'online', true), 'desk');
  assert.equal(resolveCallFrom(null, 'offline', true), 'desk');
});

test('a choice made on this device is remembered', () => {
  assert.equal(resolveCallFrom('computer', 'online', true), 'computer');
  assert.equal(resolveCallFrom('desk', 'online', true), 'desk');
});

test('no desk phone, or not the desktop app, means this computer', () => {
  assert.equal(resolveCallFrom('desk', 'none', true), 'computer');
  assert.equal(resolveCallFrom(null, undefined, true), 'computer');
  assert.equal(resolveCallFrom('desk', 'online', false), 'computer');
});

test("when voip1 can't be asked a stored choice stands, and nothing new defaults to desk", () => {
  assert.equal(resolveCallFrom('desk', 'unknown', true), 'desk');
  assert.equal(resolveCallFrom(null, 'unknown', true), 'computer');
});

test('desk phone mode sends an outside number with no confirm box', () => {
  assert.deepEqual(planOutsideDial('+44 (0)1924 263370', 'desk'), { action: 'send', number: '01924263370' });
});

test('this computer asks first', () => {
  assert.deepEqual(planOutsideDial('01924 263370', 'computer'), { action: 'confirm', number: '01924263370' });
});

test('something that is not a number only ever shows a message', () => {
  for (const mode of ['desk', 'computer'] as const) {
    assert.equal(planOutsideDial('not a number', mode).action, 'message');
    assert.equal(planOutsideDial('09011234567', mode).action, 'message');
    assert.equal(planOutsideDial(undefined, mode).action, 'message');
  }
});

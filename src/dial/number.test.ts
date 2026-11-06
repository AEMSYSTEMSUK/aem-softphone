import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dialableNumber, dialPadText, normaliseNumber, parseNumber } from './number.ts';

const num = (s: unknown) => { const p = parseNumber(s); return p.ok ? p.number : null; };

test('normaliseNumber matches ONE', () => {
  assert.equal(normaliseNumber('01924 263370'), '01924263370');
  assert.equal(normaliseNumber('+44 1924 263370'), '01924263370');
  assert.equal(normaliseNumber('441924263370'), '01924263370');
  assert.equal(normaliseNumber('1924263370'), '01924263370');
  assert.equal(normaliseNumber('0044 1924 263370'), '01924263370');
  assert.equal(normaliseNumber('+1 212 555 0100'), '+12125550100');
  assert.equal(normaliseNumber(''), null);
});

test('dialableNumber keeps the barring: UK and extensions only, no 09', () => {
  for (const ok of ['01924263370', '02079460000', '03001234567', '07700900123', '08001234567', '200', '12345']) assert.ok(dialableNumber(ok), ok);
  for (const no of ['09011234567', '+12125550100', '07012345678', '07612345678', '08701234567', '08451234567', '12', '123456']) assert.equal(dialableNumber(no), null, no);
});

test('pasted numbers with spaces, brackets, dashes or +44 come out clean', () => {
  for (const s of ['01924 263370', '(01924) 263370', '01924-263-370', '01924.263370', '+44 1924 263370', '+44 (0)1924 263370', '+44 (0) 1924 263370',
    '0044 (0)1924 263370', '+441924263370', ' 01924 263370\n', '‪01924 263370‬', '01924–263370']) assert.equal(num(s), '01924263370', s);
  assert.equal(num('+44 7700 900123'), '07700900123');
});

test('labels and extensions around a number are ignored', () => {
  assert.equal(num('Tel: 01924 263370'), '01924263370');
  assert.equal(num('T. 01924 263370'), '01924263370');
  assert.equal(num('Mobile 07700 900123'), '07700900123');
  assert.equal(num('01924 263370 ext 12'), '01924263370');
  assert.equal(num('01924 263370 x12'), '01924263370');
});

test('an extension is bare digits', () => {
  assert.equal(num('200'), '200');
  assert.equal(num(' 2001 '), '2001');
});

test('text that is not one number never dials', () => {
  for (const s of ['', '   ', 'hello', 'Call me on 01924 263370 today', '12/03/2026', '2026-11-06', '£1,234.56', '123.45', '12-34',
    '01924 263370 / 07700 900123', 'a'.repeat(100), '0'.repeat(100), '01924263370; rm -rf']) assert.equal(num(s), null, JSON.stringify(s));
});

test('the reason says what went wrong', () => {
  assert.deepEqual(parseNumber('09011234567'), { ok: false, reason: "09 premium numbers can't be dialled" });
  assert.deepEqual(parseNumber('+1 212 555 0100'), { ok: false, reason: 'UK numbers and extensions only' });
  assert.match((parseNumber('4.41924E+11') as { reason: string }).reason, /shortened/);
  assert.deepEqual(parseNumber('hello'), { ok: false, reason: "That isn't a phone number" });
});

test('the dialler box cleans a paste and lets typing carry on', () => {
  assert.equal(dialPadText('+44 (0)1924 263370'), '01924263370');
  assert.equal(dialPadText('(01924) 263-370'), '01924263370');
  assert.equal(dialPadText('01924 2'), '019242');
  assert.equal(dialPadText('+44'), '+44');
  assert.equal(dialPadText('*72#'), '*72#');
  assert.equal(dialPadText('call abc 123'), '123');
});

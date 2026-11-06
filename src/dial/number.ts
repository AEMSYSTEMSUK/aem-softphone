// Turning whatever someone pasted, selected or imported into a number we can dial (6 Nov 2026). No React Native here, so
// it runs under node --test. normaliseNumber and dialableNumber are the same rules as ONE's phone-book.service.ts, which
// is the real gate for desk phone calls. Keep in step.

// "01924 263370", "+44 1924 263370", "441924263370", "1924263370" (spreadsheets drop the 0) -> "01924263370".
// Non-UK international keeps its + prefix. Returns null when there's nothing that looks like a number.
export function normaliseNumber(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const plus = s.startsWith('+') || s.startsWith('00');
  let d = s.replace(/\D/g, '');
  if (s.startsWith('00')) d = d.slice(2);
  if (!d) return null;
  if (d.startsWith('44') && (plus || d.length >= 12)) d = '0' + d.slice(2);
  else if (plus) return d.length >= 6 ? '+' + d : null;
  else if (!d.startsWith('0') && d.length === 10 && /^[1-9]/.test(d)) d = '0' + d;
  return d.length >= 3 ? d : null;
}

// UK landlines/mobiles/non-geo (01/02/03/07/08 not 09) or an internal extension.
export function dialableNumber(raw: string): string | null {
  const n = normaliseNumber(raw);
  if (!n) return null;
  if (/^\d{3,5}$/.test(n)) return n;
  return /^0(1|2|3)\d{8,9}$|^07[1-57-9]\d{8}$|^08(00|08)\d{6,7}$/.test(n) ? n : null;
}

export type ParsedNumber = { ok: true; number: string } | { ok: false; reason: string };

const NOT_A_NUMBER = "That isn't a phone number";
const LABEL_RE = /^(tel(ephone)?|phone|mob(ile)?|office|direct|ddi|t|m|p)\b[.:]?\s*/i;
const EXT_RE = /\s*(ext(ension)?\.?|x)\s*\d{1,6}$/i;

// One number in free text: "Tel: +44 (0)1924 263370 ext 12". Anything else in the text (words, a date, two numbers, a
// price) means it isn't a number, so we never guess which digits were meant.
export function parseNumber(raw: unknown): ParsedNumber {
  let s = String(raw ?? '').replace(/[  -‏‪- ⁠﻿]/g, ' ').replace(/[‐-―]/g, '-').trim();
  if (!s) return { ok: false, reason: 'Nothing to dial' };
  if (s.length > 64) return { ok: false, reason: NOT_A_NUMBER };
  if (/^\d(\.\d+)?e\+?\d+$/i.test(s)) return { ok: false, reason: 'The spreadsheet has shortened this number (it shows as 4.41E+11)' };
  s = s.replace(LABEL_RE, '').replace(EXT_RE, '').replace(/\(0\)/g, ' ').trim();
  if (!/^\+?[0-9()\-.\s]+$/.test(s)) return { ok: false, reason: NOT_A_NUMBER };
  const digits = s.replace(/\D/g, '');
  // Short means an extension, which is only ever bare digits: "12-34" or "123.45" are something else.
  if (digits.length <= 5 && digits !== s) return { ok: false, reason: NOT_A_NUMBER };
  const number = dialableNumber(s);
  if (number) return { ok: true, number };
  if (digits.startsWith('09') || digits.startsWith('449')) return { ok: false, reason: "09 premium numbers can't be dialled" };
  return { ok: false, reason: 'UK numbers and extensions only' };
}

// The dialler's text box. A pasted or typed number in any format becomes the clean number as soon as it is one; otherwise
// only what the keypad could enter stays, so someone can carry on typing.
export function dialPadText(input: string): string {
  const p = parseNumber(input);
  if (p.ok && /[^0-9]/.test(input.trim())) return p.number;
  return input.replace(/[^0-9*#+]/g, '').slice(0, 20);
}

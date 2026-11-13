import { parseNumber } from '../dial/number.ts';

// Call list import (6 Nov 2026). Files are untrusted, so everything here has a limit and cells stay plain text: arrays
// by position (a header can't become an object key), nothing evaluated, nothing written back to a spreadsheet.
export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_COLS = 50;
const MAX_CELL = 500;
const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5000;

export type Table = string[][];
export type Field = 'name' | 'company' | 'number' | 'notes';
export type Mapping = Record<Field, number | null>;

// Windows Excel's plain "CSV" is ANSI, so anything that isn't valid UTF-8 is read as Windows-1252.
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(body); } catch { return new TextDecoder('windows-1252').decode(body); }
}

// The delimiter is whichever of , ; tab appears most on the first line, outside quotes.
function delimiterOf(text: string) {
  const line = (text.split(/\r\n|\r|\n/, 1)[0] || '').replace(/"[^"]*"/g, '');
  const count = (c: string) => line.split(c).length - 1;
  return [',', ';', '\t'].reduce((best, c) => (count(c) > count(best) ? c : best), ',');
}

// RFC 4180 with quotes, doubled quotes and line breaks inside quotes (the portal's phone book import reads simpler CSV).
export function parseCsv(text: string): Table {
  const delim = delimiterOf(text);
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim())) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1) throw new Error(`That file has more than ${MAX_ROWS} rows`);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === delim) endCell();
    else if (c === '\n') endRow();
    else if (c === '\r') { if (text[i + 1] === '\n') i++; endRow(); } else cell += c;
  }
  if (cell || row.length) endRow();
  return tidyTable(rows);
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(+v) ? '' : v.toISOString().slice(0, 10);
  // eslint-disable-next-line no-control-regex
  return String(v).replace(/[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]/g, '').trim().slice(0, MAX_CELL);
}

export function tidyTable(rows: unknown[][]): Table {
  const out = rows.map((r) => r.slice(0, MAX_COLS).map(cellText)).filter((r) => r.some(Boolean));
  if (out.length > MAX_ROWS + 1) throw new Error(`That file has more than ${MAX_ROWS} rows`);
  return out;
}

// An .xlsx is a zip. Its central directory lists how big each file claims to unpack to, which catches a zip bomb before
// the parser starts on it. Throws for anything that isn't a sound zip.
export function checkZip(bytes: Uint8Array) {
  const bad = () => new Error("That doesn't look like a real .xlsx file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65535; i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw bad();
  const entries = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true), total = 0;
  if (entries > MAX_ZIP_ENTRIES) throw new Error('That spreadsheet is too big to import');
  for (let n = 0; n < entries; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw bad();
    total += view.getUint32(at + 24, true);
    at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  if (total > MAX_UNZIPPED_BYTES) throw new Error('That spreadsheet is too big to import');
}

const GUESS: Array<[Field, RegExp]> = [
  ['number', /\b(tel|telephone|phone|mobile|mob|number|no|ddi)\b/i],
  ['company', /\b(company|business|organisation|organization|firm|account)\b/i],
  ['name', /\b(name|contact|person|who)\b/i],
  ['notes', /\b(notes?|comments?|info|details)\b/i],
];

// Most people's first row is headings. It isn't if any cell in it is already a usable number.
export const looksLikeHeader = (table: Table) => !!table[0] && !table[0].some((c) => parseNumber(c).ok);

export function guessMapping(table: Table, hasHeader: boolean): Mapping {
  const m: Mapping = { name: null, company: null, number: null, notes: null };
  if (hasHeader) (table[0] || []).forEach((h, i) => {
    const hit = GUESS.find(([f, re]) => m[f] === null && re.test(h));
    if (hit) m[hit[0]] = i;
  });
  // No heading to go on: the column where most sample rows hold a number.
  if (m.number === null) {
    const sample = table.slice(hasHeader ? 1 : 0, 50);
    const score = (i: number) => sample.filter((r) => parseNumber(r[i]).ok).length;
    const width = Math.max(0, ...table.map((r) => r.length));
    let best = -1, bestScore = 0;
    for (let i = 0; i < width; i++) if (score(i) > bestScore) { best = i; bestScore = score(i); }
    if (best >= 0) m.number = best;
  }
  return m;
}

export interface ImportedRow { name: string; company: string; number: string; notes: string }
export interface RejectedRow { row: number; text: string; reason: string }
export interface ImportResult { rows: ImportedRow[]; rejected: RejectedRow[]; duplicates: number }

// Row numbers count the rows that have something in them, so a sheet with blank rows can differ from Excel's numbering.
export function buildRows(table: Table, mapping: Mapping, hasHeader: boolean): ImportResult {
  if (mapping.number === null) throw new Error('Choose which column holds the phone number');
  const at = (r: string[], i: number | null) => (i === null ? '' : r[i] || '');
  const seen = new Map<string, number>();
  const out: ImportResult = { rows: [], rejected: [], duplicates: 0 };
  table.forEach((r, i) => {
    if (hasHeader && i === 0) return;
    const row = i + 1, raw = at(r, mapping.number);
    const text = [at(r, mapping.name) || at(r, mapping.company), raw].filter(Boolean).join(' - ').slice(0, 120) || '(blank)';
    const p = parseNumber(raw);
    if (!p.ok) { out.rejected.push({ row, text, reason: raw ? p.reason : 'No number' }); return; }
    const first = seen.get(p.number);
    if (first) { out.duplicates++; out.rejected.push({ row, text, reason: `Same number as row ${first}` }); return; }
    seen.set(p.number, row);
    out.rows.push({ name: at(r, mapping.name), company: at(r, mapping.company), number: p.number, notes: at(r, mapping.notes) });
  });
  return out;
}

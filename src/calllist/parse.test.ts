import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { buildRows, cellText, checkZip, decodeText, guessMapping, looksLikeHeader, MAX_ROWS, parseCsv } from './parse.ts';
import { readXlsx } from './xlsx.ts';

const enc = (s: string) => new TextEncoder().encode(s);

// A small real workbook, built by hand so no binary fixture goes in the repo.
function workbook(sheetRows: string) {
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}
const str = (ref: string, v: string) => `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;

test('CSV: quotes, doubled quotes, commas and line breaks inside quotes, blank rows', () => {
  const t = parseCsv('Name,Company,Phone\r\n"Smith, Jo","A ""B"" Ltd",01924 263370\r\n\r\n"Two\nlines",,07700 900123\n');
  assert.deepEqual(t, [['Name', 'Company', 'Phone'], ['Smith, Jo', 'A "B" Ltd', '01924 263370'], ['Two\nlines', '', '07700 900123']]);
});

test('CSV: semicolons and tabs are spotted', () => {
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('text encodings: UTF-8 with BOM, Excel ANSI, UTF-16', () => {
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('Zoë')])), 'Zoë');
  assert.equal(decodeText(new Uint8Array([0x5a, 0x6f, 0xeb])), 'Zoë');
  assert.equal(decodeText(new Uint8Array([0xff, 0xfe, 0x5a, 0x00])), 'Z');
});

test('limits: too many rows is refused, wide rows and long cells are cut', () => {
  assert.throws(() => parseCsv('n\n' + '1\n'.repeat(MAX_ROWS + 2)), /more than/);
  const t = parseCsv(`${'a,'.repeat(100)}a\n${'x'.repeat(2000)}`);
  assert.equal(t[0].length, 50);
  assert.equal(t[1][0].length, 500);
});

test('cells stay plain text', () => {
  assert.equal(cellText('=HYPERLINK("http://x")'), '=HYPERLINK("http://x")');
  assert.equal(cellText('a\u0000b‮c'), 'abc');
  assert.equal(cellText(null), '');
  assert.equal(cellText(new Date('2026-11-06T00:00:00Z')), '2026-11-06');
});

test('columns are guessed from headings', () => {
  const t = [['Contact name', 'Company', 'Telephone', 'Notes'], ['Jo', 'Acme', '01924 263370', 'hi']];
  assert.equal(looksLikeHeader(t), true);
  assert.deepEqual(guessMapping(t, true), { name: 0, company: 1, number: 2, notes: 3 });
});

test('with no headings the number column is found from the data', () => {
  const t = [['Jo', '01924 263370'], ['Sam', '07700 900123']];
  assert.equal(looksLikeHeader(t), false);
  assert.equal(guessMapping(t, false).number, 1);
});

test('rows: numbers cleaned, duplicates dropped, bad rows kept with a reason', () => {
  const t = [['Name', 'Phone'], ['Jo', '+44 (0)1924 263370'], ['Jo again', '01924 263370'], ['Sam', '1924263371'], ['Premium', '09011234567'],
    ['Shortened', '4.41924E+11'], ['Blank', ''], ['Words', 'ring reception']];
  const r = buildRows(t, { name: 0, company: null, number: 1, notes: null }, true);
  assert.deepEqual(r.rows.map((x) => x.number), ['01924263370', '01924263371']);
  assert.equal(r.duplicates, 1);
  assert.deepEqual(r.rejected.map((x) => x.row), [3, 5, 6, 7, 8]);
  assert.match(r.rejected[0].reason, /Same number as row 2/);
  assert.match(r.rejected[1].reason, /09/);
  assert.match(r.rejected[2].reason, /shortened/);
  assert.equal(r.rejected[3].reason, 'No number');
});

test('a number column has to be chosen', () => {
  assert.throws(() => buildRows([['a']], { name: 0, company: null, number: null, notes: null }, false), /Choose which column/);
});

test('xlsx: text cells and number cells that lost their 0', async () => {
  const t = await readXlsx(workbook(`<row r="1">${str('A1', 'Name')}${str('B1', 'Phone')}</row><row r="2">${str('A2', 'Jo')}<c r="B2"><v>1924263370</v></c></row><row r="3">${str('A3', 'Sam')}${str('B3', '07700 900123')}</row>`));
  assert.deepEqual(t, [['Name', 'Phone'], ['Jo', '1924263370'], ['Sam', '07700 900123']]);
  assert.deepEqual(buildRows(t, { name: 0, company: null, number: 1, notes: null }, true).rows.map((x) => x.number), ['01924263370', '07700900123']);
});

test('xlsx: a formula is not run, only its stored value is read', async () => {
  const t = await readXlsx(workbook('<row r="1"><c r="A1" t="str"><f>WEBSERVICE("http://x")</f><v>stored</v></c></row>'));
  assert.deepEqual(t, [['stored']]);
});

test('xlsx: not a zip, or a zip claiming to unpack to a huge size, is refused', async () => {
  await assert.rejects(readXlsx(enc('this is not a spreadsheet at all, just some text padding it out')), /real .xlsx/);
  const z = workbook('');
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
  for (let i = 0; i < z.length - 4; i++) if (v.getUint32(i, true) === 0x02014b50) { v.setUint32(i + 24, 0xffffffff, true); break; }
  assert.throws(() => checkZip(z), /too big/);
});

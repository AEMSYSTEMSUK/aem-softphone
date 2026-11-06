import { decodeText, MAX_FILE_BYTES, parseCsv } from './parse.ts';
import type { Table } from './parse.ts';
import { readXlsx } from './xlsx.ts';

// Desktop: the browser's own file picker. Nothing reaches the main process, and the file stays on this computer.
function chooseFile(): Promise<File | null> {
  return new Promise((done) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx';
    input.onchange = () => done(input.files?.[0] ?? null);
    input.oncancel = () => done(null);
    input.click();
  });
}

export async function pickSpreadsheet(): Promise<{ fileName: string; table: Table } | null> {
  const f = await chooseFile();
  if (!f) return null;
  if (f.size > MAX_FILE_BYTES) throw new Error('That file is over 10 MB');
  const ext = f.name.toLowerCase().split('.').pop();
  if (ext !== 'csv' && ext !== 'xlsx') throw new Error('Choose a .csv or .xlsx file (in Excel: Save As > Excel Workbook)');
  const bytes = new Uint8Array(await f.arrayBuffer());
  return { fileName: f.name.slice(0, 120), table: ext === 'csv' ? parseCsv(decodeText(bytes)) : await readXlsx(bytes) };
}

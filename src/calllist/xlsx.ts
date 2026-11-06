import readXlsxFile from 'read-excel-file/universal';
import { checkZip, tidyTable } from './parse.ts';
import type { Table } from './parse.ts';

// First sheet with anything on it. read-excel-file only reads cell values: formulas aren't run, macros aren't touched.
export async function readXlsx(bytes: Uint8Array): Promise<Table> {
  checkZip(bytes);
  const sheets = await readXlsxFile(bytes.slice().buffer as ArrayBuffer);
  for (const s of sheets) {
    const t = tidyTable(s.data as unknown[][]);
    if (t.length) return t;
  }
  return [];
}

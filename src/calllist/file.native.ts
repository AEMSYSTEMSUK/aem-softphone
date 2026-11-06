import type { Table } from './parse';

// Call lists are desktop only for now: this keeps the spreadsheet parser out of the phone builds.
export async function pickSpreadsheet(): Promise<{ fileName: string; table: Table } | null> {
  throw new Error('Call lists are on the desktop app');
}

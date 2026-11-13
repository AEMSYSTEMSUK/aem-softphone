import type { Segment, WeekHours } from '../api/types';

// Spec 6 D working hours, in the shape ONE stores: weekday 0 = Sunday .. 6 = Saturday, each a list of {start, end}
// HH:MM blocks. ONE's parseWeekHours is the real gate; this catches typing mistakes before the save. Keep in step.
export const DAYS = [
  { key: '1', label: 'Mon' }, { key: '2', label: 'Tue' }, { key: '3', label: 'Wed' }, { key: '4', label: 'Thu' },
  { key: '5', label: 'Fri' }, { key: '6', label: 'Sat' }, { key: '0', label: 'Sun' },
] as const;
const WEEKDAYS = ['1', '2', '3', '4', '5'];
const MAX_BLOCKS = 6;

export const DEFAULT_BLOCK: Segment = { start: '09:00', end: '17:30' };

export function defaultWeek(): WeekHours {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, [{ ...DEFAULT_BLOCK }]]));
}

/** '9:00', '09.00', '0900' or '900' -> '09:00'; anything else -> null. */
export function normaliseTime(raw: string): string | null {
  const t = raw.trim().replace('.', ':');
  const m = /^(\d{1,2}):(\d{2})$/.exec(t) || /^(\d{1,2})(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Tidied week ready to save, or the first problem in words a person can act on. */
export function checkWeek(week: WeekHours): { week: WeekHours; error: null } | { week: null; error: string } {
  const out: WeekHours = {};
  for (const { key, label } of DAYS) {
    const blocks = week[key] || [];
    if (!blocks.length) continue;
    if (blocks.length > MAX_BLOCKS) return { week: null, error: `${label}: at most ${MAX_BLOCKS} time blocks` };
    const tidy: Segment[] = [];
    for (const b of blocks) {
      const start = normaliseTime(b.start), end = normaliseTime(b.end);
      if (!start || !end) return { week: null, error: `${label}: use times like 08:30` };
      if (start >= end) return { week: null, error: `${label}: ${start}-${end} ends before it starts` };
      tidy.push({ start, end });
    }
    tidy.sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < tidy.length; i++) {
      if (tidy[i].start < tidy[i - 1].end) return { week: null, error: `${label}: the time blocks overlap` };
    }
    out[key] = tidy;
  }
  return { week: out, error: null };
}

/** Monday's blocks onto Tuesday to Friday, the usual first step after setting Monday. */
export function copyMondayToWeekdays(week: WeekHours): WeekHours {
  const mon = week['1'] || [];
  const out: WeekHours = { ...week };
  for (const d of WEEKDAYS.slice(1)) out[d] = mon.map((b) => ({ ...b }));
  return out;
}

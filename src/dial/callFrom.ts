import { parseNumber } from './number.ts';

// Which device a call starts on (6 Nov 2026), and what happens to a number that arrives from outside the app. Desk phone
// is the main way: ONE rings the handset and dials after pick-up, so picking up is the confirmation. On this computer a
// call would start the moment it is accepted, so an outside number gets a confirm box first.
export type CallFrom = 'computer' | 'desk';
export type DeskStatus = 'online' | 'offline' | 'none' | 'unknown'; // ONE's GET /desk-phones

export const hasDeskPhone = (status: DeskStatus | undefined) => status === 'online' || status === 'offline';

// stored = what the person chose on this device for this account, null if they never have. 'unknown' (voip1 couldn't be
// asked) keeps a stored choice, and otherwise stays on the computer because that always asks first.
export function resolveCallFrom(stored: string | null, status: DeskStatus | undefined, desktop: boolean): CallFrom {
  if (!desktop) return 'computer';
  if (hasDeskPhone(status)) return stored === 'computer' ? 'computer' : 'desk';
  return status === 'unknown' && stored === 'desk' ? 'desk' : 'computer';
}

export type DialPlan = { action: 'message'; text: string } | { action: 'send'; number: string } | { action: 'confirm'; number: string };

export function planOutsideDial(text: unknown, mode: CallFrom): DialPlan {
  const p = parseNumber(text);
  if (!p.ok) return { action: 'message', text: p.reason };
  return mode === 'desk' ? { action: 'send', number: p.number } : { action: 'confirm', number: p.number };
}

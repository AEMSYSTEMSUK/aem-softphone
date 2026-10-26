// Shapes returned by ONE's /api/softphone/* (aem-crm/backend src/services/softphone.service.ts). Keep in step.

export type RingStatus = 'available' | 'dnd' | 'out_of_hours' | 'holiday' | 'disabled';
export type Segment = { start: string; end: string };
export type WeekHours = Record<string, Segment[]>;
export type Dnd = { on: boolean; until: string | null };

export interface TokenPair { accessToken: string; refreshToken: string; expiresIn: number; deviceId: string }

export interface Account {
  id: number;
  companyKey: string;
  companyName: string;
  clientId: number | null;
  logoUrl: string | null;
  callerId: string | null;
  label: string;
  extension: string | null;
  endpoint: string;
  dnd: Dnd;
  hoursEnabled: boolean | null;
  workingHours: WeekHours | null;
  status: RingStatus;
}

export interface Me {
  user: { id: number; name: string; email: string; isStaff: boolean; hasAppPassword: boolean; microsoftLinked: boolean };
  settings: { dnd: Dnd; hoursEnabled: boolean; workingHours: WeekHours | null; skipBankHolidays: boolean; contactSources: { one: boolean; m365: boolean; phone: boolean } };
  status: RingStatus;
  accounts: Account[];
}

export interface SipAccount {
  accountId: number;
  endpoint: string;
  companyName: string;
  displayName: string;
  ready: boolean;
  username: string | null;
  password: string | null;
  reason: string | null;
}

export interface SipConfig {
  wssUrl: string;
  sipDomain: string;
  iceServers: Array<{ urls: string[]; username?: string; credential?: string }>;
  accounts: SipAccount[];
  fetchError: string | null;
}

export interface Contact {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  numbers: Array<{ label: string; number: string }>;
  source: 'one' | 'm365' | 'customers' | 'phone';
  accountId: number | null;
}

export interface HistoryItem {
  id: number;
  accountId: number | null;
  companyName: string;
  direction: 'in' | 'out';
  number: string | null;
  name: string | null;
  dialled: string | null;
  startedAt: string;
  talkSec: number;
  answered: boolean;
  answeredName: string | null;
  voicemail: boolean;
  result: 'outgoing' | 'answered' | 'answered_elsewhere' | 'voicemail' | 'missed';
}

export interface Voicemail {
  id: string;
  mailbox: string;
  callerName: string | null;
  callerNumber: string | null;
  receivedAt: string;
  durationSec: number;
  transcript: string | null;
  isNew: boolean;
}

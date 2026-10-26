import { Platform } from 'react-native';
import { API_BASE, APP_VERSION } from '../config';
import { deleteItem, getItem, setItem } from './storage';
import type { Contact, HistoryItem, Me, SipConfig, TokenPair, Voicemail, WeekHours } from './types';

// Thin client for ONE's /api/softphone. Access token in memory only; refresh token in the keychain, rotated by ONE on
// every refresh. Any 401 tries one refresh, then signs out (onSignedOut) - e.g. after "revoke this phone" in ONE.

const REFRESH_KEY = 'aem.sp.refresh';
let accessToken: string | null = null;
let accessExpiresAt = 0;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: () => void = () => undefined;

export function setSignedOutHandler(fn: () => void) { onSignedOut = fn; }

export function deviceInfo() {
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : Platform.OS === 'web' ? 'web' : 'web';
  return { platform, appVersion: APP_VERSION, name: `${Platform.OS} ${String(Platform.Version ?? '')}`.trim() };
}

type Envelope<T> = { status?: boolean; success?: boolean; data?: T; payload?: T; message?: string };

async function raw<T>(path: string, init: RequestInit = {}, auth = true): Promise<{ ok: boolean; status: number; data: T | null; message: string }> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers as Record<string, string> || {}) };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const r = await fetch(`${API_BASE}/softphone${path}`, { ...init, headers });
  let j: Envelope<T> & Record<string, unknown> = {};
  try { j = await r.json(); } catch { /* empty body */ }
  // ONE's res.deliver() envelope: { status, message, payload, time }.
  const data = (j.payload ?? j.data ?? null) as T | null;
  return { ok: r.ok && j.status !== false && j.success !== false, status: r.status, data, message: String(j.message || (r.ok ? 'OK' : `Error ${r.status}`)) };
}

async function storeTokens(t: TokenPair) {
  accessToken = t.accessToken;
  accessExpiresAt = Date.now() + (t.expiresIn - 60) * 1000;
  await setItem(REFRESH_KEY, t.refreshToken);
}

async function doRefresh(): Promise<boolean> {
  const rt = await getItem(REFRESH_KEY);
  if (!rt) return false;
  const r = await raw<TokenPair>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: rt }) }, false);
  if (!r.ok || !r.data) { await deleteItem(REFRESH_KEY); accessToken = null; return false; }
  await storeTokens(r.data);
  return true;
}

function refreshOnce() {
  if (!refreshing) refreshing = doRefresh().finally(() => { refreshing = null; });
  return refreshing;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken || Date.now() > accessExpiresAt) await refreshOnce();
  let r = await raw<T>(path, init);
  if (r.status === 401 && (await refreshOnce())) r = await raw<T>(path, init);
  if (r.status === 401) { accessToken = null; onSignedOut(); throw new Error('Please sign in again'); }
  if (!r.ok) throw new Error(r.message);
  return r.data as T;
}

// ---------- sign-in ----------
export async function resumeSession(): Promise<boolean> { return refreshOnce(); }

export async function loginWithPassword(email: string, password: string) {
  const r = await raw<TokenPair>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, device: deviceInfo() }) }, false);
  if (!r.ok || !r.data) throw new Error(r.message || 'Sign-in failed');
  await storeTokens(r.data);
}

export const microsoftStartUrl = () => `${API_BASE}/softphone/auth/microsoft`;

export async function exchangeSsoCode(code: string) {
  const r = await raw<TokenPair>('/auth/sso/exchange', { method: 'POST', body: JSON.stringify({ code, device: deviceInfo() }) }, false);
  if (!r.ok || !r.data) throw new Error(r.message || 'Microsoft sign-in failed');
  await storeTokens(r.data);
}

export async function logout() {
  try { if (accessToken) await raw('/auth/logout', { method: 'POST' }); } finally {
    accessToken = null;
    await deleteItem(REFRESH_KEY);
  }
}

// ---------- data ----------
export const getMe = () => api<Me>('/me');
export const getSip = (refresh = false) => api<SipConfig>(`/sip${refresh ? '?refresh=1' : ''}`);
export const searchContacts = (q: string, accountId?: number) => api<{ items: Contact[] }>(`/contacts?q=${encodeURIComponent(q)}${accountId ? `&accountId=${accountId}` : ''}`);
export const callerName = (num: string, accountId?: number) => api<{ name: string | null; company: string | null }>(`/caller?num=${encodeURIComponent(num)}${accountId ? `&accountId=${accountId}` : ''}`);
export const getHistory = (accountId?: number) => api<{ items: HistoryItem[] }>(`/history?take=100${accountId ? `&accountId=${accountId}` : ''}`);
export const getVoicemail = () => api<{ items: Voicemail[] }>('/voicemail');
export const setDnd = (mode: 'off' | 'on' | '1h' | '2h' | 'until_tomorrow', accountId?: number) =>
  api<Me>('/dnd', { method: 'PUT', body: JSON.stringify({ mode, accountId }) });
export const saveSettings = (body: { hoursEnabled?: boolean; workingHours?: WeekHours | null; skipBankHolidays?: boolean; contactSources?: Record<string, boolean>; accountId?: number }) =>
  api<Me>('/settings', { method: 'PUT', body: JSON.stringify(body) });
export const savePushToken = (kind: 'apns_voip' | 'apns' | 'fcm', token: string | null) =>
  api<{ saved: boolean }>('/device/push', { method: 'PUT', body: JSON.stringify({ kind, token }) });

// Voicemail audio needs the Bearer header; expo-audio accepts {uri, headers}.
export async function voicemailSource(id: string) {
  if (!accessToken || Date.now() > accessExpiresAt) await refreshOnce();
  return { uri: `${API_BASE}/softphone/voicemail/${encodeURIComponent(id)}/audio`, headers: { Authorization: `Bearer ${accessToken}` } };
}

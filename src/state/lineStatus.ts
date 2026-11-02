import type { SipAccount } from '../api/types';
import type { RegState } from '../sip';

// #230 (3 Nov 2026): one place that turns ONE / voip1 / registration states into words a customer understands, with
// what to do next. Used by the first-run Setup screen and the Accounts screen.
export type LineHealth = { ok: boolean; title: string; detail: string | null };

export function lineHealth(sa: SipAccount | undefined, reg: RegState | undefined, regReason?: string | null): LineHealth {
  if (!sa) return { ok: false, title: 'Not set up yet', detail: 'AEM is still setting this line up. Pull down to refresh in a minute, or call AEM.' };
  if (!sa.ready) {
    const r = String(sa.reason || '');
    if (/not set up on the phone system/i.test(r)) return { ok: false, title: 'Line not set up on the phone system', detail: `AEM hasn't created your app line (${sa.endpoint}) on the phone system yet. Ask AEM to finish setting you up - nothing to do on this phone.` };
    if (/Not an app line/i.test(r)) return { ok: false, title: 'Wrong kind of line', detail: `${sa.endpoint} is a desk phone line, not an app line. Ask AEM to link your app line instead.` };
    if (/taking a while|reach the phone system|PBX/i.test(r)) return { ok: false, title: "Can't reach the phone system", detail: 'The phone system did not answer in time. Pull down to try again; if it keeps happening, tell AEM.' };
    if (/unreadable/i.test(r)) return { ok: false, title: 'Line login needs refreshing', detail: 'Pull down on the Accounts screen to fetch it again.' };
    return { ok: false, title: 'Line not ready', detail: r || 'Ask AEM to check your phone login.' };
  }
  if (reg === 'registered') return { ok: true, title: 'Connected - calls ring here', detail: null };
  if (reg === 'registering') return { ok: false, title: 'Connecting...', detail: null };
  if (reg === 'failed') {
    const why = String(regReason || '');
    if (/auth|forbidden|401|403/i.test(why)) return { ok: false, title: 'Phone system refused the login', detail: 'The line password changed. Pull down to refresh; if it still fails, ask AEM.' };
    return { ok: false, title: "Couldn't connect", detail: `${why ? `${why}. ` : ''}Check this device is online (Wi-Fi or mobile data), then pull down to retry.` };
  }
  return { ok: false, title: 'Not connected', detail: 'Pull down to connect.' };
}

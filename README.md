# The One MSP Phone (#230) - softphone app, milestone 1

App IDs: iOS bundle / Android package `uk.co.aemsystems.theonemspphone`, deep-link scheme `theonemspphone://`
(Microsoft sign-in comes back on `theonemspphone://sso`). Named 26 Oct 2026 (was "AEM Phone" in the first skeleton).

AEM's own calling app ("The One MSP Phone") for hosted-phone customers and staff, on iPhone, Android and desktop. Spec:
`OneDrive - AEM SYSTEMS\Documents\AEM\AEM-230-Softphone-App-Spec.md` (v0.2, all decisions agreed 26 Oct 2026).

**Status (26 Oct 2026): skeleton.** Every screen works against ONE's new `/api/softphone` API. Real calling code is
written (JsSIP + WebRTC), but it has **not been tested against voip1**, because voip1 has no `-app` lines or WebRTC
template yet (milestone 2). Expo Go has no WebRTC, so there the app falls back to simulated calls and says so on the
Accounts screen.

Git: `origin` = https://github.com/AEMSYSTEMSUK/aem-softphone (private), branch `main`. Code only - never secrets,
`.env` files or signing keys.

## Architecture

```
 App (React Native / Expo SDK 58, TypeScript)            ONE backend (aem-crm/backend, /api/softphone/*)
   Login (Microsoft or app password)  ── HTTPS ────────►  auth/login, auth/refresh, auth/microsoft(+/callback), auth/sso/exchange
   Accounts / DND / hours             ── HTTPS ────────►  me, dnd, settings          (state lives in ONE)
   Contacts / Recents / Voicemail     ── HTTPS ────────►  contacts, caller, history, voicemail(+audio)
   SIP layer (src/sip)                ── HTTPS ────────►  sip  (SIP logins of <key><ext>-app lines, TURN creds)
        │                                                      │ read-only voip.bridge action app_credentials
        │ SIP over WSS + SRTP media (one registration           ▼
        └──── per company account) ──────────────────────►  voip1 (Wazo/Asterisk)  ── asks ONE /softphone/ring/<endpoint>
                                                                                       before ringing (DND / hours)
```

- **ONE is the backend** (spec section 0): login, accounts, phone book, history, voicemail, push relay, TURN.
  voip1 only carries SIP/WebRTC.
- **Several companies on one handset.** Each company account is one Wazo SIP endpoint (`<key><ext>-app`). The engine
  keeps one registration per account, and outgoing calls use the selected account, so the caller ID follows the customer context.
- **No secrets in the app.** The app stores only a refresh token, in the keychain (expo-secure-store). SIP passwords
  come from ONE after sign-in. ONE reads them from voip1 and caches them AES-GCM encrypted. TURN credentials are
  12-hour HMAC credentials, minted from the coturn shared secret.
- Revoking a lost phone in ONE stops it on its next request. Access tokens last 1 hour, and refresh tokens rotate.
- **Microsoft sign-in works for customers' Microsoft 365 users too, not just AEM staff.** It uses ONE's multi-tenant
  partner app "AEM Portal Sign-In (SSO)" (c92ea121, already admin-consented in the client tenants) with the
  `/organizations` authority, not ONE's single-tenant staff login app. ONE's callback is
  `https://one.aemtech.co.uk/api/softphone/auth/microsoft/callback` (registered on c92ea121 in Entra). ONE only lets
  someone in if the token's tenant is AEM's or a customer tenant in `m365_tenants` (not offboarded), and the person
  already has a phone login (matched by Entra object id, else email / UPN). Staff logins work only from AEM's tenant,
  customer logins only from their own company's tenant. Microsoft sign-in never creates logins.

### Folder map

| Path | What |
|---|---|
| `App.tsx` | Shell: DND bar, tab bar (Keypad, Contacts, Recents, Voicemail, Accounts), call overlay |
| `src/api/` | ONE client (`client.ts`, token refresh), keychain storage, API types (keep in step with `softphone.service.ts`) |
| `src/sip/SipEngine.ts` | **The SIP abstraction.** Screens use only this interface |
| `src/sip/JsSipEngine.ts` | Real engine: JsSIP over WSS, with WebRTC media |
| `src/sip/StubSipEngine.ts` | Simulated calls (Expo Go, UI work, `EXPO_PUBLIC_SIP_STUB=1`) |
| `src/sip/webrtc(.native).ts` | Registers react-native-webrtc globals on phones (no-op on web) |
| `src/screens/` | Login, Accounts, Dialer, Contacts, History (Recents), Voicemail, Call (ringing / in-call) |
| `desktop/` | Electron shell **stub**. Loads the web export of the same UI |

### SIP library choice

The spec recommended `@wazo/sdk`. **I chose JsSIP (MIT, actively maintained, last release Oct 2026) with
react-native-webrtc**, behind the `SipEngine` interface:

- Our login is ONE, not Wazo auth. The Wazo SDK is built around a Wazo-auth session per user (it talks to calld,
  dird and so on), and those features are already served by ONE's own data (call log, phone book, voicemail).
- Our routing is custom dialplan (`cust-routing.conf`), so the app only needs plain SIP registration plus calls. That
  is exactly what JsSIP does, and it handles several user agents (one per company) cleanly.
- Plain SIP.js (which the Wazo SDK wraps) hasn't been released since 2022.
- The Wazo SDK can still sit behind `SipEngine` later if we want calld features like attended transfer through
  Wazo or presence.
- Linphone is avoided (GPL / commercial licence), as the spec says.

## How to run

```
npm install
npx expo start            # Expo Go on a phone: UI + simulated calls (no WebRTC in Expo Go)
npm run typecheck
npm run export:web        # web build into dist/ (also what the Electron shell loads)
```

Real calling on a phone needs a **development build**, because react-native-webrtc is a native module:
`npx eas-cli@latest build --profile development --platform android` (and ios). The build needs an Expo account and,
for iOS, the Apple Developer enrolment. Nothing has been built or uploaded yet.

ONE's address comes from `app.json` -> `expo.extra.apiBase` (default `https://one.aemtech.co.uk/api`).

Desktop stub: `npm run export:web`, then `cd desktop && npm install && npm start`. Electron is not installed in this
repo yet. Alternatively, set `ONEMSP_PHONE_DEV_URL=http://localhost:8081` while `npx expo start --web` runs.

## What's stubbed / not done (and why)

| Thing | State | Why |
|---|---|---|
| Real calls | Code written (JsSipEngine), **untested** | voip1 has no `<key><ext>-app` endpoints, WebRTC template or WSS check yet. No live PBX changes in milestone 1 |
| Calls in Expo Go | Simulated (StubSipEngine) | react-native-webrtc is native; needs an EAS dev build |
| Ringing on a locked phone | Not started | Needs PushKit + CallKit (iOS) and FCM + ConnectionService (Android). Blocked on the Apple Developer enrolment |
| Company logo per account | `logoUrl` is always null | ONE's Client has no logo field yet |
| Microsoft sign-in on desktop/web | Mobile only | The return URL is `theonemspphone://sso`. Electron needs the protocol registered (milestone 2) |
| Desktop app | Stub that loads the web export | Spec: mobile first. Electron is the next milestone |
| Transfer, 3-way, park, Move to... | Not started | Milestone 2/3 |
| Presence of colleagues | Not started | Needs a presence feed from voip1 |
| ONE GUI for phone logins | **Done** - ONE > IT & Devices > Phone app (`/admin/phones/app`, super admins) | Settings, logins (linked to staff / portal person / M365 person), app password shown once, company lines, device sign-out |

## Milestone 2 plan

1. **voip1 (live, needs Andy's yes):** a WebRTC endpoint template (WSS, DTLS-SRTP, Opus + G.711, ICE). Per pilot user, a
   `<key><ext>-app` endpoint on the person's Wazo user, added to the customer's Dial list in `cust-routing.conf` (like
   `lines: N` DECT). A `cust-routing` gosub that calls ONE `/api/softphone/ring/<endpoint>` (X-Voip-Key) before dialling
   the app leg, and adds `X-AEM-Company` / `X-AEM-DID` / `X-AEM-Caller` headers. Open coturn 3478/5349 (+ the
   Fasthosts cloud firewall). Verify WSS on 443/8089.
2. ~~ONE GUI~~ - done 26 Oct (ONE > Phone app).
3. **Push / VoIP notifications:** iOS PushKit VoIP push + CallKit, and Android FCM high-priority + ConnectionService /
   full-screen intent. ONE becomes the push relay. Device push tokens are already stored (`PUT /api/softphone/device/push`).
   **Blocked on Apple Developer Program enrolment** (D-U-N-S 231075307; andy@ enrolment under review, apple@ is the
   fallback). FCM uses AEM's existing Google Play account.
4. **TURN:** store the coturn secret through the ONE GUI. The app already passes ONE's `iceServers` to WebRTC.
5. **Follow Me / Move call** (spec 6 B): ring-all across desk, desktop and mobile, plus "Move to..." as an attended
   transfer to my own other endpoints (via ONE -> Wazo calld, or SIP REFER).
6. **Store accounts + builds:** EAS (or a GitHub Actions macOS runner) for iOS. TestFlight for Lewis, Play internal
   testing for Andy. Pilot order: AEM staff -> Big Property Sale + Long Acre -> Claim Team -> JLS.
7. Desktop (Electron): tray + DND, toast on incoming calls, deep-link sign-in, safeStorage, auto-update, signed
   installer (Azure Trusted Signing).

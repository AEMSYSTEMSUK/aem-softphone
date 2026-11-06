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

## Milestone 2 (1-2 Nov 2026): ring on a locked phone + installable builds

**Built (code, typechecked, Android prebuild + JS bundles verified on Windows; NOT yet run on a phone):**
- **Push relay in ONE** (backend f8c0cfa `softphone-push.service.ts`): Android FCM HTTP v1 high-priority data message;
  iPhone APNs VoIP push (PushKit). Keys are pasted in ONE > Phone app > "Ringing on a locked phone" (encrypted,
  write-only); the "Test ring" button sends a fake call to a login's phones. ONE frontend 07a1b34.
- **voip1** (`ops/voip1/app-push/cust-app-push.py`, prepared, NOT applied): [cust-app] calls ONE's ring check with
  `?push=1&co=&did=&caller=&num=`, sends ringing, waits up to 12 s for the app to register, then dials.
- **App:** `src/push/` (CallKeep: Android ConnectionService system call screen / iOS CallKit), FCM background handler
  (`src/push/background.native.ts`, loaded first in `index.ts`), PushKit via `react-native-voip-push-notification` with
  the native CallKit report in `plugins/withVoipPush.js` (Apple requires it before JS runs), Android 14 call-service
  permissions in `plugins/withAndroidCallService.js`. `AppContext` links the ringing system call to the SIP INVITE
  (same company account, 30 s), so Answer / End / mute / keypad on the lock screen act on the real call.
- `app.config.ts`: Firebase is only wired in when the build supplies `GOOGLE_SERVICES_JSON` (never committed).
- **Builds:** `.github/workflows/android-apk.yml` (Actions > Android APK > Run workflow -> APK artifact, debug-signed,
  for test phones; secret `GOOGLE_SERVICES_JSON_B64` turns push on). `eas.json` for EAS cloud builds (iPhone needs it).

**Order to switch it on:** (1) deploy ONE backend + frontend; (2) Firebase project (AEM Google account) -> add Android
app `uk.co.aemsystems.theonemspphone` -> download google-services.json -> repo secret GOOGLE_SERVICES_JSON_B64; service
account key -> ONE Phone app page; (3) run the Android APK workflow, install the APK, sign in, "Test ring"; (4) apply
the voip1 script; (5) iPhone: after the Apple Developer enrolment, APNs key (.p8) into ONE, then `eas build -p ios`.

## 3 Nov 2026 (overnight): ready for an Android pilot (Big Property Sale)

- **Headless wake (Android).** `src/state/phoneCore.ts` owns the one SIP engine for the app process. A push that starts
  the app's JS headless (phone locked, app swiped away) now signs the lines in straight away from the keychain token, so
  voip1's INVITE arrives while the lock screen is still ringing; Answer there answers the real call. Before, the lines
  only registered once the person had pressed Answer and the UI had loaded - usually after voip1 had given up.
- **Push mode.** Once the phone can be woken by push, the lines unregister when the app goes to the background and no
  call is in progress, and register again when it comes to the front. voip1 then sees "no registration", pushes and waits
  for the app, instead of sending the INVITE to a socket a sleeping phone isn't reading. Without push (no Firebase in the
  build) nothing changes: the app stays registered as before.
- **Engine start is idempotent**: a line whose login didn't change keeps its registration and call (the UI loading after
  a headless wake no longer tears the ringing call down). `pause()` / `resume()` / `liveCalls()` added to `SipEngine`.
- **Declined on the lock screen** before the INVITE arrived: that INVITE is rejected when it comes (not rung in the app).
- **Blind transfer** on the call screen (Transfer -> type 201 or a number). SIP REFER; voip1 routes it in the line's own
  context, like a desk phone's Transfer key. **Untested on voip1** - check the -app endpoints allow transfer and that
  the context reaches colleagues' extensions.
- voip1 wait for a woken app raised to 20 s (backend `ops/voip1/app-push/cust-app-push.py`, still not applied). App-only
  people need a ring step of 35 s+ in ONE's call routing, because the wait counts inside the step.
- Still not done: speakerphone / Bluetooth route button, attended transfer, "Move to my other device", iPhone (waits on
  the Apple Developer account), desktop.

## 3 Nov 2026 (later): call features, first-run setup, desktop app

- **Audio** (`src/audio/`): ringtone for calls the system call screen isn't already ringing (app open, no push), and an
  output button on the call screen - Phone / Speaker / Headset / Bluetooth on Android (react-native-incall-manager lists
  what's connected), Phone / Speaker on iPhone. Desktop: soft ring tone + notification, window comes forward.
- **Call waiting + swap**: a second call rings on the call screen; Answer holds the first; tap the held call to swap.
- **Attended transfer**: Transfer > "Talk first" holds the caller and rings the colleague; "Complete transfer" joins them
  (SIP REFER with Replaces), "Back to caller" drops the consultation. "Transfer now" = blind, as before.
- Recents (with call back), Contacts (ONE phone book + M365 + the phone's own), hold / mute / keypad were already there.
- **First-run setup screen** (`SetupScreen.tsx`, also Accounts > Check my setup): each company line in plain words - "Line
  not set up on the phone system" (ask AEM, nothing to do on the phone), "Wrong kind of line", "Can't reach the phone
  system", "Phone system refused the login", "Couldn't connect" - plus microphone permission and whether calls ring
  when the app is closed (no Firebase yet = "keep the app open").
- **Desktop app** (`desktop/`, Electron 45): one instance, tray (closing the window keeps it ringing), incoming calls bring
  the window forward and flash the taskbar, microphone + notifications only. App-password sign-in (Microsoft sign-in on
  desktop is not wired yet). ONE allows the `app://phone` origin (backend app.ts CORS) - needs that backend deploy.
  Build: `npm run export:web`, then in `desktop/`: `npm install`, `npm run dist:win` -> `desktop/release/The One MSP
  Phone Setup <ver>.exe` (UNSIGNED - sign with Azure Trusted Signing before giving it to customers).
- Web dialogs: `src/components/ask.ts` (Alert.alert does nothing in a browser).

### Big Property Sale lines (checked read-only on voip1, 3 Nov 2026)
`bps200-app` (Richard), `bps201-app` (Liam), `bps202-app` (Michelle) exist: WebRTC (wss, DTLS, ICE, opus/alaw/ulaw),
allow_transfer, max_contacts 5 with remove_existing, context = BPS internal (200-202 dial each other, so transfers to
an extension work). The BPS menu dials `Local/bps20x-app@cust-app` for 25 s. voip1's `[cust-app]` is still the old
version (rings only a registered app - no push wait) until `ops/voip1/app-push/cust-app-push.py` is applied.
Note: an internal call / transfer to 200-202 rings the Wazo user directly (not through [cust-app]), so it reaches the
app only while it is registered (open), push or not.

## 6 Nov 2026: click to dial (desktop) and call lists

Like VIP's Companion: a number goes to the app, the desk phone rings, and picking it up calls the number. **Not yet tested
with a real call, hotkey or installer.**

**Call from.** Keypad, Contacts, Recents and Call list show "Call from: Desk phone / This computer" for the selected
company, remembered per account on this device. An account with a desk phone starts on Desk phone. Phones, and accounts
with no desk phone, don't show the choice. ONE says who has one: `GET /api/softphone/desk-phones` looks for the line
`<key><ext>` (the app line without `-app`) on voip1, so people with no `-app` line on voip1 yet can still use their
desk phone from the app, as long as they have an account in ONE.

**Desk phone calls.** `POST /api/softphone/desk-dial` with `{ accountId, number }`. ONE works out the line from the
signed-in person's own account, applies the phone book's barring (UK and extensions, no 09) and logs `click_to_dial`.
voip1 rings the handset and only dials after it is answered, with Wazo's auto-answer off. A handset set to answer by
itself would defeat that.

**Numbers from outside the app.** `tel:` and `callto:` links, and a hotkey (default Ctrl+Shift+D, change it in Settings)
that copies the selected text in any app and puts the clipboard back. Desk phone mode sends straight away, because
picking up is the confirmation. This computer shows a confirm box first. Anything that isn't a number only shows a
message. The Keypad also takes a typed or pasted number in any format: Enter or Call dials it.
- After installing, Windows needs the app choosing once for TEL and CALLTO (Settings > Dial from anywhere has the link).
- The hotkey presses Ctrl+C through a hidden PowerShell (.NET SendKeys), so no native module. Windows only: macOS needs
  its own copy step and the Accessibility permission. A locked-down PC (PowerShell blocked, or antivirus stopping
  SendKeys) gets a "paste it into the Keypad" message.
- The clipboard's text, HTML, RTF and picture are put back. Other things on it, such as files copied in Explorer, aren't.

**Call list** (`src/calllist/`, desktop tab). Import .csv or .xlsx (first sheet with data, up to 5,000 rows and 10 MB),
map the columns, numbers are cleaned, duplicates dropped, and rows that can't be used are listed with the reason. Then
click to call, mark done / no answer / call back with a note, Next, progress, delete. **Stored only on this computer**
(the app's local storage, not encrypted, kept per signed-in person after sign-out), never in ONE. xlsx is read with
`read-excel-file` (MIT) after a check on the zip's unpacked size. Formulas aren't run, and cells stay plain text.

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
| `src/dial/` | Number clean-up (same rules as ONE) and the Call from rules, with tests |
| `src/calllist/` | Call list: spreadsheet parsing and limits, the list itself, with tests |
| `src/desktop/bridge.ts` | Typed view of the Electron bridge (`desktop/preload.js`) |
| `desktop/` | Electron shell. Loads the web export of the same UI. `dial.js` = links and hotkey logic, with tests |

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
| Ringing on a locked phone | **Built (milestone 2), untested on a device** | Android needs the Firebase project; iPhone needs the Apple Developer enrolment + APNs key |
| Company logo per account | `logoUrl` is always null | ONE's Client has no logo field yet |
| Microsoft sign-in on desktop/web | Mobile only | The return URL is `theonemspphone://sso`. Electron needs the protocol registered (milestone 2) |
| Desktop app | Stub that loads the web export | Spec: mobile first. Electron is the next milestone |
| Transfer | Blind transfer built 3 Nov (untested on voip1); attended, 3-way, park, Move to... not started | Milestone 3 |
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

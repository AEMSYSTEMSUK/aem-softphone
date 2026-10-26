import Constants from 'expo-constants';

// ONE's API. Override per build in app.json -> expo.extra.apiBase (e.g. a staging ONE). No secrets live in the app:
// SIP logins and TURN credentials come from ONE after sign-in, and only the refresh token is kept (in the keychain).
const extra = (Constants.expoConfig?.extra || {}) as { apiBase?: string };
export const API_BASE = (extra.apiBase || 'https://one.aemtech.co.uk/api').replace(/\/$/, '');
export const APP_SCHEME = 'theonemspphone'; // must match app.json expo.scheme and ONE's softphone-auth APP_SCHEME
export const SSO_RETURN_URL = `${APP_SCHEME}://sso`;
export const APP_NAME = 'The One MSP Phone';
export const APP_VERSION = Constants.expoConfig?.version || '0.0.0';

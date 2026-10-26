import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Refresh token + device id live in the OS keychain / keystore (spec section 4.5). On web / the Electron shell there is
// no keychain, so it falls back to localStorage - acceptable for the dev shell only; milestone 2's Electron build moves
// this to Electron safeStorage via the preload bridge.
const web = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  if (web) { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (web) { try { globalThis.localStorage?.setItem(key, value); } catch { /* private mode */ } return; }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (web) { try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ } return; }
  await SecureStore.deleteItemAsync(key);
}

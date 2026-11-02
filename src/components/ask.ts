import { Alert, AlertButton, Platform } from 'react-native';

// Alert.alert does nothing in a browser / the Electron desktop app (react-native-web), so the desktop build asks with
// the browser's own dialogs instead (3 Nov 2026). Several choices -> a numbered prompt.
export function ask(title: string, message: string, buttons: AlertButton[] = [{ text: 'OK' }]) {
  if (Platform.OS !== 'web') { Alert.alert(title, message, buttons); return; }
  const w = globalThis as unknown as { confirm: (m: string) => boolean; prompt: (m: string) => string | null; alert: (m: string) => void };
  const real = buttons.filter((b) => b.style !== 'cancel');
  if (real.length <= 1) {
    if (buttons.length <= 1) { w.alert(`${title}\n\n${message}`); real[0]?.onPress?.(); return; }
    if (w.confirm(`${title}\n\n${message}`)) real[0]?.onPress?.();
    return;
  }
  const pick = w.prompt(`${title}\n\n${message}\n\n${real.map((b, i) => `${i + 1}. ${b.text}`).join('\n')}\n\nType a number:`);
  const n = Number(pick);
  if (Number.isInteger(n) && n >= 1 && n <= real.length) real[n - 1].onPress?.();
}

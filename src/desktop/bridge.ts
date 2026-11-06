// The Electron shell's window.oneMspPhone (desktop/preload.js), typed. Undefined on phones and in a plain browser, so
// everything here is safe to call anywhere. What comes across is checked again before use.
export type DialRequest = { source: 'link' | 'hotkey'; text: string; error: string };
export interface HotkeyStatus { supported: boolean; accelerator: string; registered: boolean; error: string | null }

interface Bridge {
  desktop: true;
  onDialRequest: (cb: (r: DialRequest) => void) => () => void;
  bringForward: () => void;
  getHotkey: () => Promise<HotkeyStatus>;
  setHotkey: (accelerator: string) => Promise<HotkeyStatus>;
  openDefaultApps: () => void;
}

const bridge = () => (globalThis as unknown as { oneMspPhone?: Bridge }).oneMspPhone;

export const isDesktop = () => bridge()?.desktop === true;
export const onDialRequest = (cb: (r: DialRequest) => void) => bridge()?.onDialRequest?.(cb) ?? (() => undefined);
export const bringForward = () => bridge()?.bringForward?.();
export const getHotkey = async () => (await bridge()?.getHotkey?.()) ?? null;
export const setHotkey = async (a: string) => (await bridge()?.setHotkey?.(a)) ?? null;
export const openDefaultApps = () => bridge()?.openDefaultApps?.();

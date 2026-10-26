import { StyleSheet } from 'react-native';

// AEM branding placeholder - per-company name/logo per account comes from ONE (spec decision 1).
export const colors = {
  brand: '#0b5cad',
  brandDark: '#083f77',
  bg: '#f4f6f9',
  card: '#ffffff',
  text: '#16202c',
  muted: '#5f6b7a',
  border: '#dde3ea',
  green: '#1f9d55',
  red: '#d64545',
  amber: '#c98a00',
};

export const statusLabel: Record<string, { text: string; color: string }> = {
  available: { text: 'Available', color: colors.green },
  dnd: { text: 'Do not disturb', color: colors.red },
  out_of_hours: { text: 'Out of hours', color: colors.amber },
  holiday: { text: 'Holiday', color: colors.amber },
  disabled: { text: 'Switched off', color: colors.muted },
};

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16 },
  h1: { fontSize: 22, fontWeight: '700', color: colors.text },
  h2: { fontSize: 17, fontWeight: '600', color: colors.text },
  muted: { color: colors.muted },
  small: { fontSize: 12, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.text },
  btn: { backgroundColor: colors.brand, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  btnGhost: { borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.brand },
  btnGhostText: { color: colors.brand, fontWeight: '600', fontSize: 16 },
  error: { color: colors.red, marginVertical: 8 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});

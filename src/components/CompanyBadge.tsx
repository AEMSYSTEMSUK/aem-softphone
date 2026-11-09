import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { colors } from './theme';

// 9 Nov 2026 (Andy: one app for everyone, branded per company inside it). The company's logo from ONE
// (Client > Branding), or a coloured initials badge when there isn't one / it fails to load.
const PALETTE = ['#0b5cad', '#1f9d55', '#7a3fb0', '#c2410c', '#0f766e', '#b4235a', '#4f46e5', '#a16207'];

export const initials = (name: string) =>
  name.replace(/\b(ltd|limited|plc|llp|uk|the)\b\.?/gi, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

const colourFor = (key: string) => PALETTE[[...key].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % PALETTE.length];

export default function CompanyBadge({ name, logoUrl, size = 36 }: { name: string; logoUrl: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={{ uri: logoUrl }} style={{ width: size - 4, height: size - 4 }} resizeMode="contain" onError={() => setFailed(true)} accessibilityLabel={`${name} logo`} />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: colourFor(name), alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={name}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.4 }}>{initials(name)}</Text>
    </View>
  );
}

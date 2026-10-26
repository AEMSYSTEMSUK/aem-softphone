// iOS / Android: react-native-webrtc provides RTCPeerConnection + mediaDevices as globals for JsSIP. It is a native
// module, so it only exists in a development / store build (EAS), not in Expo Go - there we fall back to the stub engine.
let done: { ok: boolean; reason: string | null } | null = null;

export function ensureWebRTC(): { ok: boolean; reason: string | null } {
  if (done) return done;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rnw = require('react-native-webrtc') as { registerGlobals: () => void };
    rnw.registerGlobals();
    done = { ok: true, reason: null };
  } catch {
    done = { ok: false, reason: 'Calling needs the full app build (WebRTC is not in Expo Go)' };
  }
  return done;
}

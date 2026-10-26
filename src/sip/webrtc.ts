// Web / Electron: the browser already has RTCPeerConnection + getUserMedia.
export function ensureWebRTC(): { ok: boolean; reason: string | null } {
  const g = globalThis as { RTCPeerConnection?: unknown; navigator?: { mediaDevices?: unknown } };
  return g.RTCPeerConnection && g.navigator?.mediaDevices ? { ok: true, reason: null } : { ok: false, reason: 'This browser has no WebRTC' };
}

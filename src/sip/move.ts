// "Move to my other device" (13 Nov 2026). The app transfers the call to MOVE_CODE; voip1 ([cust-move] in
// cust-routing.conf) wakes the person's phone by push and rings their app line again, with X-AEM-Move: 1 on the INVITE
// and move=1 in the push. The device that started the move ignores both for a short while, so only the OTHER device rings.
export const MOVE_CODE = '*668';
const WINDOW_MS = 60_000;
let movedAt = 0;
export function markMoved() { movedAt = Date.now(); }
export function justMoved() { return !!movedAt && Date.now() - movedAt < WINDOW_MS; }

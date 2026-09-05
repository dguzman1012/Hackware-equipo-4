export const SHUTTLE_HALF_MS = 700;
export const SHUTTLE_SPEED = 0.8;

export type ShuttlePhase = 'forward' | 'back';

export function shuttlePhase(now: number): ShuttlePhase {
  const period = SHUTTLE_HALF_MS * 2;
  const t = ((now % period) + period) % period;
  return t < SHUTTLE_HALF_MS ? 'forward' : 'back';
}

export function shuttleDrive(now: number): { left: number; right: number } {
  const v = shuttlePhase(now) === 'forward' ? SHUTTLE_SPEED : -SHUTTLE_SPEED;
  return { left: v, right: v };
}

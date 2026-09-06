// Invariantes del cerebro. Rojos hasta implementar brain.ts (pasos 2 y 4 del plan). Sin hardware ni red.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { T, initialState, plan, reduce } from '../src/brain';
import type { RobotState } from '../src/brain';
import type { SceneRead } from '../src/perception';

const STOP = { left: 0, right: 0 };

const read = (frameId: number, capturedAt: number, cx: number | null, action: SceneRead['action'] = null): SceneRead => ({
  frameId,
  capturedAt,
  target: cx === null ? null : { cx, cy: 0.5, size: 0.1, confidence: 0.9 },
  action,
  caption: '',
  latencyMs: 300,
});

/** running, con un frame fresco y dos lecturas seguidas de Gaucho a la derecha → chasing. */
function chasingState(): { s: RobotState; now: number } {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  for (const [id, t] of [[1, 100], [2, 200]] as const) {
    s = reduce(s, { type: 'frame', capturedAt: t }, t);
    s = reduce(s, { type: 'scene', read: read(id, t, 0.8) }, t + 50);
  }
  return { s, now: 250 };
}

test('arranca parado y quieto; arrancar es explícito', () => {
  const s = initialState(0);
  assert.equal(s.run, 'stopped');
  assert.deepEqual(plan(s, 0).drive, STOP);
  assert.equal(reduce(s, { type: 'run', run: 'running' }, 10).behavior.kind, 'searching');
});

test('parar frena aunque haya acción fresca del LLM', () => {
  let { s, now } = chasingState();
  s = reduce(s, { type: 'scene', read: read(3, now, 0.5, { kind: 'forward', speed: 0.5, durationMs: 1000 }) }, now + 50);
  assert.notDeepEqual(plan(s, now + 100).drive, STOP);
  s = reduce(s, { type: 'run', run: 'stopped' }, now + 110);
  assert.deepEqual(plan(s, now + 120).drive, STOP);
});

test('searching holds still until a clear miss on this pose', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  s = reduce(s, { type: 'frame', capturedAt: 0 }, 0);
  assert.deepEqual(plan(s, 100).drive, STOP, 'no turn before the first read');

  s = reduce(s, { type: 'scene', read: read(1, 0, null) }, 2000);
  const step = plan(s, 2000).drive;
  assert.ok(step.left !== 0 && step.left === -step.right, 'miss on this pose arms one step');
  assert.deepEqual(plan(s, 2000 + T.searchStepMs + 10).drive, STOP, 'step is short');
});

test('a miss during an armed step does not stack another turn', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  s = reduce(s, { type: 'frame', capturedAt: 0 }, 0);
  s = reduce(s, { type: 'scene', read: read(1, 0, null) }, 100);
  const first = plan(s, 100).drive;
  s = reduce(s, { type: 'scene', read: read(2, 80, null) }, 120);
  const again = plan(s, 120).drive;
  assert.ok(first.left !== 0);
  assert.deepEqual(again, first);
});

test('low confidence in the frame holds still', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  s = reduce(s, { type: 'frame', capturedAt: 0 }, 0);
  const weak: SceneRead = {
    ...read(1, 0, 0.5),
    target: { cx: 0.5, cy: 0.5, size: 0.2, confidence: 0.2 },
  };
  s = reduce(s, { type: 'scene', read: weak }, 500);
  assert.equal(s.behavior.kind, 'searching');
  assert.deepEqual(plan(s, 500).drive, STOP);
});

test('off-center target micro-adjusts then goes straight', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  s = reduce(s, { type: 'frame', capturedAt: 0 }, 0);
  s = reduce(s, { type: 'scene', read: read(1, 0, 0.8) }, 100);
  const burst = plan(s, 100).drive;
  assert.ok(burst.left > burst.right, 'bbox on the right → short right turn');
  const after = plan(s, 100 + T.chase.alignMaxMs + 10).drive;
  assert.equal(after.left, after.right);
  assert.ok(after.left > 0, 'after the burst, advance');
});

test('Gaucho in the middle of a search pose chases and does not spin', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  s = reduce(s, { type: 'frame', capturedAt: 0 }, 0);
  s = reduce(s, { type: 'scene', read: read(1, 0, 0.5) }, 800);
  assert.equal(s.behavior.kind, 'chasing');
  const d = plan(s, 800).drive;
  assert.ok(d.left > 0 && d.right > 0);
  assert.ok(Math.abs(d.left - d.right) < 0.05, 'centered target goes forward, not a search spin');
});

test('after one search step, the next turn waits for a new miss', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  s = reduce(s, { type: 'frame', capturedAt: 0 }, 0);
  s = reduce(s, { type: 'scene', read: read(1, 0, null) }, 100);
  s = reduce(s, { type: 'tick' }, 100 + T.searchStepMs + 1);
  assert.deepEqual(plan(s, 100 + T.searchStepMs + 1).drive, STOP);
  s = reduce(s, { type: 'frame', capturedAt: 400 }, 400);
  s = reduce(s, { type: 'scene', read: read(2, 400, null) }, 410);
  const again = plan(s, 410).drive;
  assert.ok(again.left !== 0 && again.left === -again.right);
});

test('searching → chasing requiere confirmHits lecturas y gira hacia el target (P-control sin acción del LLM)', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  s = reduce(s, { type: 'frame', capturedAt: 900 }, 900);
  s = reduce(s, { type: 'scene', read: read(1, 900, 0.8) }, 1000);
  assert.equal(s.behavior.kind, 'chasing');
  const d = plan(s, 1000).drive;
  assert.ok(d.left > d.right, 'Gaucho a la derecha → gira a la derecha');
});

test('chase ignores LLM left/back and still steers toward the target', () => {
  let { s, now } = chasingState();
  s = reduce(s, { type: 'scene', read: read(3, now, 0.8, { kind: 'left', speed: 0.5, durationMs: 800 }) }, now + 50);
  const d1 = plan(s, now + 100).drive;
  assert.ok(d1.left > 0 && d1.right > 0);
  assert.ok(d1.left > d1.right, 'bbox on the right still turns right');
  s = reduce(s, { type: 'scene', read: read(4, now + 10, 0.8, { kind: 'back', speed: 0.5, durationMs: 800 }) }, now + 60);
  const d2 = plan(s, now + 80).drive;
  assert.ok(d2.left > 0 && d2.right > 0, 'back from the LLM does not reverse a chase');
});

test('la duración de la acción se recorta a actionMaxMs y la velocidad a actionSpeedCap', () => {
  let { s, now } = chasingState();
  s = reduce(s, { type: 'scene', read: read(3, now, 0.5, { kind: 'forward', speed: 1, durationMs: 60000 }) }, now + 50);
  const d = plan(s, now + 100).drive;
  assert.ok(d.left <= T.actionSpeedCap && d.right <= T.actionSpeedCap);
  assert.ok(s.action !== null && s.action.until <= now + 50 + T.actionMaxMs, 'vence desde que llega la lectura');
});

test('lecturas fuera de orden y viejas se descartan', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  s = reduce(s, { type: 'scene', read: read(5, 1000, 0.5) }, 1100);
  const before = s.target;
  s = reduce(s, { type: 'scene', read: read(3, 800, 0.1) }, 1200);
  assert.equal(s.target, before, 'frameId menor no pisa');
  s = reduce(s, { type: 'scene', read: read(9, 1000, 0.1) }, 1000 + T.readMaxAgeMs + 1);
  assert.equal(s.target, before, 'frame más viejo que readMaxAgeMs no pisa');
});

test('sin ver a Gaucho: chasing → lost → searching, y el since no se reinicia con ticks repetidos', () => {
  let { s, now } = chasingState();
  assert.equal(s.behavior.kind, 'chasing');
  s = reduce(s, { type: 'tick' }, now + T.lostAfterMs + 1);
  assert.equal(s.behavior.kind, 'lost');
  assert.deepEqual(plan(s, now + T.lostAfterMs + 2).drive, STOP, 'llora quieta');
  const since = s.behavior.since;
  s = reduce(s, { type: 'tick' }, since + 10);
  assert.equal(s.behavior.since, since);
  s = reduce(s, { type: 'tick' }, since + T.sadMs + 1);
  assert.equal(s.behavior.kind, 'searching');
});

test('tone: search silent, chase/found hold love, lost sad, stop silent', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  s = reduce(s, { type: 'frame', capturedAt: 100 }, 100);
  assert.equal(plan(s, 200).tone, 0, 'searching stays silent so the LEDs wink');

  let { s: chase, now } = chasingState();
  assert.equal(plan(chase, now).tone, 2);
  assert.equal(plan(chase, now + 1000).tone, 2, 'chase holds love so the LEDs stay ON');

  const close: SceneRead = {
    ...read(3, now, 0.5),
    target: { cx: 0.5, cy: 0.5, size: 0.4, confidence: 0.9 },
  };
  chase = reduce(chase, { type: 'frame', capturedAt: now }, now);
  chase = reduce(chase, { type: 'scene', read: close }, now + 50);
  assert.equal(chase.behavior.kind, 'found');
  assert.equal(plan(chase, now + 60).tone, 2);

  const lostAt = now + 50 + T.lostAfterMs + 1;
  chase = reduce(chase, { type: 'tick' }, lostAt);
  assert.equal(chase.behavior.kind, 'lost');
  assert.equal(plan(chase, lostAt + 1).tone, 3);

  chase = reduce(chase, { type: 'run', run: 'stopped' }, lostAt + 2);
  assert.equal(plan(chase, lostAt + 3).tone, 0);
});

test('arrancar sets an unseen clip', () => {
  const s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  assert.ok(s.say.clip !== null && s.say.clip >= 4 && s.say.clip <= 6);
  assert.notEqual(s.say.token, 0);
});

test('searching→chasing sets a seen clip and bumps token', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  s = reduce(s, { type: 'frame', capturedAt: 900 }, 900);
  const quiet = s.say;
  assert.ok(quiet.clip !== null && quiet.clip >= 4 && quiet.clip <= 6);
  s = reduce(s, { type: 'scene', read: read(1, 900, 0.8) }, 1000);
  assert.equal(s.behavior.kind, 'chasing');
  assert.ok(s.say.clip !== null && s.say.clip >= 1 && s.say.clip <= 3);
  assert.notEqual(s.say.token, quiet.token);
});

test('10 Hz tick does not change say', () => {
  const { s, now } = chasingState();
  const held = s.say;
  const next = reduce(s, { type: 'tick' }, now + 100);
  assert.deepEqual(next.say, held);
  assert.deepEqual(plan(next, now + 100).say, held);
  assert.deepEqual(plan(next, now + 200).say, held);
});

test('chasing→found bumps say and keeps driving forward', () => {
  let { s, now } = chasingState();
  const held = s.say;
  const close: SceneRead = {
    ...read(3, now, 0.5),
    target: { cx: 0.5, cy: 0.5, size: 0.4, confidence: 0.9 },
  };
  s = reduce(s, { type: 'frame', capturedAt: now }, now);
  s = reduce(s, { type: 'scene', read: close }, now + 50);
  assert.equal(s.behavior.kind, 'found');
  assert.notEqual(s.say.token, held.token);
  assert.ok(s.say.clip !== null && s.say.clip >= 1 && s.say.clip <= 3);
  const d = plan(s, now + 60).drive;
  assert.ok(d.left > 0 && d.right > 0, 'found still advances toward Gaucho');
});

test('stop from the LLM does not freeze a chase', () => {
  let { s, now } = chasingState();
  s = reduce(
    s,
    { type: 'scene', read: read(3, now, 0.8, { kind: 'stop', speed: 0, durationMs: 1000 }) },
    now + 50,
  );
  const d = plan(s, now + 100).drive;
  assert.ok(d.left > 0 && d.right > 0);
  assert.ok(d.left > d.right, 'still steers toward the target on the right');
});

test('chasing→lost sets an unseen clip and bumps token', () => {
  let { s, now } = chasingState();
  const held = s.say;
  s = reduce(s, { type: 'tick' }, now + T.lostAfterMs + 1);
  assert.equal(s.behavior.kind, 'lost');
  assert.ok(s.say.clip !== null && s.say.clip >= 4 && s.say.clip <= 6);
  assert.notEqual(s.say.token, held.token);
});

test('clamp de seguridad: sin frames frescos no se mueve; con obstáculo no avanza', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  assert.deepEqual(plan(s, 10).drive, STOP, 'nunca hubo frame');
  s = reduce(s, { type: 'frame', capturedAt: 0 }, 0);
  assert.deepEqual(plan(s, 50).drive, STOP, 'searching waits for a miss');
  s = reduce(s, { type: 'scene', read: read(1, 0, null) }, 80);
  assert.notDeepEqual(plan(s, 80).drive, STOP, 'clear miss arms a search step');
  s = reduce(s, { type: 'scene', read: read(1, 100, null, { kind: 'forward', speed: 0.5, durationMs: 1000 }) }, 150);
  s = reduce(s, { type: 'telemetry', distCm: 10, yawDeg: null }, 300);
  const d = plan(s, 300).drive;
  assert.ok(!(d.left > 0 && d.right > 0), 'con obstáculo no avanza aunque el LLM pida forward');
});

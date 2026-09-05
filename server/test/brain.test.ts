// Invariantes del cerebro. Rojos hasta implementar brain.ts (pasos 2 y 4 del plan). Sin hardware ni red.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { T, initialState, plan, reduce } from '../src/brain';
import type { RobotState } from '../src/brain';
import type { Frame, LookoutRead, SceneRead } from '../src/perception';
import { parseLookoutJson } from '../src/readers';

const STOP = { left: 0, right: 0 };

const read = (frameId: number, capturedAt: number, cx: number | null, action: SceneRead['action'] = null): SceneRead => ({
  frameId,
  capturedAt,
  target: cx === null ? null : { cx, cy: 0.5, size: 0.1, confidence: 0.9 },
  action,
  caption: '',
  latencyMs: 300,
});

const lookout = (frameId: number, capturedAt: number, turn: LookoutRead['turn']): LookoutRead => ({
  frameId,
  capturedAt,
  turn,
  confidence: 0.9,
  latencyMs: 300,
});

const lookoutFrame: Frame = { frameId: 1, capturedAt: 100, jpeg: new Uint8Array(), width: 1, height: 1 };

/** running, searching, con un frame fresco para que el clamp de cámara no frene. */
function searchingState(now = 100): RobotState {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  return reduce(s, { type: 'frame', capturedAt: now }, now);
}

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

test('searching → chasing requiere confirmHits lecturas y gira hacia el target (P-control sin acción del LLM)', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  s = reduce(s, { type: 'frame', capturedAt: 900 }, 900);
  s = reduce(s, { type: 'scene', read: read(1, 900, 0.8) }, 1000);
  assert.equal(s.behavior.kind, 'searching');
  s = reduce(s, { type: 'frame', capturedAt: 1900 }, 1900);
  s = reduce(s, { type: 'scene', read: read(2, 1900, 0.8) }, 2000);
  assert.equal(s.behavior.kind, 'chasing');
  const d = plan(s, 2000).drive;
  assert.ok(d.left > d.right, 'Gaucho a la derecha → gira a la derecha');
});

test('la acción del LLM manda mientras está fresca; al vencer cae al P-control', () => {
  let { s, now } = chasingState();
  s = reduce(s, { type: 'scene', read: read(3, now, 0.8, { kind: 'left', speed: 0.5, durationMs: 800 }) }, now + 50);
  const d1 = plan(s, now + 100).drive;
  assert.ok(d1.right > d1.left, 'obedece "left" aunque el target esté a la derecha');
  const d2 = plan(s, now + 900).drive;
  assert.ok(d2.left > d2.right, 'vencida la acción, el P-control gira hacia el target');
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

test('clamp de seguridad: sin frames frescos no se mueve; con obstáculo no avanza', () => {
  let s = reduce(initialState(0), { type: 'run', run: 'running' }, 0);
  assert.deepEqual(plan(s, 10).drive, STOP, 'nunca hubo frame');
  s = reduce(s, { type: 'frame', capturedAt: 100 }, 100);
  assert.notDeepEqual(plan(s, 200).drive, STOP, 'searching gira');
  s = reduce(s, { type: 'scene', read: read(1, 100, null, { kind: 'forward', speed: 0.5, durationMs: 1000 }) }, 150);
  s = reduce(s, { type: 'telemetry', distCm: 10, yawDeg: null }, 300);
  const d = plan(s, 300).drive;
  assert.ok(!(d.left > 0 && d.right > 0), 'con obstáculo no avanza aunque el LLM pida forward');
});

test('searching + lookout right gira a la derecha', () => {
  let s = searchingState(100);
  s = reduce(s, { type: 'lookout', read: lookout(1, 100, 'right') }, 150);
  const d = plan(s, 200).drive;
  assert.ok(d.left > d.right, 'spin(1) = rueda izq adelante');
});

test('searching + lookout left gira a la izquierda', () => {
  let s = searchingState(100);
  s = reduce(s, { type: 'lookout', read: lookout(1, 100, 'left') }, 150);
  const d = plan(s, 200).drive;
  assert.ok(d.right > d.left, 'spin(-1) = rueda der adelante');
});

test('searching + lookout ahead avanza lookoutForward', () => {
  let s = searchingState(100);
  s = reduce(s, { type: 'lookout', read: lookout(1, 100, 'ahead') }, 150);
  const d = plan(s, 200).drive;
  assert.equal(d.left, T.lookoutForward);
  assert.equal(d.right, T.lookoutForward);
});

test('lookout vencido cae al spin ciego', () => {
  let withHint = searchingState(0);
  withHint = reduce(withHint, { type: 'lookout', read: lookout(1, 0, 'right') }, 50);
  const now = 50 + T.lookoutMaxMs + 1;
  withHint = reduce(withHint, { type: 'frame', capturedAt: now }, now);
  const without = reduce(searchingState(0), { type: 'frame', capturedAt: now }, now);
  assert.deepEqual(plan(withHint, now).drive, plan(without, now).drive);
});

test('chasing ignora un lookout fresco', () => {
  let { s, now } = chasingState();
  s = reduce(s, { type: 'lookout', read: lookout(10, now, 'left') }, now + 10);
  const d = plan(s, now + 20).drive;
  assert.ok(d.left > d.right, 'P-control hacia cx=0.8; lookout left no manda');
});

test('parseLookoutJson: unknown y gaucho ausente → null; right con ambos → right', () => {
  const base = { robot_found: true, gaucho_found: true, confidence: 0.9 };
  assert.equal(parseLookoutJson(JSON.stringify({ ...base, turn: 'unknown' }), lookoutFrame, 10).turn, null);
  assert.equal(
    parseLookoutJson(JSON.stringify({ ...base, gaucho_found: false, turn: 'right' }), lookoutFrame, 10).turn,
    null,
  );
  assert.equal(parseLookoutJson(JSON.stringify({ ...base, turn: 'right' }), lookoutFrame, 10).turn, 'right');
});

test('lookout: frameId viejo y turn null no pisan el hint', () => {
  let s = searchingState(100);
  s = reduce(s, { type: 'lookout', read: lookout(2, 100, 'right') }, 150);
  const stored = s.lookout;
  s = reduce(s, { type: 'lookout', read: lookout(1, 120, 'left') }, 160);
  assert.equal(s.lookout, stored, 'frameId menor no pisa');
  s = reduce(s, { type: 'lookout', read: lookout(3, 130, null) }, 170);
  assert.equal(s.lookout, stored, 'turn null deja el hint anterior');
});

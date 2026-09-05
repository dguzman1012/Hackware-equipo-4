// Invariantes del cerebro. Rojos hasta implementar brain.ts (paso 2 y 4 del plan). Sin hardware ni red.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { T, initialState, plan, reduce } from '../src/brain';
import type { Detection } from '../src/perception';

const det = (frameId: number, capturedAt: number, cx: number, size = 0.1): Detection => ({
  frameId,
  capturedAt,
  target: { cx, cy: 0.5, size, confidence: 0.9 },
  caption: '',
  latencyMs: 300,
});

test('arranca en puppet y quieto', () => {
  const s = initialState(0);
  assert.equal(s.mode, 'puppet');
  assert.deepEqual(plan(s, 0).drive, { left: 0, right: 0 });
});

test('stick mueve en puppet y el dead-man frena a los 500 ms', () => {
  let s = reduce(initialState(0), { type: 'stick', x: 0, y: 1 }, 100);
  assert.ok(plan(s, 150).drive.left > 0);
  assert.deepEqual(plan(s, 100 + T.stickDeadmanMs + 1).drive, { left: 0, right: 0 });
});

test('cualquier stick en auto pasa a puppet; volver a auto es explícito', () => {
  let s = reduce(initialState(0), { type: 'mode', mode: 'auto' }, 0);
  assert.equal(s.mode, 'auto');
  s = reduce(s, { type: 'stick', x: 0.5, y: 0 }, 10);
  assert.equal(s.mode, 'puppet');
  s = reduce(s, { type: 'tick' }, 5000);
  assert.equal(s.mode, 'puppet');
});

test('searching → chasing requiere CONFIRM_HITS detecciones y gira hacia el target', () => {
  let s = reduce(initialState(0), { type: 'mode', mode: 'auto' }, 0);
  s = reduce(s, { type: 'frame', capturedAt: 900 }, 900);
  s = reduce(s, { type: 'detection', detection: det(1, 900, 0.8) }, 1000);
  assert.equal(s.behavior.kind, 'searching');
  s = reduce(s, { type: 'frame', capturedAt: 1900 }, 1900);
  s = reduce(s, { type: 'detection', detection: det(2, 1900, 0.8) }, 2000);
  assert.equal(s.behavior.kind, 'chasing');
  const d = plan(s, 2000).drive;
  assert.ok(d.left > d.right, 'Gaucho a la derecha → gira a la derecha');
});

test('detecciones fuera de orden y viejas se descartan', () => {
  let s = reduce(initialState(0), { type: 'mode', mode: 'auto' }, 0);
  s = reduce(s, { type: 'detection', detection: det(5, 1000, 0.5) }, 1100);
  const before = s.target;
  s = reduce(s, { type: 'detection', detection: det(3, 800, 0.1) }, 1200);
  assert.equal(s.target, before, 'frameId menor no pisa');
  s = reduce(s, { type: 'detection', detection: det(9, 1000, 0.1) }, 1000 + T.detectionMaxAgeMs + 1);
  assert.equal(s.target, before, 'frame más viejo que detectionMaxAgeMs no pisa');
});

test('sin ver a Gaucho: chasing → lost → searching, y el since no se reinicia con ticks repetidos', () => {
  let s = reduce(initialState(0), { type: 'mode', mode: 'auto' }, 0);
  for (const [id, t] of [[1, 100], [2, 200]] as const) {
    s = reduce(s, { type: 'frame', capturedAt: t }, t);
    s = reduce(s, { type: 'detection', detection: det(id, t, 0.5) }, t + 50);
  }
  assert.equal(s.behavior.kind, 'chasing');
  s = reduce(s, { type: 'tick' }, 200 + T.lostAfterMs + 1);
  assert.equal(s.behavior.kind, 'lost');
  const since = s.behavior.since;
  s = reduce(s, { type: 'tick' }, since + 10);
  assert.equal(s.behavior.since, since);
  s = reduce(s, { type: 'tick' }, since + T.sadMs + 1);
  assert.equal(s.behavior.kind, 'searching');
});

test('clamp de seguridad: en auto sin frames frescos no se mueve; con obstáculo no avanza', () => {
  let s = reduce(initialState(0), { type: 'mode', mode: 'auto' }, 0);
  assert.deepEqual(plan(s, 10).drive, { left: 0, right: 0 }, 'nunca hubo frame');
  s = reduce(s, { type: 'frame', capturedAt: 100 }, 100);
  assert.notDeepEqual(plan(s, 200).drive, { left: 0, right: 0 }, 'searching gira');
  s = reduce(s, { type: 'telemetry', distCm: 10, yawDeg: null }, 300);
  const d = plan(s, 300).drive;
  assert.ok(!(d.left > 0 && d.right > 0), 'con obstáculo no avanza');
});

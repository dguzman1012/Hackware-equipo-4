import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialState, plan } from '../src/brain';
import { encodeCommand, MAX_SET_LINE, parseInbound } from '../src/esp';

test('encodeCommand produce la línea S del contrato', () => {
  assert.equal(
    encodeCommand(1043, {
      drive: { left: 0.7059, right: -0.7059 },
      servo: { deg1: 90, deg2: 90 },
      tone: 0,
      say: { token: 0, clip: null },
    }),
    'S 1043 -180 180 90 90 0 0 0\n',
  );
});

test('encodeCommand silent initial state is eight fields', () => {
  assert.equal(encodeCommand(1, plan(initialState(0), 0)), 'S 1 0 0 90 90 0 0 0\n');
});

test('encodeCommand length at extremes stays under MAX_SET_LINE', () => {
  const line = encodeCommand(0xffff_ffff, {
    drive: { left: -1, right: -1 },
    servo: { deg1: 180, deg2: 180 },
    tone: 4,
    say: { token: 63, clip: 6 },
  });
  assert.equal(line, 'S 4294967295 255 255 180 180 4 6 63\n');
  assert.ok(line.length <= MAX_SET_LINE);
});

test('parseInbound: T con -1 → null en dominio', () => {
  assert.deepEqual(parseInbound('T 1043 87 214 55120\n'), {
    kind: 'telemetry',
    t: { seqEcho: 1043, distCm: 87, yawDeg: 214, uptimeMs: 55120 },
  });
  assert.deepEqual(parseInbound('T 0 -1 -1 3020'), {
    kind: 'telemetry',
    t: { seqEcho: 0, distCm: null, yawDeg: null, uptimeMs: 3020 },
  });
});

test('parseInbound: H, campos extra y basura', () => {
  assert.deepEqual(parseInbound('H 1\n'), { kind: 'hello', fw: '1' });
  assert.deepEqual(parseInbound('T 7 50 10 1000 123')?.kind, 'telemetry', 'ignora campos extra (mic en v2)');
  assert.equal(parseInbound('garbage'), null);
  assert.equal(parseInbound('T 1 x 2 3'), null);
});

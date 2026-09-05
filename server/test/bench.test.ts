import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHUTTLE_SPEED, shuttleDrive, shuttlePhase } from '../src/bench';

test('shuttleDrive is forward 0.7s then back 0.7s', () => {
  assert.equal(shuttlePhase(0), 'forward');
  assert.deepEqual(shuttleDrive(0), { left: SHUTTLE_SPEED, right: SHUTTLE_SPEED });
  assert.deepEqual(shuttleDrive(699), { left: SHUTTLE_SPEED, right: SHUTTLE_SPEED });
  assert.equal(shuttlePhase(700), 'back');
  assert.deepEqual(shuttleDrive(700), { left: -SHUTTLE_SPEED, right: -SHUTTLE_SPEED });
  assert.deepEqual(shuttleDrive(1399), { left: -SHUTTLE_SPEED, right: -SHUTTLE_SPEED });
  assert.equal(shuttlePhase(1400), 'forward');
  assert.deepEqual(shuttleDrive(1400), { left: SHUTTLE_SPEED, right: SHUTTLE_SPEED });
});

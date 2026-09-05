import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialState, reduce } from '../src/brain';
import { FOUND_TWEET_TEXT, shouldTweetFound } from '../src/social';

function foundState() {
  let s = initialState(0);
  s = reduce(s, { type: 'run', run: 'running' }, 0);
  return { ...s, behavior: { kind: 'found' as const, since: 0, party: false } };
}

test('dispara al entrar a found viniendo de otro estado', () => {
  const s = foundState();
  assert.equal(shouldTweetFound('chasing', s, 0, 10_000, 5_000), true);
});

test('no dispara si ya estaba en found (sin cambio de estado)', () => {
  const s = foundState();
  assert.equal(shouldTweetFound('found', s, 0, 10_000, 5_000), false);
});

test('no dispara si no está en found', () => {
  let s = initialState(0);
  s = reduce(s, { type: 'run', run: 'running' }, 0);
  assert.equal(shouldTweetFound('searching', s, 0, 10_000, 5_000), false);
});

test('respeta el cooldown aunque haya transición fresca', () => {
  const s = foundState();
  const lastTweetAt = 5_000;
  const now = 5_000 + 60_000; // menos que el cooldown de 10 min
  assert.equal(shouldTweetFound('chasing', s, lastTweetAt, now, 10 * 60 * 1000), false);
});

test('dispara de nuevo pasado el cooldown', () => {
  const s = foundState();
  const lastTweetAt = 0;
  const now = 10 * 60 * 1000 + 1;
  assert.equal(shouldTweetFound('chasing', s, lastTweetAt, now, 10 * 60 * 1000), true);
});

test('el texto del tweet es el fijo, siempre el mismo', () => {
  assert.equal(FOUND_TWEET_TEXT, '¡MI AMOR, TE ENCONTRÉ! AHORA NO TE ME VAS A DESPEGAR NUNCA!');
});

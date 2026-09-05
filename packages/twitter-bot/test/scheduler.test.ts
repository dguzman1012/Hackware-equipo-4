import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickNext, runLoop } from '../src/scheduler';
import type { State } from '../src/state';

const tweets = [
  { id: 'a', text: 'a' },
  { id: 'b', text: 'b' },
  { id: 'c', text: 'c' },
];

test('recorre la lista en orden', () => {
  let state: State = { nextIndex: 0, history: [] };
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    const result = pickNext(state, tweets, 1000 + i);
    assert.ok(result);
    seen.push(result.tweet.id);
    state = result.nextState;
  }
  assert.deepEqual(seen, ['a', 'b', 'c']);
});

test('nunca repite: agotada la lista devuelve null', () => {
  const state: State = { nextIndex: 3, history: [] };
  assert.equal(pickNext(state, tweets, 2000), null);
});

test('no vuelve a empezar desde el principio', () => {
  let state: State = { nextIndex: 2, history: [] };
  const first = pickNext(state, tweets, 3000);
  assert.equal(first?.tweet.id, 'c');
  state = first!.nextState;
  assert.equal(pickNext(state, tweets, 3001), null);
});

test('un error de red al postear no tira abajo el loop: no avanza, reintenta después', async () => {
  let state: State = { nextIndex: 0, history: [] };
  let attempts = 0;
  const stop = runLoop({
    tweets,
    intervalMs: 1_000_000, // no llega a disparar un segundo tick durante el test
    loadState: () => state,
    saveState: (s) => {
      state = s;
    },
    postTweet: async () => {
      attempts += 1;
      throw new Error('network blip');
    },
    now: () => 42,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  stop();
  assert.equal(attempts, 1);
  assert.equal(state.nextIndex, 0); // sigue en "a": no se perdió el tweet, se reintenta
});

test('agrega al historial sin perder lo anterior', () => {
  const state: State = { nextIndex: 0, history: [{ id: 'z', postedAt: 1 }] };
  const result = pickNext(state, tweets, 5000);
  assert.deepEqual(result?.nextState.history, [
    { id: 'z', postedAt: 1 },
    { id: 'a', postedAt: 5000 },
  ]);
});

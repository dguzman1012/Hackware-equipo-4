import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickNext } from '../src/scheduler';
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
    const { tweet, nextState } = pickNext(state, tweets, 1000 + i);
    seen.push(tweet.id);
    state = nextState;
  }
  assert.deepEqual(seen, ['a', 'b', 'c']);
});

test('da la vuelta al agotar la lista', () => {
  const state: State = { nextIndex: 2, history: [] };
  const { tweet, nextState } = pickNext(state, tweets, 2000);
  assert.equal(tweet.id, 'c');
  assert.equal(nextState.nextIndex, 0);
});

test('agrega al historial sin perder lo anterior', () => {
  const state: State = { nextIndex: 0, history: [{ id: 'z', postedAt: 1 }] };
  const { nextState } = pickNext(state, tweets, 5000);
  assert.deepEqual(nextState.history, [
    { id: 'z', postedAt: 1 },
    { id: 'a', postedAt: 5000 },
  ]);
});

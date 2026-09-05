import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TWEETS } from '../src/content';

test('hay al menos un puñado de tweets', () => {
  assert.ok(TWEETS.length >= 10);
});

test('ningún tweet supera el límite de 280 caracteres', () => {
  for (const t of TWEETS) {
    assert.ok(t.text.length <= 280, `"${t.id}" tiene ${t.text.length} caracteres`);
  }
});

test('los ids son únicos', () => {
  const ids = TWEETS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('el primer tweet es el hola-mundo y menciona a Gaucho', () => {
  const first = TWEETS[0]!;
  assert.equal(first.id, 'hello-world');
  assert.match(first.text.toLowerCase(), /gaucho/);
});

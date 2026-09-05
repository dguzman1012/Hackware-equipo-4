import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { TWEETS } from '../src/content';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

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

test('los textos son únicos (nunca se repite un tweet)', () => {
  const texts = TWEETS.map((t) => t.text);
  assert.equal(new Set(texts).size, texts.length);
});

test('el primer tweet es el hola-mundo y menciona a Gaucho', () => {
  const first = TWEETS[0]!;
  assert.equal(first.id, 'hello-world');
  assert.match(first.text.toLowerCase(), /gaucho/);
});

test('las fotos referenciadas existen en el repo', () => {
  for (const t of TWEETS) {
    if (!t.mediaPath) continue;
    const full = path.resolve(repoRoot, t.mediaPath);
    assert.ok(existsSync(full), `"${t.id}" apunta a ${t.mediaPath}, que no existe`);
  }
});

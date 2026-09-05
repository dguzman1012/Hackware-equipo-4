// Punto de entrada como librería (sin efectos al importar), para que otro
// proceso del monorepo (el server del robot) pueda postear un tweet puntual
// sin arrancar el cronograma completo de src/index.ts.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeClient } from './client';
import type { TweetDraft } from './content';
import { parseEnv } from './env';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '../../..');

function loadDotEnv(): void {
  const file = path.join(repoRoot, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

/** Postea un tweet puntual, fuera del cronograma (p. ej. "lo encontré en vivo"). */
export async function postNow(tweet: TweetDraft): Promise<void> {
  loadDotEnv();
  const env = parseEnv(process.env);
  const client = makeClient(env);
  await client.postTweet(tweet);
}

export type { TweetDraft };

// Confirma qué cuenta va a postear con las credenciales del .env, sin
// tuitear nada. Correr antes de dejar el scheduler en modo live.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TwitterApi } from 'twitter-api-v2';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '../../..');

function loadDotEnv(): void {
  const file = path.join(repoRoot, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main(): Promise<void> {
  loadDotEnv();
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
    console.error('Faltan credenciales en el .env (X_API_KEY/SECRET, X_ACCESS_TOKEN/SECRET).');
    process.exit(1);
  }

  const client = new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_SECRET,
  });

  const me = await client.v2.me();
  console.log(`Autenticado como @${me.data.username} (id ${me.data.id})`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

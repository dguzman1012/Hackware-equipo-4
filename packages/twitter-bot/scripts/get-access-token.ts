// Genera X_ACCESS_TOKEN / X_ACCESS_SECRET para UNA cuenta específica (la del
// bot), distinta de la cuenta con la que creaste la App en el developer
// portal. Flujo PIN-based OAuth 1.0a ("oob"): no hace falta servidor ni
// callback URL.
//
// Uso:
//   1. Cargar X_API_KEY y X_API_SECRET en el .env de la raíz del repo
//      (el Consumer Key / Consumer Secret de la App — esos SÍ son los mismos
//      sin importar qué cuenta vaya a postear).
//   2. Correr: pnpm --filter twitter-bot auth
//   3. Abrir la URL que imprime, en una ventana donde estés logueado como
//      @Gauchitapaisana (no como tu cuenta personal) y autorizar la app.
//   4. Pegar el PIN de 7 dígitos que te muestra X.
//   5. Copiar el X_ACCESS_TOKEN / X_ACCESS_SECRET que imprime al final al .env.
import { createInterface } from 'node:readline/promises';
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
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  if (!appKey || !appSecret) {
    console.error('Falta X_API_KEY y/o X_API_SECRET en el .env (Consumer Key/Secret de la App).');
    process.exit(1);
  }

  const client = new TwitterApi({ appKey, appSecret });
  const authLink = await client.generateAuthLink('oob');

  console.log('\n1) Abrí esta URL logueado como @Gauchitapaisana (NO tu cuenta personal):\n');
  console.log(`   ${authLink.url}\n`);
  console.log('2) Autorizá la app. X te va a mostrar un PIN de 7 dígitos.\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pin = (await rl.question('Pegá el PIN acá: ')).trim();
  rl.close();

  const pinClient = new TwitterApi({
    appKey,
    appSecret,
    accessToken: authLink.oauth_token,
    accessSecret: authLink.oauth_token_secret,
  });
  const { accessToken, accessSecret, screenName } = await pinClient.login(pin);

  console.log(`\nListo. Autorizado como @${screenName}.`);
  if (screenName.toLowerCase() !== 'gauchitapaisana') {
    console.warn(`⚠ Esperaba @Gauchitapaisana pero autorizaste como @${screenName}. Si no era la intención, repetí el paso 3 logueado con la cuenta correcta.`);
  }
  console.log('\nPegá esto en tu .env:\n');
  console.log(`X_ACCESS_TOKEN=${accessToken}`);
  console.log(`X_ACCESS_SECRET=${accessSecret}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

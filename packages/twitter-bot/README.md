# twitter-bot — la Gauchita en X

Bot que tuitea cada tanto en el personaje de "la novia de Gaucho": lo extraña,
lo persigue, tagea a `@gauchopaisano`. Cadencia configurable, contenido fijo
en [`src/content.ts`](src/content.ts).

## Correr

```bash
pnpm --filter twitter-bot dev
```

Sin credenciales de la X API en `.env` (raíz del repo), corre en **dry-run**:
imprime cada tweet por consola en vez de postear. Para probar la cadencia
rápido:

```bash
TWEET_INTERVAL_MS=5000 pnpm --filter twitter-bot dev
```

## Conectar la cuenta real

Cuando exista la cuenta de X y su developer app (necesita permisos de
lectura+escritura para postear), completar en `.env`:

```
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=
TWEET_INTERVAL_MS=14400000   # 4h, opcional
```

Con las 4 credenciales presentes deja el dry-run automáticamente y postea de
verdad vía `twitter-api-v2` (OAuth1.0a user context — es lo que permite
postear en el free tier sin pagar por lectura).

## Estado

`data/state.json` (gitignored) guarda qué tweet sigue y el historial de
posteados, así un reinicio no repite desde el principio. Al agotar la lista
de `content.ts` vuelve a empezar desde el primero.

## Tests

```bash
pnpm --filter twitter-bot test
```

`scheduler.ts` es puro (`pickNext`) y se testea sin red ni reloj real, igual
que `server/src/brain.ts`. `content.test.ts` valida límite de 280 caracteres,
ids únicos y que el primer tweet sea el hola-mundo.

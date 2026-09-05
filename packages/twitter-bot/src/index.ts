import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeClient } from './client';
import { TWEETS } from './content';
import { parseEnv } from './env';
import { runLoop } from './scheduler';
import { loadState, saveState } from './state';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '../../..');
const stateFile = path.resolve(moduleDir, '../data/state.json');

function loadDotEnv(): void {
  const file = path.join(repoRoot, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

loadDotEnv();
const env = parseEnv(process.env);
const client = makeClient(env);

console.log(
  `[twitter-bot] modo=${env.dryRun ? 'dry-run' : 'live'} intervalo=${env.tweetIntervalMs}ms tweets=${TWEETS.length}`,
);

const stop = runLoop({
  tweets: TWEETS,
  intervalMs: env.tweetIntervalMs,
  loadState: () => loadState(stateFile),
  saveState: (s) => saveState(stateFile, s),
  postTweet: (text) => client.postTweet(text),
});

process.on('SIGINT', () => {
  stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});

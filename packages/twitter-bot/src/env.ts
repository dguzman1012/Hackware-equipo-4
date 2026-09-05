// Config del proceso. A diferencia de server/env.ts, nunca falla al arrancar:
// sin credenciales completas simplemente cae en dry-run.
import { z } from 'zod';

const EnvSchema = z.object({
  X_API_KEY: z.string().optional(),
  X_API_SECRET: z.string().optional(),
  X_ACCESS_TOKEN: z.string().optional(),
  X_ACCESS_SECRET: z.string().optional(),
  TWEET_INTERVAL_MS: z.coerce.number().int().positive().default(4 * 60 * 60 * 1000),
  DRY_RUN: z.coerce.boolean().optional(),
});

export interface Env {
  credentials: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string } | null;
  tweetIntervalMs: number;
  dryRun: boolean;
}

export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
  const e = EnvSchema.parse(cleaned);

  const credentials =
    e.X_API_KEY && e.X_API_SECRET && e.X_ACCESS_TOKEN && e.X_ACCESS_SECRET
      ? { apiKey: e.X_API_KEY, apiSecret: e.X_API_SECRET, accessToken: e.X_ACCESS_TOKEN, accessSecret: e.X_ACCESS_SECRET }
      : null;

  return {
    credentials,
    tweetIntervalMs: e.TWEET_INTERVAL_MS,
    dryRun: e.DRY_RUN ?? credentials === null,
  };
}

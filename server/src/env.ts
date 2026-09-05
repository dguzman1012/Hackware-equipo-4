// Config del proceso. Falla al arrancar si un reader gemini no tiene key. Nada más lee process.env.
import { z } from 'zod';
import { LookoutReaderKind, ReaderKind } from '@gaucho/protocol';

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().default(8080),
    HTTPS_PORT: z.coerce.number().int().default(8443),
    CERT_DIR: z.string().default('certs'),
    READER: ReaderKind.default('mock'),
    LOOKOUT_READER: LookoutReaderKind.optional(),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-robotics-er-2-preview'),
    ESP_IP: z.string().optional(),
  })
  .refine((e) => e.READER !== 'gemini' || Boolean(e.GEMINI_API_KEY), {
    message: 'READER=gemini requiere GEMINI_API_KEY',
  })
  .refine((e) => lookoutReaderKind(e) !== 'gemini' || Boolean(e.GEMINI_API_KEY), {
    message: 'LOOKOUT_READER=gemini requiere GEMINI_API_KEY',
  });

export type Env = z.infer<typeof EnvSchema>;

export function lookoutReaderKind(env: {
  LOOKOUT_READER?: LookoutReaderKind;
  READER: ReaderKind;
}): LookoutReaderKind {
  return env.LOOKOUT_READER ?? (env.READER === 'gemini' ? 'gemini' : 'mock');
}

export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
  return EnvSchema.parse(cleaned);
}

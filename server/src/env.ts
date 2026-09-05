// Config del proceso. Falla al arrancar si DETECTOR=gemini sin key. Nada más lee process.env.
import { z } from 'zod';
import { DetectorKind } from '@gaucho/protocol';

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().default(8080),
    HTTPS_PORT: z.coerce.number().int().default(8443),
    CERT_DIR: z.string().default('certs'),
    DETECTOR: DetectorKind.default('manual'),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-robotics-er-2-preview'),
    ESP_IP: z.string().optional(),
  })
  .refine((e) => e.DETECTOR !== 'gemini' || Boolean(e.GEMINI_API_KEY), {
    message: 'DETECTOR=gemini requiere GEMINI_API_KEY',
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
  return EnvSchema.parse(cleaned);
}

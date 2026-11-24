import { existsSync } from 'node:fs';
import { z } from 'zod';

if (existsSync('.env')) process.loadEnvFile('.env');

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform(v => v.split(',').map(s => s.trim()).filter(Boolean)),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().optional(),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  ALLOWED_EMAIL_DOMAIN: z.string().default('illinois.edu'),
  REQUIRE_VERIFIED_EMAIL: z.stringbool().default(true),
  INGEST_API_KEY: z.string().min(16).optional(),
  DEMO_MODE: z.stringbool().default(false),
  PUBLIC_WEB_URL: z.url().default('https://illi-knows.web.app')
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment:\n  ${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('FIREBASE_AUTH_EMULATOR_HOST must not be set in production.');
  }
  return parsed.data;
}

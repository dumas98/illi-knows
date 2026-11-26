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
  PUBLIC_WEB_URL: z.url().default('https://illi-knows.web.app'),
  /** Who sends email. "console" only logs, for development. */
  EMAIL_PROVIDER: z.enum(['console', 'brevo', 'resend']).default('console'),
  EMAIL_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.email().optional(),
  EMAIL_FROM_NAME: z.string().min(1).default('Illi-Knows'),
  /** Shared secret for POST /api/jobs/reminders (the scheduled GitHub Action sends it). */
  JOBS_API_KEY: z.string().min(16).optional(),
  /** How often the server itself checks for due reminders while it's awake. 0 turns it off. */
  REMINDER_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(60)
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment:\n  ${issues}`);
  }
  if (parsed.data.EMAIL_PROVIDER !== 'console' && (!parsed.data.EMAIL_API_KEY || !parsed.data.EMAIL_FROM)) {
    throw new Error(`EMAIL_PROVIDER=${parsed.data.EMAIL_PROVIDER} needs EMAIL_API_KEY and EMAIL_FROM.`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.DEMO_MODE) {
    throw new Error('DEMO_MODE lets anyone act as the demo admin, so it must be off in production.');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('FIREBASE_AUTH_EMULATOR_HOST must not be set in production.');
  }
  return parsed.data;
}

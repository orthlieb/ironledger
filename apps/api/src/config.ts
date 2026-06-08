import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// Every environment variable the app needs is declared and validated here.
// Nothing else in the codebase should read process.env directly.
// ---------------------------------------------------------------------------

const schema = z.object({
  // ── Server ────────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().url(),

  // ── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url(),
  DATABASE_ADMIN_URL: z.string().url().optional(),

  // ── Redis ─────────────────────────────────────────────────────────────────
  REDIS_URL: z.string().url(),

  // ── Auth ──────────────────────────────────────────────────────────────────
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(900), // seconds
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // ── Email ─────────────────────────────────────────────────────────────────
  EMAIL_PROVIDER: z.enum(['resend', 'smtp']).default('resend'),
  EMAIL_FROM: z.string().email(),
  // Resend
  RESEND_API_KEY: z.string().optional(),
  // SMTP (e.g. IONOS)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // ── hCaptcha ──────────────────────────────────────────────────────────────
  HCAPTCHA_SECRET: z.string().min(1),

  // ── HaveIBeenPwned ────────────────────────────────────────────────────────
  HIBP_API_KEY: z.string().optional(),

  // ── Rate limits ───────────────────────────────────────────────────────────
  RATE_LIMIT_LOGIN: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_REGISTER: z.coerce.number().int().positive().default(3),
  RATE_LIMIT_GLOBAL: z.coerce.number().int().positive().default(120),

  // ── Account lockout ───────────────────────────────────────────────────────
  // Number of consecutive failed login attempts before the account is suspended.
  LOGIN_FAIL_LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(5),

  // ── Logging ───────────────────────────────────────────────────────────────
  // Directory where PM2 writes log files. On production this is
  // /home/ironledger/logs; override in .env for other environments.
  LOG_DIR: z.string().default('/home/ironledger/logs'),

  // ── Email rate limiting ───────────────────────────────────────────────────
  // Max verification emails triggered from one IP in a 24-hour window.
  // Prevents a single actor burning through the Resend daily quota.
  MAX_REG_EMAILS_PER_IP: z.coerce.number().int().positive().default(10),

  // ── Per-user resource limits ──────────────────────────────────────────────
  MAX_CHARACTERS_PER_USER: z.coerce.number().int().positive().default(20),
  MAX_ENCOUNTERS_PER_USER: z.coerce.number().int().positive().default(100),
  MAX_EXPEDITIONS_PER_USER: z.coerce.number().int().positive().default(50),
  MAX_COMMUNITIES_PER_USER: z.coerce.number().int().positive().default(100),
  MAX_NPCS_PER_USER: z.coerce.number().int().positive().default(200),
});

// ---------------------------------------------------------------------------
// Refinements — cross-field validation
// ---------------------------------------------------------------------------

const refined = schema
  .refine((cfg) => cfg.EMAIL_PROVIDER !== 'resend' || !!cfg.RESEND_API_KEY, {
    message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
  })
  .refine(
    (cfg) =>
      cfg.EMAIL_PROVIDER !== 'smtp' ||
      (!!cfg.SMTP_HOST && !!cfg.SMTP_PORT && !!cfg.SMTP_USER && !!cfg.SMTP_PASS),
    { message: 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS are required when EMAIL_PROVIDER=smtp' },
  );

// ---------------------------------------------------------------------------
// Parse — fail fast at startup if any variable is missing or wrong
// ---------------------------------------------------------------------------

function parseConfig() {
  const result = refined.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n');
    // Crash immediately — a misconfigured app should not start
    console.error('❌ Invalid environment configuration:\n' + errors);
    process.exit(1);
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Export a single validated config object
// ---------------------------------------------------------------------------

export const config = parseConfig();
export type Config = typeof config;

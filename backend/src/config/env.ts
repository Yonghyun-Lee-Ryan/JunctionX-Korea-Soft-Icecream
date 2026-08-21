import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

const secret = z.string().refine((value) => Buffer.byteLength(value, 'utf8') >= 32, {
  message: 'must be at least 32 bytes',
});

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    TEST_DATABASE_URL: optionalString,
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    TRUST_PROXY: z.string().default('false'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    JWT_ISSUER: z.string().min(1).default('junctionx-korea-backend'),
    JWT_AUDIENCE: z.string().min(1).default('junctionx-korea-client'),
    JWT_ACCESS_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
    AUTH_REFRESH_TRANSPORT: z.enum(['cookie', 'body']).default('cookie'),
    AUTH_REFRESH_COOKIE_NAME: z.string().min(1).default('junctionx_refresh'),
    COOKIE_SECURE: booleanFromString,
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: optionalString,
    ENABLE_API_DOCS: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1).default(5000),
    SEED_ADMIN_EMAIL: optionalString,
    SEED_ADMIN_PASSWORD: optionalString,
  })
  .superRefine((value, context) => {
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'must be different from JWT_ACCESS_SECRET',
      });
    }

    const origins = value.CORS_ORIGINS.split(',').map((origin) => origin.trim());
    if (origins.some((origin) => origin === '*')) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'wildcard origins are forbidden when credentials are enabled',
      });
    }

    if (value.NODE_ENV === 'production' && value.AUTH_REFRESH_TRANSPORT === 'cookie') {
      if (!value.COOKIE_SECURE) {
        context.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'must be true for cookie refresh tokens in production',
        });
      }
      if (value.COOKIE_SAME_SITE === 'none' && !value.COOKIE_SECURE) {
        context.addIssue({
          code: 'custom',
          path: ['COOKIE_SAME_SITE'],
          message: 'SameSite=None requires a secure cookie',
        });
      }
    }

    if (Boolean(value.SEED_ADMIN_EMAIL) !== Boolean(value.SEED_ADMIN_PASSWORD)) {
      context.addIssue({
        code: 'custom',
        path: ['SEED_ADMIN_EMAIL'],
        message: 'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set together',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment variables:\n${errors.join('\n')}`);
}

function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export const env = {
  ...parsed.data,
  LOG_LEVEL: parsed.data.LOG_LEVEL ?? (parsed.data.NODE_ENV === 'development' ? 'debug' : 'info'),
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  TRUST_PROXY: parseTrustProxy(parsed.data.TRUST_PROXY),
} as const;

export type Environment = typeof env;

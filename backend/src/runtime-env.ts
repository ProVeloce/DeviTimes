import type { Env } from './types/env.js';

export function readRuntimeEnv(): Env {
  return {
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    JWT_SECRET: process.env.JWT_SECRET ?? '',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    SETUP_KEY: process.env.SETUP_KEY,
    GOOGLE_DRIVE_CLIENT_ID: process.env.GOOGLE_DRIVE_CLIENT_ID,
    GOOGLE_DRIVE_CLIENT_SECRET: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY,
    GOOGLE_LOGIN_ALLOWED_EMAIL: process.env.GOOGLE_LOGIN_ALLOWED_EMAIL,
    SUPABASE_SSL_ROOT_CERT: process.env.SUPABASE_SSL_ROOT_CERT,
    PG_DUMP_PATH: process.env.PG_DUMP_PATH,
  };
}

export function getRuntimeEnv(): Env {
  const env = readRuntimeEnv();
  if (!env.DATABASE_URL) throw new Error('Missing required environment variable: DATABASE_URL');
  if (!env.JWT_SECRET) throw new Error('Missing required environment variable: JWT_SECRET');
  return env;
}

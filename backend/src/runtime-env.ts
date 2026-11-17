import type { Env } from './types/env.js';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getRuntimeEnv(): Env {
  return {
    DATABASE_URL: requiredEnv('DATABASE_URL'),
    JWT_SECRET: requiredEnv('JWT_SECRET'),
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

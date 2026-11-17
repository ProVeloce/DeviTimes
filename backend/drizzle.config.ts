import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { fileURLToPath } from 'node:url';
import { getDatabaseConnectionString } from './src/db/connection.js';

config({ path: fileURLToPath(new URL('./.env', import.meta.url)), override: true });

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseConnectionString(process.env.DATABASE_URL),
  },
});

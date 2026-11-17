import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { getDatabaseConnectionString } from '../src/db/connection.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), override: true });

const connectionString = getDatabaseConnectionString(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 10000,
});

try {
  const result = await pool.query('SELECT current_database() AS database');
  console.log(`Connected to PostgreSQL database "${result.rows[0].database}".`);
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown connection error';
  console.error(`Database connection failed: ${message.replace(process.env.DATABASE_URL ?? '', '[redacted]')}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

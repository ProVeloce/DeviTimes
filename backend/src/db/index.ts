import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getDatabaseConnectionString } from './connection.js';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDb>;

const pools = new Map<string, Pool>();

export function createDb(connectionString: string) {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseConnectionString(connectionString),
      max: 5,
    });
    pools.set(connectionString, pool);
  }
  return drizzle(pool, { schema });
}

export { schema };

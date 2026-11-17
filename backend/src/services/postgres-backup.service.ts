import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDatabaseConnectionString } from '../db/connection.js';
import { AppError } from '../utils/response.js';

type PgDumpInvocation = {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

export type DatabaseBackupArtifact = {
  filename: string;
  filePath: string;
  size: number;
  dispose: () => Promise<void>;
};

export function buildPgDumpInvocation(
  databaseUrl: string,
  pgDumpPath?: string,
  caCertificatePath?: string
): PgDumpInvocation {
  if (!databaseUrl) {
    throw new AppError('DATABASE_URL is missing from the backend environment.', 503);
  }

  let url: URL;
  try {
    url = new URL(getDatabaseConnectionString(
      databaseUrl,
      caCertificatePath ?? process.env.SUPABASE_SSL_ROOT_CERT ?? ''
    ));
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : 'DATABASE_URL is invalid.',
      500
    );
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!databaseName) {
    throw new AppError('DATABASE_URL must include a database name.', 500);
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const username = decodeURIComponent(url.username);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: host,
    PGPORT: url.port || '5432',
    PGUSER: username,
    PGDATABASE: databaseName,
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get('sslmode') ?? 'verify-full',
  };

  const libpqEnvironmentVariables: Record<string, string> = {
    application_name: 'PGAPPNAME',
    channel_binding: 'PGCHANNELBINDING',
    connect_timeout: 'PGCONNECT_TIMEOUT',
    options: 'PGOPTIONS',
    sslcert: 'PGSSLCERT',
    sslkey: 'PGSSLKEY',
    sslpassword: 'PGSSLPASSWORD',
    sslrootcert: 'PGSSLROOTCERT',
    target_session_attrs: 'PGTARGETSESSIONATTRS',
  };
  for (const [parameter, variable] of Object.entries(libpqEnvironmentVariables)) {
    const value = url.searchParams.get(parameter);
    if (value !== null) env[variable] = value;
  }

  const executable = pgDumpPath?.trim() || 'pg_dump';
  return {
    executable,
    args: [
      '--format=custom',
      '--schema=public',
      '--no-password',
      '--host',
      host,
      '--port',
      url.port || '5432',
      '--username',
      username,
      '--dbname',
      databaseName,
    ],
    env,
  };
}

function runPgDump(invocation: PgDumpInvocation, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn(
      invocation.executable,
      [...invocation.args, '--file', filePath],
      {
        env: invocation.env,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      }
    );
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(new AppError(
          'pg_dump was not found. Install PostgreSQL command-line tools that match or are newer than the server, or set PG_DUMP_PATH in backend/.env.',
          503
        ));
        return;
      }
      reject(new AppError(`Could not start pg_dump: ${error.message}`, 500));
    });
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim().replace(/\s+/g, ' ').slice(-800);
      reject(new AppError(
        detail
          ? `PostgreSQL database dump failed: ${detail}`
          : `PostgreSQL database dump failed${signal ? ` (${signal})` : ` (exit code ${code})`}.`,
        502
      ));
    });
  });
}

export async function createDatabaseBackup(
  databaseUrl: string,
  options: { pgDumpPath?: string; caCertificatePath?: string },
  createdAt = new Date()
): Promise<DatabaseBackupArtifact> {
  const filename = `DeviTimes-Database-Backup-${createdAt.toISOString().replace(/[:.]/g, '-')}.dump`;
  const directory = await mkdtemp(join(tmpdir(), 'devi-times-backup-'));
  const filePath = join(directory, filename);

  try {
    const invocation = buildPgDumpInvocation(
      databaseUrl,
      options.pgDumpPath,
      options.caCertificatePath
    );
    if (process.platform !== 'win32') await chmod(directory, 0o700);
    await runPgDump(invocation, filePath);
    if (process.platform !== 'win32') await chmod(filePath, 0o600);
    const { size } = await stat(filePath);
    if (size === 0) {
      throw new AppError('PostgreSQL returned an empty database backup.', 502);
    }

    return {
      filename,
      filePath,
      size,
      dispose: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

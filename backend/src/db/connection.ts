import { fileURLToPath } from 'node:url';

export function resolveCaCertificatePath(
  caCertificatePath: string,
  platform: NodeJS.Platform = process.platform
): string {
  const certificatePath = caCertificatePath.trim();
  if (platform !== 'win32' && /^[a-z]:[\\/]/i.test(certificatePath)) {
    return fileURLToPath(new URL('../../certs/prod-ca-2021.crt', import.meta.url));
  }
  return certificatePath;
}

export function getDatabaseConnectionString(
  connectionString: string | undefined,
  caCertificatePath = process.env.SUPABASE_SSL_ROOT_CERT
): string {
  if (!connectionString) {
    throw new Error('DATABASE_URL is missing from the backend environment.');
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol.');
  }

  url.searchParams.set('sslmode', 'verify-full');
  const configuredCaPath = caCertificatePath?.trim() || url.searchParams.get('sslrootcert')?.trim();
  if (configuredCaPath) {
    url.searchParams.set('sslrootcert', resolveCaCertificatePath(configuredCaPath));
  }

  return url.toString();
}

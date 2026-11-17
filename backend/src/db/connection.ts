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
  if (caCertificatePath?.trim()) {
    url.searchParams.set('sslrootcert', caCertificatePath.trim());
  }

  return url.toString();
}

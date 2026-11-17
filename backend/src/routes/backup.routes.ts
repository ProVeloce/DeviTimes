import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types/env.js';
import { createDb } from '../db/index.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  getGoogleDriveBackupStatus,
  saveBackupToGoogleDrive,
} from '../services/google-drive-backup.service.js';
import { fail, ok } from '../utils/response.js';

const backupRoutes = new Hono<AppEnv>();

backupRoutes.use('*', authMiddleware);
backupRoutes.use('*', adminOnly);

backupRoutes.get('/google/status', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const status = await getGoogleDriveBackupStatus(db, {
    clientId: c.env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: c.env.GOOGLE_DRIVE_CLIENT_SECRET,
    tokenEncryptionKey: c.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY,
  });
  return ok(c, status);
});

backupRoutes.post('/google/connect', async (c) => {
  const body = z.object({ code: z.string().min(1).max(4096) }).parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const account = await connectGoogleDrive(
    db,
    {
      clientId: c.env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_DRIVE_CLIENT_SECRET,
      tokenEncryptionKey: c.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY,
    },
    body.code
  );
  return ok(c, account, 'Google Drive connected');
});

backupRoutes.post('/google/disconnect', async (c) => {
  const body = z.object({ accountId: z.string().min(1).max(100) }).parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  await disconnectGoogleDrive(
    db,
    body.accountId,
    c.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY
  );
  return ok(c, null, 'Google Drive disconnected');
});

backupRoutes.post('/google/save', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const backup = await saveBackupToGoogleDrive(
    db,
    {
      clientId: c.env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_DRIVE_CLIENT_SECRET,
      tokenEncryptionKey: c.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY,
      databaseUrl: c.env.DATABASE_URL,
      databaseCaCertificatePath: c.env.SUPABASE_SSL_ROOT_CERT,
      pgDumpPath: c.env.PG_DUMP_PATH,
    }
  );
  if (backup.failedCount > 0) {
    const message = `Backup saved to ${backup.savedCount} of ${backup.accounts.length} Google Drive accounts; ${backup.failedCount} failed.`;
    return fail(c, message, backup.savedCount > 0 ? 207 : 502, backup);
  }
  return ok(c, backup, 'Backup saved to Google Drive');
});

export default backupRoutes;

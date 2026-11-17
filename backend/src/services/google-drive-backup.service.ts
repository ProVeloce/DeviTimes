import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { open } from 'node:fs/promises';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { backups, settings } from '../db/schema/index.js';
import { newId } from '../utils/id.js';
import { AppError } from '../utils/response.js';
import {
  createDatabaseBackup,
  type DatabaseBackupArtifact,
} from './postgres-backup.service.js';

const ACCOUNT_KEY_PREFIX = 'google_drive_account:';
const LEGACY_REFRESH_TOKEN_KEY = 'google_drive_refresh_token';
const LEGACY_ACCOUNT_EMAIL_KEY = 'google_drive_account_email';
const LEGACY_FOLDER_ID_KEY = 'google_drive_folder_id';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const GOOGLE_TOKEN_API = 'https://oauth2.googleapis.com/token';
const DRIVE_UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;

type GoogleDriveConfig = {
  clientId?: string;
  clientSecret?: string;
  tokenEncryptionKey?: string;
  databaseUrl?: string;
  databaseCaCertificatePath?: string;
  pgDumpPath?: string;
};

type GoogleDriveAccount = {
  id: string;
  email: string;
  encryptedRefreshToken: string;
  folderId: string | null;
};

type GoogleDriveBackupResult = {
  accountId: string;
  email: string;
  status: 'saved' | 'failed';
  filename?: string;
  createdAt?: string;
  fileId?: string;
  error?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
};

type DriveFile = {
  id: string;
  name: string;
  createdTime?: string;
  webViewLink?: string;
};

function getEncryptionKey(encodedKey?: string): Buffer {
  if (!encodedKey) {
    throw new AppError('Google Drive backup encryption is not configured on the server.', 503);
  }
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encodedKey) {
    throw new AppError('Google Drive backup encryption key must be 32 bytes encoded as base64.', 500);
  }
  return key;
}

export function encryptRefreshToken(refreshToken: string, encodedKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptRefreshToken(encrypted: string, encodedKey?: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = encrypted.split(':');
  if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue) {
    throw new AppError('Stored Google Drive connection is invalid. Reconnect the Google account.', 409);
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(encodedKey),
      Buffer.from(ivValue, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Could not decrypt the Google Drive connection. Check the server encryption key.', 500);
  }
}

async function getSetting<T = string>(db: Database, key: string): Promise<T | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as T;
  }
}

async function putSetting(db: Database, key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ id: newId(), key, value: JSON.stringify(value), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(value), updatedAt: new Date() },
    });
}

function accountSettingKey(accountId: string): string {
  return `${ACCOUNT_KEY_PREFIX}${accountId}`;
}

async function getGoogleDriveAccounts(db: Database): Promise<GoogleDriveAccount[]> {
  const rows = (await db
    .select({ key: settings.key, value: settings.value })
    .from(settings))
    .filter((row) => row.key.startsWith(ACCOUNT_KEY_PREFIX));
  const accounts = rows.map((row) => {
    let account: unknown;
    try {
      account = JSON.parse(row.value) as unknown;
    } catch {
      throw new AppError('A saved Google Drive account record is invalid. Disconnect and reconnect that account.', 409);
    }
    if (
      typeof account !== 'object' ||
      account === null ||
      !('id' in account) ||
      typeof account.id !== 'string' ||
      !('email' in account) ||
      typeof account.email !== 'string' ||
      !('encryptedRefreshToken' in account) ||
      typeof account.encryptedRefreshToken !== 'string' ||
      !('folderId' in account) ||
      (account.folderId !== null && typeof account.folderId !== 'string') ||
      row.key !== accountSettingKey(account.id)
    ) {
      throw new AppError('A saved Google Drive account record is incomplete. Disconnect and reconnect that account.', 409);
    }
    return {
      id: account.id,
      email: account.email,
      encryptedRefreshToken: account.encryptedRefreshToken,
      folderId: account.folderId,
    };
  });

  const legacyToken = await getSetting<string>(db, LEGACY_REFRESH_TOKEN_KEY);
  const legacyEmail = await getSetting<string>(db, LEGACY_ACCOUNT_EMAIL_KEY);
  if (
    legacyToken &&
    legacyEmail &&
    !accounts.some((account) => account.email.toLowerCase() === legacyEmail.toLowerCase())
  ) {
    accounts.push({
      id: 'legacy',
      email: legacyEmail,
      encryptedRefreshToken: legacyToken,
      folderId: await getSetting<string>(db, LEGACY_FOLDER_ID_KEY),
    });
  }
  return accounts;
}

async function googleJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    throw new AppError(`Google ${action} failed (HTTP ${response.status}).`, 502);
  }
  return response.json() as Promise<T>;
}

export function getGoogleDriveConfigurationStatus(config: GoogleDriveConfig) {
  const encryptionKey = config.tokenEncryptionKey
    ? Buffer.from(config.tokenEncryptionKey, 'base64')
    : null;
  const configured = Boolean(
    config.clientId &&
      config.clientSecret &&
      encryptionKey?.length === 32 &&
      encryptionKey.toString('base64') === config.tokenEncryptionKey
  );
  return {
    configured,
    clientId: configured ? config.clientId : null,
  };
}

export async function connectGoogleDrive(
  db: Database,
  config: GoogleDriveConfig,
  code: string
): Promise<{ id: string; email: string }> {
  const { clientId, clientSecret, tokenEncryptionKey } = config;
  if (!clientId || !clientSecret || !tokenEncryptionKey) {
    throw new AppError('Google Drive backup is not configured on the server.', 503);
  }
  getEncryptionKey(tokenEncryptionKey);

  const tokenResponse = await fetch(GOOGLE_TOKEN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await googleJson<GoogleTokenResponse>(tokenResponse, 'account connection');
  if (!tokens.access_token) {
    throw new AppError('Google did not return an access token. Please connect the account again.', 502);
  }

  const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = await googleJson<{ email?: string }>(userInfoResponse, 'account verification');
  const googleEmail = userInfo.email;
  if (!googleEmail) {
    throw new AppError('Google did not provide an account email. Please grant the requested permissions.', 502);
  }

  const previousAccount = (await getGoogleDriveAccounts(db)).find(
    (account) => account.email.toLowerCase() === googleEmail.toLowerCase()
  );
  const refreshToken = tokens.refresh_token ?? (
    previousAccount
      ? decryptRefreshToken(previousAccount.encryptedRefreshToken, tokenEncryptionKey)
      : null
  );
  if (!refreshToken) {
    throw new AppError('Google did not provide offline access. Revoke this app in your Google Account and connect again.', 409);
  }

  const account: GoogleDriveAccount = {
    id: previousAccount?.id ?? newId(),
    email: googleEmail,
    encryptedRefreshToken: encryptRefreshToken(refreshToken, tokenEncryptionKey),
    folderId: previousAccount?.folderId ?? null,
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(settings)
      .values({
        id: newId(),
        key: accountSettingKey(account.id),
        value: JSON.stringify(account),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: JSON.stringify(account), updatedAt: new Date() },
      });
    await tx.delete(settings).where(inArray(settings.key, [
      LEGACY_REFRESH_TOKEN_KEY,
      LEGACY_ACCOUNT_EMAIL_KEY,
      LEGACY_FOLDER_ID_KEY,
    ]));
  });

  return { id: account.id, email: googleEmail };
}

async function getAccessToken(
  config: GoogleDriveConfig,
  account: GoogleDriveAccount
): Promise<string> {
  const { clientId, clientSecret, tokenEncryptionKey } = config;
  if (!clientId || !clientSecret || !tokenEncryptionKey) {
    throw new AppError('Google Drive backup is not configured on the server.', 503);
  }
  const refreshToken = decryptRefreshToken(account.encryptedRefreshToken, tokenEncryptionKey);
  const response = await fetch(GOOGLE_TOKEN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (response.status === 400 || response.status === 401) {
    throw new AppError('Google authorization expired or was revoked. Reconnect the Google account.', 409);
  }
  const tokens = await googleJson<GoogleTokenResponse>(response, 'access token refresh');
  if (!tokens.access_token) {
    throw new AppError('Google did not return an access token. Reconnect the Google account.', 502);
  }
  return tokens.access_token;
}

async function getOrCreateBackupFolder(
  db: Database,
  accessToken: string,
  account: GoogleDriveAccount
): Promise<string> {
  if (account.folderId) return account.folderId;

  const response = await fetch(`${DRIVE_API}/files?fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Devi Times Backups',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const folder = await googleJson<{ id?: string }>(response, 'backup folder creation');
  if (!folder.id) throw new AppError('Google Drive did not return the backup folder ID.', 502);
  account.folderId = folder.id;
  await putSetting(db, accountSettingKey(account.id), account);
  return folder.id;
}

async function uploadBackupToAccount(
  db: Database,
  config: GoogleDriveConfig,
  account: GoogleDriveAccount,
  backup: DatabaseBackupArtifact,
  createdAt: Date
): Promise<GoogleDriveBackupResult> {
  let accessToken = await getAccessToken(config, account);
  const folderId = await getOrCreateBackupFolder(db, accessToken, account);
  const sessionResponse = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,createdTime,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/octet-stream',
        'X-Upload-Content-Length': String(backup.size),
      },
      body: JSON.stringify({
        name: backup.filename,
        mimeType: 'application/octet-stream',
        parents: [folderId],
      }),
    }
  );
  if (!sessionResponse.ok) {
    await googleJson<DriveFile>(sessionResponse, 'backup upload initialization');
  }
  const sessionLocation = sessionResponse.headers.get('Location');
  if (!sessionLocation) {
    throw new AppError('Google Drive did not return a resumable upload URL.', 502);
  }
  const sessionUrl = new URL(sessionLocation);
  if (sessionUrl.protocol !== 'https:' || sessionUrl.hostname !== 'www.googleapis.com') {
    throw new AppError('Google Drive returned an invalid resumable upload URL.', 502);
  }

  const fileHandle = await open(backup.filePath, 'r');
  let offset = 0;
  let noProgressAttempts = 0;
  let file: DriveFile | null = null;
  try {
    while (offset < backup.size) {
      const chunkLength = Math.min(DRIVE_UPLOAD_CHUNK_SIZE, backup.size - offset);
      const chunk = Buffer.alloc(chunkLength);
      const { bytesRead } = await fileHandle.read(chunk, 0, chunkLength, offset);
      if (bytesRead !== chunkLength) {
        throw new AppError('The temporary database backup could not be read completely.', 500);
      }

      const end = offset + bytesRead - 1;
      const uploadChunk = () =>
        fetch(sessionUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(bytesRead),
            'Content-Range': `bytes ${offset}-${end}/${backup.size}`,
          },
          body: chunk,
        });

      let response = await uploadChunk();
      if (response.status === 401) {
        accessToken = await getAccessToken(config, account);
        response = await uploadChunk();
      }
      if (response.status === 308) {
        const range = response.headers.get('Range');
        const match = range?.match(/^bytes=0-(\d+)$/);
        const nextOffset = match ? Number(match[1]) + 1 : 0;
        if (!Number.isSafeInteger(nextOffset) || nextOffset < 0 || nextOffset >= backup.size) {
          throw new AppError('Google Drive could not confirm the uploaded backup data.', 502);
        }
        noProgressAttempts = nextOffset <= offset ? noProgressAttempts + 1 : 0;
        if (noProgressAttempts > 2) {
          throw new AppError('Google Drive did not make progress while receiving the backup.', 502);
        }
        offset = nextOffset;
        continue;
      }

      file = await googleJson<DriveFile>(response, 'backup upload');
      if (!file.id) throw new AppError('Google Drive did not confirm the uploaded backup.', 502);
      offset = backup.size;
    }
  } finally {
    await fileHandle.close();
  }
  if (!file) throw new AppError('Google Drive did not confirm the uploaded backup.', 502);

  await db.insert(backups).values({
    id: newId(),
    filename: backup.filename,
    filepath: file.id,
    size: backup.size,
    type: `google_drive:${account.id}`,
    status: 'completed',
    createdAt,
  });

  return {
    accountId: account.id,
    email: account.email,
    status: 'saved',
    filename: backup.filename,
    createdAt: file.createdTime ?? createdAt.toISOString(),
    fileId: file.id,
  };
}

export async function saveBackupToGoogleDrive(
  db: Database,
  config: GoogleDriveConfig,
  createdAt = new Date()
): Promise<{
  filename: string;
  createdAt: string;
  accounts: GoogleDriveBackupResult[];
  savedCount: number;
  failedCount: number;
}> {
  const accounts = await getGoogleDriveAccounts(db);
  if (accounts.length === 0) {
    throw new AppError('Connect at least one Google Drive account before saving a backup.', 409);
  }
  const backup = await createDatabaseBackup(
    config.databaseUrl ?? '',
    {
      pgDumpPath: config.pgDumpPath,
      caCertificatePath: config.databaseCaCertificatePath,
    },
    createdAt
  );
  try {
    const results: GoogleDriveBackupResult[] = [];

    for (const account of accounts) {
      try {
        results.push(await uploadBackupToAccount(db, config, account, backup, createdAt));
      } catch (error) {
        results.push({
          accountId: account.id,
          email: account.email,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Could not save this account backup.',
        });
      }
    }

    const savedCount = results.filter((result) => result.status === 'saved').length;
    return {
      filename: backup.filename,
      createdAt: createdAt.toISOString(),
      accounts: results,
      savedCount,
      failedCount: results.length - savedCount,
    };
  } finally {
    await backup.dispose();
  }
}

export async function getGoogleDriveBackupStatus(db: Database, config: GoogleDriveConfig) {
  const { configured, clientId } = getGoogleDriveConfigurationStatus(config);
  const accounts = await getGoogleDriveAccounts(db);
  const accountStatuses = await Promise.all(accounts.map(async (account) => {
    const backupType = `google_drive:${account.id}`;
    const [lastBackup] = await db
      .select({
        filename: backups.filename,
        createdAt: backups.createdAt,
        filepath: backups.filepath,
      })
      .from(backups)
      .where(eq(backups.type, backupType))
      .orderBy(desc(backups.createdAt))
      .limit(1);
    const [legacyBackup] = account.id === 'legacy' && !lastBackup
      ? await db
          .select({
            filename: backups.filename,
            createdAt: backups.createdAt,
            filepath: backups.filepath,
          })
          .from(backups)
          .where(eq(backups.type, 'google_drive'))
          .orderBy(desc(backups.createdAt))
          .limit(1)
      : [];
    const backup = lastBackup ?? legacyBackup;
    return {
      id: account.id,
      email: account.email,
      lastBackup: backup
        ? { filename: backup.filename, createdAt: backup.createdAt, fileId: backup.filepath }
        : null,
    };
  }));
  return {
    configured,
    clientId,
    accounts: accountStatuses,
  };
}

export async function disconnectGoogleDrive(
  db: Database,
  accountId: string,
  tokenEncryptionKey?: string
): Promise<void> {
  const account = (await getGoogleDriveAccounts(db)).find((candidate) => candidate.id === accountId);
  if (!account) throw new AppError('Google Drive account was not found.', 404);

  const refreshToken = decryptRefreshToken(account.encryptedRefreshToken, tokenEncryptionKey);
  const response = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }),
  });
  if (!response.ok) {
    throw new AppError(`Google account revocation failed (HTTP ${response.status}).`, 502);
  }

  await db.transaction(async (tx) => {
    await tx.delete(settings).where(eq(settings.key, accountSettingKey(accountId)));
    if (accountId === 'legacy') {
      await tx.delete(settings).where(inArray(settings.key, [
        LEGACY_REFRESH_TOKEN_KEY,
        LEGACY_ACCOUNT_EMAIL_KEY,
        LEGACY_FOLDER_ID_KEY,
      ]));
    }
  });
}

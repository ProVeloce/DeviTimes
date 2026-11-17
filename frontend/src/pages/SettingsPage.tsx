import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Save, Unplug } from 'lucide-react';
import googleDriveLogo from '@/assets/google-drive-2026.svg';
import { api, ApiError } from '@/lib/api';
import { saveSettings } from '@/services/settings.service';
import { formatDateTime } from '@/lib/utils';
import { getPendingMutationCount, syncPendingMutations } from '@/lib/offline-sync';
import type { ShopSettings } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { AppLogo } from '@/components/brand/AppLogo';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuthStore } from '@/store/auth.store';

type GoogleDriveStatus = {
  configured: boolean;
  clientId: string | null;
  accounts: GoogleDriveAccount[];
};

type GoogleDriveAccount = {
  id: string;
  email: string;
  lastBackup: { filename: string; createdAt: string; fileId: string } | null;
};

type GoogleDriveBackupAccountResult = {
  accountId: string;
  email: string;
  status: 'saved' | 'failed';
  filename?: string;
  createdAt?: string;
  fileId?: string;
  error?: string;
};

type GoogleDriveBackup = {
  filename: string;
  createdAt: string;
  accounts: GoogleDriveBackupAccountResult[];
  savedCount: number;
  failedCount: number;
};

function getBackupAccountResults(error: unknown): GoogleDriveBackupAccountResult[] {
  if (!(error instanceof ApiError) || !error.details || typeof error.details !== 'object') return [];
  if (!('accounts' in error.details) || !Array.isArray(error.details.accounts)) return [];
  return error.details.accounts.filter((account): account is GoogleDriveBackupAccountResult =>
    typeof account === 'object' &&
    account !== null &&
    'accountId' in account &&
    typeof account.accountId === 'string' &&
    'email' in account &&
    typeof account.email === 'string' &&
    'status' in account &&
    (account.status === 'saved' || account.status === 'failed')
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const isAdmin = useAuthStore((state) => state.isAdmin());
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<ShopSettings>('/settings'),
  });
  const { data: driveStatus, isLoading: isDriveStatusLoading } = useQuery({
    queryKey: ['google-drive-backup'],
    queryFn: () => api<GoogleDriveStatus>('/backup/google/status'),
    enabled: isAdmin,
  });

  const [form, setForm] = useState<Partial<ShopSettings>>({});
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const [googleScriptFailed, setGoogleScriptFailed] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  useEffect(() => {
    if (!driveStatus?.clientId) return;
    if (window.google?.accounts.oauth2) {
      setGoogleScriptReady(true);
      return;
    }

    const scriptId = 'google-identity-services';
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement('script');
    const handleLoad = () => setGoogleScriptReady(true);
    const handleError = () => setGoogleScriptFailed(true);
    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    if (!existingScript) {
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    return () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
  }, [driveStatus?.clientId]);

  const saveMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: ({ settings: saved, pending }) => {
      qc.setQueryData(['settings'], saved);
      if (!pending) qc.invalidateQueries({ queryKey: ['settings'] });
      toast(pending ? 'Saved on this device' : 'Saved', pending ? 'Will sync when online' : 'Settings updated');
    },
  });

  const connectDriveMutation = useMutation({
    mutationFn: (code: string) =>
      api<{ id: string; email: string }>('/backup/google/connect', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    onSuccess: async ({ email }) => {
      await qc.invalidateQueries({ queryKey: ['google-drive-backup'] });
      toast('Google Drive connected', `${email} is ready for backups.`);
    },
    onError: (error) => {
      toast('Google Drive connection failed', error instanceof Error ? error.message : 'Try connecting again.', 'error');
    },
  });

  const backupMutation = useMutation({
    mutationFn: async () => {
      if (await getPendingMutationCount()) {
        await syncPendingMutations();
      }
      if (await getPendingMutationCount()) {
        throw new Error('Some offline changes are still waiting to sync. Reconnect and sync them before backing up.');
      }
      return api<GoogleDriveBackup>('/backup/google/save', { method: 'POST' });
    },
    onSuccess: async (backup) => {
      await qc.invalidateQueries({ queryKey: ['google-drive-backup'] });
      toast(
        'Backup saved to Google Drive',
        `Saved to ${backup.savedCount} account${backup.savedCount === 1 ? '' : 's'}: ${backup.accounts.map((account) => account.email).join(', ')}`
      );
    },
    onError: async (error) => {
      await qc.invalidateQueries({ queryKey: ['google-drive-backup'] });
      const failures = getBackupAccountResults(error).filter((account) => account.status === 'failed');
      const description = failures.length
        ? failures.map((account) => `${account.email}: ${account.error ?? 'Upload failed'}`).join(' · ')
        : error instanceof Error ? error.message : 'Try again when you are online.';
      toast('Backup did not reach every account', description, 'error');
    },
  });

  const disconnectDriveMutation = useMutation({
    mutationFn: (accountId: string) =>
      api<null>('/backup/google/disconnect', {
        method: 'POST',
        body: JSON.stringify({ accountId }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['google-drive-backup'] });
      toast('Google Drive disconnected', 'Existing backup files remain in that Drive.');
    },
    onError: (error) => {
      toast('Could not disconnect Google Drive', error instanceof Error ? error.message : 'Try again.', 'error');
    },
  });

  function connectGoogleDrive(saveAfterConnect = false) {
    const clientId = driveStatus?.clientId;
    const google = window.google?.accounts.oauth2;
    if (!clientId || !google) {
      toast('Google sign-in is unavailable', 'Refresh the page and try again.', 'error');
      return;
    }

    const client = google.initCodeClient({
      client_id: clientId,
      scope: 'openid email https://www.googleapis.com/auth/drive.file',
      ux_mode: 'popup',
      select_account: true,
      callback: (response) => {
        if (response.error || !response.code) {
          toast('Google Drive connection cancelled', response.error ?? 'No authorization code was returned.', 'error');
          return;
        }
        connectDriveMutation.mutate(response.code, {
          onSuccess: () => {
            if (saveAfterConnect) backupMutation.mutate();
          },
        });
      },
      error_callback: (error) => {
        toast('Google sign-in could not open', error.type, 'error');
      },
    });
    client.requestCode();
  }

  if (isLoading) return <p className="text-sm text-[var(--color-muted-foreground)]">Loading...</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" description="Shop profile, GST, and system preferences" />

      <Card>
        <CardHeader>
          <CardTitle>Shop Details</CardTitle>
          <CardDescription>Displayed on invoices & receipts</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-4 sm:col-span-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/50 p-4">
            <AppLogo size={64} rounded="xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium">Shop logo</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Shown on login, sidebar, and printed bills. Override with a custom image URL below.
              </p>
              <div className="space-y-1">
                <Label htmlFor="logoUrl">Custom logo URL (optional)</Label>
                <Input
                  id="logoUrl"
                  placeholder="https://… or leave empty for default Devi Times logo"
                  value={form.logoUrl ?? ''}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                />
              </div>
            </div>
          </div>
          {(
            [
              ['shopName', 'Shop Name'],
              ['shopTagline', 'Tagline'],
              ['phone', 'Phone'],
              ['email', 'Email'],
              ['gstin', 'GSTIN'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1 sm:col-span-2">
              <Label>{label}</Label>
              <Input
                value={(form[key] as string) ?? ''}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="space-y-1 sm:col-span-2">
            <Label>Address</Label>
            <Input
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Default GST %</Label>
            <Input
              type="number"
              value={form.defaultGstPercent ?? 5}
              onChange={(e) => setForm({ ...form, defaultGstPercent: parseFloat(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label>Low Stock Threshold</Label>
            <Input
              type="number"
              value={form.lowStockThreshold ?? 10}
              onChange={(e) => setForm({ ...form, lowStockThreshold: parseInt(e.target.value) })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Invoice Footer</Label>
            <Input
              value={form.invoiceFooter ?? ''}
              onChange={(e) => setForm({ ...form, invoiceFooter: e.target.value })}
            />
          </div>
          <Button
            variant="accent"
            className="sm:col-span-2"
            onClick={() => saveMutation.mutate(form)}
          >
            <Save className="h-4 w-4" />
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Google Drive backup</CardTitle>
            <CardDescription>
              Save a complete application database backup to every connected Google Drive account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/50 p-4">
            <img
              src={googleDriveLogo}
              alt=""
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 object-contain"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {isDriveStatusLoading
                  ? 'Checking Google Drive…'
                  : driveStatus?.accounts.length
                    ? `${driveStatus.accounts.length} Google Drive account${driveStatus.accounts.length === 1 ? '' : 's'} connected`
                    : 'Connect Google Drive accounts'}
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                {driveStatus?.accounts.length
                  ? 'Save Backup sends the same complete database dump to every connected account.'
                  : driveStatus?.configured
                    ? 'Connect one or more Google accounts. Save Backup uploads a complete database dump to each account.'
                    : 'Google Drive backup has not been configured by the administrator yet.'}
              </p>
            </div>
          </div>

          {!driveStatus?.configured && !isDriveStatusLoading && (
            <p className="text-xs text-[var(--color-muted-foreground)]" role="status">
              Configure the Google OAuth client ID and secret in the backend environment, then restart the API.
            </p>
          )}

          {googleScriptFailed && (
            <p className="text-sm text-red-600" role="alert">
              Google sign-in could not load. Check your internet connection and refresh this page.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => connectGoogleDrive(false)}
              disabled={
                !driveStatus?.configured ||
                !googleScriptReady ||
                connectDriveMutation.isPending ||
                backupMutation.isPending ||
                isDriveStatusLoading
              }
            >
              {connectDriveMutation.isPending || (driveStatus?.configured && !googleScriptReady)
                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                : <img src={googleDriveLogo} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />}
              {connectDriveMutation.isPending
                ? 'Connecting…'
                : driveStatus?.configured && !googleScriptReady
                  ? 'Loading Google sign-in…'
                  : 'Connect Google Drive'}
            </Button>
            <Button
              variant="accent"
              onClick={() => {
                if (driveStatus?.accounts.length) {
                  backupMutation.mutate();
                } else {
                  connectGoogleDrive(true);
                }
              }}
              disabled={
                !driveStatus?.configured ||
                (!driveStatus.accounts.length && !googleScriptReady) ||
                backupMutation.isPending ||
                connectDriveMutation.isPending ||
                isDriveStatusLoading
              }
            >
              {backupMutation.isPending || (
                driveStatus?.configured &&
                !driveStatus.accounts.length &&
                !googleScriptReady
              )
                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                : <img src={googleDriveLogo} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />}
              {backupMutation.isPending
                ? 'Saving to all accounts…'
                : driveStatus?.configured && !driveStatus.accounts.length && !googleScriptReady
                  ? 'Loading Google sign-in…'
                  : 'Save Backup'}
            </Button>
          </div>

          <p className="text-xs text-[var(--color-muted-foreground)]">
            Includes all database records, including password hashes and connected Drive account emails and encrypted tokens. Treat the backup as sensitive. Pending offline changes must sync first.
          </p>

          {driveStatus?.accounts.map((account) => (
            <div
              key={account.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <img
                  src={googleDriveLogo}
                  alt=""
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{account.email}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {account.lastBackup
                      ? `Last backup: ${formatDateTime(account.lastBackup.createdAt)}`
                      : 'No backup saved yet'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {account.lastBackup && (
                  <a
                    className="text-xs font-medium text-[#1967d2] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                    href={`https://drive.google.com/open?id=${encodeURIComponent(account.lastBackup.fileId)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View backup
                  </a>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnectDriveMutation.mutate(account.id)}
                  disabled={
                    disconnectDriveMutation.isPending ||
                    backupMutation.isPending ||
                    connectDriveMutation.isPending
                  }
                >
                  {disconnectDriveMutation.isPending
                    ? <LoaderCircle className="h-4 w-4 animate-spin" />
                    : <Unplug className="h-4 w-4" />}
                  Disconnect
                </Button>
              </div>
            </div>
          ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import googleLogo from '@/assets/google-logo.svg';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { PageHeader } from '@/components/layout/PageHeader';
import { toast } from '@/components/ui/toast';
import {
  changeMyEmail,
  getGoogleEmailVerificationConfig,
  getMe,
  updateMyProfile,
  type UpdateProfileInput,
} from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';
import type { GoogleCodeResponse } from '@/types/google-identity';

interface ProfileForm {
  name: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const emptyPasswordFields = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const storedUser = useAuthStore((state) => state.user);
  const [form, setForm] = useState<ProfileForm>({
    name: storedUser?.name ?? '',
    ...emptyPasswordFields,
  });
  const [emailDraft, setEmailDraft] = useState(storedUser?.email ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const [emailVerificationPending, setEmailVerificationPending] = useState(false);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const [googleScriptFailed, setGoogleScriptFailed] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
  });
  const googleConfigQuery = useQuery({
    queryKey: ['auth', 'google-email-verification-config'],
    queryFn: getGoogleEmailVerificationConfig,
  });
  const profileName = profileQuery.data?.user.name;
  const profileEmail = profileQuery.data?.user.email;

  useEffect(() => {
    if (profileName) setForm((current) => ({ ...current, name: profileName }));
  }, [profileName]);

  useEffect(() => {
    if (profileEmail) setEmailDraft(profileEmail);
  }, [profileEmail]);

  const updateMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (result) => {
      const currentToken = useAuthStore.getState().token;
      if (currentToken) useAuthStore.getState().setAuth(currentToken, result.user);
      queryClient.setQueryData(['auth', 'me'], result);
      setForm({
        name: result.user.name,
        ...emptyPasswordFields,
      });
      setFormError(null);
      toast('Profile updated', 'Your details have been saved.');
    },
    onError: (error) => {
      const message = getErrorMessage(error, 'Could not update your profile.');
      setFormError(message);
      toast('Could not update profile', message, 'error');
    },
  });

  const emailMutation = useMutation({
    mutationFn: changeMyEmail,
    onSuccess: (result) => {
      useAuthStore.getState().setAuth(result.token, result.user);
      queryClient.setQueryData(['auth', 'me'], { user: result.user });
      setEmailDraft(result.user.email);
      setEmailChangeError(null);
      toast('Login email updated', 'Your new email is verified and ready to use.');
    },
    onError: (error) => {
      const message = getErrorMessage(error, 'Could not verify and change your login email.');
      setEmailChangeError(message);
      toast('Could not change login email', message, 'error');
    },
    onSettled: () => setEmailVerificationPending(false),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      setFormError('New password and confirmation do not match.');
      return;
    }
    if (form.currentPassword && !form.newPassword) {
      setFormError('Enter a new password to change your password.');
      return;
    }

    const data: UpdateProfileInput = {
      name: form.name.trim(),
      ...(form.newPassword ? { newPassword: form.newPassword } : {}),
      ...(form.currentPassword ? { currentPassword: form.currentPassword } : {}),
    };
    updateMutation.mutate(data);
  };

  const currentEmail = profileEmail ?? storedUser?.email ?? '';
  const normalizedEmailDraft = emailDraft.trim().toLowerCase();
  const emailChanged = normalizedEmailDraft !== currentEmail.trim().toLowerCase();
  const validEmailDraft = isValidEmail(normalizedEmailDraft);

  const handleEmailChange = () => {
    setEmailChangeError(null);
    if (!emailChanged || !validEmailDraft) return;

    const config = googleConfigQuery.data;
    const google = window.google?.accounts.oauth2;
    if (!config?.configured || !config.clientId || !googleScriptReady || !google) {
      const message = googleScriptFailed
        ? 'Google sign-in could not load. Check your connection and try again.'
        : 'Google email verification is not ready. Check the connection and try again.';
      setEmailChangeError(message);
      toast('Google verification unavailable', message, 'error');
      return;
    }

    const targetEmail = normalizedEmailDraft;
    setEmailVerificationPending(true);
    try {
      const client = google.initCodeClient({
        client_id: config.clientId,
        scope: 'openid email',
        ux_mode: 'popup',
        select_account: true,
        callback: (response: GoogleCodeResponse) => {
          if (response.error || !response.code) {
            setEmailVerificationPending(false);
            const message = response.error
              ? 'Google verification was cancelled. Your login email was not changed.'
              : 'Google did not return a verification code. Your login email was not changed.';
            setEmailChangeError(message);
            toast('Email not changed', message, 'error');
            return;
          }
          emailMutation.mutate({ email: targetEmail, code: response.code });
        },
        error_callback: (error) => {
          setEmailVerificationPending(false);
          const message = `Google verification could not open (${error.type}). Your login email was not changed.`;
          setEmailChangeError(message);
          toast('Email not changed', message, 'error');
        },
      });
      client.requestCode();
    } catch (error) {
      setEmailVerificationPending(false);
      const message = getErrorMessage(error, 'Google verification could not be started.');
      setEmailChangeError(message);
      toast('Email not changed', message, 'error');
    }
  };

  useEffect(() => {
    const config = googleConfigQuery.data;
    if (!config?.configured || !config.clientId) return;
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
  }, [googleConfigQuery.data]);

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Manage your profile, login email, and password" />

      {profileQuery.isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-[var(--color-muted-foreground)]">
            Loading profile…
          </CardContent>
        </Card>
      ) : profileQuery.isError ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-red-600" role="alert">
              {getErrorMessage(profileQuery.error, 'Could not load your profile.')}
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => void profileQuery.refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : profileQuery.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Personal details</CardTitle>
            <CardDescription>
              Your role is managed by an administrator. Update your name and verify a new login
              email with Google.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-2xl space-y-5">
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-name">Full name</Label>
                  <Input
                    id="profile-name"
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--color-muted-foreground)]">Role</span>
                  <Badge variant={profileQuery.data.user.role === 'ADMIN' ? 'accent' : 'default'}>
                    {profileQuery.data.user.role === 'ADMIN' ? 'Admin' : 'Cashier'}
                  </Badge>
                </div>

                <div className="space-y-4 border-t border-[var(--color-border)] pt-5">
                  <div>
                    <h2 className="text-sm font-semibold">Password</h2>
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                      {profileQuery.data.user.hasPassword
                        ? 'Enter your current password before choosing a new one.'
                        : 'This account currently signs in with Google. You can set a password as another sign-in option.'}
                    </p>
                  </div>

                  {profileQuery.data.user.hasPassword && (
                    <div className="space-y-1.5">
                      <Label htmlFor="profile-current-password">Current password</Label>
                      <PasswordInput
                        id="profile-current-password"
                        autoComplete="current-password"
                        maxLength={128}
                        required={Boolean(form.newPassword)}
                        value={form.currentPassword}
                        onChange={(event) =>
                          setForm({ ...form, currentPassword: event.target.value })
                        }
                      />
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="profile-new-password">
                        {profileQuery.data.user.hasPassword ? 'New password' : 'Set a password'}
                      </Label>
                      <PasswordInput
                        id="profile-new-password"
                        autoComplete="new-password"
                        minLength={6}
                        maxLength={128}
                        value={form.newPassword}
                        onChange={(event) =>
                          setForm({ ...form, newPassword: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="profile-confirm-password">Confirm new password</Label>
                      <PasswordInput
                        id="profile-confirm-password"
                        autoComplete="new-password"
                        minLength={6}
                        maxLength={128}
                        required={Boolean(form.newPassword)}
                        value={form.confirmPassword}
                        onChange={(event) =>
                          setForm({ ...form, confirmPassword: event.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                {formError && (
                  <p className="text-sm text-red-600" role="alert">
                    {formError}
                  </p>
                )}

                <Button type="submit" variant="accent" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving…' : 'Save profile'}
                </Button>
              </form>

              <div className="space-y-3 border-t border-[var(--color-border)] pt-5">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-email">Login email</Label>
                  <Input
                    id="profile-email"
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    value={emailDraft}
                    disabled={emailVerificationPending || emailMutation.isPending}
                    onChange={(event) => {
                      setEmailDraft(event.target.value);
                      setEmailChangeError(null);
                    }}
                  />
                  <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                    To change it, sign in with the Google account that uses the new email address.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  onClick={handleEmailChange}
                  disabled={
                    !emailChanged ||
                    !validEmailDraft ||
                    !googleScriptReady ||
                    emailVerificationPending ||
                    emailMutation.isPending
                  }
                >
                  {emailVerificationPending || emailMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <img
                      src={googleLogo}
                      alt=""
                      aria-hidden="true"
                      className="h-4 w-4 object-contain"
                    />
                  )}
                  {emailVerificationPending || emailMutation.isPending
                    ? 'Verifying Google account…'
                    : 'Verify and change email'}
                </Button>
                {(googleConfigQuery.isLoading ||
                  googleConfigQuery.isError ||
                  googleConfigQuery.data?.configured === false ||
                  (googleConfigQuery.data?.configured && !googleScriptReady)) && (
                  <p className="text-xs text-[var(--color-muted-foreground)]" role="status">
                    {googleConfigQuery.isLoading
                      ? 'Checking Google verification…'
                      : googleConfigQuery.isError
                        ? 'Google verification could not be checked. Try again online.'
                        : googleConfigQuery.data?.configured === false
                          ? 'Google email verification is not configured for this application.'
                          : googleScriptFailed
                            ? 'Google sign-in could not load. Check your connection and refresh.'
                            : 'Loading Google verification…'}
                  </p>
                )}
                {emailChangeError && (
                  <p className="text-sm text-red-600" role="alert">
                    {emailChangeError}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

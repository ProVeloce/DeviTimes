import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { getMe, updateMyProfile, type UpdateProfileInput } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';

interface ProfileForm {
  name: string;
  email: string;
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

export function ProfilePage() {
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const storedUser = useAuthStore((state) => state.user);
  const [form, setForm] = useState<ProfileForm>({
    name: storedUser?.name ?? '',
    email: storedUser?.email ?? '',
    ...emptyPasswordFields,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
  });

  useEffect(() => {
    const user = profileQuery.data?.user;
    if (user) {
      setForm({
        name: user.name,
        email: user.email,
        ...emptyPasswordFields,
      });
    }
  }, [profileQuery.data?.user]);

  const updateMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (result) => {
      if (token) useAuthStore.getState().setAuth(token, result.user);
      queryClient.setQueryData(['auth', 'me'], result);
      setForm({
        name: result.user.name,
        email: result.user.email,
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
      email: form.email.trim(),
      ...(form.newPassword ? { newPassword: form.newPassword } : {}),
      ...(form.currentPassword ? { currentPassword: form.currentPassword } : {}),
    };
    updateMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Manage your personal details and password" />

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
              Your role is managed by an administrator. You can update your name, sign-in username,
              and password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="max-w-2xl space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
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
                <div className="space-y-1.5">
                  <Label htmlFor="profile-username">Username / email</Label>
                  <Input
                    id="profile-username"
                    type="text"
                    required
                    minLength={1}
                    maxLength={254}
                    pattern="\S+"
                    autoComplete="username"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </div>
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
                      onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
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

              <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                Google sign-in depends on the configured account email. If you change your username,
                update the backend Google allowlist as needed. A Google-only account must set a
                password before changing its username.
              </p>

              {formError && (
                <p className="text-sm text-red-600" role="alert">
                  {formError}
                </p>
              )}

              <Button type="submit" variant="accent" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving…' : 'Save profile'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout/PageHeader';
import { toast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
  type ManagedUser,
  type UserInput,
} from '@/services/users.service';

interface UserForm {
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  password: string;
}

const emptyForm: UserForm = {
  email: '',
  name: '',
  role: 'CASHIER',
  isActive: true,
  password: '',
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
  });

  const saveMutation = useMutation({
    mutationFn: ({ userId, data }: { userId?: string; data: UserInput }) => {
      if (userId) return updateUser(userId, data);
      if (!data.password) throw new Error('A password is required for a new user.');
      return createUser({ ...data, password: data.password });
    },
    onSuccess: async (savedUser) => {
      const auth = useAuthStore.getState();
      if (auth.token && auth.user?.id === savedUser.id) {
        auth.setAuth(auth.token, {
          id: savedUser.id,
          email: savedUser.email,
          name: savedUser.name,
          role: savedUser.role,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      toast('Saved', editingUser ? 'User details updated' : 'User created');
      setDialogOpen(false);
      setFormError(null);
    },
    onError: (error) => {
      const message = getErrorMessage(error, 'Could not save user.');
      setFormError(message);
      toast('Could not save user', message, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      toast(
        result.deleted ? 'User deleted' : 'Account deactivated',
        result.deleted
          ? 'The user account was removed.'
          : 'Historical sales and stock records were preserved.',
      );
      setUserToDelete(null);
    },
    onError: (error) => {
      toast('Could not delete user', getErrorMessage(error, 'Please try again.'), 'error');
    },
  });

  const users = usersQuery.data ?? [];
  const filteredUsers = users.filter((user) =>
    `${user.name} ${user.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const openNewUserDialog = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditUserDialog = (user: ManagedUser) => {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      password: '',
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const data: UserInput = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      isActive: form.isActive,
      ...(form.password ? { password: form.password } : {}),
    };
    if (!editingUser && !data.password) {
      setFormError('A password is required for a new user.');
      return;
    }
    saveMutation.mutate({ userId: editingUser?.id, data });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Manage Users" description="Manage shop accounts, roles, and access">
        <Button variant="accent" onClick={openNewUserDialog}>
          <Plus className="h-4 w-4" />
          Add user
        </Button>
      </PageHeader>

      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
            <Input
              className="pl-9"
              placeholder="Search name or email"
              aria-label="Search users by name or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="data-table w-full min-w-[760px] text-sm">
              <thead className="text-left">
                <tr>
                  <th className="p-3">User</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Password access</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Created</th>
                  <th className="w-24 p-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {usersQuery.isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[var(--color-muted-foreground)]">
                      Loading users…
                    </td>
                  </tr>
                ) : usersQuery.isError ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center" role="alert">
                      <p className="text-red-600">
                        {getErrorMessage(usersQuery.error, 'Could not load users.')}
                      </p>
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        onClick={() => void usersQuery.refetch()}
                      >
                        Try again
                      </Button>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[var(--color-muted-foreground)]">
                      {search ? 'No users match your search.' : 'No users have been added yet.'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const isCurrentUser = user.id === currentUserId;
                    return (
                      <tr key={user.id} className="border-t">
                        <td className="p-3">
                          <p className="font-medium">
                            {user.name}
                            {isCurrentUser && (
                              <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                                You
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">{user.email}</p>
                        </td>
                        <td className="p-3">
                          <Badge variant={user.role === 'ADMIN' ? 'accent' : 'default'}>
                            {user.role === 'ADMIN' ? 'Admin' : 'Cashier'}
                          </Badge>
                        </td>
                        <td className="p-3">{user.hasPassword ? 'Enabled' : 'Google only'}</td>
                        <td className="p-3">
                          <Badge variant={user.isActive ? 'success' : 'warning'}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap p-3 text-xs text-[var(--color-muted-foreground)]">
                          {formatDateTime(user.createdAt)}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Edit ${user.name}`}
                              onClick={() => openEditUserDialog(user)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Delete ${user.name}`}
                              disabled={isCurrentUser}
                              onClick={() => setUserToDelete(user)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setFormError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit user' : 'Add user'}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Update account details and access. Leave the password blank to keep it unchanged.'
                : 'Create a shop account with username and password sign-in.'}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Full name</Label>
              <Input
                id="user-name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Username / email</Label>
              <Input
                id="user-email"
                type="text"
                required
                minLength={1}
                maxLength={254}
                pattern="\S+"
                autoComplete="username"
                placeholder="Email or username"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-password">
                {editingUser ? 'New password (optional)' : 'Password'}
              </Label>
              <Input
                id="user-password"
                type="password"
                required={!editingUser}
                minLength={6}
                maxLength={128}
                autoComplete="new-password"
                placeholder={editingUser ? 'Leave blank to keep current password' : ''}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </div>
            {editingUser && !editingUser.hasPassword && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                This account uses Google only. Its username must match the Google sign-in email
                configured on the backend, unless you set a password.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="user-role">Role</Label>
                <select
                  id="user-role"
                  className="flex h-10 w-full rounded-lg border border-[var(--color-input)] bg-[var(--color-card)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]/25 disabled:opacity-50"
                  value={form.role}
                  disabled={editingUser?.id === currentUserId}
                  onChange={(event) => {
                    const role = event.target.value;
                    if (role === 'ADMIN' || role === 'CASHIER') setForm({ ...form, role });
                  }}
                >
                  <option value="CASHIER">Cashier</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-status">Account status</Label>
                <select
                  id="user-status"
                  className="flex h-10 w-full rounded-lg border border-[var(--color-input)] bg-[var(--color-card)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]/25 disabled:opacity-50"
                  value={form.isActive ? 'active' : 'inactive'}
                  disabled={editingUser?.id === currentUserId}
                  onChange={(event) =>
                    setForm({ ...form, isActive: event.target.value === 'active' })
                  }
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            {editingUser?.id === currentUserId && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                You cannot change your own role or deactivate your account.
              </p>
            )}
            {formError && (
              <p className="text-sm text-red-600" role="alert">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saveMutation.isPending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : editingUser ? 'Save changes' : 'Create user'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(userToDelete)}
        onOpenChange={(open) => {
          if (!open) setUserToDelete(null);
        }}
        title="Delete user?"
        description={
          userToDelete
            ? `Delete ${userToDelete.name} (${userToDelete.email})? Accounts with sales or stock history will be deactivated instead so records remain intact.`
            : ''
        }
        confirmLabel="Delete user"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (userToDelete) deleteMutation.mutate(userToDelete.id);
        }}
      />
    </div>
  );
}

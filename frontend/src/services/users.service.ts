import { api } from '@/lib/api';
import type { Role, User } from '@/types';

export interface ManagedUser extends User {
  isActive: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserInput {
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  password?: string;
}

export interface NewUserInput extends UserInput {
  password: string;
}

export function listUsers() {
  return api<ManagedUser[]>('/auth/users');
}

export function createUser(data: NewUserInput) {
  return api<ManagedUser>('/auth/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateUser(userId: string, data: UserInput) {
  return api<ManagedUser>(`/auth/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteUser(userId: string) {
  return api<{ id: string; deleted: boolean }>(`/auth/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

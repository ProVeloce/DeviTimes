import { api } from '@/lib/api';
import type { User } from '@/types';

export interface UserProfile extends User {
  hasPassword: boolean;
}

export interface UpdateProfileInput {
  email: string;
  name: string;
  currentPassword?: string;
  newPassword?: string;
}

export async function login(username: string, password: string) {
  return api<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function getGoogleLoginConfig() {
  return api<{ configured: boolean; clientId: string | null }>('/auth/google/config');
}

export async function loginWithGoogle(code: string) {
  return api<{ token: string; user: User }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function getMe() {
  return api<{ user: UserProfile }>('/auth/me');
}

export async function updateMyProfile(data: UpdateProfileInput) {
  return api<{ user: UserProfile }>('/auth/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

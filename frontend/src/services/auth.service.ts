import { api } from '@/lib/api';
import type { User } from '@/types';

export interface UserProfile extends User {
  hasPassword: boolean;
  mfaEnabled: boolean;
}

export type LoginResult =
  | { token: string; user: User }
  | { mfaRequired: true; challengeToken: string };

export interface MfaEnrollment {
  secret: string;
  otpauthUrl: string;
  expiresAt: string;
}

export interface UpdateProfileInput {
  name: string;
  currentPassword?: string;
  newPassword?: string;
}

export async function login(username: string, password: string) {
  return api<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function getGoogleLoginConfig() {
  return api<{ configured: boolean; clientId: string | null }>('/auth/google/config');
}

export async function getGoogleEmailVerificationConfig() {
  return api<{ configured: boolean; clientId: string | null }>(
    '/auth/google/email-verification/config'
  );
}

export async function loginWithGoogle(code: string) {
  return api<LoginResult>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function verifyMfaLogin(challengeToken: string, code: string) {
  return api<{ token: string; user: User }>('/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ challengeToken, code }),
  });
}

export async function beginMfaEnrollment(currentPassword: string) {
  return api<MfaEnrollment>('/auth/mfa/enrollment', {
    method: 'POST',
    body: JSON.stringify({ currentPassword }),
  });
}

export async function confirmMfaEnrollment(code: string) {
  return api<{ token: string; user: User; recoveryCodes: string[] }>('/auth/mfa/enable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function disableMfa(currentPassword: string, code: string) {
  return api<{ token: string; user: User }>('/auth/mfa/disable', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, code }),
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

export async function changeMyEmail(data: { email: string; code: string }) {
  return api<{ token: string; user: UserProfile }>('/auth/me/email', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

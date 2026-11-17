import { readCachedResponse, writeCachedResponse } from '@/lib/offline-sync';
import { useAuthStore } from '@/store/auth.store';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  details?: unknown;
}

function getToken(): string | null {
  return localStorage.getItem('devi_token');
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const method = (options.method ?? 'GET').toUpperCase();

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401 && !path.startsWith('/auth/login')) {
      useAuthStore.getState().logout();
    }

    const contentType = res.headers.get('content-type');

    if (contentType?.includes('text/csv') || contentType?.includes('application/pdf')) {
      if (!res.ok) throw new ApiError('Export failed', res.status);
      const blob = await res.blob();
      if (method === 'GET') await writeCachedResponse(path, blob);
      return blob as unknown as T;
    }

    let body: ApiEnvelope<T> & { error?: string; details?: unknown };
    try {
      body = await res.json();
    } catch {
      throw new ApiError(
        res.ok ? 'Invalid JSON response from server' : 'Request failed',
        res.status
      );
    }

    if (!res.ok || body.success === false) {
      const details = body.details ?? (body as { errors?: unknown }).errors;
      let message = body.message ?? body.error ?? 'Request failed';
      if (details && typeof details === 'object' && 'fieldErrors' in (details as object)) {
        const fieldErrors = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
        if (fieldErrors) {
          const parts = Object.entries(fieldErrors).flatMap(([key, msgs]) =>
            (msgs ?? []).map((m) => `${key}: ${m}`)
          );
          if (parts.length) message = parts.join('; ');
        }
      }
      throw new ApiError(message, res.status, details);
    }

    if (body.success === true && 'data' in body) {
      if (method === 'GET') await writeCachedResponse(path, body.data);
      return body.data as T;
    }

    throw new ApiError('Invalid API response format', res.status);
  } catch (error) {
    if (method === 'GET' && (!navigator.onLine || error instanceof TypeError)) {
      const cached = await readCachedResponse<T>(path);
      if (cached !== null) {
        return cached;
      }
    }

    throw error;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

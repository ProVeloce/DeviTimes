import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv } from '../types/env.js';

export function ok<T>(c: Context<AppEnv>, data: T, message = 'Success', status: ContentfulStatusCode = 200) {
  return c.json({ success: true, message, data }, status);
}

export function fail(
  c: Context<AppEnv>,
  message: string,
  status: ContentfulStatusCode = 400,
  details?: unknown
) {
  return c.json(
    {
      success: false,
      message,
      data: null,
      ...(details !== undefined ? { details } : {}),
    },
    status
  );
}

export class AppError extends Error {
  constructor(
    message: string,
    public status: ContentfulStatusCode = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

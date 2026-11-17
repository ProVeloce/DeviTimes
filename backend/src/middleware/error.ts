import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import type { AppEnv } from '../types/env.js';
import { AppError } from '../utils/response.js';

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        message: err.message,
        data: null,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
      err.status
    );
  }

  if (err instanceof ZodError) {
    const flattened = err.flatten();
    return c.json(
      {
        success: false,
        message: 'Validation failed',
        data: null,
        errors: flattened,
        details: flattened.fieldErrors,
      },
      400
    );
  }

  console.error(err);
  return c.json(
    {
      success: false,
      message: err instanceof Error ? err.message : 'Internal server error',
      data: null,
    },
    500
  );
};

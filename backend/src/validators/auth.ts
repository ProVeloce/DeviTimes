import { z } from 'zod';

const userIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'Username is required')
  .max(254)
  .refine((value) => !/\s/.test(value), 'Username cannot contain spaces')
  .transform((value) => value.toLowerCase());

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const createUserSchema = z.object({
  email: userIdentifierSchema,
  password: z.string().min(6).max(128),
  name: z.string().trim().min(2).max(100),
  role: z.enum(['ADMIN', 'CASHIER']).optional(),
  isActive: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  email: userIdentifierSchema,
  password: z.string().min(6).max(128).optional(),
  name: z.string().trim().min(2).max(100),
  role: z.enum(['ADMIN', 'CASHIER']),
  isActive: z.boolean(),
});

export const updateProfileSchema = z
  .object({
    email: userIdentifierSchema,
    name: z.string().trim().min(2).max(100),
    currentPassword: z.string().min(1).max(128).optional(),
    newPassword: z.string().min(6).max(128).optional(),
  })
  .refine((data) => !data.currentPassword || data.newPassword, {
    message: 'A new password is required when the current password is provided',
    path: ['newPassword'],
  });

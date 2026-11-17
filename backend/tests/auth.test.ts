import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getGoogleEmailVerificationConfiguration,
  getGoogleLoginConfiguration,
  isAllowedGoogleLogin,
  isMatchingVerifiedGoogleEmail,
} from '../src/services/auth.service.js';
import {
  changeEmailSchema,
  createUserSchema,
  updateProfileSchema,
  updateUserSchema,
} from '../src/validators/auth.js';

test('Google login requires OAuth credentials and an allowed account email', () => {
  assert.deepEqual(
    getGoogleLoginConfiguration({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      allowedEmail: 'shreyanofficial25@gmail.com',
    }),
    { configured: true, clientId: 'client-id' }
  );
  assert.deepEqual(
    getGoogleLoginConfiguration({
      clientId: 'client-id',
      clientSecret: 'client-secret',
    }),
    { configured: false, clientId: null }
  );
});

test('Google login accepts only the verified allowlisted email', () => {
  assert.equal(
    isAllowedGoogleLogin('ShreyanOfficial25@gmail.com', true, 'shreyanofficial25@gmail.com'),
    true
  );
  assert.equal(
    isAllowedGoogleLogin('another@example.com', true, 'shreyanofficial25@gmail.com'),
    false
  );
  assert.equal(
    isAllowedGoogleLogin('shreyanofficial25@gmail.com', false, 'shreyanofficial25@gmail.com'),
    false
  );
});

test('email verification requires an exact, verified Google email', () => {
  assert.deepEqual(
    getGoogleEmailVerificationConfiguration({
      clientId: 'client-id',
      clientSecret: 'client-secret',
    }),
    { configured: true, clientId: 'client-id' }
  );
  assert.deepEqual(
    getGoogleEmailVerificationConfiguration({ clientId: 'client-id' }),
    { configured: false, clientId: null }
  );
  assert.equal(
    isMatchingVerifiedGoogleEmail('New@Example.com', true, 'new@example.com'),
    true
  );
  assert.equal(
    isMatchingVerifiedGoogleEmail('other@example.com', true, 'new@example.com'),
    false
  );
  assert.equal(
    isMatchingVerifiedGoogleEmail('new@example.com', false, 'new@example.com'),
    false
  );

  const parsed = changeEmailSchema.parse({
    email: ' New@Example.com ',
    code: 'google-oauth-code',
  });
  assert.equal(parsed.email, 'new@example.com');
  assert.equal(
    changeEmailSchema.safeParse({ email: 'not-an-email', code: 'code' }).success,
    false
  );
});

test('user schemas normalize email and allow leaving an existing password unchanged', () => {
  const created = createUserSchema.parse({
    email: '  Staff@Example.com ',
    password: 'secure-password',
    name: ' Shop Staff ',
  });
  assert.equal(created.email, 'staff@example.com');
  assert.equal(created.name, 'Shop Staff');
  assert.equal(created.isActive, undefined);

  const updated = updateUserSchema.parse({
    email: 'STAFF@example.com',
    name: 'Shop Staff',
    role: 'CASHIER',
    isActive: true,
  });
  assert.equal(updated.email, 'staff@example.com');
  assert.equal(updated.password, undefined);
  assert.equal(
    createUserSchema.parse({
      email: ' 7418956115 ',
      password: 'secure-password',
      name: 'Shop Staff',
    }).email,
    '7418956115',
  );
  assert.equal(
    createUserSchema.safeParse({
      email: 'shop staff',
      password: 'secure-password',
      name: 'Shop Staff',
    }).success,
    false,
  );
  assert.equal(
    updateUserSchema.safeParse({
      email: 'staff@example.com',
      password: 'short',
      name: 'Shop Staff',
      role: 'CASHIER',
      isActive: true,
    }).success,
    false,
  );
});

test('profile schema supports Google-only password setup and rejects incomplete password changes', () => {
  const googleOnlyProfile = updateProfileSchema.parse({
    name: 'Admin User',
    newPassword: 'new-secure-password',
  });
  assert.equal(googleOnlyProfile.newPassword, 'new-secure-password');
  assert.equal(
    'email' in updateProfileSchema.parse({
      email: 'ignored@example.com',
      name: 'Admin User',
    }),
    false
  );

  assert.equal(
    updateProfileSchema.safeParse({
      name: 'Admin User',
      currentPassword: 'current-password',
    }).success,
    false,
  );
});

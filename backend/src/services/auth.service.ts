import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { invoices, stockHistory, users } from '../db/schema/index.js';
import { signToken } from '../auth/jwt.js';
import { hashPassword, needsPasswordRehash, verifyPassword } from '../utils/password.js';
import { newId } from '../utils/id.js';
import { AppError } from '../utils/response.js';

export async function login(
  db: Database,
  username: string,
  password: string,
  jwtSecret: string,
  expiresIn: string
) {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${username.trim().toLowerCase()}`)
    .limit(1);
  if (!user || !user.isActive || !user.password) {
    throw new AppError('Invalid username or password', 401);
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    throw new AppError('Invalid username or password', 401);
  }

  if (needsPasswordRehash(user.password)) {
    await db
      .update(users)
      .set({ password: await hashPassword(password), updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  return createLoginResult(user, jwtSecret, expiresIn);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function getGoogleLoginConfiguration(config: {
  clientId?: string;
  clientSecret?: string;
  allowedEmail?: string;
}) {
  const allowedEmail = config.allowedEmail?.trim().toLowerCase();
  const configured = Boolean(
    config.clientId &&
    config.clientSecret &&
    allowedEmail &&
    isValidEmail(allowedEmail)
  );
  return {
    configured,
    clientId: configured ? config.clientId! : null,
  };
}

export function getGoogleEmailVerificationConfiguration(config: {
  clientId?: string;
  clientSecret?: string;
}) {
  const configured = Boolean(config.clientId && config.clientSecret);
  return {
    configured,
    clientId: configured ? config.clientId! : null,
  };
}

export function isAllowedGoogleLogin(
  googleEmail: string | undefined,
  emailVerified: boolean | undefined,
  allowedEmail: string | undefined
): boolean {
  return Boolean(
    googleEmail &&
    emailVerified === true &&
    allowedEmail &&
    googleEmail.trim().toLowerCase() === allowedEmail.trim().toLowerCase()
  );
}

export function isMatchingVerifiedGoogleEmail(
  googleEmail: string | undefined,
  emailVerified: boolean | undefined,
  expectedEmail: string | null | undefined
): boolean {
  return Boolean(
    googleEmail &&
    emailVerified === true &&
    expectedEmail &&
    googleEmail.trim().toLowerCase() === expectedEmail.trim().toLowerCase()
  );
}

async function verifyGoogleCode(
  config: { clientId?: string; clientSecret?: string },
  code: string
) {
  if (!config.clientId || !config.clientSecret) {
    throw new AppError('Google sign-in is not configured on the server.', 503);
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenResponse.ok) {
    throw new AppError('Google sign-in could not be verified. Please try again.', 401);
  }
  const tokens = await tokenResponse.json() as { access_token?: string };
  if (!tokens.access_token) {
    throw new AppError('Google did not return an access token. Please try again.', 401);
  }

  const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userInfoResponse.ok) {
    throw new AppError('Google sign-in could not be verified. Please try again.', 401);
  }
  return await userInfoResponse.json() as {
    email?: string;
    email_verified?: boolean;
  };
}

export async function loginWithGoogle(
  db: Database,
  config: { clientId?: string; clientSecret?: string; allowedEmail?: string },
  code: string,
  jwtSecret: string,
  expiresIn: string
) {
  const { configured } = getGoogleLoginConfiguration(config);
  const allowedEmail = config.allowedEmail?.trim().toLowerCase();
  if (!configured || !config.clientId || !config.clientSecret || !allowedEmail) {
    throw new AppError('Google sign-in is not configured on the server.', 503);
  }

  const googleUser = await verifyGoogleCode(config, code);
  const email = googleUser.email?.trim().toLowerCase();
  const [user] = email
    ? await db.select().from(users).where(eq(users.email, email)).limit(1)
    : [];
  const isAllowlisted = isAllowedGoogleLogin(email, googleUser.email_verified, allowedEmail);
  const isProfileVerified = isMatchingVerifiedGoogleEmail(
    email,
    googleUser.email_verified,
    user?.googleVerifiedEmail
  );
  if (!user || !user.isActive || user.role !== 'ADMIN' || (!isAllowlisted && !isProfileVerified)) {
    throw new AppError('This Google account is not authorized to sign in.', 403);
  }

  return createLoginResult(user, jwtSecret, expiresIn);
}

async function createLoginResult(
  user: typeof users.$inferSelect,
  jwtSecret: string,
  expiresIn: string
) {
  const token = await signToken(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    jwtSecret,
    expiresIn
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

export async function createUser(
  db: Database,
  data: {
    email: string;
    password: string;
    name: string;
    role?: 'ADMIN' | 'CASHIER';
    isActive?: boolean;
  }
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(734129085)`);
    const email = data.email.trim().toLowerCase();
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (existing) throw new AppError('Email already registered', 409);

    const now = new Date();
    const id = newId();
    await tx.insert(users).values({
      id,
      email,
      password: await hashPassword(data.password),
      name: data.name,
      role: data.role ?? 'CASHIER',
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });

    const [user] = await tx
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        hasPassword: sql<boolean>`${users.password} IS NOT NULL`,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user;
  });
}

export async function updateUser(
  db: Database,
  userId: string,
  actorId: string,
  data: {
    email: string;
    password?: string;
    name: string;
    role: 'ADMIN' | 'CASHIER';
    isActive: boolean;
  }
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(734129085)`);
    const [existing] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existing) throw new AppError('User not found', 404);

    if (userId === actorId && (data.role !== existing.role || !data.isActive)) {
      throw new AppError('You cannot change your own role or deactivate your account', 409);
    }

    const email = data.email.trim().toLowerCase();
    const [duplicate] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${email}`, ne(users.id, userId)))
      .limit(1);
    if (duplicate) throw new AppError('Email already registered', 409);

    if (
      existing.role === 'ADMIN' &&
      existing.isActive &&
      (data.role !== 'ADMIN' || !data.isActive)
    ) {
      const [activeAdminCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)));
      if (activeAdminCount.count <= 1) {
        throw new AppError('The last active admin cannot be demoted or deactivated', 409);
      }
    }

    await tx
      .update(users)
      .set({
        email,
        ...(email !== existing.email.trim().toLowerCase()
          ? { googleVerifiedEmail: null }
          : {}),
        name: data.name,
        role: data.role,
        isActive: data.isActive,
        ...(data.password ? { password: await hashPassword(data.password) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const [user] = await tx
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        hasPassword: sql<boolean>`${users.password} IS NOT NULL`,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user;
  });
}

export async function deleteUser(db: Database, userId: string, actorId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(734129085)`);
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new AppError('User not found', 404);
    if (userId === actorId) throw new AppError('You cannot delete your own account', 409);

    if (user.role === 'ADMIN' && user.isActive) {
      const [activeAdminCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)));
      if (activeAdminCount.count <= 1) {
        throw new AppError('The last active admin cannot be deleted', 409);
      }
    }

    const [invoice] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.userId, userId))
      .limit(1);
    const [stockChange] = await tx
      .select({ id: stockHistory.id })
      .from(stockHistory)
      .where(eq(stockHistory.userId, userId))
      .limit(1);

    if (invoice || stockChange) {
      await tx
        .update(users)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(users.id, userId));
      return { id: userId, deleted: false };
    }

    await tx.delete(users).where(eq(users.id, userId));
    return { id: userId, deleted: true };
  });
}

export async function listUsers(db: Database) {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      hasPassword: sql<boolean>`${users.password} IS NOT NULL`,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

export async function getUserProfile(db: Database, userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      hasPassword: sql<boolean>`${users.password} IS NOT NULL`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new AppError('User not found', 404);
  return user;
}

export async function updateOwnProfile(
  db: Database,
  userId: string,
  data: {
    name: string;
    currentPassword?: string;
    newPassword?: string;
  }
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(734129085)`);
    const [existing] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existing || !existing.isActive) throw new AppError('User account is unavailable', 404);

    if (data.currentPassword && !data.newPassword) {
      throw new AppError('Enter a new password to change your password', 400);
    }
    if (data.currentPassword && !existing.password) {
      throw new AppError('This account does not have a current password', 400);
    }
    if (data.newPassword && existing.password) {
      if (!data.currentPassword) {
        throw new AppError('Enter your current password to set a new password', 400);
      }
      if (!(await verifyPassword(data.currentPassword, existing.password))) {
        throw new AppError('Current password is incorrect', 400);
      }
    }

    await tx
      .update(users)
      .set({
        name: data.name,
        ...(data.newPassword ? { password: await hashPassword(data.newPassword) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const [profile] = await tx
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        hasPassword: sql<boolean>`${users.password} IS NOT NULL`,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return profile;
  });
}

export async function changeOwnEmail(
  db: Database,
  userId: string,
  config: { clientId?: string; clientSecret?: string },
  data: { email: string; code: string },
  jwtSecret: string,
  expiresIn: string
) {
  const targetEmail = data.email.trim().toLowerCase();
  const googleUser = await verifyGoogleCode(config, data.code);
  if (
    !isMatchingVerifiedGoogleEmail(
      googleUser.email,
      googleUser.email_verified,
      targetEmail
    )
  ) {
    throw new AppError('The verified Google email must match the new login email.', 403);
  }

  const updatedUser = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(734129085)`);
    const [existing] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existing || !existing.isActive) throw new AppError('User account is unavailable', 404);

    const [duplicate] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${targetEmail}`, ne(users.id, userId)))
      .limit(1);
    if (duplicate) throw new AppError('This email is already in use.', 409);

    const [user] = await tx
      .update(users)
      .set({
        email: targetEmail,
        googleVerifiedEmail: targetEmail,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    if (!user) throw new AppError('User account is unavailable', 404);
    return user;
  });

  const result = await createLoginResult(updatedUser, jwtSecret, expiresIn);
  return {
    ...result,
    user: { ...result.user, hasPassword: Boolean(updatedUser.password) },
  };
}

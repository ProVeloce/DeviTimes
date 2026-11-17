export type Env = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN?: string;
  CORS_ORIGIN?: string;
  SETUP_KEY?: string;
  GOOGLE_DRIVE_CLIENT_ID?: string;
  GOOGLE_DRIVE_CLIENT_SECRET?: string;
  GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY?: string;
  GOOGLE_LOGIN_ALLOWED_EMAIL?: string;
  SUPABASE_SSL_ROOT_CERT?: string;
  PG_DUMP_PATH?: string;
};

export type AppVariables = {
  userId: string;
  email: string;
  role: 'ADMIN' | 'CASHIER';
  name: string;
};

export type AppEnv = {
  Bindings: Env;
  Variables: AppVariables;
};

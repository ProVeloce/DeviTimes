# Devi Times Billing API — Node.js + Supabase

REST API for the Devi Times web and Electron billing applications.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Hono |
| ORM | Drizzle |
| Database | Supabase PostgreSQL |
| Auth | JWT (`jose`) + Argon2id password hashing |

## Local setup

1. Copy `.env.example` to `.env`.
2. Replace `YOUR_URL_ENCODED_PASSWORD` in `DATABASE_URL` with the actual Supabase database password. Keep `.env` private. The app forces `sslmode=verify-full`; if Node reports a self-signed certificate, download the Supabase CA certificate and set `SUPABASE_SSL_ROOT_CERT` to its absolute path in `.env`.
3. Install dependencies and apply the PostgreSQL migrations:

```bash
npm install
npm run db:check -w backend
npm run db:migrate -w backend
```

4. Start the API and frontend:

```bash
npm run dev
```

The API listens on `http://127.0.0.1:8787`. Set `PORT` or `HOST` in `.env` to override the defaults.

## Initialize the database

Call the setup endpoint once:

```bash
curl -X POST http://127.0.0.1:8787/api/setup/initialize `
  -H "Content-Type: application/json" `
  -d "{\"setupKey\":\"<your SETUP_KEY>\",\"adminUsername\":\"<admin username>\",\"adminPassword\":\"<admin password>\"}"
```

This creates the initial admin account and default categories/settings. The password is hashed before it is stored; the endpoint does not return it. No data is transferred from the old database.

## Build and run

```bash
npm run build -w backend
npm run start -w backend
```

The runtime requires `DATABASE_URL` and `JWT_SECRET`. `SETUP_KEY`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `PORT`, and `HOST` are configurable through environment variables. To enable Google Drive backups, set `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, and a private base64-encoded 32-byte `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY`.

## API

Local base URL: `http://127.0.0.1:8787/api`

All routes except `/auth/login` and `/health` require `Authorization: Bearer <token>`.

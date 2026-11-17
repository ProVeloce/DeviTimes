# Low-stock WhatsApp alerts

This service reads inventory from the Devi Times Supabase database and sends low-stock alerts through Green API. The Node.js server runs once daily at 09:00 UTC and exposes a protected manual trigger.

## Setup

1. Use Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set the Supabase database URL, a strong `ALERTS_AUTH_TOKEN`, and the Green API credentials locally.
3. Install and start the service:

   ```powershell
   npm install
   npm start
   ```

`GET /health` checks service availability. `POST /run` runs an alert check and requires `Authorization: Bearer <ALERTS_AUTH_TOKEN>`. The service listens on port 8788 by default.

## Vercel

The repository's Vercel project uses `src/vercel.js` as this service's Hono entrypoint; it does not start the in-process timer. Vercel Cron calls `GET /alerts/cron` daily at 09:00 UTC and requires `CRON_SECRET` (at least 16 characters) as a bearer token. Manual runs use `POST /alerts/run` and `ALERTS_AUTH_TOKEN`. Set both tokens and the database/Green API settings as Vercel project environment variables.

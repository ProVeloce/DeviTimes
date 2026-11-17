# Devi Times — Billing & POS

Production-grade watch, clock & gift shop billing software. Web application with Windows desktop (Electron) support, GST billing, inventory, barcode workflow, and thermal printing.

## Tech Stack

| Layer | Technologies |
|-------|----------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, shadcn-style UI, Framer Motion, React Query, Zustand |
| Backend API | **Node.js** + Hono + Drizzle ORM + JWT |
| Database | **Supabase PostgreSQL** |
| Desktop | Electron + electron-builder |
| Reports | Recharts, CSV export |

## Project Structure

```
Billing/
├── backend/          # Node.js API + Drizzle
│   ├── supabase/     # PostgreSQL migrations
│   └── src/
│       ├── routes/
│       ├── services/
│       ├── middlewares/
│       └── validations/
├── frontend/       # React SPA
│   └── src/
│       ├── pages/      # Dashboard, POS, Products, etc.
│       ├── components/
│       ├── store/
│       └── services/
├── electron/         # Desktop wrapper
└── package.json      # npm workspaces
```

## Supabase PostgreSQL

The Node.js API connects directly to Supabase PostgreSQL using `DATABASE_URL`. Keep the actual database password in a private `.env` file or deployment secret, never in source control.

## Vercel multi-service deployment

Connect the repository root as one Vercel project. The root `vercel.json` deploys three services: `backend` (Hono), `frontend` (Vite), and `alerts` (Hono). Public requests under `/api/*` go to the backend; `/alerts/*` goes to the alerts service; all other paths go to the frontend. The browser calls the backend through the same-origin `/api` path, so no service bindings are needed. The alerts service connects directly to Supabase and Green API; it does not call the backend.

Set the application's environment variables in the Vercel project before deploying. The backend needs `DATABASE_URL` and `JWT_SECRET`; also configure `SETUP_KEY` and any Google Drive/login variables used by the app. Admin MFA additionally requires a stable, private `MFA_ENCRYPTION_KEY` (base64-encoded 32-byte key). The alerts service needs `DATABASE_URL`, `ALERTS_AUTH_TOKEN` (at least 32 characters), `CRON_SECRET` (at least 16 characters), `GREEN_API_ID_INSTANCE`, `GREEN_API_TOKEN_INSTANCE`, and `RECIPIENT_PHONE_NUMBER`. Keep secrets in Vercel's environment settings, not in this repository. `frontend/.env.production` uses `/api` so production requests follow the same-origin rewrite.

Vercel Cron calls `GET /alerts/cron` daily at 09:00 UTC and authenticates with `Authorization: Bearer <CRON_SECRET>`. The protected manual trigger is `POST /alerts/run` with `ALERTS_AUTH_TOKEN`. The alert service's in-process timer remains for non-Vercel `npm start`; the Vercel entrypoint does not start a timer.

The database-backup API invokes the external `pg_dump` executable. Vercel does not guarantee that this executable is present, so configure a compatible `PG_DUMP_PATH` or use another backup environment before relying on database backups in production.

## Prerequisites

- **Node.js** 20+
- Supabase project database password

## Quick Start

### 1. Install dependencies

```bash
cd f:\Billing
npm install
```

### 2. Configure environment

```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

Edit `backend/.env` with the Supabase URI and strong values for `JWT_SECRET` and `SETUP_KEY`.

### 3. Create the empty PostgreSQL schema

```bash
npm run db:migrate -w backend
```

This creates the application tables in Supabase without transferring old data. Initialize once using `/api/setup/initialize`, supplying `setupKey`, `adminUsername`, and `adminPassword`. This creates the default settings/categories and the first admin user. Configure the Node.js API host with `DATABASE_URL`, `JWT_SECRET`, and `SETUP_KEY`.

### 4. Start development

```bash
npm run dev
```

Run this from the repository root to start both the frontend and API. Starting only `npm run dev -w frontend` does not start the API, so requests to port `8787` will be refused.

### Configure Google Drive backups

Google Drive backups are available to admins from **Settings → Google Drive backup**. The first setup requires a Google OAuth client:

1. In Google Cloud Console, enable the Google Drive API and configure the OAuth consent screen. Add the account you will connect as a test user while the app is in testing.
2. Create an OAuth client ID of type **Web application**. Add the frontend origins you use (for example `http://localhost:5173` and `http://localhost:5174`) under **Authorized JavaScript origins**. Add the production frontend origin when deploying.
3. Set `GOOGLE_DRIVE_CLIENT_ID` and `GOOGLE_DRIVE_CLIENT_SECRET` in the private `backend/.env`. These OAuth credentials are also used for Google sign-in and for verifying login-email changes from Profile. Set `GOOGLE_LOGIN_ALLOWED_EMAIL` to the verified administrator email allowed to sign in with Google. A 32-byte `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` is required for Drive backups; keep it private and backed up because changing it makes saved Drive connections unreadable.
4. Install PostgreSQL command-line tools on the API host. `pg_dump` must be on `PATH`, or set `PG_DUMP_PATH` in `backend/.env` to its absolute executable path. Use a client version matching or newer than the server.
5. Restart the backend and open **Settings**. Choose **Connect Google Drive** for each account you want to use, signing in and approving access for each one. **Save Backup** then creates one complete PostgreSQL custom-format dump and uploads a copy to every connected account, each in its own `Devi Times Backups` folder. If no account is connected, **Save Backup** starts Google sign-in and uploads after approval.

The Drive scope is limited to files created by Devi Times. Each dump contains the complete `public` application schema and all its records, including application login password hashes and connected Drive account emails and encrypted refresh tokens. No Google profile export is performed, but fields already stored in the application database are included. Supabase-managed schemas are not included. Treat the dump as sensitive. The server-side `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` is not included, so keep that key securely backed up if restored Drive tokens should remain usable. Pending offline changes must sync before a backup can be saved.

The `.dump` file can be restored with PostgreSQL's `pg_restore` utility. It includes the public schema objects and data, but not Supabase-managed schemas or cluster-wide PostgreSQL roles.

### Admin multi-factor authentication

Before deploying MFA support, apply the new backend database migration with `npm run db:migrate -w backend`. The backend must have the same stable `MFA_ENCRYPTION_KEY` in every environment where it runs. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and store it as a private environment variable. Do not rotate or lose this key while MFA is enabled; encrypted authenticator secrets will no longer be readable.

Admins can enable MFA from **Profile** after setting a password (Google-only admins can set one there first). Scan the on-screen QR code with Google Authenticator, verify a six-digit code, and save the one-time recovery codes somewhere secure. Both password and Google sign-in then require an authenticator or unused recovery code. Disabling MFA requires the current password and a fresh authenticator code and invalidates other active sessions.

### Public legal pages for Google OAuth

The static public policy pages are served at `/privacy.html` and `/terms.html` from the production frontend origin. They do not require a signed-in session or a hash route. Enter the full production URLs in Google Auth Platform for the app's Privacy Policy and Terms of Service links, and verify both pages load while signed out. A public support email and the operator's legal entity/jurisdiction have not been supplied; Google production review or legal publication may require those details.

### Offline operation

After signing in while online, the app keeps the product/category/settings data it has loaded on this device. Bills, product/category changes, stock adjustments, and settings changes made offline are saved locally and queued for sync when connectivity returns. The app header shows connection and pending-sync status. Keep the app signed in on the device; signing out prevents that user's queued changes from syncing until they sign in again.

Offline invoices use a temporary `OFFLINE-…` reference until the server assigns the final invoice number after sync. Apply the Supabase migrations before deploying the updated API:

```bash
npm run db:migrate -w backend
```

### Responsive web app and installation

The web app keeps its desktop sidebar, uses a compact icon rail at tablet widths, and provides a navigation drawer in mobile browsers. When installed on a phone, it switches to bottom tabs with the remaining role-authorized pages under **More**. Admin and cashier permissions are unchanged.

Serve the frontend over HTTPS (or localhost during development), then use the browser's **Install** or **Add to Home Screen** action where available. The web manifest and service worker provide the installable app shell; `/api` requests are not intercepted or cached. Offline data and queued changes continue to use the app's existing local-storage and synchronization workflows.

- Frontend: http://localhost:5173  
- API: http://127.0.0.1:8787/api

**Desktop (API + frontend + Electron):**

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run dev -w electron
```

### 5. Initial login

| Role | Email | Password |
|------|-------|----------|
| Admin | Chosen during one-time initialization | Chosen during one-time initialization |

## Modules

| Module | Description |
|--------|-------------|
| **Dashboard** | Today/monthly sales, profit estimate, charts, low stock, top products |
| **Billing / POS** | Barcode scan, product search, GST lines, payment modes, receipt printing, F-key shortcuts |
| **Products** | CRUD, variants, barcodes (admin) |
| **Inventory** | Stock history, adjustments (admin) |
| **Invoices** | List, thermal print, PDF download, cancel (admin only) |
| **Reports** | Sales, GST, inventory; CSV export (admin) |
| **Profile** | Update your name and password; change your login email after Google verifies the same address; configure admin MFA |
| **Manage Users** | Create, update, deactivate, and delete shop accounts (admin) |
| **Settings** | Shop details, GST, Google Drive backup (admin) |

Receipt-printer setup in Billing opens the browser or Windows print dialog with a no-sale test receipt. Add the printer to Windows first, then select it in that dialog. The app does not save a separate printer selection; direct USB/Bluetooth pairing requires a supported printer model and is not included yet.

## Role Permissions

| Action | Admin | Cashier |
|--------|-------|---------|
| Create bills | ✅ | ✅ |
| View dashboard | ✅ | ✅ |
| View reports | ✅ | ❌ |
| Manage own profile | ✅ | ✅ |
| Delete/cancel invoices | ✅ | ❌ |
| Stock adjustment | ✅ | ❌ |
| Product CRUD | ✅ | ❌ |
| Manage users | ✅ | ❌ |
| Settings & backup | ✅ | ❌ |

Deleting an account with sales or stock history deactivates it instead, preserving the records and their attribution. Admins cannot remove or deactivate their own account or the last active admin.

## POS Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F2 | Focus product search |
| F4 | Focus barcode input |
| F8 | Save bill |
| Esc | Clear bill |

## Build for Production

### Web frontend + API

```bash
npm run build -w frontend
npm run build -w backend
```

Serve `frontend/dist` via any static host; run API with `npm run start -w backend`.

### Windows EXE (Electron)

The desktop app calls the deployed Node.js API (configured in `frontend/.env.electron`):

`https://your-api-host.example/api`

```bash
npm run build:desktop
```

This runs `vite build --mode electron` with `base: './'` (relative asset paths for `file://`) and packages `frontend/dist` into the installer.

Output: `electron/dist/Devi Times Billing Setup x.x.x.exe`

**Note:** The desktop app uses `HashRouter` (not `BrowserRouter`) so routing works under Electron's `file://` protocol.

## API Overview

Base URL (local): `http://127.0.0.1:8787/api`. Set `VITE_API_URL` in the production and Electron environment files to the deployed Node.js API URL before building.

| Endpoint | Description |
|----------|-------------|
| `POST /auth/login` | JWT login |
| `GET /auth/google/config` | Check whether allowlisted Google sign-in is configured |
| `POST /auth/google` | Sign in with a verified, authorized administrator Google account |
| `POST /auth/mfa/verify` | Complete an administrator sign-in challenge with an authenticator or recovery code |
| `POST /auth/mfa/enrollment` | Start admin authenticator enrollment (admin) |
| `POST /auth/mfa/enable` | Confirm enrollment and receive one-time recovery codes (admin) |
| `POST /auth/mfa/disable` | Disable MFA with the current password and authenticator code (admin) |
| `GET /auth/google/email-verification/config` | Check whether Google login-email verification is configured |
| `GET /auth/me` | Get the signed-in user's profile |
| `PUT /auth/me` | Update the signed-in user's name and password |
| `PUT /auth/me/email` | Verify a Google email and change the login email |
| `GET /auth/users` | List shop accounts (admin) |
| `POST /auth/users` | Create a shop account (admin) |
| `PUT /auth/users/:id` | Update a shop account (admin) |
| `DELETE /auth/users/:id` | Delete or deactivate a shop account (admin) |
| `GET /dashboard/stats` | Dashboard metrics |
| `GET /products` | Product list / search |
| `GET /products/barcode/:code` | Barcode lookup |
| `POST /invoices` | Create bill |
| `GET /invoices/:id/pdf` | Download PDF |
| `GET /reports/sales` | Sales report |
| `PUT /settings` | Update shop settings |

MFA verification is public but requires a short-lived, one-time challenge issued after primary sign-in. Enrollment and disable routes require an admin access token.

## Thermal Printing

- **Browser:** Save & Print opens an 80mm HTML receipt window.
- **Electron:** Uses native print dialog via `electronAPI.printThermal()`.

Configure shop details under **Settings** for receipt header (GSTIN, address, footer).

## Database Schema

Core tables: `users`, `mfa_login_challenges`, `products`, `product_variants`, `categories`, `invoices`, `invoice_items`, `customers`, `payments`, `suppliers`, `stock_history`, `settings`, `backups`.

View schema: `backend/src/db/schema/index.ts`

Drizzle Studio: `npm run db:studio -w backend`

### Database commands

| Command | Description |
|---------|-------------|
| `npm run db:generate -w backend` | Generate a PostgreSQL migration from the Drizzle schema |
| `npm run db:migrate -w backend` | Apply pending migrations to Supabase PostgreSQL |

## Security Notes

- Change the initial admin password after first login
- Use a long random `JWT_SECRET`
- Enable HTTPS behind reverse proxy in production

## License

Proprietary — Devi Times

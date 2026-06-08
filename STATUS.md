# Session Handoff — Reconciliation App
_Last updated: 2026-06-08 (session 2)_

---

## URLs
| Service | URL |
|---|---|
| Frontend (Vercel) | https://accounting-app-frontend-mu.vercel.app |
| Backend (Railway) | https://backend-production-db77.up.railway.app |

## How to run locally
```bash
docker compose up -d
cd backend && pnpm run start:dev    # :3000
cd frontend && pnpm run dev         # :3001
```

| Account | Email | Password | Role |
|---|---|---|---|
| Super Admin | superadmin@recon.ae | SuperAdmin123! | super_admin |
| Admin | admin@recon.ae | admin123 | admin |

---

## 🚨 BLOCKING — Must fix next session

### 1. Git remote not set up — code not reaching GitHub
All local commits (fixes, PWA, Dockerfile, etc.) are NOT pushed to GitHub yet.
No remote is configured: `git remote -v` returns empty.

**Fix:**
```bash
# 1. Create repo on github.com (Private, no README)
cd "/Users/mac/Desktop/Reconcillation app"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Vercel showing 404 for all users
React SPA routing — direct URL hits return 404 because Vercel doesn't know to serve index.html.
`frontend/vercel.json` already created with the fix but NOT pushed yet (blocked by issue 1).

### 3. Frontend hitting wrong API URL
`frontend/.env.production` created with `VITE_API_URL=https://backend-production-db77.up.railway.app`
NOT pushed yet (blocked by issue 1).

### 4. Railway migration 008 constraint bug
Migration `1000000000008-RolesAndStatus.ts` fixed (drops old role constraint before inserting super_admin).
NOT pushed yet (blocked by issue 1).

### 5. Railway backend not connected to local code
Railway needs to be pointed at the GitHub repo after push.
Railway backend service → Settings → Source → connect GitHub repo → branch main.

---

## Once push is done — verify these
- [ ] `curl https://backend-production-db77.up.railway.app/health` returns `{"status":"ok"}`
- [ ] https://accounting-app-frontend-mu.vercel.app loads login page (not 404)
- [ ] Login with superadmin@recon.ae / SuperAdmin123! succeeds
- [ ] Railway logs show all 9 migrations applied cleanly

---

## What was completed this session

### Auth & permissions (fully working locally)
- 4 roles: `super_admin`, `admin`, `developer`, `user`
- Registration → pending → approve flow
- All 7 backend controllers fixed (removed stale `accountant` role → `super_admin/admin/developer`)
- Frontend TS build: zero errors

### PWA
- `vite-plugin-pwa` installed and configured
- Service worker precaches static assets, never caches API calls
- Icons: `frontend/public/icon-192.svg`, `icon-512.svg`, `icon-maskable.svg`
- Manifest: name="Reconciliation App", short_name="Recon", theme=#0f172a

### Deployment setup
- `Dockerfile` at repo root (Railway uses this — fixed pnpm not found error)
- `.dockerignore` excludes frontend/electron/node_modules
- `app.module.ts` uses `DATABASE_URL` (Railway auto-injects) with SSL + fallback to individual vars locally
- `migrationsRun: true` in production only (`NODE_ENV=production`)
- `frontend/.env.production` — hardcoded Railway URL
- `frontend/vercel.json` — SPA rewrite rules
- `v1.0` version tag in sidebar

### Railway env vars needed (set in backend service Variables tab)
| Variable | Value |
|---|---|
| `DB_HOST` | from PostgreSQL service PGHOST |
| `DB_PORT` | from PGPORT |
| `DB_USER` | from PGUSER |
| `DB_PASSWORD` | from PGPASSWORD |
| `DB_NAME` | from PGDATABASE |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | any random hex string |

---

## Next features (after deployment fixed)
- [ ] Invoice system (VAT / offshore / third-port)
- [ ] Product lists with daily pricing per company

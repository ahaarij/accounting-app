# Session Handoff — Reconciliation App
_Last updated: 2026-06-08_

---

## How to run
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

## What was done (2026-06-08 session)

### 1. Role-based auth overhaul
- **4 roles**: `super_admin` (one, seeded), `admin`, `developer`, `user`
- **Registration flow**: new signups get `status='pending'` — cannot log in until approved
- **Login** returns specific errors: "pending approval" vs "declined"
- **Super admin** seeded: `superadmin@recon.ae` / `SuperAdmin123!`
- **User Management page** — two tabs: Pending Requests (approve/reject) + Active Users (role change, delete)
- **Register page** at `/register` — on success shows pending message, no token issued
- Route guards updated: `user` role → Dashboard + Companies + Cash Tracker only; `admin`/`developer`/`super_admin` → full access; `/users` → `admin`+ only
- Migration applied manually via `docker exec psql` (tsx transpiler lacks `emitDecoratorMetadata`, breaks TypeORM migration CLI)
- `users` table: `status VARCHAR(20)` column added; role check constraint updated to allow new roles

### 2. Cash Deposits Tracker (4 view modes)
- Added **By Bank** and **By Owner** grouping views alongside existing Category and Company views
- Company separator bars (3px slate divider) between different companies in Category view
- Fixed stale-rows bug when switching views: `key={viewMode}` on wrapper div forces full remount

### 3. Slash-name company cleanup
- Deleted the 10 "old name" companies from slash-pairs (e.g. "HEDGES TOURISM" removed, "BLACK PEPPER TOURISM LLC" kept)
- DB now has 52 companies (was 62)
- Seed migration `1000000000006` updated to only insert right-side names going forward

---

## Current DB state
```
users table:
  id=1  admin@recon.ae      admin       active
  id=4  acct@acct.com       admin       active
  id=5  view@view.com       user        active
  id=6  superadmin@recon.ae super_admin active
```

---

## What still needs doing

### Immediate (verified 2026-06-08)
- [x] `cd frontend && pnpm run build` — zero TS errors (fixed Breadcrumb, accountant role, isViewer refs)
- [x] `cd backend && pnpm run start:dev` — compiles and connects clean
- [x] Auth flow: register → pending → approve → login all confirmed working
- [x] Backend role guards updated — replaced stale `accountant` role with correct `super_admin/admin/developer` across all 7 controllers

### Next features
- [ ] Invoice system (VAT / offshore / third-port)
- [ ] Product lists with daily pricing per company
- [ ] AWS deployment: ECS + RDS + S3 + CloudFront

---

## Key files changed this session
| File | Change |
|---|---|
| `backend/src/entities/user.entity.ts` | Added `status` column, updated role type to 4 new roles |
| `backend/src/auth/auth.service.ts` | `register()` returns message not token; `login()` checks status |
| `backend/src/auth/auth.controller.ts` | Removed `role` from RegisterDto |
| `backend/src/users/users.service.ts` | `findPending()`, `approveUser()`, `rejectUser()`, `updateRole()` with super_admin protection |
| `backend/src/users/users.controller.ts` | New `/pending`, `/approve`, `/reject` endpoints |
| `backend/src/database/migrations/1000000000006-SeedCompanyProfiles.ts` | Slash-name entries use right-side names only |
| `frontend/src/auth/AuthContext.tsx` | `isSuperAdmin`, `isAdmin`, `canEdit` derived from new roles |
| `frontend/src/auth/PrivateRoute.tsx` | Accepts `UserRole[]` roles prop |
| `frontend/src/pages/Register.tsx` | New page — pending approval flow |
| `frontend/src/pages/Login.tsx` | Pending/declined error messages; link to /register |
| `frontend/src/pages/UserManagement.tsx` | Two-tab UI: Pending Requests + Active Users |
| `frontend/src/pages/CashDepositsTracker.tsx` | 4 view modes + separator bars + stale-rows fix |
| `frontend/src/App.tsx` | Route guards by role; /register public route |
| `frontend/src/components/Layout.tsx` | Role-based sidebar visibility + role badge |

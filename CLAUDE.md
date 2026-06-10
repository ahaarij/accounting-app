# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules

- **Never `git push` unless the user explicitly asks to push.** Commit locally as needed, but do not push to origin without being asked. Vercel and Railway auto-deploy on push to `main`, so pushing = deploying to prod.

## Project

Financial management platform for a UAE-based multi-company trading group. Originally built as a desktop reconciliation app; **pivoting to a multi-user web app hosted on AWS** (ECS + RDS + S3, ~50 simultaneous users).

**Current state:** Excel import engine + reconciliation engine will be deprecated. Existing reconciliation data can be wiped. The Cash Ledger and Bank Statements (CSV/PDF) modules remain relevant.

**Planned new modules:** multi-company profiles (10+), product lists with daily prices, invoice system (VAT / offshore / third-port shipment), buyer/supplier registry, Bill of Lading management.

**Deployment target:** Vercel (frontend) + Railway (NestJS + PostgreSQL). Electron replaced by PWA.

**Live URLs:**
- Frontend: https://accounting-app-frontend-mu.vercel.app
- Backend: https://backend-production-db77.up.railway.app

---

## Commands

### Backend (NestJS — `backend/`)

```bash
# Start dev server (hot-reload, runs on :3000)
cd backend && pnpm run start:dev

# Run migrations
cd backend && pnpm run migration:run

# Revert last migration
cd backend && pnpm run migration:revert

# Run unit tests
cd backend && pnpm test

# Run tests with coverage
cd backend && pnpm run test:cov
```

### Frontend (React/Vite — `frontend/`)

```bash
# Start dev server on :3001
cd frontend && pnpm run dev

# Build for production
cd frontend && pnpm run build
```

### Electron (`electron/`)

```bash
# Open desktop window (requires frontend running on :3001)
cd electron && pnpm start
```

### Docker / Database

```bash
# Start PostgreSQL (reconciliation / reconciliation123 / port 5432)
docker compose up -d

# Stop
docker compose down

# Verify tables
docker exec reconciliation-db psql -U reconciliation -d reconciliation -c "\dt"
```

### Workspace

```bash
# Install all workspaces from root
pnpm install
```

---

## Architecture

### Request flow

```
Electron window
  → loads React frontend (localhost:3001)
    → axios calls NestJS backend (localhost:3000)
      → TypeORM → PostgreSQL (Docker, port 5432)
```

### Monorepo workspaces

- **`/electron`** — Electron shell. `main.js` loads `http://localhost:3001` in dev, `dist/index.html` in prod. No business logic here.
- **`/frontend`** — React 18 + Vite + Tailwind. All API calls go to `http://localhost:3000`.
- **`/backend`** — NestJS. Two feature modules: `ImportModule` and `ReconciliationModule`.

### Backend module structure

```
src/
  app.module.ts               ← root: wires TypeORM, ImportModule, ReconciliationModule
  entities/                   ← 11 TypeORM entities (one per DB table)
  database/
    data-source.ts            ← standalone DataSource for CLI migrations
    migrations/               ← single migration: 1000000000000-InitialSchema.ts
  import/
    import.module.ts          ← forwardRef → ReconciliationModule to avoid circular dep
    import.service.ts         ← orchestrates all 4 parsers; auto-triggers reconciliation
    import.controller.ts      ← POST /import/group-a|group-b|transactions|cashflow
    parsers/
      group-a.parser.ts       ← File 1 (55 sheets, SUMMARY + account ledgers)
      group-b.parser.ts       ← File 2 (259 sheets, 3 SUMMARY sheets merged)
      transaction.parser.ts   ← File 3 (date-block format)
      cashflow.parser.ts      ← File 4 (Sheet1 cashflow + Sheet2 counterparty ledger)
    utils/
      date.util.ts            ← normalizeDate() + toNumber() — used by ALL parsers
  reconciliation/
    reconciliation.module.ts  ← exports ReconciliationService
    reconciliation.service.ts ← 10 reconciliation checks
    reconciliation.controller.ts ← POST /reconciliation/run + GET results/flags
    reconciliation.math.spec.ts  ← unit tests for Check 1 + Check 5 math
```

### The 4 Excel files

| File | Parser | Key quirk |
|---|---|---|
| Group A balances | `GroupAParser` | SUMMARY sheet name has trailing space; up to 1M rows — stop at 5 consecutive empty rows |
| Group B balances | `GroupBParser` (extends GroupAParser) | 3 SUMMARY sheets: `SUMMARY`, `SUMMARY (2)`, `SUMMARY (3)` — all merged |
| Daily transactions | `TransactionParser` | Rows starting with `"TRANSACTION ON"` are date headers; skip rows with empty SL/NO |
| Daily cashflow | `CashflowParser` | Filename IS the date (e.g. `5-5-2026.xlsx`); Sheet1 = cashflow snapshot, Sheet2 = counterparty ledger |

### Reconciliation engine (10 checks)

Runs automatically after Group A and Group B imports. Also triggerable via `POST /reconciliation/run`.

1. Balance: `opening + deposits − withdrawals = closing` (±0.01 tolerance)
2. Account status: flags blocked/kyc_issue/disabled/closed accounts → critical
3. Negative balance: closing_balance < 0 → critical
4. Intergroup matching: debit without matching credit within ±1 day → warning
5. Counterparty balance: `ob + inward − outward + commission = closing` (±0.01) → critical
6. Missing invoices: inward/outward without invoice_number → warning
7. Currency conversion: USD→AED without matching AED credit → warning
8. Duplicate detection: same (account, date, particular, deposit, withdrawal) → warning
9. File completeness: all 4 file types imported for the date → critical if missing
10. Stale accounts: last tx > 90 days ago but balance > 0 → info

All flags are deduplicated before insert via `saveFlag()` helper.

---

## Critical conventions

### Never floats for money
All financial columns are `NUMERIC(15,2)` in PostgreSQL. Never use JS `number` arithmetic on aggregates — use `parseFloat(x.toFixed(2))` before persisting.

### Single date normalisation utility
**Always** use `normalizeDate()` from `backend/src/import/utils/date.util.ts`. The client files contain at least 6 date formats (DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY, Excel serial numbers, ISO, etc.). Never write ad-hoc date parsing elsewhere.

### Idempotent imports
Every insert checks for an existing record with the same business key before inserting. Re-uploading the same file must produce 0 new records and 0 errors. The dedup key per entity:
- `account_transactions`: (bank_account_id, date, particular, deposit, withdrawal)
- `daily_transactions`: (date, particulars, source_bank, amount_aed, amount_usd)
- `counterparty_ledger`: (date, counterparty_name)
- `daily_cashflow`: (date, transaction_group)
- `reconciliation_flags`: (date, flag_type, bank_account_id, description)

### Circular dependency
`ImportModule` → `ReconciliationModule` is handled with `forwardRef(() => ReconciliationModule)` in the imports array and `@Inject(forwardRef(() => ReconciliationService))` in `ImportService`. Do not remove the forwardRef.

### Opening balance derivation
If an account sheet has no explicit "OPENING BALANCE" row, it is derived as:
`opening = first_tx.running_balance − first_tx.deposit + first_tx.withdrawal`

### account_code + remarks wiring
After parsing, `ImportService` builds a `Map<companyName, {account_code, remarks}>` from the SUMMARY rows and passes both fields into `upsertBankAccount()`. The `remarks` field drives the `status` enum via `mapStatus()`.

---

## Database

Single migration at `backend/src/database/migrations/1000000000000-InitialSchema.ts` creates all 11 tables. **Do not use `synchronize: true`** — always add new columns via a new migration file and run `pnpm run migration:run`.

Connection defaults: host=localhost, port=5432, db=reconciliation, user=reconciliation, password=reconciliation123.

---

## Build progress

### ✅ Phase 1 — Foundation (complete)
Monorepo scaffolded. Electron loads React on `:3001`. NestJS on `:3000` with `GET /health`. PostgreSQL via Docker. All 11 tables created via single migration. Full chain verified.

### ✅ Phase 2 — Excel Import Engine (complete)
All 4 parsers built and tested against actual client files. 18,356 account transactions, 2,855 daily transactions, 35 cashflow rows, 32 counterparty rows imported. Idempotent — re-upload inserts 0 duplicates. `account_code` and `opening_balance` wired through from SUMMARY sheets.

### ✅ Phase 3 — Reconciliation Engine (complete)
All 10 checks implemented in `ReconciliationService`. 265 reconciliation results and 483 flags generated against live data. Auto-triggers after Group A and Group B imports. 20 unit tests passing.

### ✅ Phase 4 — Authentication (complete, updated 2026-06-08)
4 roles: `super_admin` (one, seeded), `admin` (accounting team), `developer` (testing), `user` (view-only). New registrations create `status='pending'` — login blocked until admin approves. `AuthService` handles `register()` (no token returned, shows pending message) + `login()` → JWT (8h expiry) with pending/rejected guards. `JwtStrategy` + `RolesGuard` + `@Roles()` decorator unchanged. Super admin seeded: `superadmin@recon.ae` / `SuperAdmin123!`. Migration applied manually via docker psql due to tsx/emitDecoratorMetadata limitation. Route guards: `user` role can only access `/`, `/company-profiles`, `/cash-deposits`; `admin`/`developer`/`super_admin` get full operational access; `/users` requires `admin` or above.

### ✅ Phase 5 — Frontend Screens (complete)
All 8 screens built: Login, Import (drag-drop + Run Reconciliation), Dashboard (KPI cards + 30-day chart + all accounts sorted zeros-last + open flags panel), AccountDetail (paginated transactions + highlight-row on navigation), ReconciliationReport (expected/actual/difference + click-to-highlight), CashTradeLedger (day-grouped transactions + counterparty ledger with color coding + row highlight on navigation), FlagManagement (resolve with notes + navigate-to links), UserManagement (admin only).

Additional backend modules: `bank-accounts/` (accounts list, single account, transactions, daily-transactions, counterparty-ledger), `users/` (list, role update, delete).

UI highlights: flags grouped critical→warning→info; flag navigation passes `{ highlightDate, severity, description }` to AccountDetail and `{ highlightTransactionId, highlightDate }` to CashTradeLedger; both pages show a banner and highlight the matching row with auto-scroll. Dashboard accounts list shows `bank_name (currency)` per account. Counterparty ledger status derived from Excel cell background color (red=owed_to_them, green=owed_by_them) with sign-based fallback.

---

### ✅ Phase 7 — Company Profiles (complete, updated 2026-06-10)
- 3 new tables: `company_profiles`, `buyers_suppliers`, `company_party_links`
- `CompaniesModule` at `backend/src/companies/` — CRUD + logo upload (multer → `backend/uploads/logos/`, served at `/uploads/*` via `useStaticAssets`)
- Sort: A → B → C → null, alphabetical within group
- 62 companies seeded → trimmed to 52 (10 slash-name "old" companies deleted, only right-side new names kept)
- Frontend: `/company-profiles` grid + `/company-profiles/:id` 3-column view (suppliers | company | buyers)
- Migration `1000000000011-CompanyProfileExtras.ts` adds: `country VARCHAR(100)`, `is_active BOOLEAN DEFAULT true`, `contact_emails TEXT` (CSV), `contact_phone VARCHAR(50)` — applied manually via docker psql
- Entity: `backend/src/entities/company-profile.entity.ts` has all 4 new fields
- `CompaniesModule` `create()`/`update()` accept all new fields
- `/company-profiles` grid: country + active/inactive filter dropdowns; inactive badge on cards; dynamic email list UI (add/remove per field); country uses `COUNTRIES` dropdown from `frontend/src/lib/countries.ts`
- `/company-profiles/:id` detail: active badge, Globe/Phone/Mail icons for contact info, dynamic email pills, country shown; label "Company Active Accounts" → "Company Accounts"
- Import page: subtitle + 4 Excel dropzones + Recon + Reset all hidden with `{false &&}` — not deleted
- Sidebar: Recon Report + Cash Ledger commented out of navItems
- Cash Ledger: Balance column hidden (commented out in form, header, cell — DB field intact)

### ✅ Phase 8 — Cash Deposits Tracker (complete, updated 2026-06-10)
- `/cash-deposits` page — tracks cash deposit limits per **company** (limit spans all bank accounts)
- Backend: `GET /cash-deposits` returns flat `CompanyRow[]` (one per company+account); `PATCH /cash-deposits/company-limits/:id` already updates ALL accounts for the company
- Frontend groups rows into `CompanyGroup` (sum deposits across all accounts, use shared monthly_limit)
- Default limits by category: C=750K/mo, B=500K/mo, A=250K/mo (all per_tx=250K)
- **Display**: company row (total vs limit, utilization bar, last tx date) → expand → account sub-rows → expand → deposit rows
- **Sort**: C→B→A→null, then most available capacity, then most accounts, then oldest last transaction
- **Category filter**: All/C/B/A pill buttons; By Bank/Owner/Brand views hidden (code kept)
- **Date filter**: month-only using same `MonthPicker` dropdown-calendar as Dashboard deposit graph (Safari-safe)
- **Large Deposit Planner**: rotates accounts — unused this period first, then lowest volume; uses `CompanyGroup` for company-wide capacity check
- Companies with no bank accounts filtered out entirely
- 4 summary stat cards: Total Deposited, At Limit (companies), Near Limit, Available Capacity

### ✅ Phase 6 (partial) — Additional features (complete)

- Active/Passive account classification by 90-day last-transaction rule (replaces Group A/B split)
- `AccountsList` page (`/account-group/:type`) — drill-down for active/passive accounts sorted by last transaction date
- IMAP email polling hardened: two-phase fetch (mark-seen before processing), `ON CONFLICT DO NOTHING` on processed_emails
- Delete individual reconciliation results (`DELETE /reconciliation/results/:id`)
- Excel serial date strings (e.g. `"45781"`) handled in `normalizeDate()`
- **PDF import system**: `pdf-parse` v2 installed; `pdf_password` per `csv_account`; email monitor handles `.pdf` attachments automatically; `importPDF()` tries no-password first then stored password; `previewPDF()` returns structured table data via `getTable()`; PDF Statement card in Bank Statements UI with Import/Preview modes
- **Cash Ledger** (`/cash`): `cash_entries` table + `CashModule`; Manual Entries CRUD tab + From Cashflow Sheet tab (surfaces `daily_cashflow` + `counterparty_ledger`); sub-nav under Bank Statements

---

## Next — Remaining work

- **Company Profiles UI improvements** (next session — see STATUS.md)
- Invoice system: VAT / offshore / third-port invoices
- Product lists with daily pricing per company
- Azure migration (student pack) → then AWS (ECS + RDS + S3)

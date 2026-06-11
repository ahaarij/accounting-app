# Session Status — 2026-06-11 (Session 2)

## Last completed: Dashboard graph improvements, bank account statuses, cash tracker fixes

### What was done this session

1. **CORS fix** — added `recon-ae.vercel.app` to backend CORS whitelist (committed + pushed)

2. **Dashboard — Daily Cash Deposits graph**
   - Custom tooltip with "See details →" button on hover
   - Click any bar → day detail modal (company, bank account, category, amount, description)
   - Graph title now shows inline: `Deposited: AED X.XXM` + `Available: AED X.XXM`
   - Fixed double-counting bug: null-bank-account rows now filtered before processing
   - Fixed available capacity formula: per-company capping before summing (matches CashDepositsTracker)

3. **Bank account active/inactive status** (full stack)
   - New DB columns: `company_inactive_accounts TEXT`, `personal_inactive_accounts TEXT`
   - Migration file: `1000000000013-AddInactiveAccounts.ts` — **applied locally via docker psql**
   - **Prod Railway SQL still needed**: `ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS company_inactive_accounts TEXT DEFAULT NULL; ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS personal_inactive_accounts TEXT DEFAULT NULL;`
   - Backend entity + service updated for both new fields
   - `CompanyProfileDetail.tsx`: `AccountPillsWithStatus` (green=active, red=inactive) + `BankStatusSelector` (3-state click cycle)
   - `CompanyProfiles.tsx` grid: cards show green/red pills + edit modal uses same `BankStatusSelector`
   - API types in `frontend/src/api/index.ts` updated

4. **Cash Deposits Tracker filtering** (`cash-deposits.service.ts`)
   - Inactive companies (`is_active=false`) → excluded entirely
   - Companies with no active bank accounts → excluded entirely
   - Removed `[null]` fallback row — permanently fixes double-counting root cause

5. **Cash Deposits summary cards** — now react to category filter (use `sortedGroups` not `companyGroups`)

6. **Custom date range fix** — clicking "Custom" now commits both pickers to current month immediately; was showing visual default without setting state, causing no data to load

---

## NOT YET committed or pushed
All changes above are local only. Commit + push everything together next session.

## Key files changed this session
- `backend/src/main.ts` — CORS (already pushed separately)
- `frontend/src/pages/Dashboard.tsx` — graph tooltip, day modal, summary stats, null-row filter
- `frontend/src/pages/CompanyProfileDetail.tsx` — AccountPillsWithStatus, BankStatusSelector
- `frontend/src/pages/CompanyProfiles.tsx` — BankStatusSelector, BankPills with status
- `frontend/src/api/index.ts` — new fields in updateCompanyProfile type
- `backend/src/entities/company-profile.entity.ts` — 2 new columns
- `backend/src/companies/companies.service.ts` — new fields in DTOs
- `backend/src/database/migrations/1000000000013-AddInactiveAccounts.ts` — new migration (NOT run via CLI, applied manually)
- `backend/src/cash-deposits/cash-deposits.service.ts` — inactive/no-account company filtering

## Rules
- Never git push without being asked
- No GSD workflow — build directly
- Run builds directly: `cd frontend && pnpm run build`
- Prod Railway migration SQL needed before pushing backend (see item 3 above)

# Session Status — 2026-06-13 (end of day)

## Current version: v1.1 (deployed on Vercel + Railway)

---

## What was done this session (2026-06-13)

### Company Profiles — Bank Account Selector redesign
- Replaced the old "show all 17 banks as pill grid with 3-click cycle" UI with a tag-input style selector
- Selected banks only are shown as colored pills (green=active, red=inactive)
- "+ Add" button lives in the header row (next to count badges) — opens a searchable dropdown, always anchored `right-0` so it never overflows the modal
- Clicking the bank name/dot toggles active ↔ inactive; clicking × removes entirely
- **Bug fixed**: `|| undefined` in save payload caused active banks to persist when moved to inactive — fixed by always sending the joined string (even empty) so the backend actually clears the field
- **Bug fixed**: On load, deduplication now strips any bank from inactive that's already in active list
- Both `CompanyProfiles.tsx` and `CompanyProfileDetail.tsx` updated to identical UI

### Cash Deposits Tracker — dynamic limit scaling
- Monthly limit now scales with active account count: `Math.min(activeAccountCount × 250k, categoryMax)`
  - C max 750k: 1 acct=250k, 2=500k, 3+=750k
  - B max 500k: 1 acct=250k, 2+=500k
  - A max 250k: always 250k
- Change is in `backend/src/cash-deposits/cash-deposits.service.ts` — `getDefaultLimits()` now accepts `activeAccountCount`
- Only applies when no manual override exists in `company_deposit_limit` table

### Cash Deposits Tracker — sort order (boss-specified)
- New sort: Category (C→B→A→null) → Available capacity (more first) → Number of accounts (more first) → Oldest last transaction (oldest first, null=never=first)
- Removed the old "at-limit to bottom" step — available capacity naturally handles this
- Change in `sortGroups()` in `CashDepositsTracker.tsx`

### Dashboard — deposit chart tooltip (FIXED)
- Replaced Recharts `<Tooltip>` with a custom absolute-positioned overlay inside a `position: relative` wrapper
- Tooltip anchors to the dot's exact `cx/cy` pixel coordinates — does NOT follow the cursor
- Activates via custom `activeDot` with a transparent r=18 hit circle around the visible r=5 dot
- 600ms grace period when leaving the dot (time to reach "See details")
- `onMouseEnter` on the tooltip div cancels the hide timer — tooltip stays locked while hovering it
- Clicking "See details" OR clicking the dot directly opens the day detail modal
- Smooth 120ms fade-in via `@keyframes depositTooltipIn` in `index.css`

---

## Key files for next session
- `frontend/src/pages/Dashboard.tsx` — deposit chart tooltip (~line 450–530), `activeDeposit` state (~line 165)
- `frontend/src/pages/CashDepositsTracker.tsx` — sort logic (`sortGroups` ~line 157), summary cards
- `frontend/src/pages/CompanyProfiles.tsx` — `BankStatusSelector` component (~line 70), modal form
- `frontend/src/pages/CompanyProfileDetail.tsx` — same `BankStatusSelector` copy, edit modal
- `backend/src/cash-deposits/cash-deposits.service.ts` — `getDefaultLimits()` line 8

---

## Rules
- Never git push without being asked
- No GSD workflow — build directly
- Vercel (frontend) + Railway (backend) auto-deploy on push to main

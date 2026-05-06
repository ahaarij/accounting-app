# Financial Reconciliation Desktop App

## What This Is

A cross-platform desktop application for a UAE-based multi-company financial group that replaces daily Excel-based reconciliation with automated import, validation, and reporting. The app ingests four specific Excel files every day — two group bank balance sheets, a daily transaction sheet, and a daily cashflow summary — runs 10 reconciliation checks automatically, and surfaces results on a clean dashboard. Built with Electron + React + NestJS + PostgreSQL.

## Core Value

The owner can upload today's four Excel files, press one button, and immediately see whether their books balance — with any discrepancies, blocked accounts, or intergroup mismatches highlighted in red.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Electron desktop app (Windows .exe + Mac .dmg) loading React frontend
- [ ] NestJS backend on localhost:3000 with PostgreSQL via TypeORM
- [ ] Import engine: parse all four Excel file types with full edge-case handling
- [ ] File 1 (Group A): 50+ sheets, single SUMMARY, inconsistent dates, up to 1M rows
- [ ] File 2 (Group B): 200+ sheets, three SUMMARY sheets merged into one
- [ ] File 3 (Daily Transactions): date-block format, 10 transaction types, full year per sheet
- [ ] File 4 (Daily Cashflow): Sheet 1 cashflow snapshot, Sheet 2 counterparty ledger
- [ ] ReconciliationService: 10 automated checks post-import
- [ ] Idempotent imports: duplicate detection on every insert
- [ ] JWT auth with RBAC (admin / accountant / viewer)
- [ ] Dashboard with KPI cards, colour-coded account list, flag list, 30-day trend chart
- [ ] Account Detail screen with full paginated transaction history
- [ ] Reconciliation Report screen with PDF export (PDFKit)
- [ ] Cash Trade Ledger screen for counterparty balances
- [ ] Flag Management screen with resolve + notes
- [ ] User Management screen (admin only)
- [ ] Daily Import screen with drag-and-drop upload zones and progress feedback

### Out of Scope

- Cloud hosting or remote database — local PostgreSQL only for now
- Mobile app — desktop-first
- Real-time bank API integration — file-import only
- Multi-tenant / SaaS architecture — single-org deployment
- Currency FX rate automation — manual conversion rates only

## Context

- Client currently manages everything in Excel; this is a direct replacement
- UAE banks in scope: ENBD, FAB, NBF, SIB, ADIB, WIO, Mashreq, RAK, EIB, UBL, Al Masraf
- Currencies: AED (primary), USD, EUR
- Dozens of companies in two groups (A and B); money moves constantly as intergroup transfers
- Files have severe inconsistencies: 6+ date formats, Excel max-row sheets, remarks column not always in column F, opening balance rows with multiple spellings
- All financial amounts must use NUMERIC(15,2) in PostgreSQL — never floats
- Streaming parser required for files up to 1,048,576 rows (do not load full sheet into memory)

## Constraints

- **Tech stack**: Electron + React + TypeScript + Tailwind + shadcn/ui + Recharts + NestJS + PostgreSQL + TypeORM + SheetJS + PDFKit + JWT — no deviations
- **Monorepo**: `/electron`, `/frontend`, `/backend` — exact structure
- **Data integrity**: All amounts NUMERIC(15,2); single date-normalisation utility used everywhere
- **Idempotency**: Importing the same file twice must never create duplicate records
- **Build order**: Phase 1 fully working before Phase 2, Phase 2 before Phase 3, etc.
- **UI clarity**: Pass/fail status must be large and colour-coded — not small text labels

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Electron desktop shell | Client is Windows/Mac, no cloud dependency needed | — Pending |
| NestJS backend over serverless | Persistent DB connection, complex reconciliation logic, structured services | — Pending |
| SheetJS for Excel parsing | Industry standard, handles xlsx edge cases including max-row sheets | — Pending |
| Streaming parser for large sheets | Files can hit 1,048,576 rows — memory-safe required | — Pending |
| Three SUMMARY sheets merged (Group B) | Client's File 2 overflows across SUMMARY, SUMMARY (2), SUMMARY (3) | — Pending |
| Reconciliation blocked on partial imports | All 4 files must be present before any check runs | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-06 after initialization*

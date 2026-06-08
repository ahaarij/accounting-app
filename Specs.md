Claude Code Master Prompt — Financial Reconciliation Desktop App

WHO YOU ARE BUILDING FOR
You are building a desktop application for a large UAE-based multi-company
financial group. The business operates dozens of companies simultaneously,
each holding multiple bank accounts across UAE banks including ENBD, FAB,
NBF, SIB, ADIB, WIO, Mashreq, RAK, EIB, UBL, and Al Masraf. They deal in
AED, USD, and EUR. Money moves between their own companies constantly as
intergroup transfers — this is the core of their daily operations.
The owner currently manages everything through Excel spreadsheets. Your job
is to replace those spreadsheets with a professional desktop application that
imports those same Excel files every day, runs financial checks automatically,
and surfaces everything on a clean dashboard.

TECH STACK — USE EXACTLY THIS, NO DEVIATIONS

Desktop shell: Electron (cross-platform, builds .exe for Windows and
.dmg for Mac)
Frontend: React + TypeScript inside Electron
Styling: Tailwind CSS + shadcn/ui components
Charts: Recharts
Backend: NestJS running on localhost:3000 (separate process)
Database: PostgreSQL via TypeORM (local for now)
Excel parsing: SheetJS (xlsx library)
PDF export: PDFKit
Auth: JWT + Role-Based Access Control (RBAC)

Monorepo structure:
/electron       → Electron shell (main.js, preload.js)
/frontend       → React + TypeScript app
/backend        → NestJS API
The Electron window loads the React frontend. The React frontend makes API
calls to the NestJS backend on localhost:3000. The NestJS backend reads and
writes to PostgreSQL via TypeORM.

THE FOUR EXCEL FILES — UNDERSTAND THESE DEEPLY
Every day the client receives these four files. Your app must import all of
them and process them correctly.

FILE 1 — Group A Bank Balances (e.g. 01__AJEET_BANK_BALANCE_GROUP_A.xlsx)
Structure:

Contains 50+ sheets
First sheet is always called SUMMARY — this is the master balance view
Every sheet after SUMMARY is an individual bank account ledger

SUMMARY sheet columns:
Column A: Account code (e.g. 1A, 1B, 2A)
Column B: Company name (e.g. ROYAL ENBD, PINNACLE INT FAB)
Column C: AED balance
Column D: USD balance
Column E: EUR balance
Column F: REMARKS — critical field, can contain: blocked, KYC ISSUE, NA, 
          NOT WORKING, ONLINE ISSUE, DISABLED, CLOSED, DISABLED
Individual account sheets (e.g. "ROYAL ENBD AED", "BULLFROG FAB USD"):

Sheet name = Company name + Bank name + Currency
Row 1: Company name
Row 2: Bank account number label
Row 3: Column headers — DATE, PARTICULAR, DEPOSIT, WITHDRAWAL, BALANCE
Row 4 onwards: Transaction rows

Each transaction row has:
DATE        → various formats: DD-MM-YYYY, DD.MM.YYYY, datetime objects
PARTICULAR  → description e.g. "FUND RECD FROM ROYAL ENBD", "BANK CHARGES",
              "TT TRF TO INFINITY WIO AED", "CASH DEPOSIT", "USD TO AED"
DEPOSIT     → amount credited (can be None/empty)
WITHDRAWAL  → amount debited (can be None/empty)
BALANCE     → running balance after this transaction
Important parsing notes for File 1:

Many rows are empty — skip them
Date formats are inconsistent across sheets — handle all formats
Some sheets have 1,048,576 rows (Excel max) — only read until you hit
consecutive empty rows
The REMARKS column in SUMMARY is not always in column F — scan for it
Opening balance rows are labelled "OPENING BALANCE" or "opening balance"
or "OPENING BLC" or "OPEING BLC"


FILE 2 — Group B Bank Balances (e.g. 02__BANK_BALANCE_GROUP_B.xlsx)
Same structure as File 1 but larger — 200+ sheets.
There are THREE summary sheets inside this file:

SUMMARY — first group of companies
SUMMARY (2) — second group (overflow)
SUMMARY (3) — third group (overflow)

Parse all three summary sheets and merge them into one master balance list.
Everything else is identical to File 1 — same column structure, same
transaction format, same parsing rules.

FILE 3 — Daily Transaction Sheet (e.g. 03__DAILY_TRANSACTION_SHEET_2026.xlsx)
Structure:

Contains multiple sheets, one per month or period (e.g. 2026, F MAY 26)
Each sheet has multiple transaction blocks separated by date headers

Transaction block format:
Row with "TRANSACTION ON DD-MM-YYYY" → date header for the block below it
Next row → column headers: SL/NO, PARTICULARS, A/C, BENEFICIARY, A/C, 
           REMITTANCE, AED, USD, EURO, PI, INVOICE NO, TRANSPORT, REFERENCE
Following rows → individual transactions for that date
Transaction row columns:
SL/NO       → sequential number
PARTICULARS → transaction type: BANK CHARGES, INWARD, OUTWARD, INTERGROUP,
              CASH DEPOSIT, USD TO AED, AED TO USD, FINANCE REPAYMENT
A/C         → source bank (FAB, SIB, ENBD, NBF, ADIB, WIO, MSQ, etc.)
BENEFICIARY → receiving company name
A/C (2nd)   → destination bank
REMITTANCE  → remittance reference if applicable
AED         → amount in AED (can be empty)
USD         → amount in USD (can be empty)
EURO        → amount in EUR (can be empty)
PI          → Purchase Invoice reference
INVOICE NO  → invoice number
TRANSPORT   → transport reference
REFERENCE   → additional reference, sometimes contains "PAY"
Important parsing notes for File 3:

A new date block starts whenever a cell contains text starting with
"TRANSACTION ON"
Skip rows where SL/NO is empty
The same sheet contains the entire year — parse all date blocks
Amount columns can have None, 0, or a number — treat None and 0 as no amount


FILE 4 — Daily Cashflow Summary (e.g. 5-5-2026.xlsx)
This file is named by date — the filename IS the date.
Sheet 1 — Daily Cashflow:
Row with date → the date this cashflow covers
"CASHFLOW AS OF DD/MM/YYYY" → confirmation of date
Then rows showing:
  Op Bal + "DAILY TRANSACTION -1" → AED amount, USD amount
  Op Bal + "DAILY TRANSACTION -2" → AED amount, USD amount  
  Op Bal + "DAILY TRANSACTION -PERSONAL" → AED amount, USD amount
  Op Bal + "CASH" → cash balance
  Op Bal + "HOLD" → held funds
  Op Bal + "BANK ACCOUNT BALANCE IN EUR CONVERTED INTO USD" → EUR total in USD
Parse this as the daily opening snapshot showing where funds are distributed.
Sheet 2 — Cash Trade Counterparty Ledger:
This is the most sensitive sheet. It tracks individual counterparties
(people/companies they do cash trades with).
Column headers: COMMENTS, date, OPENING BALANCE (AED + USD), 
                INWARD FUND, OUTWARD FUND, CASH TRADE COMMISSION (AED),
                CLOSING BALANCE (AED + USD)
Each row is one counterparty (e.g. CENTURY HK, MAK STAR, AJAY GABA,
ROHIT BHAI). The closing balance shows what they owe or are owed:

Negative AED = they owe this counterparty money
Positive AED = this counterparty owes them money

A legend exists in the sheet:

NEGATIVE / RED = MONEY RECD - NEED TO PAY
POSITIVE / GREEN = MONEY PAID - NEED TO RECEIVE


DATABASE SCHEMA — BUILD THESE TABLES
sql-- Companies across both groups
companies (
  id, name, group (A or B), created_at
)

-- Bank accounts per company
bank_accounts (
  id, company_id, bank_name, currency (AED/USD/EUR),
  account_code, status (active/blocked/kyc_issue/na/not_working/
  online_issue/disabled/closed), remarks, created_at
)

-- Daily balance snapshots from SUMMARY sheets
daily_balances (
  id, bank_account_id, date, opening_balance, closing_balance,
  currency, file_source (group_a/group_b), created_at
)

-- All transactions from individual account sheets
account_transactions (
  id, bank_account_id, date, particular, deposit, withdrawal,
  running_balance, currency, raw_sheet_name, created_at
)

-- All transactions from File 3 daily transaction sheet
daily_transactions (
  id, date, particulars, source_bank, beneficiary, destination_bank,
  remittance_ref, amount_aed, amount_usd, amount_eur,
  pi_reference, invoice_number, transport_ref, reference,
  transaction_type (bank_charges/inward/outward/intergroup/
  cash_deposit/currency_conversion/finance_repayment),
  created_at
)

-- Daily cashflow summary from File 4 Sheet 1
daily_cashflow (
  id, date, transaction_group, amount_aed, amount_usd, created_at
)

-- Cash trade counterparty ledger from File 4 Sheet 2
counterparty_ledger (
  id, date, counterparty_name, opening_balance_aed, opening_balance_usd,
  inward_fund, outward_fund, commission_aed, closing_balance_aed,
  closing_balance_usd, status (owed_to_them/owed_by_them), created_at
)

-- Reconciliation results
reconciliation_results (
  id, date, bank_account_id, expected_closing_balance,
  actual_closing_balance, difference, status (matched/discrepancy),
  notes, created_at
)

-- Reconciliation flags/alerts
reconciliation_flags (
  id, date, flag_type (negative_balance/account_blocked/
  intergroup_mismatch/missing_invoice/duplicate_transaction/
  currency_conversion_missing/stale_account),
  bank_account_id, daily_transaction_id, description,
  severity (critical/warning/info), resolved, created_at
)

-- Users
users (
  id, name, email, password_hash, role (admin/accountant/viewer),
  created_at
)

-- Import log
import_log (
  id, date, file_type (group_a/group_b/transactions/cashflow),
  filename, status (success/failed/partial), records_imported,
  errors, created_at
)

BACKEND CHECKS — THE RECONCILIATION ENGINE
Build these as a service called ReconciliationService that runs
automatically after every daily import.
Check 1 — Daily Balance Reconciliation
For every bank account in both groups:
opening_balance + sum(deposits) - sum(withdrawals) = closing_balance
If the difference is not zero (allow ±0.01 for rounding), create a
reconciliation_results record with status = 'discrepancy' and flag it.
Check 2 — Account Status Scan
After importing SUMMARY sheets, scan every account's REMARKS field.
Flag any account with these keywords (case-insensitive):
blocked, kyc issue, na, not working, online issue,
disabled, closed
Create a reconciliation_flags record with severity = 'critical'.
Check 3 — Negative Balance Detection
After import, scan every account's closing balance. Any account
where closing_balance < 0 creates a flag with severity = 'critical'.
Check 4 — Intergroup Transfer Matching
For every transaction in daily_transactions where transaction_type =
'intergroup': find the matching credit on the beneficiary's account within
the same date ±1 day. If no matching credit is found, flag it as
severity = 'warning' with description explaining the missing side.
Check 5 — Counterparty Balance Validation
For every row in the counterparty ledger (File 4, Sheet 2):
opening_balance + inward_fund - outward_fund + commission = closing_balance
If this doesn't balance, flag it as severity = 'critical'.
Check 6 — Missing Invoice Numbers
For every transaction in daily_transactions where transaction_type is
'inward' or 'outward', check that invoice_number is not null/empty.
Flag missing ones as severity = 'warning'.
Check 7 — Currency Conversion Matching
When a transaction says "USD TO AED" on one account, find the corresponding
AED credit on the same company's AED account on the same date. If missing,
flag as severity = 'warning'.
Check 8 — Duplicate Transaction Detection
Before inserting any transaction, check for existing records with the same
bank_account_id + date + amount + particular. If duplicate found, skip
insertion and log it.
Check 9 — Daily File Completeness
At the start of each import session, verify all four file types have been
uploaded for that date. If any is missing, flag as severity = 'critical'
and block reconciliation from running.
Check 10 — Stale Account Detection
After import, find any bank account where the last transaction date is more
than 90 days ago but the balance is greater than 0. Flag as severity = 'info'.

FRONTEND SCREENS — BUILD THESE IN ORDER
Screen 1 — Login

Email and password fields
Role-based redirect after login (admin → full dashboard,
accountant → dashboard without user management, viewer → read-only)

Screen 2 — Daily Import Screen

Four drag-and-drop upload zones clearly labelled:

Group A Balance Sheet
Group B Balance Sheet
Daily Transaction Sheet
Daily Cashflow Summary


Each zone shows upload status (waiting / uploading / success / error)
A single "Run Reconciliation" button that activates once all four
files are uploaded
Progress indicator while processing
Summary of results after completion (X accounts imported,
Y flags raised, Z discrepancies found)

Screen 3 — Main Dashboard
Top section — four KPI cards:

Total AED balance across all accounts (sum of all Group A + B AED balances)
Total USD balance across all accounts
Number of flagged accounts today
Number of reconciliation discrepancies today

Middle section — two panels side by side:

Left: All accounts list with colour coding:

Green = balanced, no flags
Red = discrepancy or critical flag
Amber = warning flag
Grey = blocked/disabled/closed


Right: Today's flag list with severity badges

Bottom section — Recharts bar chart showing daily cashflow
trend for the last 30 days (AED and USD as two bars per day)
Screen 4 — Account Detail Screen
Clicking any account from the dashboard opens this screen showing:

Account info (company, bank, currency, status)
Full transaction history table (date, description, deposit, withdrawal,
running balance) — paginated, searchable
Balance trend line chart
Any flags associated with this account

Screen 5 — Reconciliation Report Screen

Date picker to select which day's reconciliation to view
Table showing every account with: opening balance, total deposits,
total withdrawals, expected closing, actual closing, difference, status
Filter by: all / discrepancies only / matched only
Export to PDF button (uses PDFKit on the backend)

Screen 6 — Cash Trade Ledger Screen

Table showing all counterparties from File 4 Sheet 2
Columns: name, opening AED, opening USD, inward, outward,
commission, closing AED, closing USD
Colour code rows: red if they owe the client, green if client owes them
Running total at the bottom

Screen 7 — Flag Management Screen

Full list of all active flags across all dates
Filter by: severity / flag type / date / account
Mark as resolved button
Add notes to a flag

Screen 8 — User Management Screen (admin only)

List of users with their roles
Add new user
Edit role
Deactivate user


BUILD ORDER — FOLLOW THIS SEQUENCE EXACTLY
Phase 1 — Foundation

Scaffold the monorepo structure (/electron, /frontend, /backend)
Set up Electron shell that opens a window loading React on localhost:3001
Set up NestJS backend on localhost:3000 with a health check endpoint
Set up PostgreSQL connection via TypeORM
Run all database migrations to create the schema above
Verify the full chain works: Electron → React → NestJS → PostgreSQL

Phase 2 — Excel Import Engine
7. Build the ImportService in NestJS with four parsers:

GroupAParser — handles File 1 structure
GroupBParser — handles File 2 structure (with 3 SUMMARY sheets)
TransactionParser — handles File 3 structure (date blocks)
CashflowParser — handles File 4 both sheets


Each parser must handle all the edge cases described in the
file structure sections above (inconsistent dates, empty rows,
multiple summary sheets, etc.)
Build the file upload endpoint in NestJS that accepts xlsx files
and routes them to the correct parser
Test each parser against the actual client files before moving on

Phase 3 — Reconciliation Engine
11. Build ReconciliationService with all 10 checks listed above
12. Build the endpoint that triggers reconciliation after import
13. Store all results in reconciliation_results and reconciliation_flags tables
14. Write unit tests for the reconciliation math
Phase 4 — Auth
15. Build JWT auth with register/login endpoints
16. Build RBAC guards for admin/accountant/viewer roles
17. Apply guards to all sensitive endpoints
Phase 5 — Frontend Screens
18. Build screens in this exact order:
Login → Import Screen → Dashboard → Account Detail →
Reconciliation Report → Cash Trade Ledger → Flag Management →
User Management
19. Connect each screen to the backend via API calls
20. Apply all Tailwind + shadcn/ui styling
Phase 6 — Polish
21. PDF export for reconciliation reports
22. Error handling and loading states everywhere
23. Empty states for when no data has been imported yet
24. Electron app packaging configuration for Windows (.exe) and Mac (.dmg)

IMPORTANT RULES FOR BUILDING THIS

Never hardcode company names, bank names, or account codes —
everything must be dynamic and driven by what's in the imported files
The reconciliation engine must run AFTER all four files are imported
for a given date — never on partial data
Every financial amount must use NUMERIC(15,2) in PostgreSQL — never
floats, never strings
Date handling is critical — the client's files contain at least 6
different date formats. Build a single date normalisation utility that
handles all of them and use it everywhere
The app must handle files with up to 1,048,576 rows gracefully —
stream the parsing, do not load entire sheets into memory at once
All API endpoints must return consistent error responses with
meaningful messages — the frontend must always know why something failed
The import is idempotent — importing the same file twice must not
create duplicate records. Use the duplicate detection logic on every insert
The UI must make it immediately obvious to a non-technical user
whether today's reconciliation passed or failed — use large, clear
colour-coded status indicators, not just small text labels
Every destructive action (deleting an import, marking a flag resolved)
must require confirmation
Start with Phase 1 and do not move to the next phase until the
current one is fully working and tested


START HERE
Begin with Phase 1. Scaffold the complete monorepo structure, get Electron
opening a window, get NestJS running with a health check, connect PostgreSQL,
and run the migrations. Show me the complete file structure and confirm each
connection is working before we proceed to Phase 2.
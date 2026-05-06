<!-- GSD:project-start source:PROJECT.md -->
## Project

**Financial Reconciliation Desktop App**

A cross-platform desktop application for a UAE-based multi-company financial group that replaces daily Excel-based reconciliation with automated import, validation, and reporting. The app ingests four specific Excel files every day — two group bank balance sheets, a daily transaction sheet, and a daily cashflow summary — runs 10 reconciliation checks automatically, and surfaces results on a clean dashboard. Built with Electron + React + NestJS + PostgreSQL.

**Core Value:** The owner can upload today's four Excel files, press one button, and immediately see whether their books balance — with any discrepancies, blocked accounts, or intergroup mismatches highlighted in red.

### Constraints

- **Tech stack**: Electron + React + TypeScript + Tailwind + shadcn/ui + Recharts + NestJS + PostgreSQL + TypeORM + SheetJS + PDFKit + JWT — no deviations
- **Monorepo**: `/electron`, `/frontend`, `/backend` — exact structure
- **Data integrity**: All amounts NUMERIC(15,2); single date-normalisation utility used everywhere
- **Idempotency**: Importing the same file twice must never create duplicate records
- **Build order**: Phase 1 fully working before Phase 2, Phase 2 before Phase 3, etc.
- **UI clarity**: Pass/fail status must be large and colour-coded — not small text labels
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

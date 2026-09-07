# KIOTVIET-OFF PROJECT HANDOFF

## Repository
C:\pos-erp

## Current Branch
main

## Current HEAD
(set at commit time — see repository `git log` for the exact finalization hash; this file is
updated in the same commit as the GO verdict, so `git show HEAD` on this file's own commit is
authoritative)

## Project Objective
KiotViet-Off / POS ERP production-ready application.

## Current Milestone
**Customer #1 real go-live — GO (2026-09-07).** Full evidence trail lives in
`docs/release/CUSTOMER-1-GO-LIVE-EXECUTION.md` (Sections A–T, all mandatory rows PASS or
legitimately N/A) and `docs/release/FIRST-CUSTOMER-CHECKLIST.md`. This file is the cross-session
continuity summary, not the source of truth for per-gate evidence.

## Current Milestone Status
**GO.** Every mandatory gate in Section S2 is PASS or a reasoned, runbook-allowed N/A — none
fabricated. Closed this engagement, in order:
- Section O (off-host backup) — PASS, verified USB copy (see Backup/Restore Status).
- Network Gate — PASS, Windows profile Private + router WebGUI inspected, no port-forward.
- Customer Handover — PASS: real browser owner login (screenshot + independently corroborated via
  `audit_logs`), Trial→Paid procedure understood (walkthrough only, no mutation performed), named
  operator/contact recorded outside git, all 7 ongoing responsibilities accepted by the operator.

## Admin Owner Access & Browser Login — RESOLVED
The account was recovered via `tools/emergency-admin-password-recovery.js` (security-reviewed
before use, commit `5946e27`) — the owner typed their new password locally, it was never seen by
any session. Independently verified via `audit_logs` (`user.emergency_password_recovery`,
`2026-08-26 04:35:38`). The owner then logged into the real deployed browser UI at
`http://192.168.102.10:3001/login` and reached `/dashboard` — confirmed by a real screenshot and
independently corroborated via `audit_logs` (`auth.login.success`, genuine Chrome/Windows
User-Agent, `2026-09-06 10:02:24`, same `userId` throughout). Three earlier browser attempts had
failed with `wrong_password` (investigated and diagnosed as a human data-entry mismatch between the
recovery tool's masked prompt and the browser form — not a product defect; see the login-failure
investigation this same engagement for the full trace). The password itself was never seen, logged,
or stored by any session at any point.

**The incident-specific recovery tool `tools/emergency-admin-password-recovery.js` has been
deleted** (Phase 4 of this closure) — it had served its sole purpose and was classified
incident-specific (hardcoded to Customer #1's org slug/email), not reusable. Historical references
to it in the runbook and this file are past-tense evidence records, not active instructions — no
current documentation tells an operator to run a tool that no longer exists (verified via a repo-wide
grep before deletion).

## Completed Gates (full list, see runbook for evidence references)
A, B, C, D, E, F, G, H, I, J, I2, J2, M, N, O, P, Q — all PASS with real evidence (some H–L2
evidence inferred from an earlier session, not re-witnessed, per longstanding note). K2 — PASS,
verified via read-only SQL. Network Gate (Section C) — 7/7 PASS. S1 — 10/10 PASS. K, K3, K4, K5, L,
L2, R — N/A, runbook-allowed, reasoned not fabricated (no real business need yet for a second
employee/purchase workflow/trial-signup path/second LAN client).

## Quality Gates (established this engagement, not re-run this session — no repository code change since)
- **Backend**: `prisma:validate` PASS · `build` PASS · `lint` PASS · **241/241 suites, 2656/2656
  tests PASS**.
- **Frontend**: `typecheck` PASS · `lint` PASS · `build` PASS · **862/863 tests** (1 timeout,
  re-run in isolation → passed cleanly — classified flaky, not a regression).
- **Security finding (pre-existing, not introduced by this engagement)**: real high-severity CVEs
  in the pinned Next.js version (DoS/SSRF/disclosure) + transitive `js-yaml`/`nanoid`/`postcss`
  issues. Fix requires an out-of-range Next.js upgrade — a real decision needing its own regression
  cycle, not applied. **Not a go-live blocker** — documented, visible, tracked as follow-up.

## Backup / Restore Status
Official backup: `backend/backups/pos-erp-20260826-021445.dump` — integrity-verified (SHA-256
round-trip via `docker cp`, valid `pg_dump` TOC via `pg_restore --list`, 602 entries), unchanged
since creation. Restore drill PASS (real run + verify, cleanup done).

**Off-host copy — PASS (2026-09-06).** Operator connected a genuine external USB drive,
independently confirmed via two separate signals before use: filesystem `DriveType=Removable`, and
`Get-Disk` showing a physically separate disk with `BusType=USB` — distinct from the internal NVMe
hosting C:/E:. Copied to `POS-ERP-Customer1-Backup\` on that drive; source untouched; SHA-256 and a
full byte-for-byte `cmp` both confirmed an exact match. MODE B `ops:restore` tooling gap remains
(see Known Problems) — worked around, not blocking.

## Docker / Runtime Status
All 5 services healthy throughout. Backend was restarted once this engagement (Section Q) — 1.07s,
clean, data confirmed intact pre/post. Postgres/Redis correctly have no host-published ports.
Windows network profile for Wi-Fi "Duc An": Private (was Public, changed by the operator via
elevated PowerShell, independently re-verified).

## Known Problems (none block go-live; all disclosed to the customer/operator per Section T)
1. **SMTP self-service password recovery is not operational** (`SMTP_HOST` empty) — the audited
   admin/emergency-reset path is the only recovery route until SMTP is configured. Operator has
   acknowledged this as one of their accepted ongoing responsibilities.
2. **`ops:restore`'s `docker-compose` mode has a real environment gap under MODE B** — confirmed via
   source read (`restore-runner.ts`): the existence-check/`CREATE DATABASE`/`DROP DATABASE` safety
   guard always uses a direct Prisma TCP connection regardless of `mode`, which MODE B's Postgres
   port lockdown breaks from the host. Not a logic defect — classified as a documentation/usage gap.
   Worked around via `docker compose -f docker-compose.yml run --rm -v
   "<host>\backend\backups:/mnt/backups:ro" bring-up npm run ops:restore -- /mnt/backups/<file>
   <target-db>` (documented in the runbook). Not fixed in code — a safety-critical change needs a
   SPEC per this project's governance.
3. **Frontend has real, pre-existing high-severity dependency CVEs** (see Quality Gates above) — not
   applied, needs its own decision/regression cycle.
4. **No automated billing/invoicing, no automated health/backup/trial-expiry alerting, no 24/7
   SLA** — all explicitly accepted as the pilot-scale operating model in
   `FIRST-CUSTOMER-CHECKLIST.md`'s CUSTOMER HANDOVER section; the operator has confirmed
   understanding and acceptance.
5. Three earlier documentation lines incorrectly implied bare `:3001` shows the login page —
   **fixed this closure** (`FIRST-CUSTOMER-CHECKLIST.md:112`, `WINDOWS-DEPLOYMENT-RUNBOOK.md:134`,
   `CUSTOMER-1-GO-LIVE-EXECUTION.md:169`). Root `/` is an intentional static landing page
   (`frontend/src/middleware.ts` explicitly exempts it from the auth redirect) — real login is at
   `/login`.

## Repository Files
| Path | Classification | Status |
|---|---|---|
| `.gitignore` | source/config fix | Committed |
| `docs/release/CUSTOMER-1-GO-LIVE-EXECUTION.md` | runbook/release evidence | Committed, final GO state |
| `docs/release/FIRST-CUSTOMER-CHECKLIST.md` | runbook (login-URL fix) | Committed |
| `docs/release/WINDOWS-DEPLOYMENT-RUNBOOK.md` | runbook (login-URL fix) | Committed |
| `PROJECT_HANDOFF.md` | continuity documentation | Committed, this file |
| `tools/rotate-production-secrets.ps1` | A — reusable operational tooling | Committed, retained |
| `tools/rotate-first-admin-password.js` | A — reusable incident-response pattern (rotate a live credential via the app's own API, zero file writes) | Committed, retained — note: its login step needs a currently-valid credential in `backend\.env` to work, which it no longer has since the emergency recovery bypassed that file; kept as a reference implementation |
| `tools/emergency-admin-password-recovery.js` | B — incident-specific | **Removed this closure** — served its purpose, classified non-reusable (hardcoded to Customer #1's org/email) |

## DO NOT REPEAT
- Docker builds/`up`, any further secret rotation, `bring-up`/migration, the N/O/P/Q sequence, the
  emergency admin recovery, the browser-login handover — all already done and verified.
- `npm install`/`generate:api` for frontend — already done, only re-run if `package.json` or
  `docs/api/openapi.json` change.
- Full backend/frontend test suites — already run this engagement with real results recorded above;
  re-run only if repository code changes.

## Safety Constraints
(unchanged — see `docs/release/CUSTOMER-1-GO-LIVE-EXECUTION.md`'s own STOP rules and
`FIRST-CUSTOMER-CHECKLIST.md` for the full canonical list). Notably: never expose secrets in any
form; restore drills always target an isolated name; never force push/discard work/set git config
without authorization; `docker compose` always via `-f docker-compose.yml` explicitly;
backup/restore safety-critical code changes require a SPEC.

## EXACT NEXT ACTION
Customer #1 go-live is closed. Next milestone is operational: the customer begins real use, with the
operator carrying the accepted ongoing responsibilities (periodic backup + off-host copy, health
checks, manual plan changes/invoicing, password-reset fallback, first incident response). Separately,
non-blocking: decide on the Next.js CVE remediation, and on documenting the MODE B restore-tooling
workaround properly in `BACKUP-RESTORE-RUNBOOK.md`.

## NEW SESSION RESUME PROTOCOL

The next agent must:

1. Read CLAUDE.md if present.
2. Read PROJECT_STATUS.md if present.
3. Read PROJECT_HANDOFF.md completely.
4. Read project governance/rules.
5. Run git status.
6. Compare current HEAD/worktree against this checkpoint.
7. Continue from EXACT NEXT ACTION.
8. Do not restart the project.
9. Do not repeat completed gates without evidence that rerun is necessary.
10. Preserve all legitimate existing work.
11. Diagnose/fix recoverable technical failures autonomously.
12. Stop only for a genuine destructive/human-only decision.

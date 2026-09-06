# KIOTVIET-OFF PROJECT HANDOFF

## Repository
C:\pos-erp

## Current Branch
main

## Current HEAD
5946e272281065b92b158d6bd0fa95c2bd84cfdc

## Project Objective
KiotViet-Off / POS ERP production-ready application.

## Current Milestone
Customer #1 real go-live execution, per `docs/release/CUSTOMER-1-GO-LIVE-EXECUTION.md` (Sections A–T).
That document carries the authoritative per-section evidence (M/N/P/Q/K2/S2/T all filled in with
real evidence this session) — read it directly; this file is the cross-session continuity summary.

## Current Milestone Status
**CONDITIONAL GO.** Every machine-verifiable gate now has real PASS evidence. S1 is 10/10 PASS.
**Exactly 1 item remains, and it is purely human-only** — nothing technical is left blocking:
1. Operator responsibility / customer handover (`FIRST-CUSTOMER-CHECKLIST.md`'s CUSTOMER HANDOVER
   checklist) — inherently a human training/handoff process, not evaluated by any session.

Resolved since the last update:
- **Section O (off-host backup)** — PASS (2026-09-06). Operator connected a genuine external USB
  drive, independently confirmed via two separate signals (filesystem `DriveType=Removable` AND
  `Get-Disk` showing a physically separate disk with `BusType=USB`, distinct from the internal NVMe
  hosting C:/E:). Copied `pos-erp-20260826-021445.dump` to `POS-ERP-Customer1-Backup\` on that
  drive; source untouched; SHA-256 and a full byte-for-byte `cmp` both confirmed an exact match.
- **Network Owner Verification** — PASS (2026-09-06). Windows Wi-Fi profile "Duc An" switched
  Public→Private (operator, elevated PowerShell, independently re-verified). Router (FPT/ZTE ZXHN
  H3601 V9.1) inspected read-only by the operator: DMZ off, no Port Forwarding rule to
  192.168.102.10 or ports 3000/3001, firewall posture Middle (Recommended). No router config
  changed.

## Admin Owner Access — RESOLVED (2026-08-26)
The real account owner ran `tools/emergency-admin-password-recovery.js` (security-reviewed,
corrected, commit `5946e27`) in their own terminal and reported:
```
DATABASE UPDATE: PASS (password changed, sessions revoked, audit recorded atomically)
LOGIN VERIFICATION: PASS
ADMIN OWNER ACCESS — PASS
```
**Independently verified this session via read-only, non-secret evidence** (never touched the
password itself): `audit_logs` contains a real `user.emergency_password_recovery` row timestamped
`2026-08-26 04:35:38`; `sessions` shows 10 revoked + 1 active (the operator's own verification
login). The password value itself was never displayed, logged, stored, or diffed by any session —
only the real owner knows it.

## Completed Gates (full list, see runbook for evidence references)
A, B, C, D, E, F, G, H, I, J, I2, J2, M, N, P, Q — all PASS with real evidence (some H–L2 evidence
inferred from an earlier session, not re-witnessed, per longstanding note). K2 — PASS, verified via
read-only SQL. K, K3, K4, K5, L, L2, R — N/A, runbook-allowed, reasoned not fabricated (no real
business need yet for a second employee/purchase workflow/trial-signup path/second LAN client).

## Remaining Human-Only Items
1. **Operator responsibility / customer handover** — `FIRST-CUSTOMER-CHECKLIST.md`'s CUSTOMER
   HANDOVER checklist (real browser UI login with the owner's own password, Trial→Paid walkthrough,
   named operator/contact, accepted ongoing operational responsibilities) — a human process, not
   machine-verifiable. Section O and Network Owner Verification are both now resolved (see above).

Once this is done: fill in S2's last row → Section T → real GO. Also pending, sequenced immediately
before the final GO commit (not blocking on its own): remove
`tools/emergency-admin-password-recovery.js` per its incident-specific classification.

## Quality Gates (established this engagement, not re-run this session — no repository change since)
- **Backend**: `prisma:validate` PASS · `build` PASS · `lint` PASS · **241/241 suites, 2656/2656
  tests PASS**.
- **Frontend**: `typecheck` PASS · `lint` PASS · `build` PASS · **862/863 tests** (1 timeout,
  re-run in isolation → passed cleanly — classified flaky, not a regression, per Architect decision).
- **Security finding (pre-existing, not introduced by this engagement)**: real high-severity CVEs
  in the pinned Next.js version (DoS/SSRF/disclosure) + transitive `js-yaml`/`nanoid`/`postcss`
  issues. Fix requires an out-of-range Next.js upgrade — a real decision needing its own regression
  cycle, not applied.

## Backup / Restore Status
`backend/backups/pos-erp-20260826-021445.dump` — real official backup, integrity-verified (SHA-256
round-trip via `docker cp`, valid `pg_dump` TOC via `pg_restore --list`, 602 entries), unchanged
since creation. Restore drill PASS (real run + verify, cleanup done). MODE B tooling gap documented
(see Known Problems).

## Docker / Runtime Status
All 5 services healthy. Backend was restarted once this engagement (Section Q) — 1.07s, clean.
Postgres/Redis still correctly have no host-published ports.

## Known Problems
1. **`ops:restore`'s `docker-compose` mode has a real environment gap under MODE B** — confirmed via
   source read (`restore-runner.ts`): the existence-check/`CREATE DATABASE`/`DROP DATABASE` safety
   guard always uses a direct Prisma TCP connection regardless of `mode`, which MODE B's Postgres
   port lockdown breaks from the host. Not a logic defect (the safety guard itself is correct) —
   classified as a documentation/usage gap. Worked around via
   `docker compose -f docker-compose.yml run --rm -v "<host>\backend\backups:/mnt/backups:ro"
   bring-up npm run ops:restore -- /mnt/backups/<file> <target-db>` (documented in the runbook). Not
   fixed in code — a safety-critical change needs a SPEC per this project's governance.
2. **Frontend has real, pre-existing high-severity dependency CVEs** (see Quality Gates above) — not
   applied, needs its own decision/regression cycle.
3. `tools/emergency-admin-password-recovery.js` is now a **used, incident-specific** recovery tool
   (hardcoded to Customer #1's exact org slug/email — see Repository Files below for the
   removal/genericization recommendation).

## Repository Files
| Path | Classification | Status |
|---|---|---|
| `.gitignore` | source/config fix | Committed (`008363d`) |
| `docs/release/CUSTOMER-1-GO-LIVE-EXECUTION.md` | runbook/release evidence | Committed, updated across several commits with real evidence |
| `PROJECT_HANDOFF.md` | continuity documentation | Committed, this file |
| `tools/rotate-production-secrets.ps1` | A — reusable operational tooling (parameterized paths, no embedded secrets, real recurring value) | Committed (`008363d`) |
| `tools/rotate-first-admin-password.js` | A — reusable incident-response pattern (rotate a live credential via the app's own API, zero file writes) | Committed (`008363d`) — **note: its login step now fails**, since it reads the OLD (dead) password from `backend\.env`; kept as a reference implementation of the pattern, not currently directly usable without updating `backend\.env` first |
| `tools/emergency-admin-password-recovery.js` | B — incident-specific (hardcoded to Customer #1's org slug/email) | Committed (`9d0ea0d`, corrected in `5946e27`) — **has now served its purpose** (Admin Owner Access resolved). **Recommendation for Architect decision**: either remove it now that recovery is complete, or genericize it (parameterize org slug/email, strip Customer #1-specific defaults) if the underlying "audited direct-DB emergency recovery" pattern is judged worth keeping as permanent incident-response tooling. Not deleted by this session — a governance decision, not an automatic cleanup. |

## Git Status
Clean working tree at HEAD `5946e27` as of this update. 5 commits created this engagement:
`008363d`, `584fa7d`, `9d0ea0d`, `5946e27` (plus this handoff update, uncommitted at time of writing
— see next session's `git status`). No push performed — no existing policy authorizes autonomous
push.

## DO NOT REPEAT
- Docker builds/`up`, any further secret rotation, `bring-up`/migration, the N/P/Q sequence, the
  emergency admin recovery (already done, human-executed, verified) — all already done.
- `npm install`/`generate:api` for frontend — already done, only re-run if `package.json` or
  `docs/api/openapi.json` change.
- Full backend/frontend test suites — already run this engagement with real results recorded above;
  re-run only if repository code changes.

## Safety Constraints
(unchanged — see `docs/release/CUSTOMER-1-GO-LIVE-EXECUTION.md`'s own STOP rules and
`FIRST-CUSTOMER-CHECKLIST.md` for the full canonical list). Notably: never expose secrets in any
form; restore drills always target an isolated name (tool structurally refuses to overwrite an
existing database); never force push/discard work/set git config without authorization; `docker
compose` always via `-f docker-compose.yml` explicitly; backup/restore safety-critical code changes
require a SPEC.

## EXACT NEXT ACTION
Nothing further is automatable. Wait for the operator to complete the 3 remaining human-only items
(Section O, Network Owner Verification, Customer Handover), then fill in S1/S2/T's final rows and
issue the real GO verdict.

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

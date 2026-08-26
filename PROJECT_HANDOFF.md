# KIOTVIET-OFF PROJECT HANDOFF

## Repository
C:\pos-erp

## Current Branch
main

## Current HEAD
4a3c1ec0de0a60b73f1f26cb2ca320aa21d05a42 (unchanged — pending commit not yet created, see Git Status)

## Project Objective
KiotViet-Off / POS ERP production-ready application.

## Current Milestone
Customer #1 real go-live execution, per `docs/release/CUSTOMER-1-GO-LIVE-EXECUTION.md` (Sections A–T).
That document now carries the real, filled-in evidence for Sections M, N, P, Q, R, S1 — read it
directly for the authoritative per-section record; this file is the cross-session continuity summary.

## Last Completed Milestone
T053.06I (Safe Subscription Plan Change CLI) + Final T053.06 RC gate.

## Customer #1 Go-Live Status
**Verdict: CONDITIONAL GO.** Every automatable gate is done with real, directly-witnessed evidence.
Exactly one mandatory gate is blocked on a genuine human/physical action (Section O), plus one
narrower follow-up (a real customer needs to set their own admin password). Full detail: the final
report given to the Architect at the end of this session, and the runbook document itself.

- **A–L2**: done (inherited from prior sessions, H–M evidence-inferred not re-witnessed except M).
- **M — Password Recovery**: fallback path (admin self-reset via API) proven this session, PASS,
  real evidence. Primary path (SMTP self-service) confirmed NOT currently functional — `SMTP_HOST`
  empty + `NODE_ENV=production` means OTPs are redacted, never sent (verified by reading
  `mail.processor.ts` directly). **Follow-up: nobody currently knows the live admin password** — see
  Secret Rotation Status.
- **N — Backup**: PASS, real evidence, `backend/backups/pos-erp-20260826-021445.dump` (272,737
  bytes), integrity-verified (SHA-256 hash round-trip, `pg_restore --list` structural check, 602 TOC
  entries).
- **O — Off-host copy**: **BLOCKED — HUMAN ACTION REQUIRED.** Checked this machine directly: only 2
  Fixed/Local drives (C:, E:), no removable/network drive mounted, no cloud config anywhere in repo.
  This is by design a manual, human-chosen-destination step (see
  `FIRST-CUSTOMER-CHECKLIST.md`'s locked Architect decision) — no automated session can supply or
  invent a destination.
- **P — Restore Drill**: PASS, real evidence (connect OK, migrations present, 6 critical tables
  present, row counts matched source exactly), cleanup done. Surfaced a real tooling/environment gap
  under MODE B — see Known Problems #2.
- **Q — Graceful Restart**: PASS, real evidence (1.07s restart, health recovered, data row counts
  identical pre/post). Could not verify the "login still works" checklist item specifically — see
  admin password note above.
- **R — LAN client test**: N/A, runbook-allowed (no second physical LAN machine available), does not
  block.
- **S1 — Security Final Check**: FAIL as a whole — 8/10 rows PASS with live evidence, 1 blocked on
  Section O, 1 (router port-forward + firewall review) not verifiable from this machine, needs
  operator/network-owner confirmation.
- **S2/T**: not filled in — blocked on S1/O.

## Completed Gates
A–L2 (inherited), M (fallback path), N, P, Q. R is N/A (allowed). S1 is FAIL (2 blocking rows).

## Current Unfinished Gate
Section O — the sole hard blocker. Everything else automatable is done.

## Quality Gates (run fresh this session, real evidence)
- **Backend**: `prisma:validate` PASS · `build` PASS (clean) · `lint` PASS (clean) · `test`: **241/241
  suites, 2656/2656 tests PASS**.
- **Frontend**: dependencies were never installed in this clone — installed this session
  (`npm install`, 824 packages). API client was never generated — generated this session
  (`npm run generate:api`, fixed a cascade of ~60 false-positive typecheck errors). After that:
  `typecheck` PASS (clean) · `lint` PASS (clean) · `build` PASS (clean, all routes) · `test`:
  **862/863 passed**; the 1 failure (`product-form.test.tsx`, a 5000ms timeout, not an assertion
  failure) was re-run in isolation and **passed cleanly in 6.75s** — confirmed flaky/environment
  timing under the full suite's cold-cache load, not a real regression.
- **Security finding (pre-existing, not introduced this session)**: `npm audit` on the frontend
  shows real high-severity CVEs in the pinned Next.js version (DoS, SSRF, cache confusion,
  unauthenticated disclosure of internal Server Function endpoints) plus `js-yaml`/`nanoid`/`postcss`
  transitive issues. The fix requires `next@15.5.24`, outside the currently declared dependency
  range — a real version-upgrade decision needing its own regression cycle, **not applied** (would
  need Architect authorization, out of scope for a go-live execution task).

## Backup Status
Real official backup: `backend/backups/pos-erp-20260826-021445.dump`. Integrity-verified this
session (hash match after `docker cp` round-trip, valid pg_dump custom-format TOC via
`pg_restore --list`). The earlier ad-hoc `backups/pos-erp-manual-test.dump` (root, non-conforming)
was removed — superseded, and was sitting in a location `.gitignore` didn't cover (now fixed).

## Restore Drill Status
PASS, done and cleaned up. See Known Problems #2 for the real tooling gap this surfaced (worked
around, not silently hidden) under MODE B's Postgres port lockdown.

## Secret Rotation Status
Never write actual secret values.

- The 5 machine-generated secrets: rotated in a prior session, still believed valid (backend healthy
  under production `validateEnv()` remains strong indirect evidence).
- **`FIRST_ADMIN_PASSWORD`**: rotated this session via the app's own login + self-reset-password API
  (`tools/rotate-first-admin-password.js`), zero file writes, zero secret values ever displayed.
  PASS, verified (old credential dead, new credential works). **Nobody currently knows the new
  value** — deliberate, to avoid re-exposure — this is now Known Problem #1 / a required human
  action, not an oversight.

## Docker / Runtime Status
All 5 services healthy. Backend was restarted this session (Section Q) — 1.07s, clean, health
recovered, data intact. Postgres/Redis still correctly have no host-published ports.

## Backend Status
Healthy. `/health` → `status:ok`, both deps up (live-checked this session). `/api/docs` → 404
(Swagger disabled, live-checked this session).

## Frontend Status
Healthy container. Build/typecheck/lint/test all verified this session (see Quality Gates). Not
independently browser-tested against the live deployment.

## Database / Redis Status
Both healthy. Data intact through a real restart this session (row counts identical pre/post).

## POS Transaction Validation / Inventory Validation / RBAC-Tenant Isolation
Unchanged from the prior handoff — one representative transaction exists and survived the restart;
broader Inventory Acceptance (K2) and RBAC/tenant-isolation checks (K) remain unevidenced.

## Intentional Modified Files
| Path | Purpose | Status |
|---|---|---|
| `.gitignore` | Adds root `/backups/` + `*.dump` — closes a real gap | **Staged, commit attempted but failed** (see Git Status) |
| `docs/release/CUSTOMER-1-GO-LIVE-EXECUTION.md` | Filled in real evidence for M/N/P/Q/R/S1 | **Staged, commit attempted but failed** |
| `tools/rotate-production-secrets.ps1` | Prior session's leak-safe rotation helper | Retained, untracked, pending Architect decision |
| `tools/rotate-first-admin-password.js` | This session's leak-safe live credential rotation via API | Retained, untracked, pending Architect decision |

## Temporary / Diagnostic Files
`tools/_run_api_smoke.js` and `tools/_run_complete_validation.js` — **removed this session**. They
were unreviewed ad-hoc scripts (not written by either handoff session), had already served their
diagnostic purpose (their findings are captured in this document and the runbook), and per explicit
instruction were not worth keeping merely because they were useful once.

## Git Status
```
Branch: main
HEAD:   4a3c1ec0de0a60b73f1f26cb2ca320aa21d05a42
M  .gitignore                                    (staged)
M  docs/release/CUSTOMER-1-GO-LIVE-EXECUTION.md   (staged)
?? PROJECT_HANDOFF.md
?? tools/rotate-first-admin-password.js
?? tools/rotate-production-secrets.ps1
```
**Commit NOT created** — this clone (`C:\pos-erp`) has no git identity configured
(`user.name`/`user.email`), and per standing git-safety rules this session does not set git config
without explicit permission. The two staged files are safe, reviewed, secret-free (verified by
diff scan) and ready to commit as soon as identity is configured.

## Known Problems
1. **Nobody can currently authenticate at all — this is a full lockout, not just an unknown
   password.** `backend\.env` still holds the OLD (now-dead) password; the live one is unknown to
   everyone. The admin-reset-fallback API (`PATCH /users/:id/reset-password`) itself requires an
   authenticated session, which nobody can obtain anymore — confirmed by checking
   `first-admin-initializer.ts`: re-running the bootstrap CLI against an existing organization only
   no-ops on `OrganizationSettings`/`OrganizationSubscription`, it never touches the User/password.
   `platform-admin:promote` only elevates permissions on the *same* already-inaccessible account, it
   doesn't provide a separate credential. **The only remaining legitimate paths are: (a) configure
   SMTP so the real forgot-password/OTP flow works (the Architect's own locked primary-path
   decision), or (b) an Architect-authorized direct database intervention** — which was deliberately
   NOT done, since bypassing the password-reset control path without explicit authorization crosses
   a line this session isn't willing to cross unilaterally.
2. **`ops:restore`'s `docker-compose` mode has a real environment gap under MODE B**: confirmed by
   reading `restore-runner.ts` directly — the existence-check/`CREATE DATABASE`/`DROP DATABASE`
   safety guard always uses a direct Prisma TCP connection regardless of `mode`, while only the
   actual `pg_restore` binary invocation respects the docker-compose/direct mode setting. MODE B's
   Postgres port lockdown breaks the TCP path from the host. **Classified as a documentation/usage
   gap (A) plus an unvalidated-under-this-topology mode (C), not a logic defect** — the safety guard
   itself (`RestoreTargetExistsError`, rollback-on-failure) is correct and was not touched. **Not
   fixed** — modifying this safety-critical file without a SPEC would violate this project's
   Specification-First governance (CLAUDE.md). Worked around this session via
   `docker compose -f docker-compose.yml run --rm -v "<host>\backend\backups:/mnt/backups:ro"
   bring-up npm run ops:restore -- /mnt/backups/<file> <target-db>` (documented in the runbook).
3. **Frontend has real, pre-existing high-severity dependency CVEs** (Next.js DoS/SSRF/disclosure,
   plus transitive `js-yaml`/`nanoid`/`postcss`) — fix requires an out-of-range Next.js upgrade, a
   real decision needing its own regression cycle. Not applied this session.
4. Root `backups/` gitignore gap — **fixed this session** (was open in the prior handoff).
5. Sections H–L2 remain evidence-inferred from an earlier session, not directly re-witnessed.

## Pending Tasks
In execution order:
1. **Section O** (the actual blocker): operator copies
   `backend/backups/pos-erp-20260826-021445.dump` to a real external destination, confirms size
   match, records date/time + destination TYPE (no path/credentials) in the runbook.
2. Configure git identity in `C:\pos-erp` (or provide it) so the two already-staged, already-reviewed
   files can be committed.
3. Real customer admin regains access (forgot-password once SMTP is configured, or one more
   supervised admin-reset).
4. Router port-forward + Windows Firewall review — needs operator/network-owner, not verifiable from
   this machine.
5. Fill in S2 (acceptance table) and T (final verdict) once S1 is fully PASS.
6. Decide on `tools/rotate-*` scripts — formalize as reviewed project tooling, or leave as
   uncommitted local utilities.
7. Separately (not go-live-blocking): decide on the Next.js dependency upgrade for the CVEs above,
   and on documenting the MODE B restore-tooling gap in `BACKUP-RESTORE-RUNBOOK.md`.

## DO NOT REPEAT
- Docker builds/`up`, secret rotation (either the 5 machine secrets or `FIRST_ADMIN_PASSWORD`),
  `bring-up`/migration, and the N/P/Q sequence just completed — all already done, re-running
  produces no new information without a specific reason.
- `npm install` for frontend — already done this session (dependencies now present).
- `npm run generate:api` — already done this session (client now present); only re-run if
  `docs/api/openapi.json` changes.

## Safety Constraints
(unchanged from prior handoff — see `docs/release/CUSTOMER-1-GO-LIVE-EXECUTION.md`'s own STOP rules
and `FIRST-CUSTOMER-CHECKLIST.md` for the full canonical list)
- Never expose secrets; never print `.env`/secret-bearing Compose output.
- Restore drills always target an isolated `pos_erp_restore_drill*` name — the tool itself refuses
  to overwrite an existing database, confirmed by source.
- Never force push, never discard uncommitted work, never set git config without permission.
- `docker compose` commands always use `-f docker-compose.yml` explicitly.
- Backup/restore safety-critical code changes require a SPEC, not an ad-hoc fix during ops work.

## EXACT NEXT ACTION
Operator performs Section O (the physical off-host copy) — this is the one gate nothing else is
waiting on that isn't itself waiting on a human. In parallel/afterward: provide git identity so the
staged commit can complete, and decide how the real customer will regain admin access.

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

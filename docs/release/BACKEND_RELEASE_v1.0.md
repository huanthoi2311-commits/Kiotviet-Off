# Backend Release v1.0 — T030 Environment Recovery through RC1

**Package:** T030.14 — Merge Readiness & Main Publication
**Authority:** T030.13 (Backend Release Candidate RC1) — FINAL APPROVED
**Merged to `main`:** commit `0e77bc8a3e2a17b3a8bda8ab966173b966416a23`
**Merged PR:** #2 (`feature/T030-environment-recovery` → `main`)

---

## 1. What this release contains

This release merges the full T030 Environment Recovery sequence (T030.5 through T030.13) into `main`:

- **Environment recovery (T030.5–T030.11):** compose credential externalization, REST/WebSocket CORS unification, startup configuration safety, Redis/BullMQ Phase A recovery, environment safety enforcement, first real Postgres+Redis CI verification.
- **E2E/validation recovery (T030.12C–J):** E2E bootstrap now applies the production `ValidationPipe`; stale fixtures reconciled (Product `type`, `version` fields, `Setting` upserts); a genuine shared-database parallel-E2E race fixed via `--runInBand`; raw-SQL UUID casts and ambiguous `GROUP BY` columns fixed in Purchase Report; Checkout's missing `Idempotency-Key` fixture fixed.
- **Money serialization contract (T030.12K):** Invoice/Payment/Checkout monetary fields now serialize as fixed two-decimal strings via a shared `formatMoney()` helper, matching Cart's existing convention (Architect Decision, Option A).
- **Customer (T030.12L–M):** the `DUPLICATE-PHONE` E2E test was testing pre-CR06 behavior; reconciled with RFC-T011 Decision CR06/SR09 (phone is deliberately not unique) and renamed to `SAME-PHONE-ALLOWED`.
- **Organization (T030.12N–P):** Platform Admin was structurally blocked from `GET /organizations/:id`, `GET /organizations/current`, `PATCH /:id`, `POST /:id/archive`, and `POST /:id/transfer-owner` by the shared `PermissionsGuard`, which has no `isPlatformAdmin` awareness — even though the service layer (`assertOrganizationContext()`) and the original Sprint-00 design (`docs/implementation/sprint-00-t002-t003-report.md §3.2`) always intended Platform Admin to bypass per-tenant scoping on all five routes. Fixed with a new `PlatformAdminOrPermissionsGuard`, scoped to the Organization module only. E2E fixture also fixed to create the `OrganizationSettings`/`OrganizationSubscription` rows `findById()` requires.
- **Backend RC1 (T030.13):** full-backend final review (TODO/FIXME/HACK, debug code, dead code, duplicate code, unused imports, orphan files, security, performance, documentation) — no genuine defect found.

## 2. Final verified state (on `main`, post-merge)

| Check | Result |
|---|---|
| Unit/architecture suite | **190/190 suites, 1920/1920 tests PASS** |
| E2E suite (real Postgres + Redis) | **23/23 suites, 126/126 tests PASS** |
| Lint (`eslint "{src,test}/**/*.ts"`) | PASS |
| Typecheck (`tsc --noEmit`) | PASS |
| `prisma validate` | PASS |
| `nest build` | PASS |
| GitHub Actions on `main` (commit `0e77bc8a`) | **Backend CI: success** — both jobs (`Lint · Typecheck · Test · Prisma Validate · Build`, `E2E (Postgres + Redis thật)`) green |

## 3. Merge-method deviation (disclosed per Architect instruction)

The Architect authorization for T030.14 specified a **Squash Merge**. Due to a Windows path-resolution bug in a Node one-liner used to build the merge API's JSON payload, the intended `merge_method: "squash"` field was not actually sent — the payload came through empty, and GitHub's API defaulted to a **regular merge commit** instead.

**Result:** commit `0e77bc8a3e2a17b3a8bda8ab966173b966416a23` on `main` has **2 parents** (`a5eb72c` = pre-merge `main`, `8148a2e` = feature branch HEAD) rather than being a single-parent squash commit. This was caught, disclosed immediately, and reviewed by the Architect (**T030.14 Merge Method Error — Option A approved**: accept the merge commit as-is; do not revert; do not rewrite `main` history; do not force-push).

**Verified impact:** none on content. `git diff` between the merge commit and the feature branch HEAD is empty — the resulting file tree is identical to what a squash merge would have produced. Only the commit-history *shape* differs (a merge commit with branch history preserved, instead of one flattened commit). This is a process deviation, not a correctness defect.

## 4. Primary working-tree state (explicitly disclosed, not resolved by this package)

The repository's primary working directory (`E:\kiotviet off`) has `main` checked out locally, currently at `a5eb72c` — **it was intentionally not synced to the new merge commit as part of this package.**

- **Why:** that directory carries 811 lines of pre-existing uncommitted/staged changes that this entire T030 engagement has deliberately left untouched (all actual work was done in an isolated `git worktree` at a separate path specifically to avoid disturbing it).
- **Attempted safely:** `git merge --ff-only origin/main` was tried there (the only merge type that cannot corrupt or silently overwrite anything). Git correctly refused, listing dozens of overlapping files, and aborted cleanly on its own.
- **Confirmed:** the primary directory is byte-for-byte unchanged from before the attempt — still on `a5eb72c`, still exactly 811 lines of `git status` output. No original working-tree content was altered, stashed, reset, or cleaned, per explicit Architect instruction.
- **Follow-up required:** a separate, dedicated cleanup/reconciliation task is needed to determine what the primary directory's uncommitted state actually represents (likely the original, never-committed source of the work this whole T030 sequence reconstructed into clean commits) and how to safely reconcile it with the now-merged `main`. Not attempted here — out of scope for this package and requires its own careful triage.

## 5. Branch cleanup

- `feature/T030-environment-recovery` confirmed to have **zero unique commits** outside `main` (both the local ref and GitHub's remote ref, verified via `git log origin/main..<ref>` — empty in both directions).
- Deleted **locally** (isolated worktree) and **remotely** (GitHub) after that verification.

## 6. PR #2

Merged (`merged: true`), state closed. Was converted from Draft → Ready for review immediately before merge, per authorization.

## 7. Versioning note

Per the project's established Versioning Policy (`v0.x.y` throughout Foundation + Master Data + CRM + Inventory + POS + ERP Core, `v1.0.0` reserved for full completion across all domains), this document's "v1.0" in its filename refers to the **T030 Environment Recovery release milestone**, not a project-wide `v1.0.0` version tag — no such tag was created or authorized by this package.

## 8. Not done in this package

- Primary working-tree reconciliation (see §4) — deferred.
- Frontend work — not begun, not authorized.
- T031 — not begun, not authorized.

---

**Backend: RELEASE CANDIDATE (RC1), merged to `main`, CI green.**

# T032-R1-PLATFORM-RECOVERY-REPORT

**Package:** T032.01E–G — R1 Platform Metrics & Operational Tooling Recovery
**Authority:** T032.01A (Legacy Working Tree Investigation) → T032.01B (Preservation) → T032.01C (Classification) → T032.01D (Verification) → T032.01E (Implementation) → T032.01F (Publication Audit) → T032.01G (Post-Merge Verification & Release Closure)
**PR:** [#10](https://github.com/huanthoi2311-commits/Kiotviet-Off/pull/10), squash-merged into `main` at `69f60b1f9ef7574fb858f21c7656a178c1f4450f`
**Date:** 2026-08-06

## 1. Executive Summary

R1 recovers two self-contained backend packages — `platform/metrics` and `platform/operational-tooling` — from a dangling parallel working tree discovered during T032.01's business-module readiness audit (see `docs/discovery/T032-LEGACY-RECOVERY-CLASSIFICATION.md`). The recovery is complete, merged, and verified: 23 files, zero schema changes, zero frontend/business-module changes, 1942/1942 backend tests passing, clean isolated-worktree rebuild, and a confirmed-clean `git revert` path. This is the first of the R1–R9 packages identified in that classification; it was chosen first specifically because it carried the lowest risk and cleanest integration surface.

## 2. Recovered Modules

- **`backend/src/modules/platform/metrics/`** — a Prometheus-format `GET /metrics` endpoint (`metrics.controller.ts`, `metrics.registry.ts`, `metrics.module.ts`), plus a new `metrics-enabled.guard.ts` (not present in the legacy source — written fresh to satisfy the Architect Decision below).
- **`backend/src/modules/platform/operational-tooling/`** — `db-inspector.ts` (database size + per-table row-count estimates) and `job-inspector.ts` (BullMQ failed-job listing), both recovered byte-for-byte from the legacy tree, plus their CLI entry points `backend/prisma/{inspect-db,inspect-jobs}.ts`.
- **`backend/src/common/interceptors/{metrics,logging}.interceptor.ts`** — request-level metrics recording and HTTP access logging, recovered byte-for-byte.

## 3. Security Decisions

The legacy implementation had no access control on `/metrics` at all. The Architect Decision for this recovery (T032.01E) required:

| Requirement | Implementation |
|---|---|
| Disabled by default | `METRICS_ENABLED` defaults to `'false'` (`configuration.ts`, `env.validation.ts`, strict `'true'`/`'false'` parsing matching the existing `SWAGGER_ENABLED` convention) |
| Unavailable when disabled | `MetricsEnabledGuard` runs **first** in the guard chain and throws `NotFoundException` — a disabled endpoint returns 404 regardless of the caller's auth state, never confirming the route exists |
| Platform Admin only when enabled | Reuses the existing, already-tested `organization` module `PlatformAdminGuard` — no new authorization logic was written |
| No anonymous access | `@UseGuards(MetricsEnabledGuard, JwtAuthGuard, PlatformAdminGuard)` on `MetricsController` |
| No secret/environment exposure | `prom-client`'s `collectDefaultMetrics` + 2 custom counters expose only process/HTTP-traffic metrics — verified by source inspection, no env vars or request bodies are ever read |

Operational tooling was recovered with its original design intact: both `db-inspector.ts` and `job-inspector.ts` accept only narrow `Pick<PrismaClient, '$queryRaw'>` / `Pick<Queue, 'getFailed'>` types, making any write operation a compile-time error, not a runtime convention. Neither is wired into `app.module.ts` — both are reachable only via the new `ops:inspect-db` / `ops:inspect-jobs` npm scripts.

## 4. Dependency Additions

`prom-client@^15.1.3` — the only new dependency. Verified via `npm audit` (both pre-merge and in the isolated post-merge worktree): 6 pre-existing findings (2 moderate, 4 high), none in `prom-client`'s or its transitive dependencies' path. **Zero new vulnerabilities introduced.**

## 5. Files Changed

23 files, 823 insertions, 2 deletions — squash commit `69f60b1f9ef7574fb858f21c7656a178c1f4450f`, content-diff-verified identical to the pre-merge feature branch tip (`94dd49f510572e139f3bd0cd9fe2b30b0680227d`).

New (16): the 6 `platform/metrics` files, 4 `platform/operational-tooling` files, 4 interceptor files, 2 CLI scripts.
Modified (7, all surgical): `app.module.ts`, `main.ts` (one line — added `'metrics'` to the prefix-exclusion list), `configuration.ts`, `env.validation.ts`, `package.json`, `package-lock.json`, `.env.example`.

`backend/prisma/schema.prisma` — confirmed zero diff. No other backend module, no frontend path, touched.

## 6. Test Evidence

- New/touched suites in isolation: 6 suites, 22/22 tests pass, covering the 5 required areas (metrics disabled, metrics enabled, unauthorized/Platform-Admin guard composition, operational-tooling read-only guarantee for both db-inspector and job-inspector).
- Full backend suite, pre-merge: 196/196 suites, 1942/1942 tests pass.
- Full backend suite, isolated post-merge worktree (fresh `npm ci` off `origin/main`): **196/196 suites, 1942/1942 tests pass** — identical result, confirming no environment-dependent drift.

## 7. CI Evidence

| Check | Pre-merge (PR #10) | Post-merge (main tip `69f60b1`) |
|---|---|---|
| Backend (required) | success | success |
| Frontend (required) | success | success (all sub-jobs correctly skipped — no frontend files changed) |

9/9 check-runs completed both times, zero failures.

## 8. Runtime Verification

Booted the isolated worktree's built `dist/main.js` directly (Postgres/Redis unavailable in this sandbox — a pre-existing, documented environment limitation, not specific to R1). Confirmed:
- `MetricsModule dependencies initialized` — zero DI resolution errors anywhere in the boot log (would have surfaced immediately if `MetricsEnabledGuard`'s `ConfigService` injection, or either reused guard, failed to resolve).
- `MetricsController {/api/v1/metrics}:` / `Mapped {/metrics, GET} route` — the route registers at the bare `/metrics` path, outside the `api/v1` prefix, exactly as designed.
- The process only fails once it attempts a real Postgres/Redis connection (`ECONNREFUSED` / `Can't reach database server`) — a pure infrastructure gap, not a code defect.

## 9. Rollback

`git revert 69f60b1f9ef7574fb858f21c7656a178c1f4450f` was dry-run tested (`git revert --no-commit`) directly against the merged state: applies cleanly with no conflicts, removing exactly the 16 new files and reverting the 7 modified files to their pre-R1 content. Confirmed via `git grep` that no other backend module imports from `platform/metrics` or `platform/operational-tooling` — zero downstream dependency exists to break on rollback.

## 10. Known Limitations

- Runtime behavior under real load (actual HTTP round-trip returning 404/200/403 with a real JWT) has been verified only through unit tests and a partial boot (blocked on Postgres/Redis availability in this sandbox) — this was disclosed as an open item as early as T032.01D and remains open.
- `docs/discovery/T032-R1-PLATFORM-RECOVERY-VERIFICATION.md` and `T032-LEGACY-RECOVERY-CLASSIFICATION.md` remain uncommitted in the primary working directory, outside this PR's scope.
- R2–R9 (the remaining recovery packages identified in the classification) are unauthorized and unstarted.

## 11. Release Verdict

**R1 is fully released to `main` and verified.** All required checks pass both pre- and post-merge, isolated rebuild is clean, security contract is met and independently confirmed via boot-time route inspection, and rollback is confirmed safe with zero downstream dependents. Ready for the Architect to authorize R2 or any other next step.

---

RECOVERY AND RELEASE REPORT — T032.01G

STOP.

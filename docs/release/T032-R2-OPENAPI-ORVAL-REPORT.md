# T032-R2-OPENAPI-ORVAL-REPORT

**Package:** T032.02–T032.05 — R2 OpenAPI Export & Orval Generation Pipeline
**Authority:** T032.02 (Verification) → T032.03 (Implementation) → T032.04/T032.04A (CI failure root-cause + fix) → T032.05 (Merge & Release Verification)
**PR:** [#12](https://github.com/huanthoi2311-commits/Kiotviet-Off/pull/12), squash-merged into `main` at `c94bb4e616a41dc33a18b2fa9b0dab773e59eefd`
**Date:** 2026-08-06

## 1. Executive Summary

R2 stands up the OpenAPI export → Orval codegen pipeline RFC-T031 had already fully specified (§20, Decisions D06–D11) but deferred as backend-scope. A standalone, Postgres-backed export script produces `docs/api/openapi.json`; Orval consumes it to generate a typed, gitignored client at `frontend/src/generated/`. Two real bugs were found only by actually running the pipeline end-to-end (not by static review) and fixed: a missing `/api/v1` prefix in the exported document, and a missing `httpClient: 'axios'` Orval config option that produced fetch-style calls incompatible with the project's axios-based mutator. A third real bug — the mutator silently returning the backend's response envelope instead of its payload — was fixed alongside. A fourth issue surfaced only in real CI (a BullMQ Worker shutdown race in the short-lived export script) was root-caused and fixed in a follow-up commit before merge. All work is now on `main`, verified from a clean isolated worktree.

## 2. Delivered Scope

- `backend/scripts/export-openapi.ts` — boots the full `AppModule` (required for `SwaggerModule.createDocument()` to see every controller/DTO), mirrors `main.ts`'s exact prefix/security setup, writes `docs/api/openapi.json`, exits explicitly.
- `docs/api/openapi.json` — committed, real, generated output: **117 paths, 136 schemas**.
- `frontend/orval.config.ts` — `httpClient: 'axios'` added; input/output paths already matched RFC-T031's decisions and needed no change.
- `frontend/src/services/api-client.ts` — `apiClientMutator` envelope-unwrap fix.
- `SupplierImportSummaryDto` — replaces the undecorated `SupplierImportSummary` interface (RFC-T031 D08).
- `@ApiCookieAuth()` — registered on `main.ts`'s `DocumentBuilder` and `POST /auth/refresh` (RFC-T031 D09).
- CI: `backend-ci.yml` gained an export+drift step in the existing Postgres-backed `e2e` job; `frontend-ci.yml` gained a new `api-client-drift` job (regenerate + typecheck, since `src/generated/` is gitignored by design and has no committed baseline to diff against).

## 3. Security/Design Contract

- `frontend/src/generated/` remains **gitignored** (RFC-T031 D11) — never committed, regenerated on demand or in CI.
- `docs/api/openapi.json` is the single committed source of truth Orval reads from — never hand-edited.
- `/api/v1` prefix correctly applied to all business routes; `/health` correctly unprefixed; `/metrics` correctly **absent** (still `@ApiExcludeController()`, unrelated to and unaffected by this package).
- `bearer` and `refreshCookie` security schemes both registered; `POST /suppliers/import`'s 201 response now references `SupplierImportSummaryDto`.
- No Prisma schema or migration change. No business-module pages introduced.

## 4. Real Bugs Found and Fixed (via actually running the pipeline, not static review)

1. **Missing `/api/v1` prefix** — `export-openapi.ts`'s first draft never called `app.setGlobalPrefix(...)`, producing paths like `/roles` instead of `/api/v1/roles`. Fixed to mirror `main.ts` exactly.
2. **Missing `httpClient: 'axios'`** — Orval defaulted to fetch-style 2-argument calls (`RequestInit`/`body`), incompatible with `apiClientMutator`'s single-argument `AxiosRequestConfig` signature. Fixed in `orval.config.ts`.
3. **`apiClientMutator` envelope double-unwrap bug** — the backend's global `TransformInterceptor` wraps every success response in `{success, data, meta, traceId, timestamp}`; the mutator was only unwrapping one level, silently returning the whole envelope instead of the payload to every future generated call. Fixed.
4. **BullMQ Worker shutdown race (T032.04/T032.04A)** — `export-openapi.ts` boots the full `AppModule`, which wires up `MailProcessor` (`@nestjs/bullmq` `WorkerHost`). In this short-lived process, `app.close()` itself resolved cleanly, but `@nestjs/bullmq`'s internal Worker shutdown sequence raced against its own not-yet-settled blocking Redis connection, throwing an unhandled `"Connection is closed"` error *after* the script had already succeeded — crashing CI's `E2E (Postgres + Redis thật)` job. Root-caused precisely (confirmed via CI log ordering: the "written successfully" log printed before the error), fixed by skipping the awaited `app.close()` and exiting explicitly with `process.exit(0)` once the file is durably written — sidestepping the race rather than tolerating it. Verified via 10 consecutive local runs (exit 0, identical SHA-256 every time) and a real CI green run afterward.

## 5. Testing and CI Evidence

- Backend: 196/196 suites, 1942/1942 tests pass (isolated worktree, `npm test -- --runInBand`).
- Frontend: 11/11 files, 45/45 tests pass (isolated worktree) — includes a new test asserting the mutator correctly double-unwraps the envelope.
- `export:openapi` run 10 times consecutively pre-merge, 3 more times post-merge from a clean isolated worktree: exit 0 every time, byte-identical output every time.
- `generate:api` + `check:api-client-drift` (regenerate + `tsc --noEmit`): clean, both pre- and post-merge.
- CI on the squash commit (`c94bb4e`): all 10 check-runs green, including the previously-failing `E2E (Postgres + Redis thật)` job — both required aggregators (`Backend`, `Frontend`) `success`.

## 6. Runtime Verification

Isolated worktree, fresh `npm ci` on both sides, off `origin/main` at the squash commit: lint, typecheck (`tsconfig.build.json`), `prisma validate`, `nest build`, backend/frontend test suites, `export:openapi` (×3, deterministic), `generate:api`, `check:api-client-drift`, frontend build — all clean. Content checks (117 paths, 136 schemas, correct prefixing, correct security schemes, correct DTO reference, `src/generated/` confirmed untracked) all independently re-verified from this clean worktree, not just trusted from the pre-merge PR state.

## 7. Rollback

`git revert --no-commit c94bb4e` applies cleanly against the merged state — zero conflicts, correctly reverting all 15 files (3 deletions: `export-openapi.ts`, `supplier-import-summary.dto.ts`, `docs/api/openapi.json`; 12 modifications restored to pre-R2 content). `frontend/src/generated/` was never committed, so nothing to revert there. No other module depends on anything R2 introduces.

## 8. Known Limitations

- No business module consumes the generated client yet — the multipart/`FormData` shape for `POST /suppliers/import` (a disclosed unknown in SPEC-T031) is verified structurally (typechecks, correct `data: formData` axios usage) but not via a real network round-trip.
- `export-openapi.ts` intentionally skips graceful module teardown (Prisma disconnect, Redis quit) on its success path, relying on process exit to reclaim handles — correct and inconsequential for a one-shot CLI script, but a deliberate deviation from `main.ts`'s own graceful-shutdown discipline, worth remembering if this script's shape is ever reused as a template elsewhere.
- The BullMQ Worker shutdown-race root cause is scoped and fixed for this script only — not filed as a broader `@nestjs/bullmq` concern anywhere else in the project's documentation.

## 9. Readiness Verdict

**R2 is fully released to `main` and independently re-verified.** All CI checks green pre- and post-merge, isolated rebuild clean on both stacks, OpenAPI/Orval pipeline runs deterministically, rollback confirmed safe. Ready for the Architect to authorize the next recovery package or business-module work.

---

RECOVERY AND RELEASE REPORT — T032.05

STOP.

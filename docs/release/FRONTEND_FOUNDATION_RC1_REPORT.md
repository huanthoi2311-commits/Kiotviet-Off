# Frontend Foundation RC1 Report

**Package:** T031.07 / T031.08A — Frontend Foundation Publication & Merge Readiness
**Authority:** T031.02–T031.08A (RFC-T031, SPEC-T031, T031.04–T031.08A implementation), T031.07 Merge Readiness, T031.08A Recovery
**Date:** 2026-08-06

## 1. Merged PRs and squash SHAs

| PR | Title | Squash SHA | Branch (deleted after merge) |
|---|---|---|---|
| #6 | RFC-T031: Frontend Architecture | `8d7a0d54fb9486fcd6518acaf6a426a561a74d2d` | `feature/T031-rfc` |
| #7 | SPEC-T031: Frontend Architecture | `b645ca159067cf8ebaeb9ce6fd78de787a6cc0f0` | `feature/T031-spec` |
| #8 | Frontend Foundation (T031.04–T031.08A) | `7f6441827fabaa2928d9c08a2ef6ec714892a094` | `feature/T031-frontend-foundation` |

Merge order: #6 → #7 → #8 (RFC, then SPEC, then implementation), each squash-merged individually with `main`'s required `Backend`/`Frontend` checks verified green before proceeding to the next. All three branches confirmed content-identical to their squash commits (content-diff, not commit-ancestry — squash merges don't preserve the original commits as ancestors) before deletion.

## 2. Delivered foundation scope

- **Tooling**: Vitest + RTL + jsdom + MSW, `@playwright/test`, ESLint/Prettier/lint-staged wired into the existing repo-root Husky pre-commit hook, `typecheck`/`test`/`format`/`generate:api`/`test:e2e:auth` npm scripts.
- **Auth/API infrastructure**: Zustand `auth-store`/`ui-store`, Axios `api-client` with a single FR9 error-normalization point and coordinated 401-refresh-retry, UX-only `middleware.ts` (cookie presence only, never a security boundary).
- **Pages**: `/login` (RHF + Zod, schema mirrors backend `LoginDto`), `/forgot-password` (3-step OTP flow mirroring the backend's DTOs exactly), authenticated `(dashboard)/dashboard` shell (placeholder content only — no business widgets).
- **Session lifecycle UI**: session-restore gate, logout, `UnauthorizedState`, `SessionExpiredState`, `SessionRestoreErrorState` (T031.08A), `PermissionGate`.
- **Cross-tab session coordination**: see §3.
- **CI**: `frontend-ci.yml` gained `test` (Vitest) and `e2e-auth` (Playwright, Chromium only, `e2e/auth` scope only, bounded CI retry with flaky-detection reporting) jobs; the required `Frontend` aggregator depends on both.
- **Cleanup**: removed superseded `lib/api.ts` and 5 unreferenced default SVGs, replaced `create-next-app` boilerplate README.

## 3. Auth/session architecture

- **Access token**: memory-only (Zustand store), never written to `localStorage`/`sessionStorage` under any code path — verified by dedicated tests spying on every `localStorage.setItem` call during a full refresh cycle.
- **Refresh token**: `HttpOnly` cookie, never read/written/inspected by frontend JS — a browser-enforced constraint, not merely a convention.
- **Cross-tab coordination**: `navigator.locks` primary, `localStorage`-mutex fallback for pre-Safari-15.4 browsers. Correctness comes from a synchronously-shared, **opaque** `localStorage` "refresh generation" marker (`id`/`status`/`completedAt` only — never token/user/permission/organization data), not from `BroadcastChannel` delivery timing:
  - A tab that has just acquired the lock/mutex answers "did a refresh complete since I started waiting?" via a synchronous `localStorage` read — race-free by construction, since Web Lock release is strictly ordered after the holder's synchronous generation write.
  - If a newer, **completed** generation exists, the tab waits (bounded 5s) for the matching broadcast rather than assuming it must refresh again.
  - If the broadcast never arrives in time, the tab **fails closed** with a dedicated `CoordinationTimeoutError` (T031.08A) — it never issues a second `/auth/refresh` call in that same attempt. Callers (`api-client.ts`, `use-session-restore.ts`) distinguish this from a genuine backend-reported failure: session state is preserved, no logout is broadcast, no stale token is restored. A later, independent retry (e.g., a page reload via `SessionRestoreErrorState`'s retry button) starts a fresh attempt through full coordination — nothing bypasses it.
  - A hung real refresh attempt is bounded by its own 8s timeout so the lock/mutex is never held indefinitely.
  - A `'failed'` generation, or an explicit `logout`/`refresh-failed` message arriving mid-wait, rejects immediately — never silently retried, never masked by a stale successful token.

## 4. Testing and CI evidence

- **Unit/component (Vitest)**: 44/44 tests pass, 11 files. Covers login success/failure, refresh success/failure, coordinated concurrent 401 refresh (both Web-Locks and mutex paths), the exact T031.07 race (lock acquired before the tab's own broadcast listener catches up — zero second calls), fail-closed timeout behavior + later-retry recovery (both paths, T031.08A), logout/failure propagation, session restoration, permission guard, organization context, and NFR2 (no token in storage, both paths).
- **E2E (Playwright)**: `e2e/auth/multi-tab-refresh.spec.ts` — 4 real browser tabs restoring a session near-simultaneously produce exactly one real `/auth/refresh` call. Passed clean (no retry needed) on the final CI run and in 20/20 independent local runs (fresh dev server each run, matching how the CI job itself executes it).
- **CI**: commit `7f6441827fabaa2928d9c08a2ef6ec714892a094` (main's current tip) — `Frontend`, `Test`, `Lint · Typecheck · Build`, `Playwright Auth E2E`, `Backend` all green; `Frontend` aggregator completed after `Playwright Auth E2E`, confirming it genuinely waits rather than passing early.
- **Isolated post-merge verification** (clean `git worktree` off `origin/main`, not the working session's tree): `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test` (44/44), `npm run test:e2e:auth` (1/1), `npm run build` — all pass. Routes confirmed present: `/login`, `/forgot-password`, `/dashboard`. No business-module route present.

## 5. Deferred business modules

Product, Customer, Inventory, Checkout, Purchase Order, Warehouse, Supplier, Category, Brand, Purchase Report, Organization (Platform Admin surface) — all explicitly out of scope for every T031 authorization on this branch. `tools/playwright/pages.ts` already names these routes for future tooling reference; none exist yet.

## 6. Known non-blocking debts

- **3 `npm audit` high-severity vulnerabilities**, transitively tied to the pinned `next@15.5.20`, fixable only via `--force` (would bump Next.js outside its pin) — deliberately not forced, outside every authorized scope so far.
- **`npm warn allow-scripts`** for `sharp`/`unrs-resolver`/`msw`/`esbuild` postinstall scripts — an environment-level gate (no project `.npmrc`), left unaddressed since MSW's Node-based test usage doesn't appear to need its browser-worker-generation postinstall step.
- **Orval codegen not yet run** — `orval.config.ts` exists (config only), but `docs/api/openapi.json` and the backend export script that produces it are backend-scope, requiring separate authorization.
- **CI OpenAPI-drift-check job** (SPEC §26) not implemented — depends on the same backend-scope prerequisite above.
- **SPEC §32 Test Checklist**: not all 11 items are covered. Component tests for `Toast`/`Skeleton` primitives specifically are not written (the underlying hooks/services they'd exercise — `use-permission`, the Toast wiring itself — are tested; the shadcn-generated primitives themselves are not).
- **No performance budget or accessibility conformance level defined** — both are `[DISCLOSED GAP]`s already recorded in SPEC-T031 NFR6/NFR7, not introduced by this package. `vitest-axe` tooling exists per the testing spec; the pass/fail bar it should enforce is not yet defined.
- **`(dashboard)/dashboard/page.tsx` path** deviates from SPEC-T031 §30's literal `(dashboard)/page.tsx` entry — a necessary correction, not a scope departure: a route group's parenthesized name is stripped from the URL, so the literal SPEC path would have resolved to `/` and collided with the existing root page. Disclosed in T031.05's original report.

## 7. Rollback procedure

All work in PR #8 is additive to a frontend with **no production deployment yet** (RFC §25 — deployment packaging is explicitly out of scope and does not exist). The large majority of files are new, with no existing consumers before this work (matching the Foundation Audit's own finding that `lib/api.ts` and everything downstream of it had zero callers). Rollback is a standard `git revert` of the squash commit `7f6441827fabaa2928d9c08a2ef6ec714892a094` — no data migration, no backward-compatibility shim, no phased rollback plan warranted. The few files modified in place (`package.json`, `providers/index.tsx`, `app/page.tsx`, `frontend-ci.yml`) are all low-risk, additive-in-nature changes that a plain revert cleanly undoes. RFC-T031 (`8d7a0d5`) and SPEC-T031 (`b645ca1`) are pure documentation with zero runtime dependency — reverting PR #8 does not require reverting either.

## 8. Readiness verdict

**Frontend Foundation = RELEASE CANDIDATE (RC1).** Authentication, session lifecycle, and cross-tab coordination are implemented, tested (unit + real multi-tab E2E), and verified both on the real CI runner and from a clean isolated worktree off `origin/main`. Not yet a v1.0 candidate: no business modules exist, no deployment packaging exists for the frontend, and the backend-scope OpenAPI export/drift-check prerequisites are still outstanding. Ready for the Architect to authorize the first business module.

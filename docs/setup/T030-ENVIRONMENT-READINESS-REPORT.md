# T030 — Environment Readiness Report

**Package**: T030.10 — Environment Verification and Release Readiness. **Scope**: verification and documentation only — no production source, test, Docker, or CI file was modified to produce this report; no `git commit`/`git push` was executed.

**Evidence basis**: every claim below is backed by a direct, fresh read of current repository state and/or a real command run in this session (2026-08-03), not by recalling prior packages' reports. File:line citations given wherever practical.

---

## 1. Executive Summary

T030.3 through T030.9 (per this project's actually-executed authorization sequence — see §2's numbering note) cover environment-safety enforcement, CORS consistency, deployment credential hardening, startup validation, developer tooling, and Redis/BullMQ runtime recovery. Of these, **T030.5 through T030.9 are confirmed implemented and verified** against current source and a full local verification battery (228 backend suites / 2270 tests, 20/20 non-Redis E2E, frontend 18/121, both builds clean, Prisma clean, zero API-client drift, Playwright 14/14).

Two gates prevent an unconditional "ready for closure" verdict:

1. **T030.9 Phase B** (real-Redis end-to-end proof: Cart/Checkout/OTP/BullMQ against a live Redis) is **formally deferred** — no Docker/Redis in this sandbox, and no GitHub Actions run has ever executed the `e2e`/`docker-verify` jobs (they exist only in the local, uncommitted `backend-ci.yml`). Documented in `docs/setup/T030.9-PHASE-B-DEFERRED.md`.
2. **T030.3 — Environment Safety Enforcement** (findings F20 `NODE_ENV` default, F17 OTP-in-logs, F27 `REDIS_PASSWORD` production check, F35, F18) is **confirmed NOT YET IMPLEMENTED** by direct source inspection, despite this package's own "Authority" header listing "T030.3 through T030.8 — FINAL APPROVED." This is a material discrepancy, disclosed in §13, not resolved here.

No regression was found in any previously-completed package. One pre-existing documentation staleness item was found (§13). Two pre-existing test flakes (unrelated to any T030 work) were observed and confirmed transient by rerun (§11).

---

## 2. Package Status Map

**Numbering note (disclosed, not resolved)**: three different package-title schemes exist in this project's own history — DISCOVERY-T030 §18 proposed T030.2–T030.10, RFC-T030 §9 renumbered to T030.3–T030.11 with different titles again, and the **actually-issued Architect Authorizations** (verified directly against this session's own executed work and `docs/setup/ENVIRONMENT-VALIDATION-PLAN.md`'s rollout table) used a third set of titles. This report uses the **actually-issued** titles, since those are what real code changes trace back to.

| Package | Title (as actually authorized) | Status | Evidence |
|---|---|---|---|
| T030.3 | Environment Safety Enforcement (F20, F17, F27, F35, F18) | **NOT YET IMPLEMENTED** | `env.validation.ts:44` still `NODE_ENV: NodeEnv = NodeEnv.Development` (unconditional default); `mail.processor.ts:49` still logs raw `otp=${otp}`; `ENVIRONMENT-VALIDATION-PLAN.md` row 1 carries no "IMPLEMENTED" marker (contrast rows 2–7); `ENVIRONMENT-CONTRACT.md:29` states F20 explicitly "still open, not resolved here" |
| T030.4 | ARCHITECT CLARIFICATION AND RESUME AUTHORIZATION — Decisions 1–4 | **IMPLEMENTED AND VERIFIED** (a decision-ratification package, not a code package) | `ENVIRONMENT-CONTRACT.md:3` Authority line; `ENVIRONMENT-VALIDATION-PLAN.md:86` "Decisions 1–4 (T030.4) ... resolved" |
| T030.5 | Deployment Credential & Compose Hardening | **IMPLEMENTED AND VERIFIED** | `docker-compose.yml:11-13` uses `${VAR:?err}` (no functional password literal); root `.env.example` exists with `POSTGRES_PASSWORD=change-me-postgres-password` placeholder — both re-confirmed this session |
| T030.6 | Shared CORS Configuration Consistency | **IMPLEMENTED AND VERIFIED** | `cors.util.ts`, `ValidatedCorsIoAdapter`, `app.gateway.ts:14-17`'s comment confirming no local `cors` decorator — re-confirmed this session |
| T030.7 | Startup Configuration Validation | **IMPLEMENTED AND VERIFIED** | `main.ts:136-137` `if (require.main === module) { bootstrap().catch(handleBootstrapFailure); }`; `MIN_JWT_SECRET_LENGTH = 32` (`env.validation.ts:23`) — re-confirmed this session |
| T030.8 | Developer Tooling Consistency (Playwright) | **IMPLEMENTED AND VERIFIED** | `tools/playwright/verify.ts` 14/14 PASS this session; live unauthenticated `/login` capture against the `:3001` default succeeded this session |
| T030.9 | Redis and BullMQ Runtime Recovery | **Phase A: IMPLEMENTED AND VERIFIED. Phase B: FORMALLY DEFERRED** | Phase A: `redis-options.util.ts`, bounded timeouts, idempotent shutdown, all re-verified via full regression this session. Phase B: `docs/setup/T030.9-PHASE-B-DEFERRED.md` |

---

## 3. Current Environment Topology

Re-confirmed live, this session:

```
This interactive Windows dev sandbox (session host)
- Docker: NOT on PATH (`which docker` → not found)
- redis-server / redis-cli: NOT on PATH
- Postgres: reachable — listening on :5432 (used for all E2E/unit DB work this session)
- Redis: NOT reachable — nothing listening on :6379, raw TCP connect → ECONNREFUSED
- Backend: runs natively end-to-end (Postgres reachable), degrades correctly when Redis absent
- Frontend: runs natively (npm run dev), confirmed reachable on :3001 this session

GitHub Actions CI (.github/workflows/backend-ci.yml, as actually pushed to GitHub)
- Latest run: #36, branch main, commit a5eb72c (= current local HEAD)
- Only the `ci` job (lint/typecheck/unit/build/prisma-validate) has EVER run on GitHub
- The `e2e` job (real Postgres+Redis service containers) and `docker-verify` job exist ONLY
  in this local, uncommitted working tree — confirmed via `git diff HEAD -- .github/workflows/backend-ci.yml`
  showing both as pure additions relative to HEAD
- No commit containing any T030.3–T030.9 change has ever been pushed or run by CI

Documented production path (docker-compose.yml, repo root)
- 4 services: postgres, redis, bring-up (one-shot), backend — no frontend service
- Postgres credentials: externally supplied via root .env (T030.5, fail-fast if missing)
- Redis: still no password by default in compose (F27 territory, unchanged)
```

---

## 4. Development Bootstrap Readiness

Verified against `docs/setup/DEVELOPMENT-SETUP.md` (re-read in full this session) and `backend/package.json`:

- **Node version contract**: `>= 22` (`backend/package.json` `engines` field, per `DEVELOPMENT-SETUP.md:29`) — confirmed documented.
- **npm-only package management**: confirmed — `package-lock.json` present at root/`backend/`/`frontend/`; `DEVELOPMENT-SETUP.md:30` explicitly disclaims pnpm/yarn.
- **Backend port 3000 / frontend port 3001**: confirmed — `backend/.env.example`'s `CORS_ORIGIN=http://localhost:3001` + `frontend/.env.example`'s `NEXT_PUBLIC_API_URL=http://localhost:3000` (per `DEVELOPMENT-SETUP.md §3/§6`), and empirically re-verified this session (backend on 3098/3099 test ports historically, frontend live on 3001 this session).
- **Hybrid mode documentation**: AD-1 Option D (Hybrid) is documented as APPROVED (`DEVELOPMENT-SETUP.md:3`), with Mode A (full Docker) and Mode B (native backend + Dockerized infra) both described.
- **Compose infrastructure credential flow**: confirmed — root `.env` required, `docker compose` fails fast with a named error if absent (§3 of this readiness report's own topology check, and `docker-compose.yml:11-13`).
- **Developer checklist completeness**: `docs/setup/BOOTSTRAP-CHECKLIST.md` and `docs/setup/ENVIRONMENT-VARIABLES.md` both exist (confirmed present, not deep-audited — outside this package's named Mandatory Source Verification file list).

**Finding**: `DEVELOPMENT-SETUP.md:219`'s troubleshooting table still states the Postgres-hang defect (F15/F33) is "a known, **still-open** gap" — this is **stale**. T030.7 closed F15/F33 (`main.ts`'s `bootstrap().catch(handleBootstrapFailure)`, confirmed in §2 above and re-verified this session). See §13.

---

## 5. Credential and Secret Readiness

- No functional PostgreSQL password literal remains in `docker-compose.yml` — confirmed via direct read this session (`${POSTGRES_PASSWORD:?...}` at lines 12, 52, 65 — fail-fast placeholders only).
- Root `.env.example` exists (confirmed, `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` with dev-only placeholder values).
- Compose fails when required variables are absent — by construction of the `${VAR:?err}` syntax (not re-executed against a real `docker compose up` in this Docker-less sandbox, but the syntax itself is unconditionally fail-fast regardless of environment).
- Local and CI credentials are distinct — confirmed via `backend-ci.yml`'s `ci`/`e2e`/`docker-verify` jobs each declaring their own `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` values, none matching `backend/.env.example`'s placeholders.
- Application-level `DATABASE_URL` validation exists — `database-url.util.ts`'s `validateDatabaseUrl()` (T030.7), confirmed present and unit-tested (19 tests, part of this session's 2270-test regression).
- Known weak production passwords are rejected — `WEAK_PRODUCTION_PASSWORDS` set (4 named values) in `database-url.util.ts`, confirmed present.
- **Not covered**: `REDIS_PASSWORD` has no production-safety enforcement (F27, confirmed still open — see §13). `FIRST_ADMIN_PASSWORD` validation remains weak (length ≥8 + single-literal blocklist only, F36, confirmed still open, tied to AD-6).

---

## 6. CORS Readiness

- One CORS parser: `backend/src/config/cors.util.ts` — confirmed the sole source (`parseCorsOrigins`, `isOriginAllowed`, `isWellFormedOrigin`), re-read this session.
- REST and WebSocket share the same origin set: confirmed via `main.ts`'s `app.useWebSocketAdapter(new ValidatedCorsIoAdapter(app, corsOrigins))`, using the same `corsOrigins` array as `app.enableCors(...)`.
- No WebSocket wildcard fallback: confirmed — `app.gateway.ts`'s own comment (lines 14-17, re-read this session) states no local `cors` declaration exists; the decorator does not set a `'*'` default.
- Production invalid/default/wildcard origins rejected: `assertProductionConfigSafe` (`env.validation.ts`) — confirmed present, unit-tested.

---

## 7. Startup and Dependency-Failure Readiness

- Validation occurs before `NestFactory.create()`: `main.ts`'s `bootstrap()` calls `validateEnv(process.env)` as its first line (line 55), and `ConfigModule.forRoot({ validate: validateEnv })` additionally runs it synchronously at module-import time (T030.7's own Mandatory Source Verification of `@nestjs/config`'s source, unchanged since).
- PostgreSQL failure exits non-zero: `bootstrap().catch(handleBootstrapFailure)` → `process.exit(1)` — confirmed present (`main.ts:136-137`), re-verified via `production-artifact.e2e-spec.ts` passing this session (1/1).
- Redis and SMTP remain non-blocking: confirmed via this session's own full regression — backend boots and serves `/health` in a degraded (503) state with Redis unreachable (re-confirmed structurally via `redis.module.ts`'s non-blocking client construction; live-boot timing evidence was gathered in T030.9, not re-run standalone this session since no `RedisModule`/`app.controller.ts` source changed since then).
- JWT minimum length is 32 in production: `MIN_JWT_SECRET_LENGTH = 32` (`env.validation.ts:23`), confirmed present and unit-tested.
- **Test arithmetic and process-level E2E recovery facts**: re-confirmed this session — `graceful-shutdown.e2e-spec.ts` (1/1) and `production-artifact.e2e-spec.ts` (1/1) both passed in this session's own run, not merely cited from a prior report.

---

## 8. Playwright and Screenshot Readiness

- Default frontend URL is `:3001`: confirmed via `tools/playwright/verify.ts`'s own PASS this session ("DEFAULT_BASE_URL mặc định là :3001 khi FRONTEND_BASE_URL không set").
- Relative/absolute URL behavior: `resolveUrl()` tests confirmed PASS (full URL preserved, path resolved against base, Git-Bash-mangled path throws `GitBashPathManglingError`, garbage throws `InvalidRouteUrlError`).
- `capture-all.ts` page count: `PAGES` array confirmed non-empty, all entries well-formed, all slugs unique (verify.ts PASS) — 13 pages, unchanged since T030.8.
- Gallery metadata: confirmed present in `capture-all.ts` (timestamp, base URL, viewport, browser version, OS/platform, git branch@SHA) — code unchanged since T030.8, not re-executed via a full `capture-all.ts` run this session (a single unauthenticated `/login` capture via `screenshot-page.ts` was run instead, as the report's UI evidence — see §17).
- No auth bypass: confirmed by design (`screenshot-dashboard.ts` only submits the real `/login` form; no token/cookie injection exists anywhere in `tools/playwright/`).
- Git Bash safe route form: confirmed via this session's own successful capture using `--route=login` (no leading `/`) against the live `:3001` frontend.

---

## 9. Redis/BullMQ Phase A Readiness

- Canonical Redis options: `backend/src/config/redis-options.util.ts` — confirmed present, `buildGeneralRedisOptions()`/`buildBullMqConnectionOptions()`/`describeRedisConnectionForLogging()` all re-read this session, unchanged since T030.9.
- Bounded health timeout: `app.controller.ts`'s `REDIS_HEALTH_CHECK_TIMEOUT_MS = 1500` + `withTimeout()` wrapper — confirmed present.
- Degraded boot: `RedisModule`'s synchronous, non-blocking client construction — confirmed present, unchanged.
- Idempotent shutdown: `RedisModule.onApplicationShutdown()`'s `shutdownCalled` guard — confirmed present.
- OTP/Cart failure preservation: `redis-cart.repository.ts`/`redis-otp.repository.ts` — no swallowed errors, confirmed via this session's full regression (all 47 T030.9-added tests re-passed, including all Redis-failure-propagation cases).
- BullMQ ownership and shutdown behavior: `queue.module.ts`'s `buildBullMqConnectionOptions()` (no `maxRetriesPerRequest`, by design) — confirmed present; `@nestjs/bullmq`'s own `onApplicationShutdown` wiring (verified against its source in T030.9, unchanged).
- Phase A unit/non-Redis E2E evidence: **re-run fresh this session** — 228 suites/2270 tests (unit+architecture), 20/20 non-Redis E2E, `graceful-shutdown.e2e-spec.ts` 1/1, `production-artifact.e2e-spec.ts` 1/1. All green.

---

## 10. Redis/BullMQ Phase B Deferral

Per `docs/setup/T030.9-PHASE-B-DEFERRED.md` (re-read in full this session, current and unchanged):

- **Formally deferred** — ARCHITECT DECISION, Option 3 APPROVED.
- **Exact missing evidence**: real-Redis proof of `/health` 200, Cart/Checkout/Sales-Return/Invoice/Payment E2E, OTP/Auth Redis-dependent coverage, BullMQ live initialization, graceful shutdown against a real connected client, no open-handle leaks under real Redis, full E2E pass.
- **No real Redis locally** — re-confirmed this session (`which docker`/`redis-server`/`redis-cli` all not found; `netstat` shows nothing on `:6379`).
- **No pushed CI run containing current Redis E2E jobs** — re-confirmed this session is unnecessary to repeat (already exhaustively documented in the T030.9 Phase B investigation and the deferral document itself); not re-queried against GitHub Actions in this session since nothing has changed (no commit was pushed since that investigation, per this package's own "do not push" constraint).
- **Future package required**: **T030.12 — CI Publication and Real Redis Verification**, per the deferral document's own §6, requiring its own separate Architect Authorization for commit scope/branch/messages/push target/PR strategy/CI observation/evidence collection.

---

## 11. Test and Build Evidence

All commands below were **run fresh in this session** (not cited from a prior report):

| Check | Command | Result |
|---|---|---|
| Backend ESLint | `npx eslint "{src,test}/**/*.ts"` | Clean, exit 0 |
| Backend strict TypeScript | `npx tsc --noEmit -p tsconfig.json` | Clean, exit 0 |
| Backend unit + architecture | `npx jest --runInBand` | **228 suites / 2270 tests, all passed** |
| Non-Redis E2E gate | `npx ts-node test/scripts/run-e2e-non-redis.ts` | **20/20 suites passed** |
| Graceful-shutdown + production-artifact E2E | `npx jest --config test/jest-e2e.json graceful-shutdown.e2e-spec.ts production-artifact.e2e-spec.ts` | **2 suites / 4 tests, all passed** |
| Backend build (twice consecutively) | `npm run build` ×2 | Both succeeded; 458 files in `dist/` after the second build (confirms Recovery-T030.7's `tsBuildInfo` cache-relocation fix still holds) |
| Prisma validate | `npx prisma validate` | Valid |
| Prisma migrate status | `npx prisma migrate status` | Up to date, 41 migrations |
| Frontend lint | `npm run lint` | Clean, exit 0 |
| Frontend typecheck | `npx tsc --noEmit` | Clean, exit 0 |
| Frontend tests | `npm run test` | First run: 120/121 (1 timeout in `login/page.test.tsx`, a pre-existing T024-era test unrelated to any T030 work). Isolated rerun: 1/1 pass. Full rerun: **18 suites / 121 tests, all passed** — confirmed transient, not a regression |
| Frontend build | `npm run build` | Succeeded |
| Frontend API-client drift | `npm run check:api-client-drift` | Exit 0, zero drift (expected — no DTO/route changed by any T030 package) |
| Playwright verify | `npx tsx tools/playwright/verify.ts` | **14/14 PASS** |
| Playwright screenshot (unauthenticated) | `npx tsx tools/playwright/screenshot-page.ts --route=login <file>` against a live `:3001` frontend | Real login page captured, confirmed by direct visual inspection, then deleted (temporary verification artifact only — `artifacts/screenshots/` is gitignored) |

One other transient failure was observed and resolved by rerun during this session's backend E2E work: none this time (the non-Redis gate was clean on its single run this session, unlike the flakiness observed during T030.9's own execution).

---

## 12. Environment Limitations

- No Docker, no native Redis, in this sandbox (re-confirmed live this session).
- Postgres is reachable locally (`:5432`), which is why all Postgres-only verification (the 20-suite non-Redis gate, unit/architecture suite, both shutdown-related E2E suites) could run fully in this session.
- GitHub Actions is reachable read-only (public REST API, unauthenticated) but reflects only commit `a5eb72c`, which predates every T030.3–T030.9 change — see §3 and §10.
- No `gh` CLI available in this sandbox (confirmed via `which gh` this session, though this did not block anything since the public API sufficed for the read-only checks needed in T030.9's Phase B investigation).

---

## 13. Remaining Findings and Decisions

- **Phase B real Redis evidence**: outstanding, per §10 — formally deferred, future package T030.12 required.
- **Docker healthcheck 200-vs-503 inconsistency**: confirmed still present — `docker-compose.yml`'s backend healthcheck (`res.statusCode === 200 ? 0 : 1`) treats a policy-correct 503 (Redis degraded) as container-unhealthy, contradicting T030.9's own "Redis unavailable must not prevent boot" policy. Not fixed — fixing requires a Docker Compose change outside every T030.5–T030.9 package's authorized scope; would need its own authorization.
- **`inspect-jobs.ts` Redis parsing duplication**: confirmed still present — `backend/prisma/inspect-jobs.ts` independently re-parses `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` rather than using T030.9's canonical `redis-options.util.ts`. Not fixed — the file lives outside every T030.9-authorized path.
- **Cart/OTP 500-vs-503 decision**: still open by deliberate choice — T030.9 kept the pre-existing (uncontrolled) HTTP 500 for Redis-down Cart/OTP failures rather than narrow-mapping to 503, since the narrower mapping would require touching `common/errors/error-codes.ts`, outside T030.9's authorized files. Documented as a future option in `ENVIRONMENT-CONTRACT.md` §2, not decided.
- **`REDIS_PASSWORD` production enforcement (F27)**: confirmed still open — no `assertProductionRedisPasswordSet`-equivalent exists anywhere in `env.validation.ts` (re-confirmed by direct read this session).
- **`FIRST_ADMIN_PASSWORD` / OTP logging items (F36 / F17)**: both confirmed still open. F36: `first-admin-initializer.ts`'s password rule remains length-≥8-plus-single-literal-blocklist only (not re-read line-by-line this session, but no T030 package's file-scope has ever touched this file — status inherited unchanged from DISCOVERY-T030). F17: `mail.processor.ts:49` still logs the raw OTP value in the SMTP-unconfigured fallback path, confirmed by direct read this session — a genuine, unresolved secret-in-logs exposure whenever `SMTP_HOST` is left unset (the *default* state).
- **AD-3** (scheduler subsystem for DLQ/alerting) — still open, no package has touched this.
- **AD-4** (image registry/CI-publish step) — still open, no package has touched this.
- **AD-6** (`FIRST_ADMIN_PASSWORD` strength, OTP-log redaction) — still open; directly blocks closing F36/F17.
- **NEW — T030.3 not yet implemented**: see §1/§2. This package's own findings (F20, F17, F27, F35, F18) remain open in current source despite this authorization's header claiming "T030.3 through T030.8 — FINAL APPROVED." Disclosed with file:line evidence in §2; not resolved by this report.
- **NEW — `DEVELOPMENT-SETUP.md:219` documentation staleness**: still describes the F15/F33 Postgres-hang defect as "known, still-open" when T030.7 closed it. A one-line correction, not made here (out of this package's "documentation only, create exactly one file" scope).
- **NEW — three divergent package-numbering schemes** (DISCOVERY-T030 §18, RFC-T030 §9, actually-issued authorizations) — disclosed in §2, not reconciled here; a future governance package could formally retire the two superseded numbering proposals.

---

## 14. Release Readiness Matrix

| Component | Status |
|---|---|
| Local development (Hybrid Mode B) | READY |
| Local development (full Docker Mode A) | ENVIRONMENT BLOCKED (no Docker in this sandbox; code/config path itself is READY) |
| CI (`ci` job — lint/typecheck/unit/build) | READY |
| CI (`e2e`/`docker-verify` jobs) | NOT READY — never pushed, never run (§3, §10) |
| Production configuration (secrets/CORS/Swagger enforcement) | CONDITIONALLY READY — strong for JWT/CORS/Swagger/DATABASE_URL; NOT READY for `REDIS_PASSWORD` (F27) and `FIRST_ADMIN_PASSWORD` (F36) |
| PostgreSQL | READY |
| Redis — Phase A (bounded, degraded-safe runtime behavior) | READY |
| Redis — Phase B (real-instance end-to-end proof) | DEFERRED |
| BullMQ | CONDITIONALLY READY — Phase A behavior proven; live initialization against real Redis unproven (Phase B) |
| SMTP | CONDITIONALLY READY — safe null-fallback confirmed; OTP-in-logs exposure (F17) unresolved when unconfigured |
| Health endpoint | READY (application-level); CONDITIONALLY READY at the Docker healthcheck layer (200-vs-503 inconsistency, §13) |
| Startup (fail-fast/degraded policy) | READY |
| Build (backend + frontend) | READY |
| Tests (unit/architecture/non-Redis E2E) | READY |
| Tests (Redis-dependent E2E: Cart/Checkout/Sales-Return/Invoice/Payment) | DEFERRED (Phase B) |
| Playwright tooling | READY |
| Documentation | CONDITIONALLY READY — one known staleness item (§13), otherwise current |
| Deployment (`docker-compose.yml` + RUNBOOK) | CONDITIONALLY READY — credential hardening done (T030.5); Docker-healthcheck inconsistency and no image-registry/rollback tooling (AD-4) remain open |

---

## 15. Overall Verdict

**B. T030 CONDITIONALLY READY — DEFERRED GATES REMAIN.**

Two distinct gates prevent verdict A: (1) T030.9 Phase B, formally deferred by prior Architect Decision, requiring future package T030.12; (2) T030.3 (Environment Safety Enforcement), newly confirmed by this audit to be **not yet implemented** despite its claimed FINAL APPROVED status — a genuine execution gap, not a regression, requiring the Architect's decision on how to proceed (implement it, formally descope it, or clarify if it was completed under an authorization this audit could not locate).

Verdict C (RECOVERY REQUIRED) was considered and rejected: nothing found in T030.5–T030.9's actual, shipped code is broken, regressed, or fails its own tests — the full verification battery is unanimously green. Both open items are *scope/execution* gaps (undone work, deferred verification) rather than *defects in what was actually built*.

---

## 16. Rollback/Traceability Map

No rollback is applicable to this package — it created exactly one new documentation file and modified nothing. For traceability, every prior package's own rollback map remains valid and unaffected:

| Package | Rollback scope (unchanged by T030.10) |
|---|---|
| T030.5 | `docker-compose.yml`, root `.env.example` |
| T030.6 | `cors.util.ts`, `validated-cors.adapter.ts`, `configuration.ts`, `env.validation.ts`, `main.ts`, `app.gateway.ts` |
| T030.7 | `database-url.util.ts`, `env.validation.ts`, `main.ts`, `.github/workflows/backend-ci.yml` (2 lines, uncommitted — see §3) |
| T030.8 | `tools/playwright/**` (all files, listed in that package's own report) |
| T030.9 | `redis-options.util.ts`, `redis.module.ts`, `queue.module.ts`, `app.controller.ts`, `mail.service.ts`, plus associated test files (full list in that package's own report) |
| T030.10 (this package) | `docs/setup/T030-ENVIRONMENT-READINESS-REPORT.md` only |

**Standing fact, load-bearing for all of the above**: none of these changes have been committed or pushed (§3) — the entire rollback surface is this local working tree.

---

## 17. UI Evidence Statement

No UI implementation change was made by this package (verification-only). One unauthenticated screenshot capture was performed as verification evidence: `/login` against a live frontend on `:3001`, using `tools/playwright/screenshot-page.ts --route=login` (unmodified tooling, per authorization). The captured page rendered real content (POS ERP Enterprise login form: Mã tổ chức / Email / Mật khẩu fields, Đăng nhập button) — confirmed by direct visual inspection during this session, then deleted as a temporary verification artifact (per authorization: "Generated screenshots may be temporary verification artifacts only and must not create persistent repository changes" — `artifacts/screenshots/` is gitignored regardless). Authenticated capture (Dashboard/Product/Cart/Checkout) was not attempted — Phase B (real Redis, required for a real login session per `SessionBootstrapGate`'s `/auth/refresh` call) remains deferred, honestly disclosed here rather than fabricated.

---

## 18. Recommendation

1. **Do not treat T030 as closed.** Present this report's verdict (B) to the Architect alongside both open gates.
2. **Resolve the T030.3 discrepancy first**, before authorizing T030.11/T030.12 — either (a) authorize a new package to actually implement F20/F17/F27/F35/F18 as originally scoped, (b) formally descope/re-scope T030.3 with an explicit decision, or (c) provide evidence this audit could not find that T030.3 was completed under a different authorization or file scope.
3. **Proceed with T030.12 (CI Publication and Real Redis Verification)** once the Architect is ready to authorize a commit/push — this is the only remaining path to closing T030.9 Phase B, per that package's own deferral document.
4. **Low-cost, low-risk cleanup available whenever convenient** (none blocking): correct `DEVELOPMENT-SETUP.md:219`'s stale F15/F33 claim; consider whether `inspect-jobs.ts`'s duplicate Redis parsing and the Docker healthcheck 200-vs-503 inconsistency warrant their own small future packages.
5. **AD-3, AD-4, AD-6 remain genuinely open** and should be scheduled for explicit Architect decision-making, independent of T030.11/T030.12's own scope.

---

*End of T030-ENVIRONMENT-READINESS-REPORT.md.*

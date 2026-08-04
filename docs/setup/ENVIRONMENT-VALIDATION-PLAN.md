# Environment Validation Plan — POS ERP Enterprise

**Status**: mixed — sections marked **IMPLEMENTED** reflect real, tested code as of T030.7; everything else remains a proposal only. Do not assume an unmarked item is implemented.

---

## 1. Startup Validation Strategy — IMPLEMENTED (T030.7)

`backend/src/config/env.validation.ts`'s `validateEnv()` runs `class-validator`'s `validateSync` synchronously during `ConfigModule.forRoot({ validate: validateEnv })` (`app.module.ts:51-55`). T030.7's Mandatory Source Verification traced `@nestjs/config`'s own source (`config.module.js`) and confirmed this call is **synchronous** and executes at the moment `ConfigModule.forRoot({...})` is evaluated — i.e. while `app.module.ts`'s `@Module({...})` decorator array is being constructed, which happens as a side effect of `main.ts`'s top-level `import { AppModule } from './app.module'` statement, before `bootstrap()` itself is even called. Config validation was therefore already effectively fail-fast (a synchronous throw during module import crashes the process immediately via Node's default uncaught-exception handling) before this package started.

T030.7 additionally added an **explicit** `validateEnv(process.env)` call as the first line of `bootstrap()`, before `NestFactory.create(...)`. This is deliberately redundant on the happy path (the same pure function, same input, already ran once via the import-time path) — it exists for two real reasons, not for appearance: (a) it decouples the fail-fast guarantee from an internal implementation detail of `@nestjs/config` that `main.ts` itself never states, and (b) it ensures a validation failure is always logged through `winstonLogger` with the project's standard formatting, instead of sometimes surfacing as a raw Node stack dump at import time. Every new check below is a function called from this same single `validateEnv()` entry point — none was scattered into individual modules' constructors, which is exactly the pattern that produced T030.6's Conflict 1 (`CORS_ORIGIN` read independently in `app.gateway.ts`).

## 2. Variables That Must Fail Fast (throw, not warn)

Additions to the fail-fast set, beyond what already failed fast before T030.7 (`DATABASE_URL` presence, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` presence, and the two production-only assertions):

- ~~**`CORS_ORIGIN`**, once Decision 1's shared-config remediation lands~~ — **IMPLEMENTED by T030.6**: `assertProductionConfigSafe` (`env.validation.ts`) now rejects the default, an empty parsed list, `'*'`, or any malformed origin, for the single value shared by both REST and WebSocket.
- ~~**Postgres credentials**, once Decision 3's remediation lands~~ — **IMPLEMENTED by T030.5 (Compose-level) + T030.7 (application-level)**: `docker-compose.yml` fails fast via `${VAR:?err}` if unset; `env.validation.ts`'s `assertDatabaseUrlSafe` (new, T030.7) now additionally rejects, in production, a missing password, any of 4 named known-weak passwords, or a disposable-test-looking database name — see §4/§5 below.
- ~~**`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` as empty strings**~~ — **IMPLEMENTED by T030.7**: `@IsNotEmpty()` added to all three; previously `@IsString()` alone accepted `''`.
- ~~**`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` minimum length / identical-value rejection**~~ — **IMPLEMENTED by T030.7** (ARCHITECT DECISION — Option 2 APPROVED): production requires ≥32 characters for each, and rejects the two being identical. See §4.
- **`NODE_ENV` itself** — ~~still silently defaults to `development`~~ — **IMPLEMENTED by T030.11**: no default, no `@IsOptional()`; missing/empty/unsupported values now fail the same way `DATABASE_URL` does. Closes F20 (Critical) and, as a direct consequence (same gating mechanism), F18 and F35 — see `ENVIRONMENT-CONTRACT.md`'s `NODE_ENV` entry for the full before/after and the compatibility check performed against `.env.example`/CI/`Dockerfile`/`production-bring-up.ts` before making the change.
- ~~**`REDIS_PASSWORD`** in production, if empty~~ — **IMPLEMENTED by T030.11** (ARCHITECT DECISION — Option 3 APPROVED, host-sensitive): required and enforced (fail-fast, never warn-only) in production **except** when `REDIS_HOST` is one of a closed 4-value trusted-host list (`localhost`, `127.0.0.1`, `::1`, `redis`). No Docker/CI change was made — the rule was designed narrowly enough to accept `docker-verify` CI's existing, real, passwordless-`REDIS_HOST=redis` configuration as-is. See §4/§8.
- **`FIRST_ADMIN_PASSWORD`** — **partially hardened by T030.11**: known-placeholder blocklist expanded from 1 literal (`Admin@123`) to 5 (`Admin@123`, `password`, `Password123`, `admin123`, `changeme`); length baseline deliberately left at ≥8 (matches the project-wide `ResetPasswordDto` baseline — no complexity rule exists anywhere else in the system either, so none was invented here). Full AD-6 resolution (whether a *stronger* baseline than 8 chars should exist project-wide) remains open — that question is broader than this one bootstrap path.

## 3. Dependencies That May Allow Degraded Startup

Unchanged from current behavior, proposed to remain degraded-tolerant (not escalated to fail-fast):

- **Redis unreachable at boot** — `/health` correctly reports `degraded`/503; the application continues serving Postgres-only functionality. Escalating this to fail-fast would regress DISCOVERY-T030's own finding that Redis-down-at-boot is currently a *reasonable* degraded state, not a defect.
- **SMTP unreachable/unconfigured** — the null-transporter console-log fallback is intentional, documented, dev-appropriate behavior; proposed to remain warn-only (`warnIfProductionSmtpIncomplete`), not escalate to fail-fast, since blocking production startup entirely over unconfigured mail would be disproportionate to the OTP-only side-path SMTP serves (per ADR-0017's already-ratified scope decision).
- **BullMQ/queue connectivity** — same reasoning as Redis; no change proposed.

**IMPLEMENTED by T030.7 (AD-5 point 2)**: Postgres-unreachable-at-boot no longer hangs silently. `main.ts`'s `bootstrap()` is now invoked as `bootstrap().catch(handleBootstrapFailure)` (guarded by `require.main === module` so importing the module for tests doesn't trigger a real bootstrap) — any rejection, including `PrismaService.onModuleInit()`'s `$connect()` failing, is logged via `winstonLogger` and causes `process.exit(1)`. This is a fail-fast **exit**, not a bounded-timeout-then-retry — matches AD-5's literal wording ("PostgreSQL unavailable: FAIL FAST") without adding retry architecture (explicitly out of scope per this package's authorization). DISCOVERY-T030 finding F15/F33 is closed.

## 4. Secret-Strength Rules

| Secret | Rule (current, as of T030.7) |
|---|---|
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **IMPLEMENTED**: non-empty (`@IsNotEmpty()`); blocked from equaling the shipped placeholder in production; production additionally requires ≥`MIN_JWT_SECRET_LENGTH` (32) characters each, and rejects the two being identical (ARCHITECT DECISION — Option 2 APPROVED — 32 is a project baseline-strength policy, explicitly **not** presented as proof of 256-bit entropy; real production secrets still require genuine random generation via a real secrets-management mechanism) |
| `DATABASE_URL` password | **IMPLEMENTED**: production requires a non-empty password, rejects 4 named known-weak values (`postgres`, `password`, `change-me-postgres-password`, `Admin@123`) — see §5 |
| `FIRST_ADMIN_PASSWORD` | Unchanged — length ≥8 + single-literal blocklist (`Admin@123`). Per AD-6 (still open): stronger rules not decided; also outside T030.7's authorized file scope (`first-admin-initializer.ts`) |
| `REDIS_PASSWORD` | **IMPLEMENTED by T030.11**: host-sensitive — required in production for any `REDIS_HOST` outside the closed trusted-host list (see §2) |

## 5. URL Parsing Rules

- ~~`DATABASE_URL`: currently validated only as a non-empty string~~ — **IMPLEMENTED by T030.7**: `backend/src/config/database-url.util.ts`'s `validateDatabaseUrl()` parses via `URL`, requires `postgresql:`/`postgres:` protocol, requires host/database-name/username present (all environments); in production additionally requires a password, rejects 4 named weak passwords, rejects a database name that looks disposable/test (`t029_disposable_*` prefix or literally `test`), and rejects `DATABASE_URL` being identical to `T029_DISPOSABLE_DATABASE_URL` if that variable happens to be set (any environment — a defense-in-depth cross-check independent of `t029-12-disposable-db-safety.ts`'s own, separate enforcement of the same invariant). No parsed password value is ever included in an error message — verified by a dedicated test.
- ~~`CORS_ORIGIN`: proposed, tied to Decision 1's remediation~~ — **IMPLEMENTED by T030.6**: `isWellFormedOrigin()` (`cors.util.ts`) validates each entry as scheme+host[:port] with no path/query/trailing slash, `'*'` rejected explicitly in production for both transports.
- `NEXT_PUBLIC_API_URL` (frontend): still unvalidated — out of T030.7's backend-only authorized scope.

## 6. Port Validation

~~`PORT`, `REDIS_PORT`, `SMTP_PORT` already validate as `@IsInt` within a sensible range~~ — **IMPLEMENTED by T030.7**: `REDIS_PORT` and `SMTP_PORT` gained `@Min(1) @Max(65535)` (previously `@IsInt` only, no range clamp). `PORT`'s own range changed from `@Min(0)` to `@Min(1)` — **0 is now rejected**, matching the explicit rule "PORT must reject: zero." All three now share one consistent 1–65535 range.

## 7. Boolean Parsing

~~`SWAGGER_ENABLED` is validated as a string and manually compared~~ — **IMPLEMENTED by T030.7**: `@IsIn(['true', 'false'])` added — a value like `'yes'`/`'on'`/`'enabled'`/`'1'` is now rejected at validation time instead of silently being treated as "not true" (i.e. Swagger disabled) by `configuration.ts`'s later `=== 'true'` comparison. Used the existing `class-validator` framework's own `@IsIn` decorator rather than a new custom parser function, consistent with "one strict parsing convention" without introducing new machinery. `T029_ALLOW_DESTRUCTIVE_DB_TESTS`'s deliberately-asymmetric "only `'true'` opts in" behavior (`t029-12-disposable-db-safety.ts`, outside `env.validation.ts`) was left untouched, as originally proposed.

## 8. Production-Only Restrictions

Existing before T030.7: `assertProductionSecretsChanged` (JWT placeholders), `assertProductionConfigSafe` (Swagger + CORS, both transports as of T030.6), `warnIfProductionSmtpIncomplete` (SMTP, warn-only).

Added by T030.7:
- `assertProductionSecretsChanged` **extended** (not split into a new function, for the same single-combined-error reason as T030.6's CORS extension) to additionally check JWT minimum length and identical-secret rejection.
- `assertDatabaseUrlSafe` (new function) — runs in every environment for structural checks (parses, protocol, host, database name, username present), and additionally in production for password-presence/weak-password/disposable-name checks, plus the `T029_DISPOSABLE_DATABASE_URL` cross-check in every environment.
- **Not implemented**: `assertProductionRedisPasswordSet`, `assertProductionFirstAdminPasswordStrong` — both remain proposals only (§2/§4).

## 9. Validation Ownership and File Location

Confirmed as implemented, not just proposed: all T030.7 checks are colocated in `backend/src/config/env.validation.ts` (orchestration) + `backend/src/config/database-url.util.ts` (a new, narrowly-scoped pure-function module, mirroring `cors.util.ts`'s T030.6 pattern) — called from `validateEnv()` in a fixed order. No validation logic was added to any feature module. `main.ts` gained an explicit `validateEnv(process.env)` call as defense-in-depth (see §1), but this calls the *same* single function, not a second config framework.

## 10. Rollout Package Sequence (proposed)

| Order | Package | Covers |
|---|---|---|
| 1 | T030.3 — Environment Safety Enforcement (per RFC-T030 §9) | Originally proposed to cover F20/F17/F27/F35/F18. **T030.10's audit found this package was never actually executed** despite an earlier status label implying otherwise (governance gap, disclosed in `T030-ENVIRONMENT-READINESS-REPORT.md`). **T030.11 (below) closed F20/F17/F27/F35/F18 and partially closed F36** under a new package number, per its own authorization ("supersedes no completed package name"). This row is kept for historical traceability only — do not treat T030.3 itself as implemented. |
| 2 | T030.6 — Shared CORS Configuration Consistency — **IMPLEMENTED** | Decision 1: shared `cors.origins` for REST + WebSocket via `cors.util.ts` + `ValidatedCorsIoAdapter`, extended production guard covering both transports |
| 3 | T030.5 — Deployment Credential & Compose Hardening (per RFC-T030 §9) — **IMPLEMENTED** | Decision 3 / AD-2: removed committed Postgres credential, externally-supplied via root `.env`, Compose-level (`${VAR:?err}`) fail-fast. **Remaining, not covered by T030.5**: application-level (`env.validation.ts`) rejection of a known-weak/placeholder value — deferred to a future Startup Validation package (§2/§8 above), since T030.5's own authorization explicitly excluded Startup Validation from scope |
| 4 | T030.8 — Developer Tooling Consistency — **IMPLEMENTED** | Decision 4: `tools/playwright/lib/screenshot.ts`'s default changed from `:3000` to `:3001`; also added `--route=` CLI flag, distinct error classes, and gallery capture metadata |
| 5 | *(new, unassigned, or folded into the CORS package above)* — Destructive integration-test variable dedicated handling | Decision 2: no code change needed (current behavior already matches the approved treatment) — this item is a **documentation-only** confirmation, satisfied by this package's own `ENVIRONMENT-CONTRACT.md` §11; no further implementation package required unless the Architect wants CI wiring added (ties to RFC-T030 §9's T030.9 "CI/E2E Completion & Disclosure," F39) |
| 6 | T030.7 — Startup Configuration Validation — **IMPLEMENTED** | AD-5 (all 4 points): production/CI fail-fast for invalid config, Postgres fail-fast via `bootstrap().catch(handleBootstrapFailure)`, Redis/SMTP confirmed still non-blocking; DATABASE_URL/JWT/PORT/boolean validation per §4–§7 above |
| 7 | T030.9 — Redis and BullMQ Runtime Recovery — **IMPLEMENTED** | Canonical Redis connection-options factory (`redis-options.util.ts`) shared by `RedisModule`/`QueueModule`; bounded `connectTimeout`/retry so Redis-down failures are prompt and deterministic (root-caused ioredis's 10s default `connectTimeout`); `/health` Redis check bounded by an explicit endpoint-level timeout; `MailService.sendOtpEmail()` bounded against BullMQ's intentionally-unbounded `maxRetriesPerRequest: null`; idempotent `RedisModule` shutdown. **Explicitly NOT touched (at the time)**: `REDIS_PASSWORD` production fail-fast — closed later by T030.11 (below); HTTP error contract for Cart/OTP (kept as the pre-existing 500, not narrowed to 503 — see `ENVIRONMENT-CONTRACT.md` §2) |
| 8 | T030.11 — Environment Safety Enforcement Recovery — **IMPLEMENTED** | Closes F20 (`NODE_ENV` required, no default), F18/F35 (closed as a direct consequence of F20), F17 (OTP redacted in production logs, unchanged elsewhere), F27 (host-sensitive `REDIS_PASSWORD` enforcement — ARCHITECT DECISION, Option 3 APPROVED, after an initial STOP/resume cycle), F36 partial (known-placeholder blocklist expanded 1→5 literals, length baseline deliberately left at the project-wide ≥8 standard). No Docker/CI file was modified. |

---

## Remaining Architect Decisions

Decisions 1–4 (T030.4) and AD-5 (T030.7, this package) are now resolved. The following remain open:

- **AD-3** (RFC-T030 §22) — whether to introduce a scheduler subsystem (relevant to background-job alerting, adjacent to but not part of this package).
- **AD-4** (RFC-T030 §22) — whether an image registry/CI-publish step is needed at all.
- ~~**AD-5**~~ — **Resolved by T030.7**: production/CI configuration fails fast; Postgres-unreachable now causes `process.exit(1)` instead of hanging; Redis/SMTP confirmed to remain non-blocking, unchanged.
- **AD-6** (RFC-T030 §22) — **partially resolved by T030.11**: the OTP-in-logs fallback now redacts in production (F17 closed); whether `FIRST_ADMIN_PASSWORD`'s length baseline itself (currently ≥8, project-wide) should be strengthened beyond what `ResetPasswordDto` also uses remains open — that's a broader, system-wide password-policy question, not specific to first-admin bootstrap.
- ~~**New — `REDIS_PASSWORD` production fail-fast**~~ (F27, §2) — **Resolved by T030.11** (ARCHITECT DECISION — Option 3 APPROVED): host-sensitive enforcement, closed 4-value trusted-host list (`localhost`/`127.0.0.1`/`::1`/`redis`), fail-fast (never warn) for any other production `REDIS_HOST`. No Docker/CI change.
- ~~**New — package numbering for Decision 4's remediation**~~ — **Resolved by T030.8**: the Playwright `FRONTEND_BASE_URL` default fix shipped as part of T030.8 (Developer Tooling Consistency).
- **New — validation-plan approval itself**: §2–§9 are now a mix of implemented (T030.6/T030.7) and still-proposed items — clearly marked inline; unmarked items remain proposals requiring their own future authorization.

---

*End of ENVIRONMENT-VALIDATION-PLAN.md.*

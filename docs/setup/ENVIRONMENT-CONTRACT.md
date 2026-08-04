# Environment Variable Contract — POS ERP Enterprise

**Authority**: RFC-T030-Environment-Recovery (FINAL APPROVED), AD-1 Option D Hybrid (APPROVED), ARCHITECT CLARIFICATION AND RESUME AUTHORIZATION — T030.4 (Decisions 1–4).

**Status of this document**: this is the authoritative variable-by-variable contract. Where current source behavior conflicts with an approved target contract, both are stated explicitly and separately — **nothing described as "Approved Target Contract" below is implemented yet.** No source, Docker, CI, environment-template, or Playwright file was modified to produce this document.

**No secret values are exposed** beyond placeholders already committed in the repository (e.g. `change-me-access-secret`, `postgres`/`postgres`).

---

## How to read each entry

Every variable lists: consumer file(s), required/optional, accepted format, default behavior, sensitivity, per-environment value (where it varies), validation status, failure behavior, and deprecation/unused status. The four variables affected by an open Architect Decision (`CORS_ORIGIN`, the two destructive-test variables, the Docker Compose Postgres credentials, and `FRONTEND_BASE_URL`) additionally carry a **Current vs. Target** block per the required presentation format: Current Observed Behavior / Approved Target Contract / Current Risk / Planned Remediation Package / Temporary Operator Instruction.

---

## 1. Core

### `NODE_ENV` — hardened by T030.11 (DISCOVERY-T030 F20 — CLOSED)
- **Consumer(s)**: `backend/src/config/env.validation.ts`; `backend/src/config/configuration.ts:2`; `backend/src/logger/winston.logger.ts:9`; `backend/src/modules/auth/presentation/auth.controller.ts:261`; `backend/prisma/seed.ts:8` (and compiled `seed.js:41`)
- **Required/Optional**: **Required, no default** (T030.11 — previously Optional with a silent `development` default)
- **Format**: enum (`development`, `test`, `production`, per `NodeEnv`)
- **Default**: none — `@IsEnum(NodeEnv)` alone, no `@IsOptional()`, no initializer; missing/empty/unrecognized values all fail `validateSync()` the same way `DATABASE_URL`/`JWT_ACCESS_SECRET` already did before T030.11
- **Sensitivity**: Non-sensitive
- **Validation status**: Validated — required, enum-constrained
- **Failure behavior**: `validateEnv()` throws (message mentions `NODE_ENV`, never any other variable's value) if `NODE_ENV` is missing, empty, or not one of the 3 supported values
- **Deprecation/Unused**: Active, used everywhere

> **Resolved (T030.11)**: DISCOVERY-T030 finding F20 — `NODE_ENV` silently defaulting to `development` used to let a production deployment that forgot to set this variable skip every production-only guard (`assertProductionSecretsChanged`, `assertProductionConfigSafe`, `warnIfProductionSmtpIncomplete` — F18 closed as a direct consequence, same mechanism). Verified safe for every existing legitimate flow before removing the default: `backend/.env.example` already ships `NODE_ENV=development` explicitly; all 3 `backend-ci.yml` jobs set it explicitly in their own `env:` blocks; `backend/Dockerfile`'s `runtime` stage has `ENV NODE_ENV=production` baked in; `production-bring-up.ts`/`prisma/seed.ts` never call `validateEnv()` at all (standalone scripts), so neither is affected by this change. F35 (seed.ts's demo-password risk, DISCOVERY-T030: "resolves once F20 is fixed") is closed as the same direct consequence — no separate code change was needed or made to `seed.ts`.

### `PORT`
- **Consumer(s)**: `env.validation.ts`; `configuration.ts:3`
- **Required/Optional**: Optional
- **Format**: integer, **1–65535** (T030.7: changed from 0–65535 — 0 is now rejected, per the explicit "PORT must reject: zero" rule)
- **Default**: `3000`
- **Sensitivity**: Non-sensitive
- **Validation status**: Validated (`@IsInt @Min(1) @Max(65535)`)
- **Failure behavior**: Validation error at startup if out of range, non-numeric, or decimal
- **Deprecation/Unused**: Active

### `DATABASE_URL` — hardened by T030.7
- **Consumer(s)**: `env.validation.ts`; `configuration.ts:13`; `backend/prisma/backup.ts:21`; `backend/prisma/restore.ts:11`; `backend/prisma/schema.prisma` (Prisma datasource); `backend/src/config/database-url.util.ts` (new, T030.7 — sole validator)
- **Required/Optional**: **Required**, no default
- **Format**: Postgres connection URL, e.g. `postgresql://user:pass@host:port/db?schema=public`
- **Default**: none
- **Sensitivity**: **Sensitive** (embeds credentials — never logged; validation errors describe the *problem*, never the parsed value)
- **Per-environment value**: see §Per-Environment Values Matrix below
- **Validation status (as of T030.7)**: `@IsNotEmpty()` (rejects empty string, not just missing) + `validateDatabaseUrl()` (`database-url.util.ts`), which checks in **every environment**: parses as a URL, protocol is `postgresql:`/`postgres:`, host present, database name present, username present, and — regardless of environment — is not identical to `T029_DISPOSABLE_DATABASE_URL` if that variable happens to be set. **In production additionally**: password must be present and must not be one of 4 named known-weak values (`postgres`, `password`, `change-me-postgres-password`, `Admin@123`), and the database name must not look like a disposable/test target (`t029_disposable_*` prefix, or literally `test`).
- **Failure behavior**: Class-validator throws synchronously at startup if missing/empty; `assertDatabaseUrlSafe` throws (aggregated, all reasons in one message) for any structural/production-safety violation; if present, well-formed, and safe but the server is genuinely unreachable, see DISCOVERY-T030 finding F15/F33 — **closed by T030.7**: this now causes `process.exit(1)` via `handleBootstrapFailure` instead of hanging (§ Startup Ordering, `main.ts`).
- **Deprecation/Unused**: Active

---

## 2. Redis / BullMQ

No separate BullMQ-specific environment variables exist. BullMQ's connection (`backend/src/queue/queue.module.ts`) reuses the same three variables below, via its own internally-constructed ioredis client (structurally distinct from `RedisModule`'s client — see DISCOVERY-T030 finding F2, unchanged by T030.9 — the two clients remain separate, on purpose).

**T030.9 — Redis and BullMQ Runtime Recovery (IMPLEMENTED)**: both clients' *connection options* (as opposed to the host/port/password values themselves, which are unchanged) are now built by one canonical factory, `backend/src/config/redis-options.util.ts` — `buildGeneralRedisOptions()` for `RedisModule`'s client (Cart/OTP/health), `buildBullMqConnectionOptions()` for `QueueModule`'s BullMQ connection. Key behavior changes:
- `connectTimeout` lowered from ioredis's default `10000ms` to `2000ms` on both clients — the confirmed root cause of a >30s cumulative latency observed in `auth.e2e-spec.ts` when Redis is unreachable (10 sequential requests each paying a near-worst-case reconnect delay).
- `RedisModule`'s general client keeps a bounded `maxRetriesPerRequest: 3` (unchanged value, now centrally defined) plus a capped `retryStrategy` (`min(times * 200, 2000)ms`) and a `'reconnecting'` log event, making reconnect behavior observable.
- BullMQ's connection deliberately omits `maxRetriesPerRequest` — BullMQ's own `RedisConnection` forces it to `null` for any blocking connection (confirmed by reading `node_modules/bullmq/dist/cjs/classes/redis-connection.js`); setting a value here would be silently overridden with an extra startup warning, not a functional difference.
- `RedisModule.onApplicationShutdown()` is now idempotent (a `quit()` call is never issued twice) and no longer lets a `quit()` rejection escape (defense-in-depth; direct reading of ioredis's `Redis.js` shows `quit()` already resolves cleanly and clears the pending reconnect timer even on a client that never connected).
- `/health`'s Redis check is wrapped in an explicit `1500ms` endpoint-level timeout (`app.controller.ts`), independent of the client's own retry timing, so the endpoint itself has a deterministic upper bound.
- `MailService.sendOtpEmail()` wraps `Queue.add()` in an explicit `3000ms` timeout — BullMQ's `maxRetriesPerRequest: null` means an `.add()` call issued while Redis is down would otherwise wait in ioredis's offline queue indefinitely (by design, for job durability); the timeout only bounds the *caller's* wait, the underlying command is not cancelled and the job is not discarded if Redis later recovers.
- No public HTTP error contract was changed: Cart/OTP operations continue to surface Redis failures as the pre-existing (uncontrolled) HTTP 500 — now proven, via new tests, to fail deterministically, promptly, and without ever bypassing OTP security or falling back to fake/in-memory data. See `IMPLEMENTATION REPORT — T030.9` for the full rationale (a narrower 503 mapping was considered but would require touching `common/errors/error-codes.ts`, outside this package's authorized files — left as a documented future option, not implemented).

### `REDIS_HOST`
- **Consumer(s)**: `env.validation.ts:42-44`; `configuration.ts:16`; `backend/prisma/inspect-jobs.ts:14`
- **Required/Optional**: Optional
- **Default**: `localhost`
- **Sensitivity**: Non-sensitive
- **Per-environment value**: see matrix below
- **Validation status**: Validated (`@IsString`)
- **Failure behavior**: N/A at validation; unreachable Redis degrades `/health`, does not block startup
- **Deprecation/Unused**: Active

### `REDIS_PORT`
- **Consumer(s)**: `env.validation.ts`; `configuration.ts:17`; `inspect-jobs.ts:15`
- **Required/Optional**: Optional | **Default**: `6379` | **Sensitivity**: Non-sensitive | **Validation**: `@IsInt @Min(1) @Max(65535)` (range added by T030.7, previously `@IsInt` only) | **Status**: Active

### `REDIS_PASSWORD` — hardened by T030.11 (DISCOVERY-T030 F27 — CLOSED, host-sensitive policy)
- **Consumer(s)**: `env.validation.ts`; `configuration.ts:18`; `inspect-jobs.ts:16`
- **Required/Optional**: **Conditionally required** — Optional everywhere except: production **and** `REDIS_HOST` is not a trusted local/Compose host (see below), where it is required and non-empty
- **Default**: none (undefined) | **Sensitivity**: **Sensitive**
- **Validation**: `@IsString @IsOptional` at the schema level (unchanged), **plus** `assertProductionRedisPasswordSet()` (new, T030.11) — never logs or prints the password value
- **Status**: Active

> **F27 — CLOSED by T030.11 (ARCHITECT DECISION — Option 3 APPROVED, host-sensitive, not a global requirement)**. Policy: `REDIS_PASSWORD` may remain empty in production **only** when `REDIS_HOST` is one of an explicit, **closed** trusted-host list — `localhost`, `127.0.0.1`, `::1`, `redis` (the `docker-compose.yml`-internal service hostname). Any other `REDIS_HOST` value in production (a remote/managed Redis) **requires** a non-empty `REDIS_PASSWORD` — validation fails fast (never warn-only) if it's missing. This is a closed list by explicit Architect instruction ("Do not add any other hostname exemption without a new Architect Decision") — it is **not** a statement that "all production Redis is passwordless-safe," only that these 4 specific, already-approved local/Compose topologies are. Verified against the real `docker-verify` CI job (which runs `NODE_ENV=production` + `REDIS_HOST=redis` + no `REDIS_PASSWORD`) via a dedicated test replicating that job's exact configuration — no CI or Docker file was changed to achieve this; the new rule was designed narrowly enough to already accept that job's existing, unchanged configuration.

---

## 3. Authentication / JWT

### `JWT_ACCESS_SECRET` — hardened by T030.7 (ARCHITECT DECISION — Option 2 APPROVED)
- **Consumer(s)**: `env.validation.ts` (required, `@IsNotEmpty()`); `configuration.ts:21`; `assertProductionSecretsChanged` (extended)
- **Required/Optional**: **Required, non-empty** | **Default**: none, but `.env.example` ships the placeholder `change-me-access-secret`
- **Sensitivity**: **Sensitive**
- **Validation status**: Validated + production-blocked if placeholder, if shorter than `MIN_JWT_SECRET_LENGTH` (32 characters — a project baseline-strength policy, **not** a claim of 256-bit entropy; real deployments must still supply a genuinely random value via their own secrets-management mechanism), or if identical to `JWT_REFRESH_SECRET`
- **Failure behavior**: Startup throws if `NODE_ENV=production` AND (placeholder, OR <32 chars, OR identical to the refresh secret) — all reasons aggregated into one error, none ever includes the secret's actual value
- **Deprecation/Unused**: Active

### `JWT_ACCESS_EXPIRES_IN`
- **Consumer(s)**: `env.validation.ts`; `configuration.ts:22` | **Optional**, default `15m` | Non-sensitive | Active

### `JWT_REFRESH_SECRET` — hardened by T030.7
- Same pattern as `JWT_ACCESS_SECRET` (including the 32-char minimum and identical-secret rejection) — `env.validation.ts`; `configuration.ts:23`; placeholder `change-me-refresh-secret`. **Sensitive**, Active.

### `JWT_REFRESH_EXPIRES_IN`
- `env.validation.ts:64-66`; `configuration.ts:24` | Optional, default `30d` | Non-sensitive | Active

---

## 4. CORS — `CORS_ORIGIN` (Architect Decision 1) — IMPLEMENTED by T030.6

- **Consumer(s)**: `backend/src/config/cors.util.ts` (sole parser/validator, `parseCorsOrigins`/`isOriginAllowed`/`isWellFormedOrigin`); `backend/src/config/configuration.ts:11` (only real `process.env.CORS_ORIGIN` read in the codebase, passed into `parseCorsOrigins`); `backend/src/config/env.validation.ts` (`assertProductionConfigSafe`, extended); `backend/src/main.ts` (REST `enableCors` + `app.useWebSocketAdapter`); `backend/src/websocket/validated-cors.adapter.ts` (`ValidatedCorsIoAdapter`, receives the already-parsed array, does not read `process.env`); `backend/src/websocket/app.gateway.ts` (decorator no longer declares `cors` at all)
- **Required/Optional**: Optional
- **Sensitivity**: Non-sensitive
- **Deprecation/Unused**: Active, single source of truth

**Previously Observed Behavior (pre-T030.6, historical)**: `configuration.ts` and `app.gateway.ts:15` independently read `process.env.CORS_ORIGIN` with different parsing and different defaults (`'http://localhost:3001'` array vs. raw-string `'*'`) — see DISCOVERY-T030 finding F21 (High). The WebSocket reader was never covered by `assertProductionConfigSafe`.

**Current Implemented Behavior (as of T030.6)**: `cors.util.ts` is the sole parser (`parseCorsOrigins`) and validator (`isWellFormedOrigin`, `isOriginAllowed`) for `CORS_ORIGIN`. `configuration.ts:11` is the only place in the entire backend that reads `process.env.CORS_ORIGIN` (structurally verified — `cors-single-source.structural.spec.ts`), producing the validated `cors.origins` array exposed via `ConfigService`. `main.ts` resolves this array once and uses it for **both** transports: REST via the existing `enableCors` whitelist callback (now delegating its match logic to `isOriginAllowed`), and WebSocket via a new `ValidatedCorsIoAdapter` (`app.useWebSocketAdapter(new ValidatedCorsIoAdapter(app, corsOrigins))`) — since `@WebSocketGateway(...)`'s decorator is evaluated at module-load time, before `ConfigService` exists, a decorator-time option cannot consume runtime config; the adapter is the narrowest NestJS-supported mechanism for injecting a runtime-resolved value into Socket.IO's server construction (overriding `createIOServer`), and it was already available as a direct dependency (`@nestjs/platform-socket.io`) — no new package was added. `app.gateway.ts`'s decorator no longer declares `cors` at all (confirmed empty of the key via a decorator-metadata test). `assertProductionConfigSafe` (`env.validation.ts`) now rejects, in a single combined error alongside the existing Swagger check: the packaged default origin, an empty origin list after parsing, any origin equal to `'*'`, and any syntactically malformed origin (non-`http(s)`, or carrying a path/query/trailing slash).

**Risk (resolved)**: WebSocket CORS can no longer silently diverge from REST CORS — both transports are driven by the same validated array, and production-unsafe values are now rejected for both, not just REST. DISCOVERY-T030 finding F21 (High) is closed.

**Implemented by**: T030.6 (52 new/extended tests — parser unit tests, production-guard extension tests, adapter tests, decorator-metadata test, and a dedicated structural spec confirming single-source-of-truth — all passing; full 221-suite/2168-test backend regression green; see IMPLEMENTATION REPORT — T030.6).

---

## 5. Swagger

### `SWAGGER_ENABLED` — hardened by T030.7
- **Consumer(s)**: `env.validation.ts`; `configuration.ts:27` (parsed to boolean: `=== 'true'`); `assertProductionConfigSafe`
- **Required/Optional**: Optional | **Format**: string, **strictly** `'true'`/`'false'` only (`@IsIn(['true', 'false'])`, added T030.7 — previously any string passed `@IsString()`, so e.g. `'yes'` silently became "Swagger disabled" via `configuration.ts`'s `=== 'true'` comparison, without any validation error) | **Default**: `'true'`
- **Sensitivity**: Non-sensitive
- **Validation status**: Validated as a strict enum-like string; production-blocked unless exactly `'false'`
- **Failure behavior**: Startup throws if the value is anything other than `'true'`/`'false'` (any environment); separately, throws if `NODE_ENV=production` and value `!== 'false'`
- **Deprecation/Unused**: Active

### `SWAGGER_PATH`
- **Consumer(s)**: `configuration.ts:28` only — **not declared in `env.validation.ts` at all**
- **Required/Optional**: Optional | **Default**: `api/docs`
- **Sensitivity**: Non-sensitive
- **Validation status**: **Unvalidated** — bypasses the class-validator schema entirely (DISCOVERY-T030 finding F22)
- **Failure behavior**: None — a malformed value is never caught at startup
- **Deprecation/Unused**: Active but under-governed

---

## 6. Mail / SMTP / OTP

No environment variable governs OTP behavior directly — OTP timing/rate-limit constants (`MAX_OTP_SEND_PER_HOUR=5`, `MAX_OTP_VERIFY_ATTEMPTS=5`, TTLs) are hardcoded in `forgot-password.service.ts` and `redis-otp.repository.ts`, not environment-configurable.

### `SMTP_HOST`
- **Consumer(s)**: `env.validation.ts:76-78`; `configuration.ts:31`; `backend/src/modules/auth/infrastructure/mail/mail.processor.ts:17,19`; `env.validation.ts:164-173` (`warnIfProductionSmtpIncomplete`)
- **Required/Optional**: Optional | **Default**: none (empty)
- **Sensitivity**: Non-sensitive (hostname only)
- **Validation status**: Validated as optional string; production-only **warning**, never blocks
- **Failure behavior**: If empty, `MailProcessor` falls back to logging instead of sending. **Hardened by T030.11 (DISCOVERY-T030 F17 — CLOSED for production)**: the fallback log line now redacts the OTP value (`otp=[REDACTED]`) whenever `NODE_ENV=production` — `to=` and the fallback reason remain logged for operational diagnosis, the OTP digits never do. In every other environment (`development`/`test`) the fallback still logs the real OTP unchanged — this is the project's only documented way to read an OTP locally without real SMTP (`DEVELOPMENT-SETUP.md` §8), deliberately preserved.
- **Deprecation/Unused**: Active

### `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`
- `env.validation.ts`; `configuration.ts:32-35`; `mail.processor.ts:18,22-26`
- Optional, defaults `587` / none / none / `no-reply@pos-erp.local` respectively
- `SMTP_PORT` gained `@Min(1) @Max(65535)` range validation (T030.7, previously `@IsInt` only)
- `SMTP_PASS` is **Sensitive**; confirmed never logged anywhere in the codebase
- Otherwise Active, unvalidated beyond type/optionality — none are startup-critical (AD-5 point 4: SMTP remains non-blocking, untouched by T030.7)

---

## 7. First-Admin / Production Bring-Up

All 9 variables below are **script-level required/optional**, not part of `env.validation.ts`'s `EnvironmentVariables` class — validated independently and identically by two separate scripts (`backend/prisma/production-bring-up.ts:18-33` and `backend/prisma/bootstrap-first-admin.ts:21-38`, duplicated `REQUIRED_ENV_VARS` arrays — DISCOVERY-T030 finding F23).

| Variable | Required | Sensitivity | Notes |
|---|---|---|---|
| `FIRST_ADMIN_ORG_CODE` | Yes (script) | Non-sensitive | |
| `FIRST_ADMIN_ORG_DISPLAY_NAME` | Yes (script) | Non-sensitive | |
| `FIRST_ADMIN_ORG_SLUG` | Yes (script) | Non-sensitive | |
| `FIRST_ADMIN_BRANCH_CODE` | Yes (script) | Non-sensitive | |
| `FIRST_ADMIN_BRANCH_NAME` | Yes (script) | Non-sensitive | |
| `FIRST_ADMIN_USERNAME` | Yes (script) | Non-sensitive | |
| `FIRST_ADMIN_EMAIL` | Yes (script) | Non-sensitive | |
| `FIRST_ADMIN_PASSWORD` | Yes (script) | **Sensitive** | **Hardened by T030.11 (DISCOVERY-T030 F36 — partially closed)**: length ≥8 (unchanged — this is the project's uniform password-strength baseline, matching `ResetPasswordDto`'s own `@MinLength(8)`, deliberately not raised further to avoid an inconsistent bar between this bootstrap path and every other password-reset flow in the system) + rejection of a small named blocklist of known placeholder/default values (`Admin@123`, `password`, `Password123`, `admin123`, `changeme` — `first-admin-initializer.ts`), not just the single `Admin@123` literal as before. No value is ever printed in a rejection message. |
| `FIRST_ADMIN_FULL_NAME` | No (script) | Non-sensitive | Only optional one, `\|\| undefined` fallback |

**Failure behavior (all 8 required)**: both scripts throw before touching Prisma if any is missing. Not consumed by `main.ts`/the running application — one-shot bootstrap only.

---

## 8. Backup / Restore Tooling

### `PG_DUMP_BINARY` / `PG_RESTORE_BINARY`
- **Consumer(s)**: `backend/src/modules/platform/backup/backup-runner.ts:26`; `restore-runner.ts:19`
- **Required/Optional**: Optional | **Default**: `pg_dump` / `pg_restore` (PATH-resolved)
- **Sensitivity**: Non-sensitive
- **Validation status**: Unvalidated, **absent from `.env.example`** (DISCOVERY-T030 finding F25)
- **Deprecation/Unused**: Active but undocumented

### `BACKUP_DIR` / `BACKUP_RETENTION_DAYS`
- **Consumer(s)**: `backend/prisma/backup.ts:17-18`
- Optional, defaults `./backups` / `14` respectively. Non-sensitive. Undocumented (F25). Active.

### `PG_BIN_DIR`
- **Consumer(s)**: `backend/test/t029-12-disposable-db-safety.ts:186-216` (`resolvePgBinDir`)
- **Required/Optional**: Optional — on Windows, auto-probes `C:\Program Files\PostgreSQL\<version>\bin` if unset; otherwise resolves the bare binary name via PATH
- **Sensitivity**: Non-sensitive
- **Validation status**: Unvalidated, undocumented in `.env.example`
- **Deprecation/Unused**: Active, T029.12-scoped only

---

## 9. Operational Scripts

### `QUEUE_NAME`
- **Consumer(s)**: `backend/prisma/inspect-jobs.ts:11` (diagnostic script, not part of any npm script list)
- Optional, default `mail`. Non-sensitive. Undocumented (F25). Active but low-traffic.

---

## 10. Dev-Only Feature Flags

### `PRODUCT_REFACTOR_ENABLED`
- **Consumer(s)**: `backend/src/modules/product/product-refactor.flag.ts:13`; test-only reads in `product.service.spec.ts` (10 line references)
- **Required/Optional**: Optional | **Default**: `false` (any value other than exact string `'true'`)
- **Sensitivity**: Non-sensitive
- **Validation status**: Unvalidated, absent from `.env.example`
- **Deprecation/Unused**: Active, explicitly dev-only per its own doc-comment (flagged for eventual removal, not by this package)

---

## 11. Destructive Integration-Test Variables (Architect Decision 2)

**These two variables are deliberately NOT part of normal `.env.example` onboarding.** They exist solely to gate `backend/test/backup-restore.integration-spec.ts` and `backend/test/migration-rollback.integration-spec.ts` (T029.12), which run real `pg_dump`/`pg_restore`/`createdb`/`dropdb`/migration-rollback operations.

### `T029_DISPOSABLE_DATABASE_URL`
- **Consumer(s)**: `backend/test/t029-12-disposable-db-safety.ts:82-91,96-103,144-149`
- **Required/Optional**: Required **only** when running the T029.12 integration specs directly; **no default**
- **Format**: Postgres connection URL whose database name carries the `t029_disposable_` prefix (`DISPOSABLE_PREFIX`, line 41)
- **Sensitivity**: **Sensitive** (embeds credentials, same as `DATABASE_URL`)
- **Validation status**: Validated by a dedicated 5-point safety contract (`assertSafeToDestroy()`, lines 78-135) — see below
- **Failure behavior**: Throws `DisposableDbSafetyError` before any destructive subprocess runs if any of the 5 points fail
- **Deprecation/Unused**: Active, T029.12-only

### `T029_ALLOW_DESTRUCTIVE_DB_TESTS`
- **Consumer(s)**: same file, lines 84,120-125
- **Required/Optional**: Required **only** for the T029.12 integration specs; no default
- **Format**: must equal the exact literal string `'true'` — any other value (including `'1'`) is rejected
- **Sensitivity**: Non-sensitive (a boolean gate, not a credential)
- **Failure behavior**: Same as above
- **Deprecation/Unused**: Active, T029.12-only

**Explicit statements required by Decision 2**:
- **T029.12-only** — these variables have no meaning and no effect anywhere outside the two integration-spec files above.
- **No defaults** — both must be explicitly set by whoever invokes these specific tests.
- **Explicit opt-in required** — `T029_ALLOW_DESTRUCTIVE_DB_TESTS` must be the literal string `'true'`; there is no implicit or partial opt-in.
- **`T029_DISPOSABLE_DATABASE_URL` must never equal `DATABASE_URL`** — enforced programmatically (`assertSafeToDestroy` point 2, lines 96-103), not just documented.
- **Must never target development, staging, or production** — enforced via `PROTECTED_DATABASE_NAMES` (lines 29-39): `{postgres, template0, template1, production, prod, staging, development, dev, test}`, and via the mandatory `t029_disposable_` name prefix.
- **Must not be exported globally** — these variables must be set only in the shell/CI-step invocation that runs the T029.12 specs, never in `backend/.env`, never in `docker-compose.yml`, never in a general-purpose CI job's `env:` block.
- **Must not be included in production configuration** — confirmed: absent from `backend/.env.example`, `docker-compose.yml`, and every non-T029.12 CI job's `env:` block in this repository as of this writing.

---

## 12. Docker Compose PostgreSQL Credentials (Architect Decision 3 / AD-2) — REMEDIATED by T030.5

- **Consumer(s)**: `docker-compose.yml:11-13` (`postgres` service `environment:`), re-derived at `docker-compose.yml:52` (`bring-up` service) and `docker-compose.yml:65` (`backend` service); new root-level `.env.example` (repo root, distinct from `backend/.env.example`)
- **Sensitivity**: **Sensitive**

**Status**: T030.5 implemented the credential-externalization portion of the Approved Target State below. The stronger, application-level "reject a known-weak value" enforcement remains future work (see Current Risk / Remaining Gap).

**Previously Observed Behavior (pre-T030.5, historical)**: `POSTGRES_USER: postgres`, `POSTGRES_PASSWORD: postgres`, `POSTGRES_DB: pos_erp` were hardcoded literals in `docker-compose.yml` — not `${VAR}`-substituted, not sourced from any `.env` file. The same credential was re-embedded as a working `DATABASE_URL` connection string for both the `bring-up` and `backend` services. This is DISCOVERY-T030 finding F26 (Critical) — the externalization portion is now closed by T030.5; see Remaining Gap below for what is not yet closed.

**Current Observed Behavior (as of T030.5)**: `docker-compose.yml:11-13` now reads `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` via Compose's `${VAR:?error message}` required-interpolation syntax — `docker compose` refuses to run at all (clear error, before any container starts) if these are unset. Values are supplied via a new root-level `.env` (Compose auto-loads a `.env` file from the same directory as `docker-compose.yml` for `${VAR}` interpolation — a different mechanism from the `env_file: ./backend/.env` directive, which only injects variables *into* the container, not into `${VAR}` interpolation). `docker-compose.yml`'s own `DATABASE_URL` overrides for `bring-up`/`backend` are now constructed from the same three variables (`docker-compose.yml:52,65`) rather than a separate hardcoded literal, so there is exactly one place the real value needs to be supplied. No literal, working credential remains committed anywhere in `docker-compose.yml`. `.env.example` (repo root) ships a clearly-labeled dev-only value (`POSTGRES_PASSWORD=change-me-postgres-password`, mirroring the JWT secret placeholder convention already established in `backend/.env.example`). The `docker-verify` CI job (`.github/workflows/backend-ci.yml:139-145`) now writes its own root `.env` with a CI-only password (`ci-docker-verify-postgres-password`), distinct from the dev-example value and from any real production value — satisfying "the same password must not be reused across local, CI and production environments" for these three specific environments.

**Approved Target State — remaining gap (per Decision 3 / AD-2 FINAL DECISION — NOT yet implemented)**:
- ~~No committed functional credential is acceptable as the production or CI contract.~~ — **closed**: the only committed values are clearly-labeled dev/CI placeholders (`change-me-postgres-password`, `ci-docker-verify-postgres-password`), not silently-reused real ones.
- ~~PostgreSQL credentials are supplied externally.~~ — **closed**, via the root `.env` mechanism above.
- ~~Production and CI fail fast when required credentials are absent.~~ — **closed at the Compose level** (`${VAR:?err}`) — but **not yet closed at the application level**: `backend/src/config/env.validation.ts` has no equivalent check, and this package's authorization explicitly excluded "Startup validation" from scope. A `DATABASE_URL` whose embedded password is still the shipped `change-me-postgres-password` placeholder will currently boot successfully in `NODE_ENV=production` — there is no `assertProductionSecretsChanged`-equivalent guard for this credential yet, unlike JWT secrets.
- ~~The same password must not be reused across local, CI, and production environments.~~ — **closed for local vs. CI** (distinct values, see above); **production's actual value is an operator responsibility**, not yet independently verified/enforced by any automated check.

**Current Risk**: reduced from Critical to Medium. The Critical risk (a real, working, publicly-visible-in-the-repository Postgres password embedded in the only documented deployment mechanism) is closed. Remaining risk: an operator could still copy the dev-only `change-me-postgres-password` placeholder into a real production `.env` without being stopped by any automated guard (the same class of gap that already exists for JWT secrets when `NODE_ENV` itself is left unset — see DISCOVERY-T030 finding F20, still open).

**Planned Remediation Package for the remaining gap**: a future, explicitly-scoped "Startup Validation" package (deferred by this package's own authorization) — e.g. an `assertProductionDatabaseCredentialsChanged`-equivalent check, mirroring the existing JWT-secret pattern. Not yet assigned a package number.

**Temporary Operator/Developer Instruction**: `.env.example` (repo root) must be copied to `.env` before running `docker compose up` in ANY mode — this is now enforced by Compose itself (`:?err`), not just documented. For any environment beyond local/throwaway use, replace `change-me-postgres-password` with a real, unique value; no automated check will currently catch a forgotten replacement.

---

## 13. Frontend (`frontend/.env.local`)

### `NEXT_PUBLIC_API_URL`
- **Consumer(s)**: `frontend/src/lib/api.ts:23` (sole consumer)
- **Required/Optional**: Optional | **Default**: `http://localhost:3000`
- **Sensitivity**: Non-sensitive
- **Correctness check**: confirmed to correctly match the backend's real default listen port (`backend/.env.example:2`, `PORT=3000`) — no conflict here.
- **Validation status**: Unvalidated (no Next.js-side schema)
- **Deprecation/Unused**: Active

### `NEXT_PUBLIC_WS_URL`
- **Consumer(s)**: **none** — declared in `frontend/.env.example`/`frontend/.env.local` but never read anywhere in `frontend/src` (confirmed via exhaustive grep)
- **Required/Optional**: Optional (moot — unused)
- **Deprecation/Unused**: **Unused / dead configuration** (DISCOVERY-T030 finding F24)

---

## 14. Playwright Screenshot Tooling (Architect Decision 4)

### `FRONTEND_BASE_URL`
- **Consumer(s)**: `tools/playwright/lib/screenshot.ts` (all other `tools/playwright/*.ts` files consume the re-exported `DEFAULT_BASE_URL`, not this variable directly)
- **Required/Optional**: Optional | **Sensitivity**: Non-sensitive

**Current Observed Behavior (fixed by T030.8)**: defaults to `http://localhost:3001` when unset, matching the canonical Hybrid-mode contract below. Prior to T030.8 this defaulted to `http://localhost:3000` — a known tooling defect, now closed.

**Approved Target Contract**: the canonical Hybrid-mode ports are **Backend: `http://localhost:3000`, Frontend: `http://localhost:3001`**. The approved Playwright contract is `FRONTEND_BASE_URL=http://localhost:3001` — this is now also the tool's own unset default, so an explicit export is no longer required under the documented Hybrid setup (still required, as before, if the frontend runs on a non-standard port).

**Additional hardening (T030.8)**: `tools/playwright/lib/screenshot.ts` now exports `resolveUrl()`, which classifies a bad route argument into one of two distinct errors — `GitBashPathManglingError` (the value looks like a Git-Bash/MSYS2-mangled Windows path) or `InvalidRouteUrlError` (neither a valid URL nor a `/`-prefixed route) — plus `FrontendUnreachableError` for a `page.goto()` failure (dev server not running). All three carry a Vietnamese, actionable message and a distinct `.name`. `tools/playwright/screenshot-page.ts` and `screenshot-component.ts` also accept an explicit `--route=<value>` flag (via the new `parseCliRoute()` helper), which MSYS2 never rewrites since the `/` no longer starts the argv token — the primary mitigation for the Git Bash path-mangling risk documented below.

**Residual Risk**: any Playwright script run against a frontend that is NOT on `:3001` (a non-standard local override) must still export `FRONTEND_BASE_URL` explicitly, same as any other tool relying on a default.

### `FRONTEND_LOGIN_USERNAME` / `FRONTEND_LOGIN_PASSWORD`
- **Consumer(s)**: `tools/playwright/screenshot-dashboard.ts:28-29`
- **Required/Optional**: Optional — if both unset, the script falls back to an unauthenticated navigation (documented, honest behavior, not an error)
- **Sensitivity**: `FRONTEND_LOGIN_PASSWORD` is **Sensitive**; never given a committed default anywhere
- **Validation status**: Unvalidated (shell-level only)
- **Deprecation/Unused**: Active

---

## 15. Variables With No Real Consumer (T030.7 Mandatory Source Verification)

T030.7's authorization named `API_PREFIX`, `REDIS_URL`, and "any encryption, OTP or queue variables actually consumed at startup" as part of the variable set to validate. Fresh grep across `backend/src` (excluding specs) confirmed **zero matches for `API_PREFIX`, `REDIS_URL`, or `ENCRYPTION`** anywhere in application source, and zero matches for `QUEUE_NAME` outside the standalone diagnostic script `backend/prisma/inspect-jobs.ts` (not part of application startup — see §9). Reported here explicitly rather than inventing validation for variables that don't exist:

- **`API_PREFIX`**: no such variable exists. The REST prefix is a hardcoded literal, `app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] })` (`main.ts`) — not environment-configurable at all.
- **`REDIS_URL`**: no such variable exists. Redis connection is configured exclusively via the discrete `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` fields (§2).
- **Encryption**: no encryption-key environment variable exists anywhere in the codebase.
- **OTP**: no OTP-specific environment variable exists — OTP timing/rate-limit behavior is entirely hardcoded (see §6).
- **Queue**: `QUEUE_NAME` exists but is read only by `backend/prisma/inspect-jobs.ts`, a standalone diagnostic script not invoked by `main.ts`/application startup — BullMQ's real queue name (`MAIL_QUEUE`) is a hardcoded constant, not environment-configurable.

---

## Per-Environment Values Matrix (variables whose actual value differs by environment)

| Variable | Local Native (Mode B) | Docker (Mode A / infra containers) | Backend CI | Production (per RUNBOOK.md, current) |
|---|---|---|---|---|
| `NODE_ENV` | `development` (unset or explicit) | `development` (unset) or `production` (`docker-verify` job only) | `test` | `production` (required, not yet enforced by default — see F20) |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/pos_erp?schema=public` | `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public` (derived from root `.env` as of T030.5, overrides `backend/.env`'s own value) | `postgresql://postgres:postgres@localhost:5432/pos_erp?schema=public` (`ci`/`e2e` jobs, CI service container); `docker-verify` job derives from its own root `.env` (§12) | Externally supplied at the Compose level (T030.5); application-level enforcement still not implemented (§12 remaining gap) |
| `REDIS_HOST` | `localhost` | `redis` (hardcoded in `docker-compose.yml` for the `backend` service) | `localhost` (CI service container) | Should be externally supplied — not yet enforced |
| `REDIS_PORT` | `6379` | `6379` | `6379` | Externally supplied, typically `6379` |
| `CORS_ORIGIN` | `http://localhost:3001` (default) | same, from `.env` via `env_file` | not set at REST layer in `ci`/`e2e` jobs (uses default); explicitly `https://ci-docker-verify.example.com` in `docker-verify` job | Must differ from the default (enforced for REST only — see Decision 1) |

For every other variable in this contract, the value is identical across all environments unless a `.env`/Compose/CI override is explicitly applied — see each variable's own entry above.

---

*End of ENVIRONMENT-CONTRACT.md.*

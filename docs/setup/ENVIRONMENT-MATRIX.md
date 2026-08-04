# Environment Variable Matrix — POS ERP Enterprise

Companion to `docs/setup/ENVIRONMENT-CONTRACT.md` (full per-variable detail; read that file for consumer file:line evidence, sensitivity, and the 4 Architect Decisions' current-vs-target treatment). This file answers only: **which variables are required in which of the 7 environments.**

## Legend

- **R** — Required (the environment fails/is meaningfully broken without it)
- **R\*** — Required in a *subset* of that environment (see footnote)
- **O** — Optional (has a working default, or the environment tolerates its absence)
- **—** — Not applicable / not read at all in that environment
- **(target)** — reflects the Approved Target Contract, not current behavior — see `ENVIRONMENT-CONTRACT.md` for the current-vs-target split; the matrix cell itself always reflects **current** behavior unless explicitly marked `(target)`

The 7 environments, as scoped by this package's authorization:

1. **Local Hybrid** — Mode B: native backend (`npm run start:dev`) + native frontend, Postgres/Redis via `docker compose up -d postgres redis`
2. **Docker Compose** — Mode A: `docker compose up --build` (postgres, redis, bring-up, backend — frontend still native, no frontend service exists)
3. **Backend CI** — `.github/workflows/backend-ci.yml`, spans 3 jobs (`ci`, `e2e`, `docker-verify`) with different env requirements — see footnote †
4. **Frontend CI** — `.github/workflows/frontend-ci.yml` (confirmed: no `env:` block anywhere in this workflow)
5. **Production** — per `docs/deployment/RUNBOOK.md`, the only currently-documented deployment mechanism (`docker compose up --build` on a target host)
6. **Playwright screenshot tooling** — `tools/playwright/*.ts`
7. **T029.12 destructive integration tests** — `backend/test/backup-restore.integration-spec.ts`, `backend/test/migration-rollback.integration-spec.ts`

---

## Core

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `NODE_ENV` | **R** (T030.11 — no longer has a default; `backend/.env.example` already ships it explicitly) | **R** (satisfied via `Dockerfile`'s `ENV NODE_ENV=production` baked into the `runtime` image, not via `docker-compose.yml`'s own `environment:` block, which does not set it) | **R** (always set, all 3 jobs — now also enforced, not just conventional) | — | **R, enforced** (F20 CLOSED by T030.11 — startup now fails without it) | — | — |
| `PORT` | O | O | O | — | O | — | — |
| `DATABASE_URL` | R | R (derived from root `.env`'s `POSTGRES_*` as of T030.5) | R (all 3 jobs) | — | **R, with password + weak-value + disposable-name checks as of T030.7** (§15 of Contract) | — | R (comparison baseline only, §11 of Contract) |

## Redis

Required/Optional cells below are unchanged by T030.9 (Redis stays optional-at-bootstrap, runtime-required-for-degradation everywhere) — what changed is *how fast and how observably* the app detects and reports Redis being unavailable, and that both consumers (`RedisModule`, `QueueModule`/BullMQ) now build their connection options from one shared factory. See `ENVIRONMENT-CONTRACT.md` §2 for the full T030.9 write-up.

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `REDIS_HOST` | O | O (hardcoded override to `redis`) | O (`ci`/`e2e` jobs) | — | O | — | — |
| `REDIS_PORT` | O | O | O | — | O | — | — |
| `REDIS_PASSWORD` | O (trusted host `localhost`) | O (trusted host `redis`) | O (`docker-verify`: trusted host `redis`, `ci`/`e2e`: not production) | — | **R\*** (T030.11, F27 CLOSED — required only if `REDIS_HOST` is NOT one of `localhost`/`127.0.0.1`/`::1`/`redis`; still O for those 4 trusted hosts even in production) | — | — |

## Authentication / JWT

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `JWT_ACCESS_SECRET` | R | R | R (all 3 jobs — `docker-verify`'s value lengthened to 37 chars, T030.7) | — | **R, ≥32 chars, must differ from `JWT_REFRESH_SECRET`, as of T030.7** | — | — |
| `JWT_ACCESS_EXPIRES_IN` | O | O | O | — | O | — | — |
| `JWT_REFRESH_SECRET` | R | R | R (all 3 jobs — `docker-verify`'s value lengthened to 38 chars, T030.7) | — | **R, ≥32 chars, must differ from `JWT_ACCESS_SECRET`, as of T030.7** | — | — |
| `JWT_REFRESH_EXPIRES_IN` | O | O | O | — | O | — | — |

## CORS

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `CORS_ORIGIN` | O | O | O (`docker-verify` sets explicitly) | — | **R, both REST and WebSocket** (T030.6 — single validated source, `assertProductionConfigSafe` now covers both transports) | — | — |

## Swagger

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `SWAGGER_ENABLED` | O | O | O (`docker-verify` sets `false`) | — | R (must be `false`) | — | — |
| `SWAGGER_PATH` | O | O | O | — | O | — | — |

## Mail / SMTP

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `SMTP_HOST` | O | O | O (unset in all 3 jobs) | — | O (warn-only if empty) | — | — |
| `SMTP_PORT` | O | O | O | — | O | — | — |
| `SMTP_USER` | O | O | O | — | O | — | — |
| `SMTP_PASS` | O | O | O | — | O | — | — |
| `SMTP_FROM` | O | O | O | — | O | — | — |

## First-Admin / Production Bring-Up

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `FIRST_ADMIN_ORG_CODE` | O (not the recommended path, §DEVELOPMENT-SETUP.md §4.3) | R (`bring-up` service) | R\* (`docker-verify` job only) | — | R | — | — |
| `FIRST_ADMIN_ORG_DISPLAY_NAME` | O | R | R\* | — | R | — | — |
| `FIRST_ADMIN_ORG_SLUG` | O | R | R\* | — | R | — | — |
| `FIRST_ADMIN_BRANCH_CODE` | O | R | R\* | — | R | — | — |
| `FIRST_ADMIN_BRANCH_NAME` | O | R | R\* | — | R | — | — |
| `FIRST_ADMIN_USERNAME` | O | R | R\* | — | R | — | — |
| `FIRST_ADMIN_EMAIL` | O | R | R\* | — | R | — | — |
| `FIRST_ADMIN_PASSWORD` | O | R | R\* | — | R | — | — |
| `FIRST_ADMIN_FULL_NAME` | O | O | O | — | O | — | — |

## Backup / Restore / Operational Scripts

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `PG_DUMP_BINARY` | O | O | — | — | O | — | O (settable, normally programmatic — see Contract §8) |
| `PG_RESTORE_BINARY` | O | O | — | — | O | — | O |
| `BACKUP_DIR` | O | O | — | — | O | — | — |
| `BACKUP_RETENTION_DAYS` | O | O | — | — | O | — | — |
| `PG_BIN_DIR` | O | — (Linux container, PATH resolves natively) | — | — | O | — | O (Windows-relevant) |
| `QUEUE_NAME` | O (manual `inspect-jobs.ts` use) | O | — | — | O | — | — |

## Dev-Only Feature Flags

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `PRODUCT_REFACTOR_ENABLED` | O | O | O (`ci` job, test-manipulated) | — | O | — | — |

## Destructive Integration-Test Variables

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `T029_DISPOSABLE_DATABASE_URL` | — | — | — (not wired into any current CI job) | — | — | — | **R** |
| `T029_ALLOW_DESTRUCTIVE_DB_TESTS` | — | — | — | — | — | — | **R** |

## Docker Compose PostgreSQL Credentials (externalized as of T030.5 — see ENVIRONMENT-CONTRACT.md §12)

Read from a root-level `.env` (repo root, copied from the new root `.env.example`) via Compose `${VAR:?err}` required-interpolation — `docker compose up` now refuses to start at all if any is unset, in every mode that invokes Compose.

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `POSTGRES_USER` | — (uses `DATABASE_URL` directly, no Compose involved in Mode B's backend process) | **R** (root `.env`, fails fast if unset) | R (`e2e` job's own service-container `env:`, unrelated to Compose; **R**, root `.env`, for `docker-verify` job only) | — | **R** (root `.env` on the deployment host; application-level enforcement of a *non-placeholder* value still not implemented) | — | — |
| `POSTGRES_PASSWORD` | — | **R**, root `.env` | Same split as above | — | **R**, application-level strength enforcement still pending | — | — |
| `POSTGRES_DB` | — | **R**, root `.env` | Same split as above | — | **R** | — | — |

## Frontend

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | O | O | — | O (unused by `build`/`lint`/`test`, but present) | R (must point at the real deployed backend) | — | — |
| `NEXT_PUBLIC_WS_URL` | O (unused — F24) | O (unused) | — | O (unused) | O (unused) | — | — |

## Playwright Screenshot Tooling

| Variable | Local Hybrid | Docker Compose | Backend CI† | Frontend CI | Production | Playwright | T029.12 |
|---|---|---|---|---|---|---|---|
| `FRONTEND_BASE_URL` | — | — | — | — | — | O — unset default is now `http://localhost:3001` (fixed by T030.8, Decision 4); only needs an explicit override if the frontend runs on a non-standard port | — |
| `FRONTEND_LOGIN_USERNAME` | — | — | — | — | — | O (unauthenticated fallback if unset) | — |
| `FRONTEND_LOGIN_PASSWORD` | — | — | — | — | — | O (same) | — |

---

## Footnotes

**† Backend CI spans 3 jobs with different requirements**:
- `ci` job: unit tests only, no real Postgres/Redis service containers, uses CI-only dummy values for `DATABASE_URL`/`REDIS_HOST`/`JWT_*`.
- `e2e` job: real `postgres:16-alpine` + `redis:7-alpine` service containers (hence `POSTGRES_USER`/`PASSWORD`/`DB` are `R` for this job specifically), runs the full unfiltered 30-suite E2E job.
- `docker-verify` job: the only job that exercises `FIRST_ADMIN_*` (writes a full `backend/.env` via heredoc) and sets `NODE_ENV=production`.

This matrix's "Backend CI" column reflects the **union across all 3 jobs** — a cell marked `R*` means required in at least one job, not necessarily all three; see `ENVIRONMENT-CONTRACT.md` §Per-Environment Values Matrix and the individual job breakdowns cited throughout the Contract for the exact per-job split.

---

*End of ENVIRONMENT-MATRIX.md.*

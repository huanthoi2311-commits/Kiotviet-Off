# Development Setup — POS ERP Enterprise

**Authority**: RFC-T030-Environment-Recovery — FINAL APPROVED. AD-1: **Option D (Hybrid)** — APPROVED.

This guide documents the two officially-supported development modes. Both modes use **Docker Compose exclusively for PostgreSQL and Redis** — there is no native/no-Docker path for either service (Redis has no official Windows build; AD01/AD02 in `docs/architecture/offline-single-computer-readiness-audit.md` ratified Docker as the only approved mechanism for it, and RFC-T030 §5/§6 scored a native-Windows-Redis-substitute path, Option B, lowest of all four options considered — it is not supported). What differs between the two modes is only whether the **backend Node process** also runs inside Docker or natively.

There is no frontend Docker service in this repository (`docker-compose.yml` defines only `postgres`, `redis`, `bring-up`, `backend`) — **the frontend always runs natively with `npm run dev`, in both modes.**

| | Mode A — Docker Compose | Mode B — Hybrid (Native App + Dockerized Infra) |
|---|---|---|
| PostgreSQL | Docker container | Docker container |
| Redis | Docker container | Docker container |
| Backend | Docker container | Native Node process (`npm run start:dev`) |
| Frontend | Native Node process (`npm run dev`) | Native Node process (`npm run dev`) |
| Iteration speed | Slower (rebuild image on backend change) | Fast (hot-reload on backend change) |
| Closest to production | Yes — identical images to CI/prod | Infra-identical; app process differs |

Use **Mode A** to reproduce the exact production/CI environment (e.g. verifying a Docker-specific issue, or the `docker-verify` CI job's behavior). Use **Mode B** for day-to-day feature development — it is the officially documented Hybrid mode and preserves full functionality (Cart, Checkout, OTP, authenticated Playwright captures, all 30 E2E suites) since real Postgres and real Redis are still present, only reached from a natively-running backend process instead of a container.

---

## 1. Prerequisites

Common to both modes:

| Tool | Required version | Why |
|---|---|---|
| Git | any recent version | clone the repository |
| Node.js | **>= 22** (`backend/package.json:8-10`'s `engines` field) | backend/frontend runtime |
| npm | bundled with Node.js | this repo uses `package-lock.json` at every level (root, `backend/`, `frontend/`) — **not** pnpm/yarn, despite the task template mentioning "pnpm/npm"; npm is the only package manager actually used here |
| Docker Desktop (Windows/Mac) or Docker Engine + Compose plugin (Linux) | any recent version supporting Compose v2 (`docker compose`, not the legacy `docker-compose`) | the *only* supported way to run PostgreSQL and Redis, in both modes |

No native PostgreSQL or Redis installation is documented or supported by this guide — see the callout above.

---

## 2. Installation

### 2.1 Node.js and npm

Install Node.js >= 22 (e.g. from nodejs.org, or a version manager such as `nvm-windows`). Verify:

```
node --version   # expect v22.x or later
npm --version
```

### 2.2 Docker

Install Docker Desktop (Windows/Mac) or Docker Engine + the Compose plugin (Linux). Verify:

```
docker --version
docker compose version
```

> If these commands are not found, you are in the same situation this project's own DISCOVERY-T030-ENVIRONMENT-RECOVERY.md documented for its authoring sandbox: neither Mode A nor Mode B is usable until Docker is installed. Per RFC-T030 §5 Option D, this is an accepted, non-blocking state for code-level work — see that RFC's "Docker-less fallback" framing — but no part of the backend can be run end-to-end without Docker, in either mode.

### 2.3 PostgreSQL

Not installed natively. Provisioned exclusively via the `postgres` service in the root `docker-compose.yml` (`postgres:16-alpine` image, port `5432`, credentials `postgres`/`postgres`, database `pos_erp`).

### 2.4 Redis

Not installed natively. Provisioned exclusively via the `redis` service in the root `docker-compose.yml` (`redis:7-alpine` image, port `6379`, no password).

### 2.5 Install project dependencies

From the repository root:

```
npm install                 # root tooling: commitlint, husky, commit-and-tag-version
cd backend && npm install   # runs `postinstall`: prisma generate
cd ../frontend && npm install
```

---

## 3. Environment Variables

Full reference: `docs/setup/ENVIRONMENT-VARIABLES.md` and (as of T030.4/T030.5) `docs/setup/ENVIRONMENT-CONTRACT.md`. Quick start:

```
cp .env.example .env              # repo root — Docker Compose credentials (T030.5)
cd backend
cp .env.example .env
```

**The root-level `.env` is required** — since T030.5, `docker-compose.yml` no longer ships a working Postgres credential; it reads `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` from this file and refuses to start (`docker compose` exits with a clear error) if it's missing. The shipped root example value (`POSTGRES_PASSWORD=change-me-postgres-password`) is dev-only, mirroring the JWT-secret placeholder convention — replace it before using this compose file for anything beyond local/throwaway use.

The shipped defaults in `backend/.env.example` are dev-safe (weak JWT placeholders, `NODE_ENV=development`, empty `SMTP_HOST`/`REDIS_PASSWORD`) — sufficient to run either mode locally without further edits, **except** `DATABASE_URL`/`REDIS_HOST`/`REDIS_PORT` if you change the Docker Compose port mappings.

Frontend:

```
cd frontend
cp .env.example .env.local   # already the same content; usually no edit needed
```

**Port note**: `backend/.env.example`'s shipped `CORS_ORIGIN=http://localhost:3001` and `frontend/.env.example`'s `NEXT_PUBLIC_API_URL=http://localhost:3000` together imply the intended convention is **backend on 3000, frontend on 3001**. Neither `next dev` nor `backend`'s default `PORT` enforces this automatically — see §7 for the exact commands.

---

## 4. Database Creation, Migration, Seed

These three steps are identical in both modes, since Postgres always runs in Docker.

### 4.1 Start the database containers

```
docker compose up -d postgres redis
```

Wait for both to report healthy (`docker compose ps` — both should show `healthy`, not just `running`; each has a 5s-interval healthcheck).

### 4.2 Apply migrations

For iterative local schema work:

```
cd backend
npx prisma migrate dev
```

To apply exactly what's committed (matches CI's `e2e` job and Docker's `bring-up` service, no new migration is generated):

```
npm run prisma:migrate:deploy
```

There are 41 migrations in `backend/prisma/migrations/` as of this writing (`20260714000000_init` through `20260729000000_purchase_return_modernization`).

### 4.3 Seed demo data

```
npm run prisma:seed
```

Requires `NODE_ENV` to **not** be `production` (`backend/prisma/seed.ts:8-13` throws otherwise — this is deliberate, see `docs/setup/ENVIRONMENT-VARIABLES.md`). Creates:
- Permission catalog (all entries in `PERMISSION_CATALOG`)
- Organization `DEFAULT` / Branch `MAIN`
- Role `owner` with every permission
- **Demo admin login: `admin@pos-erp.local` / `Admin@123`** — for local development only. This exact password is hard-rejected by the separate production bring-up path (`first-admin-initializer.ts`) and must never be used outside local dev.

Safe to re-run — every step is idempotent (`upsert`-based, except `RolePermission` which does a deterministic delete-then-recreate).

> **Do not** use `npm run prisma:production-bring-up` for local development — that is a distinct, production-only path requiring 8 `FIRST_ADMIN_*` environment variables and producing a fresh, non-demo administrator account. It is documented in `docs/deployment/RUNBOOK.md`, not here.

---

## 5. Running the Backend

### Mode A — inside Docker

```
docker compose up --build
```

Brings up `postgres` → `redis` → `bring-up` (one-shot: runs `prisma migrate deploy` + permission bootstrap + first-admin, **not** the demo seed above) → `backend`. The backend is reachable at `http://localhost:3000`. This mode does **not** run `prisma:seed` — if you want the demo admin login while using Mode A, run `docker compose up -d postgres redis` only, then run migration/seed manually from your host per §4, then start just the `backend` container, or switch to Mode B.

### Mode B — natively (recommended for day-to-day development)

```
docker compose up -d postgres redis   # infra only
cd backend
npm run start:dev
```

Starts NestJS in watch mode (`nest start --watch`) directly against the Dockerized Postgres/Redis via the `DATABASE_URL`/`REDIS_HOST`/`REDIS_PORT` values in `backend/.env` (the unmodified `.env.example` defaults already point at `localhost:5432`/`localhost:6379`, which is exactly where Docker Compose's port mappings expose those two services — no edits needed). Reachable at `http://localhost:3000`. Code changes hot-reload; no image rebuild required.

---

## 6. Running the Frontend

Always native, in both modes:

```
cd frontend
PORT=3001 npm run dev
```

(`next dev --turbopack` binds port 3000 by default, which collides with the backend — the `PORT` environment variable, respected by Next.js's dev server, must be set to `3001` to match `backend/.env.example`'s `CORS_ORIGIN=http://localhost:3001` default and `frontend/.env.example`'s `NEXT_PUBLIC_API_URL=http://localhost:3000`.) Reachable at `http://localhost:3001`.

---

## 7. Running Playwright

The screenshot tooling lives under `tools/playwright/` (T030.1, FINAL COMPLETED) — see `tools/playwright/README.md` for full script-by-script usage. Prerequisites for each capability:

| Capability | Needs |
|---|---|
| Static/unauthenticated page capture (`screenshot-page.ts`, `capture-all.ts`) | Only the frontend dev server running (§6) — no backend/session required, though dashboard-group routes will show a real redirect-to-`/login` without one |
| Authenticated Dashboard/Product/Checkout/etc. capture (`screenshot-dashboard.ts` with `FRONTEND_LOGIN_USERNAME`/`PASSWORD`, or any other authenticated flow) | Full backend + Postgres + Redis reachable (either mode from §5) + a real user — the demo seed admin (`admin@pos-erp.local` / `Admin@123`, §4.3) is sufficient for local use |

Example, authenticated dashboard capture in Mode B:

```
docker compose up -d postgres redis
cd backend && npm run start:dev &     # separate terminal in practice
cd frontend && PORT=3001 npm run dev &  # separate terminal in practice
cd .. 
FRONTEND_LOGIN_USERNAME=admin@pos-erp.local \
FRONTEND_LOGIN_PASSWORD=Admin@123 \
npx tsx tools/playwright/screenshot-dashboard.ts
```

`FRONTEND_BASE_URL` no longer needs to be set explicitly above (T030.8): the tooling's own default is now `http://localhost:3001`, matching this setup's canonical frontend port. Only export it if the frontend runs on a different port.

> Git Bash path-mangling note (T030.8, documented in `tools/playwright/README.md`): MSYS2 rewrites ANY argv token containing a bare `/segment`, even inside a `--flag=` value (`--route=/login` still gets mangled — verified empirically, not assumed). The actual safe form for `screenshot-page.ts`/`screenshot-component.ts` is `--route=login` (no leading `/` — the tool re-adds it internally), or a full URL (`--route=http://localhost:3001/login`), or prefixing the command with `MSYS_NO_PATHCONV=1`.

---

## 8. Troubleshooting / Common Errors

| Symptom | Cause | Fix |
|---|---|---|
| `docker: command not found` | Docker not installed, or not on PATH | Install Docker Desktop/Engine (§2.2). If unavailable, you are in the documented Docker-less state — see RFC-T030 §5 Option D; code-level work and unit tests remain possible, integration verification does not. |
| `docker compose` fails immediately with `POSTGRES_USER chưa được set` (or `POSTGRES_PASSWORD`/`POSTGRES_DB`) | Root-level `.env` (repo root) is missing — required since T030.5 (§3), separate from `backend/.env` | `cp .env.example .env` at the repo root, then retry |
| Backend exits immediately with a `process.exit(1)` and a logged error instead of starting | Postgres unreachable — **DISCOVERY-T030 finding F15/F33, CLOSED by T030.7**: `bootstrap()` is invoked as `bootstrap().catch(handleBootstrapFailure)`, so an unreachable Postgres now fails fast and logs clearly instead of hanging silently (the previous "hangs forever, never responds on `/health`" behavior described here before T030.7 no longer applies) | Confirm `docker compose ps` shows `postgres` as `healthy`; confirm `DATABASE_URL` in `backend/.env` matches the mapped port (`5432` by default) |
| Backend refuses to start with an error mentioning `NODE_ENV` | `NODE_ENV` is missing/empty/not one of `development`/`test`/`production` — **required since T030.11** (DISCOVERY-T030 F20, previously silently defaulted to `development`) | Set `NODE_ENV=development` in `backend/.env` for local dev (already shipped in `.env.example`); set `NODE_ENV=production` explicitly for any real deployment |
| `EADDRINUSE` on port 3000 when starting the frontend | Backend and frontend both default to port 3000 | Start the frontend with `PORT=3001` (§6) |
| `/health` returns `"status":"degraded"`, `"redis":"down"` | Redis container not running or not yet healthy | `docker compose up -d redis`; wait for `docker compose ps` to show `healthy` |
| `prisma migrate deploy` fails with `P1001: Can't reach database server` | Postgres container not running/healthy, or wrong `DATABASE_URL` host/port | Same as the backend-hang row above |
| Login/OTP works but no email arrives, and console logs the OTP instead | `SMTP_HOST` is empty in `backend/.env` (the shipped default) | Expected in local dev — `mail.processor.ts` deliberately falls back to logging the OTP when SMTP isn't configured (see `ENVIRONMENT-VARIABLES.md`); this is not an error. **Since T030.11**, this only shows the real OTP value when `NODE_ENV` is not `production` — a production deployment left without SMTP logs `otp=[REDACTED]` instead. |
| `Seed script bị chặn khi NODE_ENV=production` | `NODE_ENV=production` is set while running `npm run prisma:seed` | Unset it or set `NODE_ENV=development` for local seeding — this guard is deliberate (§4.3) |
| Backend refuses to start with an error mentioning `JWT_ACCESS_SECRET`/`CORS_ORIGIN`/`SWAGGER_ENABLED` | `NODE_ENV=production` is set locally while `backend/.env` still has placeholder/dev values | These production-safety guards (`env.validation.ts`) are intentional — do not set `NODE_ENV=production` for local development |
| `tools/playwright/screenshot-page.ts /login ...` fails with `net::ERR_FILE_NOT_FOUND` | Git Bash (MSYS2) path-mangling on the leading `/` argument | Pass a full URL, or prefix with `MSYS_NO_PATHCONV=1` (§7) |
| `cart`/`checkout`/`invoice`/`payment`/`sales-return` E2E suites fail with `ECONNREFUSED` | Redis not running (these 5 of 30 E2E suites are the only ones with a real Redis dependency, per DISCOVERY-T030 §12) | `docker compose up -d redis`; the other 25 suites + both integration suites do not need this |

---

## 9. Verification Checklist

See `docs/setup/BOOTSTRAP-CHECKLIST.md` for the full, step-by-step checklist covering both modes from a completely fresh clone.

---

*End of DEVELOPMENT-SETUP.md.*

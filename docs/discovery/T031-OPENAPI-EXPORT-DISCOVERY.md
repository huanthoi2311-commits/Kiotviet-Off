# T031.01B — OpenAPI Export Discovery

**Status:** Read-only discovery. No RFC, no SPEC, no code, no dependency changes, no commits.
**Authority:** T031 Frontend Discovery — APPROVED; T031 Frontend Gap Analysis — APPROVED.
**Baseline commit surveyed:** `main` @ `baaaa683e15866ce6343eab3e7368b02f28a8b05`.

All conclusions below are derived from reading the actual source files listed, plus documented, verifiable NestJS/Prisma/ioredis runtime behavior — not from running new experimental scripts (none were written; doing so would have required creating files/installing nothing new was needed, but out of caution for the read-only mode, no script execution was attempted either).

---

## 1. Current state

- Swagger/OpenAPI is generated **at runtime only**, inside `bootstrap()` in `backend/src/main.ts`, gated by `config.get<boolean>('swagger.enabled')` (`SWAGGER_ENABLED`, default `'true'`, must be exactly `'false'` in production per `env.validation.ts`'s `assertProductionConfigSafe`).
- `SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('POS ERP Enterprise API').setDescription(...).setVersion('1.0').addBearerAuth().build())`, then `SwaggerModule.setup(path, app, document)` (`path` = `SWAGGER_PATH`, default `api/docs`). NestJS's `SwaggerModule.setup()` automatically also exposes `GET {path}-json` (e.g. `/api/docs-json`) once the app is listening.
- **No `openapi.json`/`.yaml` is committed anywhere in the repository** (confirmed by full-tree search, unchanged since the T031.01 Discovery Report).
- **No export script exists** in `backend/package.json` (scripts present: `postinstall`, `build`, `format`, `start*`, `lint`, `test*`, `prisma:*` — no `generate:openapi`/equivalent).
- `nest-cli.json` is minimal (`sourceRoot: src`, `deleteOutDir: true` in `compilerOptions`) — no custom builder, no monorepo/multi-app config, nothing relevant to standalone document generation one way or the other.
- Global API prefix: `app.setGlobalPrefix('api/v1', { exclude: ['health'] })` (`main.ts`) — every generated path in the document will already carry `/api/v1/...` except the health-check route.

---

## 2. Blockers (evidence-based, not assumed)

### 2.1 `PrismaService` eagerly connects — the single hard blocker

`backend/src/prisma/prisma.service.ts`:
```typescript
async onModuleInit() {
  await this.$connect();
  this.logger.log('Prisma connected to database');
}
```
`NestFactory.create(AppModule)` (and `Test.createTestingModule({imports:[AppModule]}).compile()`, used by every E2E test in this repo) both run the full module tree's lifecycle hooks — including this `onModuleInit()` — as part of the promise they return. `PrismaClient.$connect()` performs a real TCP connection attempt to `DATABASE_URL`; if nothing is listening, it rejects (this is documented Prisma behavior, not an assumption). **This means any code path that constructs `AppModule` — whether for `NestFactory.create()`, `createApplicationContext()`, or a `TestingModule` — currently requires a reachable Postgres**, or it will reject/throw during construction, before any Swagger document could be built.

`$connect()` only opens a connection pool — it does not run any query, so the database does **not** need migrations applied, only to be reachable and accept the connection (any database name matching `DATABASE_URL`, even an empty/unmigrated one, is sufficient for this specific purpose).

### 2.2 Redis is confirmed **not** a blocker

`backend/src/redis/redis.module.ts`: `new Redis(buildGeneralRedisOptions(connection))` — the `ioredis` client is constructed and stored; there is no `await client.connect()` or equivalent blocking call anywhere in module construction. `backend/src/config/redis-options.util.ts` confirms the general client is deliberately configured to **fail fast, not block** (`connectTimeout: 2000ms`, `T030.9` — explicit prior decision: "Redis-backed operations must fail deterministically and promptly"). Connection failures surface only as background `'error'`/`'reconnecting'` events (logged, not thrown) — they do not reject `NestFactory.create()`'s promise. `backend/src/queue/queue.module.ts` (BullMQ) uses the same non-blocking connection-options pattern. **Conclusion: Redis reachability is not required to build the module tree**, even though `REDIS_HOST`/`REDIS_PORT` must still be present as env vars (both have defaults, §3).

### 2.3 No existing precedent for bootstrapping without Postgres

`backend/src/main.spec.ts` was read in full: it never calls `bootstrap()` or `NestFactory.create(AppModule)`. It only unit-tests the pure `handleBootstrapFailure()` function (mocked logger/exit) and does source-text regex assertions against `main.ts`'s raw content (call-ordering checks) — it does **not** exercise the real bootstrap path at all. Every genuine `AppModule`-constructing test in this repo is an E2E suite (`Test.createTestingModule({imports:[AppModule]}).compile()`), and all of those are already established throughout this project's history to require real Postgres+Redis (CI's `E2E (Postgres + Redis thật)` job spins up both as service containers; local runs without them fail, as observed repeatedly this session). **There is no existing "construct AppModule without a live database" pattern anywhere in this codebase to reuse.**

---

## 3. Environment variables required (from `env.validation.ts`, read in full)

**Required, no default (`@IsNotEmpty()`, no `@IsOptional()`):**
- `NODE_ENV` (must be a valid `NodeEnv` enum value)
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

**Optional, with defaults:** `PORT` (3000), `REDIS_HOST` (`localhost`), `REDIS_PORT` (6379), `REDIS_PASSWORD` (none), `JWT_ACCESS_EXPIRES_IN` (`15m`), `JWT_REFRESH_EXPIRES_IN` (`30d`), `CORS_ORIGIN` (`http://localhost:3001`), `SWAGGER_ENABLED` (`'true'`), SMTP fields (all optional, only warned about in production if incomplete).

Since `validateEnv(process.env)` is called explicitly at the top of `bootstrap()` **before** `NestFactory.create()`, any export approach that reuses `bootstrap()`'s own code path (or duplicates its validation) will fail fast with a clear error if any of the 4 required vars above are missing — consistent, existing behavior, not something a new script needs to reinvent.

---

## 4. Option comparison

| Option | Needs live Postgres? | Needs live Redis? | Needs a running HTTP server? | Risk of drifting from the real runtime document | Effort |
|---|---|---|---|---|---|
| **(a) Runtime HTTP fetch** — start the app normally, `curl {path}-json`, save, stop the app | Yes | No (non-blocking) | Yes (must bind a port) | None — it *is* the real runtime document | Low (no new backend code; a shell/CI step) |
| **(b) Standalone script using `NestFactory.create()` + `SwaggerModule.createDocument()`, `app.close()` before `.listen()`** | Yes (same blocker, §2.1) | No | No (skips `.listen()`) | None — same document-generation call NestJS itself uses | Low-medium (one new backend script file) |
| **(c) Committed `openapi.json`, manually or periodically regenerated via (a)/(b), checked into the repo** | Only at generation time, not at consumption time | No | Only at generation time | Can go stale if not regenerated — needs a drift check (§9) | Same as (a)/(b) plus a drift-check step |
| **(d) Modify `PrismaService` to make `$connect()` skippable (e.g. an env flag), enabling a truly DB-free standalone context** | No (by design, after the change) | No | No | None, once implemented | Higher — touches shared production code (`PrismaService`), needs careful review since it changes a component every module in the app depends on |
| **(e) Build a parallel, stripped module tree (e.g. a `SwaggerOnlyModule` overriding `PrismaService` with a stub provider) just for document generation** | No | No | No | Risk of the stripped tree silently diverging from the real `AppModule` over time (missed module additions) | Higher — new module-maintenance burden, must be kept in sync by hand |

Options (a)/(b)/(c) are not mutually exclusive — (b) is the mechanism, (a) is a fallback/alternative mechanism, and (c) is what you do with either mechanism's output (commit it, or don't). (d) and (e) are the only options that remove the Postgres-reachability requirement, and both require touching backend production code, which is out of this Discovery's read-only scope to attempt.

---

## 5. Recommended option (for Architect decision — not decided here)

**(b) + (c): a standalone backend script using `NestFactory.create()` (skipping `.listen()`) to call the exact same `SwaggerModule.createDocument()` invocation already in `main.ts`, writing the result to a committed `openapi.json`, run in CI (where Postgres is already available as a service container in the existing `e2e` job pattern) with a drift check against the committed file.**

Rationale, evidence-based:
- Zero changes to `PrismaService` or any other production file — the eager-connect behavior (§2.1) is left exactly as-is, which is the lowest-risk path per this package's own "safest way" objective.
- CI already runs a Postgres service container for the E2E job (`backend-ci.yml`, `E2E (Postgres + Redis thật)`) — reusing that same pattern (or adding a lightweight dedicated job with just a Postgres service, no Redis needed per §2.2, no migrations needed per §2.1) is proven, already-working infrastructure, not something new to invent.
- A committed file gives Orval (and any other consumer) a stable, offline-readable artifact — it doesn't need a running backend to generate the frontend client, only to *periodically refresh* the committed document.
- This does **not** solve local single-developer "no Postgres running yet" convenience — but per `docs/setup/DEVELOPMENT-SETUP.md` (already read in the prior Gap Analysis), this project's own established convention is that Postgres is *already* mandatory for essentially all local backend development (Docker Compose, no native-DB path supported) — so this isn't a new burden, it's consistent with existing project convention.
- Option (d) (making Prisma's connect skippable) is not ruled out — it would improve local-dev convenience further — but it touches shared production code and deserves its own explicit review/authorization rather than being bundled into "the safest way to export OpenAPI."

---

## 6. Cookie / Bearer / multipart / pagination representation

- **Bearer auth**: `DocumentBuilder().addBearerAuth()` is already configured globally; individual protected routes use `@ApiBearerAuth()` (confirmed present on every guarded controller checked this session — Organization, Supplier, Auth's session-management routes, etc.). This is correctly represented today.
- **Cookie auth**: `@ApiCookieAuth()` is **never used anywhere** in the codebase (confirmed via full-tree grep) — the `refresh_token` `HttpOnly` cookie flow (WEB clients, `POST /auth/login`/`/auth/refresh`) is **completely undocumented in the OpenAPI schema today**. This is a real, concrete gap: an Orval-generated client has no schema-level way to know `/auth/refresh` relies on an `HttpOnly` cookie rather than a request body field for WEB clients — that contract detail exists only in `auth.controller.ts`'s source comments (already surfaced in the T031.01 Discovery Report), not in any machine-readable form Orval could consume.
- **Multipart**: exactly one endpoint uses file upload — `POST /suppliers/import` (`supplier.controller.ts`) — and it's **correctly annotated**: `@UseInterceptors(FileInterceptor('file'))`, `@ApiConsumes('multipart/form-data')`, `@ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })`. This is a working, positive precedent Orval should handle natively (multipart form-data generation is a standard Orval capability).
- **Pagination**: consistent pattern across the codebase — every list endpoint returns a `PaginatedXxxResponseDto` class (`{ items: Xxx[], total: number, page: number, limit: number }`), confirmed identically shaped in Invoice, Organization, Customer, Supplier, and others read throughout this session. This is uniform and Swagger-visible (all are real classes with `@ApiProperty()` decorators) — no gap found here.

---

## 7. Endpoints/DTOs producing invalid or incomplete Swagger metadata

- **`POST /suppliers/import`'s response type**: the controller method returns `Promise<SupplierImportSummary>`, and `@ApiResponse({ status: 201 })` carries no `type:`. `SupplierImportSummary` (`supplier-excel.service.ts`) is a **plain TypeScript `interface`, not a decorated class**. NestJS's Swagger reflection can only introspect classes carrying `@ApiProperty()` metadata (TypeScript interfaces are erased at compile time, invisible at runtime) — so this endpoint's response schema will be **empty or absent** in the generated document, and Orval will generate an untyped (`unknown`/`any`, or simply omitted) return type for this one call specifically. This is the one concrete, named instance found; no other such gap was found in the DTOs spot-checked this session (Invoice, Payment, Organization, Customer, Supplier's other endpoints all use decorated classes).
- No other broken/incomplete Swagger metadata was found in the files read across this and the prior two discovery passes — this does not constitute an exhaustive scan of all ~30 controllers' every DTO, only what was directly read.

---

## 8. Recommended script name and output path (proposal, not a decision)

- Script location: `backend/scripts/export-openapi.ts` (or `.js` after build) — a new file, matching the `backend/scripts/` convention likely to exist alongside things like `prisma/seed.ts`/`inspect-jobs.ts` referenced elsewhere in this project's docs.
- npm script: `"generate:openapi": "ts-node scripts/export-openapi.ts"` (or via `tsx`, already a root devDependency per the Gap Analysis's finding) in `backend/package.json`.
- Output path: `backend/openapi.json` (co-located with the backend that produces it) or `docs/api/openapi.json` (repo-root-level, mirroring where `docs/discovery/`, `docs/release/` etc. already live) — both are reasonable; this Discovery does not decide between them.

---

## 9. CI drift detection

No existing OpenAPI-specific drift tooling exists. The closest existing precedent in this codebase is `backend/src/config/cors-single-source.structural.spec.ts` — a structural/source-text test asserting a single source of truth for CORS config isn't duplicated elsewhere. It is not the same mechanism (that test does regex/text assertions against source files; OpenAPI drift would need to compare a freshly-generated JSON document against the committed one), but it establishes this project already has a precedent and comfort level for "structural drift" style CI checks, which the Architect may want to model a new check after conceptually (not literally).

A drift check would need, at minimum: (1) run the export script fresh in CI, (2) diff its output against the committed file, (3) fail the job if they differ, with a clear message telling the developer to re-run `generate:openapi` locally and commit the result. This mirrors how `prisma format`/`prisma validate` already gate schema correctness in the existing `ci` job, and how `backend-ci.yml`'s existing `Prisma validate` step already assumes a similar "generated artifact must match committed source" discipline.

---

## 10. How Orval should consume the result

Point `orval.config.ts` (in `frontend/`, doesn't exist yet — confirmed in the Gap Analysis) at the **committed file path** (`backend/openapi.json` or wherever §8 lands), not a live URL — this avoids the frontend's codegen step needing a running backend at all, which matches this project's general preference (seen throughout the backend's own E2E/CI design) for deterministic, infra-independent tooling wherever reasonably possible. A live-URL mode (`http://localhost:3000/api/docs-json`) remains available as a fallback for a developer actively iterating on both sides simultaneously, but should not be the primary/CI-facing mode.

---

## 11. Security risks

- **Example values in DTOs**: spot-checked across `LoginDto` (`example: 'owner@kiotviet-off.vn'`, `example: 'P@ssw0rd123'`), `CreateBranchDto`/`CreateOrganizationDto`-style DTOs, etc. — all example values found are obviously synthetic placeholders, not real credentials. No evidence of a real secret ever being used as a Swagger `@ApiProperty({ example: ... })` value.
- **Export-script failure output**: this codebase has an *already-established* convention (T030.7, verified by an existing passing test in `main.spec.ts`, item `[6]`: *"thông báo lỗi không chứa giá trị DATABASE_URL/JWT secret thật"*) that bootstrap-failure error messages must never leak real `DATABASE_URL`/JWT-secret values. A new export script that reuses `NestFactory.create()` (§5) would surface Prisma/Postgres connection errors through the same path `bootstrap()` already uses — **but only if it reuses `handleBootstrapFailure()` or an equivalent sanitized error handler**; a naive `console.error(err)` on connection failure could leak the real `DATABASE_URL` (which contains a password) directly into CI logs. This is a concrete, actionable risk to flag for whoever implements the script, not merely theoretical — Postgres/Prisma connection-error messages are known to sometimes echo back the connection string.
- **The document itself**: title/description/version are static strings (`'POS ERP Enterprise API'`, `v1.0`) — no environment-derived or secret-derived content is included in `DocumentBuilder`'s configuration today.

---

## 12. Exact files a future implementation would touch (inventory only — not implemented here)

**Backend:**
- New: `backend/scripts/export-openapi.ts` (or equivalent path per §8).
- Modified: `backend/package.json` (new `generate:openapi` script).
- Possibly modified: `.github/workflows/backend-ci.yml` (a new drift-check step or job, using the same `changes`/`Backend` aggregator pattern established in T030.14B so it doesn't reintroduce a required-check/path-filter gap).
- New (output): `backend/openapi.json` or `docs/api/openapi.json` (§8) — committed artifact.
- **Not touched under the recommended option**: `PrismaService`, `RedisModule`, `QueueModule`, `main.ts`'s existing `bootstrap()` function, any controller/DTO (unless the Architect separately decides to also fix the `SupplierImportSummary` gap from §7, which is a one-line class-conversion, out of this Discovery's scope to perform).

**Frontend:**
- New: `frontend/orval.config.ts`.
- New dependency: `orval` (devDependency).
- New: `frontend/src/generated/` (Orval output — commit-policy undecided, per the Gap Analysis's own open item).
- Modified: `frontend/package.json` (new `generate:api` script), possibly `frontend/.gitignore` (if `generated/` is excluded rather than committed — undecided).
- Possibly modified: `.github/workflows/frontend-ci.yml` (an Orval-drift or generation-freshness check, same aggregator-pattern caution as above).

---

## 13. Verification plan (for whoever eventually implements this — proposal only)

1. Run the export script locally against a real (even freshly-created, unmigrated) local Postgres — confirm it succeeds without needing `prisma migrate deploy` first (per §2.1's finding that `$connect()` doesn't require schema).
2. Confirm the exported document's route count/shape matches what `/api/docs-json` produces from a fully running `npm run start:dev` instance — i.e., the standalone script and the live runtime path must agree exactly (this is what makes option (b) safe: it calls the identical `SwaggerModule.createDocument()` NestJS already uses, so agreement should be automatic, but should still be verified once, empirically, before trusting it long-term).
3. Confirm the script fails clearly (non-zero exit, sanitized error message per §11) when Postgres is unreachable, rather than hanging indefinitely.
4. Confirm CI's drift check actually fails when a controller/DTO change isn't accompanied by a regenerated `openapi.json` (a deliberate negative test).
5. Once Orval exists: confirm a generated hook for the multipart `/suppliers/import` endpoint produces a usable `FormData`-based call, and confirm the known `SupplierImportSummary` gap (§7) manifests exactly as predicted (untyped response) rather than a build failure — if it causes a build failure instead of a silent `unknown`, that changes the urgency of fixing §7's gap.

---

## 14. Architect Decisions required

1. **Which export mechanism**: (b) standalone script vs. (a) runtime-fetch vs. some combination — Discovery recommends (b)+(c) but does not decide.
2. **Commit `openapi.json`** (and where — `backend/` vs `docs/api/`) **vs. generate-on-demand only** (no committed artifact, CI/dev always regenerates fresh).
3. **Whether to also authorize fixing `PrismaService`** (option (d), §4) as a follow-up, to make local Postgres-free generation possible — separate from and not required for the recommended path.
4. **Whether to authorize the one-line `SupplierImportSummary` interface→class conversion** (§7) as part of this work or as a separate, later fix — it is a real, named, narrow gap but touches production backend code, which this Discovery is not authorized to implement.
5. **Whether to add `@ApiCookieAuth()` metadata** for the refresh-token cookie flow (§6) — a documentation-completeness improvement, also production-code-touching, also deferred to the Architect.
6. **CI drift-check design**: new dedicated job vs. folded into the existing `ci`/`Backend` aggregator job structure from T030.14B — and whether Frontend's Orval output gets an equivalent drift check.
7. **`generated/` commit policy** (frontend) — carried over from the Gap Analysis as still-open, now sharpened by this Discovery's confirmation that the OpenAPI source itself is likely to be a committed, periodically-refreshed file rather than always-fresh.

---

## Explicitly out of scope for this Discovery

No RFC-T031/SPEC-T031 content. No code written, no scripts executed, no dependencies installed, no files modified outside `docs/discovery/`. No decision made on any of the 7 items in §14.

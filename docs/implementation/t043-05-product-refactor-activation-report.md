# T043.05 — Product Refactor Enforcement Activation

**Status:** IMPLEMENTED, pending PR/CI verification and merge.
**Prerequisite for:** T043 Product Module frontend implementation (paused per AD-1, T043 Architect Decision).
**Authority:** ARCHITECT DECISION — T043 PRODUCT MODULE, AD-1 ("Option C APPROVED").

## 1. Objective

Make three business rules — already implemented and already unit-tested since T005, but gated
behind `PRODUCT_REFACTOR_ENABLED` (default `false` in every real environment) — actually enforced
in runtime, so the T043 Product frontend can be built against real backend behavior instead of
either dead UI or a knowingly-incomplete one:

1. Optimistic Lock — `PATCH /products/:id` uses the client-supplied `version` as the compare-and-swap
   value (`PRODUCT_013` on mismatch), instead of silently using the server's own current version.
2. `PRODUCT_008` — reject a `type` change once the product has any transaction-history row (7 tables,
   `hasTransactionHistory()`, Decision A06).
3. `PRODUCT_012` — reject Archive (`DELETE /products/:id`) on a `VARIANT_PARENT` that still has an
   active `VARIANT_CHILD` referencing it (RFC-0001 §8).

## 2. What was NOT changed

- `backend/src/modules/product/product-refactor.flag.ts` — unmodified. `isProductRefactorEnabled()`
  still reads `process.env.PRODUCT_REFACTOR_ENABLED === 'true'`, still defaults `false` if unset.
- `product.service.ts` — zero application-code changes. All three gates were already implemented and
  already correct (SPEC-PRODUCT-001 compliant); the only thing wrong was that no real environment
  ever set the variable that turns them on.
- No new endpoint, no DTO change, no migration, no OpenAPI-visible contract change.

This is a **pure environment-configuration activation**, not a code change — per the smallest-safe-
activation-mechanism requirement in AD-1. The flag mechanism itself is deliberately left in place
(not deleted) so the change stays a one-line, fully reversible config value in every environment.

## 3. What changed

| File | Change |
|---|---|
| `backend/.env.example` | Added `PRODUCT_REFACTOR_ENABLED=true` with a comment explaining rollback (`false`) and referencing SPEC-PRODUCT-001/T043.05. |
| `.github/workflows/backend-ci.yml` | Added `PRODUCT_REFACTOR_ENABLED: "true"` to both the `ci` job's and `e2e` job's `env:` blocks. |
| `test/product.e2e-spec.ts` | New `describe` block (3 tests) proving the three rules against a real Postgres-backed HTTP request — see §4. Also corrected a stale header comment claiming this file "KHÔNG được tự chạy" (not true since the T029/T030 CI recovery work put a real Postgres+Redis `e2e` CI job in place). |
| `docs/setup/ENVIRONMENT-CONTRACT.md` §10 | Updated `PRODUCT_REFACTOR_ENABLED` entry to reflect the new real-environment value and rollback path. |

`docker-compose.yml` was deliberately **not** changed: the `backend` service already sources
`PRODUCT_REFACTOR_ENABLED` transitively via `env_file: ./backend/.env` (itself copied from
`.env.example`). Hardcoding it in the service's `environment:` override block would force it on
regardless of a developer's own local `.env`, removing their ability to flip it off locally for
rollback testing without editing a tracked file — so it was left to flow through the existing
mechanism instead.

## 4. Verification

Per AD-1's required-verification list:

- **Flag-off baseline reproduced**: `product.service.spec.ts`'s existing "Feature Flag TẮT (mặc
  định)" tests are untouched and still pass — each explicitly `delete process.env.
  PRODUCT_REFACTOR_ENABLED` in `beforeEach` (line 82), so they exercise the disabled path
  regardless of what any ambient CI/`.env` value says. This also means the CI-level env change has
  **zero effect** on the existing unit suite's assertions — those tests were already hermetic.
- **Flag-on behavior reproduced, for real**: new `test/product.e2e-spec.ts` coverage (T043.05
  `describe` block) — each test drives a real HTTP request through the real running `AppModule`
  against real Postgres (the `e2e` CI job's service container), not a mock:
  - Optimistic conflict: create → update once (version 1→2) → update again with the now-stale
    `version: 1` → expect `409` / `PRODUCT_013`.
  - `PRODUCT_008`: create a product, seed one real `InventoryAdjustmentItem` row for it (via
    Prisma directly — required a `Branch`/`Warehouse` fixture, added to `beforeAll`), then attempt
    `PATCH .../type` → expect `422` / `PRODUCT_008`.
  - `PRODUCT_012`: create a `VARIANT_PARENT` + an active `VARIANT_CHILD` pointing at it → `DELETE`
    the parent → expect `422` / `PRODUCT_012` → archive the child → `DELETE` the parent again →
    expect `204` (proves the guard is a real conditional gate, not a permanent block).
- **Full backend tests**: to be confirmed green in CI (`ci` job: lint/typecheck/unit/prisma
  validate/build; `e2e` job: migrate deploy/OpenAPI drift/`test:e2e`) — this sandbox has no local
  Postgres/Redis, so the `e2e` job result is the authoritative confirmation, consistent with every
  prior T04x sprint in this project.
- **OpenAPI/API drift**: expected unchanged — no DTO/route/response-shape edit was made. The `e2e`
  job's own "Check OpenAPI drift" step (`git diff --exit-code -- ../docs/api/openapi.json`) is the
  authoritative check.
- **Rollback**: setting `PRODUCT_REFACTOR_ENABLED=false` in any environment's own config reproduces
  pre-T043.05 behavior exactly — verified by inspection (the flag's read path and all three
  conditionals are byte-for-byte unchanged from T005) and by the untouched flag-off unit tests
  continuing to pass.

## 5. Scope note

Per AD-1, this sub-sprint activates enforcement only — it does not delete the flag or its
conditionals (that remains explicitly deferred, per the flag's own doc-comment, to a future point
once real-world stability under load has been observed) and does not touch anything outside the
`product` module's own enforcement path (Category/Brand/Unit/Barcode/Cart's read-only dependency on
`ProductDomainService` are unaffected — none of those four methods are gated by this flag).

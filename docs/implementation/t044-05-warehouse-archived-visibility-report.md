# T044.05 — Warehouse Archived Visibility

**Status:** IMPLEMENTED, pending PR/CI verification and merge.
**Prerequisite for:** T044 Inventory Module frontend — Warehouse's own List/Restore UI.
**Authority:** ARCHITECT DECISION — T044, Warehouse Restore reachability ("Option A APPROVED").

## 1. Problem

`GET /warehouses` (`WarehouseQueryDto`) had no query value that could ever surface a soft-deleted
warehouse — `WAREHOUSE_STATUSES = ['ACTIVE', 'INACTIVE']` only, and
`PrismaWarehouseRepository.search()` hardcoded `deletedAt: null` unconditionally. `POST /warehouses/
:id/restore` and the `warehouse:restore` permission both already existed and worked, but a deleted
warehouse could never be found through the list to restore it — structurally identical to Brand's
T041 AD-1 (`docs/implementation`/T041.05 precedent), which required the same fix: a new query
parameter, not a bug fix to an already-declared value (Warehouse never declared an archived-visible
value at all, unlike Category/Unit's pre-fix `ARCHIVED` enum value).

## 2. Fix

- `WarehouseQueryDto` — added `archived?: boolean` (`@IsOptional() @Type(()=>Boolean) @IsBoolean()`).
- `WarehouseSearchParams` (repository interface) — added `archived?: boolean`.
- `PrismaWarehouseRepository.search()` — `deletedAt: params.archived ? { not: null } : null` (was
  unconditional `null`).
- `WarehouseService.search()` — threads `query.archived` into repository params.
- `prisma-warehouse.repository.spec.ts` — 3 new tests (default/archived=false → `deletedAt: null`
  unchanged; archived=true → `deletedAt: { not: null }`, new). Verified via genuine temporary-revert-
  confirm-failure-then-restore cycle: reverted the repository fix, confirmed the new archived=true
  test failed, restored the fix, confirmed all 3 pass.

## 3. Scope

No migration (no schema change — `deletedAt` already exists on `Warehouse`). No new permission (reuses
`warehouse:view`). No change to `create`/`update`/`softDelete`/`restore`/`existsByCode`/
`hasStockOrTransactions`.

## 4. Verification

- Lint: 0 errors. Typecheck: 0 errors. `prisma validate`: schema valid (unchanged, no migration).
- Full backend unit suite: 199 suites / 1978 tests pass (one `argon2-password-hasher.spec.ts` failure
  on the first parallel run was confirmed transient/resource-contention — reproduced clean on
  immediate re-run, unrelated to this change, that spec touches no Warehouse/Inventory code).
- `npm run build`: clean.
- `npm run export:openapi`: purely additive 10-line `docs/api/openapi.json` diff — exactly the one
  new `archived` parameter on `GET /warehouses`. No existing operation changed.

## 5. Rollback

Config/code-only revert (no migration to reverse) — remove the `archived` field/parameter and the
repository's conditional, reverting to the prior unconditional `deletedAt: null`. No data-loss risk.

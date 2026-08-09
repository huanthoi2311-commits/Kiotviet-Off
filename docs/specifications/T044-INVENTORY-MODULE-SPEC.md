# SPEC-T044 — Inventory Module (Frontend)

**Status:** APPROVED FOR IMPLEMENTATION — no blocking Architect Decision found (Phase H gate). Backend
contract for all 5 modules below already fully built, permission-gated, error-coded, exposed via
OpenAPI with generated Orval clients (verified fresh from `origin/main`@`f104336`). Zero frontend
exists for any of them.

**Scope**: the complete "inventory family" — `Warehouse` (CRUD prerequisite), `Inventory` (read-only
ledger/list/history/product-stock), `Transfer`, `Inventory Adjustment`, `Stock Count` (each its own
workflow). Named explicitly in the T044 authorization's own Phase D capability list.

## 1. Dependency graph (re-derived from source, not assumed)

```
Product (CLOSED, T043)
Warehouse ──(referenced by warehouseId, no code dependency back)──┐
                                                                    │
Inventory (read-only ledger; Single Writer via InventoryDomainService)
   ↑ increase/decrease/adjust/transfer/recordMovement, all (tx, input)
   │
   ├── Purchase Order.receive()        → increase()
   ├── Purchase Return                 → decrease()
   ├── Transfer.approve()/.receive()   → transfer(OUT)/transfer(IN)
   ├── Inventory Adjustment.complete() → adjust(movementType=ADJUSTMENT)
   ├── Stock Count.complete()          → adjust(movementType=COUNT), only if difference≠0
   ├── Checkout                        → decrease() (skips SERVICE-type products)
   └── Sales Return.receive()          → increase() (Application-Service layer, Decision AD46 — the
                                          one deliberate exception to "repository calls the domain
                                          service" pattern; still goes through InventoryDomainService)
```

`Warehouse` module does **not** import `InventoryModule` — its only inventory touchpoint is a
read-only direct-Prisma check (`hasStockOrTransactions()`), already accepted as low-risk in
`docs/architecture/dependency-graph.md` §5.3.

## 2. Single Writer Rule — re-verified intact (Phase E)

- `grep` for `INVENTORY_REPOSITORY`/`IInventoryRepository` outside `backend/src/modules/inventory/`:
  zero matches.
- `InventoryModule` (`inventory.module.ts`) exports exactly `[InventoryDomainService]` —
  `INVENTORY_REPOSITORY` not exported.
- Zero direct `.inventory.(update|create|upsert|updateMany|createMany)(`/`.inventoryMovement.*(` calls
  anywhere outside `inventory/infrastructure/persistence/prisma-inventory.repository.ts`.
- CI already enforces this: `inventory/single-writer.architecture.spec.ts` — asserts the same 3
  invariants above, plus an explicit `it.each` list of the 7 authorized consumer modules.
- `InventoryDomainService`'s 5 public methods (`increase`/`decrease`/`adjust`/`transfer`/
  `recordMovement`) all require a caller-supplied `tx: Prisma.TransactionClient` — never open/commit
  their own transaction (ADR-0008). Optimistic Lock is a compare-and-swap on `quantity` itself (no
  separate `version` column) — `UPDATE inventories SET ... WHERE quantity = <just-read>`, always
  applied, no `movementType` exception (ADR-0007).

**This sprint's frontend must never bypass this** — no direct write to any Inventory-family mutation
outside the generated Orval hooks for `transfer`/`inventory-adjustment`/`stock-count` (which
themselves call the real backend endpoints, which internally route through `InventoryDomainService`).
The frontend has no way to touch `Inventory`/`InventoryMovement` directly by design — there is no
`POST`/`PATCH`/`DELETE` on `/inventory` at all.

## 3. Backend contract, per module

### 3.1 Inventory (read-only)

| Route | Permission | Response |
|---|---|---|
| `GET /inventory` | `inventory:view` | `PaginatedInventoryResponseDto` — filters `warehouseId?`, `productId?`, `page`, `limit` (max 100) |
| `GET /inventory/history` | `inventory:view` | `PaginatedInventoryMovementResponseDto` — filters `warehouseId?`, `productId?`, `movementType?` (9-value enum), `referenceType?` (6-value enum), `createdFrom?`/`createdTo?` |
| `GET /inventory/product/:id` | `inventory:view` | `InventoryResponseDto[]` — one product across all warehouses |

`InventoryResponseDto`: `id, warehouseId, productId, quantity, reservedQty, availableQty (=quantity-reservedQty, computed, not stored), avgCost, lastCost, createdAt, updatedAt`. No `productName`/`warehouseName` expansion — same raw-ID pattern as `ProductResponseDto.categoryId`; resolved client-side via existing lookups (§7).

`InventoryMovementResponseDto`: `id, warehouseId, productId, movementType, referenceType, referenceId, quantity (signed), beforeQuantity, afterQuantity, unitCost, remark, createdAt`. No `updatedAt` — immutable ledger row, no edit UI possible or needed.

No error codes of its own (pure search/read, nothing to 404 on an ID that was never required to exist).

### 3.2 Warehouse (full CRUD)

| Route | Permission |
|---|---|
| `POST /warehouses` | `warehouse:create` |
| `GET /warehouses` | `warehouse:view` (search/filter/paginate/sort by `name`\|`code`\|`createdAt`\|`updatedAt`) |
| `GET /warehouses/:id` | `warehouse:view` |
| `PATCH /warehouses/:id` | `warehouse:update` |
| `DELETE /warehouses/:id` | `warehouse:delete` (soft-delete, blocked by `WAREHOUSE_004` if stock/transactions exist) |
| `POST /warehouses/:id/restore` | `warehouse:restore` |

Fields: `branchId` (required), `managerId?`, `code` (1-50), `name` (3-255), `type?` (`MAIN`\|`RETAIL`\|`ONLINE`\|`RETURN`\|`DAMAGED`\|`TRANSIT`\|`CUSTOM`, default `MAIN`), `address?`, `phone?` (VN regex), `email?`, `description?`, `status?` (`ACTIVE`\|`INACTIVE`, no `ARCHIVED` — 2-value enum, matches Brand's pattern, not Category/Unit's 3-value one). Error codes: `WAREHOUSE_001` (not found), `WAREHOUSE_002` (duplicate code), `WAREHOUSE_003` (not deleted, restore target), `WAREHOUSE_004` (has stock/transactions, delete blocked). **No `version` field anywhere on Warehouse** — no Optimistic Lock on this entity (unlike Product/Category/Brand/Unit) — `PATCH` is a plain field update, no conflict handling needed.

### 3.3 Transfer

| Route | Permission | Transition |
|---|---|---|
| `POST /transfers` | `transfer:create` | → `PENDING` (schema default; `DRAFT` is declared but unreachable) |
| `GET /transfers` | `transfer:view` | search/paginate |
| `GET /transfers/:id` | `transfer:view` | |
| `PATCH /transfers/:id/approve` | `transfer:approve` | `PENDING → APPROVED` (deducts source warehouse now) |
| `PATCH /transfers/:id/receive` | `transfer:receive` | `APPROVED → RECEIVED` (adds to destination, using cost captured at Approve) |
| `PATCH /transfers/:id/cancel` | `transfer:cancel` | from `DRAFT`\|`PENDING`\|`APPROVED` → `CANCELLED` (reverses source deduction if already Approved) |

`CreateTransferDto`: `fromWarehouseId`, `toWarehouseId` (must differ — `TRANSFER_002` if equal), `note?`, `items: [{productId, quantity: positive}]` (min 1 — `TRANSFER_003` if empty). No `unitCost` at create — captured automatically from source `avgCost` at Approve time, stored on `TransferItem.unitCost`, used at Receive. **No `version` field** — status-guarded transitions, not Optimistic-Lock-guarded (a stale-status re-click gets `TRANSFER_004`, not a version conflict). Error codes: `TRANSFER_001` (not found), `TRANSFER_002` (same warehouse), `TRANSFER_003` (empty items), `TRANSFER_004` (invalid status transition), `TRANSFER_005` (duplicate code — system-generated, unlikely reachable by a user action), `TRANSFER_006` (negative stock not allowed at Approve), `TRANSFER_007` (409, real concurrency conflict from `InventoryDomainService`'s CAS).

### 3.4 Inventory Adjustment

| Route | Permission | Transition |
|---|---|---|
| `POST /inventory-adjustments` | `inventory:adjust` | → `DRAFT` |
| `GET /inventory-adjustments` | `inventory:view` | search/paginate |
| `GET /inventory-adjustments/:id` | `inventory:view` | |
| `PATCH /inventory-adjustments/:id/submit` | `inventory:adjust` | `DRAFT → SUBMITTED` |
| `PATCH /inventory-adjustments/:id/approve` | `inventory:approve` | `SUBMITTED → APPROVED` |
| `PATCH /inventory-adjustments/:id/complete` | `inventory:complete` | `APPROVED → COMPLETED` (generates real `InventoryMovement` rows now) |

`CreateInventoryAdjustmentDto`: `warehouseId`, `reason` (`LOST`\|`DAMAGED`\|`FOUND`\|`SYSTEM`\|`OTHER`, required), `note?`, `items: [{productId, quantity: signed delta, remark?}]` (min 1 — `INVENTORY_ADJUSTMENT_003`). **No `cancel` route exists** — once `SUBMITTED`, an adjustment can only move forward or stay stuck; this is a real, confirmed backend limitation, not something the frontend should paper over with an invented cancel button. No `version` field — status-guarded. Error codes: `INVENTORY_ADJUSTMENT_001` (not found), `_002` (duplicate code), `_003` (empty items), `_004` (invalid status transition), `_005` (item mismatch — N/A for this module's own DTOs, inherited shape), `_006` (negative stock not allowed at Complete), `_007` (409 concurrency conflict).

### 3.5 Stock Count

| Route | Permission | Transition |
|---|---|---|
| `POST /stock-count` | `stock_count:create` | → `DRAFT`, auto-captures `systemQty` from current Inventory for each `productId` submitted |
| `GET /stock-count` | `stock_count:view` | search/paginate |
| `GET /stock-count/:id` | `stock_count:view` | |
| `PATCH /stock-count/:id/start` | `stock_count:start` | `DRAFT → COUNTING` |
| `PATCH /stock-count/:id/complete` | `stock_count:complete` | `COUNTING → COMPLETED`, body carries `actualQty` per item; movement only generated for non-zero `difference` |

`CreateStockCountDto`: `warehouseId`, `note?`, `productIds: string[]` (min 1, unique — the system snapshots current `Inventory.quantity` as `systemQty` for each). `CompleteStockCountDto`: `items: [{itemId (StockCountItem.id, from GET :id), actualQty: number ≥0, remark?}]`. **No `cancel`/`submit`/`approve` routes** — despite `CANCELLED` being a declared status value, it is unreachable via any current endpoint; frontend must not invent one. No `version` field — status-guarded. Error codes: `STOCK_COUNT_001..006` (not found / duplicate / empty items / invalid transition / item mismatch / 409 concurrency conflict).

## 4. Concurrency model (all 5 modules)

**No client-supplied version field anywhere in this family** — a structurally different pattern from
Product/Category/Brand/Unit. Every write is either:
- a **status-guarded transition** (Transfer/Adjustment/StockCount's own `PATCH .../action` endpoints —
  a stale click against an already-transitioned document returns a 422 `*_INVALID_STATUS_TRANSITION`/
  `*_ITEM_MISMATCH`, not a 409), or
- an **inventory-level 409** (`TRANSFER_007`/`INVENTORY_ADJUSTMENT_007`/`STOCK_COUNT_INVENTORY_CONFLICT`/
  `PURCHASE_ORDER_INVENTORY_CONFLICT`/`CHECKOUT_INVENTORY_CONFLICT`) — this is `InventoryDomainService`'s
  own CAS-on-`quantity` conflict, surfaced through whichever module's transition triggered it.

Frontend handling: status-transition 422s are simple root/dialog alerts ("phiếu đã đổi trạng thái, vui
lòng tải lại") + a reload action (refetch the detail query) — there is no in-progress form state to
preserve the way Product's Optimistic Lock did, since these are one-click transitions, not multi-field
edits. Inventory-level 409s get the same reload treatment.

## 5. Read flows (Phase J)

- **Inventory List** (`/inventory`): search by `warehouseId`/`productId` (dropdowns — no free-text
  search endpoint exists on `InventoryQueryDto`, so no `SearchToolbar` text input for this one list;
  do not invent a client-side text filter that would misrepresent server-driven search). Columns:
  Product (name/SKU via lookup), Warehouse (name via lookup), Quantity, Reserved, Available, Avg Cost.
  Server pagination.
- **Inventory History** (`/inventory/history` or a tab within `/inventory`): filters `warehouseId?`,
  `productId?`, `movementType?`, `referenceType?`, date range. Columns: Product, Warehouse, Type,
  Reference, Quantity (signed, ±), Before→After, Cost, Remark, timestamp. Server pagination.
- **Warehouse List/Create/Edit/Archive/Restore**: exact mirror of the Category/Brand/Unit pattern —
  `status` is 2-value (`ACTIVE`\|`INACTIVE`, no `ARCHIVED`), so lifecycle uses `DELETE`/`restore`
  directly (soft-delete sets `deletedAt`, no separate `ARCHIVED` status value to filter by — matches
  Brand's own `archived?` boolean pattern more than Category/Unit's status-enum-fold pattern; confirmed
  from `WarehouseStatus` enum having only 2 values).
- **Transfer/Adjustment/StockCount Lists**: search/paginate by their own query DTOs (status/warehouse/
  code where supported), detail page shows items + current status + available actions gated by
  permission AND current status (e.g. Approve button only rendered when `status === 'PENDING'`).

## 6. Write flows (Phase K)

- **Transfer**: Create (from/to warehouse pickers, product+quantity line items) → List/Detail →
  Approve (`transfer:approve`, only when `PENDING`) → Receive (`transfer:receive`, only when
  `APPROVED`) → Cancel (`transfer:cancel`, only when `DRAFT`\|`PENDING`\|`APPROVED`). Each transition
  is its own `ConfirmDialog`-style confirmation (no request body beyond the ID) — mirrors the
  Archive/Restore lifecycle-dialog pattern exactly, just with more possible transitions.
- **Inventory Adjustment**: Create (warehouse picker, reason, product+signed-delta line items) → List/
  Detail → Submit (`inventory:adjust`, `DRAFT`) → Approve (`inventory:approve`, `SUBMITTED`) →
  Complete (`inventory:complete`, `APPROVED`). No Cancel action exists — do not add one.
  Complete's negative-stock rejection (`INVENTORY_ADJUSTMENT_006`) surfaces as a dialog alert.
- **Stock Count**: Create (warehouse picker, product multi-select) → List/Detail → Start
  (`stock_count:start`, `DRAFT`) → Complete (`stock_count:complete`, `COUNTING`) — Complete's own
  form is the one write flow in this family with real per-row data entry (`actualQty` per item,
  pre-populated with `systemQty` for reference, not as a default value to avoid silently re-submitting
  the system number as if counted).

Every mutation: real permission gate, `meta: { suppressGlobalErrorToast: true }`, duplicate-submit
prevention (disable while pending), focus retention on dialogs, correct cache invalidation (§8).

## 7. Product/Warehouse/Branch relation display

Same pattern already built for Product (T043 `useProductRelationOptions`): fetch the relevant list
endpoint (`useProductControllerSearch`/`useWarehouseControllerSearch`) once per page, build an
id→name lookup map, use it for List/History columns and for picker dropdowns in Create forms. No new
shared component — reuse the established technique, generalized into a small per-feature hook exactly
as Product's own hook was written.

## 8. Cache/query behavior (Phase M)

Exclusively generated query-key factories (`getInventoryControllerSearchQueryKey`,
`getInventoryControllerGetHistoryQueryKey`, `getWarehouseControllerSearchQueryKey`,
`getTransferControllerSearchQueryKey`/`FindOneQueryKey`, `getInventoryAdjustmentController*QueryKey`,
`getStockCountController*QueryKey`). After every write, invalidate: the owning module's own
search+detail keys, and (for Transfer/Adjustment/StockCount completions that actually move stock) the
Inventory search key too — **because the Inventory List reads live `quantity`/`availableQty`, and a
completed transition changes those rows**. This is proven by data ownership (§1's dependency graph),
not assumed: Transfer/Adjustment/StockCount's own completion endpoints call `InventoryDomainService`,
which writes the same `inventories` table `GET /inventory` reads. **Product queries do NOT need
invalidation** — Product's own read model (`ProductResponseDto`) has no `quantity`/stock field at all
(confirmed in T043 discovery: `minStock`/`maxStock` are static config, not the live ledger) — nothing
about a stock movement changes any Product API response.

## 9. Permissions (exact, no invention)

`inventory:view`, `inventory:adjust`, `inventory:approve`, `inventory:complete` · `warehouse:view/
create/update/delete/restore` · `transfer:view/create/approve/receive/cancel` · `stock_count:view/
create/start/complete`. Note: `inventory:transfer` exists in the catalog but is not required by any
current Transfer route — do not gate anything on it (would be gating on a permission the backend
itself never checks, giving a false sense of protection).

## 10. Accessibility

Same bar as Product: `vitest-axe` on every interactive surface, keyboard operation, focus retention
on dialogs, `aria-disabled` pending states, read-only fallbacks for view-only permission holders.

## 11. Out of scope for T044

- Purchase Order/Purchase Return/Sales Return frontend — separate future domains (Purchase/Sales),
  per the authorization's own phased ordering.
- Branch CRUD frontend — Branch already exists as its own backend module with no frontend, but is not
  named in T044's capability list; only consumed here as a read-only lookup for Warehouse's own
  `branchId` field (same picker technique, no Branch management UI built).
- Domain Events / Outbox publishing — explicitly deferred by ADR-0009/ADR-0011, no-op hook only.

# T045 — Purchase Domain Frontend Specification

Status: APPROVED FOR IMPLEMENTATION (AD-1 resolved by Architect, 2026-08-09)

## 1. Scope

Frontend implementation for the Purchase domain, backed entirely by the existing,
unmodified backend contract:

- **Purchase Order** — List, Create, Detail, lifecycle (Approve / Receive / Cancel)
- **Purchase Return** — List, Create (from a RECEIVED/COMPLETED Purchase Order), Detail,
  lifecycle (Approve / Complete / Cancel)
- **Supplier read integration** — a minimal picker/lookup only, powering the supplier
  field on Purchase Order Create and the supplier filter/name-resolution on Purchase
  Order and Purchase Return List/Detail
- **Product integration** — reuse of the existing `useProductOptions` picker/lookup
  (from `frontend/src/features/inventory/use-inventory-relations.ts`)
- **Warehouse integration** — reuse of the existing `useWarehouseOptions` picker/lookup
  (same file)
- **Branch integration** — reuse of the existing `useBranchOptions` picker/lookup
  (same file)
- **Inventory integration** — read-only awareness only; no new Inventory writes are
  introduced by this frontend (all stock effects already happen server-side via
  `InventoryDomainService`)

## 2. Explicit non-scope

Per AD-1, the following are **not** built in T045, regardless of a Purchase screen's
apparent need for them:

- Supplier List / Create / Edit / Activate / Deactivate / Archive / Restore /
  Import / Export — full Supplier management is its own future dedicated sprint
- Supplier Debt UI
- Supplier Payment UI
- Supplier Product UI
- Purchase Report UI
- A Supplier navigation entry (the picker needs no page of its own)
- A fix for the Supplier archived-visibility defect (§13 below) — deferred to the
  future Supplier sprint
- Sales / Checkout (explicitly out of scope per the sprint authorization)

## 3. Dependency graph

```
Supplier (read-only, existing GET /suppliers, GET /suppliers/:id)
   │
   ▼
Purchase Order ──(Create: branchId, supplierId, items[{productId, warehouseId, quantity, unitCost, discount, taxAmount}])
   │  DRAFT --approve--> APPROVED --receive--> RECEIVED   (also: DRAFT|PENDING|APPROVED --cancel--> CANCELLED)
   │  receive() ⇒ InventoryDomainService.increase() per item (Single Writer, same tx)
   │              + creates a Debt (PAYABLE) row per order (read-only side effect, not managed here)
   ▼
Purchase Return ──(Create: purchaseOrderId, reason, items[{purchaseItemId, quantity}])
   DRAFT --approve--> APPROVED --complete--> COMPLETED   (also: DRAFT|APPROVED --cancel--> CANCELLED)
   complete() ⇒ InventoryDomainService.decrease() per item (Single Writer, same tx)
                + creates a Debt (SETTLED) row (read-only side effect, not managed here)
```

Branch, Product, and Warehouse are read-only dependencies exactly as already
established in T044 (reused pickers, no new backend surface). `PENDING` and
`COMPLETED` are declared in `PurchaseOrderStatus` (Prisma enum) but are **unreachable**
via any controller endpoint — `create()` always yields `DRAFT`, and no transition ever
produces `PENDING`/`COMPLETED` — so, mirroring Transfer's DRAFT/SHIPPING precedent,
they are omitted from the frontend's status filter options.

## 4. Supplier boundary (AD-1)

**AD-1: Minimal Supplier read integration approved. Full Supplier management deferred
to its own dedicated future sprint.**

Implementation:

- `useSupplierOptions(statusFilter?: 'ACTIVE')` — new hook, `frontend/src/features/purchase/use-purchase-relations.ts`
  (co-located with Purchase's own relation hooks, not inside the `inventory` feature's
  relation file — Supplier is not an inventory-family concern)
  - Called with `'ACTIVE'` for the Purchase Order Create supplier picker (new orders
    should only be placed against currently-active suppliers — the backend does not
    itself enforce this, see §4.1, but it is the same convention already used for
    every other picker in this codebase: `useWarehouseOptions('ACTIVE')`,
    `useProductOptions()` with `status: 'ACTIVE'`)
  - Called with no filter (all statuses) for List/Detail id→name resolution, so a
    Purchase Order/Return referencing a supplier that has since become `INACTIVE`
    still resolves to a real name
- Uses `useSupplierControllerSearch` (existing generated hook) exclusively — no new
  backend endpoint, no direct `apiClient`/`fetch` calls
- Display field: `companyName` (mirrors `code`/`name` display convention used for
  every other picker)

### 4.1 Supplier selection eligibility (re-derived from source, not invented)

`PurchaseOrderService.create()` and `PrismaPurchaseOrderRepository.create()` perform
**no supplier-status check at all** — the only backend-enforced constraint is that
`supplierId` references an existing row (a Postgres FK constraint, surfaced as
`VALIDATION_FAILED` if violated). The backend does not define whether an `INACTIVE`
supplier may be selected for a new order.

This is not treated as a blocking ambiguity: restricting the Create picker to `ACTIVE`
suppliers is the same convention every other picker in this codebase already follows,
it does not contradict anything the backend enforces (the backend simply doesn't
enforce a narrower rule than what the frontend chooses to offer), and it is easily
revisited later without any backend change if that assumption turns out to be wrong.

### 4.2 Archived suppliers referenced by existing records

Per the known defect (§13), an `ARCHIVED` supplier is unreachable via **both**
`GET /suppliers` and `GET /suppliers/:id` (both hardcode `deletedAt: null`). If a
Purchase Order/Return references a supplier that has since been archived, the id→name
lookup map will simply miss for that id. This is handled with the same honest fallback
already used everywhere in this codebase for a lookup miss — `supplierNameById.get(id)
?? id` — displaying the raw id rather than fabricating a name. This is a direct,
disclosed consequence of the pre-existing backend defect, not a new frontend decision.

## 5. Purchase Order state machine

| From | Action | To | Permission | Inventory effect | Error codes |
|---|---|---|---|---|---|
| — | `create` | DRAFT | `purchase:create` | none | `PURCHASE_ORDER_002` (duplicate code — server-generated, not user-facing) |
| DRAFT | `approve` | APPROVED | `purchase:approve` | none | `PURCHASE_ORDER_003` (invalid transition) |
| APPROVED | `receive` | RECEIVED | `purchase:receive` | `InventoryDomainService.increase()` per item, same tx | `PURCHASE_ORDER_003`, `PURCHASE_ORDER_004` (inventory CAS conflict) |
| DRAFT/PENDING*/APPROVED | `cancel` | CANCELLED | `purchase:cancel` | none | `PURCHASE_ORDER_003` |

\* PENDING is unreachable in practice (§3) but remains in the guard's expected-status
list server-side; irrelevant to the frontend since no UI path ever produces PENDING.

No update/edit endpoint exists for Purchase Order — Create is write-once; the only
subsequent mutations are the three lifecycle transitions above. **No frontend Edit
screen is built.**

## 6. Receiving semantics (re-derived, Phase F)

- Receiving is **part of Purchase Order** (Option A) — there is no separate Goods
  Receipt domain/module.
- **Single-shot, whole-order receive** — `receive()` receives every item's full
  ordered `quantity` in one transaction (`receivedQuantity: item.quantity`). There is
  **no partial receiving** and **no multiple receipts** per order.
- Because it's single-shot and status-guarded (APPROVED → RECEIVED only), `receive()`
  is naturally idempotent from the frontend's perspective — a duplicate click after
  the first succeeds gets a 422 `PURCHASE_ORDER_003`, not a second stock increase.
- Warehouse is **selectable per line item** (`CreatePurchaseItemDto.warehouseId`), not
  fixed at the order level.
- Quantities are decimal-capable (`Prisma.Decimal` server-side, `number` on the DTO).
- Cost is captured per line (`unitCost`, `discount`, `taxAmount` → `totalAmount`).
- **No lot/batch/expiry tracking** exists anywhere in this flow.
- Receiving does **not** change `Product.costPrice` — only `Inventory.avgCost` is
  affected, internally, via `InventoryDomainService.increase()`.
- Receiving changes inventory **immediately**, synchronously, in the same transaction
  as the RECEIVED status write.
- **Cancellation after receiving is not allowed** — `cancel()`'s expected-status guard
  is `['DRAFT', 'PENDING', 'APPROVED']`; RECEIVED is a terminal state with respect to
  cancellation (Purchase Return exists precisely to unwind a received order).
- Receiving additionally creates one `Debt` row (`PAYABLE`, `refType: 'PurchaseOrder'`)
  in the same transaction — a read-only side effect surfaced nowhere in this PR's UI
  (Supplier Debt UI is explicit non-scope, §2), but worth knowing when reading the
  backend's own transaction boundary.

## 7. Purchase Return state machine

| From | Action | To | Permission | Inventory effect | Error codes |
|---|---|---|---|---|---|
| — | `create` | DRAFT | `purchase_return:create` | none | `PURCHASE_RETURN_004` (order not RECEIVED/COMPLETED), `PURCHASE_RETURN_005` (item not in order), `PURCHASE_RETURN_006` (exceeds received), `PURCHASE_RETURN_008` (empty items — client already enforces `ArrayMinSize(1)`) |
| DRAFT | `approve` | APPROVED | `purchase_return:approve` | none | `PURCHASE_RETURN_003` (invalid transition) |
| APPROVED | `complete` | COMPLETED | `purchase_return:complete` | `InventoryDomainService.decrease()` per item, same tx | `PURCHASE_RETURN_003`, `PURCHASE_RETURN_007` (negative stock not allowed), `PURCHASE_RETURN_009` (inventory CAS conflict) |
| DRAFT/APPROVED | `cancel` | CANCELLED | `purchase_return:cancel` | none | `PURCHASE_RETURN_003` |

Purchase Return is **not** a trivial inverse of Purchase Order:

- It is created **against** an existing Purchase Order (`purchaseOrderId` required),
  only allowed when that order's status is `RECEIVED` or `COMPLETED`
  (`RETURNABLE_ORDER_STATUSES`) — a return cannot exist for an order that was never
  received.
- Each return line references a `purchaseItemId` (the original order's line item),
  **not** a raw `productId`/`warehouseId` — `productId`, `warehouseId`, and `unitCost`
  are all resolved server-side from the referenced purchase item and are not sent by
  the client.
- The server enforces, per line, that cumulative returned quantity (across all
  non-cancelled returns against that purchase item) never exceeds the item's
  `receivedQuantity` (`PurchaseReturnExceedsReceivedError` → `PURCHASE_RETURN_006`).
  This is **not** pre-validated client-side: the "already returned" quantity isn't
  available from any data the frontend already has without an extra per-line query,
  so the frontend relies on the server's authoritative real-time check and surfaces
  `PURCHASE_RETURN_006`'s message directly. The only client-side validation is
  `quantity > 0` and `quantity` not exceeding the *original order-line* quantity
  shown in the picker (a cheap sanity bound, not a substitute for the server check).
- `reason` is a required enum (`DAMAGED | WRONG_PRODUCT | EXPIRED | OTHER`).
- No refund/accounting fields are exposed on the DTO beyond the same `Debt` side
  effect pattern as Purchase Order (a `SETTLED`-type debt row created on `complete()`
  — read-only, out of scope UI-wise).

## 8. Product integration

Reused as-is via `useProductOptions()` (`frontend/src/features/inventory/use-inventory-relations.ts`).
No changes to that hook. Display format: `"{name} ({sku})"`, matching every existing
usage (Transfer/Adjustment/StockCount).

## 9. Warehouse integration

Reused as-is via `useWarehouseOptions('ACTIVE')` for pickers and `useWarehouseOptions()`
for List/Detail name resolution — same convention as Product/Supplier above. No
changes to that hook.

## 10. Inventory integration

Read-only from this frontend's perspective. No inventory list/history screen changes.
No direct inventory mutation is ever issued by Purchase Order/Return frontend code —
all stock effects are entirely server-side, inside `InventoryDomainService`, triggered
by `receive`/`complete`. The frontend's only responsibility is correct cache
invalidation so that, if a user separately has the Inventory List/History screens
open, they naturally refetch (§16) — not to duplicate or predict the resulting
quantities client-side.

## 11. Permissions

| Code | Group | Purpose |
|---|---|---|
| `purchase:view` / `purchase:create` / `purchase:approve` / `purchase:receive` / `purchase:cancel` | `purchase` | Purchase Order |
| `purchase_return:view` / `purchase_return:create` / `purchase_return:approve` / `purchase_return:complete` / `purchase_return:cancel` | `purchase_return` | Purchase Return |
| `supplier:view` | `supplier` | Read-only — powers the picker/lookup only; no other supplier permission is referenced by this PR |

## 12. Error mapping

No error code in either module maps naturally to a specific form field (unlike, e.g.,
Warehouse's `WAREHOUSE_002` → `code` field, or Transfer's `TRANSFER_002` →
`toWarehouseId`) — `PURCHASE_ORDER_002`/`PURCHASE_RETURN_002` (duplicate code) are
server-generated-code collisions, not user input errors, so they fall through to
`form.setServerError` like any other generic backend error. All lifecycle-transition
errors (`*_003` invalid status transition, `*_004`/`*_006`/`*_007`/`*_009` business/
inventory conflicts) render in the action confirm dialog's in-dialog error slot,
identical to the Transfer/Adjustment/StockCount pattern from T044 — the dialog stays
open, shows the backend's message, and does not fire a duplicate global toast
(`meta: { suppressGlobalErrorToast: true }` on every mutation).

## 13. Known defect — Supplier archived-visibility (documented, not fixed)

`PrismaSupplierRepository.buildWhere()` (and `findOne()`) hardcode `deletedAt: null`
unconditionally, exactly like Category/Unit/Warehouse before their own
T038.05/T042/T044.05 fixes. `GET /suppliers?status=ARCHIVED` always returns empty;
`GET /suppliers/:id` for an archived supplier 404s. Supplier Restore
(`POST /suppliers/:id/restore`, `supplier:restore` permission) is fully implemented
server-side but **permanently unreachable** via any list/search query today.

**Not fixed in T045** (AD-1 explicit instruction — Purchase only needs normal
discoverable suppliers). Expected future treatment: a dedicated future Supplier
sprint, whose own discovery will likely include a small archived-visibility backend
prerequisite (mirroring T038.05/T042/T044.05) ahead of the full Supplier frontend
build. No sprint number is assigned here, per instruction.

## 14. Concurrency

Neither Purchase Order nor Purchase Return has a client-supplied `version` field
anywhere (no Optimistic Lock pattern, same as Transfer/Adjustment/StockCount) — every
lifecycle transition is a one-click, ID-only status transition, guarded by re-reading
current status inside the transaction. A stale click after someone else already
transitioned the record gets a 422 (`*_003`), surfaced in the still-open confirm
dialog exactly as in T044 — not a 409. Genuine 409-shaped conflicts
(`PURCHASE_ORDER_004`, `PURCHASE_RETURN_009`) come from `InventoryDomainService`'s own
CAS conflict on the underlying `Inventory` row, surfaced through whichever action
triggered it (`receive`/`complete`).

## 15. Cache / query behavior

Using only generated query-key factories (`getPurchaseOrderControllerSearchQueryKey`,
`getPurchaseOrderControllerFindOneQueryKey`, and the Purchase Return equivalents) —
no manual query-key arrays.

| Mutation | Invalidates |
|---|---|
| Purchase Order create | Purchase Order search |
| Purchase Order approve/receive/cancel | Purchase Order search + that order's findOne |
| Purchase Return create | Purchase Return search |
| Purchase Return approve/complete/cancel | Purchase Return search + that return's findOne |

No Inventory/Warehouse/Product/Supplier query is invalidated by any Purchase
mutation — those domains are read-only inputs here, and Purchase does not own their
cache. (If a user has the Inventory screens open concurrently, they are not
auto-refreshed by a Purchase receive — same behavior already accepted for
Transfer/Adjustment/StockCount's own effect on Inventory in T044.)

## 16. Accessibility

Same bar as T044: `vitest-axe` on every component test, `aria-label` on every filter
control, `ConfirmDialog`'s existing focus-retention-on-error behavior reused as-is,
`aria-invalid` on every validated field, honest empty/error states with a working
retry, ID→name resolution everywhere a relation is displayed (never a raw UUID where
a picker/lookup can resolve it).

## 17. Test strategy

Mirrors T044's per-component test file pattern (MSW + real generated hooks, no
hook-level mocking): List (permission-gating, filters, empty/error states, a11y),
Create (required-field validation, payload shape, server-error mapping, a11y), Detail
(status-conditional actions, stale-click 4xx handling, a11y). Purchase Return's Create
additionally needs a test proving the purchase-order/purchase-item picker resolves
`productId`/`warehouseId`/`unitCost` for display without sending them in the request
body.

## 18. Rollback strategy

Standard: `git revert --no-commit <squash SHA>` dry-run before declaring the sprint
closed, identical to every prior T04x sprint this session. No backend/schema/migration
changes exist in this PR, so rollback is a pure frontend revert with no data
implications.

## 19. Publication strategy

`feature/T045-purchase-domain` branch off `main` (`e1f5c9a4...`), squash-merge via PR,
identical publication/CI/merge/post-merge process already used for T043/T044.

## 20. Known debt (carried, not introduced by T045)

- Supplier archived-visibility defect (§13) — pre-existing, disclosed, deferred.
- Full Supplier/Supplier-Debt/Supplier-Payment/Supplier-Product/Purchase-Report
  frontends remain unbuilt (§2) — pre-existing, explicit non-scope.
- `PENDING`/`COMPLETED` unreachable `PurchaseOrderStatus` enum values (§3) — a
  backend enum superset of what any endpoint can actually produce; not a frontend
  defect, same shape as Transfer's DRAFT/SHIPPING and Stock Count's CANCELLED.

## 21. Architect Decisions

**AD-1** — Supplier dependency boundary. **RESOLVED.** Option A (minimal read
integration) approved; Option B (absorb full Supplier module) and Option C (block
Purchase on a full Supplier sprint) rejected. See §4.

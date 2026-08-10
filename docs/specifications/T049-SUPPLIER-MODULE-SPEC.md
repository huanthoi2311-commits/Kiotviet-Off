# T049 — Supplier Module Specification

Status: derived entirely from current backend source (`main@97eff57`, after T049.05). No new backend contract required. AD-1 (Import/Export boundary) and AD-2 (Supplier Debt ownership) resolved — see §8/§9.

## 1. Scope

Supplier frontend domain over the existing, complete backend contract: List (search/filter/sort/paginate, including archived visibility per T049.05), Create, Detail/Edit (Optimistic Lock), full lifecycle (Activate/Deactivate/Archive/Restore), Excel Export (one approved binary-download exception), Supplier-Product mapping (embedded, reuses Supplier's own permissions), and a read-only Supplier Debt summary section.

## 2. Non-scope

Supplier Excel Import (deferred, AD-1), Supplier Payment mutation (deferred, AD-2), Purchase Order/Return redesign, accounting ledger redesign, generic procurement CRM, new backend APIs, new financial workflows.

## 3. Backend contract

`SupplierController` (`/suppliers`), all permission-gated:

| Method | Route | Permission | Body/Query | Notes |
|---|---|---|---|---|
| POST | `/suppliers` | `supplier:create` | `CreateSupplierDto` | `code` optional (auto-generates `NCCxxxxxx`); `status` always `ACTIVE`, ignored if sent |
| GET | `/suppliers` | `supplier:view` | `SupplierQueryDto` | search/status/province/paginate/sort; `status=ARCHIVED` now reachable (T049.05) |
| GET | `/suppliers/:id` | `supplier:view` | — | 404 if not found or archived |
| PATCH | `/suppliers/:id` | `supplier:update` | `UpdateSupplierDto` (requires `version`) | no `code`/`status` — both immutable via this route |
| POST | `/suppliers/:id/activate` | `supplier:activate` | `SupplierVersionDto` | INACTIVE→ACTIVE only |
| POST | `/suppliers/:id/deactivate` | `supplier:deactivate` | `SupplierVersionDto` | ACTIVE→INACTIVE only |
| DELETE | `/suppliers/:id` | `supplier:delete` | `SupplierVersionDto` | Archive; **real guard**: blocks (422, `SUPPLIER_004`) if `hasPurchaseOrders()` |
| POST | `/suppliers/:id/restore` | `supplier:restore` | `SupplierVersionDto` | always restores to `INACTIVE` |
| GET | `/suppliers/export` | `supplier:export` | `SupplierQueryDto` (same filters as List) | binary `.xlsx`, see §8 |
| GET | `/suppliers/:supplierId/products` | `supplier:view` | — | Supplier-Product list |
| POST | `/suppliers/:supplierId/products` | `supplier:update` | `UpsertSupplierProductDto` | assign/update mapping |
| DELETE | `/suppliers/:supplierId/products/:productId` | `supplier:update` | — | unassign |

Not in T049 scope (AD-1/AD-2): `POST /suppliers/import`, `GET /supplier-debt`, `POST /supplier-payment` — the last read-only endpoint IS in scope (§9), the create endpoint is not.

## 4. Supplier fields

Derived field-by-field from `CreateSupplierDto`/`UpdateSupplierDto`:

| Field | Create | Edit | Required | Constraints |
|---|---|---|---|---|
| `code` | optional | **absent (immutable)** | — | 1–50 chars, unique in Organization if provided; auto-generates `NCCxxxxxx` if omitted |
| `taxCode` | optional | optional | — | string |
| `companyName` | required | optional | yes (Create) | 2–255 chars |
| `contactName` | optional | optional | — | string |
| `phone` | optional | optional | — | string |
| `email` | optional | optional | — | valid email |
| `website` | optional | optional | — | valid URL |
| `address`/`province`/`district`/`ward` | optional | optional | — | string |
| `bankName`/`bankAccount` | optional | optional | — | string |
| `paymentTerm` | optional | optional | — | integer ≥ 0 (days) |
| `creditLimit` | optional | optional | — | number ≥ 0 |
| `note` | optional | optional | — | string |
| `status` (Import-only field on the shared DTO) | **ignored on regular Create** | **absent on Update** | — | never client-settable via T049's own UI |
| `version` | — | **required** | yes (Edit) | Optimistic Lock |

Response-only: `id`, `status`, `version`, `createdAt`, `updatedAt`, `deletedAt`. Unlike Customer, Supplier has **no dead/deprecated financial fields** on its own entity — debt lives entirely in the separate read-only aggregate (§9).

## 5. Lifecycle

State: `ACTIVE | INACTIVE | ARCHIVED` (+ `deletedAt` set together with `ARCHIVED`).

| From | Action | To | Permission | Version required | Error codes |
|---|---|---|---|---|---|
| INACTIVE | Activate | ACTIVE | `supplier:activate` | yes | `SUPPLIER_INVALID_TRANSITION`-equivalent (via changeStatusWithVersion guard), `SUPPLIER_009` |
| ACTIVE | Deactivate | INACTIVE | `supplier:deactivate` | yes | same |
| ACTIVE/INACTIVE | Archive | ARCHIVED | `supplier:delete` | yes | **`SUPPLIER_004`** (has Purchase Orders — real, enforced guard, unlike Customer's disclosed no-guard debt), `SUPPLIER_009` |
| ARCHIVED | Restore | **INACTIVE (always)** | `supplier:restore` | yes | `SUPPLIER_003` (not deleted, defensive), `SUPPLIER_009` |

## 6. Archived visibility

Fixed by T049.05 (merged, `97eff57`): `GET /suppliers?status=ARCHIVED` correctly returns archived rows (`deletedAt: {not: null}`); omitted/ACTIVE/INACTIVE unaffected. **Both** List and Export share the same `buildWhere()`, so this fix covers both surfaces identically (§8). `GET /suppliers/:id` intentionally still excludes archived rows (discovery only through the list filter, matching Category/Customer precedent).

## 7. Optimistic Lock

All 5 writes (Update, Activate, Deactivate, Archive, Restore) require `version`, share `SUPPLIER_009` (409) as the conflict code. Frontend pattern: identical to Customer's (T048) — top-level "Tải lại" alert on lifecycle-action conflicts (dialog closes, delegates via `onVersionConflict`); Edit preserves in-progress edits until explicit reload (RHF `values`-option re-sync pattern).

**Supplier-Product mapping has no version field** — plain upsert/remove, no Optimistic Lock concept (matches its simple CRUD-relationship nature).

## 8. Import/Export boundary (Architect Decision AD-1 — RESOLVED)

**Export: IN SCOPE. Import: DEFERRED.**

- **Export** (`GET /suppliers/export`): respects the exact same `SupplierQueryDto` filters as List. Returns raw `.xlsx` binary with no OpenAPI response schema (`@Res()`+`res.send(buffer)` bypasses the standard envelope) — the generated Orval hook (`useSupplierControllerExport`) is typed `void` and non-functional for real download, since `apiClientMutator` unconditionally assumes a JSON envelope and unwraps `response.data.data`.
- **Approved exception**: one narrowly-scoped Supplier-Export-specific download utility using the existing configured `apiClient` axios instance directly, `responseType: 'blob'`, for exactly `GET /suppliers/export` — same architectural class as T046's Checkout Idempotency-Key exception (evidence-based, single-endpoint, no Orval/global-client changes). Object URL created for browser download, revoked after use. Filename: `suppliers.xlsx` (backend's static `Content-Disposition`, no dynamic derivation needed).
- After T049.05, `status=ARCHIVED` export correctly includes archived suppliers (shares `buildWhere()` with List); default/ACTIVE/INACTIVE exports correctly exclude them.
- **Import** (`POST /suppliers/import`): **not built**. Real correctness gap discovered: `importBatch()` upserts by `code`, and its update branch is a bare `tx.supplier.update()` with **no version check, no version increment** — a genuine Optimistic Lock bypass. It can also silently flip an existing supplier's `status` (ACTIVE↔INACTIVE) via the Excel "Trạng thái" column. No UI (button, dialog, file picker, result/row-error screen) is built for this. The backend endpoint remains untouched and unexposed. Recorded as future Supplier Import scope, not assigned a T-number.

## 9. Supplier Debt boundary (Architect Decision AD-2 — RESOLVED)

**Read-only summary only. Payment mutation deferred.**

- `SupplierDebt` is a derived aggregate (not a stored row): `balance = SUM(Debt, type=PAYABLE) − SUM(Payment, direction=OUT)`, computed transactionally on read.
- **Approved UI**: Supplier Detail displays `totalDebt`/`totalPaid`/`balance` from `GET /supplier-debt?supplierId=X`, using backend-computed values directly — no client-side recomputation, no scanning Purchase Orders/Payments.
- **Permission independence**: gated by `debt:view`, independent of `supplier:view` — hidden (not an error) when absent, matching Customer Point's established section-level gating pattern.
- **`POST /supplier-payment`: not exposed.** No "Ghi nhận thanh toán" button, dialog, amount/method/PO-attribution inputs, receipt workflow, or payment-history screen. Real server guard exists (rejects if amount exceeds current balance), but the operation raises its own AP-scope questions (payment method UX, PO attribution, receipts, history discoverability) deliberately left to a future scope, same discipline as Customer Point (T048 AD-1).
- **Known backend debt (recorded, not fixed here)**: `createPayment()` recomputes balance transactionally but takes no pessimistic row lock — a theoretical race where two concurrent payments could each pass the exceeds-balance guard. Not applicable to T049's own scope since Payment mutation isn't exposed, but documented for the future AP scope.
- **No payment history endpoint exists** — only the aggregate `GET /supplier-debt`. Not fabricated client-side.
- Purchase Order receive and Purchase Return already write `Debt` ledger entries automatically (positive/negative respectively) as their own domain's side effect — T049 does not duplicate or touch this.
- **Cache**: Supplier mutations (Edit/Activate/Deactivate/Archive/Restore) do **not** invalidate the Debt query — they don't change debt. Debt-changing Purchase flows own their own staleness.

## 10. Supplier Product boundary (resolved without Architect Decision — see conversation record)

Genuine required Supplier sub-domain (Classification A), embedded directly in Supplier Detail/Edit. Reuses Supplier's own permissions (`supplier:view` for list, `supplier:update` for upsert/remove) — no separate namespace exists in the backend's own permission design. Fields: `productId` (required, resolved to a product name via the existing Product search/options pattern), `supplierSku`, `priority` (lower = more preferred), `defaultPrice`, `leadTime`, `minimumOrderQuantity` (all optional). No Optimistic Lock (plain upsert/remove). Errors: `SUPPLIER_007` (not found), `SUPPLIER_008` (duplicate).

## 11. Purchase integration

`use-purchase-relations.ts`'s existing Supplier picker is reused unchanged. Purchase Order/Return write their own `Debt` ledger entries independently of any Supplier route. T049 makes zero changes to `purchase-order`/`purchase-return` frontend or backend files — verified as an explicit regression suite (Phase X).

## 12. Permissions

Exact catalog (`crud('supplier', 'nhà cung cấp', ['restore','import','export','activate','deactivate'])`): `supplier:view`, `supplier:create`, `supplier:update`, `supplier:delete`, `supplier:restore`, `supplier:import` (unused — Import deferred), `supplier:export`, `supplier:activate`, `supplier:deactivate` — 9 total, all verified against the catalog. Plus `debt:view` for the read-only Debt section (§9). `payment:create` and `supplier:import` are confirmed **absent** from the T049 frontend diff.

## 13. Error handling

| Code | HTTP | Reachable from | UI treatment |
|---|---|---|---|
| `SUPPLIER_001` (not found) | 404 | findOne/update/activate/deactivate/remove/restore | Detail not-found `EmptyState` |
| `SUPPLIER_002` (duplicate code) | 409 | Create | Create form root-level alert |
| `SUPPLIER_003` (not deleted) | 422 | Restore (defensive) | Lifecycle dialog in-context alert |
| `SUPPLIER_004` (has Purchase Orders) | 422 | Archive | Lifecycle dialog in-context alert — real, expected guard |
| `SUPPLIER_007` (product not found) | — | Supplier-Product upsert/remove | In-context alert in the product mapping section |
| `SUPPLIER_008` (product duplicate) | 409 | Supplier-Product upsert | In-context alert |
| `SUPPLIER_009` (version conflict) | 409 | Update/Activate/Deactivate/Archive/Restore | Top-level "Tải lại" alert |

Not reachable in T049's scope: `SUPPLIER_005`/`SUPPLIER_006` (Import-only, deferred), `SUPPLIER_PAYMENT_EXCEEDS_BALANCE` (Payment mutation deferred). All mutations use `suppressGlobalErrorToast` — no duplicate toasts.

## 14. Cache/query strategy

Generated query-key factories only. Supplier mutations invalidate Supplier search + detail (+ Supplier-Product list on mapping changes). Debt query is never invalidated by Supplier CRUD mutations (§9). Export is a one-off blob download, not a cached query.

## 15. Accessibility

`vitest-axe` on List/Create/Edit/lifecycle dialogs/Export control/Product-mapping section; keyboard operability; accessible file-download button semantics (pending/aria-disabled state, matching `ConfirmDialog`'s established pattern).

## 16. Tests

Per Phase Z1: List/Create/Edit/Lifecycle/Archived-visibility/Optimistic-Lock (mirroring Customer's own matrix), Export (permission gating, filter forwarding including `status=ARCHIVED`, blob responseType, download/filename/object-URL-revocation, duplicate-click protection, confirmed NOT going through `apiClientMutator`), Supplier-Debt read-only section (permission gating, values-as-returned), Supplier-Product mapping (list/assign/unassign), permissions, errors, cache, accessibility, and full regression (Purchase Order/Return, Inventory, Product, Warehouse, Checkout, Customer, Sales Return, Category, Brand, Unit, auth/session).

## 17. Backend prerequisites

T049.05 (archived visibility + export fix) — already merged (`97eff57`) before this spec was finalized. No further backend changes required for T049.

## 18. Rollback

Standard: revert the squash-merge commit; frontend-only change, no schema/migration involved.

## 19. Debt

- Archive has a real guard (`hasPurchaseOrders`) — no gap here (unlike Customer).
- Import deferred: Optimistic Lock bypass + silent status mutation via upsert-by-code (§8).
- Payment mutation deferred: no pessimistic lock on concurrent payment creation (§9), no payment-history endpoint.
- No product-name snapshot on `SupplierProductResponseDto` — resolved via lookup, not a backend gap requiring a fix.

## 20. Architect Decisions

- **AD-1 (Import/Export Boundary)** — APPROVED, Option B: Export in scope with one approved binary-download exception; Import deferred due to a real Optimistic Lock bypass and silent status-mutation risk. Recorded in full above (§8) and in conversation history.
- **AD-2 (Supplier Debt Ownership)** — APPROVED, Option A: read-only balance summary only; Payment mutation deferred to a future Accounts Payable scope. Recorded in full above (§9) and in conversation history.
- Supplier Product boundary resolved without requiring a fresh Architect Decision — converging source evidence (shared permissions, Supplier-owned route, explicit FR documentation, no financial/concurrency complexity) pointed to exactly one reasonable interpretation (§10).

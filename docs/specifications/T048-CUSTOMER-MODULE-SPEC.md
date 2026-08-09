# T048 — Customer Module Specification

Status: derived entirely from current backend source (`main@06d2c6d`, after T048.05). No new backend contract required. AD-1 (Customer Point ownership) resolved — see §8.

## 1. Scope

Customer frontend domain over the existing, complete backend contract: List (search/filter/sort/paginate, including archived visibility per T048.05), Create, Detail, Edit (Optimistic Lock), full lifecycle (Activate/Deactivate/Archive/Restore), and a read-only Customer Point section (balance + history) embedded in Detail.

## 2. Non-scope

Supplier, Supplier Debt, Supplier Payment, Supplier Product, Purchase Report, Sales Return changes, Checkout redesign, Invoice redesign (one small additive change only — see §9), generic CRM features, campaigns, marketing automation, invented segmentation, new backend APIs. Customer Point mutation (Add/Use), manual point adjustment, loyalty admin UI — all explicitly deferred by Architect Decision AD-1 (§8).

## 3. Backend contract

`CustomerController` (`/customers`), all permission-gated (`JwtAuthGuard`, `PermissionsGuard`):

| Method | Route | Permission | Body | Notes |
|---|---|---|---|---|
| POST | `/customers` | `customer:create` | `CreateCustomerDto` | `code` optional (auto-generates `CUSxxxxxx` if omitted); `status` always `ACTIVE`, not client-settable |
| GET | `/customers` | `customer:view` | query: `CustomerQueryDto` | search/filter/paginate/sort; `status=ARCHIVED` now reachable (T048.05) |
| GET | `/customers/:id` | `customer:view` | — | 404 if not found or archived (`deletedAt` filtered) |
| PATCH | `/customers/:id` | `customer:update` | `UpdateCustomerDto` (requires `version`) | no `code`/`status` fields — both immutable via this route |
| POST | `/customers/:id/activate` | `customer:activate` | `CustomerVersionDto` | INACTIVE→ACTIVE only |
| POST | `/customers/:id/deactivate` | `customer:deactivate` | `CustomerVersionDto` | ACTIVE→INACTIVE only |
| DELETE | `/customers/:id` | `customer:delete` | `CustomerVersionDto` | Archive (soft delete), 204, sets `status=ARCHIVED`+`deletedAt` together |
| POST | `/customers/:id/restore` | `customer:restore` | `CustomerVersionDto` | always restores to `INACTIVE`, never auto-`ACTIVE` |

Read-only, consumed for §8: `GET /customer-point/history?customerId=` (`point:view`).

## 4. Customer fields

Derived from `CreateCustomerDto`/`UpdateCustomerDto` exactly (both verified field-by-field):

| Field | Create | Edit | Required | Constraints |
|---|---|---|---|---|
| `code` | optional | **absent (immutable, BR03)** | — | 1–50 chars, unique in Organization if provided; auto-generated `CUSxxxxxx` if omitted |
| `customerType` | optional, default `RETAIL` | optional | — | enum `RETAIL\|WHOLESALE\|VIP\|DEALER\|COMPANY` |
| `fullName` | required | optional | yes (Create) | 2–255 chars |
| `phone` | optional | optional | — | 8–20 chars; **not unique** (Decision CR06/SR09 — multiple customers may share a phone) |
| `email` | optional | optional | — | valid email format |
| `birthday` | optional | optional | — | ISO date string |
| `gender` | optional | optional | — | enum `MALE\|FEMALE\|OTHER` |
| `taxCode` | optional | optional | — | string |
| `companyName` | optional | optional | — | string |
| `contactName` | optional | optional | — | string |
| `address`/`province`/`district`/`ward` | optional | optional | — | string |
| `avatar` | optional | optional | — | string (URL) |
| `note` | optional | optional | — | string |
| `creditLimit` | optional | optional | — | number ≥ 0 |
| `paymentTermDays` | optional | optional | — | integer ≥ 0 ("chỉ lưu thông tin, chưa tự tính hạn" — display/store only, no computed enforcement) |
| `version` | — | **required** | yes (Edit) | Optimistic Lock |

Response-only fields (never in Create/Update input): `id`, `status`, `version`, `createdAt`, `updatedAt`, `deletedAt`, `totalPoint` (system-projection, synced from Customer Point ledger — read-only display only, §8). `currentDebt`/`totalRevenue`/`totalOrder` are also response-only but **must not be displayed as real data** — see §10.

## 5. Lifecycle

State: `ACTIVE | INACTIVE | ARCHIVED` (+ `deletedAt` set together with `ARCHIVED`).

| From | Action | To | Permission | Version required | Error codes |
|---|---|---|---|---|---|
| INACTIVE | Activate | ACTIVE | `customer:activate` | yes | `CUSTOMER_INVALID_TRANSITION` (wrong current status), `CUSTOMER_VERSION_CONFLICT` |
| ACTIVE | Deactivate | INACTIVE | `customer:deactivate` | yes | same as above |
| ACTIVE/INACTIVE | Archive | ARCHIVED | `customer:delete` | yes | `CUSTOMER_VERSION_CONFLICT` |
| ARCHIVED | Restore | **INACTIVE (always, never auto-ACTIVE)** | `customer:restore` | yes | `CUSTOMER_NOT_DELETED` (defensive — not normally reachable via UI), `CUSTOMER_VERSION_CONFLICT` |

Archive has **no real business guard** in the current backend (T011 note: "BR07 — không implement Guard thật, chưa có Sales/Debt Ledger") — any customer can be archived regardless of outstanding invoices/debt. Recorded as known, pre-existing backend debt (§16), not something T048 fixes or fakes a guard for.

## 6. Archived discoverability

Fixed by T048.05 (merged, `06d2c6d`): `GET /customers?status=ARCHIVED` correctly returns archived rows (`deletedAt: {not: null}`); omitted/ACTIVE/INACTIVE unaffected (`deletedAt: null`). List must expose a status filter including `ARCHIVED` so Restore has a real discovery path. `GET /customers/:id` intentionally still excludes archived rows (by design, matching Category's precedent) — archived customers are only reachable through the list filter, not direct-by-id navigation.

## 7. Optimistic Lock

All 5 writes (Update, Activate, Deactivate, Archive, Restore) require `version` and share one conflict code, `CUSTOMER_VERSION_CONFLICT` (HTTP 409). Frontend pattern — identical to Brand/Category's established convention:
- **Edit**: on conflict, show the top-level "Tải lại" alert (do not reset the form) — RHF's `values`-option sync means in-progress edits are naturally preserved until the user explicitly clicks "Tải lại", at which point the form re-syncs to fresh server data.
- **Lifecycle actions** (Activate/Deactivate/Archive/Restore): action dialog closes itself, delegates to parent via `onVersionConflict(message)`, which shows the same top-level alert on Detail.

`CUSTOMER_INVALID_TRANSITION` (422, stale-click race on Activate/Deactivate) is a separate, in-dialog alert — not a version conflict.

## 8. Customer Point boundary (Architect Decision AD-1 — RESOLVED)

**Customer Point in T048: READ-ONLY BALANCE + HISTORY.**

- **Balance**: use `Customer.totalPoint` exactly as returned by the Customer response (`GET /customers/:id`). Do not recompute client-side.
- **History**: `GET /customer-point/history?customerId=`, gated by `point:view` independently of `customer:view`. Display backend-provided fields as-is: signed `point` delta, resulting `balance`, `referenceType`, `referenceId`, `expiredAt`, `createdAt`. Paginated per the endpoint's own contract.
- **Permission independence**: `customer:view` grants Customer Detail rendering; `point:view` gates only the history section (hidden/unavailable if absent — via `usePermission('point:view')`, the established section-level gating pattern from `product-price-editor.tsx`). No privilege escalation, no second permission required for the page itself.
- **Manual add/use: DEFERRED.** `POST /customer-point/add`/`/use` exist in the backend but are explicitly out of scope — no Add/Use Points buttons, no manual adjustment dialog, no approval workflow, no loyalty admin page.
- **Concurrency**: not applicable — Customer Point uses pessimistic row locking (`SELECT ... FOR UPDATE`) internally; no frontend concurrency UI needed since no mutation is authorized. Kept conceptually separate from Customer's own Optimistic Lock.
- **Automatic checkout earning: NOT IMPLEMENTED.** Checkout only redeems (`usePoint`) inside its own transaction; no `addPoint` call exists anywhere in Checkout. No frontend copy may imply automatic earn-on-purchase.
- **Sales-return point restoration: NOT IMPLEMENTED.** Zero point-related code in `sales-return`/`invoice` modules — a return never restores spent points. Not built or simulated in T048.
- **Point expiry enforcement: KNOWN BACKEND DEBT.** `expiredAt`/`POINT_EXPIRED_EVENT` plumbing exists but nothing publishes the event. Display `expiredAt` only as raw ledger metadata where present — no countdowns, no "expired" labels, no client-side removal logic.
- **Future ownership**: manual Customer Point operations belong to a dedicated future Loyalty/Customer Point scope, not assigned a T-number here.

## 9. Invoice/Checkout relationship

- Checkout's existing `useCustomerOptions()` (from `use-checkout-relations.ts`) is reused unchanged — T048 does not touch Checkout's customer picker, idempotency, transaction boundary, or `CustomerPointDomainService.usePoint()` ownership.
- Customer Detail links to `/invoices?customerId=X` as pure navigation (backend `InvoiceQueryDto.customerId` already exists and is proven). One small, additive, behavior-preserving change: `invoice-table.tsx` reads an optional initial `customerId` from the URL search params (mirroring the exact `?invoiceId=` pattern already used by `sales-returns/new`, T047) — not a new backend contract, not a second Invoice implementation inside Customer.
- No per-customer Payment history endpoint exists; not built.

## 10. Historical snapshot semantics

Invoice/Sales Return already snapshot customer identity (`customerNameSnapshot` etc., established in T046/T047) and are never mutated by Customer edits — T048 makes no change to that immutability. `currentDebt`/`totalRevenue`/`totalOrder` on the Customer response are `@deprecated` (Decision CR02/CR03) with **zero writer anywhere in the codebase** — permanently frozen at their default value. **Not displayed anywhere in T048** — showing them would misrepresent stale/never-computed data as live financial state. Recorded as known backend debt (a real Debt Ledger domain does not exist yet).

## 11. Permissions

Exact catalog (`crud('customer', 'khách hàng', ['restore', 'activate', 'deactivate'])`): `customer:view`, `customer:create`, `customer:update`, `customer:delete`, `customer:restore`, `customer:activate`, `customer:deactivate` — all 7 map 1:1 to controller guards, none invented. Plus `point:view` for the read-only history section (§8).

| Surface | Permission |
|---|---|
| `/customers` route | `customer:view` |
| List row action → Detail | `customer:view` |
| Create button/route | `customer:create` |
| Edit submit | `customer:update` (read-only fallback otherwise — form renders, fields disabled) |
| Activate/Deactivate/Archive/Restore buttons | respective `customer:*` action permission |
| Point history section | `point:view` (independent of `customer:view`) |

## 12. Errors

| Code | HTTP | Reachable from | UI treatment |
|---|---|---|---|
| `CUSTOMER_NOT_FOUND` | 404 | findOne/update/activate/deactivate/remove/restore | Detail not-found `EmptyState` |
| `CUSTOMER_DUPLICATE` | 409 | Create (client-supplied duplicate `code`), or P2002 on any unique field | Create form root-level alert |
| `CUSTOMER_NOT_DELETED` | 422 | Restore on a non-archived customer (defensive, not normally reachable) | Lifecycle dialog in-context alert |
| `CUSTOMER_VERSION_CONFLICT` | 409 | Update/Activate/Deactivate/Archive/Restore | Top-level "Tải lại" alert (§7) |
| `CUSTOMER_INVALID_TRANSITION` | 422 | Activate/Deactivate stale-click race | Lifecycle dialog in-context alert |

Not part of T048's reachable surface (documented, not handled): `CUSTOMER_PHONE_DUPLICATE` (dead code, never thrown anywhere in source), `CUSTOMER_ARCHIVED` (only thrown by `CustomerDomainService.assertNotArchived()`, a cross-module read-boundary guard consumed by other modules, not Customer's own controller).

All mutations use `meta: { suppressGlobalErrorToast: true }` — local error UI owns the error, no duplicate global toast (established convention).

## 13. Cache/query behavior

Use generated query-key factories only (`getCustomerControllerSearchQueryKey`, `getCustomerControllerFindOneQueryKey`, etc.). Customer mutations invalidate Customer search + Customer detail (and, where applicable, Customer Point history's own key). Do not invalidate Invoice/Checkout/Sales Return query keys — historical snapshots stay historical, no cross-domain invalidation required by current contracts.

## 14. Accessibility

`vitest-axe` on List/Create/Edit/Detail/lifecycle dialogs; keyboard-only operability; labeled fields; accessible error messaging; focus retention on dialog close; `aria-disabled` pending-state pattern (matching `ConfirmDialog`'s established convention).

## 15. Tests

Per the authorization's Phase Y plan: List (loading/empty/error-retry/search/filters/pagination/sorting/archived visibility/permissions/lifecycle-visibility), Create (field validation/success/backend errors/permission), Detail/Edit (preload/not-found/read-only fallback/update/conflict/reload-recovery/dirty-state protection), Lifecycle (all 4 actions × status-gates × permission-gates × duplicate-submit × conflict × errors), Customer Point (read-only per §8 boundary only), accessibility, and regression (Checkout, Invoice, Sales Return, Product, Inventory, Purchase, Category, Brand, Unit, auth/session).

## 16. Backend prerequisites

T048.05 (archived visibility fix) — already merged (`06d2c6d`) before this spec was finalized. No further backend changes required for T048.

## 17. Rollback

Standard: revert the squash-merge commit; no schema/migration involved (frontend-only change).

## 18. Known debt

- Archive has no real business guard (no outstanding-invoice/debt check) — pre-existing T011 debt, not fixed here.
- `currentDebt`/`totalRevenue`/`totalOrder` are dead/frozen fields — a real Debt Ledger domain doesn't exist yet.
- `CUSTOMER_PHONE_DUPLICATE` error code is defined but unreachable (dead code).
- Customer Point expiry enforcement incomplete (no publisher for `POINT_EXPIRED_EVENT`).
- Customer Point manual add/use deferred to a future scope (§8).
- No per-customer Payment history endpoint.

## 19. Architect Decisions

- **AD-1 (Customer Point Ownership)** — APPROVED, Option A: read-only balance + history only in T048; manual mutation deferred. Full decision recorded above (§8) and in conversation history.

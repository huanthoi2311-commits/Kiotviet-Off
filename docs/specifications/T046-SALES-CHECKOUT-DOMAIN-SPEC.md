# T046 — Sales / Checkout Domain Frontend Specification

Status: APPROVED FOR IMPLEMENTATION (AD-2 resolved by Architect, 2026-08-09)

## 1. Scope

- **Cart** — a POS-terminal-style page (`/pos`) backed by the existing, unmodified
  per-user backend Cart (Redis): add product (search picker), add by barcode, update
  line quantity, remove line, clear cart.
- **Checkout** — a form on the same page that finalizes the current Cart into a
  completed sale: branch, warehouse, optional customer, payment method, optional
  voucher code, optional loyalty points, optional manual discount.
- **Invoice** — read-only List (`/invoices`) and Detail (`/invoices/[id]`), the
  completed-sale record, including its Payment.
- **Customer read integration** — a minimal picker/lookup only (AD-2 §8), reused from
  both the Checkout form and the Invoice List filter.
- **Inventory integration** — read-only awareness only; the frontend never mutates
  inventory directly, and never claims a reservation the backend doesn't perform.

## 2. Non-scope

- Full Customer management (CRUD/lifecycle) — future dedicated module.
- Sales Return — explicitly deferred; this spec documents the handoff contract
  (§21) it will need, but implements none of it.
- Supplier/Purchase-adjacent work — already closed (T045).
- Any payment gateway/card/QR/wallet integration — the backend only records a
  `method` value (`CASH | BANK_TRANSFER | CARD | E_WALLET`) as metadata; there is no
  actual payment processing to integrate.
- Voucher/discount management (creation, listing) — Voucher and manual Discount are
  opaque, checkout-time-only concepts with no backend CRUD surface.
- Orval tooling changes of any kind (AD-2 §6).

## 3. Dependency graph (re-derived from source, not assumed)

```
Product (existing, read-only pickers)
Customer (read-only, AD-2 §8)
   │
   ▼
Cart (Redis, per authenticated user — GET/POST add/PATCH update/DELETE remove/POST clear)
   │  no stock validation, no reservation, no branch/warehouse/customer on Cart itself
   ▼
Checkout (POST /checkout, ONE atomic Postgres transaction)
   │  reads Cart implicitly (NOT sent in the request body)
   │  Reserve→Replay idempotency (Idempotency-Key header, mandatory)
   │  Point → Voucher → Invoice → Payment → Inventory (SERVICE products skipped)
   ▼
Invoice (status always PAID) + Payment  ── the completed-sale source of truth
   │
   ▼
Sales Return (future, deferred — §21 documents the handoff it needs)
```

Branch/Warehouse/Product pickers are reused unchanged from T044/T045
(`frontend/src/features/inventory/use-inventory-relations.ts`).

## 4. Cart architecture (Phase F)

**Backend-persisted (Option A)** — confirmed via `redis-cart.repository.ts` and
`CartController`'s `GET /cart` (current user's cart). Not local UI state, not hybrid.

- Item shape: `productId`, `quantity` (add is additive, update is absolute) — no
  barcode/customer/branch/warehouse association on the Cart itself.
- Server computes and returns, per line: `productName`, `price`, `discount`,
  `promotion`, `voucher`, `tax`, `total` — and cart-level `subtotal`, `totalDiscount`,
  `totalPromotion`, `totalVoucher`, `totalTax`, `totalAmount`. The frontend never
  computes totals itself.
- **No inventory-availability validation or reservation at Cart level** — confirmed
  via direct read of `cart.service.ts`: `addItem`/`updateItem` only check
  `product.allowSale` and the existence of a RETAIL price. Stock is checked **only**
  at Checkout. The Cart UI must never display an "in stock" indicator or imply a
  hold on inventory — doing so would misrepresent the backend (Phase P instruction).
- Barcode-to-cart: `GET /barcodes?search=<code>` (org-wide barcode lookup, returns
  `productId`) resolves a scanned/typed code to a product, which is then added via
  the same `POST /cart/add`. This is a real, backend-supported capability (not
  invented) — included as a secondary "quét mã vạch" input alongside the product
  search picker.

## 5. Checkout architecture (Phase G)

`POST /checkout`, `CheckoutDto`:

| Field | Required | Notes |
|---|---|---|
| `branchId` | yes | order-level, not per-line |
| `warehouseId` | yes | order-level, not per-line — single warehouse supplies the whole sale |
| `customerId` | no | walk-in supported |
| `paymentMethod` | yes | `CASH \| BANK_TRANSFER \| CARD \| E_WALLET` |
| `voucherCode` | no | opaque — no preview/validation endpoint exists; only resolved by attempting checkout |
| `pointsToUse` | no | requires `customerId`; 1 point = 1đ |
| `manualDiscount` | no | `{ type: PERCENT\|AMOUNT\|FIXED_PRICE\|BUY_X_GET_Y, value?, productId?, buyQuantity?, getQuantity? }` |

**No `items` field** — Checkout reads the caller's persisted Cart server-side. The
frontend must never invent or send an item array to this endpoint.

**One atomic operation** (confirmed via `checkout.service.ts`'s own docstring —
"Toàn bộ → Một Transaction"): Point use → Voucher apply → Invoice create → Payment
create → Inventory decrease (skipping SERVICE-type products) all happen inside one
`prisma.$transaction`. There is no partial/pending outcome — it either fully succeeds
(returns `{ invoice, payment }`) or fully fails (nothing is created, the idempotency
operation row is marked FAILED, safely retryable).

## 6. Completed-sale source of truth (Phase E)

**Invoice + Payment**, created together, atomically, by Checkout. There is no
separate "SalesOrder" entity anywhere in the backend. `Invoice.status` is always
`PAID` when created by Checkout (the DTO hardcodes `status: 'PAID'`,
`paidAmount = totalAmount`, `dueAmount = 0` — Checkout has no concept of a partial
or deferred payment). No cancel/void endpoint exists for Invoice or Payment — once
created, a completed sale is only ever reversed via a future Sales Return.

## 7. Inventory timing & Single Writer (Phase D — PASS)

Inventory is decreased **inside** the same Postgres transaction as Invoice/Payment
creation, via `InventoryDomainService.decrease()` called by `CheckoutService`
(the sole transaction owner) — confirmed no `INVENTORY_REPOSITORY` access anywhere
in `cart`/`checkout`/`invoice`/`payment`/`discount`. `checkout.module` is already
listed in `single-writer.architecture.spec.ts`'s CI-enforced authorized-consumer
list. SERVICE-type products are explicitly skipped (sellable, invoiced, but never
decrement stock).

## 8. Customer boundary (AD-2 §8, mirrors AD-1)

Customer backend is full CRUD/lifecycle (`customer:view/create/update/delete/
restore/activate/deactivate`), zero frontend — same shape as Supplier was for T045,
and weaker in practice: `Invoice.customerNameSnapshot/customerCodeSnapshot/
customerPhoneSnapshot` mean **Invoice List/Detail need no live customer lookup at
all**. A live picker (`useCustomerOptions`, `status: 'ACTIVE'`) is needed only for
the Checkout form itself and the Invoice List's `customerId` filter. Full Customer
management remains a separate future module — not built here.

## 9. Payment boundary (Phase H)

Fully embedded in Checkout — no standalone `POST /payments` endpoint exists
(`PaymentController` is `GET`-only: by id, by `invoiceId`). Methods are exactly
`CASH | BANK_TRANSFER | CARD | E_WALLET`, recorded as metadata only — no gateway
integration to build or fake.

## 10. Branch/Warehouse rules

Both are **order-level** on Checkout (not per Cart line, unlike Purchase Order's
per-line `warehouseId`) — one branch and one warehouse supply the entire sale.
Reused `useBranchOptions('ACTIVE')` / `useWarehouseOptions('ACTIVE')` pickers.

## 11. Pricing / discount snapshot (Phase E Q16–17)

`InvoiceItem` snapshots `unitPrice`, `discount`, `taxAmount`, `totalAmount`,
`productCodeSnapshot`, `productNameSnapshot`, `unitNameSnapshot` at checkout time —
immune to later Product price changes. `Invoice` itself snapshots
`customerCodeSnapshot`/`customerNameSnapshot`/`customerPhoneSnapshot`. The frontend
never recomputes any of these — it displays exactly what the backend returns.

## 12. Idempotency (Phase E Q10–12, AD-2 §4–5)

**AD-2: Checkout uses one hand-written mutation wrapper (`useCheckoutMutation`)
solely because the installed Orval generation stack (react-query + axios + a
single-argument custom mutator) cannot express a per-call header parameter for
ANY endpoint in this codebase — verified empirically, not assumed (a local
experiment removing the OpenAPI spec's duplicate `Idempotency-Key` declaration and
regenerating still produced no header parameter; `@orval/core`'s bundled source
contains no header-handling code at all). This is not a general authorization to
bypass generated hooks — every other T046 endpoint uses generated Orval hooks.**

The wrapper calls `apiClientMutator` directly — the same shared mutator every
generated hook already routes through — so it inherits identical auth-header
injection, error normalization (`NormalizedError`), and envelope unwrapping. It
imports `CheckoutDto`/`CheckoutResponseDto` from the generated schemas; no
duplicated backend contract types.

**Key lifecycle** (re-derived from `checkout-operation.service.ts`, not invented):

- One key per logical checkout attempt, generated via `crypto.randomUUID()` once
  when the Checkout panel is opened for a **new** attempt (`useState`'s lazy
  initializer — stable across re-renders).
- The **same** key is reused for every retry within that attempt — including both
  a network-uncertain retry AND a retry after fixing a validation error (e.g.,
  insufficient stock, invalid voucher) — because the backend's own `reserve()`
  logic safely handles both: a `FAILED` or stuck-`PROCESSING` operation row is
  **reclaimed** by the same key with an updated request hash
  (`tryReclaim(existing.id, requestHash, ...)`), it does not require the payload to
  match. Only a `COMPLETED` row enforces strict hash equality (mismatched payload →
  409 `CHECKOUT_IDEMPOTENCY_KEY_REUSED`).
- After a **successful** checkout, the key is retired and a fresh one generated
  before the next new checkout can be submitted — this is enforced by resetting
  the `useState` key via a state update in `onSuccess`, so the next attempt (new
  Cart, new sale) can never accidentally replay/conflict with the just-completed
  one.
- Because retiring happens only on success, the rare case of "same key + genuinely
  different payload after a **completed** attempt" cannot occur through normal UI
  usage — `CHECKOUT_IDEMPOTENCY_KEY_REUSED`/`CHECKOUT_IDEMPOTENCY_CONFLICT` are
  still mapped to a clear root-level error for defense-in-depth, never silently
  swallowed.
- No blind automatic retries are implemented — retry is always an explicit user
  action (a "Thử lại" button after a failed/uncertain attempt), submitting with the
  same key and the form's current values.

## 13. Permissions

| Code | Scope |
|---|---|
| `pos:access` | Cart (all operations) + Checkout — the entire `/pos` page |
| `invoice:view` | Invoice List/Detail |
| `payment:view` | Payment info shown on Invoice Detail |
| `customer:view` | Customer picker/lookup (read-only) |

No new permission is introduced or assumed.

## 14. Error mapping (Phase T)

| Code | Surface |
|---|---|
| `CART_PRODUCT_NOT_FOUND` / `CART_PRODUCT_NOT_SELLABLE` / `PRODUCT_MISSING_RETAIL_PRICE` | toast/root alert on the add-to-cart action (not a form field — the picker itself constrains selection to real products, so this is a race/edge case) |
| `CART_ITEM_NOT_FOUND` | root alert on update/remove (stale line, cart changed elsewhere) |
| `CHECKOUT_EMPTY_CART` | root alert on the Checkout form, submit disabled when Cart is already empty |
| `CHECKOUT_INSUFFICIENT_STOCK` | root alert on the Checkout form — real-time stock failure, not predicted client-side |
| `CHECKOUT_INVENTORY_CONFLICT` | root alert, same shape as Transfer/Adjustment/StockCount's CAS-conflict pattern |
| `CHECKOUT_VOUCHER_INVALID` | field-level error on the voucher code input |
| `CHECKOUT_POINTS_EXCEED_TOTAL` | field-level error on the points input |
| `CHECKOUT_VOUCHER_CONFLICT` | root alert (concurrent use of the same voucher) |
| `CHECKOUT_IDEMPOTENCY_KEY_MISSING` | should be unreachable (the wrapper always sends the header) — if seen, root alert |
| `CHECKOUT_IDEMPOTENCY_KEY_REUSED` / `CHECKOUT_IDEMPOTENCY_CONFLICT` | root alert, defense-in-depth (§12) |
| `CUSTOMER_NOT_FOUND` | root alert (selected customer became unavailable between picker load and submit) |

No duplicate global toast on any of the above (`meta: { suppressGlobalErrorToast: true }`).

## 15. Concurrency

Cart has no Optimistic Lock — last-write-wins per user (Redis, single-user-owned,
no cross-user contention possible). Checkout's only concurrency concerns are the
idempotency mechanism (§12) and Inventory's own CAS (`CHECKOUT_INVENTORY_CONFLICT`)
and Voucher's own CAS (`CHECKOUT_VOUCHER_CONFLICT`) — both surfaced as root alerts,
not silently retried.

## 16. Cache / query strategy

| Mutation | Invalidates |
|---|---|
| Cart add/update/remove/clear | `getCartControllerGetCartQueryKey()` (own cache) |
| Checkout success | Cart cache cleared (refetch confirms empty), Invoice search invalidated (`getInvoiceControllerSearchQueryKey()`) |

No Inventory/Product query is invalidated by Cart or Checkout — proven unnecessary:
Cart never touches inventory, and a POS cashier's own screen has no open Inventory
List to go stale (same reasoning already accepted for Transfer/Adjustment/StockCount
not invalidating Inventory in T044).

## 17. Accessibility

Same bar as T044/T045: `vitest-axe` on every component, keyboard-operable quantity
controls (real `<button>`/`<input type="number">`, never a div), labeled Checkout
fields, focus retained in the Checkout error state, `aria-live` region for the
running Cart total so screen readers announce changes.

## 18. Tests

Per AD-2 §11, explicit tests proving: the Idempotency-Key header is actually sent;
the key is stable across re-render; duplicate-submit-while-pending sends exactly one
request; an explicit retry of the same attempt reuses the same key; a new completed
checkout receives a new key on the next attempt; the request body is exactly
`CheckoutDto` (no items); a same-key-reused conflict is surfaced; every other T046
endpoint uses generated hooks (audited via diff grep, §22 of the final report).

## 19. Rollback

Standard `git revert --no-commit` dry-run, identical to every prior T04x sprint.
No backend/schema changes in this PR.

## 20. Sales Return handoff (Phase J — read-only investigation, not implemented)

`CreateSalesReturnDto` requires `invoiceId` + per-line `invoiceItemId` (from
`InvoiceItemResponseDto.id`, already present in Invoice Detail's own response) +
`quantity` + `reason` enum + optional `warehouseId`. T046's Invoice Detail page
naturally exposes everything a future Sales Return Create needs — no extra work
required now; a future "Trả hàng" link from Invoice Detail (mirroring T045's
Purchase Order → Purchase Return pattern) is the expected entry point.

## 21. Known debt

- Duplicate `Idempotency-Key` OpenAPI parameter declaration (AD-2 §7) — acknowledged,
  not fixed here (proven non-blocking; the real gap is the Orval toolchain, not this
  declaration).
- Customer/Supplier full management frontends remain unbuilt (pre-existing,
  unrelated to T046).
- No voucher/promotion management UI — none exists in the backend to expose.

## 22. Architect Decisions

**AD-2** — Checkout idempotency header. **RESOLVED**, Option A (hand-written
`useCheckoutMutation` wrapper) approved. See §12.

Customer dependency (Phase I) — resolved by direct instruction to follow the AD-1
precedent (§8); not a fresh AD requiring separate approval.

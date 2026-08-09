# T047 — Sales Return / Exchange Domain Frontend Specification

Status: APPROVED FOR IMPLEMENTATION

No Architect Decision was required for this sprint — every architectural question
resolved cleanly from source (Single Writer intact, Refund fully specified as its
own decoupled domain, Exchange conclusively absent from the codebase, Customer
boundary already established by AD-1/AD-2 precedent).

## 1. Scope

- **Sales Return** — Create (from an eligible Invoice), List, Detail, full lifecycle
  (Submit / Approve / Receive / Complete / Cancel), Draft edit (`updateDraft`).
- **Refund** — its own sub-workflow inside Sales Return Detail: Create, and lifecycle
  (Process / Complete / Fail / Cancel).
- **Invoice handoff** — one small additive "Trả hàng" link on T046's existing
  Invoice Detail page, pointing at Sales Return Create with `invoiceId` pre-filled.
- **Return eligibility** — real, backend-provided advisory data
  (`GET /sales-returns/eligibility`) shown in the Create form.

## 2. Non-scope

- **Exchange** — confirmed absent from the codebase. `sales-return.module.ts`'s own
  docstring states "Exchange không có dependency code-level với Checkout" (Exchange
  has no code-level dependency with Checkout) — there is no Exchange entity, DTO, or
  endpoint anywhere, despite the RFC/SPEC's title naming it. No Exchange control is
  built; none is faked.
- Customer/Supplier full management — pre-existing, unrelated.
- Any payment-gateway integration for Refund — `method` is metadata only
  (`CASH | BANK_TRANSFER | CARD | E_WALLET`), identical shape to Payment's own.
- Redesigning T046's Invoice Detail beyond the one additive link.

## 3. Dependency graph

```
Invoice (T046, read-only, immutable sale snapshot)
   │  "Trả hàng" link → Sales Return Create (?invoiceId=)
   ▼
Sales Return ──(references invoiceId + per-line invoiceItemId)
   │  DRAFT --submit--> SUBMITTED --approve--> APPROVED --receive--> RECEIVED --complete--> COMPLETED
   │  (also: DRAFT|SUBMITTED|APPROVED --cancel--> CANCELLED; DRAFT --updateDraft--> DRAFT)
   │  receive() ⇒ InventoryDomainService.increase() per non-SERVICE item, same tx (Decision AD46)
   ▼
Refund (own lifecycle, embedded in SalesReturnResponseDto.refunds, decoupled from Payment — AD37)
   PENDING --process--> PROCESSING --complete--> COMPLETED
   PROCESSING --fail--> FAILED
   PENDING --cancel--> CANCELLED
```

Customer read integration is reused unchanged from T046
(`frontend/src/features/checkout/use-checkout-relations.ts`'s `useCustomerOptions`).

## 4. Sales Return state machine

| From | Action | To | Permission | Inventory effect | Error codes |
|---|---|---|---|---|---|
| — | `create` | DRAFT | `sales_return:create` | none | `SALES_RETURN_002` (invoice not eligible — only `CANCELLED` invoices are ineligible; no path produces one today), `SALES_RETURN_003` (invoice item not found), `SALES_RETURN_004` (qty exceeds eligible) |
| DRAFT | `updateDraft` | DRAFT | `sales_return:update` | none | `SALES_RETURN_005/006` |
| DRAFT | `submit` | SUBMITTED | `sales_return:submit` | none | `SALES_RETURN_005` (invalid transition), `SALES_RETURN_006` (version conflict) |
| SUBMITTED | `approve` | APPROVED | `sales_return:approve` | none | `SALES_RETURN_005/006` |
| APPROVED | `receive` | RECEIVED | `sales_return:receive` | `InventoryDomainService.increase()` per non-SERVICE item, same tx | `SALES_RETURN_005/006`, `SALES_RETURN_008` (SERVICE item can't affect inventory), `SALES_RETURN_009` (warehouse required) |
| RECEIVED | `complete` | COMPLETED | `sales_return:complete` | none | `SALES_RETURN_005/006` |
| DRAFT/SUBMITTED/APPROVED | `cancel` | CANCELLED | `sales_return:cancel` | none | `SALES_RETURN_005/006` |

Unlike every prior T04x module this session, Sales Return uses **real Optimistic
Lock** (`version` field, `VersionedActionDto` on every write) — not a status-only
guard. All 6 enum statuses are genuinely reachable (no unreachable-superset pattern
this time).

## 5. Invoice handoff (Phase H)

One additive change to T046's `InvoiceDetail`: a "Trả hàng" button/link
(`sales_return:create`-gated) routing to `/sales-returns/new?invoiceId=<id>`,
mirroring T045's Purchase Order → Purchase Return link exactly. No other change to
Invoice Detail.

## 6. Return quantities (Phase E)

- References `invoiceId` (required) + per-line `invoiceItemId` (not raw productId).
- **Real, backend-provided eligibility data**: `GET /sales-returns/eligibility?
  invoiceId=` returns `{ invoiceItemId, soldQty, returnedQty, eligibleQty }` per
  line — explicitly documented as "advisory" (a race is still possible between
  checking and submitting). The Create form fetches this and shows each line's
  eligible quantity, capping the quantity input's `max` at `eligibleQty` as a UX
  hint — **not** a substitute for the server's own authoritative
  `SALES_RETURN_004` (qty exceeded) check, which is still the source of truth.
- `warehouseId` is optional at Create time, required only when the item is
  non-SERVICE at Receive time (`SALES_RETURN_009`) — validated server-side; the
  Create form collects it per-line since it's part of `CreateSalesReturnItemDto`.
- Multiple returns against the same invoice are supported (the eligibility
  endpoint's own `returnedQty` accumulates across all prior non-cancelled returns).
- Price/discount/tax are snapshotted onto `SalesReturnItem` at creation
  (`productCodeSnapshot`, `productNameSnapshot`, `unitNameSnapshot`) — resolved from
  the referenced Invoice item server-side, not sent by the client.
- `reason` is a required enum, `reasonNote` optional (required server-side only when
  `reason = OTHER`).

## 7. Multiple/partial return semantics

Fully server-enforced via the eligibility mechanism above — no client-side history
tracking is invented; the frontend only ever displays what
`GET /sales-returns/eligibility` returns.

## 8. Inventory effects

`receive()` is the only inventory-affecting transition — increases stock via
`InventoryDomainService.increase()`, called from `SalesReturnService` (not the
repository layer, Decision AD46 — architecturally equivalent to Checkout's own
pattern, just at the Application Service layer rather than Repository layer,
already CI-enforced in `single-writer.architecture.spec.ts`). SERVICE-type items are
excluded (mirrors Checkout's own `SERVICE` skip logic).

## 9. Refund model (Phase F)

**Its own domain/entity** (`SalesReturnRefund`), decoupled from `Payment`
(Decision AD37 — "Refund độc lập Payment") and from Invoice/Inventory. Embedded
directly in `SalesReturnResponseDto.refunds` — no separate list query needed.

| From | Action | To | Permission |
|---|---|---|---|
| — | `createRefund` (`amount`, `method`, `externalReference?`) | PENDING | `sales_return:refund` |
| PENDING | `process` | PROCESSING | `sales_return:refund` |
| PROCESSING | `complete` | COMPLETED | `sales_return:refund` |
| PROCESSING | `fail` (`failureReason` required) | FAILED | `sales_return:refund` |
| PENDING | `cancel` | CANCELLED | `sales_return:refund` |

Real Optimistic Lock (`version`) on every refund transition too. Methods are the
same 4-value set as Payment (`CASH | BANK_TRANSFER | CARD | E_WALLET`) — metadata
only, no gateway integration. `sales_return:view_refund` exists in the permission
catalog but is not wired to any endpoint (refunds are visible via the main
`sales_return:view`-gated Detail response) — not used, not invented.

## 10. Exchange boundary

Confirmed absent from the codebase (§2). No frontend control of any kind.

## 11. Customer boundary

Reused unchanged from T046 (`useCustomerOptions`). `SalesReturnResponseDto` has raw
`customerId` only (no snapshot, unlike Invoice) — id→name resolution uses the same
picker/lookup hook, not a new one.

## 12. Product snapshot behavior

`SalesReturnItemResponseDto` snapshots `productCodeSnapshot`/`productNameSnapshot`/
`unitNameSnapshot` — List/Detail need no product relation lookup. The Create form's
line picker is driven by the referenced Invoice's own items (already snapshotted
via T046's `InvoiceItemResponseDto`), fetched via `useInvoiceControllerGetById`
(existing T046 hook) — no new Product picker needed, mirroring T045 Purchase
Return's identical pattern (fetch the referenced order to populate line options).

## 13. Warehouse behavior

Per-line, optional at Create, required at Receive for non-SERVICE items. Reused
`useWarehouseOptions('ACTIVE')` from the inventory feature (T044).

## 14. Permissions

`sales_return:view/create/update/submit/approve/receive/complete/cancel/refund` —
all verified against the real permission catalog; `view_refund` deliberately unused
(§9).

## 15. Errors

| Code | Surface |
|---|---|
| `SALES_RETURN_002` (invoice not eligible) | root alert on Create |
| `SALES_RETURN_003` (invoice item not found) | root alert on Create (stale item reference) |
| `SALES_RETURN_004` (qty exceeded) | field-level error on the affected line's quantity input |
| `SALES_RETURN_005`/`SALES_RETURN_012` (invalid transition) | in-dialog error, same pattern as every T04x lifecycle dialog this session |
| `SALES_RETURN_006`/`SALES_RETURN_013` (version conflict) | **new pattern for this session's T04x work** — a dismissable "Tải lại" (reload) alert, refetching the record, mirroring Brand/Category's own established Optimistic-Lock-conflict UI (not the status-guard in-dialog pattern used by Transfer/PurchaseOrder/PurchaseReturn/Checkout, which have no `version` field at all) |
| `SALES_RETURN_008` (SERVICE item, inventory forbidden) | root alert on Receive |
| `SALES_RETURN_009` (warehouse required) | field-level error on the affected line's warehouse picker |
| `SALES_RETURN_010` (refund not found) | root alert |
| `SALES_RETURN_011` (refund amount invalid) | field-level error on the refund amount input |
| `SALES_RETURN_014` (not received, can't refund) | root alert, Refund creation gated to RECEIVED/COMPLETED status client-side too (a real, provable rule, not invented) |

## 16. Concurrency

Real Optimistic Lock (`version`) on both Sales Return and Refund — every mutation
sends the currently-known `version`; a conflict (§15) surfaces the "Tải lại" pattern
rather than a stale-click dialog error, since here the record can genuinely be
edited elsewhere between page loads, not just double-clicked.

## 17. Transaction boundaries

`SalesReturnService` owns its own `$transaction()` for `receive()` only — every
other transition is a single-statement version-guarded update. Refund transitions
are similarly single-statement, version-guarded, and never touch Inventory/Invoice.

## 18. Cache/query behavior

| Mutation | Invalidates |
|---|---|
| Create | Sales Return search |
| Draft update / lifecycle actions | Sales Return search + that return's findOne |
| Refund actions | that return's findOne only (refunds are embedded in the same response) |

No Invoice/Inventory query is invalidated by any Sales Return mutation — Invoice is
an immutable sale snapshot (T046 §5), never touched by Sales Return; a user with the
Inventory screens open is not auto-refreshed (same accepted precedent as every
inventory-affecting T04x mutation this session).

## 19. Accessibility

Same bar as T044/T045/T046: `vitest-axe` per component, keyboard-operable quantity/
warehouse controls, labeled reason/refund fields, focus retention in dialogs, the
new "Tải lại" conflict alert is itself keyboard-reachable and announced.

## 20. Tests

Per-component MSW+generated-hooks pattern established all session: Create (eligible
invoice fetch, line picker, quantity capped by eligibility hint, server rejection,
permissions), List/Detail (loading/empty/retry/filters/status), every lifecycle
transition (status-gated visibility, stale-click race via `SALES_RETURN_005`,
version-conflict via `SALES_RETURN_006` reload pattern), Refund's own 5 actions,
the Invoice Detail "Trả hàng" link, accessibility, and regression re-runs of
Sales/Checkout, Inventory, Product, Purchase, Category, Brand, Unit, auth suites.

## 21. Rollback

Standard `git revert --no-commit` dry-run, identical to every prior sprint. No
backend changes in this PR.

## 22. Known debt

- `sales_return:view_refund` permission exists but is unwired to any endpoint —
  pre-existing, not introduced or relied upon here.
- Exchange remains entirely unimplemented in the backend — pre-existing, disclosed.

## 23. Architect Decisions

None required — every question resolved cleanly from source (§F/§G above).

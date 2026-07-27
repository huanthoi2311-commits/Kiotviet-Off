# T014 Brownfield Discovery — Sales Return & Exchange

**Status:** Discovery only — no RFC, no SPEC, no code, no migration, no commit produced by this document.
**Method:** Direct source/schema inspection (`backend/prisma/schema.prisma`, `backend/src/modules/**`), same evidence-based approach used for T011-T013 Architecture Reviews. Every claim below is backed by a concrete file:line reference discovered during this session — nothing inferred from memory of a prior codebase state.

---

## 1. Executive Summary

The database schema already contains scaffold models for Return (`Return`/`ReturnItem`), Debt (`Debt`), and Cashbook (`CashBook`/`Expense`/`ExpenseCategory`) — leftover from Sprint-00, before the current Specification-First process existed. **None of these have any application-layer implementation** (no `sales-return`, `order`, `customer-debt`, or `cashbook` module exists in `backend/src/modules`).

The single most important finding, structurally identical to what T013's Architecture Review found for Checkout: **the existing `Return`/`ReturnItem` scaffold models reference `Order`/`OrderItem`, not `Invoice`/`InvoiceItem`.** T013 already established, and Decision AD11 now freezes, that Checkout creates `Invoice` directly — `Order`/`OrderItem` are unused scaffold tables with zero write path anywhere in the codebase. A Sales Return module built against the existing `Return` model as-is would return against an entity type (`Order`) that literally never gets created. This is a hard architecture conflict that must be resolved by RFC before any schema/code work begins — it cannot be quietly worked around.

On the positive side: the **Inventory Single Writer** infrastructure, the **`InventoryMovementType.RETURN`/`InventoryReferenceType.RETURN`** enum values, and a **working, tested precedent** (`PurchaseReturnService`/`PrismaPurchaseReturnRepository`) for a DRAFT→APPROVED→COMPLETED→CANCELLED return workflow that calls `InventoryDomainService` + writes a `Debt` row inside one transaction **already exist and are directly reusable as a pattern** for the customer-side mirror.

## 2. Existing Domain Model

Sales-side aggregates that actually have a write path today (confirmed via `backend/src/modules` directory listing):

```
Cart (Redis, draft)
  → Checkout Command (T013, AD07)
    → Business Transaction
      → Invoice (immutable) + Payment (immutable) + InventoryMovement (SALE, per line except SERVICE)
```

Aggregates that exist **only in the Prisma schema**, with no module, no service, no controller anywhere in `backend/src/modules`:
- `Order` / `OrderItem`
- `Return` / `ReturnItem`
- `Debt` (customer/RECEIVABLE side — the supplier/PAYABLE side is implemented via `supplier-debt`)
- `CashBook`, `Expense`, `ExpenseCategory`

## 3. Existing Database Tables (Sales-relevant, from `schema.prisma`)

| Table | Model | Has application module? |
|---|---|---|
| `invoices` | `Invoice` | ✅ `invoice` |
| `invoice_items` | `InvoiceItem` | ✅ `invoice` |
| `payments` | `Payment` | ✅ `payment` |
| `checkout_operations` | `CheckoutOperation` | ✅ `checkout` |
| `orders` | `Order` | ❌ none |
| `order_items` | `OrderItem` | ❌ none |
| `returns` | `Return` | ❌ none |
| `return_items` | `ReturnItem` | ❌ none |
| `debts` | `Debt` | 🟡 partial — `supplier-debt` writes it for supplier side; nothing writes it for customer side |
| `cash_books` | `CashBook` | ❌ none |
| `expenses`, `expense_categories` | `Expense`, `ExpenseCategory` | ❌ none |
| `customer_point_ledgers` | `CustomerPointLedger` | ✅ `customer-point` |
| `vouchers` | `Voucher` | ✅ `checkout` (read/increment only) |
| `inventory_movements` | `InventoryMovement` | ✅ `inventory` |

## 4. Existing Prisma Models (field-level detail for the ones relevant to Return)

**`Return`** (`schema.prisma:1679-1706`): `id, organizationId, orderId → Order, processedBy, code, reason, status: ReturnStatus, totalRefund, createdBy/updatedBy/createdAt/updatedAt/deletedAt, returnItems[]`. Unique `(organizationId, code)`.

**`ReturnItem`** (`schema.prisma:1708-1729`): `id, returnId → Return, orderItemId → OrderItem, productId → Product, quantity, refundAmount, createdBy/updatedBy/createdAt/updatedAt/deletedAt`.

**`ReturnStatus`** enum (`schema.prisma:133-138`): `PENDING | APPROVED | REJECTED | REFUNDED`. Note this is a *different* state machine shape than `PurchaseReturnStatus` (`DRAFT | APPROVED | COMPLETED | CANCELLED`) — inconsistent naming/semantics between the two scaffolds, another item an RFC must resolve (which shape to keep, or design fresh).

**`Debt`** (`schema.prisma:1814-1842`): generic ledger, `customerId?` OR `supplierId?` (nullable, either/or), `type: DebtType (RECEIVABLE|PAYABLE)`, `refType/refId` (free-form polymorphic reference, no FK), `amount, paidAmount, dueDate, status: DebtStatus`.

**`InventoryMovementType`** (`schema.prisma:1068-1078`) already includes `RETURN`. **`InventoryReferenceType`** (`schema.prisma:1080-1087`) already includes `RETURN`.

## 5. Existing Services (Sales-relevant)

| Service | Module | Role |
|---|---|---|
| `CheckoutService` | `checkout` | Sole Invoice/Payment creator, Stable Orchestrator (AD11) |
| `InvoiceService` | `invoice` | `createInvoice()` (Checkout-only), `getById`, `search` — no update/cancel |
| `PaymentService` | `payment` | `createPayment()` (IN only, hardcoded), `getById` |
| `InventoryDomainService` | `inventory` | `increase/decrease/adjust/transfer/recordMovement` — Single Writer gateway |
| `CartDomainService` | `cart` | `findByUserId/clearAfterCheckout` |
| `CustomerPointDomainService` | `customer-point` | `usePoint` (checkout-facing); full `CustomerPointService` also has `addPoint` |
| `ProductDomainService`, `UnitDomainService` | `product`, `unit` | Read-only lookups (used by Checkout for Snapshot, Phase 5) |
| `PurchaseReturnService` | `purchase-return` | **Direct structural precedent** — see §26 |

## 6. Existing Repositories

All Sales-adjacent repositories follow ADR-0010 Repository Boundary: internal `*_REPOSITORY` token, not exported outside the owning module (verified in this session for cart/checkout-operation/customer-point/invoice/payment — 5 Architecture Tests, zero violations). `IInventoryRepository`/`INVENTORY_REPOSITORY` additionally has a dedicated Single Writer Architecture Test (`inventory/single-writer.architecture.spec.ts`) enforced project-wide.

No `IReturnRepository`/`IOrderRepository`/`ICustomerDebtRepository`/`ICashBookRepository` exists.

## 7. Existing API Endpoints (Sales-relevant)

| Method | Route | Module |
|---|---|---|
| `GET/POST/PATCH/DELETE` | `/cart`, `/cart/add`, `/cart/update`, `/cart/remove`, `/cart/clear` | `cart` |
| `POST` | `/checkout` | `checkout` |
| `GET` | `/invoices`, `/invoices/:id` | `invoice` |
| `GET` | `/payments`, `/payments/:id` | `payment` |
| `POST` | `/customer-points/add`, `/customer-points/use` | `customer-point` |
| `GET` | `/customer-points/history` | `customer-point` |

No `/returns`, `/orders`, `/customer-debts`, or `/cashbook` routes exist anywhere.

## 8. Existing DTOs

Relevant shapes already defined: `CheckoutDto` (branchId, warehouseId, customerId?, paymentMethod, voucherCode?, pointsToUse?, manualDiscount?), `InvoiceResponseDto`/`InvoiceItemResponseDto` (now including Phase 5 Snapshot fields), `PaymentResponseDto`. `CreatePurchaseReturnDto` (`purchase-return/application/dto/create-purchase-return.dto.ts`) is the closest existing shape to model a `CreateSalesReturnDto` after.

## 9. Existing Permissions / RBAC

`permission-catalog.ts` (`backend/src/modules/rbac/infrastructure/permission-catalog.ts:162-179`) already contains **unwired stub permissions** left over from the same Sprint-00 scaffold era: `order:view/create/update/cancel/return`, `invoice:view`, `payment:view/create`, `debt:view`, `cashbook:view`. None of these are referenced by any `@RequirePermissions()` decorator anywhere in the codebase (checked — only `pos:access` is actually used by `checkout.controller.ts`, `invoice`/`payment` controllers use their own CRUD-generated permissions via `crud()` helper, not these literal stub strings). These are dead catalog entries, not live permissions — an RFC would need to decide whether to reuse, rename, or replace them (e.g. `order:return` → `sales_return:*` to match the `invoice`-based reality).

## 10. Existing Inventory Workflow

`Checkout` → per non-SERVICE cart item → `InventoryDomainService.decrease(tx, { movementType: 'SALE', referenceType: 'POS', referenceId: invoice.id, ... })`, inside the same Business Transaction as Invoice/Payment. SERVICE-type products are explicitly skipped (Phase 6, AD14). Single Writer enforced by `inventory/single-writer.architecture.spec.ts` — any future `sales-return` module MUST import `InventoryModule` and use `InventoryDomainService`, verified automatically by that test once the module is added to its `it.each` list.

## 11. Existing Checkout Workflow

Full detail already documented in `docs/implementation/T013-CLOSEOUT.md` and `docs/specifications/SPEC-T013-SALES-FOUNDATION-001.md`. Summary: Reserve (idempotency, durable) → validate Cart/Customer/Product/Unit/Voucher → Business Transaction (Discount → Point → Voucher → Invoice[with Snapshot] → Payment → Inventory loop[skip SERVICE] → markCompleted) → clear Cart → publish events → audit log. **Frozen as Stable Orchestrator (AD11)** — any Sales Return interaction with Checkout internals requires a new RFC, cannot be patched in-place.

## 12. Existing Payment Workflow

`PaymentService.createPayment()` → `PrismaPaymentRepository.create()` **hardcodes `direction: 'IN'`** (`prisma-payment.repository.ts:28`), and both `findById`/`findByInvoiceId` filter `WHERE direction = 'IN'` (`prisma-payment.repository.ts:43,53`). The `PaymentDirection` enum (`IN|OUT`) exists in schema but `OUT` (refund) is **never written anywhere**. See §Special Questions.

## 13. Existing Customer Workflow

`CustomerDomainService.findActiveById()` — used by Checkout to validate + Snapshot. No return-specific customer logic exists (e.g. no "customer eligible for return" concept).

## 14. Existing Voucher Workflow

`IVoucherRepository` (`checkout/domain/repositories/voucher.repository.interface.ts:15-30`): only `findActiveByCode` + `incrementUsage` (optimistic-lock CAS). **No `decrementUsage`/restore method exists.** See §Special Questions.

## 15. Existing Loyalty / Point Workflow

`CustomerPointService` has both `addPoint()` (`customer-point.service.ts:48`) and `usePoint()` (`customer-point.service.ts:87`) as independent public methods, backed by an append-only `CustomerPointLedger` (positive delta = add, negative = use). `usePoint()` is what Checkout calls. **No dedicated "reverse a specific usePoint ledger entry" method** — a caller wanting to give points back would call `addPoint()` fresh, manually recomputing the amount and its own `referenceType`/`referenceId`. See §Special Questions.

## 16. Existing Warehouse Workflow

`warehouse` module: standard Type B CRUD (`WarehouseService`, full `Create/Update/Query` DTOs), `Warehouse.branchId → Branch`, `Warehouse.type: WarehouseType`. Checkout already takes an explicit `warehouseId` in `CheckoutDto` — a Sales Return would need the same, to know which warehouse receives the returned stock (not necessarily the same warehouse the sale was fulfilled from, though that's an open business-rule question, not a technical one).

## 17. Existing Branch Workflow

`branch` module: full CRUD, `Branch.invoicePrefix`/`receiptPrefix`, `isMain`, `defaultWarehouseId`. T013 Phase 4 already wired `Branch.invoicePrefix` into Invoice numbering. `BranchModule` still exports raw `BRANCH_REPOSITORY` (pre-existing gap, noted in T013 Closeout §8) — any new consumer (e.g. a future `sales-return` module needing Branch data) would inherit this same gap unless a Branch Repository Boundary Cleanup happens first.

## 18. Existing Audit Mechanism

`AuditLogService.log()` (`platform/audit-log/audit-log.service.ts`) — generic, best-effort (failures logged as warnings, never thrown), used consistently by every write-side service including `PurchaseReturnService`. Directly reusable, no changes needed.

## 19. Existing Event Flow

`DomainEventPublisher` (`platform/events/domain-event-publisher.service.ts`) — thin wrapper over `EventEmitter2`, `publish(eventName, payload)`. `CHECKOUT_COMPLETED_EVENT`/`CHECKOUT_FAILED_EVENT`/`POINT_USED_EVENT` are the existing Sales-side events. No `SALES_RETURN_*` events exist yet — would need definition in a new RFC/SPEC.

## 20. Existing Transaction Boundaries

Checkout: single `PrismaService.$transaction()` wraps Point→Voucher→Invoice→Payment→Inventory, entered only after the separate, pre-committed Idempotency Reserve step (T013 §13.2/§14). `PurchaseReturn.complete()` mirrors this shape at a smaller scale: one `$transaction` wraps status-check + Inventory + Debt + status-update. A Sales Return COMPLETE step would likely need the same shape: one transaction wrapping Inventory increase + refund mechanism (Payment OUT / Point re-add / Voucher restore, whichever the RFC picks) + Return status update.

## 21. Existing Repository Boundaries

5 modules currently have an enforced, tested boundary (cart, checkout-operation, customer-point, invoice, payment) — all export only a narrow Domain Service, verified via 5 Architecture Tests + a project-wide grep this session found zero violations. `inventory` has its own dedicated, stronger Single Writer Architecture Test. Any new Sales Return module must follow this exact pattern: export only a narrow `SalesReturnDomainService` (or similar) if any other module needs to read Return data, never the raw repository/token.

## 22. Existing Domain Services

`CartDomainService`, `CustomerDomainService`, `CustomerPointDomainService`, `InventoryDomainService`, `ProductDomainService`, `UnitDomainService` — all read-only-safe, injectable cross-module. A future `sales-return` module would likely need to consume `InvoiceService` (already the sole public surface of `invoice`), `InventoryDomainService`, possibly `PaymentService`/`CustomerPointDomainService`/voucher access depending on refund-mechanism RFC decisions.

## 23. Existing Inventory Single Writer Implementation

Confirmed via `inventory/single-writer.architecture.spec.ts` (108 lines, 4 assertions + 1 parameterized check): (1) no module outside `inventory` imports `INVENTORY_REPOSITORY`/`IInventoryRepository`; (2) no module outside `inventory` calls write methods on `prisma.inventory*`/`tx.inventory*`; (3) `InventoryModule` exports exactly `[InventoryDomainService]`; (4) an explicit allow-list of modules that ARE permitted to import `InventoryModule` (`purchase-order`, `purchase-return`, `transfer`, `inventory-adjustment`, `stock-count`, `checkout`). **A future `sales-return` module would need to be added to this allow-list** — the test would fail to prove its own completeness otherwise, though it wouldn't block the module from working (it only asserts the modules currently in the list DO import `InventoryModule`, it doesn't forbid others from doing so — worth double-checking this nuance during implementation).

## 24. Existing Sequence Number Implementation

`SequenceCodeGeneratorService` (`prisma/sequence-code-generator.service.ts`, `@Global()`) — reusable `generate(organizationId, sequenceName, prefix, padLength)`. Per Decision AD12, any new document number (a Sales Return code, e.g. `TH000001`) **must** use this service, not a bespoke generator. `PurchaseReturnCodeGenerator` already demonstrates the adapter pattern to copy.

## 25. Existing Status Enums

| Enum | Values |
|---|---|
| `InvoiceStatus` | `UNPAID \| PARTIAL \| PAID \| CANCELLED` |
| `ReturnStatus` (existing scaffold) | `PENDING \| APPROVED \| REJECTED \| REFUNDED` |
| `PurchaseReturnStatus` (implemented, different shape) | `DRAFT \| APPROVED \| COMPLETED \| CANCELLED` |
| `DebtStatus` | `OPEN \| PARTIAL \| SETTLED \| OVERDUE` |
| `PaymentDirection` | `IN \| OUT` (OUT unused) |

## 26. Existing Return / Refund Related Code

**The only real, working, tested Return implementation in the codebase is `PurchaseReturn`** (purchasing side, not sales). Full service (`purchase-return.service.ts`, 332 lines) + repository implement: `create()` (validates against a RECEIVED/COMPLETED Purchase Order, computes items/totalAmount, generates code via dedicated generator), `approve()` (pure status gate), `complete()` (**one transaction**: re-check status, loop items calling `InventoryDomainService.decrease(tx, { movementType: 'RETURN', referenceType: 'RETURN', ... })`, `tx.debt.create({ type: 'PAYABLE', amount: totalAmount.negated(), status: 'SETTLED', refType: 'PurchaseReturn', refId: id })`, then status update), `cancel()` (only from DRAFT/APPROVED). This is the direct structural template for Sales Return's COMPLETE step, mirrored: `InventoryDomainService.increase()` instead of `decrease()` (goods coming back in), and some customer-side refund mechanism instead of a Debt/PAYABLE write (see Special Questions — Debt/RECEIVABLE is never created by current Checkout, so mirroring the Debt write literally may not be the right design).

## 27. Existing Tests Related to Sales

No dedicated Sales Return/Refund test file exists (grep for `Return`/`Refund` across `backend/src/modules/**/*.spec.ts` only matched unrelated generic `mockReturnValue()` calls, plus `purchase-return`/`purchase-order` legitimate matches, plus `inventory/single-writer.architecture.spec.ts` which is about `PurchaseReturnModule` importing `InventoryModule`, not Sales Return). All 166 existing suites / 1590 tests are unrelated to this milestone's scope (see T013 Closeout for baseline).

## 28. Architecture Risks

1. **`Return`/`ReturnItem` reference the wrong aggregate** (`Order`/`OrderItem`, which are never created) — using them as-is would build a module that can never actually return anything, since no Order ever exists to attach a Return to. **Must be resolved by RFC before schema work.**
2. **`ReturnStatus` scaffold enum shape diverges from the proven `PurchaseReturnStatus` shape** — reusing the existing `ReturnStatus` (`PENDING/APPROVED/REJECTED/REFUNDED`) vs. adopting the working `DRAFT/APPROVED/COMPLETED/CANCELLED` pattern is an open design choice, not a foregone conclusion.
3. **No refund mechanism exists** — Payment is IN-only, Voucher has no restore, Points have no dedicated reversal method, Debt/RECEIVABLE is never created by Checkout. A Sales Return RFC must explicitly design what "money/value back to the customer" means in this system (cash refund via new `Payment` OUT row? Store credit? A new `CustomerCredit` concept? Points-only reversal?) — none of the obvious building blocks are pre-wired.
4. **Checkout Orchestrator Freeze (AD11)** means Sales Return cannot reach back INTO the Checkout transaction to "undo" anything — it must be a fully independent write path against already-committed, immutable Invoice/InvoiceItem/Payment rows (consistent with Invoice Snapshot Freeze, AD13 — historical Invoice rows are never edited; any correction is a new document, matching how Sales Return itself should behave toward Invoice).
5. **RBAC stub permissions are stale/unwired** (`order:*`, `debt:view`, `cashbook:view`) — cannot be assumed correct or complete for the actual Sales Return feature; would need fresh permission codes matching the real domain (Invoice-based, not Order-based).
6. **Debt has no Single-Writer enforcement** (unlike Inventory) — `purchase-return` writes `tx.debt.create()` directly with no architecture test guarding it. If Sales Return also needs Debt, this gap is inherited (or an RFC could choose to formalize a Debt Domain Service as part of this work, which would itself be a meaningful scope addition worth flagging separately).

## 29. Missing Capabilities

- No Sales Return/Refund/Exchange module of any kind (service, repository, controller) — 100% net-new.
- No Payment refund (OUT direction) capability.
- No Voucher restore/decrement capability.
- No dedicated Point-reversal method (only generic `addPoint()`, usable but not purpose-built).
- No Customer Debt (RECEIVABLE) write path — and no clear scenario in the current Checkout flow that would ever populate it (always fully paid at sale time).
- No Cashbook — fully deferred, consistent with the project roadmap (T018 comes after T014/T017).
- No Credit Note / store-credit concept anywhere in the schema or code.
- No "can this invoice/line still be returned" eligibility-checking logic anywhere (time window, already-returned quantity tracking, etc.) — would be entirely new business logic.

## 30. Recommended RFC Scope

Based on the above, an RFC for T014 would need to resolve, at minimum:

1. **Aggregate reference**: Sales Return references `Invoice`/`InvoiceItem` (the real, populated aggregate), not `Order`/`OrderItem`. Likely requires either repurposing the existing `Return`/`ReturnItem` tables (rename FK columns, migration) or designing fresh tables — an explicit choice, not a default.
2. **Refund mechanism**: pick one (or a combination) of — new `Payment` OUT rows (requires un-hardcoding `direction` in `payment` module), a new `CustomerCredit`/store-credit concept, Point-only reversal, or manual/out-of-band refund (Return records the obligation, doesn't move money itself in v1).
3. **State machine**: adopt the proven `DRAFT → APPROVED → COMPLETED → CANCELLED` shape (matches `PurchaseReturnStatus`, has a working precedent) vs. the scaffold `PENDING/APPROVED/REJECTED/REFUNDED` shape — explicit decision needed.
4. **Return granularity**: whole-invoice only vs. line-level partial returns (data model supports either; business rule is undecided — see Special Questions).
5. **Repeat returns**: whether/how partial returns against the same invoice accumulate and cap at original quantity — needs explicit tracking design (e.g. a running "quantity already returned" check against `InvoiceItem.quantity`).
6. **SERVICE product returns**: whether SERVICE lines are returnable at all (no inventory implication either way, per AD14) — likely yes-with-no-inventory-effect, but must be explicit.
7. **Inventory integration**: `InventoryDomainService.increase(tx, { movementType: 'RETURN', referenceType: 'RETURN', ... })`, directly following the `PurchaseReturn.complete()` precedent — low risk, high confidence.
8. **Numbering**: new document code via `SequenceCodeGeneratorService` per AD12 — low risk, direct precedent.
9. **Permissions**: fresh `sales_return:*` (or similar) permission codes — do not assume the stale `order:*`/`debt:view` catalog entries are correct or sufficient.
10. **Debt/Customer Credit ledger**: decide whether this RFC also needs to introduce a first customer-side `Debt`(RECEIVABLE) or credit-ledger writer, or whether that's explicitly deferred to a later milestone (T017 Debt Ledger already exists in the roadmap as a separate task — worth an explicit Architect call on sequencing/overlap).

---

## Special Questions — Answers

| Question | Answer | Evidence |
|---|---|---|
| Can one invoice be returned multiple times? | **N/A — no existing mechanism.** No Return-against-Invoice code exists at all; this is a pure RFC/business-rule decision, not something current code answers either way. | §26, §29 |
| Can only some invoice lines be returned? | **N/A — open design question.** Data model (`InvoiceItem` has its own `id`/`quantity`) technically supports line-level granularity if a new Return schema references `InvoiceItem`, but nothing currently implements or constrains this. | §4, §30.4 |
| Does Inventory already support inbound movements from customer returns? | **Yes, structurally.** `InventoryDomainService.increase()` is generic (any `InventoryMovementType`), and `RETURN` already exists as both a `InventoryMovementType` and `InventoryReferenceType` value, with a working precedent in `PurchaseReturn.complete()` using `decrease()` for the opposite direction. | §10, §23, §26 |
| Are Payment Refunds already implemented? | **No.** `PrismaPaymentRepository.create()` hardcodes `direction: 'IN'`; both read methods filter `direction = 'IN'`. `PaymentDirection.OUT` exists in the enum but is never written or read anywhere. | §12 |
| Is there already a Credit Note concept? | **No.** No such model, field, or concept exists anywhere in schema or code. | §29 |
| Are Customer Points reversible? | **Partially / not purpose-built.** The ledger mechanism (`addPoint()`) is generic and could be called with a positive amount to credit points back, but there is no dedicated "reverse this specific `usePoint()` ledger entry" method — a Return flow would need to independently compute and call `addPoint()`. | §15 |
| Are Vouchers restorable? | **No.** `IVoucherRepository` only has `findActiveByCode`/`incrementUsage`; no decrement/restore method exists. | §14 |
| Can SERVICE products be returned? | **Open question, no blocker either way.** SERVICE products never touch Inventory (AD14) — a Return of a SERVICE line would logically just skip the Inventory step (mirroring Checkout's own Phase 6 skip), but this needs explicit RFC confirmation, not an inferred default. | §30.6 |
| Is Customer Debt already integrated? | **No — and current Checkout never creates any.** `Debt` model supports `customerId`/`type: RECEIVABLE`, but T013 Checkout hardcodes `dueAmount: 0` — every invoice is fully paid at creation, so there is currently no scenario where a customer AR debt exists to "return against." Only the supplier/PAYABLE side is implemented (`supplier-debt`, T012). | §9, §28.3 |
| Is Cashbook ready or deferred? | **Fully deferred.** Schema scaffold only (`CashBook`/`Expense`/`ExpenseCategory`), zero application code, no module. Matches the project roadmap where Cashbook (T018) is explicitly sequenced after Debt Ledger (T017), both after Sales Return (T014). | §3, §29 |
| Which modules will be impacted? | **Definite:** `inventory` (consumed via `InventoryDomainService.increase`, read-only impact — no changes needed to Inventory itself), `invoice` (read `Invoice`/`InvoiceItem` — likely needs a narrow read method exposed, e.g. via `InvoiceService`, since it's already the sole public surface), `rbac` (new permission codes). **Conditional on RFC decisions:** `payment` (if Payment OUT refunds are chosen — requires un-hardcoding `direction`), `customer-point` (if point reversal is chosen — `addPoint()` already usable as-is), `checkout` module is **NOT** expected to change (AD11 freeze; Sales Return is a fully independent write path against already-committed data). | §11, §12, §15, §17, §21, §28.4 |

---

## Files Inspected

`backend/prisma/schema.prisma` (Invoice/InvoiceItem/Order/OrderItem/Return/ReturnItem/Debt/CashBook/Expense/ExpenseCategory/InventoryMovement/Payment/Voucher/CustomerPointLedger models + all related enums); `backend/src/modules/{cart,checkout,invoice,payment,inventory,customer,customer-point,product,unit,branch,warehouse,purchase-return,rbac,platform/audit-log,platform/events}/**` (services, repositories, controllers, DTOs, module wiring, architecture specs); `backend/src/modules/rbac/infrastructure/permission-catalog.ts`; directory listing of `backend/src/modules` (confirms no `order`/`sales-return`/`customer-debt`/`cashbook` module exists); project-wide grep for `Return`/`Refund` across all `.spec.ts` files.

## Dependency Graph (proposed, pending RFC confirmation)

```
Invoice (read-only, via InvoiceService)
Product/Unit (read-only, via existing Domain Services — mirrors Checkout Phase 5 pattern)
        │
        ▼
  Sales Return (NEW module)
        │
        ├──► InventoryDomainService.increase()  [decided, low-risk — direct precedent]
        ├──► SequenceCodeGeneratorService        [decided, per AD12]
        ├──► AuditLogService                     [decided, standard pattern]
        ├──► DomainEventPublisher                [decided, standard pattern — new event names TBD]
        │
        └──► Refund mechanism — ONE OF (RFC MUST DECIDE):
               ├─ PaymentService (extended to support OUT direction)
               ├─ CustomerPointDomainService.addPoint() (reuse as-is)
               ├─ New CustomerCredit/store-credit concept (net-new)
               └─ Manual/out-of-band (v1 defers money movement entirely)
```

`checkout` module: **no inbound or outbound dependency** — Sales Return does not call into Checkout, and Checkout does not need to know Sales Return exists (AD11 freeze respected by construction).

## Open Questions (for the Architect, not decided here)

1. Repurpose existing `Return`/`ReturnItem` tables (migrate FKs from Order→Invoice) or design fresh tables?
2. Which refund mechanism(s) are in scope for T014 v1 — all of them, one, or none (record-only)?
3. Adopt `PurchaseReturnStatus`-shaped state machine or the scaffold `ReturnStatus` shape?
4. Whole-invoice-only or line-level partial returns for v1?
5. Does T014 also introduce the first customer-side Debt/RECEIVABLE writer, or is that explicitly out of scope (deferred to T017)?
6. Should the stale `order:*`/`debt:view`/`cashbook:view` RBAC catalog entries be cleaned up as part of this work, or left alone (out of scope, separate cleanup task)?

## Recommendations

Do not proceed to RFC drafting assuming the existing `Return`/`ReturnItem`/`ReturnStatus` scaffold is usable as-is — it is built against an aggregate (`Order`) that the actual system never creates. The RFC author should treat `PurchaseReturn` as the primary structural template (proven, tested, in production-shaped code) rather than the dormant `Return` scaffold, and must make an explicit, disclosed choice on the refund-mechanism question (§30.2) before implementation, since none of cash/voucher/point refund paths are currently wired end-to-end.

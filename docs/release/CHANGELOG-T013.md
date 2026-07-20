# Changelog — T013: Sales Foundation

Reference: `RFC-T013` v2 (`docs/rfc/RFC-T013-sales-foundation.md`) · `SPEC-T013-SALES-FOUNDATION-001` v2 (`docs/specifications/SPEC-T013-SALES-FOUNDATION-001.md`) · `docs/implementation/IMPLEMENTATION-PLAN-T013-SALES-FOUNDATION.md` · Architect Decisions AD07-AD16 (`docs/project-governance/AI_WORKFLOW.md`).

---

## Added

- **`checkout_operations` table** (Phase 1, migration `20260719000000_checkout_operations`) — idempotency support for `POST /checkout`. 2-transaction design: a durable "Reserve" commit precedes the Business Transaction, enabling real crash/timeout recovery (not just theoretical).
- **`Idempotency-Key` header** — now required on `POST /checkout`. Retry Policy: same-key-same-payload → REPLAY (returns cached Invoice/Payment); same-key-different-payload → `409 CHECKOUT_IDEMPOTENCY_KEY_REUSED`; in-flight (<2min) → `409 CHECKOUT_IDEMPOTENCY_CONFLICT`; stuck (≥2min) or `FAILED` → automatic reclaim → new attempt.
- **`CartDomainService`, `CustomerPointDomainService`** (Phase 2) — new narrow-surface Domain Services, sole exports of `CartModule`/`CustomerPointModule`.
- **Invoice Snapshot fields** (Phase 5, migration `20260720000000_invoice_snapshot_fields`) — `Invoice.customerCodeSnapshot`/`customerNameSnapshot`/`customerPhoneSnapshot`; `InvoiceItem.productCodeSnapshot`/`productNameSnapshot`/`unitNameSnapshot` (Mandatory, always written on successful checkout); `InvoiceItem.barcodeId`/`barcodeSnapshot` (Conditional, currently always `null` — see Known Limitations in `docs/release/RELEASE-NOTES-T013.md`).
- **Service Product support** (Phase 6) — `Product.type === 'SERVICE'` lines are sellable, appear on `InvoiceItem`/`Payment`, participate in discount/voucher/tax exactly like STOCK lines, but are excluded from `InventoryDomainService.decrease()`. Mixed STOCK+SERVICE invoices verified.
- **Branch-scoped invoice numbering** (Phase 4) — `SequenceInvoiceCodeGenerator` now uses `Branch.invoicePrefix` (fallback `"HD"`) and a per-branch sequence (`invoice_code_<branchId>`), reusing `SequenceCodeGeneratorService` (T012) instead of a bespoke generator.

## Changed

- **`InvoiceModule`/`PaymentModule` exports** (Phase 2) — `INVOICE_REPOSITORY`/`PAYMENT_REPOSITORY` removed from `exports`; only `InvoiceService`/`PaymentService` remain public.
- **`CheckoutService` constructor** (Phase 3) — now injects `CartDomainService`/`CustomerPointDomainService`/`ProductDomainService`/`UnitDomainService` instead of raw repositories/fewer dependencies; `checkout()` gained a required 3rd parameter (`idempotencyKey`).
- **`CHECKOUT_FAILED_EVENT` firing behavior** (Phase 3) — now fires for every failure after a successful `reserve()`, including early validation errors (Cart/Customer/Voucher/Product/Unit not found) — previously only fired for mid/post-transaction failures.
- **Invoice number format** (Phase 4) — new invoices use a branch-scoped sequence; existing invoice numbers are untouched.

## Fixed

- **Repository Boundary violations** (Phase 2, ADR-0010) — `cart`, `customer-point`, `invoice`, `payment` modules previously exported raw repository tokens/interfaces consumable cross-module; all four now export only a narrow Service/Domain Service surface. Verified via 5 dedicated Architecture Tests + manual project-wide grep (zero remaining violations across all 5 boundaries including `checkout-operation`).
- **1-transaction idempotency design flaw** (Phase 1) — the original design (reserve + business logic in one transaction) could never produce a durably-observable `PROCESSING` row, making crash recovery structurally impossible. Redesigned into 2 sequential transactions to fix this.
- **`CheckoutController.checkout` missing `async`** (Phase 3) — synchronous guard-clause throw wasn't observable via `.rejects.toThrow()` in unit tests (NestJS's runtime exception filter handled it correctly regardless); fixed by adding `async`.

## Breaking Changes

| Change | Before | After |
|---|---|---|
| `POST /checkout` | No header required | Requires `Idempotency-Key` header (`400 CHECKOUT_IDEMPOTENCY_KEY_MISSING` if missing) |
| `POST /checkout` response | No Snapshot fields | +6 Mandatory Snapshot fields + 2 Conditional fields (additive only — existing clients unaffected) |
| `CHECKOUT_FAILED_EVENT` | Fired only for transaction-phase failures | Fires for all failures after successful reserve |
| Invoice numbering | One sequence per Organization | One sequence per Branch (historical numbers unaffected) |
| `InvoiceModule`/`PaymentModule` exports | Repository token + Service both exported | Only Service exported |

Project is still `v0.x` with no real production customers — breaking-change risk is internal only. All changes went through RFC v2 + SPEC v2 + 7 Architect-reviewed phases; each is a disclosed, intentional design decision.

## Migration Notes

Two independent migrations, apply in this order:

1. `20260719000000_checkout_operations` — creates `CheckoutOperationStatus` enum + `checkout_operations` table. No dependency on migration 2.
2. `20260720000000_invoice_snapshot_fields` — adds 8 nullable columns to `invoices`/`invoice_items` + FK to `barcodes`. No backfill of historical rows (columns are nullable by design).

Neither has been run against a real Postgres instance in this development sandbox (no Docker available) — both include `rollback.sql` for reverse application, following the project's established pattern (T009-T012).

## Upgrade Notes

- **API consumers** must send an `Idempotency-Key` header (client-generated, e.g. UUID) on every `POST /checkout` call going forward — requests without it will now receive `400`.
- **API consumers reading Invoice responses** will see new nullable fields; no action required unless strict schema validation rejects unknown fields.
- **No consumer of `INVOICE_REPOSITORY`/`PAYMENT_REPOSITORY`/`CART_REPOSITORY`/`CUSTOMER_POINT_REPOSITORY` exists outside their own modules** (verified) — no cross-module code changes needed on upgrade.
- Historical invoice numbers and historical Invoice/InvoiceItem Snapshot fields (`null`) require no data migration or backfill.

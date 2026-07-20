# T013 Closeout — Sales Foundation

**Status:** Architect APPROVED (all 7 Phases). Ready for merge/future release — commit/tag/release still pending a separate Final Release Review + Authorization (Decision AD16).
**References:** RFC-T013 v2 (`docs/rfc/RFC-T013-sales-foundation.md`) · SPEC-T013-SALES-FOUNDATION-001 v2 (`docs/specifications/SPEC-T013-SALES-FOUNDATION-001.md`) · Implementation Plan (`docs/implementation/IMPLEMENTATION-PLAN-T013-SALES-FOUNDATION.md`) · Architect Decisions AD07-AD16 (`docs/project-governance/AI_WORKFLOW.md`).

---

## 1. RFC List

| Version | File | Status |
|---|---|---|
| RFC-T013 v1 | `docs/rfc/RFC-T013-sales-foundation.md` (superseded content preserved in "Lịch sử quyết định") | Superseded by v2 after Architecture Review |
| RFC-T013 v2 | `docs/rfc/RFC-T013-sales-foundation.md` (current) | APPROVED — reflects AR01-AR18 Architect Resolution |

## 2. SPEC List

| Version | File | Status |
|---|---|---|
| SPEC-T013-SALES-FOUNDATION-001 v1 | `docs/specifications/SPEC-T013-SALES-FOUNDATION-001.md` (superseded) | Superseded by v2 after SPEC Review |
| SPEC-T013-SALES-FOUNDATION-001 v2 | `docs/specifications/SPEC-T013-SALES-FOUNDATION-001.md` (current) | APPROVED — reflects SP01-SP12 + Retry Policy addendum |

## 3. Architect Decisions (AD09–AD16)

All recorded in `docs/project-governance/AI_WORKFLOW.md`. Two earlier T013 decisions (AD07, AD08) predate this range but are prerequisite context:

| Decision | Name | Issued After | Summary |
|---|---|---|---|
| *AD07* | *Checkout Command Pattern* | *SPEC Review* | *`Cart → Checkout Command → Atomic Business Transaction → Immutable Invoice`, never CRUD Invoice (context for AD09-14)* |
| *AD08* | *Phase Gate Policy* | *Implementation Plan approval* | *One implementation phase executed at a time, Architect Review required between each (context for AD09-14)* |
| **AD09** | Stable Infrastructure Baseline | Phase 1 | `checkout_operations` schema/API/Domain Service frozen after Phase 1 approval |
| **AD10** | Repository Boundary Freeze | Phase 2 | cart/invoice/payment/customer-point export boundaries frozen |
| **AD11** | Checkout Orchestrator Freeze | Phase 3 | `CheckoutService` is Stable Orchestrator; future orchestration changes require new RFC |
| **AD12** | Numbering Policy Freeze | Phase 4 | All new document numbers must reuse `SequenceCodeGeneratorService`; no new duplicated generators without RFC |
| **AD13** | Invoice Snapshot Freeze | Phase 5 | Snapshot fields are immutable historical record; future corrections use Adjustment/Credit Note/Return, never edit Snapshot |
| **AD14** | Product Type Policy Freeze | Phase 6 | STOCK/SERVICE are the two official Product types; new types (DIGITAL, SUBSCRIPTION...) require their own RFC |
| **AD15** | T013 Architecture Baseline | Phase 7 | Entire T013 architecture (AD07-AD14) is now project Baseline; future changes need RFC + backward compatibility |
| **AD16** | Release Governance | Phase 7 | Tag only after a dedicated Final Release Review; release commit must reference RFC/SPEC/Phase 7 report; no feature bundling across releases |

## 4. Implementation Summary

| Phase | Name | Outcome |
|---|---|---|
| 1 | Idempotency Foundation | APPROVED — `checkout_operations` table, 2-transaction design (Reserve durable-commit + Business Transaction), full Retry Policy (REPLAY/409-reused/409-conflict/reclaim) |
| 2 | Repository Boundary Cleanup | APPROVED — `CartDomainService`/`CustomerPointDomainService` (new), `InvoiceModule`/`PaymentModule` export narrowed to Service only |
| 3 | Checkout Refactor | APPROVED WITH MINOR REVISIONS — full idempotency integration into `CheckoutService`/`CheckoutController`, `Idempotency-Key` header required, `markFailed()` widened to all post-reserve failure paths |
| 4 | Invoice Number Integration | APPROVED — `SequenceInvoiceCodeGenerator` reuses `Branch.invoicePrefix` + `SequenceCodeGeneratorService`, branch-scoped sequence, no migration needed |
| 5 | Invoice Snapshot | APPROVED — Mandatory (Customer/Product/Unit) + Conditional (Barcode, currently always null) snapshot fields, nullable columns, no backfill |
| 6 | Service Product Support | APPROVED — SERVICE products skip `InventoryDomainService.decrease()`, reusing Phase 5's Product lookup; mixed STOCK+SERVICE invoices verified |
| 7 | Final Regression & Release Readiness | APPROVED — verification-only, 0 new code; full regression re-run twice (both fully clean); manual Repository Boundary grep cross-check (0 violations); Release Readiness Checklist 7/7 PASS |

## 5. Migration Summary

| Migration | Phase | Content | Rollback |
|---|---|---|---|
| `20260719000000_checkout_operations` | 1 | `CREATE TYPE CheckoutOperationStatus`, `CREATE TABLE checkout_operations` (unique `(organizationId, idempotencyKey)`, index `(status, createdAt)`, index `(expiresAt)`) | `rollback.sql` — `DROP TABLE`/`DROP TYPE` |
| `20260720000000_invoice_snapshot_fields` | 5 | 8 nullable columns on `invoices`/`invoice_items` + FK `invoice_items.barcodeId → barcodes.id` + index | `rollback.sql` — 8 `DROP COLUMN` + drop FK/index |

**Neither migration has been run against a real Postgres instance yet** (no Docker in this dev sandbox, consistent with T009-T012 precedent).

## 6. Test Summary

- **Full regression** (run twice at Phase 7): **166/166 test suites PASS, 1584/1584 tests PASS**, both runs fully clean (zero flakes triggered either run).
- **Scoped module runs** across all 7 phases: consistently green at every phase gate (see individual Phase Implementation Reports for exact per-phase counts).
- **Architecture Tests**: 5 Repository Boundary specs (`cart`, `checkout-operation`, `customer-point`, `invoice`, `payment`) — all passing, cross-verified via manual grep (zero raw-token leaks outside owning module).
- **Build / TypeCheck / Lint / Prisma Validate**: clean at every phase gate, re-confirmed clean at Phase 7.

## 7. Coverage Summary

| Module | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| `checkout` | 97.75–100% | 85.9–100% | 95.45–100% | 98.25–100% |
| `invoice` | 95.91–100% | 75–92.85% | 100% (excl. DTO getters) | 98–100% |
| `customer-point` | 97.77–100% | 80–100% | 100% | 97.56–100% |
| `payment` | 100% | 75–100% | 100% | 100% |
| `cart` | 100% (Phase 2 baseline, unchanged) | 100% | 100% | 100% |

Ranges reflect per-file variation within each module (see Phase 1/2/5/6 Implementation Reports for exact per-file breakdowns). No coverage regression detected at any phase boundary.

## 8. Known Technical Debt

1. **Barcode Conditional Snapshot never populated** — `CartItemEntity` has no field recording barcode-scan origin; `InvoiceItem.barcodeId`/`barcodeSnapshot` always `null`. Requires a Cart data-model RFC to resolve.
2. **`checkout_operations` Cleanup Job not built** — only lazy `tryReclaim()` recovery exists; proactive expired-row deletion / stuck-`PROCESSING`-to-`FAILED` job is not implemented.
3. **`BranchModule` still exports raw `BRANCH_REPOSITORY`** — never went through a Repository Boundary Cleanup pass; now also consumed by `invoice` (Phase 4). Pre-existing gap, unrelated to T013's own 5 cleaned boundaries.
4. **8 pre-T012 `Sequence*Generator` classes** (branch, inventory-adjustment, organization, product/sku, purchase-order, purchase-return, stock-count, transfer) still duplicate `prisma.sequence.upsert()` logic instead of `SequenceCodeGeneratorService` — explicitly outside AD12's retroactive scope.
5. **Naming deviation**: `InvoiceService`/`PaymentService` kept their existing names instead of being renamed to `InvoiceDomainService`/`PaymentDomainService` as literally requested in Phase 2 — disclosed and accepted, no functional gap.
6. **Terminology drift**: SPEC v2 specifies `'SUCCEEDED'`; shipped code uses `'COMPLETED'` for `CheckoutOperationStatus` (per the Architect's Phase 1 authorization wording) — cosmetic only.

## 9. Known Existing Flakes

- **`argon2-password-hasher.spec.ts`** — intermittent timeout under parallel Jest workers (CPU contention), passes reliably with `--runInBand`. Pre-dates T013 (first observed at T009/T011). Did not trigger in either of Phase 7's two full-regression runs.

## 10. Outstanding TODOs

None identified. All 7 phases closed with no open `it.todo()` placeholders remaining (the 2 introduced in Phase 2 for Repository Boundary Architecture Tests were completed and un-skipped in Phase 3). No deferred implementation items within T013's approved scope.

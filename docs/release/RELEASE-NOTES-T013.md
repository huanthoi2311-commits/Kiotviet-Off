# Release Notes — T013: Sales Foundation

**Audience:** Developers · QA · Operations
**Status:** Architect APPROVED at architecture level (7/7 Phases). Tag/commit/release still pending a dedicated Final Release Review (Decision AD16).
**References:** `RFC-T013` v2, `SPEC-T013-SALES-FOUNDATION-001` v2, `docs/implementation/T013-CLOSEOUT.md`, `docs/implementation/IMPLEMENTATION-PLAN-T013-SALES-FOUNDATION.md`, Architect Decisions AD07-AD16 (`docs/project-governance/AI_WORKFLOW.md`).

---

## New Features

- **Idempotent checkout.** `POST /checkout` now requires an `Idempotency-Key` header. Retrying the same request with the same key and payload safely returns the original result instead of creating a duplicate sale — even if the original request crashed or timed out mid-flight.
- **Invoice Snapshot.** Every new invoice permanently records the customer's code/name/phone and each line's product code/name/unit name *as they were at the moment of sale*. Later edits or archival of that Customer/Product/Unit will never retroactively change an already-issued invoice.
- **Service Product sales.** Products marked as `SERVICE` (e.g. delivery fees, installation charges) can now be sold through Checkout alongside physical goods — priced, discounted, taxed, and invoiced exactly like a stocked item, but without ever touching inventory.
- **Branch-aware invoice numbering.** Invoice numbers now use each Branch's own configured prefix (falling back to `HD` if unset) and their own numbering sequence, so two branches in the same organization no longer share one running number.

## Internal Improvements

- **Repository Boundary cleanup** across `cart`, `customer-point`, `invoice`, `payment` — each module now exposes only a narrow, purpose-built service to the rest of the codebase instead of its raw database repository. Reduces the chance that future changes accidentally couple modules together.
- **Checkout orchestration hardening** — the checkout flow's failure handling is now more consistent: any failure after the request is accepted for processing reliably releases its idempotency key, instead of only doing so for a subset of failure types.
- **Shared invoice-numbering infrastructure** — invoice numbers now reuse the same underlying sequence-generation service introduced for Supplier codes in T012, rather than a bespoke implementation.

## Database Changes

Two additive migrations (both nullable/no-backfill, both include tested rollback scripts):

1. `checkout_operations` — new table supporting the idempotency feature. Not referenced by any pre-existing table; purely additive.
2. Invoice Snapshot columns — 8 new nullable columns added to `invoices` and `invoice_items`, plus a nullable foreign key from `invoice_items` to `barcodes`. Existing rows are left untouched (all new columns are `NULL` on historical data).

**Neither migration has been executed against a live database yet** — both were authored and schema-validated in a Docker-less development sandbox, consistent with this project's established pattern for every prior release (T009 through T012). Operations should plan to run both migrations, in the order listed, before deploying the corresponding application build.

## Compatibility

- **Backward compatible for existing API consumers** reading Invoice responses — all new fields are additive (nullable), no field was removed or renamed.
- **Breaking for `POST /checkout` callers** — the `Idempotency-Key` header is now mandatory; requests without it receive `400 CHECKOUT_IDEMPOTENCY_KEY_MISSING`. Any integration calling this endpoint must be updated to send a client-generated key (e.g. a UUID per checkout attempt).
- **Historical data is fully preserved** — no existing invoice numbers, invoice records, or line items are modified by this release.

## Deployment Notes

1. Apply migration `20260719000000_checkout_operations` first, then `20260720000000_invoice_snapshot_fields`.
2. Run `prisma generate` after migrations to refresh the Prisma Client (schema changed).
3. No environment variable or configuration changes are required.
4. No new external service dependencies were introduced.
5. Recommended smoke test after deploy: one checkout with a fresh `Idempotency-Key` (expect success), then immediately retry the identical request with the same key and payload (expect the same Invoice/Payment returned, no duplicate created).

## Rollback Notes

- Both migrations ship a `rollback.sql`:
  - `checkout_operations`: drops the table and its enum type. Safe at any time — no other table has a foreign key into it.
  - Invoice Snapshot: drops the 8 added columns (and the FK/index) from `invoices`/`invoice_items`. Safe — no downstream table depends on these columns.
- **Rolling back the code without rolling back the migrations is not recommended** — older application code doesn't populate the new snapshot columns or use the idempotency table, but their presence in the schema is harmless to older code (extra nullable columns it simply never reads/writes).
- **Rolling back past this release requires reverting the `Idempotency-Key` requirement** on any client integrations that have already been updated to send it, or those calls will start failing against the older API version (which doesn't recognize/require the header but also won't reject it — the header would simply be ignored).

## Known Limitations

- **Barcode Snapshot is always empty.** The Cart doesn't currently record whether a line item was added via a specific barcode scan, so `InvoiceItem.barcodeId`/`barcodeSnapshot` are always `null` on every invoice, even though the columns and the read API support them. Populating this correctly would require a Cart data-model change, which is out of this release's scope.
- **No automatic cleanup of expired idempotency records.** Old `checkout_operations` rows aren't proactively deleted or auto-marked as failed — a stuck request is only resolved lazily, the next time a request arrives with the same key.
- **Integration/E2E tests requiring a live database have not been run** in this development environment (no Docker available) — only unit and architecture-level tests have executed. A Docker-enabled environment should run the full integration suite before production rollout.
- A handful of pre-existing generator classes (unrelated to Sales — e.g. Branch, Purchase Order, Transfer numbering) still duplicate logic that this release's shared infrastructure could otherwise absorb; left untouched as they were out of scope for this milestone.

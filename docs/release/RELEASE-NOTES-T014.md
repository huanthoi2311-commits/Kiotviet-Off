# Release Notes — T014: Sales Return & Exchange

**Audience:** Developers · QA · Operations
**Status:** RELEASED — tagged `v0.10.0-sales-return-exchange`, committed (`4223f16`) and pushed to `origin/feature/T014-sales-return`.
**References:** `RFC-T014-SALES-RETURN-EXCHANGE.md` v1.1, `SPEC-T014-SALES-RETURN-EXCHANGE-001`, Architect Decisions AD27-AD46 (`docs/project-governance/AI_WORKFLOW.md`), `docs/architecture/T014-rfc-v1.1-architecture-review.md`.

---

## New Features

- **Sales Return.** A new `SalesReturn` document lets staff record goods a customer brings back against a past Invoice, independent of the (unused) legacy Order-based scaffold. Lifecycle: `DRAFT → SUBMITTED → APPROVED → RECEIVED → COMPLETED`, with `CANCELLED` reachable from any state before `RECEIVED`.
- **Refund, fully independent of Return status.** A `SalesReturn` can carry zero, one, or several `SalesReturnRefund` records, each with its own lifecycle (`PENDING → PROCESSING → COMPLETED|FAILED`, or `PENDING → CANCELLED`). A Return can be marked `COMPLETED` with no refund issued at all, or with a refund still pending — Refund and Return no longer force each other's state.
- **Inventory restored automatically on Receive.** When a Return moves to `RECEIVED`, stock-managed line items automatically restore quantity to the original selling warehouse (or a warehouse the operator selects, if it can't be inferred). Service-type products are skipped — nothing is restored to inventory for them.
- **Return-eligibility lookup.** `GET /sales-returns/eligibility?invoiceId=` reports, per line of a given Invoice, how much quantity is still eligible to be returned — useful for the UI to warn staff before they submit an over-quantity request.
- **Exchange, via two client-side requests.** "Exchange" is implemented as a Return followed by a normal new Checkout sale — there is no new atomic "exchange" endpoint and no shared database transaction between the two calls (by design, see Known Limitations).
- **10 new permissions** under `sales_return:{view, create, update, submit, approve, receive, complete, cancel, refund, view_refund}`, enforced on every new route.

## Internal Improvements

- **Over-return protection under real concurrency (Decision AD44).** The one mechanism a naive implementation gets wrong: `SalesReturn.version` (optimistic lock) only protects one document from being edited twice at once — it cannot stop *two different* Return documents from both successfully returning against the same sold line. `Receive` now takes a Postgres row lock (`SELECT ... FOR UPDATE`, deterministically ordered) on the underlying Invoice lines before re-validating the remaining eligible quantity, closing that gap.
- **Transaction ownership clarified (Decision AD46).** The Application Service — not the repository — owns the database transaction for `Receive`, so inventory restoration and the concurrency-safe status transition commit or roll back together atomically.
- **Repository Boundary maintained.** `sales-return`'s repository is not exported from its module and is never imported elsewhere; all cross-module reads (Invoice, Product, Inventory) go through each module's own narrow domain service. Verified by a dedicated architecture test.
- **Numbering reuses shared infrastructure.** Return codes (`SR000001`, ...) are generated through the same `SequenceCodeGeneratorService` introduced for Supplier/Invoice numbering, not a bespoke copy of the older Purchase Return generator.

## Database Changes

One additive migration, with a tested rollback script:

- `sales_returns`, `sales_return_items`, `sales_return_refunds` — three new tables plus three new enum types (`SalesReturnStatus`, `SalesReturnReason`, `SalesReturnRefundStatus`). No existing table (`invoices`, `invoice_items`, `payments`, or the legacy `returns`/`orders` scaffold) is altered in any way.

The 10 new `sales_return:*` permissions are **not** part of a SQL migration — they are added to the application-level `PERMISSION_CATALOG` and synced into the `permissions` table by the existing `prisma db seed` script (idempotent upsert by code), the same mechanism every prior permission addition has used.

## Compatibility

- **Fully additive.** No existing endpoint, DTO field, or database column was changed or removed. Every new route lives under the new `/sales-returns` prefix.
- **Historical data untouched.** No Invoice, InvoiceItem, or Payment record is modified by this release — Sales Return only reads them.
- **New permissions default to nobody except the seeded Owner role.** Any non-Owner role that should be able to process returns/refunds needs those 10 permissions granted explicitly through existing Role management before staff using that role can use the feature.

## Deployment Notes

1. Apply migration `20260721000000_sales_returns`.
2. Run `prisma generate` to refresh the Prisma Client (schema changed).
3. Run `prisma db seed` (or ensure your deployment's existing seed step runs) so the 10 new `sales_return:*` permissions exist in the `permissions` table.
4. No environment variable or configuration changes are required.
5. No new external service dependencies were introduced.
6. Recommended smoke test after deploy: create a Return against a completed Invoice, submit → approve → receive it, confirm the stock-managed line's inventory increases in the expected warehouse, then create and complete a Refund against it.

## Rollback Notes

- `sales_returns` migration ships a `rollback.sql`: drops the three new tables (in FK-safe order) and the three new enum types. Safe at any time — no other table has a foreign key into any of them.
- The 10 seeded permissions can be left in place harmlessly if rolling back code only; removing them requires confirming no Role has been granted them first.
- **Rolling back the code without rolling back the migration is safe** — older application code simply never reads or writes the new tables.

## Known Limitations

- **Concurrency Gate not verified against a real Postgres instance.** The `SELECT ... FOR UPDATE` row-lock behavior that prevents over-return under concurrent Receive requests (Decision AD44) has full unit-level test coverage of the query logic and the recalculation, but the actual Postgres locking/blocking behavior has not been exercised end-to-end — this development environment has no Docker/Postgres available (confirmed, not assumed). Same posture as every prior release (T009–T013). **Roadmap:** to be confirmed in an integration environment with a real Postgres instance before production rollout — not deferred indefinitely.
- **Exchange is not atomic.** A Return and its replacement sale are two independent HTTP requests from the client; there is no distributed transaction tying them together. If the second request (the new Checkout) fails after the Return is already `RECEIVED`, the customer's original item has been returned/restocked but no new sale has been recorded — the client is responsible for retrying or reconciling.
- **Product-type reclassification edge case.** Whether a returned line skips inventory restoration is decided by the product's *current* type (`SERVICE` or not) at the moment of Receive, not its type at the moment of the original sale (which isn't recorded on the Invoice line). If a product is ever changed from stock-managed to Service (or back) between sale and return, the Return will follow its current classification — accepted as a low-probability, low-impact limitation rather than adding a new snapshot column to the frozen Invoice schema.
- **`sales_return:view_refund` has no dedicated endpoint yet.** Refund details are currently only visible embedded inside the parent Return's detail response (gated by `sales_return:view`); the permission exists per SPEC but nothing separately gates a refund-only view. **Roadmap:** to be considered in a later milestone only if a standalone Refund-view use case is actually requested — not a known regression.
- **Cross-branch returns are out of scope.** A Return always inherits its Invoice's branch; there is no option to process a return at a different branch than where the sale occurred.
- **Return value allocation is a linear approximation.** Each returned line's refundable value is calculated proportionally from the original line's total (`unitPrice`, discount, and tax already blended in), not recomputed independently — this can differ from the original by rounding of a few currency units on large or oddly-divisible quantities.

## Architecture Decisions

| Decision | Description |
|---|---|
| AD37/AD43 | Refund lifecycle is fully independent of `SalesReturn.status` — no `REFUNDED` intermediate state |
| AD41 | `SalesReturn.version` (optimistic lock) protects a single document from concurrent edits to itself only |
| AD44 | Raw-SQL `InvoiceItem` row-lock (`SELECT ... FOR UPDATE`) is the actual mechanism preventing over-return across *different* Return documents |
| AD45 | `SERVICE`-type products bypass inventory restoration entirely at Receive |
| AD46 | The Application Service, not the repository, owns the database transaction for `Receive` |

(Full list AD27–AD46: `docs/project-governance/AI_WORKFLOW.md`.)

## Operational Notes

Existing invoices remain fully compatible. No data migration or backfill is required beyond applying the additive schema migration and running the latest seed — historical Invoices, InvoiceItems, and Payments are read-only inputs to this feature and are never modified by it.

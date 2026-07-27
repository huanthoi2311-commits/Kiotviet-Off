# RFC-T014-SALES-RETURN-EXCHANGE

**Version:** v1.1  
**Status:** Architect Revision — Ready for Architecture Review  
**Milestone:** T014 — Sales Return & Exchange  
**Author:** Architect  
**Reviewers:** Architecture Review Board, Claude Code

## Document history

| Version | Status | Summary |
|---|---|---|
| v1.0 | Not Approved | Initial draft; review found two critical blockers and nine secondary findings. |
| v1.1 | Ready for Review | Resolves A1, A2 and B1–B9; introduces AD43–AD45. |

## Dependencies

- RFC-T013 and SPEC-T013 — Sales Foundation
- T014 Sales Return Discovery Report
- `PROJECT_RULES.md`
- `AI_WORKFLOW.md`
- Architect Decisions AD27–AD45

## Decision provenance

AD27–AD34 were issued during the T014 Discovery Architect Review. AD35–AD42 originated in RFC-T014 v1.0. AD43–AD45 are introduced by this revision. These decisions are normative even if the central decision-history document has not yet been updated.

---

# 1. Abstract

This RFC defines Sales Return & Exchange for the POS platform.

It introduces an auditable, Invoice-based return workflow while preserving the T013 architecture:

- Invoice and InvoiceItem remain immutable.
- SalesReturn is an independent Aggregate Root.
- Partial and multiple returns are supported.
- Eligible quantity is derived.
- Over-return is prevented by serializing final eligibility validation per InvoiceItem.
- Stock restoration uses `InventoryDomainService` only.
- SERVICE/non-stock items do not create inventory movements.
- Refund is optional and has a lifecycle independent from Return.
- Exchange is modeled as Return plus New Sale.
- Audit follows the actual capability of `AuditLogService`.
- Payment remains unchanged.

# 2. Background

T013 Checkout writes directly to Invoice, InvoiceItem, InventoryMovement and Payment. It does not create Order.

T014 Discovery found a dormant Return/ReturnItem scaffold linked to Order/OrderItem. Because Order is absent from the production checkout flow, that scaffold is incompatible and SHALL NOT be reused as the T014 aggregate.

# 3. Problem statement

The current platform lacks a production workflow for customer returns, partial and repeated returns, return eligibility, stock restoration, optional refunds, exchanges, audit, events and return-specific RBAC.

Manual workarounds risk stock inconsistency, duplicate refunds, over-return and loss of traceability.

# 4. Goals

T014 SHALL provide:

1. SalesReturn and SalesReturnItem.
2. Partial returns.
3. Multiple returns against one Invoice.
4. Derived eligible quantity.
5. Concurrency-safe over-return prevention.
6. Inventory restoration for stock-managed items.
7. Inventory bypass for SERVICE/non-stock items.
8. Independent optional Refund records and lifecycle.
9. Exchange as Return plus New Sale.
10. Sequence numbering, RBAC, audit and domain events.
11. Backward compatibility with T013.

# 5. Non-goals

T014 SHALL NOT implement Cashbook, General Ledger, Accounting Journal, Customer Debt Ledger, Credit Note, Loyalty reversal, Voucher restoration, Store Credit, BI/reporting, external ERP/WMS sync, or Purchase Return redesign.

# 6. Brownfield constraints

Reusable components:

- `InventoryDomainService.increase()`
- `InventoryMovementType.RETURN`
- `InventoryReferenceType.RETURN`
- `SequenceCodeGeneratorService`
- `AuditLogService`
- `DomainEventPublisher`
- PurchaseReturn as a structural precedent

Known constraints:

- Payment is inbound-sale oriented and is not a generic refund ledger.
- `AuditLogService.log()` does not accept transaction context.
- Existing permissions use `resource:action`.
- Existing generated codes use six-digit padding.
- Value Objects and CQRS are not established project-wide patterns.

# 7. Terminology

**Invoice:** immutable completed sales document.  
**SalesReturn:** business document accepting sold goods/services back.  
**ReturnItem:** line referencing one InvoiceItem.  
**Refund:** optional outbound financial action owned by SalesReturn; not a Return status.  
**Exchange:** Return plus a separate New Sale.  
**Counted returned quantity:** quantities from Returns in `RECEIVED` or `COMPLETED`.  
**Eligible quantity:** `SoldQty - CountedReturnedQty`.

# 8. Architectural principles

1. Invoice is immutable.
2. SalesReturn is an independent aggregate.
3. Inventory history is append-only.
4. Inventory writes use the Inventory Single Writer.
5. Repository boundaries cannot be bypassed.
6. Domain rules are enforced server-side.
7. Return completion is independent from Refund completion.
8. Eligibility is derived and not stored on InvoiceItem.
9. Final eligibility validation is serialized per InvoiceItem.
10. Events publish after successful commit.
11. Audit follows current service capability.
12. Checkout remains unchanged.

# 9. Aggregate boundary

```text
SalesReturn
├── SalesReturnItem[]
├── Refund[]
├── Status
├── Version
└── DomainEvents[]
```

SalesReturn does not own Invoice, Inventory, Product, Customer or Payment.

# 10. Existing Architect Decisions

- **AD27:** Return references Invoice/InvoiceItem; Order is not revived.
- **AD28:** Return is an independent aggregate and never mutates historical Invoice data.
- **AD29:** Inventory history remains append-only and restoration uses InventoryDomainService.
- **AD30:** Partial returns are supported.
- **AD31:** Multiple returns are supported within cumulative quantity limits.
- **AD32:** Return and Refund are separate concepts.
- **AD33:** Cashbook is outside T014.
- **AD34:** PurchaseReturn may be used as an adapted structural precedent.

# 11. Invoice eligibility

A Return may reference only an Invoice that exists, belongs to the current Organization, and is in the repository's finalized/completed sales state.

Draft, voided, cancelled, deleted or otherwise invalidated invoices are not eligible. Exact enum names SHALL be mapped in SPEC-T014.

Invoice and InvoiceItem remain read-only.

# 12. Organization, customer, branch and warehouse

- Return and Invoice SHALL belong to the same Organization.
- Customer is inherited from Invoice and cannot be replaced.
- Anonymous invoices follow the existing anonymous-sale policy.
- Default branch policy is Return branch equals Invoice branch.
- Cross-branch return is out of scope.
- Stock-managed lines require a validated destination warehouse.

# 13. Eligibility calculation

For each InvoiceItem:

```text
EligibleQty = SoldQty - SUM(ReturnedQty from RECEIVED or COMPLETED Returns)
```

`DRAFT`, `SUBMITTED`, `APPROVED` and `CANCELLED` do not consume eligibility.

Refund status never affects eligibility.

# 14. Partial and multiple returns

Partial and repeated returns are allowed.

Example:

```text
Sold: 10
Return A RECEIVED: 3
Return B RECEIVED: 2
Eligible: 5
```

A transition to `RECEIVED` SHALL fail when the newly recalculated cumulative quantity would exceed sold quantity.

# 15. Concurrency and over-return prevention

## 15.1 Why SalesReturn optimistic locking is insufficient

Two independent Return aggregates can reference the same InvoiceItem and read the same eligible quantity. Versioning on either Return row cannot serialize that shared eligibility decision.

## 15.2 Authoritative serialization boundary

When a SalesReturn transitions to `RECEIVED`, one database transaction SHALL:

1. Sort referenced InvoiceItem IDs deterministically.
2. Acquire a write-conflicting row lock on every referenced InvoiceItem, or use an equivalent persistence-supported serialization mechanism.
3. Recalculate counted returned quantity from committed Return data inside the same transaction.
4. Validate every requested quantity against the recalculated eligible quantity.
5. Persist the transition to `RECEIVED`.
6. Restore inventory for stock-managed lines.
7. Persist inventory movements.
8. Commit atomically.

An equivalent mechanism is acceptable only if concurrent transactions for the same InvoiceItem cannot both pass using stale eligibility.

## 15.3 Operational requirements

- Lock order SHALL be deterministic.
- Deadlock, lock timeout or serialization failure SHALL surface as a retryable application error.
- Bounded retry MAY follow existing transaction-retry conventions.
- The final validation SHALL occur after serialization is acquired.
- UI validation is advisory only.
- SalesReturn optimistic locking still protects conflicting edits to the same Return document, but is not the over-return mechanism.

## 15.4 No denormalized counter

Remaining or returned quantity SHALL NOT be stored on InvoiceItem. Correctness comes from authoritative aggregation under serialization.

# 16. Return item rules

Each item SHALL retain:

- InvoiceItemId
- ProductId when available
- SKU, product name and product type snapshots
- Returned quantity
- Unit price, discount and tax snapshots
- Return-value components
- Mandatory reason
- Destination warehouse for stock-managed products

Quantity SHALL be greater than zero. Duplicate lines for one InvoiceItem inside one Return SHOULD be rejected or normalized by SPEC.

# 17. Return reasons

Minimum codes:

- DAMAGED
- DEFECTIVE
- WRONG_PRODUCT
- CUSTOMER_CHANGED_MIND
- EXPIRED
- TRANSPORT_DAMAGE
- OTHER

`OTHER` requires explanatory text.

# 18. Product-type handling

## Stock-managed product

At `RECEIVED`, restore stock through `InventoryDomainService.increase()` and create a RETURN movement.

## SERVICE/non-stock product

Return is allowed when otherwise eligible, but no stock restoration and no InventoryMovement are created.

## Inactive/deleted catalog product

Historical eligibility relies on InvoiceItem references and snapshots; later catalog changes do not invalidate the return.

# 19. Return lifecycle

```text
DRAFT
  ├──> CANCELLED
  └──> SUBMITTED
          └──> APPROVED
                  └──> RECEIVED
                          └──> COMPLETED
```

- `DRAFT`: editable; no eligibility or inventory effect.
- `SUBMITTED`: awaits approval; no eligibility effect.
- `APPROVED`: authorized for receipt; no eligibility effect.
- `RECEIVED`: goods accepted; eligibility consumed; stock restored exactly once.
- `COMPLETED`: operational return finalized; Refund is not required.
- `CANCELLED`: terminal and permitted only before `RECEIVED`.

`REFUNDED` is not a SalesReturn status.

Auto-approval may move SUBMITTED to APPROVED within one application operation while preserving audit history.

# 20. Refund model

Refund is optional, owned by SalesReturn, and SHALL NOT modify Payment.

## Refund lifecycle

```text
PENDING
  ├──> PROCESSING
  │       ├──> COMPLETED
  │       └──> FAILED
  └──> CANCELLED
```

A Return may complete:

- without Refund;
- while Refund is pending or processing;
- before or after Refund completion.

Refund failure SHALL NOT revert inventory or reopen the Return automatically.

Minimum Refund fields:

- id
- salesReturnId
- amount
- method
- status
- external reference
- failure reason
- actor/timestamps
- version where required

Cumulative active/completed refund amount SHALL NOT exceed refundable Return value. Discount and tax allocation belong to SPEC-T014.

# 21. Exchange

Exchange is:

```text
Return + separate New Sale
```

The original Invoice is never modified. The New Sale uses existing Checkout.

T014 SHALL NOT introduce one distributed atomic transaction across Return and New Sale. Optional linking identifiers may be added for traceability.

# 22. Inventory restoration

Inventory restoration occurs only on transition to `RECEIVED`.

For stock-managed lines:

- call `InventoryDomainService.increase()`;
- use movement type RETURN;
- reference SalesReturn;
- preserve organization, branch, warehouse, product, quantity, actor and correlation context.

Direct writes to Inventory repositories or balance tables are prohibited.

# 23. Aggregate and service responsibilities

SalesReturn controls item membership, positive quantities, its lifecycle, cancellation, Refund association rules, completion, events and its own optimistic version.

Cross-aggregate eligibility and InvoiceItem serialization are coordinated by `ReturnEligibilityService` inside the receiving transaction.

Other services:

- `InventoryDomainService`: stock restoration and movement creation.
- `RefundDomainService`: amount/method validation and Refund transitions; no Payment writes.
- `SequenceCodeGeneratorService`: Return number generation.
- `AuditLogService`: post-commit audit.
- `DomainEventPublisher`: post-commit publication.

# 24. Transaction boundaries

## Create Draft

Generate number, validate references, create Return and items, commit. No eligibility consumed.

## Submit/Approve

Validate status/version, persist transition, commit.

## Receive

One transaction performs InvoiceItem serialization, eligibility recalculation, validation, `RECEIVED` transition, stock restoration and movements, then commits.

After commit: publish events and invoke audit.

## Complete

Validate `RECEIVED`, transition to `COMPLETED`, commit. Refund is not a prerequisite.

## Refund

Refund uses its own transaction and lifecycle. It does not alter inventory, Invoice or Payment.

# 25. Audit strategy

Because `AuditLogService.log()` has no transaction context, T014 SHALL NOT claim atomic audit persistence.

For each successful command:

1. Commit authoritative business data.
2. Publish the post-commit domain event according to existing practice.
3. Invoke AuditLogService after commit.

Audit failure SHALL be logged and observable but SHALL NOT roll back an already committed Return or inventory movement.

Minimum audited actions: Created, Draft Updated, Submitted, Approved, Received, Completed, Cancelled, Refund Created, Refund Processing, Refund Completed, Refund Failed, Refund Cancelled.

# 26. Domain events

Minimum events:

- SalesReturnCreated
- SalesReturnSubmitted
- SalesReturnApproved
- SalesReturnReceived
- InventoryRestored
- SalesReturnCompleted
- SalesReturnCancelled
- SalesReturnRefundCreated
- SalesReturnRefundCompleted
- SalesReturnRefundFailed

Events publish only after successful commit and use existing project event conventions.

# 27. Repository boundary

Only SalesReturn repositories persist SalesReturn-owned data.

The module SHALL NOT directly persist Invoice, InvoiceItem, Inventory balances, Inventory movements outside InventoryDomainService, Payment or Customer.

Read access uses approved module contracts or repository boundaries already established by the codebase.

# 28. Persistence model

Recommended entities:

```text
SalesReturn
SalesReturnItem
SalesReturnRefund
```

Audit remains in the existing audit subsystem; no mandatory SalesReturnAudit table is introduced.

Exact names, field types and enum values belong to SPEC-T014 and SHALL follow current schema conventions.

# 29. Database principles

1. One SalesReturn references one Invoice.
2. One Invoice may have many SalesReturns.
3. One SalesReturn has one or more items.
4. One SalesReturn may have zero or more Refunds.
5. Invoice and InvoiceItem remain unchanged.
6. Remaining quantity is not denormalized.
7. Referential integrity is enforced where compatible with history.
8. Snapshots preserve historical readability.
9. Required indexes support organization, invoice, invoice item, status and return number lookups.
10. The persistence stack SHALL support InvoiceItem locking or equivalent serialization.

# 30. Sequence generation

Use the centralized generator and existing six-digit convention:

```text
SR000001
SR000002
```

Numbers are never reused. Exact prefix registration and scope belong to SPEC after repository verification.

# 31. RBAC

Permissions SHALL follow `resource:action`.

Proposed minimum set:

- `sales_return:view`
- `sales_return:create`
- `sales_return:update`
- `sales_return:submit`
- `sales_return:approve`
- `sales_return:receive`
- `sales_return:complete`
- `sales_return:cancel`
- `sales_return:refund`
- `sales_return:view_refund`

SPEC SHALL reconcile names with the existing catalog and avoid semantic duplicates.

# 32. API and application model

Command/query separation may be used at the application-service level, but no new CQRS framework is required.

Proposed commands:

- CreateSalesReturn
- UpdateSalesReturnDraft
- SubmitSalesReturn
- ApproveSalesReturn
- ReceiveSalesReturn
- CompleteSalesReturn
- CancelSalesReturn
- Create/Process/Complete/Fail/CancelSalesReturnRefund

Proposed queries:

- GetSalesReturn
- SearchSalesReturns
- GetSalesReturnHistory
- GetInvoiceReturnEligibility

Value Objects may be introduced locally where consistent with project style; T014 does not mandate a project-wide migration.

# 33. Error model

Minimum deterministic errors:

- SALES_RETURN_NOT_FOUND
- SALES_RETURN_NOT_ELIGIBLE
- SALES_RETURN_QTY_EXCEEDED
- SALES_RETURN_INVALID_TRANSITION
- SALES_RETURN_VERSION_CONFLICT
- SALES_RETURN_CONCURRENCY_RETRY
- SALES_RETURN_INVOICE_NOT_COMPLETED
- SALES_RETURN_INVOICE_ITEM_NOT_FOUND
- SALES_RETURN_CROSS_TENANT
- SALES_RETURN_SERVICE_ITEM_INVENTORY_FORBIDDEN
- SALES_RETURN_REFUND_AMOUNT_INVALID
- SALES_RETURN_REFUND_INVALID_TRANSITION
- SALES_RETURN_REFUND_ALREADY_COMPLETED

Final naming SHALL follow repository conventions.

# 34. Feature enablement

Sales Return SHOULD use an enablement mechanism consistent with existing deployment practices.

Proposed key: `SALES_RETURN_ENABLED`.

Because the project has no proven whole-module flag precedent, SPEC SHALL verify the integration point. This RFC does not require a new feature-flag platform.

# 35. Migration strategy

Migrations are additive and backward compatible:

1. Add SalesReturn tables, indexes, foreign keys and enums.
2. Add sequence registration and RBAC seeds where needed.
3. Deploy module inaccessible/disabled.
4. Run validation and regression tests.
5. Enable using existing deployment practice.

No destructive migration is permitted. The dormant Order-based scaffold SHALL remain untouched unless a separate cleanup decision proves removal safe.

# 36. Testing strategy

## Unit

- Return transitions
- Refund transitions
- Completion without Refund
- Quantity rules
- Cancellation rules
- SERVICE inventory bypass
- Refund amount validation

## Integration

- Repository persistence
- Sequence generation
- Receiving transaction
- InvoiceItem serialization
- Eligibility recalculation under lock
- Inventory restoration
- No movement for SERVICE
- Post-commit events and audit
- Refund persistence without Payment mutation

## Concurrency gate

A real database test SHALL prove:

1. Two Returns target the same InvoiceItem concurrently.
2. Both begin with the same apparent eligibility.
3. When combined quantity exceeds sold quantity, only one succeeds.
4. The other receives retry/conflict or quantity-exceeded after recalculation.
5. Multi-item locks use deterministic order.
6. Deadlock/serialization errors follow bounded retry policy.

A Docker-less sandbox cannot replace this database concurrency gate.

## Regression

Checkout, Invoice, Payment, PurchaseReturn and existing Sales APIs remain unchanged; Inventory Single Writer and tenant isolation remain intact.

# 37. Observability

Structured logs SHOULD cover creation, transitions, receipt transaction, eligibility conflict, lock timeout/deadlock, retry, inventory restoration, Refund transitions, audit failure and event publication failure.

No fixed latency SLA is introduced.

Suggested metrics: Return count, received count, Refund count, failed Refund count, eligibility rejection count, concurrency retry count and audit failure count.

# 38. Rollback

Disable module access through the chosen enablement mechanism. Do not drop production tables or reverse inventory automatically. Completed Returns and movements remain immutable history.

# 39. Security

Every command verifies authentication, Organization, branch where applicable, permission, ownership and version. Return number lookup SHALL never bypass tenant scope.

# 40. Backward compatibility

T014 SHALL NOT require changes to Checkout behavior, Invoice mutation semantics, sales creation APIs, Payment behavior, Inventory Single Writer or PurchaseReturn.

Payment may be read as original-method metadata only.

# 41. Risks and mitigations

- **Concurrent over-return:** InvoiceItem serialization and in-transaction recalculation.
- **Duplicate restoration:** transition guard, optimistic Return version and atomic receive transaction.
- **Non-atomic audit:** explicit post-commit behavior and observability.
- **Refund failure:** independent lifecycle; no inventory rollback.
- **SERVICE stock mutation:** explicit inventory bypass.
- **Dormant scaffold confusion:** distinct Invoice-based model and naming.

# 42. Acceptance criteria

Implementation conforms only when:

1. Return references Invoice/InvoiceItem.
2. Invoice records are never mutated.
3. Partial and multiple returns work.
4. Eligibility is derived.
5. Concurrent receiving cannot over-return.
6. Serialization occurs at InvoiceItem or equivalent authoritative boundary.
7. Stock restoration uses InventoryDomainService only.
8. SERVICE/non-stock lines create no movement.
9. Return completes without Refund.
10. Refund lifecycle is independent.
11. Payment is not modified.
12. Exchange is Return plus New Sale.
13. Audit follows documented post-commit behavior.
14. Events publish only post-commit.
15. RBAC uses existing naming convention.
16. Sequence uses six-digit convention.
17. No unsupported SLA is imposed.
18. T013 Checkout behavior remains unchanged.

# 43. Implementation phases

1. RFC v1.1 approval
2. SPEC-T014
3. SPEC Architecture Review
4. Persistence/migration
5. Domain
6. Application services
7. Inventory integration
8. Refund subdomain
9. API/RBAC
10. Unit/integration tests
11. Real-database concurrency gate
12. Regression gate
13. Enablement and release documentation
14. Release

No implementation begins before RFC approval.

# 44. Revised Architect Decisions

- **AD35:** SalesReturn is an independent Aggregate Root.
- **AD36:** Eligibility is derived; no remaining counter on InvoiceItem.
- **AD37:** Refund has an independent lifecycle and is not a Return status.
- **AD38:** Exchange is Return plus New Sale.
- **AD39:** Inventory restoration uses InventoryDomainService.
- **AD40:** Controlled enablement SHOULD follow existing deployment practice; `SALES_RETURN_ENABLED` is proposed pending SPEC verification.
- **AD41:** Optimistic locking protects one SalesReturn document but is not sufficient for cross-Return eligibility.
- **AD42:** Repository Boundary is mandatory.
- **AD43:** SalesReturn completion SHALL NOT depend on Refund creation or completion.
- **AD44:** Final eligibility validation SHALL execute under InvoiceItem transactional locking or an equivalent serialization mechanism before entering `RECEIVED`.
- **AD45:** SERVICE/non-stock Return Items bypass inventory restoration and create no InventoryMovement.

# 45. Open questions for SPEC-T014

1. Exact finalized Invoice status values.
2. Exact product-type/stock-managed field.
3. Exact Prisma/SQL locking or serialization mechanism.
4. Existing transaction retry conventions.
5. Sequence scope and prefix registration.
6. Final RBAC names.
7. Discount/tax allocation for return value.
8. Whether partial/multiple Refund records are supported.
9. Route and DTO naming.
10. Existing idempotency mechanism.
11. Original warehouse derivation.
12. Auto-approval configuration.

# 46. Deferred topics

Store Credit, Loyalty reversal, Voucher restoration, Credit Note, Customer Debt, Cashbook, accounting, ERP/WMS sync, transactional outbox, transaction-aware audit, and removal of the dormant Order-based scaffold.

# 47. Conclusion

RFC-T014 v1.1 resolves both critical defects from v1.0:

- Return completion no longer depends on Refund.
- Over-return prevention is based on InvoiceItem-level transactional serialization rather than SalesReturn optimistic locking.

It also resolves audit, Payment, feature enablement, SERVICE product, SLA, RBAC, sequence, CQRS/Value Object wording and decision-provenance findings.

**Status: Ready for fresh full Architecture Review.**

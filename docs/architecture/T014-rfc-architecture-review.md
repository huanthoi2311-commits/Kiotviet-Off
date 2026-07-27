# T014 RFC Architecture Review — RFC-T014-SALES-RETURN-EXCHANGE v1.0-draft

**Reviewer:** Claude Code · **Method:** Direct source/schema/governance-doc inspection, cross-referenced against `docs/discovery/T014-SALES-RETURN-DISCOVERY.md`, RFC-T013/SPEC-T013-SALES-FOUNDATION-001, `docs/project-governance/PROJECT_RULES.md`, `docs/project-governance/AI_WORKFLOW.md`, and the current codebase state (all citations below are file:line, verified this session, not recalled from memory).
**No source code, migration, SPEC, or commit produced by this review.**

---

## Executive Summary

RFC-T014 is well-structured and gets the single most important architectural question right: it correctly abandons the dormant `Return`/`ReturnItem` scaffold (which references `Order`, an aggregate the system never creates) and instead references `Invoice`/`InvoiceItem` directly — exactly what Discovery recommended. Repository Boundary, Single Writer, and Invoice/Inventory immutability principles are all respected in the RFC's stated design.

However, the review found **one significant internal contradiction** (Refund independence vs. the mandatory linear status lifecycle), **one unresolved concurrency-correctness gap** (optimistic locking cannot, by itself, prevent over-return across multiple Return rows without violating the RFC's own no-denormalization rule), **one transaction-boundary claim that the actual reusable `AuditLogService` cannot support as literally drawn**, and several smaller inconsistencies (Refund/Payment ownership ambiguity, RBAC naming convention drift, sequence-number padding drift, missing SERVICE-product rule, and a citation gap around AD27-AD34). None of these are fatal — all are fixable in a revision — but each needs an explicit Architect decision before SPEC drafting begins, the same way T013's Order-vs-Invoice conflict needed resolution before its SPEC could be written.

## Review Methodology

Read the full 4-part RFC as delivered. Cross-checked every normative claim ("SHALL") against: (a) the actual current implementation of every service/module the RFC says it will reuse (`InventoryDomainService`, `AuditLogService`, `DomainEventPublisher`, `SequenceCodeGeneratorService`, `PaymentService`, `IVoucherRepository`, permission catalog), (b) `docs/discovery/T014-SALES-RETURN-DISCOVERY.md`'s own findings, (c) `PROJECT_RULES.md`/`ARCHITECTURE_RULES.md`/`CODING_RULES.md` for any stated conventions the RFC should follow, and (d) `AI_WORKFLOW.md`'s actual recorded Architect Decisions (AD07 through AD19 are the highest ones persisted to that file).

---

## Findings by Required Check

### 1. Architectural Consistency — ✅ PASS
Invoice immutability (BR2/AP1/AP10), Repository Boundary (§31/AP6/AP8), Single Writer (§20/AD29/AP2), and event-after-commit (§30/DI7) all correctly restate T013's established principles (AD10, AD11, AD13). No conflict found here.

### 2. Aggregate Boundaries — ✅ PASS
§26/§29's `SalesReturn` as an independent Aggregate Root that coordinates (not owns) Invoice/Inventory/Payment/Customer/Product is structurally identical to the proven `PurchaseReturn` precedent (Discovery §26) — `PurchaseReturnService`/`PrismaPurchaseReturnRepository` already demonstrate exactly this shape, tested and working. Good, low-risk choice.

### 3. Domain Boundaries — ✅ PASS
Return Line / Eligible Quantity / Reason as first-class domain concepts (§16-17) are new but scoped correctly — they extend the domain without touching Invoice/InvoiceItem's own boundary.

### 4. Repository Boundary Compliance — ✅ PASS
§31 explicitly forbids `SalesReturn` from directly accessing `InventoryRepository`/`InvoiceRepository`/`PaymentRepository`/`CustomerRepository`, mandating Domain Service access only — matches AD10 exactly. Good.

### 5. Single Writer Preservation — ✅ PASS, with one process note
§20/§32 correctly route all inventory restoration through `InventoryDomainService.increase()`. Note for Implementation Plan (not a blocker): `inventory/single-writer.architecture.spec.ts:92-107` maintains an explicit `it.each` allow-list of modules permitted to import `InventoryModule` (currently `purchase-order`, `purchase-return`, `transfer`, `inventory-adjustment`, `stock-count`, `checkout`) — a future `sales-return` module needs to be added to that list for the test suite to actually exercise/prove it. This doesn't block the RFC; it's an implementation-detail flag for later.

### 6. Invoice Immutability — ✅ PASS
BR2/AC1/AP1/AP10 are unambiguous and correct. One point worth commending explicitly: **DP4/AD36 (no denormalized `returnedQty` on `InvoiceItem`, always derive Eligible Quantity)** is the *only* way to honor Invoice Snapshot Freeze (AD13) — `InvoiceItem` is frozen immutable data as of T013 Phase 5; writing a running "returned quantity" counter onto it would directly violate AD13. The RFC gets this right, whether or not that was the explicit reasoning. See Finding C1 below, though, for a real tension this creates elsewhere.

### 7. Inventory Consistency — ✅ PASS (see Finding C1 for the concurrency angle)
`InventoryMovementType.RETURN`/`InventoryReferenceType.RETURN` already exist in schema (`schema.prisma:1068-1087`) — no schema change needed for this part. Consistent with Discovery §23/§26.

### 8. Transaction Boundary — 🟡 CONCERN (Finding B1)
See Finding B1 below — the §30 diagram places "Write Audit" *inside* the transaction, before Commit, but the actual `AuditLogService.log()` (`platform/audit-log/audit-log.service.ts:24-58`) takes no `tx` parameter and always writes via its own injected `PrismaService`, not a caller-supplied transaction client. Every existing caller (`CheckoutService`, `PurchaseReturnService`) logs audit *after* their transaction commits, not inside it.

### 9. Event Publication Order — ✅ PASS
"Events SHALL NOT be published before successful commit" (§30, DI7) matches T013's actual pattern (`CheckoutService`: events published after `$transaction()` resolves, not inside it). Correct.

### 10. Backward Compatibility — 🟡 CONCERN (Finding B2)
§43 lists "Payment API (except refund extension)" as a compatibility caveat, implying the `payment` module itself will be touched — but §19/§27/§44's actual design puts Refund entirely inside a new `SalesReturnRefund` entity/table owned by the `SalesReturn` aggregate, with no stated change to `Payment`. These two sections don't agree on whether `payment` module code changes at all in T014. See Finding B2.

### 11. Feature Flag Strategy — 🟡 CONCERN (Finding B3)
A real precedent exists (`product/product-refactor.flag.ts:12-14`, `isProductRefactorEnabled()`, `PRODUCT_REFACTOR_ENABLED` env var) — but it's a narrow, dev-only gate over 3 specific validation rules within an *existing* module, explicitly not a "dual V1/V2 implementation" (per its own doc comment). §47's `SALES_RETURN_ENABLED` proposes gating an entire *new* module's full command surface (7 commands + 4 queries + new routes + new RBAC permissions) — a materially larger scope than the only precedent in this codebase. The RFC should say explicitly *where* the gate is enforced (module registration? route guard? command-handler level?) since "behind Feature Flag" alone isn't a mechanism.

### 12. Testing Strategy — ✅ PASS
§48's layering (Unit/Integration/API/Concurrency/Regression) matches this project's established gate pattern (T013 Phases 1-7 all ran this same shape). Concurrency scenarios listed (duplicate submission, duplicate refund, optimistic-lock conflict) are the right ones to test — though see Finding C1 for whether optimistic locking alone can actually satisfy them.

### 13. Migration Safety — ✅ PASS
"No destructive migration is permitted in T014" (§46) matches every migration so far in this project (all additive, all with `rollback.sql`).

### 14. Missing Business Rules — 🟡 CONCERN (Finding B4)
**SERVICE product returns are never addressed.** Discovery explicitly flagged this as an open question (Discovery §30.6/Special Questions). Part 2's Eligibility Validation Order (§12) and Return Item Rules (§16) don't mention `Product.type === 'SERVICE'` at all — but AD14 (Product Type Policy Freeze) established SERVICE lines never touch Inventory at Checkout time; a Return of a SERVICE line logically should also skip Inventory restoration, mirroring Checkout's own Phase 6 skip logic. This needs an explicit rule, not a silent assumption either way.

### 15. Contradictions — 🔴 CRITICAL (Finding A1)
See Finding A1 — the Refund-independence principle (§19, AD37: "Refund SHALL remain independent from Return completion") directly conflicts with the linear Status Lifecycle (§21: `DRAFT → SUBMITTED → APPROVED → RECEIVED → REFUNDED → COMPLETED`), which makes `REFUNDED` a *mandatory* intermediate state before `COMPLETED`. If Refund is genuinely optional (§19's own examples: warranty replacement, product inspection — no money changes hands), the state machine as literally drawn has no path from `RECEIVED` to `COMPLETED` that doesn't pass through `REFUNDED`.

### 16. Hidden Risks — 🔴 CRITICAL (Finding A2) + 🟡 (Finding B5)
See Finding A2 (concurrency/over-return) and Finding B5 (unjustified performance SLAs in an environment that can't verify them).

---

## Critical Findings (must be resolved before SPEC)

### A1 — Refund independence contradicts the Status Lifecycle
- **Evidence**: §19 states *"A Return MAY exist without Refund... Examples: Warranty replacement. Product inspection. Manager approval pending."* AD37 (§55): *"Refund SHALL remain independent from Return completion."* But §21's lifecycle diagram is strictly linear: `DRAFT → SUBMITTED → APPROVED → RECEIVED → REFUNDED → COMPLETED`, with no branch shown that skips `REFUNDED`.
- **Why it matters**: As literally drawn, every Return must pass through `REFUNDED` to reach `COMPLETED` — making Refund mandatory in practice, directly contradicting §19/AD37's stated independence. A warranty-replacement Return (no money movement) has no valid path to `COMPLETED` under the diagram as drawn.
- **Also relevant**: §18 Exchange Case 3 ("Return Value > New Sale → Refund required") shows a scenario where Refund becomes conditionally mandatory as part of a composed Exchange flow — worth clarifying how that interacts with the "independent" framing too.
- **Options for the Architect** (not chosen here): (a) add an explicit branch — `RECEIVED → COMPLETED` directly for no-refund cases, `RECEIVED → REFUNDED → COMPLETED` only when a refund is actually created; or (b) make `REFUNDED` not a Return-level status at all, but a property of whether any `SalesReturnRefund` rows exist, with `COMPLETED` reachable from `RECEIVED` unconditionally.

### A2 — Optimistic Locking cannot, by itself, prevent over-return across multiple Return documents
- **Evidence**: §24: *"Concurrency SHALL validate EligibleQty inside the transaction boundary. Optimistic locking SHALL be applied."* DP4/AD36: *"Returned quantity SHALL NOT be denormalized into InvoiceItem. Eligible quantity SHALL always be derived"* (i.e., computed as `SoldQty − Sum(ReturnedQty across all prior Return rows)` at read time, per §12).
- **Why it matters**: Optimistic locking (a version column CAS) protects against concurrent writes to the *same row*. But "Eligible Quantity" here is an aggregate computed across *multiple, independent* `SalesReturn`/`ReturnItem` rows (Multiple Return, §14, is explicitly supported — a completed Invoice may have many Return documents). Two concurrent Return submissions against the same `InvoiceItem`, each reading "remaining eligible qty" before either commits, can both pass validation and together over-return — optimistic locking on either new row doesn't prevent this, because there's no single row whose version both writers are contending for. This project already solved an analogous problem for `Voucher.usedCount` (T013 Checkout: `WHERE usedCount = previousUsedCount` CAS, `voucher.repository.interface.ts:20-24`) — but that pattern requires *one* mutable counter row to CAS against, which DP4 explicitly avoids for eligible-quantity tracking.
- **Options for the Architect**: (a) use a strong transaction isolation level (`SERIALIZABLE` or row-level lock — `SELECT ... FOR UPDATE`) when computing+validating Eligible Quantity inside the Return-creation transaction, accepting the performance/contention cost; (b) accept a narrow, explicitly-scoped denormalized counter *only* for concurrency-guard purposes (e.g., on `Invoice` or a new lightweight per-InvoiceItem tracking row, not on the frozen `InvoiceItem` itself) with a CAS pattern mirroring Voucher; (c) some other mechanism — but "optimistic locking" alone, as currently described, does not solve this.

## Other Findings (should be resolved, lower severity)

### B1 — Audit-inside-transaction is not supported by the actual `AuditLogService`
`AuditLogService.log()` (`platform/audit-log/audit-log.service.ts:24,29`) has no `tx` parameter and always writes through its own injected `PrismaService` — it cannot participate in a caller's `$transaction()`. Both existing callers (`CheckoutService`, `PurchaseReturnService`) log audit *after* their business transaction commits. §30's diagram, which places "Write Audit" before "Commit," should be corrected to match this — either move Audit to after Commit (alongside Events, the actual established pattern), or explicitly scope new work to extend `AuditLogService` to accept a `tx` (a real, disclosable scope addition, not a given).

### B2 — Refund/Payment ownership is ambiguous
§43 says the Payment API needs a "refund extension," implying `payment` module code changes. But §19/§27/§44 design Refund as its own entity (`SalesReturnRefund`) fully owned by the `SalesReturn` aggregate, with no stated dependency on `Payment` at all. Discovery (§12) already found `PrismaPaymentRepository.create()` hardcodes `direction: 'IN'` — if Refund is genuinely `SalesReturn`-owned and separate from `Payment`, then §43's parenthetical is incorrect for T014's actual scope and `payment` module needs zero changes (a cleaner outcome, avoiding touching Payment's IN-only assumption at all). This should be stated explicitly one way or the other.

### B3 — Feature Flag mechanism is under-specified
See Check 11 above. `SALES_RETURN_ENABLED` is a much larger-scope flag than the only precedent in this codebase (`isProductRefactorEnabled()`, which gates 3 validation rules inside an existing module, not a whole new module's routes). The RFC should specify enforcement point (module wiring vs. route guard vs. command handler) before Implementation Plan, or explicitly defer that decision to SPEC.

### B4 — SERVICE product return handling is unaddressed
See Check 14 above. Needs an explicit rule: does a SERVICE `ReturnItem` skip Inventory restoration (mirroring AD14), and is it otherwise eligible/refundable normally?

### B5 — Performance SLAs (§40) are new, unjustified, and unverifiable in this environment
No prior RFC/SPEC in this project (T009-T013) specified numeric performance targets — T013's own Final Acceptance Checklist explicitly disclosed "no SLA defined, not inventing numbers" rather than assert one. §40 introduces specific numbers (300ms/100ms/500ms) with no stated baseline or measurement methodology. Separately: this development sandbox has no reachable Postgres/Redis (confirmed directly this session during T013's RC Validation — `ECONNREFUSED` on both ports, no `docker` binary), so these targets cannot be verified here regardless of their origin. Worth clarifying whether these are aspirational (fine, but should say so) or measured against a real environment the Architect has access to.

### B6 — RBAC permission naming diverges from the existing catalog convention
§36 proposes `return.read`, `return.create`, etc. (dot-separated). Every existing permission in `permission-catalog.ts` uses colon-separated `{resource}:{action}` (e.g., `purchase_return:view` at line 130, `order:return` at line 166, and the `crud()` helper's generated codes throughout). Recommend `sales_return:*` (colon-separated, and `sales_return` rather than bare `return` to avoid ambiguity with the existing unused `order:return` stub — Discovery §9 already flagged that stub as stale/unwired).

### B7 — Sequence number padding diverges from every existing generator
§35's example (`SR00000001`, 8 digits) differs from every generator in this project so far, all of which use `padLength: 6` via `SequenceCodeGeneratorService.generate()` (`HD000001`, `NCC000001`, `SP000001`, `BR000001`, etc. — confirmed across invoice/supplier/product/branch generators this session). Recommend `SR000001` (6 digits) for consistency, unless there's a specific reason (e.g., anticipated higher volume) to diverge — if so, that reasoning should be stated.

### B8 — New architectural patterns not used anywhere else in this codebase
§28 (formal immutable Value Object classes: `Money`, `Quantity`, `Percentage`, `Reason`, `RefundMethod`, `RefundStatus`) and §39 ("CQRS separation SHALL be **preserved**") introduce patterns that do not currently exist in this codebase — grep across `backend/src` found zero existing Value Object classes or CQRS Command/Query separation; every module (including the `PurchaseReturn` precedent this RFC is modeled on) uses plain primitives and conventional service methods (`create()`, `getById()`, `search()`, not a Command/Query bus). §39's word "preserved" implies this already exists, which it doesn't. This isn't necessarily wrong — introducing better patterns is a legitimate architectural choice — but it should be disclosed as a **new pattern being introduced**, not something being "preserved," so the Architect can decide deliberately rather than by implication.

### B9 — Citation gap: AD27–AD34 are referenced but not found in recorded governance history
`docs/project-governance/AI_WORKFLOW.md`'s actual recorded decision history (as of this review) runs from AD07 through AD19 (AD18 explicitly noted as a deliberate numbering gap). The RFC's "Depends On" section lists "AD07–AD34," and the body cites specific ones by number with substantive content already attached (e.g., §2: *"Architect Decision AD27 therefore states: Sales Return SHALL reference Invoice and InvoiceItem directly"*; §20: *"Implements: AD29"*). I have no record — in `AI_WORKFLOW.md` or in this conversation — of AD27 through AD34 having been separately issued with that content. Two readings are possible: (1) this RFC is itself the vehicle that mints AD27-34 (similar to how §55 explicitly declares AD35-42 "become normative upon RFC approval"), or (2) they were decided elsewhere and simply need to be provided/recorded. Either is fine, but which one is the case should be stated explicitly — if (1), AD27-34 should be written into `AI_WORKFLOW.md` alongside AD35-42 once this RFC is approved, using the same "Decision ADxx — Title" format as every prior decision in that file.

---

## Confirmation

No source code modified. No Prisma schema modified. No migration created. No SPEC generated. No commit created. RFC content itself was not modified — this review is a separate document (`docs/architecture/T014-rfc-architecture-review.md`).

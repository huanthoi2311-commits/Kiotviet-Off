# T014 RFC v1.1 Architecture Review — RFC-T014-SALES-RETURN-EXCHANGE

**Imported file:** `docs/rfc/RFC-T014-SALES-RETURN-EXCHANGE.md`
**Line count:** 707 lines
**Git diff summary:** new file, 707 insertions(+), 0 deletions(-) (untracked, not staged — `git status --short` shows `?? docs/rfc/RFC-T014-SALES-RETURN-EXCHANGE.md`)
**Content fidelity:** imported verbatim, no rewriting/summarizing/reinterpretation. This review is a separate document.
**No RFC modification, SPEC, code, migration, commit, or push performed.**

---

## Executive Summary

RFC-T014 v1.1 resolves both critical blockers from v1.0. **A1 (Refund/Return lifecycle contradiction) is fully resolved** — `REFUNDED` is removed from the Return lifecycle, Refund now has its own independent state machine, and every relevant section (§19, §20, §24, §42) consistently confirms a Return can complete without a Refund. **A2 (over-return concurrency) is fully resolved at the architectural level** — the RFC now states the actual requirement (InvoiceItem-level serialization inside the RECEIVED transaction, recalculating from committed data under lock, before persisting the transition) rather than the vague "optimistic locking" claim from v1.0, and correctly defers the exact Prisma/SQL mechanism to SPEC (Open Question #3) rather than overspecifying it here. All 9 B-items from v1.0 are also resolved. Three new Minor findings and three Observations were found in this pass — none blocking.

**Recommended verdict: APPROVE**, optionally with the 3 Minor findings addressed in SPEC-T014 rather than requiring a v1.2 RFC revision (Architect's call).

---

## Re-Verification of the 12 Specified Points

### 1. Return and Refund state machines are mutually consistent — ✅ PASS
Return lifecycle (§19): `DRAFT → {CANCELLED | SUBMITTED → APPROVED → RECEIVED → COMPLETED}`, no `REFUNDED` state. Refund lifecycle (§20): `PENDING → {PROCESSING → {COMPLETED|FAILED} | CANCELLED}`, entirely separate. §24's Complete transaction explicitly states "Refund is not a prerequisite." No contradiction found — this is the correct fix for A1.

### 2. Return can complete without Refund — ✅ PASS
Stated explicitly and consistently in §19 ("Refund is not required"), §20 ("A Return may complete: without Refund..."), §24, and AC9 (§42). No contradicting section found anywhere in the 707-line document.

### 3. Refund cannot mutate historical Invoice or Inventory — ✅ PASS
§20: "SHALL NOT modify Payment." §23: `RefundDomainService` — "no Payment writes." §24 Refund transaction: "does not alter inventory, Invoice or Payment." §40: Payment may be read as original-method metadata only (read-only). Fully resolves v1.0's B2 — Refund is now unambiguously a `SalesReturn`-owned entity (`SalesReturnRefund`, §28) with zero write path into `Invoice`, `InventoryMovement`, or `Payment`.

### 4. InvoiceItem serialization is implementable in the current persistence stack — ✅ PASS
The stack is PostgreSQL accessed via Prisma inside `$transaction()` (the same pattern `CheckoutService`/`PurchaseReturnService` already use). Postgres natively supports row-level locking (`SELECT ... FOR UPDATE`); Prisma's transaction client supports raw SQL (`tx.$queryRaw`/`tx.$executeRaw`) even though its fluent ORM API has no native "lock this row" method. So the requirement stated in §15.2/§29.10 is genuinely achievable — it will require a raw-SQL statement inside the transaction, not a plain Prisma Client call, which is exactly the detail the RFC correctly defers to SPEC (Open Question #3: "Exact Prisma/SQL locking or serialization mechanism"). Appropriately scoped — RFC states the requirement, not the implementation, as the Architect's prior decision asked for.

### 5. Two independent Returns cannot over-return concurrently — ✅ PASS
§15.2's step order is correct: sort IDs → acquire lock → recalculate counted-returned-quantity from committed data (inside the same transaction, after the lock is held) → validate → persist `RECEIVED` → restore inventory → persist movements → commit. A second concurrent transaction targeting the same `InvoiceItem` blocks at the lock-acquisition step until the first transaction commits or rolls back, then reads the now-updated counted quantity — this is a sound, standard serialization pattern and correctly fixes the class of bug identified in v1.0's Finding A2.

### 6. Lock ordering and retry requirements are sufficient — 🟡 Minor finding (M3)
"Lock order SHALL be deterministic" (§15.3, sorted IDs per §15.2 step 1) correctly prevents the classic multi-row deadlock scenario (two Returns each referencing overlapping InvoiceItems in different order). However, §15.3 also says "Bounded retry MAY follow existing transaction-retry conventions" — **no such convention exists in this codebase.** Checked `checkout`/`purchase-return`/`inventory` modules directly: the only "retry" concept found (`checkout-operation.service.ts:113`) refers to a *client* resubmitting a request with the same idempotency key after a failure, not a server-side automatic retry-with-backoff loop. Concurrency conflicts elsewhere in this project (e.g. `VoucherConcurrencyConflictError`, `InventoryConcurrencyConflictError`) are surfaced as typed errors mapped to HTTP 409 for the *caller* to retry — they are not internally auto-retried. SPEC should clarify which of these two meanings "existing conventions" refers to, since they're materially different (surface-and-let-client-retry vs. an actual internal retry loop, which doesn't exist yet).

### 7. Eligibility counting states are unambiguous — ✅ PASS
§13's formula (`SUM(ReturnedQty from RECEIVED or COMPLETED Returns)`) is logically sound: since `COMPLETED` is only reachable after passing through `RECEIVED` (§19's lifecycle), and `CANCELLED` is terminal only *before* `RECEIVED` (i.e. a `RECEIVED` Return can never later become `CANCELLED`), the `{RECEIVED, COMPLETED}` bucket is monotonic and non-overlapping with any other status. No double-counting risk, no ambiguity.

### 8. Audit behavior matches current AuditLogService — ✅ PASS
§25's stated order (commit → publish event → invoke `AuditLogService`) matches `AuditLogService.log()`'s actual signature (`platform/audit-log/audit-log.service.ts:24,29` — no `tx` parameter, always writes via its own injected `PrismaService`, try/catch swallowing errors) and matches the existing precedent exactly (`CheckoutService` calls `eventPublisher.publish()` before `auditLogService.log()`, in that order, after its transaction commits). Fully resolves v1.0's B1.

### 9. Payment remains unchanged — ✅ PASS
Confirmed by §6, §20, §23, §40 all agreeing: Refund lives entirely inside `SalesReturn`/`SalesReturnRefund`, Payment gets read-only access to original-method metadata at most. Zero code changes implied for the `payment` module. Fully resolves v1.0's B2 (this and point 3 above are the same underlying fix, verified from two different angles).

### 10. SERVICE products bypass inventory correctly — ✅ PASS
§18's dedicated "SERVICE/non-stock product" subsection and AD45 are unambiguous: eligible for return, no stock restoration, no `InventoryMovement` created. Mirrors T013 Phase 6/AD14's Checkout-side skip logic exactly. Fully resolves v1.0's B4.

### 11. RBAC and sequence conventions match the repository — ✅ PASS
RBAC (§31): `sales_return:{view,create,update,submit,approve,receive,complete,cancel,refund,view_refund}` — colon-separated, matches the existing catalog's `{resource}:{action}` convention exactly (verified against `purchase_return:view` etc. in `permission-catalog.ts`), and using `sales_return` (not bare `return`) avoids the naming collision with the stale, unwired `order:return` stub Discovery flagged. Sequence (§30): `SR000001`, 6-digit padding — matches every existing generator (`HD000001`, `NCC000001`, `SP000001`, `BR000001`) confirmed this session. Fully resolves v1.0's B6/B7.

### 12. No new contradiction or hidden scope expansion — 🟡 2 Minor findings (M1, M2)
See M1 (decision-provenance accuracy) and M2 (lifecycle diagram vs. prose) below. No scope expansion found: Non-Goals (§5) are unchanged from v1.0, Feature Flag claims are now appropriately hedged ("SHOULD," "proposed," "SPEC SHALL verify" — §34), SLA claims are removed (§37: "No fixed latency SLA is introduced"), and CQRS/Value Object language is now correctly framed as optional/local rather than "preserved" (§32) — B3, B5, B8 all cleanly resolved.

---

## Minor Findings (non-blocking, recommend addressing in SPEC-T014)

### M1 — Decision-provenance claim doesn't precisely match the conversation record
The "Decision provenance" section states: *"AD27–AD34 were issued during the T014 Discovery Architect Review."* Based on this session's actual record, AD27 was first introduced *inside RFC-T014 v1.0's own text* (Part 1, Background: "Architect Decision AD27 therefore states...") — there was no separate, distinctly-labeled "T014 Discovery Architect Review" message that issued AD27–AD34 before the v1.0 RFC existed. This doesn't undermine the decisions' validity, but for audit-trail accuracy (a principle this project has otherwise held to strictly — e.g. the AD18 numbering-gap note already in `AI_WORKFLOW.md`), the provenance line should describe them as introduced in RFC-T014 v1.0 based on Discovery findings, not attributed to a separate review event.

### M2 — Return lifecycle diagram (§19) is narrower than its own prose
The ASCII diagram only draws `DRAFT → CANCELLED`. But the prose two lines later says *"CANCELLED: terminal and permitted only before RECEIVED"* — which implies `SUBMITTED` and `APPROVED` can also transition to `CANCELLED`, not just `DRAFT`. SPEC should use the corrected, fuller diagram (or the prose alone) to avoid an implementer reading only the diagram and missing that cancellation is allowed from more than one state.

### M3 — "Existing transaction-retry conventions" (§15.3) don't currently exist
See point 6 above. No internal auto-retry mechanism was found anywhere in `checkout`, `purchase-return`, or `inventory`; concurrency conflicts are surfaced as typed 409 errors for the caller to retry, not retried internally by the server. SPEC should either establish what "bounded retry" actually means here (client-facing error contract vs. a genuinely new server-side retry loop) or drop the "existing conventions" framing.

## Observations (no action required, forward-looking notes)

- **O1**: The deferral of the exact locking mechanism to SPEC (Open Question #3) is correctly scoped — recommend SPEC explicitly choose Prisma raw SQL (`SELECT ... FOR UPDATE`) inside the existing `$transaction()` pattern, since Prisma's fluent API has no native row-lock method.
- **O2**: The `RECEIVED` transaction (§24) holds a row lock across recalculation *and* an `InventoryDomainService.increase()` call *and* movement persistence — a reasonably heavy critical section. Not a defect (mirrors how heavy T013's own Checkout Business Transaction already is), but worth a performance sanity-check during Implementation, not RFC-level.
- **O3**: A future `sales-return` module will need to be added to `inventory/single-writer.architecture.spec.ts`'s `it.each` allow-list (same note made in the v1.0 review) — an Implementation Plan item, not an RFC concern.

---

## Disposition of v1.0 Findings

| Finding | v1.0 Status | v1.1 Status |
|---|---|---|
| A1 — Refund/lifecycle contradiction | 🔴 Critical | ✅ Resolved |
| A2 — Over-return concurrency | 🔴 Critical | ✅ Resolved |
| B1 — Audit-inside-transaction | 🟡 Concern | ✅ Resolved |
| B2 — Payment/Refund ownership ambiguity | 🟡 Concern | ✅ Resolved |
| B3 — Feature Flag mechanism under-specified | 🟡 Concern | ✅ Resolved (appropriately hedged, deferred to SPEC) |
| B4 — SERVICE product return handling missing | 🟡 Concern | ✅ Resolved |
| B5 — Unjustified performance SLAs | 🟡 Concern | ✅ Resolved (removed) |
| B6 — RBAC naming convention drift | 🟡 Concern | ✅ Resolved |
| B7 — Sequence padding drift | 🟡 Concern | ✅ Resolved |
| B8 — Value Object/CQRS framed as "preserved" | 🟡 Concern | ✅ Resolved (reframed as optional/local) |
| B9 — AD27–34 citation gap | 🟡 Concern | 🟡 Partially resolved — see M1 |

---

## Final Verdict Recommendation

**Recommend: APPROVE.**

Both Critical findings from v1.0 are genuinely fixed, not just reworded — the lifecycle contradiction is structurally removed (separate state machines) and the concurrency fix is architecturally sound and implementable in the current stack. The three new Minor findings (M1-M3) are documentation-precision issues, not architectural defects, and are reasonable to fold into SPEC-T014 rather than forcing another RFC revision cycle — but that sequencing call belongs to the Architect.

## Confirmation

No modification made to the imported RFC. No SPEC generated. No code, migration, commit, or push performed.

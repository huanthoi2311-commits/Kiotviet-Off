# T013 Release Workflow — Step 1 (Proposal Only)

**Status:** Proposal for Architect review. **Not executed** — no commit, push, tag, or release has been performed. Each of Commit / Push / Tag / Release requires its own separate authorization per Decision AD16/AD19.
**References:** RFC-T013 v2, SPEC-T013-SALES-FOUNDATION-001 v2, `docs/implementation/IMPLEMENTATION-PLAN-T013-SALES-FOUNDATION.md`, `docs/implementation/T013-CLOSEOUT.md`, `docs/release/T013-RC-VALIDATION-REPORT.md`, Architect Decisions AD07-AD17, AD19 (`docs/project-governance/AI_WORKFLOW.md`).

---

## 1. Release Commit Proposal

**Scope of the release commit** — everything accumulated across Phases 1-7 + Closeout + RC Validation, currently uncommitted:

| Category | Count | Examples |
|---|---|---|
| Backend source files modified | 22 | `checkout.service.ts`, `invoice.service.ts`, `cart.module.ts`, `payment.module.ts`, `customer-point.module.ts`, `error-codes.ts`, ... |
| Backend new files/dirs | 18 | `checkout-operation.service.ts` + spec, `cart-domain.service.ts` + spec, `customer-point-domain.service.ts` + spec, 5 Repository Boundary architecture specs, 2 migration folders, ... |
| Governance/root docs modified | 4 | `CHANGELOG.md`, `PROJECT_STATUS.md`, `docs/SPRINT_DASHBOARD.md`, `docs/project-governance/AI_WORKFLOW.md` |
| New governance/release docs | 9 | RFC, SPEC, Architecture Review, Implementation Plan, Closeout, RC Validation Report, `CHANGELOG-T013.md`, `RELEASE-NOTES-T013.md`, `t013-release-note.md` |

**Proposed commit message** (single commit, matching this project's established one-commit-per-module-release pattern — e.g. T012's `9419ca9`):

```
feat(sales): complete T013 sales foundation

Implements checkout idempotency, repository boundary cleanup (cart/
invoice/payment/customer-point), checkout orchestrator refactor,
branch-scoped invoice numbering, invoice snapshot (customer/product/
unit), and service product support — per RFC-T013 v2 and
SPEC-T013-SALES-FOUNDATION-001 v2, Phases 1-7 (Decision AD07-AD17,
AD19), Final Regression clean (166/166 suites), RC Validation Lite
accepted (Decision AD19).

Refs: docs/rfc/RFC-T013-sales-foundation.md
Refs: docs/specifications/SPEC-T013-SALES-FOUNDATION-001.md
Refs: docs/implementation/T013-CLOSEOUT.md
Refs: docs/release/T013-RC-VALIDATION-REPORT.md
```

*(Format follows Decision AD16's requirement that the release commit reference RFC, SPEC, and the Phase 7/Closeout report.)*

**Alternative considered, not recommended:** splitting into 7 commits (one per phase). Rejected because none of the intermediate phase states were ever independently committed — they exist only as one continuous uncommitted working tree — so retroactively splitting would require reconstructing history that was never actually checkpointed, adding risk without benefit. A single commit matches how T009-T012 were released.

## 2. Version Proposal

**Proposed:** `v0.9.0-sales-foundation`

Reasoning:
- Follows the established sequence: `v0.7.0-customer-domain` → `v0.8.0-supplier-domain` → `v0.9.0-sales-foundation`.
- Stays within `v0.x` per Versioning Policy (Decision T006-R07) — `v1.0.0` is reserved for full completion of Master Data + CRM + Inventory + POS + ERP Core, none of which is complete yet (T013 is POS-domain, not the full POS milestone).
- Minor version bump (not patch) is consistent with this being a new feature milestone, not a fix.

## 3. Git Tag Proposal

**Proposed tag:** `v0.9.0-sales-foundation` (annotated tag, matching all prior release tags in this repo — confirmed via `git for-each-ref`, every existing tag from `v0.1.0-foundation` onward is annotated at the release commit).

**Proposed annotated tag message:**
```
v0.9.0-sales-foundation

T013 Sales Foundation — checkout idempotency, repository boundary
cleanup, invoice number/snapshot, service product support.

RFC-T013 v2 | SPEC-T013-SALES-FOUNDATION-001 v2
Phases 1-7 approved (AD07-AD17), RC Validation Lite accepted (AD19).
See docs/release/t013-release-note.md for full details.
```

## 4. Final Release Checklist

| # | Item | Status |
|---|---|---|
| 1 | RFC implemented | ✅ RFC-T013 v2 |
| 2 | SPEC implemented | ✅ SPEC-T013-SALES-FOUNDATION-001 v2 |
| 3 | Implementation Plan followed | ✅ 7 Phases, Phase Gate Policy (AD08) respected throughout |
| 4 | All 7 Phases Architect-approved | ✅ Phase 1 (AD09) → Phase 7 (AD15/AD16) |
| 5 | Closeout documents complete | ✅ `T013-CLOSEOUT.md`, `CHANGELOG-T013.md`, `RELEASE-NOTES-T013.md` |
| 6 | RC Validation performed and accepted | ✅ RC Validation Lite, Decision AD19 |
| 7 | Full regression clean | ✅ 165-166/166 suites (Argon2 flake confirmed pre-existing/non-blocking every run) |
| 8 | Build/TypeCheck/Lint/Prisma Validate clean | ✅ Confirmed at Phase 7 and again after RC Validation Lite |
| 9 | No Repository Boundary violations | ✅ 5 Architecture Tests + manual grep, zero violations |
| 10 | No unexpected API changes | ✅ All changes additive except the disclosed, intentional `Idempotency-Key` requirement |
| 11 | No schema drift | ✅ `prisma validate` clean, 2 migrations match schema exactly |
| 12 | Migrations have rollback scripts | ✅ Both migrations include `rollback.sql` |
| 13 | Migrations tested against real Postgres | 🟡 PENDING — no Docker/Postgres in this sandbox (disclosed, consistent with T009-T012 precedent) |
| 14 | Known Technical Debt disclosed | ✅ 6 items listed in `T013-CLOSEOUT.md` §8 |
| 15 | Known flakes disclosed | ✅ `argon2-password-hasher` (pre-existing) |
| 16 | Working tree contains only T013-scoped changes | ✅ Verified via `git status` — 22 modified + 18 new backend paths, 4 modified + 9 new docs, nothing unrelated |
| 17 | Version/commit/tag proposed per Decision AD16 | ✅ This document |

**All applicable items PASS.** Item 13 is the one open, disclosed limitation — not a blocker per Decision AD19 (RC Validation Acceptance explicitly allows proceeding to Release Workflow when Docker/Postgres/Redis are unavailable, provided the report distinguishes verified vs. unverifiable, which it does).

## 5. Not Yet Authorized

Per the Architect's explicit restriction, this document is a **proposal only**. The following remain unauthorized and unperformed:
- ❌ Commit
- ❌ Push
- ❌ Tag
- ❌ Release

Each requires its own separate Architect authorization (Decision AD16/AD19 — "giữ khả năng kiểm soát và rollback").

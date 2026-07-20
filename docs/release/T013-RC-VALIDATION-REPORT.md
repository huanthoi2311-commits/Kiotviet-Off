# T013 RC Validation Report — Sales Foundation

**Decision reference:** AD17 (RC Validation Gate), `docs/project-governance/AI_WORKFLOW.md`.
**Mode executed:** **RC Validation Lite** — chosen by the Architect after Claude Code disclosed a concrete environment blocker (see §1) and presented options via `AskUserQuestion`.
**Scope:** Test-level scenario validation only. No commit/push/tag/release performed. No T014 work started.

---

## 1. Environment Blocker (disclosed before this round began)

Directly verified (not assumed from memory) at the start of this round:
- `docker` binary: not present in `PATH`.
- `127.0.0.1:5432` (Postgres): `ECONNREFUSED`.
- `127.0.0.1:6379` (Redis): `ECONNREFUSED`.

This is a pre-existing constraint (documented in every release note since T009), not something new to T013. True RC Validation as originally described — end-to-end scenarios against real data, real concurrency (row locks, unique-constraint races), real performance/load — **requires a live Postgres + Redis instance**, which does not exist in this sandbox.

## 2. What RC Validation Lite Verified

Three new test additions in `backend/src/modules/checkout/application/checkout.service.spec.ts`, under a new `[RC Validation Lite]` describe block (all passing, see §4):

### 2.1 Combined realistic scenario
A single `checkout()` call combining, for the first time in one test, everything previously tested only in isolation: a registered Customer (with Snapshot fields), loyalty points redemption, a mixed STOCK+SERVICE cart, and a non-default payment method (`E_WALLET`). Verifies: correct total calculation with points applied, both Snapshot field sets populated correctly, Inventory decreased only for the STOCK line, Payment created with the right amount/method.

### 2.2 Payment method matrix
Parameterized test (`it.each`) confirming all 4 payment methods (`CASH`, `BANK_TRANSFER`, `CARD`, `E_WALLET`) pass through `CheckoutService` to `PaymentService.createPayment()` unchanged. (Confirmed via code inspection that `PaymentService` has no method-specific branching — this test guards against that ever silently changing.)

### 2.3 Application-level concurrency race proxy
Two concurrent `service.checkout()` calls with the *same* `idempotencyKey`, with `checkoutOperationService.reserve()` mocked to return `NEW` on the first invocation and `REPLAY` on the second — mimicking what a real database race would produce. Verifies: the Business Transaction (Invoice/Payment/Inventory) executes **exactly once** across both concurrent calls; the losing call returns the same cached result without re-running any side effect.

**This is explicitly a proxy, not a substitute** for a real concurrency test — see §3.

## 3. What Remains Genuinely Unverified (honest, not glossed over)

| Area | Why it can't be verified here |
|---|---|
| Real Postgres row-locking / unique-constraint race under true parallel requests | Requires an actual running Postgres instance handling 2+ real concurrent transactions; a mocked repository cannot produce a real `P2002` race — Phase 1's own concurrency tests (and this round's §2.3) simulate the *outcome* of a race by scripting mock return values, they don't produce one |
| Real Redis behavior for Cart under concurrent read/write | No Redis instance reachable |
| Performance / load (response time, throughput under concurrent checkouts) | No live server + DB to measure against; Jest unit tests measure test execution speed, not application performance |
| True ACID rollback of a partially-written Business Transaction | The mocked `$transaction(fn) => fn({})` does not simulate Postgres's actual rollback — existing tests verify `CheckoutService` correctly *propagates* an error and calls `markFailed()`/skips `clearAfterCheckout()`, not that Postgres actually discarded partial writes |
| End-to-end HTTP request through a running NestJS app (real Guards/Interceptors/Validation pipes wired together) | No live server process was started; only class-level unit tests ran |

## 4. Verification Results

| Gate | Result |
|---|---|
| `tsc --noEmit` | Clean |
| `npm run lint` | Clean |
| `npm run build` | Clean |
| `checkout.service.spec.ts` (scoped) | 1 suite / 31 tests passed (includes all 3 new RC Validation Lite tests) |
| Checkout module (scoped, with coverage) | 7 suites / 76 tests passed |
| Full regression (`jest --silent`) | 165/166 suites, 1589/1590 tests passed — 1 failure: `argon2-password-hasher.spec.ts` (known pre-existing parallel-worker flake, unrelated to T013) |
| Argon2 re-run in isolation (`--runInBand`) | 1/1 suite, 3/3 tests passed — confirms non-blocking flake, not a regression |

## 5. Coverage (checkout module)

Unchanged from Phase 6/7 baseline: **98.68% stmts / 85.57% branch / 97.61% funcs / 98.96% lines** — expected, since no production code changed this round, only additional test scenarios exercising already-covered lines.

## 6. Recommendation

RC Validation Lite found **no defects** in the scenarios it could exercise. The combined-scenario and payment-method-matrix tests close real coverage gaps in the existing suite (previously each variable — customer, points, voucher, SERVICE, payment method — was only tested in isolation, never combined). The concurrency race proxy adds confidence at the application-logic level but is explicitly **not equivalent** to a real database concurrency test.

**This report does not itself constitute RC approval** — that decision belongs to the Architect. Given the disclosed environment limits, the honest recommendation is: RC Validation Lite is the maximum achievable verification in this sandbox; a true RC Validation (real Postgres/Redis, real concurrency, real performance) would need a Docker-capable environment (a different machine, or CI) before this milestone is treated as fully release-candidate-verified in the strictest sense.

**Confirmed: no commit / push / tag / release performed. No T014 work started.**

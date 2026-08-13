# T051 — Release Readiness / Hardening Plan

Status: **discovery only**, derived entirely from current backend/frontend source at `main@7d4d367` (T050 Purchase Report merged) plus direct GitHub API queries. No implementation. Feature freeze active. Architect Decisions required before any T051 sub-package begins — see §9.

## 0. Method

Four independent, source-only research passes were run against current `main`: (1) a full code trace of the Purchase Order Receive flow, (2) backup/restore scope discovery, (3) deployment-model reconciliation across all documentation layers, and (4) an exhaustive tenant-isolation classification of every repository write method across all business modules, plus a per-entity concurrency classification and RBAC/Discount/Organization fact-finding pass. All citations below are file:line from that work, independently re-checked where flagged as high-severity.

One pass surfaced a **confirmed, live cross-tenant privilege-escalation vulnerability** that was not one of the four originally-named blockers (RB-1–RB-4). It is documented as RB-5 and is, by evidence, more urgent than three of the four named blockers — see §6 and the priority note in §9.

---

## 1. RB-1 — Backup / Restore

**Current source evidence.** Zero backup/restore code exists anywhere in `backend/src` or `backend/prisma` (confirmed by direct grep — only `inspect-db.ts`/`inspect-jobs.ts`/`seed.ts` exist). A legacy attempt (`platform/backup`, `backend/prisma/{backup,restore}.ts`) exists only in an **unmerged recovery branch**, documented as "untested against a real Postgres" (`docs/discovery/T032-LEGACY-RECOVERY-CLASSIFICATION.md:95-104,190`). `docs/SPRINT_DASHBOARD.md:100` lists T023 Backup and Restore as **NOT STARTED**.

**Failure mode.** Any hardware failure, disk corruption, accidental `docker compose down -v`, or operator error on the single deployment PC results in **total, unrecoverable loss** of all business data (65 Prisma models — the entire durable data surface) with no defined recovery path.

**Severity.** Critical / Release Blocker.

**Data-loss risk.** Total. Postgres (`postgres_data` volume) holds 100% of durable business state — customers, invoices, inventory, debt, everything. Redis holds only reconstructible-or-short-lived state (see below) — **not** part of the data-loss surface.

**What must actually be backed up (re-derived, §6-§7 of the authorization):**
- **PostgreSQL** — the entire durable data surface (65 models). Mandatory.
- **Redis** — NOT business-critical to back up. Four uses found, all reconstructible or intentionally short-lived: shopping cart (`redis-cart.repository.ts:8,26-33`, 30-min TTL, pre-checkout only — losing it loses at most an in-progress unpaid cart), OTP/password-reset tokens (60s–1h TTL), BullMQ mail-delivery jobs (OTP email only, re-triggerable), and session/refresh-token state — which is actually **not** in Redis at all, it's a Postgres table (`prisma-session.repository.ts`), so it's already covered by the Postgres backup. **Explicit finding: Redis is reconstructible; a Postgres-only backup does not lose business-critical state.**
- **Uploaded/local files** — none exist. Supplier Excel import uses in-memory multer (`supplier.controller.ts:81-102`, `file.buffer`, no `diskStorage`) — no disk directory to back up.
- **Secrets/config** — plaintext env vars (`DATABASE_URL`, JWT secrets, SMTP creds), infra-managed, explicitly **out of scope for a data backup** (separate concern — losing the machine loses these too, but that's an infra/secrets-management question, not a database-restore question).
- **Multi-tenancy** — no per-org export/import primitive exists anywhere; a full `pg_dump`/`pg_restore` is org-agnostic (restores all organizations together). The Supplier/Purchase-Report exports are UI features, not general restore primitives — they don't round-trip referential integrity.
- **Migration state** — a full-cluster `pg_dump`/`pg_restore` carries schema + `_prisma_migrations` automatically (standard Prisma/Postgres behavior); risk only exists for partial/logical restores against a differently-migrated target.
- **Version compatibility** — `git tag` shows a real semver history (`v0.1.0`…`v0.10.0-sales-return-exchange`); a backup artifact should record the app version tag.
- **Verification** — no checksum/row-count/restore-smoke-test pattern exists anywhere today.

**Architecture options.**
- **A — PostgreSQL-only backup** (`pg_dump`/`pg_dumpall`, scheduled + on-demand). Sufficient per the Redis-reconstructibility finding above.
- **B — PostgreSQL + Redis.** Unnecessary given B's contents are reconstructible/ephemeral — would add complexity without closing a real gap.
- **C — application-level export.** Would require building new per-entity export/import logic for 65 models — large surface, high effort, wrong tool for "restore the whole system," though potentially valuable later for per-org export (out of scope here).
- **D — OS/container volume backup** (snapshot `postgres_data`). Simple, filesystem-level, but couples backup format to Docker volume mechanics and doesn't produce a portable/inspectable artifact.
- **E — hybrid: scheduled `pg_dump` to a local/rotated file set + a documented manual `pg_restore` runbook + a basic restore-verification smoke test (row counts / a fixed set of health queries).**

**Recommendation basis (not a decision — see AD-2).** Option A (Postgres-only), packaged as E's execution shape (scheduled dump + runbook + verification), is the evidence-based minimum: Redis is proven reconstructible, no files/uploads exist, and per-org partial restore is not currently a product requirement anywhere in source.

**Smallest safe fix.** A scheduled `pg_dump` (custom format, `-Fc`) to a rotated local directory, a documented `pg_restore` procedure, and one verification script (row counts per model + the existing `/health` check post-restore).

**Migration impact.** None to schema; purely operational tooling.

**Rollback strategy.** N/A for this sub-package itself (it doesn't change runtime behavior) — but this package's own deliverable IS the rollback mechanism for everything else.

**Test strategy.** A restore-drill test: back up a seeded dev database, restore into a fresh Postgres container, run the verification script, confirm row counts and `/health` match pre-backup state.

**Deployment impact.** Adds a scheduled job (cron/Task Scheduler on the target Windows PC, or a `docker compose` sidecar) — depends on the outcome of RB-2/AD-3.

**Architect Decision required.** Yes — AD-2 (§9).

---

**STATUS UPDATE (2026-08-11, T051.03 CLOSED).** AD-2 resolved: Option A (PostgreSQL-only),
implemented per the "smallest safe fix" shape described above. Delivered:
`backend/src/modules/platform/backup/` (backup/restore/verify orchestration, 100% unit-tested
against test doubles), `backend/prisma/{backup,restore,verify-restore}.ts` (CLI, `npm run ops:*`),
`backend/test/backup-restore.e2e-spec.ts` (real pg_dump/pg_restore proof against real Postgres in
CI, not mocked), and `docs/release/BACKUP-RESTORE-RUNBOOK.md` (full operational runbook —
architecture, commands, retention, RPO/RTO, disaster-recovery sequence, troubleshooting). A legacy
unmerged attempt (`platform/backup`, referenced in
`docs/discovery/T032-LEGACY-RECOVERY-CLASSIFICATION.md` §4.5) was found during discovery but
**not** recovered — it was untested against real Postgres and flagged as staleness-risk; T051.03
built fresh, CI-proven tooling instead. See PR for this sprint and the FINAL SPRINT REPORT —
T051.03 for full verification detail.

---

## 2. RB-2 — Deployment Model Contradiction

**Current source evidence — chronological reconciliation.**
- Foundation ADR (`docs/architecture/adr/ADR-0001-system-architecture.md:9`) frames the system as "multi-tenant" — a **data-schema** concept (Organization→Branch→Warehouse), not a hosting-model claim.
- T010 pivot (`docs/architecture/offline-single-computer-readiness-audit.md:1-3,169`, Decision AD01/AD02) explicitly ratifies **Docker Compose as the preferred deployment mechanism** for an "Offline Single-Computer Edition" — this is the current, authoritative decision.
- `docs/setup/DEVELOPMENT-SETUP.md:5` confirms: "there is no native/no-Docker path for either [Postgres/Redis] service," citing RFC-T030 AD-1 Option D; RFC-T030 §5/§6 scored a native-Windows-Redis-substitute lowest of four options.
- `PROJECT_STATUS.md:13` still states the offline single-computer pivot, but that file is independently confirmed stale (§8 below).

**Failure mode.** None at the architecture-decision level — AD01/AD02 (Docker mandatory for the single-PC target) is internally coherent, already decided, and not being reopened here. The actual failure mode is **packaging/operational**, not conceptual:
- No frontend Dockerfile exists (`backend/Dockerfile` only) — `frontend/package.json:8`'s `start` script (`next start`) is a host-run command; Docker packaging was only ever attempted for the backend.
- No Windows service / auto-start mechanism exists anywhere (grep for NSSM/Task Scheduler/autostart returns zero hits) — the app currently requires a developer to manually run `docker compose up --build` + `npm run dev` every session.
- No production runbook exists — `DEVELOPMENT-SETUP.md:147` points to `docs/deployment/RUNBOOK.md`, which **does not exist** in this tree.
- **T022 (Deployment Packaging) is NOT STARTED on mainline** (`docs/SPRINT_DASHBOARD.md:99`) — despite this session's own prior memory describing T022 as "shipped," the actual merged `main` has no deployment-packaging artifact; that work exists only in an unmerged recovery branch (`docs/discovery/T032-LEGACY-RECOVERY-CLASSIFICATION.md:110,163`). **This is a direct correction to this session's own prior understanding — flagged explicitly rather than silently carried forward.**
- Winston logs write to a relative `logs` directory (`backend/src/logger/winston.logger.ts:31-41`) that is **not** a mounted Docker volume (`docker-compose.yml` only mounts `postgres_data`/`redis_data`) — logs do not survive container recreation.

**Severity.** Critical / Release Blocker — not because the architecture is wrong, but because **nothing has actually been built to run it** on a real customer PC.

**Operational risk.** A non-technical end user cannot currently install or run this product. There is no installer, no auto-start, no documented recovery procedure, and the one referenced runbook is a dead link.

**Architecture options (re-affirming vs. reopening AD01/AD02).**
- **A — Docker Desktop required**, formalized: ship a documented installer flow (Docker Desktop install → `docker compose up -d` via a wrapper script/shortcut → auto-start via a Windows service wrapping `docker compose`). Lowest engineering effort since it matches the already-ratified decision; highest end-user friction (Docker Desktop licensing changed in recent years for commercial use at scale — worth an explicit licensing check for a commercial POS product, not verified in this pass).
- **B — bundled/local PostgreSQL + compatible Redis alternative**, removing Docker entirely. RFC-T030 already scored this lowest for Redis specifically; would require re-litigating a already-decided RFC.
- **C — Windows service installation** wrapping the existing Docker Compose stack (NSSM or a small custom service wrapper) — closes the "must manually run commands" gap without reopening AD01/AD02.
- **D — replace Redis-dependent features** (cart TTL, OTP) with a Postgres-backed equivment, removing the Redis dependency and shrinking the Docker requirement to Postgres-only. Feasible given §1's finding that Redis holds nothing business-critical — but is new engineering work, not just packaging.
- **E — practical minimum**: keep AD01/AD02 as decided (Docker mandatory), and treat this package as pure **packaging debt**: add a frontend Dockerfile or a documented `next start` service wrapper, a Windows auto-start wrapper (Option C), a real runbook, and a `logs` volume mount.

**Smallest safe fix.** Option E — no new architecture decision needed for Docker-vs-not (already decided), just the packaging/runbook/auto-start/log-volume work that was apparently never actually merged.

**Migration impact.** None.

**Rollback strategy.** N/A (packaging/ops work, not a data-affecting change).

**Test strategy.** A clean-machine install drill: fresh Windows VM, follow the runbook verbatim, confirm the app starts, survives a reboot, and logs are inspectable afterward.

**Deployment impact.** This IS the deployment-impact work.

**Architect Decision required.** Yes — AD-3 (§9), specifically to confirm Option E (packaging-only, no re-litigation of Docker-mandatory) is the intended scope, versus Option D (remove Redis) or B (remove Docker) being worth a larger investment.

---

**STATUS UPDATE (2026-08-13, T051.04).** AD-3 resolved: **Option E** (packaging-only, AD01/AD02
Docker-mandatory NOT reopened) implemented per this section's own "smallest safe fix." Closed
every gap this discovery pass found:
- Frontend Dockerfile added (`frontend/Dockerfile`, standalone Next.js output) — the "no frontend
  Dockerfile exists" gap.
- `docker-compose.yml`'s `bring-up` service was **found silently broken** during T051.04's own
  fresh audit — it referenced `npm run prisma:production-bring-up`, a script that did not exist in
  `package.json` (`bring-up` would have failed immediately with "Missing script" on any real
  `docker compose up`). Fixed by adding the missing `prisma:bootstrap-permissions` /
  `prisma:bootstrap-first-admin` / `prisma:production-bring-up` scripts (`backend/prisma/
  bootstrap-*.ts`), completing the SPEC-T022A/T022B1 mechanism that `first-admin-initializer.ts`
  (already-shipped, reviewed code) was written for but never got a working CLI entry point.
- `backend_logs` named volume added — the "logs do not survive container recreation" gap.
- Windows auto-start: Option C (Windows service) evaluated and **not** built — no evidence found
  that Docker Desktop's own `restart: unless-stopped` + "start on login" is insufficient for V1;
  documented as the mechanism plus its one known limitation (`docker compose down` removes
  containers entirely, nothing to auto-restart) rather than building unrequested infrastructure.
- Real runbook: `docs/release/WINDOWS-DEPLOYMENT-RUNBOOK.md`.
- Postgres/Redis host port exposure removed from the operational config (`docker-compose.yml`);
  preserved for local dev via the Compose-native `docker-compose.override.yml` auto-merge
  convention — zero dev-workflow change.
- `docker-compose*.yml` and CI's real Docker Compose stack are now genuinely proven, not merely
  present — see FINAL SPRINT REPORT — T051.04 for the actual build→up→persistence→backup→restore
  evidence.

---

## 3. RB-3 — Purchase Receive Concurrency / Idempotency

**This finding is materially different from the original one-line description in the T051 authorization — the deep audit below supersedes it.**

**Current source evidence.**
- Endpoint: `PATCH :id/receive` (`purchase-order.controller.ts:97`) → `purchaseOrderService.receive()` (`purchase-order.service.ts:166-170`, only checks existence, not status) → `prisma-purchase-order.repository.ts:164-220`, one `$transaction` wrapping: a status-precondition read (`:165-169`, throws if `status !== 'APPROVED'`), a per-line loop (`:175-192`) calling `inventoryDomainService.increase(tx, ...)` then `tx.purchaseItem.update(...)`, a `tx.debt.create` (`:194-197`, comment confirms Debt rows are deliberately never updated after creation — append-only ledger by design), and a terminal `tx.purchaseOrder.update({where:{id}}, {status:'RECEIVED'})` (`:213-217`).
- No `Idempotency-Key` handling exists on this endpoint (confirmed absent — only `checkout` has this pattern).
- No `version` field exists on `PurchaseOrder` (`schema.prisma:1246-1279`).

**Failure mode — precise, not assumed.**
1. **Sequential double-submit (client retries after apparent failure/timeout, first request actually succeeded): SAFE.** The repository's in-transaction status guard (`:165-169`) rejects a second call once status is `RECEIVED` → `422 PURCHASE_ORDER_INVALID_STATUS_TRANSITION`. No re-run of inventory/debt logic.
2. **True concurrent race (two requests both read `APPROVED` before either commits): NOT reproducible in practice today, but only incidentally.** There is no `version`/CAS guard on `PurchaseOrder` itself and the terminal write (`:213-217`) is a plain `update`, not a conditional one. The reason a live double-count doesn't currently occur is a **side effect of a different module**: `InventoryDomainService.increase()` → `PrismaInventoryRepository.recordMovement()` (`prisma-inventory.repository.ts:156-168`) does its own optimistic-lock `updateMany({where:{warehouseId,productId,quantity:beforeQuantity}})`. Because both racing `receive()` calls touch the same Inventory row (same PO, same line items), Postgres serializes the competing updates and the loser's `updateMany` affects 0 rows → throws `InventoryConcurrencyConflictError`, aborting the losing transaction in full (status update and Debt creation included, since it's all one `$transaction`) → mapped to `409 PURCHASE_ORDER_INVENTORY_CONFLICT`.
3. **This same TOCTOU shape (status read → work loop → unconditional terminal `update`, no CAS) exists in four other modules**, not just PurchaseOrder: **Transfer** (`transitionStatus`, `prisma-transfer.repository.ts:130-182`, terminal write `:174-178` — additionally, the status *read* at `:138` has **no organizationId filter at all**, relying entirely on the caller's prior org-scoped check), **StockCount** (`complete()`, `:154-207`, terminal write `:199-203`), **InventoryAdjustment** (`complete()`, `:152-197`, terminal write `:189-193`), and **PurchaseReturn** (`complete()`, terminal write `:240-244`). All four share PurchaseOrder's exact risk profile and are only non-reproducible for the same incidental reason (their downstream inventory-movement calls happen to share the CAS-protected Inventory row).
4. **`SalesReturn` already solves this correctly** — every terminal write, including inline `receive()`/`cancel()`, uses `updateMany({where:{id, organizationId, version}}, {version:{increment:1}, ...})` (`sales-return/infrastructure/persistence/prisma-sales-return.repository.ts:295-299,349-353`). This pattern was established in a later module and never backported to the five modules above, which predate it.

**Severity.** High (not Critical-as-stated) — a live double-count is **not currently reproducible** given the codebase as written, but the protection is accidental and fragile (would silently disappear if `InventoryDomainService.increase()` ever became a no-op for a zero-quantity edge case, or if a future line item didn't map 1:1 to an Inventory row). The absence of a real Idempotency-Key or version guard is a genuine structural gap even though today's specific exploit path is blocked by a coincidence in a different module.

**Data-loss/corruption risk.** None observed today; latent if the incidental protection is ever removed or bypassed.

**Operational risk.** A network timeout followed by client retry is safe (case 1). A genuine double-click/double-tab race is currently blocked by luck, not design.

**Architecture options.**
- **A — Optimistic Lock only** (add `version` to PurchaseOrder + the other 4 affected entities, CAS the terminal write). Closes the TOCTOU gap directly, matches the already-proven SalesReturn pattern, smallest conceptual change.
- **B — Idempotency-Key only** (require a client-generated key, dedupe via a `CheckoutOperation`-like record). Protects against client-retry duplication explicitly rather than relying on incidental behavior, but does **not** by itself close the true-concurrency race between two independently-initiated requests (two different tabs/users clicking "Receive" with no shared key) — Optimistic Lock is the mechanism that actually closes that race.
- **C — Optimistic Lock + Idempotency-Key.** Closes both the true-concurrency race (A) and the double-submit-with-different-attempts case explicitly rather than incidentally (B) — most complete, more surface area to build/test.
- **D — server-generated operation-token/command record** (mirrors `CheckoutOperation` exactly — a dedicated table tracking in-flight/completed receive operations). Strong but heavier than the gap warrants given the entity already has a natural status machine; `CheckoutOperation` exists because Checkout has no natural status-based guard the way PurchaseOrder does.
- **Per-item loop classification**: **correctness-neutral, performance-only concern.** The loop is fully inside the single `$transaction` (`:164`) — a failure mid-loop rolls back everything (transactionally safe). It is not a batch operation, so N line items means N round-trips to `InventoryDomainService`/`Inventory` table inside one transaction — a real but separate performance question, not a correctness risk. A batch `InventoryDomainService` operation would improve throughput on large POs but is not required to close the concurrency gap.

**Smallest safe fix.** Option A, applied to all five affected entities (PurchaseOrder, Transfer, StockCount, InventoryAdjustment, PurchaseReturn) for consistency with the SalesReturn precedent — not just PurchaseOrder, since the same gap exists identically in the other four.

**Migration impact.** Add `version Int @default(1)` to 5 models — additive, non-breaking Prisma migration.

**Rollback strategy.** Standard migration rollback (drop column) if needed; application-level rollback is a revert of the CAS-write changes, no data transformation involved.

**Test strategy.** Unit tests for the CAS-conflict path (mock a version mismatch, expect 409); an integration test simulating two concurrent `receive()` calls against a real Postgres (requires Docker — cannot run in this sandbox, must run in CI); a regression test confirming the existing sequential-retry-safe behavior (case 1) is unchanged.

**Deployment impact.** None beyond the migration.

**Architect Decision required.** Yes — AD-1 (§9), and specifically whether to scope the fix to PurchaseOrder alone (matching the original RB-3 framing) or all five affected entities (matching what the deep audit actually found).

---

## 4. RB-4 — GitHub / CI Branch Protection

**Current source evidence.** `gh api repos/.../branches/main/protection` → **`404 Branch not protected`**, queried directly against the live repository during this discovery pass. `backend-ci.yml` does aggregate a real Postgres+Redis E2E job into a "Backend" check (`needs: [changes, ci, e2e]`, `if: always()`), and `frontend-ci.yml` similarly aggregates lint/typecheck/test/build/drift into a "Frontend" check — but **none of this is enforced**. Every merge to `main` this session (T046 through T050) has relied entirely on manual operator discipline (waiting for CI, checking `gh pr checks`), not a systemic GitHub guarantee.

**Failure mode.** A future merge (by this agent under different instructions, a different collaborator, or an automated process) could push directly to `main` or merge a PR with failing/incomplete checks, with GitHub raising no objection.

**Severity.** Medium-High — not a data-corruption/loss risk, but a process-integrity gap with unbounded blast radius (anything could land on `main` unguarded).

**Operational risk.** Low probability given current single-operator discipline, but zero systemic defense.

**Architecture options.** This is a GitHub settings change, not a code change — options are configuration choices, not architectures:
- Require a PR before merging (already the de facto practice).
- Require status checks to pass: **"Frontend"** and **"Backend"** (the two aggregator checks — matching what `backend-ci.yml`/`frontend-ci.yml` already compute; NOT the underlying sub-jobs like "Backend CI / ci", per the already-identified stale instruction in `docs/branch-protection-setup.md:14,26-27`, which points at sub-job names that would under-protect if followed literally).
- Require branches to be up to date before merging — reasonable given a single-maintainer repo rarely has long-lived divergent branches; low cost.
- Disallow force-push and branch deletion on `main`.
- Do NOT require multiple reviewer approvals or code-owner review — single-maintainer repo, no concrete benefit, matches the authorization's own explicit guidance (§10).

**Smallest safe fix.** Configure the four settings above via `gh api` or the GitHub UI. Zero code change.

**Migration impact.** None.

**Rollback strategy.** Trivial — revert the branch-protection settings via the same API/UI.

**Test strategy.** Attempt a deliberate direct push to `main` (in a disposable test repo or via a dry-run) to confirm rejection once configured; confirm a PR with an intentionally-failing check cannot be merged via the UI's merge button (grayed out).

**Deployment impact.** None.

**Architect Decision required.** Minimal — this is closer to "confirm the exact settings and execute" than a genuine tradeoff decision, but is included in §9 per the authorization's own framing, since GitHub settings changes are explicitly gated ("Do not change GitHub settings without explicit authorization").

---

## 5. RB-5 (newly discovered, not in the original four) — Confirmed Cross-Tenant RBAC Privilege Escalation

**This was not one of the four named blockers. It was found during the tenant-isolation audit requested in §12 of the authorization, confirmed reachable (not theoretical), and is more urgent than RB-1/RB-2/RB-4 by the authorization's own stated priority order (data corruption > data loss > deployment failure > security/tenant > ...) — a live cross-tenant write is squarely "security/tenant," and unlike RB-1/RB-2 it requires no disaster to trigger, only an ordinary authenticated user acting.**

**Current source evidence.**
- `POST /roles/:id/permissions` (`rbac/presentation/roles.controller.ts:53-70`, requires only permission `role:update`) → `rbac.service.ts:87-90` `assignPermissions(roleId, ...)` → `getRole(roleId)` (`rbac.service.ts:44-52`) → `prisma-role.repository.ts:28-38`, `role.findUnique({where:{id}})` — **no organizationId filter anywhere in this chain**.
- `POST /roles/assign` (`roles.controller.ts:72-86`, requires only `user:update`) → `rbac.service.ts:115-121` → same unscoped `getRole(roleId)`, and **no check that the target `userId` belongs to the caller's organization** either.
- `replacePermissions`/`assignRoleToUser` at the repository layer (`prisma-role.repository.ts:57-77`) take no `organizationId` parameter at all.
- **Reachability confirmed**: `backend/prisma/seed.ts:41-58` grants every organization's seeded "owner" role the entire permission catalog, including `role:update` and `user:update` (`permission-catalog.ts:264-265`). Any ordinary Owner-role user — the standard, only-seeded role for every organization — can therefore call these two endpoints with a `roleId`/`userId` belonging to a **different** organization.

**Failure mode.** An authenticated user of Organization A can:
1. `POST /roles/{roleId-of-org-B}/permissions` — silently overwrite Org B's role's entire permission set.
2. `POST /roles/assign {userId: <org B user>, roleId: <any role>}` — silently assign arbitrary roles to another organization's users, including escalating an Org B user to a role with Org A's or Org B's full permission set.

This is a genuine cross-tenant privilege-escalation and data-integrity bug, gated only by knowing/guessing a target UUID (`GET /roles/:id`, `role:view`, is also unscoped and would leak another org's role names/permissions to help guess).

**Severity.** **Critical.**

**Data-loss/corruption risk.** Not data loss, but data-integrity/authorization corruption — an attacker-controlled or careless cross-org role/permission mutation.

**Operational risk.** High if any second organization is ever onboarded to a shared deployment; **zero** risk in a genuinely single-organization-per-install deployment (each customer's Postgres has exactly one org) — this materially affects severity depending on AD-3's deployment-model outcome (§2). Worth explicit confirmation: is one Postgres instance ever shared across multiple customer organizations (e.g. a future hosted/SaaS mode), or is every deployment strictly one organization per install? The `organizationSlug`-based login (`RFC-T031-Frontend-Architecture.md:114,241`) suggests the schema was designed for multi-org-per-instance capability even if not currently used that way.

**Smallest safe fix.** Add `organizationId` verification to both `assignPermissions`/`assignRoleToUser` service methods (verify target role belongs to caller's org before mutating; verify target user belongs to caller's org before assigning) — a small, isolated, low-blast-radius fix confined to `rbac.service.ts` and `prisma-role.repository.ts`.

**Migration impact.** None (no schema change — `Role` already presumably has `organizationId`, this is a missing `where`-clause filter, not a missing column).

**Rollback strategy.** Trivial code revert if the fix somehow breaks legitimate platform-admin cross-org role management (if such a use case exists and needs a separate `isPlatformAdmin`-gated path — needs confirming during implementation, not assumed here).

**Test strategy.** A reachability regression test: two seeded organizations, attempt cross-org `assignPermissions`/`assignRoleToUser` as an Org-A user targeting Org-B's role/user, assert rejection (403/404) both before-fix (documenting the current vulnerable state) and after-fix.

**Deployment impact.** None.

**Architect Decision required.** This is flagged for immediate Architect attention — see the priority note in §9. Given its low implementation cost and isolated blast radius, it is a strong candidate to fix first regardless of how AD-1 through AD-5 resolve, but is not implemented here per the explicit "STOP before implementing" instruction.

---

## 6. Tenant Isolation — Full Audit Summary

Exhaustive classification of every business-module repository write method (full table available in the discovery transcript; condensed here):

- **Class A (organizationId directly in mutation `where`)**: barcode, unit, customer, supplier, inventory-adjustment (transitionSimple), purchase-order (transitionSimple), purchase-return (transitionSimple), stock-count (start), sales-return (**all** mutations, including terminal writes), cart (Redis key), rbac.createRole.
- **Class B (org verified via a prior org-scoped read, mutation itself unscoped)**: brand, warehouse, category, product, supplier-product, branch, organization, product-price, checkout (voucher/operation, internal server-generated ids), auth (session/user, self-scoped) — the majority of the codebase. **Not defects** — the authorization's own framing (§12) correctly anticipates this as a legitimate style, not automatically a vulnerability.
- **Class B with a TOCTOU sub-gap** (org verified, but the *terminal* write in a multi-step transaction has no re-check): purchase-order.receive, transfer.transitionStatus, stock-count.complete, inventory-adjustment.complete, purchase-return.complete — see RB-3 above; these are concurrency gaps, not tenant-isolation gaps (the org check happened, just not re-verified at the final write, and a same-org double-submit is the actual risk, not a cross-org one).
- **Class C (confirmed reachable cross-tenant vulnerability)**: **rbac only** — `assignPermissions`, `assignRoleToUser` (see RB-5). `removeRoleFromUser` has the same code-level gap but is not wired to any controller — not currently reachable.
- **Class D (not tenant-scoped by design, correctly so)**: organization module's own root operations (gated by `isPlatformAdmin` instead), the global permission catalog (`list`/`findByCodes` — genuinely global reference data, not tenant data).

**Verdict**: the codebase's dominant pattern (Class B) is a legitimate, working style, not a defect needing wholesale rework. The RBAC module is the sole outlier requiring an actual fix (RB-5). No other Class C findings were confirmed.

## 7. Optimistic Lock — Per-Entity Classification

| Entity | Classification | Note |
|---|---|---|
| Warehouse | **Optimistic-lock required (gap)** | No `version`, plain `update()` — outlier vs. every sibling master-data module |
| Inventory | Optimistic-lock — **already correctly implemented** | `quantity`-as-CAS-token pattern in `recordMovement()`, no gap |
| PurchaseOrder | Status-guarded with a **TOCTOU gap on the terminal write** | See RB-3 |
| Transfer | Status-guarded, same **TOCTOU gap** | See RB-3; additionally missing org filter on the intermediate read (mitigated by caller) |
| StockCount | Status-guarded, same **TOCTOU gap** | See RB-3 |
| InventoryAdjustment | Status-guarded, same **TOCTOU gap** | See RB-3 |
| Invoice | **Immutable** | No update method exists anywhere in the codebase — no lock needed |
| Payment | **Append-only** | No update/delete method exists — no lock needed |
| Debt | **Append-only ledger by explicit design** | Comment in source confirms "never update an existing Debt row"; balance computed dynamically from summed rows |

Recommendation basis for AD-1: extend the SalesReturn-proven `version`-CAS pattern to Warehouse (plain gap) and to the terminal writes of PurchaseOrder/Transfer/StockCount/InventoryAdjustment/PurchaseReturn (TOCTOU gap) — not a blanket "add version everywhere," since Invoice/Payment/Debt genuinely need none.

## 8. RBAC / Discount / Organization-Settings Facts

- **Roles**: exactly one seeded role (`owner`, all permissions) per organization (`seed.ts:41-58`). Real, callable, non-seed API exists to create roles and assign them (`roles.controller.ts`) — but see RB-5, that API is currently unsafe cross-org.
- **Discount**: no controller/API exists at all (`discount/presentation/` does not exist) — it's a pure internal pricing engine consumed by checkout. There is currently no product surface for a "Discount admin UI" to attach to without first building an API.
- **Organization settings**: the `Organization` model has 25 fields, but grepping all invoice/checkout/receipt code for `organization.<field>` access returns **zero matches** for every branding/contact/locale field (`displayName`, `legalName`, `taxCode`, `address`, `phone`, `email`, `logoUrl`, `province/district/ward`, `currencyCode`, `languageCode`, `timezone`). **Every Organization field beyond `id`/`code`/`slug`/`status`/`ownerUserId` is currently decorative** — editable via the Organization API but not read by any invoice/receipt/checkout code path. No PDF/print/receipt-rendering feature exists anywhere in the repository.

## 9. Documentation Integrity (informational — no separate AD needed)

`PROJECT_STATUS.md`/`docs/SPRINT_DASHBOARD.md` confirmed stale by ~10 tasks (claim "T014 in progress, T015 not started"; actual HEAD is T050 merged). Independently, this discovery pass found and corrects a **prior misunderstanding within this session's own memory**: T022 Deployment Packaging was previously understood as "shipped," but the merged `main` tree shows it as `NOT STARTED` per the dashboard, with prior work existing only on an unmerged recovery branch — this is now the authoritative, source-verified status, superseding the earlier belief. Both docs will be refreshed as part of a dedicated sub-package (T051.05) once the above findings are settled, not rewritten inaccurately or ahead of the actual decisions.

---

## 10. Architect Decisions Required — see chat output below (§9 numbering continues there as AD-1 through AD-5, plus the RB-5 flag).

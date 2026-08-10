# T050 — Reports Domain Discovery

Status: discovery CLOSED. AD-1, AD-2, AD-3, AD-4 all resolved and LOCKED (§15). Implementation authorized and in progress on `feature/T050-purchase-report`.

## 1. Current backend surface

`PurchaseReportController` (`/purchase-reports`, note: plural, Purchase-scoped route — not `/reports`), three endpoints, all permission-gated:

| Method | Route | Permission | Query DTO | Response |
|---|---|---|---|---|
| GET | `/purchase-reports/dashboard` | `report:view` | `PurchaseReportFilterDto` (`dateFrom?`, `dateTo?`) | `PurchaseReportDashboardResponseDto` — `totalAmount`, `totalOrders`, `averageCost`, `topSuppliers[5]`, `topProducts[5]`, `monthlyPurchase[12]` |
| GET | `/purchase-reports/breakdown` | `report:view` | `PurchaseReportBreakdownQueryDto` (`+ groupBy`, `page`, `limit`) | `PaginatedPurchaseReportBreakdownResponseDto` — paginated `{key, code, label, totalAmount, totalQuantity, orderCount}[]` |
| GET | `/purchase-reports/export` | `report:export` | `PurchaseReportExportQueryDto` (`+ groupBy`, `format`) | raw binary (Excel/CSV/PDF), unpaginated — exports every group matching the filter |

`groupBy` (both breakdown and export): `SUPPLIER | PRODUCT | WAREHOUSE | MONTH | USER | CATEGORY` — six dimensions.

**Filter surface is narrower than hypothesized**: only `dateFrom`/`dateTo` exist. There is **no** supplier filter, warehouse filter, status filter, or branch filter as a query parameter — filtering happens only through `groupBy`'s dimension choice, not through additional scoping filters.

## 2. Permission ownership

`report:view`/`report:export` — re-derived from source, not guessed:
- Defined once in `permission-catalog.ts`, no `purchase_report:*` namespace exists anywhere.
- The controller's own comment states explicitly: "Permission tái dùng nguyên trạng `report:view`/`report:export` từ catalog Foundation (Prompt 015) — không thêm permission mới" — these permissions predate Purchase Report's own implementation, defined at Foundation/Sprint-00 time.
- Full-backend grep confirms `report:view`/`report:export` are used **only** by `purchase-report` — no sibling reporting module exists (no `sales-report`, `inventory-report`, or generic `reports` module anywhere in `backend/src/modules`).
- This matches an established codebase-wide pattern already seen twice this session: `debt:view`/`payment:create` (Supplier Debt/Payment, T049 discovery) are *also* generic Foundation-era permissions with no module-specific namespace, deliberately reused rather than newly minted.

**Classification: leans toward (A) deliberate shared namespace by consistent codebase convention, but with an honest caveat — there is no explicit RFC/ADR/SPEC stating "Reports will span multiple domains."** The evidence is circumstantial (naming pattern precedent) not declarative (a written plan). This is presented as AD-1 rather than assumed.

## 3. Dependency graph

Purchase Report has **zero** dependency on Supplier Debt, Customer, Sales, or Inventory modules — it is a pure read-side aggregation over two tables only (see §4). No other module depends on Purchase Report. It sits at the "top" of the dependency graph — safe to build without disturbing anything else, consistent with the pattern established by every prior T04x sprint's own regression-safety findings.

## 4. Dashboard semantics

Source: `PrismaPurchaseReportRepository.getDashboard()`.

- **Data source**: `purchase_orders` (`po`) joined to `purchase_items` (`pi`) only — `FROM purchase_items pi JOIN purchase_orders po`.
- **Status filter**: hardcoded `po.status IN ('RECEIVED', 'COMPLETED')` — "Chỉ tính đơn đã thực sự nhập hàng" (only orders that actually received goods count). `DRAFT`/`APPROVED`/`PENDING` excluded (no inventory movement yet); `CANCELLED` excluded (no value).
- **`totalAmount`**: `SUM(po."totalAmount")` across matching orders.
- **`averageCost`**: weighted average = `SUM(pi.quantity * pi."unitCost") / SUM(pi.quantity)` — pre-tax/discount unit cost, not `totalAmount`-based.
- **`topSuppliers`/`topProducts`/`monthlyPurchase`**: each is literally `getBreakdown()` called internally with a fixed `groupBy` and small `limit` (5/5/12) — not separate logic.

## 5. Breakdown semantics

Same `purchase_items`/`purchase_orders` join, same `RECEIVED`/`COMPLETED` status filter, grouped by one of 6 dimensions (§1). Each dimension's `JOIN` target:

| groupBy | Joins | Notes |
|---|---|---|
| SUPPLIER | `suppliers` | current `code`/`companyName` |
| PRODUCT | `products` | current `sku`/`name` |
| WAREHOUSE | `warehouses` | current `code`/`name` — `pi."warehouseId"`, not `po."branchId"` |
| MONTH | none | `to_char(date_trunc('month', po."createdAt"), 'YYYY-MM')` |
| USER | `users` (LEFT JOIN) | `po."createdBy"` |
| CATEGORY | `products` + `categories` (LEFT JOIN) | via product's category |

**Answering the Phase 6 product-role questions directly:**
1. Dashboard purchase-only? **Yes**, entirely.
2. Breakdown purchase-only? **Yes**, entirely.
3. Depends on Purchase Order only? **Yes** — `purchase_orders`/`purchase_items` exclusively.
4. Includes Purchase Return? **No.** Zero reference to `purchase_returns` anywhere in this repository. The report shows **gross** purchase value, never netted against returns — a genuine, disclosable semantic limitation, not a bug.
5. Includes Supplier Debt/Payment? **No.** Zero reference to `debt`/`payment` tables.
6. Includes Inventory effects? **No.** No inventory/stock table reference — purely transactional PO/PI aggregation.
7. Includes taxes/discounts separately? **Not decomposed.** `pi."totalAmount"` (presumably tax/discount-inclusive per line) is summed as one figure; `averageCost` uses `unitCost` (a different, undecomposed figure). No separate tax/discount breakout exists in the response.
8. Includes branch/warehouse dimensions? **Warehouse only** (one of the 6 `groupBy` options, from `pi."warehouseId"`). **No branch dimension at all** — `po."branchId"` exists on the entity (per T045 discovery) but is never referenced here, not filterable, not groupable.
9. Exposes supplier dimension? **Yes** — both a dedicated `topSuppliers` dashboard field and a full `groupBy=SUPPLIER` breakdown option.
10. Historical snapshot or joined to current master data? **Joined to current master data** (`JOIN suppliers`, `JOIN products`, `JOIN warehouses`, `LEFT JOIN users`, `LEFT JOIN categories`) — **not** using any snapshot fields the way Invoice/Sales Return do. A renamed supplier/product will show its *current* name against *historical* purchase totals. This is a reasonable reporting-UX choice (readability over point-in-time accuracy) but is a real, disclosable semantic difference from every snapshot-based module built so far this session.

## 6. Export semantics

`GET /purchase-reports/export?groupBy=&format=` — `format` ∈ `EXCEL | CSV | PDF`, **unpaginated by explicit design** ("Export luôn xuất TOÀN BỘ dòng khớp filter... không phải số PurchaseOrder" — bounded by distinct group count, not raw order count). Filename is **dynamic**, computed server-side: `purchase-report-${groupBy.toLowerCase()}.${extension}` — unlike Supplier Export's static `suppliers.xlsx`. Content-Type varies by format (`.xlsx` MIME, `text/csv`, `application/pdf`). Three renderer implementations exist (`ExcelJS`, raw CSV string-building, `PDFDocument`/`pdfkit`) — genuinely more complex than Supplier's single-format export.

## 7. Binary transport findings

**Same gap as Supplier Export, confirmed independently, not assumed:** the controller has no `@ApiResponse()` on `export()` (bypasses the envelope via `@Res()` + manual `res.setHeader()`/`res.send()`), so the generated Orval hook is `apiClientMutator<void>` — identical failure mode (no OpenAPI response schema → `void` return type → `apiClientMutator`'s JSON-envelope-unwrapping assumption breaks on raw binary). `usePurchaseReportControllerGetDashboard`/`GetBreakdown` are normal, fully-typed generated hooks (proper `@ApiResponse()` exists on both) — only `export` needs a transport exception.

**This is now the SECOND proven binary-download endpoint in this codebase** (Supplier Export was the first, T049 AD-1). Whether to write a second narrow wrapper (mirroring `use-supplier-export.ts` exactly) or extract a shared, parameterized file-download utility (URL + params + filename-fallback + object-URL lifecycle, reusable by both) is a genuine architecture question — see AD-2.

## 8. Navigation options (not implemented)

Current sidebar (`nav-items.ts`) has no "Reports"/"Báo cáo" section at all — every existing entry lives inside a domain-labeled section (Master Data / CRM / Kho vận / Mua hàng / Bán hàng). Three placements are structurally possible:
- **Nest under "Mua hàng"** — matches the route's own `/purchase-reports` naming, zero new top-level section, but implicitly commits to Purchase-only forever and would need restructuring if a second report module ever lands.
- **New top-level "Reports"/"Báo cáo" section**, Purchase Report as its first entry — matches the sidebar's own established sectioning convention, future-extensible, but presumes AD-1 leans toward a broader Reports domain.
- **Standalone route** (`/purchase-report` off Dashboard, no section) — least discoverable, inconsistent with every other module's placement pattern; not recommended regardless of AD-1's outcome.

Placement is a direct consequence of AD-1, not a separate technical question — resolved once domain ownership is decided.

## 9. Visualization requirements

Response shapes are flat KPI numbers (`totalAmount`/`totalOrders`/`averageCost`) plus tabular breakdown lists (`{key, code, label, totalAmount, totalQuantity, orderCount}`). This maps cleanly to **KPI/stat cards + tables** — nothing in the response shape (no time-series array beyond a flat `monthlyPurchase` breakdown list, no pre-aggregated bucket structure) demands a charting library. Per the explicit instruction, no charting dependency is proposed at this stage; `monthlyPurchase` can render as a table (or a simple bar list) using existing primitives, matching Phase 9's "keep it tabular unless there's a clear product reason" guidance.

## 10. Date/time/money semantics — flagged as ambiguous

- **Default range**: `dateFrom`/`dateTo` are both optional with no server-side default — omitting both returns **all-time, unbounded history**. No implicit "last 30 days" or similar.
- **Timezone**: `buildDateFilter()` compares `po."createdAt"` (a Prisma `DateTime`, stored as Postgres `timestamptz`/UTC) directly against the raw `dateFrom`/`dateTo` strings via `>=`/`<=` in raw SQL — no explicit timezone normalization anywhere in the query-building code. `@IsDateString()` accepts both bare dates (`"2026-08-01"`) and full ISO-with-offset strings; a bare date would be interpreted as UTC midnight by Postgres, which may not match a user's local "start of day" expectation. This app targets offline single-computer deployment (lower multi-timezone risk in practice), but the ambiguity is real and unresolved in the current contract.
- **Boundary inclusivity**: both bounds are inclusive (`>=`/`<=`), consistently.
- **Money/decimal**: `Prisma.Decimal` throughout, serialized via `.toString()` — matches the established pattern used everywhere else in this codebase; no new risk here.

**This genuinely meets Phase 10's STOP threshold** — the timezone/default-range ambiguity is not merely cosmetic; a frontend date-range picker built without resolving it could silently produce a report that includes/excludes boundary-day transactions depending on assumptions never confirmed against actual production behavior.

## 11. Future extensibility

If AD-1 resolves toward a broader Reports domain, the `groupBy`/breakdown/export pattern here (generic dimension enum + shared response shape) is a reasonable template a future Sales/Inventory report could structurally mirror — but nothing in current source proves that intent; it would be a new decision at that time, not inferred now.

## 12. Non-scope

Not proposed at this stage: implementation of any screen, any chart/graph, Supplier Payment, Supplier Product, Accounts Payable, a generic Reports registry/framework, or resolution of the date/timezone ambiguity (that resolution itself may require Architect input beyond this discovery, once AD-1/AD-2 are settled and implementation begins).

## 13. Risks

- Building a Purchase-only screen now, only to have a broader Reports domain declared later, risks route/navigation rework (mitigated by resolving AD-1 first, as instructed).
- Building a second bespoke Export wrapper without evaluating extraction risks near-duplicate code with `use-supplier-export.ts` (AD-2 addresses this directly).
- Shipping a date-range UI without resolving the timezone/default-range ambiguity risks silently wrong totals at day boundaries.
- Gross-vs-net (no Purchase Return netting) and current-vs-historical-name (joined, not snapshotted) semantics could mislead users who assume this report behaves like Invoice/Sales Return's own snapshot-based history — worth explicit UI copy/documentation whenever implementation proceeds, not something to fix in the backend without separate authorization.

## 14. Architect Decisions

### AD-1 — Domain ownership

**Question:** Should T050 build a Purchase-only report screen, or the first screen of a broader Reports domain?

**Evidence:** Route is `/purchase-reports` (Purchase-scoped naming). Permissions (`report:view`/`report:export`) are generic/Foundation-era, unnamespaced, and — per the controller's own comment — deliberately reused rather than newly minted, matching an identical pattern already seen with Supplier Debt's `debt:view`/`payment:create`. No sibling reporting module exists yet anywhere in the backend. No RFC/ADR/SPEC document declares a multi-domain Reports plan.

- **Option A — Purchase-only module.** Ship a `/purchase-reports` (or nested under "Mua hàng") screen scoped exactly to what exists. Simplest, matches the route's own naming exactly, zero speculative structure.
  *Consequence:* if a Sales/Inventory report is authorized later, it would need its own navigation entry point decided independently — no forced-but-empty "Reports" section sitting around unused in the meantime.
- **Option B — First screen of a broader Reports domain.** Add a new top-level "Reports"/"Báo cáo" nav section now, with Purchase Report as its sole current entry, anticipating future siblings.
  *Consequence:* matches the permission-naming evidence's implication most directly and avoids a later navigation restructure — but commits to structure ahead of any other reporting module actually existing, based on inference rather than a declared plan.
- **Option C — Embedded Purchase analytics section.** Fold dashboard/breakdown into the existing Purchase Orders screen (e.g., a "Reports" tab within `/purchase-orders`) rather than a standalone route.
  *Consequence:* smallest navigation footprint, but harder to discover independently and awkward if Export (a distinct, permission-gated capability — `report:export` vs `purchase:view`) needs its own prominent entry point.

**Recommendation:** **Option A**, with the explicit caveat that this is a judgment call given real (if circumstantial) evidence for B. The route naming (`/purchase-reports`, plural, Purchase-scoped) is the most concrete, unambiguous signal available; the permission-naming pattern is suggestive but not declarative. Building narrowly now costs nothing — a future Reports section can absorb this screen's route under a new parent later without re-deriving any of the underlying data logic, whereas building broad structure now for a domain that may never materialize is pure speculation.

### AD-2 — Export client architecture

**Question:** Should T050's Export use a second narrow binary-download wrapper (mirroring `use-supplier-export.ts` exactly), or should the two proven cases (Supplier, now Purchase Report) justify extracting a shared, parameterized file-download utility?

**Evidence:** Both endpoints share the identical failure mode (no `@ApiResponse()` → `apiClientMutator<void>` → broken JSON-envelope assumption on binary) and an identical fix shape (`apiClient` direct + `responseType: 'blob'` + object-URL lifecycle). Purchase Report's export is materially richer than Supplier's: 3 formats (not 1), dynamic server-computed filename (not static), and a `groupBy`-parameterized query shape (not a fixed filter set) — the extraction, if done, would need to accommodate this variance, not just copy-paste Supplier's version.

- **Option A — Second narrow wrapper**, `use-purchase-report-export.ts`, structurally similar to but not sharing code with `use-supplier-export.ts`.
  *Consequence:* Some duplication (object-URL create/click/revoke boilerplate, ~15-20 lines) but each wrapper stays simple, single-purpose, and easy to reason about in isolation — matching this session's consistent preference for small, narrowly-scoped exceptions over shared abstractions built ahead of a proven need.
- **Option B — Extract a shared `useFileDownload`/`downloadBlob` utility** now that a second real case exists, parameterized by URL, params, and a filename-resolution strategy (static vs. `Content-Disposition`-derived vs. server-computed-from-query).
  *Consequence:* Removes duplication immediately; the two real cases now available make the abstraction's shape evidence-based rather than speculative (unlike building it after only one example). Slightly larger refactor: would touch `use-supplier-export.ts` too, not just add new code.

**Recommendation:** **Option B**, since — unlike most "wait for a third example" cases — the abstraction's exact shape is now fully determined by two concrete, structurally-identical proven cases (not a guess about a hypothetical future one), and the boilerplate (object-URL lifecycle, `apiClient` direct call, `responseType: 'blob'`) is verbatim-identical between them; only the filename-resolution strategy and query-param shape differ, both of which parameterize cleanly. This is offered as a recommendation, not a unilateral choice — Option A remains fully valid if the Architect prefers to keep every exception maximally isolated.

### AD-3 — Date range contract (optional semantics)

**Question:** Does the frontend date-range filter need any invented default (e.g. "last 30 days"), or does "optional" mean literally optional, matching the backend contract described in §10?

**Decision: APPROVED.** Optional truly means optional. Omitting both `dateFrom`/`dateTo` sends no date params at all and returns all-time unbounded history, exactly matching current backend behavior (§10) — the frontend must not invent a default range. This closes the "default range" half of §10's ambiguity; the timezone half is resolved separately by AD-4.

### AD-4 — Purchase Report date-range timezone semantics

**Question:** What timezone owns the `dateFrom`/`dateTo` boundary conversion, given `Organization.timezone`/`Branch.timezone` exist (IANA-validated, per `backend/src/modules/organization/domain/entities/organization.entity.ts:21` and `backend/src/modules/branch/domain/entities/branch.entity.ts:21`) but are consumed nowhere in application logic (confirmed by exhaustive grep, zero matches outside declaration/storage layers)?

**Decision: APPROVED.** Timezone ownership for T050 is **browser-local timezone** — not `Organization.timezone`, not `Branch.timezone`, not a hardcoded `Asia/Ho_Chi_Minh`. This is an explicit product decision for the offline/single-computer deployment model (§9 known future debt below), not an inference from the dormant fields.

- **`dateFrom`** — beginning of the selected browser-local calendar day: `YYYY-MM-DDT00:00:00.000000<LOCAL_OFFSET>` (e.g. `2026-08-10T00:00:00.000000+07:00`). Never `new Date("YYYY-MM-DD")` (parses as UTC, not local).
- **`dateTo`** — final representable microsecond of the selected browser-local calendar day: `YYYY-MM-DDT23:59:59.999999<LOCAL_OFFSET>`. The backend contract is `createdAt <= dateTo` (inclusive, §10's confirmed boundary inclusivity), so this avoids silently excluding records in the final sub-millisecond portion of the day.
- **Offset** — derived dynamically per boundary from the browser's local timezone (`+HH:MM`/`-HH:MM`), never hardcoded, computed independently for start/end to remain correct across a DST transition.
- **Backend validation empirically confirmed** (per AD-4's own gate, run against `PurchaseReportFilterDto` via `class-validator`'s `@IsDateString()`): both a positive-offset (`+07:00`) and negative-offset (`-05:00`) 6-digit microsecond ISO string pass validation with zero errors. No backend contract defect — no backend change needed or authorized for T050.
- **Implementation**: one small, native-JS, unit-tested date-range utility, independent of Purchase Report rendering — see `frontend/src/lib/date-range.ts`.
- **Known future debt** (recorded per AD-4 §9): report timezone ownership is currently browser-local for the single-computer v1.0 deployment model. `Organization.timezone`/`Branch.timezone` remain dormant. A future decision is needed before multi-location/distributed/centrally-hosted reporting.
- **UI copy**: no timezone selector; UI must not imply Org/Branch timezone is in use.

## 15. Architect Decisions — LOCKED

AD-1 (Option A, Purchase-only), AD-2 (Option B, shared binary-download utility), AD-3 (optional truly optional, no invented default), AD-4 (browser-local timezone boundaries, exact ISO format above) are all resolved and locked. Not to be reopened without new source evidence directly invalidating them.

Discovery phase CLOSED. Proceeding: spec detail as implementation lands → shared date-range utility → shared file-download utility → Supplier Export migration → Purchase Report Dashboard/Breakdown/Export → tests → accessibility → full validation → publication → PR/CI → merge → post-merge closure.

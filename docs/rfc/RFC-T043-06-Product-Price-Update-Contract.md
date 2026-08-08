# RFC-T043.06 — Product Price Update Contract

**Status:** DRAFT — awaiting Architect Decision. Architecture RFC only; no code, schema, or OpenAPI
change is included in or authorized by this document.
**Authority:** ARCHITECT AUTHORIZATION — T043.06 (Architecture RFC only, no implementation).
**Origin:** T043 Architect Decision AD-3 ("Price editing is REQUIRED before PRODUCT MODULE can be
declared CLOSED... NO technical API shape is authorized yet... Create a focused mini-RFC").
**Authorship note:** Claude-authored under explicit, scoped Architect delegation for this package
only (same one-time-exception basis as RFC-0003, T007 Brand) — not a change to the standing rule
that RFC authorship belongs to the Architect.

---

## 1. Problem Statement

Today, once a Product is created, its prices can never be changed through any existing API.
`UpdateProductDto` has no `prices` field; `UpdateProductInput` (repository layer) has no `prices`
field either. A POS system that cannot change a price after a product exists is materially
incomplete (T043 AD-3). This RFC evaluates three candidate API shapes to close that gap and
recommends one, without writing any code.

---

## 2. Current Architecture, Re-Derived From Source

### 2.1 `ProductPrice` — the Prisma model (`backend/prisma/schema.prisma:943-960`)

```prisma
model ProductPrice {
  id        String  @id @default(uuid()) @db.Uuid
  productId String  @db.Uuid
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  type  ProductPriceType   // RETAIL | WHOLESALE | VIP | DEALER
  price Decimal @db.Decimal(18, 2)

  createdBy String?   @db.Uuid
  updatedBy String?   @db.Uuid
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@unique([productId, type])
  @@index([productId])
  @@map("product_prices")
}
```

Key facts:
- **No `organizationId` column.** Multi-tenant scoping is entirely indirect, via `productId → Product.organizationId`. This is the same shape `Barcode` was in *before* SPEC-PRODUCT-001 §3.4 required denormalizing `organizationId` onto it — but for a different reason (see §3.5.6 below): `Barcode.code` needed org-scoped *global* uniqueness across many products, which `ProductPrice` does not need (its own uniqueness, `[productId, type]`, is already implicitly org-safe because a `productId` belongs to exactly one organization).
- **`@@unique([productId, type])`** — at most one row per `(product, price type)` pair. "Multi-price support" in this schema means up to 4 concurrent price *tiers* per product (RETAIL/WHOLESALE/VIP/DEALER), not multiple historical prices of the same type.
- **No `version` column of its own.** The only Optimistic Lock token in the Product aggregate today is `Product.version` (added by SPEC-PRODUCT-001, activated by T043.05).
- **Soft-delete-capable** (`deletedAt`) but nothing in the codebase currently ever sets it — `ProductPrice` rows are only ever hard-created, never updated or deleted by any existing code path.

### 2.2 A pre-existing, unused trap: `PriceHistory` (`schema.prisma:1053-1073`)

```prisma
model PriceHistory {
  id        String  @id @default(uuid()) @db.Uuid
  productId String  @db.Uuid
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  priceType     PriceType   // COST | SELLING  (NOT ProductPriceType)
  oldPrice      Decimal @db.Decimal(18, 2)
  newPrice      Decimal @db.Decimal(18, 2)
  changedBy     String? @db.Uuid
  changedByUser User?   @relation("PriceHistoryChangedBy", fields: [changedBy], references: [id], onDelete: SetNull)
  reason        String?
  ...
  @@map("price_histories")
}
```

Confirmed via `grep -rn "PriceHistory" backend/src` (application code) and `backend/src/**/*.spec.ts`
(tests): **zero matches anywhere.** This table is dead schema — never read or written by any code
in the repository. Its own `priceType` uses `PriceType` (`COST`/`SELLING`), a *different* enum from
`ProductPrice.type` (`ProductPriceType`: `RETAIL`/`WHOLESALE`/`VIP`/`DEALER`) — it appears to predate
the current multi-tier `ProductPrice` design (likely modeling the old single `costPrice`/
`sellingPrice`-on-Product shape). **It cannot be reused as-is** for RETAIL/WHOLESALE/VIP/DEALER price
history without either widening `PriceType` or introducing a new table — this RFC treats it as a
schema artifact to flag, not a ready-made solution (see §5.3, Option comparisons).

### 2.3 How `ProductPrice` is written today — Create only, one atomic nested write

`prisma-product.repository.ts:35-91` (`create()`): a single `this.prisma.product.create({ data: {
..., prices: { createMany: { data: input.prices } }, ... } })` — Prisma's nested `create` is
implicitly one transaction; `images`/`barcodes` are created the same way, in the same call.
`product.service.ts:82` passes `dto.prices` straight through unchanged, after
`assertHasRetailPrice(dto.prices)` (line 51) — **a real, always-enforced invariant**: at least one
`RETAIL`-type price row is required at creation, checked in the service layer (not just
`@ArrayMinSize(1)` on the DTO, which only guarantees "1 price of *some* type").

### 2.4 How `Product` itself is written today — flat `updateMany` compare-and-swap, NOT nested

`prisma-product.repository.ts:127-168` (`update()`):

```ts
const updateResult = await this.prisma.product.updateMany({
  where: { id, version: expectedVersion },   // NOTE: no organizationId in this WHERE
  data: { /* ...scalar Product fields only... */, version: { increment: 1 } },
});
if (updateResult.count === 0) throw new ProductConcurrencyConflictError(id);
const product = await this.prisma.product.findUniqueOrThrow({ where: { id }, include: PRODUCT_INCLUDE });
```

This is a **flat, single-table `updateMany`** — it does not, and structurally cannot as written,
touch any relation (`ProductPrice`/`ProductImage`/`Barcode`) in the same call the way `create()`
does. `Prisma.update()`/`updateMany()` do not support nested relation writes conditioned on a
compare-and-swap `WHERE` the way nested `create` does. Any option that updates `ProductPrice` as
part of the *same* atomic operation as a `Product.version` check requires an explicit
`this.prisma.$transaction([...])` (interactive or batch) — it does not fall out "for free" from the
existing `update()` shape. This is the single most important structural fact for §3's transaction-
boundary analysis.

Also note (pre-existing, not introduced by this RFC, not something this RFC proposes changing):
`update()`'s `WHERE` has no `organizationId` — cross-tenant write safety currently rests entirely on
`ProductService.update()`'s prior `findById(id, organizationId)` existence check (line ~154) plus
UUID unguessability, not a second check at the write layer. Whatever Price mechanism is chosen
inherits the same class of question and should be held to the same standard the Architect has
already accepted for `Product.update()` itself — not a new, separate bar.

### 2.5 The closest existing precedent: `Barcode` — already a shipped sibling pattern

`Barcode` (T009, already shipped, `docs/rfc` not consulted here — precedent taken directly from
running code) is a **structurally identical problem already solved once** in this exact codebase:
a child entity of `Product`, needing its own lifecycle, referenced by `productId`.

- **Route shape**: `@Controller('barcodes')` (`barcode.controller.ts:44`) — a **flat, top-level
  resource** (`/barcodes`, `/barcodes/:id`), **not** nested under `/products/:id/barcodes`.
- **Own independent Optimistic Lock**: `BarcodeEntity.version: number` (`barcode.entity.ts`),
  completely decoupled from `Product.version`. `BarcodeVersionDto` (`barcode-version.dto.ts`) is a
  dedicated `{ version: number }` body shared by Archive/Restore/SetDefault — its own doc comment
  cites `SPEC-BARCODE-001 §4.1/§10, Decision BQ10`: "3 thao tác này đều bắt buộc Optimistic Lock,
  khác mặc định chuẩn dự án (chỉ PATCH)" (these 3 operations all require Optimistic Lock, unlike
  the project's own default of requiring it only on PATCH) — i.e. the Architect has *already*
  decided, once, that a Product-child entity may carry its own independent version token rather
  than borrowing the parent's.
- **Own permission namespace**: `barcode:view/create/update/delete/restore`
  (`permission-catalog.ts:64`, `crud('barcode', 'mã vạch', ['restore'])`) — completely separate
  from `product:*`.
- **One difference from the Price problem**: `Barcode` has no "must always have ≥1" invariant
  analogous to `assertHasRetailPrice()` — a `Barcode` list can legally be empty. `ProductPrice`
  cannot (a Product must always keep ≥1 `RETAIL` price row after any update, same as at creation).

### 2.6 Downstream dependency — Purchase / Sales / POS never read `ProductPrice` live

Fresh grep confirms **zero** code outside the `product` module reads `productPrice`/`ProductPrice`
anywhere. Every transaction-line model instead carries its **own** scalar snapshot column,
independent of `ProductPrice`:

| Model | Own price/cost column | Schema location |
|---|---|---|
| `OrderItem` | `unitPrice` | `schema.prisma:1621` |
| `InvoiceItem` | `unitPrice` | `schema.prisma:1698` |
| `SalesReturnItem` | `unitPrice` | `schema.prisma:1773` |
| `PurchaseItem` | `unitCost` | `schema.prisma:1288` |

This is the exact same snapshot discipline already established for `Cart` (confirmed in T043 Phase
A discovery: no Prisma `Cart` model, `cart.entity.ts` copies `productName`/`price` at add-time) and
for `Product`'s own scalar fields generally. **Consequence: whichever Price-update design is chosen,
it has zero retroactive effect on Purchase/Sales/POS/Cart — none of those read live prices, ever.**
This materially lowers the blast radius of every option below; it is not a reason to prefer one
option over another.

### 2.7 OpenAPI / generated client mechanics (unchanged regardless of option chosen)

`npm run export:openapi` (CI `e2e` job, `.github/workflows/backend-ci.yml`) boots the real
`AppModule` and regenerates `docs/api/openapi.json`; a drift check (`git diff --exit-code`) fails
the build if the committed file doesn't match. The frontend's Orval-generated client
(`frontend/src/generated/product/product.ts`, currently a stale, gitignored stub — flagged in T043
Phase A discovery) is regenerated from that same document. **All three options below produce some
OpenAPI diff** (new field or new endpoint) and therefore require this regeneration step regardless
of which is chosen — this is not a discriminator between options, only a shared, unavoidable
implementation cost.

---

## 3. Candidate Options

### Option 1 — Extend `PATCH /products/:id` with an optional `prices` field

`UpdateProductDto` gains `prices?: UpdateProductPriceDto[]`. A `PATCH` that includes `prices`
replaces the full price set (or a subset, depending on chosen semantics — see §3.1.4) in the same
request that can also change scalar fields, gated by the same `version`.

**3.1.1 Transaction boundaries** — `update()` (`prisma-product.repository.ts:127`) would need to
change from a flat `updateMany` to an explicit `this.prisma.$transaction(async (tx) => { ...
updateMany on products...; ... write ProductPrice rows via tx...; })`, since (per §2.4) nested writes
don't compose with a compare-and-swap `updateMany`. This is a real, non-trivial change to the one
method every other Product update already depends on (type-change guard, archive-adjacent code all
call through the same `update()`).

**3.1.2 Optimistic Locking** — reuses `Product.version` directly; no new concurrency token. A price
edit and a name edit racing against each other are naturally serialized by the same version check
that already exists. Simple, but couples price-editing frequency to product-editing frequency: any
concurrent edit to *either* prices or scalar fields contends for the same version, so a busy POS
"just fix a typo in the name" edit and a "just adjust the price" edit from two different staff at
the same moment become a false-positive conflict for each other even though they touch disjoint
data.

**3.1.3 Product version interaction** — every price-only change still increments `Product.version`
(the same column used for name/category/etc.), even though nothing about the Product's own scalar
identity changed. Any other client holding a stale `Product.version` (e.g., an open Edit form that
hasn't touched price at all) now sees a conflict on its *next* unrelated save, purely because
someone else changed a price minutes earlier. This is the most consequential trade-off of this
option.

**3.1.4 Replacement vs. patch semantics** — ambiguous by construction unless specified further:
sending `prices: [{ type: 'RETAIL', price: 100000 }]` alone could mean either "replace the entire
price set with just this one row" (destroying `WHOLESALE`/`VIP`/`DEALER` if they existed) or "upsert
this one type, leave the others untouched." Nothing in the existing `UpdateProductDto` pattern
(all-scalar, no arrays) sets a precedent either way — this ambiguity is specific to this option
and would need its own sub-decision if chosen.

**3.1.5 ProductPrice ownership** — stays inside the `product` module (no new module), consistent
with `images`/`barcodes`-at-creation already living there. But at odds with the Barcode precedent
(§2.5): Barcode deliberately does *not* let `PATCH /products/:id` touch barcodes at all — the
project has already drawn this exact ownership line once, the other way.

**3.1.6 Audit/history** — falls under the existing `toAuditSnapshot()` (product.service.ts) /
`AuditLogService.log({ oldValue, newValue })` call already made on every `update()`. **Currently
`toAuditSnapshot()` only captures scalar Product fields** — it would need to be extended to include
prices for this to actually produce a useful diff, which is a real, non-zero addition regardless of
which option is chosen for the endpoint shape itself.

**3.1.7 Multi-tenant implications** — no new gap beyond what `Product.update()` already has (§2.4)
— inherits the same organizationId-via-prior-`findById` pattern already accepted.

**3.1.8 Multi-price support** — same as current: up to 4 concurrent tiers, keyed by `type`. No
change to that shape under this option.

**3.1.9 Purchase/Sales/POS dependency** — none (§2.6).

**3.1.10 API compatibility** — additive (`prices?` optional field), does not break existing
`PATCH` callers who omit it.

**3.1.11 OpenAPI impact** — one field added to `UpdateProductDto`'s schema; no new path.

**3.1.12 Generated client impact** — `useProductControllerUpdate`'s existing mutation hook gains an
optional field in its request-body type; no new hook.

**3.1.13 Rollback** — a schema/DTO-level revert (remove the field); no new table, no new route to
un-deploy. Cleanest rollback story of the three.

**3.1.14 Implementation complexity** — **Medium-High**, concentrated risk: touches the one shared
`update()` method every scalar-field edit already depends on, converting it from a simple
`updateMany` to a `$transaction`. A bug here risks every existing Product update path, not just
price editing.

**3.1.15 Future extensibility** — poor fit for eventual per-branch pricing, scheduled/promotional
price changes, or price-approval workflows (Decision 8/RFC-0001 already deferred multi-price-list
to a future Promotion Sprint) — this option has no natural seam to grow into those without another
redesign later.

### Option 2 — Dedicated Product Price endpoint (flat, top-level, mirrors Barcode)

A new, separate top-level resource — e.g. `@Controller('product-prices')` or
`PATCH /products/:id/prices` handled by a *dedicated* `ProductPriceController`/`ProductPriceService`
(new small module), independent of `ProductController`/`ProductService`. Mirrors the Barcode
precedent (§2.5) almost exactly: its own controller, its own service, its own permission
(`product-price:update` or similar), and — most importantly — its **own** `version` field on
`ProductPrice` for its own Optimistic Lock, independent of `Product.version`.

**3.2.1 Transaction boundaries** — cleanly separated: this endpoint's own write only ever touches
`ProductPrice` rows for one `productId`, in its own `$transaction` (or a plain `updateMany`/`upsert`
per type, since `ProductPrice` rows don't currently need a nested nested-write). `Product.update()`
(§2.4) is untouched — zero risk to the existing, already-hardened compare-and-swap path.

**3.2.2 Optimistic Locking** — if `ProductPrice` gains its own `version` (per-product-price-set or
per-row — see open question in §7), price edits and scalar-field edits stop contending for the same
token. Matches the Barcode/Decision-BQ10 precedent directly: the Architect has already approved
"a Product-child entity may carry its own independent version" once.

**3.2.3 Product version interaction** — **none** — `Product.version` does not change when a price
changes. This avoids Option 1's false-conflict problem (§3.1.3) entirely. Trade-off: a client
displaying "last updated" or relying on `Product.version` as a proxy for "has anything about this
product changed" would need to separately watch price changes too, since they're no longer reflected
in the parent's version counter.

**3.2.4 Replacement vs. patch semantics** — a dedicated endpoint can define its own, unambiguous
contract from a clean slate (e.g., always replace the full set in one call, matching Create's own
`prices: [...]` shape exactly — the client already has to send a full array at creation, so asking
for the same shape on update is a smaller conceptual jump than Option 1's ambiguous partial-patch
question).

**3.2.5 ProductPrice ownership** — moves out of the `product` module into its own boundary,
exactly like Barcode did. Requires a new `ProductPriceDomainService`-style read-only accessor if any
other module ever needs to reference it (none do today, per §2.6) — consistent with the
Repository-Boundary/ADR-0010 pattern already used for Product, Category, Brand, Unit.

**3.2.6 Audit/history** — a dedicated service gets its own `AuditLogService.log()` call
(`entityType: 'ProductPrice'`), cleanly separated from Product's own audit trail — arguably a
*better* fit than Option 1's forced extension of `toAuditSnapshot()`, since a price-specific audit
action (`product-price.update`) is more precise than a generic `product.update` entry that happens
to include a price diff.

**3.2.7 Multi-tenant implications** — same as §2.1: no `organizationId` column on `ProductPrice`
itself, so a dedicated repository's queries would join through `Product` (or accept `organizationId`
explicitly and filter via a `product: { organizationId }` relation filter) — a small, well-precedented
pattern already used elsewhere in this codebase. No migration required (unlike Barcode's own
`organizationId` denormalization, which was needed only because `Barcode.code` required global-
within-org uniqueness — `ProductPrice`'s uniqueness is already safely scoped by `productId` alone,
per §2.1).

**3.2.8 Multi-price support** — unchanged shape (4 tiers by `type`); a dedicated endpoint can accept
the full array per call, matching Create.

**3.2.9 Purchase/Sales/POS dependency** — none (§2.6).

**3.2.10 API compatibility** — fully additive; existing `PATCH /products/:id` is completely
untouched.

**3.2.11 OpenAPI impact** — one new path + a new response/request DTO pair. Larger OpenAPI diff
than Option 1, but isolated (new operation, not a modified one).

**3.2.12 Generated client impact** — one new Orval hook (e.g.
`useProductPriceControllerUpdate`), no change to the existing `useProductControllerUpdate` hook's
shape — lower risk of an accidental frontend regression on the existing Product Edit form.

**3.2.13 Rollback** — remove the new module/route; zero risk to `Product.update()`, which was never
touched. Second-cleanest rollback (behind Option 1, since a new permission code and a possible
`version` column addition are new committed surface to also revert).

**3.2.14 Implementation complexity** — **Medium** — a full new small module (controller/service/
repository/DTOs/permission/tests), but each piece is a close copy of an already-proven pattern
(Barcode). No change to any existing, already-tested code path.

**3.2.15 Future extensibility** — best of the three: a dedicated module is the natural place to
later add branch-specific pricing, scheduled price changes, or a real `PriceHistory`-style audit
table (§2.2) with the CORRECT enum this time, without disturbing Product's own contract again.

### Option 3 — Product Price sub-resource (nested route, e.g. `/products/:id/prices`)

Structurally very close to Option 2 (separate service/module, separate concurrency token possible),
differing only in route shape: nested under the parent (`/products/:id/prices/:priceId` or
`/products/:id/prices` for a bulk replace) instead of flat.

**3.3.1–3.3.9** — identical analysis to Option 2 for transaction boundaries, Optimistic Locking,
Product version interaction, ownership, audit, multi-tenant, multi-price support, and Purchase/
Sales/POS dependency (none of those are affected by route nesting, only by whether the module is
separate — which it is, same as Option 2).

**3.3.10 Replacement vs. patch semantics** — a nested collection route (`POST/PUT
/products/:id/prices`, `PATCH /products/:id/prices/:priceId`) more naturally invites RESTful
per-row semantics (edit exactly one price type at a time) rather than Option 2's simpler
whole-array replace. This is a genuine expressiveness advantage if per-tier editing turns out to be
a real desired UX (e.g., "just change WHOLESALE, don't touch RETAIL") — but nothing in the current
Product Edit UX pattern (Category/Brand/Unit, all whole-entity PATCH forms) establishes any
precedent for per-row-of-a-child-collection editing anywhere in this project yet.

**3.3.11 API compatibility / 3.3.12 OpenAPI impact / 3.3.13 Generated client impact** — same
shape of impact as Option 2 (new path(s), new DTOs, new hook(s)) — marginally *more* surface if
per-row endpoints are added (`GET/PATCH/DELETE /products/:id/prices/:priceId` is 3+ operations vs.
Option 2's single bulk-replace operation).

**3.3.14 Implementation complexity** — **Medium-High** — same base cost as Option 2, plus the
extra design/implementation work of per-row CRUD if that path is taken, plus a route-parsing detail
Barcode's own precedent deliberately avoided (`@Controller('barcodes')`, flat — not
`/products/:id/barcodes`). Diverging from that established precedent without a concrete reason adds
inconsistency cost to the codebase (a future reader has two *different* answers to "how does this
project expose a Product-child collection" for two structurally similar entities).

**3.3.15 Future extensibility** — same ceiling as Option 2; the nested-route choice doesn't change
what's extensible later, only today's request/response shape.

**3.3.16 Rollback** — same as Option 2.

---

## 4. Summary Comparison

| Dimension | Option 1 (extend PATCH) | Option 2 (dedicated flat endpoint) | Option 3 (nested sub-resource) |
|---|---|---|---|
| Touches existing `Product.update()` | **Yes** — converts it to a transaction | No | No |
| New concurrency token possible | No — reuses `Product.version` | Yes — own `version`, Barcode-precedented | Yes — own `version`, Barcode-precedented |
| False-conflict risk (price edit blocks unrelated scalar edit) | **Yes** | No | No |
| Matches existing Barcode precedent | No | **Yes**, closely | Partially (route shape diverges) |
| Replace vs. patch ambiguity | Real, unresolved by precedent | Resolved (mirrors Create's full-array shape) | Resolved, plus optional per-row granularity |
| New module/boundary | No | Yes (small, Barcode-shaped) | Yes (small, Barcode-shaped + extra routes) |
| Risk to existing tested code | **Higher** (shared `update()` path) | Lower (isolated) | Lower (isolated) |
| Rollback cleanliness | Best | Good | Good |
| Implementation complexity | Medium-High | **Medium** | Medium-High |
| Future extensibility | Weak | **Strong** | Strong |

---

## 5. Recommendation

**Option 2 — a dedicated, flat Product Price endpoint, mirroring the already-shipped Barcode
module's pattern exactly** (own controller/service/repository, own permission namespace, own
`version` column on `ProductPrice` for independent Optimistic Lock, bulk-replace semantics matching
Create's existing `prices: [...]` array shape).

**Why, in order of weight:**

1. **It is not a new pattern for this codebase — it is a repeat of one the Architect already
   approved once** (Barcode, Decision BQ10). Reviewing this design costs the Architect less because
   its shape, trade-offs, and consequences are already known from a shipped, working precedent —
   rather than asking the Architect to evaluate a genuinely novel structure.
2. **It does not touch `Product.update()`**, the single method every other Product edit (name,
   category, type, status, all of Category/Brand/Unit's own dependency checks) already relies on.
   Option 1 requires converting that method from a flat `updateMany` to a `$transaction` — a change
   with blast radius across the entire, already-hardened Product write path, for a feature (price
   editing) that has nothing to do with the rest of what that method protects.
3. **It avoids the false-conflict problem** (§3.1.3): under Option 1, a staff member fixing a price
   typo and another staff member fixing a name typo, seconds apart, would spuriously conflict with
   each other even though they touched disjoint data. This is a real, likely-frequent-in-practice
   UX defect specific to reusing `Product.version` for unrelated concerns.
4. **It resolves the replace-vs-patch ambiguity for free**, by construction, rather than requiring
   a fourth sub-decision — bulk-replace matches the shape the client already sends at Create time,
   so there is exactly one price-array shape a frontend developer ever needs to reason about.

**Why not Option 3**, despite being structurally almost identical to Option 2: nesting under
`/products/:id/prices` diverges from the Barcode precedent's own deliberate choice of a flat route
(`/barcodes`, not `/products/:id/barcodes`) for no evidenced reason — nothing in this project's
current Product Edit UX (Category/Brand/Unit are all whole-entity-PATCH forms, no precedent for
per-row-of-a-child-collection editing) demonstrates a need for Option 3's extra per-row-endpoint
expressiveness. If that need becomes concrete later (e.g., a genuine "edit just WHOLESALE, leave
RETAIL untouched" UX requirement), Option 2's bulk-replace endpoint can be extended with per-row
routes without breaking its existing contract — the door is not closed, just not opened
prematurely.

---

## 6. Rejected Alternatives

- **Option 1 (extend `PATCH /products/:id`)** — rejected primarily for touching the shared,
  already-hardened `update()` method and for the false-conflict risk on `Product.version`; see §5.
- **Option 3 (nested sub-resource)** — rejected only on route-shape grounds (diverges from the
  Barcode precedent without evidenced need), not on any structural/architectural defect; every
  other analysis point is identical to Option 2. If the Architect prefers explicit REST nesting for
  stylistic/consistency reasons orthogonal to this RFC's own reasoning, Option 3 is a safe fallback
  with no analysis gap.
- **Reviving `PriceHistory` as-is** (§2.2) — rejected as a starting point for the audit/history
  question: its `priceType` enum (`COST`/`SELLING`) does not match `ProductPrice.type`
  (`RETAIL`/`WHOLESALE`/`VIP`/`DEALER`); using it would require either widening that enum
  (semantically muddying two different concepts) or migrating it to reference `ProductPriceType`
  instead (a real schema change this RFC is not authorized to make). If the Architect wants
  granular per-price-type history as part of whichever option is approved, that should be a
  separate, explicit decision — not something silently inherited from unused legacy schema.

---

## 7. Open Question for the Architect (not resolved by this RFC)

Whether `ProductPrice`'s new `version` column (if Option 2 is approved) should be:
- **(a) one version per `ProductPrice` row** (each of the up-to-4 tiers independently
  optimistic-locked), or
- **(b) one version shared across the whole price set for a given product** (a single
  "price-set version" token, incremented on any tier's change, checked once per bulk-replace call).

Barcode's own precedent doesn't disambiguate this directly — each `Barcode` row is independently
addressable (`PATCH /barcodes/:id`) with its own `version`, which maps most directly to (a). But
Option 2's recommended bulk-replace semantics (§5, point 4) sends the whole price array in one call,
which maps more naturally to (b) — a single version guarding the one array-shaped write, exactly
like `Product.version` guards Product's own scalar `PATCH`. This RFC recommends (b) for consistency
with its own recommended bulk-replace design, but flags it as a distinct decision point rather than
folding it silently into the endpoint-shape recommendation above.

---

## 8. Migration Impact

If Option 2 is approved:
- `ProductPrice` gains one new column: `version Int @default(1)` (mirrors `Product.version`'s own
  `DEFAULT 1` convention, per SPEC-PRODUCT-001 §1.1/Decision A02 — not `DEFAULT 0`).
- No column removal, no rename, no data backfill beyond the new column's own default.
- No change to `@@unique([productId, type])` or any existing constraint.
- No change to any of the 4 downstream transaction-line tables (§2.6) — they don't reference
  `ProductPrice` at all.
- Rollback: a single `ALTER TABLE product_prices DROP COLUMN version` — no data-loss risk, since no
  other column or table depends on it.

If Option 1 or 3 is approved instead, migration impact is smaller at the schema level (Option 1:
zero new columns, no `version` needed) or comparable (Option 3: same `version` addition as Option
2) — this is not itself a discriminator, already reflected in §4's comparison table.

---

## 9. Implementation Inventory (if Option 2 is approved — not authorized by this RFC)

New:
- `backend/src/modules/product-price/` — new module (`product-price.module.ts`), mirroring
  `barcode`'s folder shape: `domain/entities/product-price.entity.ts`,
  `domain/repositories/product-price.repository.interface.ts`,
  `application/product-price.service.ts`, `application/dto/update-product-price.dto.ts`,
  `application/dto/product-price-response.dto.ts`,
  `infrastructure/persistence/prisma-product-price.repository.ts`,
  `presentation/product-price.controller.ts`.
- One Prisma migration (§8).
- `permission-catalog.ts` — new `crud('product-price', 'giá sản phẩm')` entry (exact permission
  names/verbs to be confirmed at implementation time, not by this RFC).
- New unit tests (service/repository/controller) + new e2e coverage (`test/product-price.e2e-spec.ts`
  or an addition to `test/product.e2e-spec.ts`), following this session's own established pattern
  (T043.05 added real e2e coverage for previously-untested paths, not just mocked units).
- `docs/api/openapi.json` regeneration (`npm run export:openapi`) + Orval client regeneration.

Unchanged (explicitly, to be verified at implementation time — not claimed as already true):
- `ProductController`/`ProductService`/`PrismaProductRepository` — no modification expected.
- `ProductResponseDto.prices` — read shape stays as-is (still returns the current price array on
  `GET`/Create response); only the write path is new.

---

## 10. Implementation Risks (if Option 2 is approved)

- **Bulk-replace semantics must still honor `assertHasRetailPrice()`-equivalent invariant** — the
  new `ProductPriceService` must reject a replace call that would leave zero `RETAIL`-type rows,
  mirroring `product.service.ts`'s existing `assertHasRetailPrice()` (§2.3). This is a new call
  site for an existing rule, not a new rule — but must not be forgotten, since nothing in the schema
  itself enforces "at least one RETAIL row" (it's an application-layer invariant only).
- **Audit trail granularity decision deferred** (§3.2.6) — needs its own small decision (one
  `product-price.update` audit entry per bulk-replace call vs. one per changed tier) at
  implementation time.
- **`organizationId` scoping via relation filter** (§3.2.7) — every repository method must filter
  through `product: { organizationId }` consistently; a missed filter on any one method would be a
  real multi-tenant leak, same class of risk as any other module's repository layer.
- **Frontend impact is currently zero** — Product Edit UI does not exist yet (T043 frontend is
  paused pending this RFC, per AD-3's own execution order) — so there is no existing frontend
  regression risk, only new-feature build cost once T043 frontend implementation resumes.

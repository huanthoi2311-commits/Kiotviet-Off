# SPEC-T043.07 — Product Price Contract Implementation

**Status:** IMPLEMENTATION SPEC — converts the APPROVED `RFC-T043.06` (Option 2, set-level
versioning) into exact technical decisions. Per Architect Decision T043.06 §6: "If the approved RFC
already resolves all of those unambiguously, continue automatically." None of the decisions below
required escalation — each is a direct, single-answer consequence of the already-approved RFC and
Architect Decision; reasoning is documented for each so the Architect can audit the derivation.

**Prerequisite:** RFC-T043.06 APPROVED (Option 2, set-level versioning, bulk-replace semantics).

---

## 1. Route(s)

```
GET   /api/v1/products/:id/prices
PATCH /api/v1/products/:id/prices
```

**Derivation, not a new fork**: the Architect approved a *dedicated* boundary (own controller/
service/repository) but also rejected Option 3's per-row nested CRUD only on route-shape grounds,
not on nesting itself. Since the approved model is a **singleton** (one logical "price set" per
product, not a collection of independently-addressable rows), nesting under the parent's own path
is the correct RESTful shape for a singleton sub-resource — this is a *different* shape from
Option 3's rejected `/products/:id/prices/:priceId` per-row CRUD, which this spec does not
implement. Realized as a **second, separate NestJS controller** (`ProductPriceController`) also
declared `@Controller('products')`, not as new methods on the existing `ProductController` — NestJS
permits multiple controllers to share a base path as long as full route paths don't collide (they
don't: `ProductController` has no `:id/prices` route). This satisfies "dedicated application/service
boundary" (Decision §5) while keeping the URL shape a natural singleton-under-parent.

HTTP verb: **`PATCH`**, not `PUT`, for the replace operation — despite being a full-set replace, `PATCH` is
this project's uniform convention for every existing update endpoint (Category/Brand/Unit/Product/
Barcode all use `@Patch`, `PUT` appears nowhere in the codebase). Inventing a new verb precedent for
one endpoint was rejected in favor of consistency; "bulk-replace" describes the *semantics*, not a
requirement to use REST's idiomatic `PUT`.

## 2. DTOs

```ts
// application/dto/replace-product-price-set.dto.ts
export class ReplaceProductPriceItemDto {
  @IsEnum(PRODUCT_PRICE_TYPES) type: ProductPriceType;
  @IsNumber() @Min(0) price: number;
}

export class ReplaceProductPriceSetDto {
  @IsInt() priceVersion: number;               // Optimistic Lock — required, no default
  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReplaceProductPriceItemDto)
  prices: ReplaceProductPriceItemDto[];
}
```

`ReplaceProductPriceItemDto` mirrors `CreateProductPriceDto` (`create-product.dto.ts:45-54`)
field-for-field on purpose — the RFC's own recommendation (§5, point 4) was to match Create's
existing array shape exactly, so a frontend developer reasons about one price-array shape, not two.

## 3. Response shape

```ts
// application/dto/product-price-response.dto.ts
export class ProductPriceSetResponseDto {
  @ApiProperty() productId: string;
  @ApiProperty({ description: 'Optimistic Lock cho toàn bộ price set (T043.07, tách khỏi Product.version)' })
  priceVersion: number;
  @ApiProperty({ type: [ProductPriceResponseDto] }) prices: ProductPriceResponseDto[];
}
```

Reuses the **existing** `ProductPriceResponseDto` (`product-response.dto.ts:3-7`, `{id, type,
price}`) for each array item — no new per-item DTO needed, since its shape is already exactly what's
needed and is already the shape returned by `GET /products/:id`'s own `prices` array.

## 4. Version representation

**`Product.priceVersion Int @default(1)`** — a new column on the **existing** `products` table,
**separate from** the existing `Product.version` column. Not stored on `ProductPrice` (rejected —
see reasoning below), not a new table.

**Why a new `Product` column, not a `ProductPrice` column**: the Architect's decision is explicit
that this must be *one* version for the *complete* set, not one per row (Decision §2). Storing it on
`ProductPrice` would require every row belonging to one product to carry the *same* replicated value
in lockstep — workable, but the compare-and-swap primitive for "replace the whole set" would then
need to condition on a value replicated across N rows rather than a single row, which is more
complex to reason about and more failure-prone (e.g. what does a partial replicated-value mismatch
even mean during a race) for zero benefit over a single counter. Storing it as one column directly
on `Product` is simpler, matches how `Product.version` itself already works (a single integer
counter on the row being protected), and requires no new table.

**Why this does not violate "independent concurrency boundaries" (Decision §1/§2)**: the two
counters (`version`, `priceVersion`) are columns on the same physical row but are **never** written
by the same code path — `ProductService.update()` (existing, unmodified) only ever touches `version`;
the new `ProductPriceRepository` (this package) only ever touches `priceVersion`. Neither write path
reads or conditions on the other's counter. This is a physical co-location for storage simplicity,
not a logical coupling — the same pattern already exists elsewhere in this schema (e.g. `Product`
itself already carries multiple independent-purpose columns like `isActive` and `status`, written by
different guards, without that being read as a boundary violation).

**Why this does not violate "no direct ProductRepository mutation from unrelated modules"
(Decision §5)**: that rule (ADR-0010, already established this session) governs the DI-level
Repository Boundary — other modules must not inject `PRODUCT_REPOSITORY`/`IProductRepository`
directly. It says nothing about which physical table a *new* module's *own* repository may use via
its own `PrismaService` access for a column that `IProductRepository` itself never reads or writes.
`IProductRepository`, `ProductService`, and `ProductMapper` are **not modified** by this package (see
§6) — they remain permanently unaware `priceVersion` exists, so there is no "reach into
`ProductRepository`" happening; `ProductPriceRepository` reaches into the `products` **table**
directly via Prisma, exactly as `ProductPriceRepository` already needs to for reading `productId`/
`organizationId` existence via `ProductDomainService` (see §7) — a table, not the other module's
repository abstraction, is what's shared, and only for a column this new module exclusively owns.

## 5. Permission codes

**Reuse existing `product:view` (GET) and `product:update` (PATCH).** No new permission codes.

**Reasoning**: Decision §5 says "dedicated permission boundary **if required by the approved RFC**"
— conditional, not mandatory. Barcode's own full `barcode:view/create/update/delete/restore` set
exists because Barcode has a genuine independent CRUD *lifecycle* (a barcode can be created, restored,
soft-deleted, set-default — 5 real distinct operations). `ProductPrice` under this design has exactly
2 operations (read the set, replace the set) with no independent create/delete/restore of a price
row as its own lifecycle event — a price row's existence is entirely a consequence of what's in the
replaced set. Minting `product-price:create`/`product-price:delete`/`product-price:restore`
permission codes with no operation to ever check them against would be exactly the kind of
"phòng khi cần sau" (add now in case it's needed later) premature abstraction `CODING_RULES.md §6`
already forbids, cited repeatedly this session (T041/T042 YAGNI precedent). Reusing `product:view`/
`product:update` is also semantically accurate: price is Product's own data, split into a separate
write path for concurrency reasons only, not a separable business capability someone might have
permission to manage independently of the product itself.

## 6. Error codes

New (2, genuinely new conditions):

```ts
PRODUCT_PRICE_VERSION_CONFLICT: 'PRODUCT_PRICE_001',   // priceVersion mismatch, HTTP 409
PRODUCT_PRICE_DUPLICATE_TYPE: 'PRODUCT_PRICE_002',     // >1 entry with the same `type` in one request, HTTP 422
```

Fresh `PRODUCT_PRICE_xxx` prefix (not continuing `PRODUCT_0xx`), matching the existing convention
that each module/sub-boundary owns its own numbering (`BARCODE_xxx` starts fresh at 001 despite
being Product-adjacent too).

Reused (2, identical underlying condition to an existing code — not duplicated):
- **`PRODUCT_NOT_FOUND`** (`PRODUCT_001`) — product doesn't exist / wrong organization. Same
  condition `ProductService.findOne()` already reports; no reason for a second code meaning the
  same thing.
- **`PRODUCT_MISSING_RETAIL_PRICE`** (`PRODUCT_007`) — the replaced set would leave zero `RETAIL`
  rows. Identical business rule to `assertHasRetailPrice()` (`product.service.ts`), just enforced at
  a different call site (replace, not just create) — same user-facing meaning, same code.

## 7. Prisma changes

```sql
-- prisma/migrations/20260808000000_product_price_version/migration.sql
ALTER TABLE "products" ADD COLUMN "priceVersion" INTEGER NOT NULL DEFAULT 1;
```

```prisma
// schema.prisma, model Product — one line added, adjacent to the existing `version` field
version      Int      @default(1)
priceVersion Int      @default(1)   // T043.07 — Optimistic Lock riêng cho price set, tách khỏi version
```

No change to `ProductPrice`, no new table, no constraint change, no data backfill beyond the new
column's own `DEFAULT 1` (matches `Product.version`'s own `DEFAULT 1` convention, SPEC-PRODUCT-001
Decision A02 — not `DEFAULT 0`).

## 8. Repository methods

New `IProductPriceRepository` (own module, own DI token):

```ts
export interface ProductPriceItemInput { type: ProductPriceType; price: number; }

export interface IProductPriceRepository {
  /** Đọc set hiện tại (priceVersion + toàn bộ prices) — không lọc theo organizationId ở đây, việc
   *  tồn tại/thuộc org của Product đã được xác nhận qua ProductDomainService (§9) ở tầng Service. */
  findSetByProductId(productId: string): Promise<{
    priceVersion: number;
    prices: ProductPriceEntity[];
  } | null>;   // null nếu Product không tồn tại (id sai) — kiểm tra org vẫn nằm ở Service

  /** Compare-and-swap trên `Product.priceVersion`, rồi thay toàn bộ ProductPrice trong CÙNG 1
   *  transaction (delete hết + createMany lại — an toàn vì không FK nào khác trỏ tới ProductPrice,
   *  §RFC 2.6). Ném ProductPriceConcurrencyConflictError nếu priceVersion không khớp. */
  replaceSet(
    productId: string,
    expectedPriceVersion: number,
    prices: ProductPriceItemInput[],
    updatedBy: string,
  ): Promise<{ priceVersion: number; prices: ProductPriceEntity[] }>;
}

export const PRODUCT_PRICE_REPOSITORY = Symbol('PRODUCT_PRICE_REPOSITORY');
```

`PrismaProductPriceRepository.replaceSet()` implementation shape:

```ts
async replaceSet(productId, expectedPriceVersion, prices, updatedBy) {
  return this.prisma.$transaction(async (tx) => {
    const cas = await tx.product.updateMany({
      where: { id: productId, priceVersion: expectedPriceVersion },
      data: { priceVersion: { increment: 1 } },
    });
    if (cas.count === 0) throw new ProductPriceConcurrencyConflictError(productId);

    await tx.productPrice.deleteMany({ where: { productId } });
    await tx.productPrice.createMany({
      data: prices.map((p) => ({ productId, type: p.type, price: p.price, createdBy: updatedBy, updatedBy })),
    });

    const updated = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { priceVersion: true, prices: { where: { deletedAt: null } } },
    });
    return { priceVersion: updated.priceVersion, prices: updated.prices.map(toProductPriceEntity) };
  });
}
```

Mirrors `PrismaProductRepository.update()`'s own `updateMany`-then-verify-`count`
compare-and-swap idiom (`prisma-product.repository.ts:133-162`) exactly, extended with the
delete+recreate inside the **same** `$transaction` — this is the one piece the existing `update()`
does not need (it never touches relations), consistent with §RFC-T043.06 §2.4's own finding that
nested writes don't compose with `updateMany` and must be made explicit via `$transaction` for any
option that needs both.

Hard delete (not soft-delete) for the replaced-away rows: confirmed via RFC §2.6 that **no** other
table has any FK to `ProductPrice`, and no code anywhere reads `ProductPrice.deletedAt` — soft-delete
semantics were never actually wired up for this table, so introducing them now for this one write
path would be inventing unused behavior. Hard delete inside the transaction is simpler and equally
safe.

## 9. Transaction boundary

**One Prisma `$transaction`, wrapping exactly**: the `Product.priceVersion` compare-and-swap +
`ProductPrice` delete-all-for-product + `ProductPrice` recreate-all. All three succeed or all three
roll back — satisfies "all-or-nothing," "no partial row update," "no half-replaced price set"
(Decision §3) directly via Postgres's own transaction guarantee, no additional application-level
compensation logic needed.

**Explicitly outside this transaction** (by design, not oversight): the prior product-existence/
organization check (`ProductDomainService.findById()`, a plain read, §10) and the two validation
checks (duplicate `type`, retail-price-preserved, §11) — both happen in `ProductPriceService`
*before* the transaction opens, so an invalid request never begins a database transaction at all.

## 10. Organization / product ownership verification

`ProductPriceService` injects `ProductDomainService` (the existing, already-exported read-only
cross-module accessor — SPEC-PRODUCT-001 §8, `product.module.ts` already exports it, **no change
needed there**) and calls `productDomainService.findById(productId, organizationId)` first — `null`
→ `PRODUCT_NOT_FOUND` (404), exactly mirroring how `barcode.service.ts` already does this for the
same reason (SPEC-PRODUCT-001 §7.3 table: `barcode` → `productDomainService.findById()`). This is
the established Repository-Boundary-compliant pattern, applied identically, not a new one.

## 11. Domain validation (service layer, before the transaction)

- **`assertNoDuplicatePriceTypes(prices)`** — new, genuinely new check: reject if any two entries in
  the request array share the same `type` → `PRODUCT_PRICE_DUPLICATE_TYPE` (422).
- **`assertHasRetailPrice(prices)`** — reused from `product.service.ts`'s existing private method
  (moved to a small shared location, e.g. a `product-price.validation.ts` helper importable by both
  services, OR duplicated verbatim as a private method — final choice left to implementation, not
  architecturally significant either way since it's a 5-line pure function) → `PRODUCT_MISSING_RETAIL_PRICE`
  (422) if the replacement set has zero `RETAIL` rows.

## 12. OpenAPI impact

Two new operations under the existing `/api/v1/products/{id}/prices` path, tagged `Product Price`
(distinct Swagger group from `Product`'s own `Product` tag, despite sharing the URL prefix) — additive
only, zero existing operation's request/response shape changes. `docs/api/openapi.json` regenerated
via the existing `npm run export:openapi` + CI drift-check mechanism (`.github/workflows/backend-ci.yml`
`e2e` job) — no change to that mechanism itself.

## 13. Orval / generated client impact

Two new hooks generated from the new controller, e.g. `useProductPriceControllerFindSet` /
`useProductPriceControllerReplaceSet` (exact names determined by Orval from the controller's own
method names at generation time, confirmed post-generation, not hand-specified here). Zero change to
any existing `useProductController*` hook's shape.

## 14. Tests

**Unit — `product-price.service.spec.ts`** (mocked `IProductPriceRepository` + mocked
`ProductDomainService`): successful replace; version-conflict → `ConflictException`/
`PRODUCT_PRICE_VERSION_CONFLICT`; duplicate type → `UnprocessableEntityException`/
`PRODUCT_PRICE_DUPLICATE_TYPE`; zero-RETAIL replacement → `UnprocessableEntityException`/
`PRODUCT_MISSING_RETAIL_PRICE`; product not found/wrong org → `NotFoundException`/`PRODUCT_NOT_FOUND`.

**Unit — `prisma-product-price.repository.spec.ts`** (mocked `PrismaService`, `$transaction`
callback-style mock matching the existing project pattern): confirms the compare-and-swap +
delete + createMany sequence happens inside one `$transaction` call; confirms
`ProductPriceConcurrencyConflictError` thrown on `count === 0`.

**E2E — new `describe` block in `test/product.e2e-spec.ts`** (or a new
`test/product-price.e2e-spec.ts`, final choice at implementation time), against real Postgres:
1. `GET .../prices` returns the set created at Product creation, `priceVersion: 1`.
2. `PATCH .../prices` with correct `priceVersion` succeeds, returns `priceVersion: 2`, new prices
   persisted.
3. `PATCH .../prices` with stale `priceVersion` → `409` / `PRODUCT_PRICE_VERSION_CONFLICT`.
4. `PATCH .../prices` with two `RETAIL` entries → `422` / `PRODUCT_PRICE_DUPLICATE_TYPE`.
5. `PATCH .../prices` replacing away the only `RETAIL` entry → `422` /
   `PRODUCT_MISSING_RETAIL_PRICE`.
6. **The single most important regression assertion this design exists to guarantee**: after a
   successful price replace, re-`GET /products/:id` and confirm `Product.version` (core) is
   **unchanged** from before the price edit — proves the two concurrency boundaries are genuinely
   independent, not just independently named.
7. Confirm the existing `POST /products` (Create, with `prices: [...]`) test in
   `product.e2e-spec.ts` still passes unmodified — backward compatibility.

## 15. Rollback

**Code**: delete the new `product-price` module folder and its `app.module.ts` import line — zero
other file requires modification to remove it (see §16), so this is a clean, complete revert.
**Schema**: `ALTER TABLE "products" DROP COLUMN "priceVersion"` — no other column/table/FK
depends on it, no data-loss risk to anything else.

## 16. Implementation inventory

New:
- `backend/src/modules/product-price/` — `product-price.module.ts`,
  `domain/entities/product-price.entity.ts` (reuses `ProductPriceEntity`/`ProductPriceType` from
  the `product` module — imported, not redefined, same pattern `barcode.entity.ts` already uses for
  `BarcodeType`), `domain/repositories/product-price.repository.interface.ts`,
  `domain/errors/product-price.errors.ts` (`ProductPriceConcurrencyConflictError`),
  `application/product-price.service.ts`,
  `application/dto/replace-product-price-set.dto.ts`,
  `application/dto/product-price-response.dto.ts`,
  `infrastructure/persistence/prisma-product-price.repository.ts`,
  `presentation/product-price.controller.ts`.
- One Prisma migration (§7).
- Unit + e2e tests (§14).

Modified:
- `backend/prisma/schema.prisma` — one new `Product.priceVersion` field.
- `backend/src/app.module.ts` — import `ProductPriceModule`.
- `docs/api/openapi.json` — regenerated (additive diff only).

**Explicitly NOT modified** (verified as a design constraint, not just an expectation):
`product.controller.ts`, `product.service.ts`, `product.repository.interface.ts`,
`prisma-product.repository.ts`, `product.mapper.ts`, `product-response.dto.ts`,
`create-product.dto.ts`, `update-product.dto.ts`, `product.module.ts` (already exports
`ProductDomainService`, nothing to add), `permission-catalog.ts` (no new codes, §5).

## 17. Verification checklist (traced to Architect Decision §7/§8)

- [ ] Price-set read (`GET`)
- [ ] Atomic price-set update (`PATCH`, success case)
- [ ] Stale-version conflict (409, `PRODUCT_PRICE_VERSION_CONFLICT`)
- [ ] Valid current-version update succeeds
- [ ] `Product.version` (core) does not change after a price-only edit
- [ ] `Product.priceVersion` increments exactly once per successful replace
- [ ] Invalid Product/org access rejected (404, `PRODUCT_NOT_FOUND`)
- [ ] Duplicate price types rejected (422, `PRODUCT_PRICE_DUPLICATE_TYPE`)
- [ ] Missing-RETAIL rejected (422, `PRODUCT_MISSING_RETAIL_PRICE`)
- [ ] Transaction rollback on any failure (proven by the conflict/duplicate/missing-retail tests
      never leaving a half-replaced set — verified by re-`GET` after each rejected attempt)
- [ ] Multi-tenant scoping preserved (org check via `ProductDomainService`, §10)
- [ ] Product Create remains backward-compatible (existing `POST /products` e2e test unmodified,
      still passing)
- [ ] Existing Purchase/Sales/POS behavior does not regress (no code in any of those modules
      touched; their own existing e2e suites run unmodified in CI)
- [ ] lint / typecheck / build / `prisma validate` / full unit suite / e2e / OpenAPI drift / Orval
      regeneration / frontend typecheck against regenerated client (frontend has no Product code
      yet, per T043's own paused-frontend state — "typecheck against regenerated client" reduces to
      "the regenerated client itself compiles cleanly," since nothing consumes it yet)

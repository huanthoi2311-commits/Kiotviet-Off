# T034-SHARED-CRUD-FOUNDATION-REPORT

**Package:** T034.01–T034.06 — Shared CRUD Foundation (frontend layout + reusable CRUD primitives)
**Authority:** T034.01 (Discovery & Plan) → T034.02 (Implementation) → T034.03 (Independent Verification) → T034.03A (Corrective Fixes) → T034.04/T034.05 (Publication & CI Verification) → T034.06 (Merge & Release)
**PR:** [#15](https://github.com/huanthoi2311-commits/Kiotviet-Off/pull/15), squash-merged into `main` at `aef66a1026c6ec83e5ad558b2e457a12f1a86959`
**Date:** 2026-08-07

## 1. Executive Summary

T034 builds the shared frontend primitives every future business-module screen (Category, Brand, Unit, and beyond) will be built from: a sidebar/layout shell and a set of composable CRUD components (`DataTable`, `SearchToolbar`, `PermissionButton`, `ConfirmDialog`, `EmptyState`, `CrudForm` + `useCrudForm`). No business module was implemented in this package — that remains explicitly out of scope for the next package.

Three independent verification passes (T034.03, T034.03A's own fixes, and the T034.04–T034.06 publication/merge chain) each found and fixed a real defect that would not have surfaced from static review alone:
1. `SidebarMenuButton` nav items used Radix's `asChild` pattern, which this project's Base UI–based shadcn variant doesn't support — it silently rendered a `<button>` wrapping an `<a>`, an axe "nested interactive controls" violation, caught only once the new accessibility tests actually ran.
2. `@tanstack/react-table` was initially installed at its newly-published `^9.0.0` (a ground-up API rewrite), which compiled but broke `DataTable` at runtime (`getCoreRowModel is not a function`) — caught only by running the test suite, not by `tsc`. Repinned to the stable `^8.21.3` line matching the coded API.
3. `useCrudForm` originally constrained its Zod schema to `z.ZodType<TSchema, TSchema>` (Input === Output), silently rejecting any real-world schema using `z.coerce.*`, `.transform()`, or `.preprocess()` — caught by T034.03's independent verification, not by the implementer's own testing, and fixed in T034.03A by adopting Zod's and RHF's own Input/Output generic model.

T034.03 also caught a factual gap between what T034.02's own report claimed and what the code actually did: 2 of 11 new component/page test files (`permission-button.test.tsx`, `dashboard-shell.test.tsx`) had no accessibility assertion despite the report claiming full coverage. Both were fixed in T034.03A.

## 2. Delivered Scope

**Layout:** `components/layout/nav-items.ts`, `app-sidebar.tsx` (`AppSidebarProvider`/`AppSidebar`, wired to the pre-existing `ui-store`'s `isSidebarCollapsed` rather than the shadcn primitive's own internal/cookie state).
**Common/CRUD primitives:** `components/common/breadcrumbs.tsx`, `page-header.tsx`, `empty-state.tsx`, `permission-button.tsx`, `search-toolbar.tsx` (300ms-debounced), `crud-form.tsx` + `hooks/use-crud-form.ts`, `confirm-dialog.tsx`.
**Table:** `components/ui/data-table.tsx` — `@tanstack/react-table` (v8) used for column/sort/pagination *state* only (`manualPagination`/`manualSorting: true`, server stays authoritative); all rendering is plain shadcn `table.tsx` JSX via `flexRender`.
**shadcn-registry additions:** `dialog.tsx`, `select.tsx`, `sidebar.tsx` (+ its own dependencies `separator.tsx`, `tooltip.tsx`, `sheet.tsx`, `hooks/use-mobile.ts`), `table.tsx`.
**Integration point:** `layouts/dashboard-shell.tsx` — only its final authenticated-render branch changed (`<div>` → `<AppSidebarProvider>`); every session-restore/error/logout gate above it is byte-identical to before, verified by diff, not assumption.
**Test infra:** `src/test/vitest-axe.d.ts` re-declares `vitest-axe`'s matcher types against `declare module 'vitest'` (the package's own shipped types still target vitest's pre-v3 `Vi` namespace); `vitest.setup.ts` registers the axe matchers and a `window.matchMedia` jsdom stub (needed by the sidebar's mobile-breakpoint hook).

## 3. Design Contract

- **No `query-keys.ts`, no generic API repository, no config-driven CRUD generator** — confirmed absent by direct search of the merged tree. Every primitive is data-source-agnostic (`DataTable` takes plain `data`/`isLoading`/`error` props); consuming Orval's generated `getXXXQueryKey()`/`QueryOptions()` directly is the intended path for the next package, though — since no business module exists yet — nothing in this diff actually calls them. This is a verified *design property*, not a demonstrated integration; flagged explicitly during T034.03 so the next package's implementer isn't misled into thinking it's already wired up.
- Create/Edit remain full pages, not dialogs (per T033.02) — `ConfirmDialog` is scoped to archive/restore/delete-style confirmations only.
- The backend's validation-error envelope is a flat `errors: string[]` with no per-field association (confirmed by reading `http-exception.filter.ts`, correcting an earlier, unverified assumption in T033.02 that field-level mapping was possible). `useCrudForm.setServerError` sets a single root-level error; a module's own form may still do its own `setError(fieldName, ...)` if it recognizes a specific `error.code`.
- `useCrudForm<TFieldValues, TOutput = TFieldValues>` now follows Zod's and React Hook Form's own Input/Output generic split (`schema: z.ZodType<TOutput, TFieldValues>`, `useForm<TFieldValues, unknown, TOutput>`), so schemas using `z.coerce.*`/`.transform()`/`.preprocess()` are supported without weakening type safety — verified with dedicated tests for all three.

## 4. Real Defects Found and Fixed (via independent verification and actually running the suite, not static review)

1. **Nested-interactive a11y violation (T034.03, Risk Audit item)** — `SidebarMenuButton` nav items used `asChild` (a Radix-only pattern); this shadcn variant is built on Base UI and only supports the `render` prop. Fixed to `render={<Link ...>}`.
2. **`@tanstack/react-table` v9 runtime break (T034.03, Testing item)** — `npm install @tanstack/react-table` resolved the newly-published `^9.0.0` (a rewritten API — `getCoreRowModel` no longer exists), which typechecked fine but threw `TypeError: getCoreRowModel is not a function` the moment `DataTable` actually rendered in a test. Repinned to `^8.21.3`.
3. **`useCrudForm`'s Input/Output constraint (T034.03 Risk Audit → T034.03A Fix #2)** — `z.ZodType<TSchema, TSchema>` silently rejected any transforming/coercing schema. Generalized to the correct two-generic model; the earlier `as Resolver<TSchema>` type-safety workaround was removed rather than papered over, since the corrected generics made it unnecessary.
4. **Missing accessibility coverage (T034.03 → T034.03A Fix #1)** — `permission-button.test.tsx` and `dashboard-shell.test.tsx` rendered real DOM but had no `vitest-axe` assertion, contradicting T034.02's own report. Both fixed.
5. **Pre-existing generic-inference bug in `use-crud-form.ts` (T034.02 self-caught during its own build, before T034.03)** — `zodResolver`/`useForm` generic mismatch, first surfaced only when `tsc --noEmit` was actually run (never previously typechecked). Fixed alongside item 3 above.

## 5. Testing and CI Evidence

- `npx vitest run`: **22 test files, 93 tests, all passing** (10 of which are dedicated `vitest-axe` accessibility assertions) — independently re-run on the actual merged tree (`origin/main` @ `aef66a1`), not reused from pre-merge state.
- `npm run lint`, `npm run typecheck`, `npm run build`: all clean on the merged tree.
- `npx madge --circular --extensions ts,tsx src`: no circular dependencies.
- CI on the squash commit (`aef66a1`): all 10 check-runs green — both required aggregators (`Backend`, `Frontend`) `success`; the two backend-only jobs correctly `skipped` (no backend files in this diff).
- Content-diff (`git diff <squash-sha> <reviewed-branch-tip>`): **empty** — the merged tree is byte-identical to what was reviewed in PR #15.

## 6. Rollback

`git revert --no-commit aef66a1` applies cleanly against `main` — zero conflicts, all 36 files correctly reverted (5 modifications restored, 31 additions removed). Verified directly against the real merge commit, not simulated. No other module depends on anything this package introduces — `NAV_SECTIONS` currently holds only a `Dashboard` entry by design; Category/Brand/Unit's own future package adds its entries there, not this one.

## 7. Known Limitations / Risks Carried Forward

- **Orval integration is a design property, not a demonstrated one** (see §3) — the next package should not assume it's already been exercised end-to-end.
- **`z.ZodType<TOutput, TFieldValues>`** requires the next package's real Category/Brand/Unit schemas to be written with this Input/Output split in mind; verified generically here (transform/coerce/preprocess), not against any real business schema yet.
- `recovery/legacy-working-tree-20260806`, previously recorded as an untouched risk item sitting on `origin`, was found during T034.05's repository-state check to **no longer exist on origin** (`404` via the branches API) — unrelated to T034's own work, noted here so it isn't re-flagged as still-outstanding in future packages. The associated `legacy/*` annotated tags remain present.
- The pre-existing, unrelated Draft PR #5 (`T031 Frontend Foundation — Discovery Evidence`) remains open — not part of this package, not touched by it.

## 8. Readiness Verdict

**The Shared CRUD Foundation is fully released to `main` and independently re-verified** — merged tree confirmed byte-identical to the reviewed branch, CI green on the merge commit itself, full local lint/typecheck/test/build suite re-run clean against the actual merged code (not the pre-merge branch), no circular dependencies, rollback confirmed safe. `feature/T034-shared-crud-foundation` has been deleted both locally and on `origin`. Ready for the Architect to authorize the next package — Category, Brand, or Unit implementation is explicitly **not** authorized by this report and must wait for its own separate authorization.

---

RELEASE REPORT — T034.06

STOP.

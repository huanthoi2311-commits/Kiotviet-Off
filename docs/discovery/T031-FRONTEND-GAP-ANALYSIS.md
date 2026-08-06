# T031.01A — Frontend Gap Analysis

**Status:** Read-only evidence report. No RFC, no SPEC, no decisions, no code, no dependency changes.
**Authority:** Architect Review of T031.01 Discovery.
**Baseline commit surveyed:** `main` @ `baaaa683e15866ce6343eab3e7368b02f28a8b05`.

Every "Suggested direction" below is a possibility to weigh, not a recommendation to implement — per the authorization, no decisions are made here.

---

## Part 1 — Per-area review

### 1.1 `frontend/` (overall)

1. **Current implementation:** A partially-scaffolded Next.js App Router project. 17 real source files total (excluding lockfile/node_modules/.next). Has a working dev server, dark-mode-capable landing page, and a fully wired dependency set that is almost entirely unused yet (§1.2).
2. **Missing pieces:** No auth, no routing beyond the single root page, no business UI, no `stores/`, `services/`, `hooks/`, `generated/`, `layouts/`, `middleware.ts`.
3. **Technical debt:** `README.md` is still the unedited `create-next-app` boilerplate — doesn't describe this project at all.
4. **Risk:** Low by itself — an accurate, honest starting point is not a risk. The risk is in what's built *on top* without the gaps below being closed first.
5. **Suggested direction:** n/a (overall summary; see per-area entries).

### 1.2 `package.json`

1. **Current implementation:** `next@15.5.20`, `react@19.1.0`/`react-dom@19.1.0`, `typescript@^5`, `@tanstack/react-query@^5.101.2`, `axios@^1.18.1`, `react-hook-form@^7.81.0` + `@hookform/resolvers@^5.4.0`, `zod@^4.4.3`, `zustand@^5.0.14`, `tailwindcss@^4`, shadcn/ui deps (`shadcn`, `class-variance-authority`, `tailwind-merge`, `tw-animate-css`, `@base-ui/react`, `lucide-react`), `next-themes@^0.4.6`. Scripts: `dev`, `build`, `start`, `lint` only.
2. **Missing pieces:** No `orval`, no `typecheck` script (CI calls `npx tsc --noEmit` directly instead — works, but no local-dev-friendly `npm run typecheck` shorthand), no `test` script, no `format`/`format:check` script (backend has one; frontend doesn't, despite `.prettierrc` existing), no `lint-staged`.
3. **Technical debt:** None yet — the file is small and consistent. Worth noting `shadcn` (the CLI) is listed as a runtime `dependencies` entry rather than `devDependencies` — harmless today, but a minor placement inconsistency (it's a CLI tool, not runtime code).
4. **Risk:** Low.
5. **Suggested direction:** n/a — evidence only.

### 1.3 `next.config.*`

1. **Current implementation:** `next.config.ts` — effectively empty (`{ /* config options here */ }`), default `create-next-app` output.
2. **Missing pieces:** No `images.domains`/`remotePatterns` (relevant once product images etc. are served from the backend or object storage), no custom headers, no rewrites/redirects, no `output` mode decision (`standalone` for Docker vs. default — relevant given §1.19 Deployment readiness has no frontend Dockerfile at all yet), no env-var validation at build time (backend has `env.validation.ts`; frontend has no equivalent).
3. **Technical debt:** None (nothing has been added incorrectly — it's simply untouched).
4. **Risk:** Low today; becomes relevant the moment deployment packaging starts.
5. **Suggested direction:** n/a — evidence only.

### 1.4 `tsconfig*`

1. **Current implementation:** `tsconfig.json` — `strict: true`, `moduleResolution: bundler`, path alias `@/*` → `./src/*`, `noEmit: true` (Next.js compiles separately), target `ES2017`, Next.js's own TS plugin included. `tsconfig.tsbuildinfo` present (incremental build cache, correctly gitignored).
2. **Missing pieces:** Only a single-level path alias exists (`@/*`). No deeper aliases (`@/features/*`, `@/stores/*`, etc.) — though these are arguably redundant given `@/*` already covers everything under `src/`.
3. **Technical debt:** None found.
4. **Risk:** Low.
5. **Suggested direction:** n/a — evidence only.

### 1.5 `eslint*`

1. **Current implementation:** `eslint.config.mjs` (flat config), extends `next/core-web-vitals`, `next/typescript`, `prettier` (to disable stylistic conflicts). Ignores `node_modules`, `.next`, `out`, `build`, `next-env.d.ts`.
2. **Missing pieces:** No custom rule overrides at all (backend's `eslint.config.mjs` has several explicit overrides, e.g. relaxed rules for `*.spec.ts`) — not necessarily wrong, just notably different in maturity from backend's config. No import-order/no-unused-vars customization beyond what `next/typescript` ships by default.
3. **Technical debt:** None found — config is minimal but internally consistent.
4. **Risk:** Low.
5. **Suggested direction:** n/a — evidence only.

### 1.6 `prettier*`

1. **Current implementation:** `.prettierrc` — `semi: true`, `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`, `prettier-plugin-tailwindcss` enabled (auto-sorts Tailwind classes). Matches backend's own prettier conventions closely (also single-quote, trailing-comma, semi) — consistent monorepo style.
2. **Missing pieces:** No `format`/`format:check` npm script (§1.2) to actually invoke it outside editor integration or the (currently absent) lint-staged hook.
3. **Technical debt:** None found.
4. **Risk:** Low.
5. **Suggested direction:** n/a — evidence only.

### 1.7 `tailwind*`

1. **Current implementation:** Tailwind v4 — **no `tailwind.config.js/ts` file** (correct for v4's CSS-first config model). Configuration lives in `src/app/globals.css` via `@import "tailwindcss"`, `@theme inline { ... }`, and a full shadcn CSS-variable palette (`--background`, `--primary`, `--sidebar-*`, `--chart-*`, radius scale, etc.) for both light (`:root`) and presumably dark (`.dark`) — only the light-mode block was inspected in full; dark-mode block presence wasn't separately re-verified line-by-line but `@custom-variant dark (&:is(.dark *))` confirms the mechanism is wired.
2. **Missing pieces:** No project-specific design tokens beyond shadcn's defaults (no brand color decided, still `oklch(...)` neutral grays) — expected at this stage, not a gap in the "missing implementation" sense.
3. **Technical debt:** None found.
4. **Risk:** Low.
5. **Suggested direction:** n/a — evidence only.

### 1.8 shadcn

1. **Current implementation:** `components.json` configured — style `base-nova` (shadcn's newer Base UI-backed style, not classic Radix), `rsc: true`, baseColor `neutral`, icon library `lucide`, aliases matching the `@/*` path setup. Exactly 2 primitives generated so far: `button.tsx`, `dropdown-menu.tsx` — both already exercised by `theme-toggle.tsx`.
2. **Missing pieces:** No Toast/Sonner primitive, no Dialog/Sheet/Drawer, no Form primitives (shadcn's form wrapper around React Hook Form), no Table, no Skeleton, no Card, no Input/Select/Checkbox — essentially everything needed for real screens.
3. **Technical debt:** None found — what exists is clean, unmodified shadcn output.
4. **Risk:** Low — shadcn primitives are added incrementally per-need by design (`npx shadcn add <component>`), not a batch upfront cost.
5. **Suggested direction:** n/a — evidence only.

### 1.9 `app/`

1. **Current implementation:** `layout.tsx` (root layout: Geist fonts, `<Providers>` wrapper, `lang="vi"`, `suppressHydrationWarning` for theme), `page.tsx` (single static landing page, replaced placeholder text), `globals.css`, `favicon.ico`. No nested routes, no route groups.
2. **Missing pieces:** No `(auth)` or `(dashboard)` route groups, no `login`/`dashboard`/business-module pages, no `not-found.tsx`, no `error.tsx`/`global-error.tsx` (Next.js App Router's own built-in error-boundary convention — relates to §1.16 below), no `loading.tsx` (Next.js's own built-in Suspense-boundary convention for route-level loading states).
3. **Technical debt:** None found in what exists.
4. **Risk:** Medium — `error.tsx`/`loading.tsx` are framework-level conventions with specific file-based semantics; if the eventual design instead builds a fully custom Error Boundary/Loading system without also considering these Next.js-native mechanisms, the two approaches could end up duplicating or conflicting.
5. **Suggested direction:** n/a — evidence only.

### 1.10 `providers/`

1. **Current implementation:** `index.tsx` (composes `ThemeProvider` → `QueryProvider`), `theme-provider.tsx` (thin wrapper over `next-themes`), `query-provider.tsx` (TanStack Query client: `staleTime: 30_000`, `refetchOnWindowFocus: false`, `retry: 1`).
2. **Missing pieces:** No Auth provider/context, no Toast provider, no Error Boundary provider.
3. **Technical debt:** None found.
4. **Risk:** Low.
5. **Suggested direction:** n/a — evidence only.

### 1.11 `hooks/`

1. **Current implementation:** Directory does not exist.
2. **Missing pieces:** Everything — `usePermission`, `useCurrentOrganization`, `useAutoRefresh`, or any custom hook.
3. **Technical debt:** n/a (nothing to accrue debt on).
4. **Risk:** n/a.
5. **Suggested direction:** n/a — evidence only.

### 1.12 `services/`

1. **Current implementation:** Directory does not exist. Closest analogue is `src/lib/api.ts` — a single Axios instance (`baseURL` from `NEXT_PUBLIC_API_URL`, `withCredentials: true`) with a response interceptor whose error branch is a pass-through stub (comment: normalization + refresh/401 handling explicitly deferred).
2. **Missing pieces:** No request interceptor (e.g., attaching the in-memory access token as a Bearer header — nothing currently does this at all, meaning `lib/api.ts` today sends **no Authorization header on any request**), no error normalization, no refresh-on-401 logic, no per-domain service wrappers.
3. **Technical debt:** `lib/api.ts`'s interceptor comment references "Prompt Authentication (011+)" — an old numbering scheme from before this project's "flat T009-T025" replan (per project history) — a small stale-comment debt, not a functional one.
4. **Risk:** High for the request-interceptor gap specifically — every backend endpoint except the public Auth ones requires `Authorization: Bearer <token>` (§1.13), and nothing today attaches it.
5. **Suggested direction:** n/a — evidence only.

### 1.13 `stores/`

1. **Current implementation:** Directory does not exist in the actual frontend tree. **However**, `tools/playwright/screenshot-dashboard.ts` (already committed, T030-era tooling) contains a direct source-code reference: *"session giữ trong Zustand in-memory, khôi phục qua cookie `/auth/refresh` — xem `frontend/src/stores/auth-store.ts`"* — i.e., a specific file path, `frontend/src/stores/auth-store.ts`, is already named in committed tooling as the intended location, even though that file does not exist yet.
2. **Missing pieces:** `auth-store.ts` itself, and any other store (`settings-store.ts`, `ui-store.ts` per the Discovery Report's proposal — those were proposals, not confirmed against any existing reference the way `auth-store.ts` now is).
3. **Technical debt:** None (nothing built yet to accrue debt).
4. **Risk:** Low, but notable: whoever writes the real SPEC should be aware this exact path is already referenced by name in committed tooling — deviating from `frontend/src/stores/auth-store.ts` would require updating `screenshot-dashboard.ts` too.
5. **Suggested direction:** n/a — evidence only.

### 1.14 `generated/`

1. **Current implementation:** Does not exist. No Orval config, no OpenAPI document (committed or exportable — see Discovery Report §2.2, unchanged since).
2. **Missing pieces:** Everything — see Part 2.E below.
3. **Technical debt:** n/a.
4. **Risk:** n/a (tracked in 2.E).
5. **Suggested direction:** n/a — evidence only.

### 1.15 middleware

1. **Current implementation:** No `middleware.ts` exists anywhere in `frontend/`.
2. **Missing pieces:** Any route-level protection mechanism (Next.js Edge Middleware is the framework-native place for this).
3. **Technical debt:** n/a.
4. **Risk:** Medium — same open question flagged in the Discovery Report (§12 there): an `HttpOnly` refresh cookie is present but the access token is memory-only; Edge Middleware can only see cookies, not in-memory JS state, so a middleware-only protection strategy cannot fully verify session validity without either (a) checking only for cookie *presence* (weak signal) or (b) a server round-trip from within middleware (latency cost on every navigation). This is unresolved evidence, not a decision.
4. **Risk (cont'd):** The Playwright tooling (`pages.ts`, `screenshot-dashboard.ts`) already assumes unauthenticated visits to `(dashboard)` routes redirect to `/login` — i.e., *some* protection mechanism is assumed to exist, without specifying which layer.
5. **Suggested direction:** n/a — evidence only.

### 1.16 Auth flow

Covered in depth in Part 2.C below. Summary: fully designed on paper (Discovery Report), zero implementation. `lib/api.ts` sends no Authorization header today; no login page exists; no token storage exists; no refresh logic exists.

### 1.17 Routing

1. **Current implementation:** One route (`/`), the root page.
2. **Missing pieces:** Every other route. Notably, `tools/playwright/pages.ts` (already committed) hard-codes a **specific, named route map** with an explicit comment stating it was cross-referenced against `frontend/src/app/(dashboard)/**/page.tsx` — meaning this route map was written as if that structure already existed:

   | Business name | Route path |
   |---|---|
   | Login | `/login` |
   | Dashboard | `/dashboard` |
   | Product | `/product` |
   | Customer | `/customer` |
   | Inventory | `/inventory-adjustment` |
   | Warehouse | `/warehouse` |
   | Supplier | `/supplier` |
   | Category | `/category` |
   | Brand | `/brand` |
   | Purchase | `/purchase-order` |
   | Sales | `/checkout` |
   | Reports | `/purchase-report` |
   | Settings | `/organization` |

   None of these routes exist in `frontend/src/app/` today. This is either (a) forward-looking tooling prepared ahead of implementation, or (b) evidence of an intended route map from earlier planning that was never built — Discovery cannot distinguish which from the file evidence alone.
3. **Technical debt:** None in code (nothing built). The route-map-vs-reality mismatch itself is worth the Architect's attention when authoring SPEC-T031, since it's already-committed, already-referenced-by-name evidence of prior intent.
4. **Risk:** Low today (no code depends on the mismatch); becomes relevant the moment routing is actually implemented — if the real route names diverge from this list, `tools/playwright/pages.ts` needs updating too (already anticipated in that file's own comments, which explicitly invite editing `path` values).
5. **Suggested direction:** n/a — evidence only.

### 1.18 Theme

1. **Current implementation:** Fully working — `next-themes` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`), `ThemeToggle` component (light/dark/system picker via shadcn `DropdownMenu`), full shadcn CSS-variable palette wired for both modes via Tailwind's `@custom-variant dark`.
2. **Missing pieces:** None found for the mechanism itself. No project-specific brand palette yet (still shadcn's neutral defaults) — a design decision, not a missing-implementation gap.
3. **Technical debt:** None found.
4. **Risk:** Low.
5. **Suggested direction:** n/a — evidence only.

### 1.19 TanStack Query

1. **Current implementation:** `QueryProvider` wired at the app root with `staleTime: 30_000`, `refetchOnWindowFocus: false`, `retry: 1`. No queries or mutations exist anywhere yet (nothing to fetch without an API client — §1.12/§1.14).
2. **Missing pieces:** Query key conventions/factory, no error-boundary integration (`throwOnError`/`useErrorBoundary` not configured), no global `QueryCache`/`MutationCache` `onError` hook for toast integration (relevant once Toast exists, §1.20/2.F).
3. **Technical debt:** None found.
4. **Risk:** Low.
5. **Suggested direction:** n/a — evidence only.

### 1.20 Zustand

1. **Current implementation:** Installed (`zustand@^5.0.14`), zero stores exist.
2. **Missing pieces:** Every store (§1.13).
3. **Technical debt:** n/a.
4. **Risk:** Low by itself.
5. **Suggested direction:** n/a — evidence only.

### 1.21 Axios

Covered in §1.12 above. Summary: instance exists, `withCredentials: true` already correctly anticipates the cookie-based refresh flow, but **no request interceptor exists at all** (no Authorization header attached to any request today) and the response interceptor's error-handling branch is an explicit stub.

### 1.22 Existing UI components

1. **Current implementation:** `components/ui/button.tsx`, `components/ui/dropdown-menu.tsx` (both shadcn-generated, `base-nova`/Base UI style — note: uses the `render={<Button .../>}` prop pattern rather than classic Radix `asChild`, a shadcn-style-specific API surface worth the Architect knowing about since it affects how *every future* shadcn component in this project will be composed). `components/theme-toggle.tsx` (hand-written, composes the two primitives above).
2. **Missing pieces:** Everything else needed for real screens — Toast/Sonner, Dialog, Sheet, Form (RHF+Zod wrapper), Table, Input/Select/Checkbox/Switch, Card, Skeleton, Badge, Avatar, etc. — all addable incrementally via `npx shadcn add`.
3. **Technical debt:** None found.
4. **Risk:** Low.
5. **Suggested direction:** n/a — evidence only.

---

## Part 2 — Deep-dive sections

### A. Dependency graph

```
OpenAPI export mechanism (backend-scope, doesn't exist — Discovery §2.2/2.E below)
        │
        ▼
Orval codegen → generated/ (frontend-scope, doesn't exist)
        │
        ▼
services/api-client.ts  (evolves from lib/api.ts — request interceptor for Bearer token
        │                 currently MISSING entirely; response interceptor is a stub)
        │
        ▼
stores/auth-store.ts  (path already referenced by name in tools/playwright/screenshot-dashboard.ts;
        │               file itself does not exist)
        ├──► hooks/ (usePermission — reads decoded JWT claims from the store)
        ├──► middleware.ts (route protection — layer choice unresolved, §1.15)
        └──► services/ organization context call (GET /organizations/current)
                    │
                    ▼
        layouts/ (dashboard shell — depends on Auth store + Org context + UI primitives below)
                    │
                    ▼
        components/ui/ toast, loading, error-boundary primitives (independent chain,
        can proceed in parallel with the Auth chain above — no dependency between them)
                    │
                    ▼
        app/(auth)/login, app/(dashboard)/* routes (depend on everything above)
```

Independent, no-dependency work streams: `lint-staged` + pre-commit hook wiring; shadcn primitive additions (Toast/Dialog/Form/Table/etc.); `README.md` correction.

### B. Folder gap analysis

| Folder (per authorization's/Discovery's target list) | Exists? | Contents |
|---|---|---|
| `app/` | ✅ | root layout + 1 page only |
| `components/` | ✅ (partial) | `ui/` (2 primitives) + 1 hand-written composite |
| `features/` | ❌ | — |
| `hooks/` | ❌ | — |
| `services/` | ❌ | `lib/api.ts` is the closest analogue, not in this location |
| `stores/` | ❌ | referenced by path in committed tooling, file absent |
| `providers/` | ✅ | 3 files, Theme + Query only |
| `layouts/` | ❌ | — |
| `types/` | ❌ | — |
| `utils/` | ✅ (minimal) | only shadcn's `cn()` helper in `lib/utils.ts` |
| `styles/` | ❌ | `globals.css` lives directly under `app/` instead |
| `config/` | ❌ | — |
| `generated/` | ❌ | — |
| `middleware.ts` (file, not folder) | ❌ | — |

### C. Authentication flow analysis

Full backend contract (login/refresh/logout/sessions/forgot-password, Web-vs-Mobile token delivery split, `UserInfoDto` missing `isPlatformAdmin`, no "current user" endpoint) was already traced in detail in the Discovery Report §2.3 and is unchanged — re-confirmed here, not re-derived, to avoid duplicating that evidence verbatim.

**What's new in this pass:** the frontend-side evidence of *intended* implementation shape, found in already-committed tooling (not the app itself):
- `frontend/src/stores/auth-store.ts` — named path, file doesn't exist (§1.13).
- Session described as "Zustand in-memory, khôi phục qua cookie `/auth/refresh`" — i.e., the tooling's own comment already describes the exact auto-refresh-on-load pattern the Discovery Report independently proposed from the backend contract alone, without having read this tooling comment first. Two independent lines of evidence (backend contract reasoning + pre-existing tooling comment) converge on the same shape — worth the Architect's attention as corroboration, not proof.
- `lib/api.ts` sends **zero** Authorization headers today — confirmed by direct inspection, not inferred. Any current API call from this frontend to any authenticated backend endpoint would fail with 401 today, as-is.

### D. Permission flow analysis

Backend mechanism (JWT `permissions[]` claim, checked directly by `PermissionsGuard`, no server round-trip) already traced in Discovery Report §2.4 — unchanged, re-confirmed.

**New in this pass:** no frontend code references `permissions`, `usePermission`, or any permission-gating concept anywhere in the current tree (confirmed via full-file review, not just a grep — all 17 source files were read). This is a from-scratch area with no prior partial implementation and no tooling-level hints (unlike Auth, where `screenshot-dashboard.ts` at least named a file).

### E. API generation readiness

Unchanged from Discovery Report §2.2/§9: **not ready.** No OpenAPI document is committed or exportable without a running server; no Orval install; no config; no `generated/` folder. This is the single hardest blocker in the whole dependency graph (§A above) — nothing downstream of it (typed API calls, typed forms via Zod-from-OpenAPI, etc.) can start until it's resolved, and resolving it requires backend-scope work (an export script), not just frontend work.

### F. Performance readiness

1. **Current implementation:** Default Next.js 15 + Turbopack (`next dev --turbopack`, `next build --turbopack`) — Turbopack is used for both dev and build, not just dev. `next/font` (Geist) already used for optimized font loading. No images used yet (no `next/image` usage to evaluate).
2. **Missing pieces:** No `next.config.ts` image domain/remote-pattern configuration (needed once real product/user images are served). No bundle-analysis tooling. No explicit `output: 'standalone'` decision for containerized deployment (relevant to §H). No React Query cache-persistence strategy (e.g., for offline-ish resilience — this project's backend context is "1-PC offline-only POS" per project history, which may or may not extend to the frontend; not addressed anywhere in frontend code or docs found).
3. **Technical debt:** None found — too early for debt to have accrued.
4. **Risk:** Low today; the offline-single-computer backend context (if it extends to frontend expectations) is a real open question worth flagging, since nothing in the current frontend evidence addresses it one way or the other.
5. **Suggested direction:** n/a — evidence only.

### G. Testing readiness

1. **Current implementation:** None. No test runner installed (no Jest, Vitest, React Testing Library, Playwright *component* testing — Playwright itself IS present, but only as a screenshot/visual-capture tool under `tools/playwright/`, driving the app as an external black box, not as a component-level test framework).
2. **Missing pieces:** Everything — unit/component test runner, test file convention, CI wiring (`frontend-ci.yml` as of T030.14B has no test step at all, confirmed by direct reading — matches `package.json` having no `test` script).
3. **Technical debt:** n/a (nothing to accrue debt on; this is a clean absence, not a broken partial attempt).
4. **Risk:** Medium — every other part of this project (backend) has enforced ≥90% coverage as a standing convention (project history); frontend currently has a structurally different (and lower) testing floor than backend, which the Architect may or may not consider acceptable for this project's standards.
5. **Suggested direction:** n/a — evidence only.

### H. Deployment readiness

1. **Current implementation:** `docker-compose.yml` defines `postgres`, `redis`, `bring-up`, `backend` — **no `frontend` service.** `backend/Dockerfile` exists; **no `frontend/Dockerfile`.** `docs/setup/DEVELOPMENT-SETUP.md` explicitly documents this as intentional for *local development*: "the frontend always runs natively with `npm run dev`, in both [supported dev] modes" — this is a documented dev-mode decision, not an oversight, but it says nothing about production/release deployment packaging, which is a separate question the same document doesn't address for frontend (backend's own deployment packaging was covered under T022, per project history; no frontend equivalent found anywhere).
2. **Missing pieces:** Any production build/serve strategy (Docker image, static export, Vercel-style platform target, or otherwise), any frontend equivalent of backend's T022 deployment packaging work.
3. **Technical debt:** n/a.
4. **Risk:** Medium — this is a real, unaddressed gap for eventual production release, though explicitly out of T031.01/T031.01A's "no business module, foundation only" scope; flagging so it isn't silently forgotten by the time SPEC-T031 or a later T031.0x is authored.
5. **Suggested direction:** n/a — evidence only.

### I. Developer Experience readiness

1. **Current implementation:** `npm run dev` works out of the box (confirmed via `DEVELOPMENT-SETUP.md`'s documented port convention: backend `:3000`, frontend `:3001`, `PORT=3001 npm run dev`). ESLint/Prettier/TypeScript strict all functional. Husky + commitlint active repo-wide (every commit across this whole engagement has gone through it). `tools/playwright/` provides a working, documented screenshot-capture workflow for whatever pages do exist, with clear fallback behavior (unauthenticated → real `/login` redirect capture, not a fake bypass) — genuinely good existing tooling quality for what it covers.
2. **Missing pieces:** No `lint-staged` (pre-commit only runs commit-message linting today, not staged-file lint/format — confirmed by inspecting root `package.json`'s `husky`/`prepare` setup and finding no `pre-commit` hook file wired to lint-staged anywhere). No `typecheck`/`format`/`test` npm scripts for local parity with what CI actually runs. `README.md` is unedited boilerplate — a new contributor reading `frontend/README.md` alone would get zero project-specific guidance (the real guidance lives in `docs/setup/DEVELOPMENT-SETUP.md` at the repo root instead).
3. **Technical debt:** The `README.md` gap is the clearest concrete item here.
4. **Risk:** Low — these are all convenience/consistency items, not correctness risks.
5. **Suggested direction:** n/a — evidence only.

---

## Summary of the single largest cross-cutting finding

Three independent pieces of evidence — the Discovery Report's own backend-contract reasoning (§10 there), a pre-existing committed comment in `tools/playwright/screenshot-dashboard.ts` naming `frontend/src/stores/auth-store.ts`, and a pre-existing committed route map in `tools/playwright/pages.ts` cross-referenced against a `(dashboard)` route group — all point at a **specific, already-partially-specified intended shape** for the frontend that was never actually built. This isn't proof of a mandated design (Discovery cannot promote it to a decision), but it is real, committed, named evidence the Architect should weigh when authoring RFC-T031/SPEC-T031, since deviating from these already-referenced paths/routes would mean updating already-working tooling to match.

---

## Explicitly out of scope for this Gap Analysis

No RFC-T031 or SPEC-T031 content. No code, dependency installs, commits, PRs, or pushes — confirmed via `git status --short` showing only this document and the prior Discovery Report as untracked additions. No decision made on any flagged item above.

# RFC-T031 — Frontend Architecture

**Status:** RFC (Architecture only — no implementation code, no SPEC content).
**Authority:** T031.02 authorization, explicitly reversing the standing "RFC/SPEC authored by the User only" rule (CLAUDE.md; Decision G01–G06) as a disclosed, scoped, one-time exception — matching the one prior documented precedent in this project (RFC-0003). Not a change to project governance going forward; the next RFC after this one reverts to the standard rule unless separately authorized.
**Evidence base:** the 7 approved T031 discovery documents (T031.01–T031.01F), the Discovery Index (T031.01G), the RFC Preparation package (T031.01H), and the RFC Decision Matrix (T031.01I) — frozen as the official evidence baseline per the T031.02 authorization. This RFC introduces no new technical fact beyond that baseline; it resolves the Decision Matrix's 21 open items into final decisions (§30) and organizes everything into an architecture document.
**Scope discipline:** no frontend or backend source modified, no CI/workflow modified, no dependency installed — documentation-only, matching the T031.02 authorization's explicit constraints.

---

## 1. Executive Summary

Backend reached Release Candidate 1 with a stable, versioned API contract and green CI. A 9-package discovery phase then audited the existing frontend (a genuine partial Next.js 15/React 19 foundation, not a blank scaffold), the exact backend contract it must consume, OpenAPI/codegen feasibility, testing readiness, and authentication/security requirements — surfacing one concrete, mechanically-certain risk (multi-tab session-restoration racing the backend's already-shipped refresh-token rotation) that shaped a large part of this architecture. This RFC defines how the Foundation phase is built: directory structure, state-management split, authentication/authorization design, API-layer generation strategy, and the supporting CI/testing/security posture — without specifying any business-module screen.

## 2. Goals

- Build the Foundation phase (auth, routing shell, API client, shared UI primitives) on top of the existing, already-working Next.js/React/Tailwind/shadcn base rather than rebuilding it.
- A typed, generated API client sourced from a versioned, committed OpenAPI document, kept in sync via CI drift-checking.
- An authentication design that is safe under real multi-tab browser usage, not merely single-tab-tested.
- Explicit, evidenced state-management boundaries (server state vs. client-only state) rather than one library covering both by convention.
- A testing foundation (framework, mocking strategy, CI wiring) established before real business-feature code is written, so testing habits form from the start of feature work rather than being retrofitted.
- Every architectural choice traceable to specific, already-gathered evidence — no invented requirement.

## 3. Non-Goals

- No business-module screens or features (Product, Customer, Checkout, etc.) — explicitly out of scope for every T031.01 discovery package and this RFC alike.
- No production deployment packaging (Docker image, hosting target) — Gap Analysis §H found this entirely unaddressed and this RFC defers it (§25, §30 D02).
- No change to backend business logic — the narrowly-scoped backend follow-ups this RFC does recommend (§30 D08/D09/D17) are documentation/typing/test-coverage fixes, not behavior changes, and are separate authorizations, not part of this RFC's own scope.
- No mobile-app/React Native scope — the backend's `X-Client-Type: mobile` support is a fact this RFC accounts for in the API contract (§9), not a scope this RFC's frontend architecture covers.
- No internationalization framework decision — not evidenced or requested anywhere in the discovery sequence.
- No RFC-T031-authored SPEC content — SPEC-T031 is explicitly a separate, future deliverable per the T031.02 authorization.

## 4. Current State

(Full evidence: Foundation Discovery, Foundation Audit, Gap Analysis)

Next.js 15.5.20 (App Router), React 19.1.0, TypeScript `strict: true`, TailwindCSS v4, shadcn/ui (`base-nova`/`@base-ui`) — all confirmed working. Per-file audit of all 26 tracked files: 17 KEEP as-is, 2 REPLACE (placeholder `page.tsx`, boilerplate `README.md`), 1 REFACTOR (`package.json` scripts), 5 REMOVE (unused stock assets), 1 UNUSED (`lib/api.ts` — a correct starting point, imported by nothing today, no request interceptor). Zero routing beyond `/`, zero auth, zero test infrastructure, zero deployment packaging. Pre-existing, already-committed tooling (`tools/playwright/pages.ts`, `screenshot-dashboard.ts`) independently names a specific route map and a `frontend/src/stores/auth-store.ts` path — real prior evidence this RFC's directory structure (§6) and routing strategy (§7) are built to honor, not invent from nothing.

## 5. Architecture Overview

Feature-based structure with a thin, explicit shared/platform layer, matching Foundation Discovery §5's original proposal, unrevised by any subsequent discovery finding:

- `app/` (Next.js App Router) is a routing shell only — layouts and `page.tsx` files that compose feature components, no business logic directly inside it.
- `features/<domain>/` — one folder per frontend-facing concern, mirroring backend module boundaries without copying backend's internal domain/application/infrastructure/presentation layering (a fundamentally different runtime shape: components + hooks, not services + repositories).
- A shared platform layer (`services/`, `stores/`, `hooks/`, `providers/`, `layouts/`) carries everything that isn't feature-specific: the API client, auth/settings/UI state, cross-feature hooks, and page shells.

This keeps `app/` tractable at scale (matching how Next.js's own file-system routing is intended to be used) and pushes real logic into layers that are independently testable.

## 6. Directory Structure

```
frontend/src/
  app/
    (auth)/
      login/page.tsx
      forgot-password/page.tsx
    (dashboard)/
      layout.tsx
      page.tsx
      organizations/            # Platform Admin surface — isPlatformAdmin-gated, not permission-gated
    layout.tsx                   # existing, kept
    globals.css                  # existing, kept
  components/
    ui/                          # shadcn primitives — existing 2 (button, dropdown-menu), extended incrementally
    common/                      # Toast host, Error Boundary, Loading/Skeleton — none exist yet
  features/
    auth/
      components/
      hooks/
    organization/
      components/
      hooks/
  hooks/
    use-permission.ts
    use-current-organization.ts
    use-session-restore.ts
  services/
    api-client.ts                 # evolved from lib/api.ts (§30 D01)
    auth-coordination.ts          # Web Locks + BroadcastChannel (§19)
  stores/
    auth-store.ts                 # matches the path already named in tools/playwright/screenshot-dashboard.ts
    settings-store.ts             # or query-only, per §13/§30 D18
    ui-store.ts
  providers/                      # existing: index.tsx, query-provider.tsx, theme-provider.tsx — gains an Auth provider
  layouts/
    dashboard-shell.tsx
    auth-shell.tsx
  types/
  utils/
    browser-capability.ts         # feature-detects Web Locks/BroadcastChannel (§19)
    decode-jwt.ts                 # UX-only decode, never a trust decision (§10)
  config/
  generated/                      # Orval output, gitignored (§30 D11)
```

Every path here is either an existing, unchanged file (§4), or was already named/proposed in the discovery evidence base — no new path is introduced without traceability (§traceability table).

## 7. Routing Strategy

Next.js App Router, route groups separating unauthenticated (`(auth)`) from authenticated (`(dashboard)`) concerns, matching the pre-existing route map already referenced in `tools/playwright/pages.ts` (`/login`, `/dashboard`, and per-domain business routes) — this RFC does not invent new route names beyond what that already-committed tooling names, and defers any renaming to whoever authors the routes themselves. Platform Admin routes (organization creation/listing) live under their own segment, gated by the `isPlatformAdmin` JWT claim directly — never modeled as a permission string, since Platform Admin structurally bypasses the tenant permission system entirely (Auth/Security Discovery §10, Organization API survey).

Route protection is layered: Next.js Middleware provides UX-level routing only — checking for the mere presence of the `refresh_token` cookie (readable server-side despite `HttpOnly`, which only blocks browser JavaScript) to redirect obviously-logged-out users before any content flash. **This is never a security boundary** — presence of a cookie is not proof of a valid session, and middleware has no cheap way to verify validity without a network call on every navigation. Real enforcement remains, as it already is today, 100% server-side (`JwtAccessStrategy`'s per-request database re-validation) — this is a structural fact about what any frontend architecture can and cannot do here, not a design preference (§30 D-adjacent, Auth/Security Discovery §9).

## 8. State Management

A deliberate two-library split, not one library covering both:

- **TanStack Query** — all server state: anything originating from an API call. Already wired with sensible defaults (`staleTime: 30_000`, `refetchOnWindowFocus: false`, `retry: 1`).
- **Zustand** — client-only state that isn't naturally a query result: the Auth Store (current access token, decoded claims, authenticated flag), a UI Store (sidebar state, transient UI flags), and the Organization/Settings question resolved in §13/§30 D18.

## 9. Authentication Architecture

(Full backend contract: Auth/Security Discovery)

- **Login**: `POST /auth/login` with `organizationSlug + email + password` (multi-tenant — email is only unique per-organization). WEB clients (no `X-Client-Type: mobile` header) receive the access token in the JSON body; the refresh token is delivered **only** via an `HttpOnly`, `Secure`(prod), `SameSite=Lax` cookie scoped to `/api/v1/auth` — never present in the WEB response body.
- **Access token storage**: memory-only (a Zustand store field) — never `localStorage`/`sessionStorage`, minimizing XSS blast radius (§30 D-confirmed, was already the evidenced-sound recommendation carried since T031.01).
- **Session restoration on reload**: since the access token is memory-only, the only recovery path is `POST /auth/refresh` with `withCredentials: true` and no explicit token handling — the browser attaches the cookie automatically.
- **Refresh token rotation**: the backend already implements full rotation-on-every-use plus theft/reuse detection (`revokeAllForUser` triggered if an already-revoked token is presented again) — real, shipped, unit-tested backend behavior, not a frontend design choice. This makes cross-tab coordination (§19) a hard requirement, not an optional refinement: two tabs restoring a session near-simultaneously would otherwise race this exact mechanism and log a legitimate user out everywhere.
- **Refresh failure**: any `/auth/refresh` failure (expired, invalid, or reused-and-revoked) is treated as "not logged in" — clear the Auth store, redirect to `/login`. The backend does **not** clear the cookie itself on a failed refresh (only explicit logout does) — a disclosed backend behavior this frontend architecture must account for, not assume away.
- **Logout propagation**: broadcast across tabs via the same coordination channel used for refresh (§19), so every open tab reacts to a logout immediately rather than only discovering it on its own next failed API call.

## 10. Authorization (Permission Guard)

Client-side permission/Platform-Admin checks read the decoded access token's `permissions[]`/`isPlatformAdmin` claims directly — the same source the backend's own `PermissionsGuard` and `PlatformAdminOrPermissionsGuard` already trust. This is **UX-only**: hiding/showing UI for a smoother experience, never the actual enforcement boundary, which is the backend's own re-validation on every request. `jwt-access.strategy.ts` proves this is correct architecture, not a shortcut: the backend re-fetches the user from the database and re-checks `permissionVersion` on *every single request*, meaning even the backend itself never trusts a previously-issued claim at face value (Auth/Security Discovery §12).

## 11. API Layer (Orval)

Orval generates a typed client (Axios + TanStack Query hooks) from the committed `openapi.json` (§20), targeting the shared `services/api-client.ts` Axios instance so the global response-envelope normalization (§14) applies uniformly to generated calls too. Multipart file-upload endpoints (one confirmed precedent: `POST /suppliers/import`, correctly Swagger-annotated already) are expected to generate correctly via Orval's standard `FormData` support.

## 12. React Query Strategy

Continue the existing `QueryProvider` defaults for production use; test contexts use a fresh `QueryClient` per test with `retry: false`/`gcTime: 0` overrides (Testing & CI Discovery §7) rather than the production singleton. Query-key conventions and cache-invalidation rules are left to SPEC-T031 — this RFC establishes the library boundary (§8), not per-query design.

## 13. Zustand Strategy

Three stores: **Auth Store** (§9), **UI Store** (sidebar/transient flags), and **Organization Context** — resolved (§30 D18) as a hybrid: the JWT's `organizationId` claim for immediate/synchronous "which org" checks, `GET /organizations/current` (via TanStack Query, not a dedicated Zustand store) for the full `settings`/`subscription` object. This avoids a third, redundant client-only store for data that's naturally server state.

## 14. Error Handling

The backend's global response envelope (`{success, data, meta, traceId, timestamp}` success shape / `{success:false, code, message, errors, traceId, timestamp}` error shape, applied to every endpoint via `APP_INTERCEPTOR`/`APP_FILTER`) is the single normalization target for the Axios response interceptor — errors are unwrapped to `code`/`message`/`errors` uniformly, not left as raw Axios error objects. TanStack Query's `QueryCache`/`MutationCache` `onError` hooks are the integration point for surfacing normalized errors to a Toast system (§17) once one exists.

## 15. Loading Strategy

Two complementary layers: Next.js App Router's native `loading.tsx` file convention (route-level Suspense boundaries — not yet used anywhere, confirmed absent) for navigation-level loading states, and component-level Skeleton primitives (shadcn, not yet added) for in-place loading within an already-rendered page. Any custom Loading system this RFC's evidence base did not specifically design must not duplicate or conflict with Next.js's own built-in mechanism (Gap Analysis §1.9's flagged risk).

## 16. Form Strategy

React Hook Form + Zod resolvers (`@hookform/resolvers`) — both already installed, unused today. shadcn's Form wrapper component (not yet added, per Foundation Audit's UI component inventory) is the expected integration point once real forms are built; no form has been designed by any discovery document, so this section establishes the library choice only, not a form-by-form design.

## 17. UI Component Strategy

`components.json`'s `style: "base-nova"` commits this project to `@base-ui/react`'s `render`-prop composition API, not the classic Radix `asChild` pattern most shadcn tutorials assume — already in active, working use by both existing primitives (`button.tsx`, `dropdown-menu.tsx`) and their one consumer (`theme-toggle.tsx`). **Binding for every future component** (§30 D-confirmed) — any future contributor work must follow this API, not the more commonly-assumed Radix one. New primitives (Toast, Dialog, Form, Table, Input/Select/Checkbox, Skeleton, Card) are added incrementally via the shadcn CLI as each is actually needed, not batch-generated upfront.

## 18. Theme Strategy

`next-themes` (already wired: `attribute="class"`, `defaultTheme="system"`, `enableSystem`) plus a full shadcn CSS-variable palette for both light and dark modes (`globals.css`, confirmed complete and structurally parallel for both modes) — fully functional today, kept as-is. No project-specific brand palette exists yet (still shadcn's neutral defaults); introducing one is a design-system decision this RFC does not make, having found no discovery evidence proposing a specific brand identity.

## 19. Cross-tab Session Strategy

(Full option comparison: Cross-Tab Coordination Discovery)

**Primary mechanism**: Web Locks API (`navigator.locks`) for browser-guaranteed, single-holder mutual exclusion across tabs around the `/auth/refresh` call, combined with `BroadcastChannel` to relay the resulting access token (never the refresh token, which no coordination mechanism ever touches — `HttpOnly` blocks that at the browser level regardless) to every other open tab. Web Locks was chosen over hand-rolled `BroadcastChannel`-only leader election specifically because it is browser-*guaranteed* exclusive (no protocol-level race window) and auto-releases on tab crash/close with zero manual timeout/heartbeat logic needed.

**Fallback**: a `localStorage`-mutex protocol for browsers predating Web Locks/`BroadcastChannel` support (both landed in Safari 15.4, March 2022) — a real, product-specific concern given this is a POS product plausibly deployed on fixed, sometimes-dated terminal browsers, not generic browser-compat caution (§30 D20).

**Not adopted**: `SharedWorker` (Option D) — architecturally elegant (structurally impossible for the race to occur, since there's only one execution context) but disqualified by a *permanent* WebKit gap (never supported on iOS Safari, not merely a version threshold), a materially higher risk than either Option A or C given this product's likely audience.

**Deferred, not rejected**: backend refresh-rotation grace window (Option E, industry-precedented — Auth0's Refresh Token Rotation Reuse Interval) as a defense-in-depth safety net for the one residual gap client-side coordination doesn't fully cover (a brand-new tab opening in the exact race window before subscribing to the coordination channel). Deferred pending empirical confirmation this gap is materially real in practice, not implemented preemptively — implementing it without that confirmation risks its own named "duplicate request re-triggers rotation" trap (§30 D19).

## 20. OpenAPI Generation

A standalone backend script (new file, e.g. `backend/scripts/export-openapi.ts`) calling the exact same `SwaggerModule.createDocument()` invocation `main.ts` already uses, skipping `.listen()` — requires a reachable Postgres (the sole hard blocker, traced to `PrismaService.onModuleInit()`'s eager `$connect()`; Redis is confirmed not a blocker) but changes zero production files, matching the "safest way" framing of the original discovery objective. Output committed to `docs/api/openapi.json` (§30 D06, matching this project's established `docs/` organizational convention), with a dedicated CI drift-check job on both backend (OpenAPI freshness) and frontend (Orval-output freshness) sides, built by extending T030.14B's already-proven `changes`/gated-job/aggregator pattern rather than inventing a new one (§30 D10). `generated/` (frontend) is gitignored, not committed, since the source of truth (`openapi.json`) is already versioned (§30 D11).

Two related backend gaps, disclosed and recommended for narrow follow-up authorization, not fixed by this RFC: `SupplierImportSummary`'s undecorated-interface Swagger blind spot (§30 D08), and the complete absence of `@ApiCookieAuth()` metadata for the WEB refresh-cookie flow (§30 D09).

## 21. CI/CD Strategy

Extend the existing, proven `changes` → gated-job → `Backend`/`Frontend` aggregator pattern (T030.14B) — do not invent a new CI pattern. New jobs needed: a frontend `test` job (added at the same time as the first real test exists, not pre-provisioned empty — §30 D14), and the OpenAPI/Orval drift-check jobs (§20/§30 D10). No change to the `Backend`/`Frontend` required-check ruleset itself is needed — both new job types compose as additional gated steps feeding the existing aggregators, the same way `test` slots in alongside `ci`.

## 22. Testing Strategy

(Full comparison: Testing & CI Discovery)

**Framework**: Vitest + React Testing Library + jsdom + MSW (§30 D-confirmed) — chosen over Jest for alignment with this project's already-aggressive Turbopack-everywhere tooling philosophy, while Jest's cross-stack consistency with backend was the credible counter-argument, not disqualified, just not chosen. MSW over `axios-mock-adapter` specifically because it can also serve real E2E tests later without a second mocking mechanism.

**Coverage**: no enforced threshold during the Foundation phase (near-zero business logic to cover meaningfully today); adopt backend's ≥90% convention once real business-feature work begins (§30 D12) — matches how that convention itself accreted historically, never as a Day-1 gate.

**Playwright E2E**: authorized, reusing the existing `tools/playwright/lib/screenshot.ts`'s `DEFAULT_BASE_URL` convention rather than introducing a second, divergent "how do I point Playwright at the app" mechanism (§30 D13) — required specifically to prove, via a real multi-context browser test, that concurrent tab session-restoration does not trigger false backend reuse-detection (Cross-Tab Discovery §Q8). The existing screenshot-capture tooling remains permanently separate from this new, assertion-based E2E suite — genuinely different purposes, no discovery evidence found a problem migration would solve (§30 D15).

## 23. Performance Strategy

Continue the already-made choice of Turbopack for both `dev` and `build` (an aggressive, working, pre-existing decision, not new to this RFC). Bundle-analysis tooling, `next/image` domain configuration, and any offline/PWA-adjacent consideration (given this product's backend context of single-PC/offline-oriented deployment, per project history — not directly addressed by any T031 discovery document for the frontend specifically) are deferred to when they become concretely needed, not designed speculatively here.

## 24. Security Strategy

(Full analysis: Auth/Security Discovery)

- Memory-only access token, `HttpOnly`+`SameSite=Lax`+`Secure`(prod)-scoped refresh cookie (§9) — both already-evidenced-sound choices.
- No client-side trust of any JWT claim as a final authority (§10) — every claim can go stale between issuance and use; the server's own re-validation on the *next* request is the only ground truth.
- `SameSite=Lax` accepted as sufficient CSRF protection for the Foundation phase, given the sensitive routes are already POST-only and this is real (not theoretical) protection in all modern browsers — no additional CSRF-token mechanism authorized at this time (§30 D16); revisit only if a future route design needs GET-with-side-effects.
- Backend follow-ups recommended, not performed by this RFC: `isPlatformAdmin` added to `UserInfoDto` (priority — it directly blocks a clean frontend Platform-Admin implementation without a JWT-decode workaround), and a bundled, lower-urgency package for the cookie-not-cleared-on-failed-refresh gap plus missing `auth.e2e-spec.ts` coverage (§30 D17).

## 25. Deployment Strategy

Deferred in full — no frontend Dockerfile, no `docker-compose.yml` frontend service, and no `next.config.ts` deployment-relevant settings exist or are proposed by this RFC (§30 D02). `docs/setup/DEVELOPMENT-SETUP.md` already documents the frontend as intentionally native-`npm run dev`-only for local development in both supported dev modes — this RFC does not change that, and production deployment packaging is explicitly out of Foundation-phase scope (Non-Goals, §3).

## 26. Risks

(Consolidated: RFC Preparation §8, unchanged)

| Risk | Nature |
|---|---|
| Concurrent/multi-tab refresh triggering false theft-detection logout | Mechanically certain given current backend design; addressed architecturally in §19, verified by the required Playwright multi-context test (§22) |
| No CSRF token, single-layered `SameSite=Lax` defense | Real but singular protection; accepted for this phase (§24, §30 D16) |
| Export-script connection-failure logs could leak `DATABASE_URL` if not reusing the existing sanitized-error convention | Concrete, actionable — implementation-time concern for §20's export script |
| No E2E coverage of the rotation/reuse/cookie-attribute contract at all today | Frontend is the first real automated consumer of an only-unit-tested backend contract |
| Stale cookie not cleared on failed refresh | Disclosed backend behavior, accounted for in §9's design, not fixed by this RFC |
| `SupplierImportSummary`/`isPlatformAdmin`/`@ApiCookieAuth` gaps | Produce incomplete/untyped Orval output or require manual JWT-decode workarounds until the recommended follow-ups (§20, §24) are authorized |
| Safari < 15.4 population size unknown for this product's real deployment context | Addressed via the localStorage fallback (§19, §30 D20), not eliminated |
| No frontend deployment packaging exists at all | Out of Foundation-phase scope (§3, §25); must not be silently forgotten past this phase |

## 27. Migration Plan

(Source: Foundation Audit §5/§7, unchanged)

Ordered by dependency, not importance: (1) `package.json` scripts/lint-staged — independent, first; (2) `README.md` rewrite; (3) unused-asset removal — both independent, zero-impact; (4) `lib/api.ts`→`services/api-client.ts` interceptor completion — blocked on the Auth Store existing, currently zero consumers so zero breakage risk; (5) `page.tsx` replacement — blocked on both routing and auth existing, correctly last.

## 28. Milestones

(Source: RFC Preparation §10/§11, unchanged, organizational only)

- **M1 — Tooling & hygiene**: independent, can start immediately.
- **M2 — OpenAPI + typed client**: depends on the separately-authorized backend export script (§20).
- **M3 — API client & Auth foundation**: `services/api-client.ts` completion, Auth Store, cross-tab coordination (§19) — the highest-complexity milestone, warrants being its own dedicated implementation phase given the evidenced risk (§26).
- **M4 — Authorization & context**: Permission Guard, Organization Context (§10, §13).
- **M5 — Shell & routing**: layouts, route groups, middleware (§7).
- **M6 — Test infrastructure**: Vitest/RTL/MSW setup (§22), can run concurrently with M3–M5 once the framework is installed.
- **M7 — First protected route**: the point at which real business-module work could begin — explicitly outside this RFC's own scope (§3).

## 29. ADR references

- `ADR-0003-multi-tenant.md` — establishes Platform Admin as structurally outside the tenant concept, with its own dedicated guard rather than folded into per-tenant RBAC; directly informs §7's routing segmentation and §10's authorization design (Platform Admin gated by `isPlatformAdmin`, never a permission string).
- No new ADR is created by this RFC (out of its documentation-only, architecture-level scope per the T031.02 authorization). The token-storage strategy (§9), cross-tab coordination mechanism (§19), and the OpenAPI-export approach (§20) are architecturally significant enough that a dedicated ADR may be warranted once implementation begins and these choices are proven in practice — flagged for the Architect's future consideration, not created here.

## 30. Final Architect Decisions

Resolving the RFC Decision Matrix's (T031.01I) 21 open items. Each decision below adopts that document's own recommendation, since those recommendations were reasoned specifically for this purpose against the full evidence base and no new evidence has emerged since. Full rationale for each lives in the Decision Matrix; only the final outcome is restated here.

| ID | Decision | Outcome |
|---|---|---|
| D01 | `lib/api.ts` location | Relocate to `services/api-client.ts` |
| D02 | `next.config.ts` deployment settings | Defer to dedicated deployment-packaging work |
| D03 | `README.md` rewrite scope | Short pointer to `docs/setup/DEVELOPMENT-SETUP.md` |
| D04 | `shadcn` package.json placement | Move to `devDependencies` |
| D05 | Favicon/brand-icon timing | Defer to dedicated branding work |
| D06 | `openapi.json` location | `docs/api/openapi.json` |
| D07 | `PrismaService` skippable-connect | Not authorized |
| D08 | `SupplierImportSummary` fix | Authorized as a small, separate follow-up |
| D09 | `@ApiCookieAuth()` addition | Authorized, bundled with D08 |
| D10 | CI drift-check design | Dedicated job(s), extending T030.14B's pattern |
| D11 | `generated/` commit policy | Gitignored |
| D12 | Coverage threshold | None until real features; then backend's ≥90% |
| D13 | Playwright E2E authorization | Authorized, reusing `DEFAULT_BASE_URL` |
| D14 | `test` job CI timing | Added alongside the first real test |
| D15 | `tools/playwright/` migration | Remains permanently separate |
| D16 | CSRF token requirement | `SameSite=Lax` accepted as sufficient for now |
| D17 | Backend auth-gap follow-ups | `isPlatformAdmin` prioritized; other two bundled, lower urgency |
| D18 | Organization Context source | Both — JWT claim (sync) + `GET /organizations/current` (detail) |
| D19 | Backend grace-window (Option E) | Deferred pending empirical confirmation of need |
| D20 | Minimum browser support | Support older browsers via the localStorage fallback |
| D21 | Grace-window duration | Not decided — contingent on D19, no evidence supports a specific value |

---

## Traceability table

| RFC section | Primary source document(s) |
|---|---|
| §1 Executive Summary | All 9 discovery documents |
| §2–3 Goals/Non-Goals | Discovery Index §3; RFC Preparation §3–4 |
| §4 Current State | Foundation Discovery, Foundation Audit, Gap Analysis |
| §5–6 Architecture/Directory | Foundation Discovery §5–6 |
| §7 Routing | Foundation Discovery, Auth/Security Discovery §9 |
| §8 State Management | Foundation Discovery §7; Discovery Index §3 |
| §9 Authentication | Auth/Security Discovery |
| §10 Authorization | Auth/Security Discovery §10, §12 |
| §11 API Layer | OpenAPI Export Discovery §5, §10 |
| §12 React Query | Testing & CI Discovery §7; Foundation Audit |
| §13 Zustand | Auth/Security Discovery §11; Cross-Tab Discovery |
| §14 Error Handling | Foundation Discovery §2.1; Testing & CI Discovery |
| §15 Loading | Gap Analysis §1.9 |
| §16 Forms | Foundation Audit (dependency inventory) |
| §17 UI Components | Foundation Audit §3, §9 |
| §18 Theme | Foundation Audit |
| §19 Cross-Tab Session | Cross-Tab Coordination Discovery (full document) |
| §20 OpenAPI Generation | OpenAPI Export Discovery (full document) |
| §21 CI/CD | T030.14B (prior package); Testing & CI Discovery §5 |
| §22 Testing | Testing & CI Discovery (full document) |
| §23 Performance | Gap Analysis §F |
| §24 Security | Auth/Security Discovery (full document) |
| §25 Deployment | Gap Analysis §H |
| §26 Risks | RFC Preparation §8 |
| §27 Migration Plan | Foundation Audit §5, §7 |
| §28 Milestones | RFC Preparation §10–11 |
| §29 ADR references | `ADR-0003-multi-tenant.md` |
| §30 Final Decisions | RFC Decision Matrix (all 21 entries) |

## Decision summary

21 of 21 open items resolved (§30); 1 (D21) explicitly left open, contingent on D19. 3 backend follow-up packages recommended (D08+D09 bundled, D17's `isPlatformAdmin` prioritized separately, D17's remaining two bundled) — none authorized to be performed *by* this RFC, each requiring its own future authorization. No new technical fact introduced beyond the frozen discovery baseline.

## Open questions

- **D21** — refresh-rotation grace-window duration, contingent on D19 ever being authorized; no evidence in the discovery baseline supports a specific value.
- **Deployment target** (§25) — not addressed by any discovery document; must be decided before M7-adjacent deployment work, not blocking the Foundation phase itself.
- **Exact query-key conventions and cache-invalidation rules** (§12) — left to SPEC-T031, not decided at the architecture level.
- **Form-by-form design** (§16) — no specific form exists yet to design against; library choice only is settled here.
- **Whether a dedicated ADR is warranted** for the token-storage, cross-tab-coordination, or OpenAPI-export architectural choices (§29) — flagged, not decided.

---

*This RFC was authored by Claude under an explicit, disclosed, scoped Architect exception (T031.02) to the standing RFC-authorship rule (CLAUDE.md; Decision G01–G06), matching the one prior documented precedent (RFC-0003). It is not evidence that this rule has changed for future packages.*

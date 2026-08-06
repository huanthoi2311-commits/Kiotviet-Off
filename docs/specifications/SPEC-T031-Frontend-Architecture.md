# SPEC-T031 — Frontend Architecture

**Status:** Implementation specification. Documentation only — no source code, no implementation.
**Authority:** T031.03 authorization, built exclusively from RFC-T031 (`docs/rfc/RFC-T031-Frontend-Architecture.md`, PR #6). Authored under the same disclosed, scoped Architect exception to the standing RFC/SPEC-authorship rule (CLAUDE.md; Decision G01–G06) already recorded in RFC-T031's own closing note — not a new exception, a continuation of the one already granted for T031.
**Rule followed throughout:** every requirement below cites the RFC section it traces to. Where the RFC left a detail undecided (explicitly, in its own §"Open questions"), this SPEC either fills the gap using an uncontroversial, industry-standard convention *only where the RFC explicitly delegated that level of detail to SPEC*, or discloses the gap outright rather than inventing a requirement RFC-T031 never authorized. Every such case is marked **[SPEC-LEVEL FILL]** or **[DISCLOSED GAP]** respectively, so the distinction is never ambiguous.

---

## 1. Scope

Implements the Foundation-phase frontend architecture defined in RFC-T031: tooling/hygiene, directory structure, authentication/authorization, the Orval-generated API layer, cross-tab session coordination, and the testing/CI foundation. Excludes all business-module screens (RFC §3 Non-Goals).

## 2. Goals

Restated from RFC §2, unchanged: build on the existing working Next.js/React/Tailwind/shadcn base; typed API client from a versioned OpenAPI contract; multi-tab-safe authentication; evidenced state-management boundaries; testing foundation established before business-feature work; full traceability.

## 3. Non-Goals

Restated from RFC §3, unchanged: no business-module screens; no production deployment packaging; no backend behavior changes beyond the RFC's recommended (not performed) follow-ups; no mobile/React Native scope; no i18n framework decision.

## 4. Functional Requirements

| ID | Requirement | RFC trace |
|---|---|---|
| FR1 | User can submit `organizationSlug` + `email` + `password` on `/login` and, on success, is authenticated with the access token held in memory. | RFC §9 |
| FR2 | On app load with no in-memory access token, the app attempts silent session restoration via `POST /auth/refresh` with credentials, before rendering any protected content. | RFC §9 |
| FR3 | Any API response with HTTP 401 triggers exactly one coordinated refresh attempt (see §9 Cross-tab Session Coordination); the originating request is retried once after a successful refresh, or the user is logged out after a failed one. | RFC §9, §19 |
| FR4 | User can log out (current device or all devices); the Auth Store is cleared and the user is redirected to `/login`; other open tabs receive the same logout state within one coordination-channel message round-trip. | RFC §9 |
| FR5 | UI elements gated by a permission code are shown/hidden based on the current access token's `permissions[]` claim; this gating is never the sole enforcement — every underlying API call remains independently protected server-side regardless of what the UI shows. | RFC §10 |
| FR6 | A user with `isPlatformAdmin: true` sees the Platform Admin route segment; this check reads the JWT claim directly, not a permission code. | RFC §10, §7 |
| FR7 | The Organization Context is available as (a) a synchronous `organizationId` derived from the decoded access token, and (b) a `GET /organizations/current`-backed TanStack Query result for full settings/subscription detail. | RFC §13, §30 D18 |
| FR8 | All API calls are made through Orval-generated, typed functions/hooks backed by the shared Axios instance — no hand-written `fetch`/raw-Axios call bypasses the shared client for any endpoint that has a generated counterpart. | RFC §11 |
| FR9 | Every API error response (`{success:false, code, message, errors, traceId, timestamp}`) is normalized by the Axios response interceptor before reaching calling code — no calling code parses the raw envelope itself. | RFC §14 |
| FR10 | Session restoration and refresh are safe under concurrent multi-tab use: opening N tabs of the same authenticated user near-simultaneously results in exactly one real `/auth/refresh` HTTP call, and none of the backend's theft/reuse-detection path (`revokeAllForUser`) is triggered by that concurrency alone. | RFC §19 |

## 5. Non-functional Requirements

| ID | Requirement | RFC trace |
|---|---|---|
| NFR1 | TypeScript `strict: true` is maintained for all new code (already the project setting). | RFC §4 |
| NFR2 | Access tokens are never written to `localStorage`/`sessionStorage`, under any code path, including error/debug logging. | RFC §9, §24 |
| NFR3 | The refresh-token cookie is never read, written, or inspected by any frontend JavaScript, directly or indirectly (its `HttpOnly` attribute makes this a browser-enforced constraint, not merely a convention). | RFC §9, §24 |
| NFR4 | Cross-tab coordination degrades through the tiers specified in §9 (Web Locks+BroadcastChannel → localStorage mutex) based on runtime feature detection — no code path assumes a specific browser capability without checking. | RFC §19 |
| NFR5 | Every new `shadcn` component is added via the CLI using the project's configured `base-nova`/`@base-ui` style — no manually-authored Radix-pattern (`asChild`) component is introduced. | RFC §17 |
| NFR6 | **[DISCLOSED GAP]** No specific performance budget (bundle size, Lighthouse score, Core Web Vitals threshold) is specified — RFC-T031 did not evidence one (RFC §23 defers bundle-analysis tooling to when concretely needed). Implementers must not invent a numeric target; escalate to the Architect if one is needed before implementation. |
| NFR7 | **[DISCLOSED GAP]** No specific accessibility conformance level (e.g. WCAG 2.1 AA) is specified — no discovery or RFC document evidenced one. `jest-axe`/`vitest-axe` tooling is required to exist (§21 Testing Specification) but the pass/fail bar it enforces is not defined here. |

## 6. Folder Structure

Authoritative, per RFC §6 (reproduced, not altered):

```
frontend/src/
  app/
    (auth)/login/page.tsx
    (auth)/forgot-password/page.tsx
    (dashboard)/layout.tsx
    (dashboard)/page.tsx
    (dashboard)/organizations/            # Platform Admin surface
    layout.tsx                             # existing, unchanged
    globals.css                            # existing, unchanged
  components/
    ui/                                    # shadcn primitives
    common/                                # Toast host, Error Boundary, Loading/Skeleton
  features/
    auth/{components,hooks}/
    organization/{components,hooks}/
  hooks/
    use-permission.ts
    use-current-organization.ts
    use-session-restore.ts
  services/
    api-client.ts                          # evolved from lib/api.ts
    auth-coordination.ts
  stores/
    auth-store.ts
    ui-store.ts
  providers/                               # existing, gains an Auth provider
  layouts/
    dashboard-shell.tsx
    auth-shell.tsx
  types/
  utils/
    browser-capability.ts
    decode-jwt.ts
  config/
  generated/                               # Orval output, gitignored
```

**[DISCLOSED GAP]**: RFC §13 evaluated but did not settle on a dedicated `settings-store.ts` (organization settings live in a TanStack Query result per FR7/D18, not a Zustand store) — the file is intentionally **absent** from this tree, not omitted by oversight.

## 7. Routing Specification

Route groups `(auth)` / `(dashboard)` per RFC §7. Route paths below are **not an RFC-T031 decision** — they are the pre-existing route map already referenced by name in committed tooling (`tools/playwright/pages.ts`), which RFC §7 explicitly declined to rename ("does not invent new route names beyond what that already-committed tooling names, and defers any renaming to whoever authors the routes themselves"). Reproduced here as the working specification, with provenance disclosed:

| Route | Group | Notes |
|---|---|---|
| `/login` | `(auth)` | FR1 |
| `/forgot-password` | `(auth)` | 3-step flow (request OTP → verify OTP → reset), per backend contract |
| `/dashboard` | `(dashboard)` | Dashboard home |
| `/organizations` | `(dashboard)` | Platform Admin only, gated by `isPlatformAdmin` (FR6), not a route group of its own |
| `/product`, `/customer`, `/inventory-adjustment`, `/warehouse`, `/supplier`, `/category`, `/brand`, `/purchase-order`, `/checkout`, `/purchase-report` | `(dashboard)` | Named in `tools/playwright/pages.ts`; **out of this SPEC's implementation scope** (business modules, RFC §3 Non-Goals) — listed here only so the route-group/middleware design accounts for their eventual existence. |

**[DISCLOSED GAP]**: no RFC-T031 evidence renames or re-confirms this list; if any route name changes during implementation, `tools/playwright/pages.ts` must be updated in the same change (RFC §7's own condition).

## 8. Layout Specification

`layouts/dashboard-shell.tsx` and `layouts/auth-shell.tsx` are named in RFC §6 as the page-shell composition points, wrapping `(dashboard)`/`(auth)` route-group children respectively. **[DISCLOSED GAP]**: no visual/component-level design (sidebar presence/width, topbar contents, breakpoint behavior) is specified anywhere in the discovery or RFC evidence base — this SPEC defines only the composition responsibility (shell reads Auth Store + Organization Context and renders children within them), not the visual design, which must be sourced separately before implementation.

## 9. Authentication Flow

(Traces to RFC §9, itself sourced from the Auth/Security Discovery's full backend-contract trace)

1. **Login (FR1):** submit `organizationSlug`/`email`/`password` to `POST /auth/login`. Response: access token in body, refresh token delivered only via `Set-Cookie` (`HttpOnly`, `Secure` in production, `SameSite=Lax`, path-scoped to the auth routes) — never in the WEB response body. Store the access token in the Auth Store (memory only, NFR2); decode its claims for immediate use.
2. **Session restoration (FR2):** on app load, if no in-memory access token exists, call `POST /auth/refresh` with credentials, no explicit token handling — the browser attaches the cookie. This call MUST go through the coordination layer (§9 below routes to §19), never called directly and independently per-tab.
3. **Ongoing use:** the Axios request interceptor attaches the current in-memory access token as a Bearer header to every request that needs one (FR9's normalization is the response-side counterpart).
4. **401 handling (FR3):** on any 401, request a coordinated refresh (§19); retry the original request once on success; on failure, treat as logged out (step 6).
5. **Refresh outcome:** success repopulates the Auth Store from the new access token and re-broadcasts it to other tabs (§19). **[DISCLOSED GAP, carried from RFC §9]**: the backend does not clear the refresh cookie on a failed refresh (only explicit logout does) — the frontend cannot use "cookie present" as a signal of anything; it must rely solely on the HTTP outcome of its own refresh attempt.
6. **Logout (FR4):** `POST /auth/logout` (current device) or `/auth/logout-all` (all devices); clear the Auth Store; broadcast a logout message (§19); redirect to `/login`.

## 10. Authorization Flow

(Traces to RFC §10)

- Permission checks (FR5) read `permissions[]` from the currently-decoded access token via a `usePermission(code)`-shaped hook. This hook has no network dependency and no server round-trip, matching the backend's own JWT-embedded permission-check design.
- Platform Admin checks (FR6) read `isPlatformAdmin` from the same decoded token.
- **Binding rule, non-negotiable per RFC §10/§12:** no authorization check performed in the frontend may ever be the sole gate for an action — every action's real enforcement is the corresponding backend endpoint's own guard, re-validated server-side on every request. This SPEC does not, and must not, introduce any client-side authorization logic that a backend endpoint doesn't already independently enforce.

## 11. Token Lifecycle

(Traces to RFC §9, Auth/Security Discovery's token.service.ts trace)

| State | Access token | Refresh token |
|---|---|---|
| Issued | Signed JWT, backend-configured expiry (`JWT_ACCESS_EXPIRES_IN`, default 15m — a backend-owned value, not frontend-configurable) | Opaque random value, backend-configured expiry (`JWT_REFRESH_EXPIRES_IN`, default 30d) |
| Active | Held in memory (Auth Store) only | Held only in the `HttpOnly` cookie, never touched by frontend JS |
| Used for refresh | Discarded, replaced by a new access token from the response | **Rotated** — the presented token is immediately revoked server-side and a brand-new one issued; the raw value changes on every use |
| Reused after rotation | N/A | Treated by the backend as theft — all sessions for that user are revoked (`revokeAllForUser`); this is the exact race condition §19/RFC §19 exists to prevent the frontend from ever triggering under normal multi-tab use |
| Expired | Discarded on next request's 401 | Refresh call fails; frontend treats as logged out (§9 step 6) |
| Explicit logout | Discarded client-side | Revoked server-side, cookie cleared server-side |

## 12. Cross-tab Session Coordination

(Traces to RFC §19, Cross-Tab Coordination Discovery's full option comparison)

**Primary mechanism:** `navigator.locks.request()` with a single, project-wide-unique lock name acquired before any `/auth/refresh` call. The lock holder performs the real HTTP call, then publishes the resulting access token via `BroadcastChannel` (a single, project-wide-unique channel name) before releasing the lock. Non-holder tabs awaiting the same lock check, upon acquisition, whether a fresh token has already arrived via broadcast and skip their own refresh call if so.

**Message types on the coordination channel:** token-updated (carries the new access token only — never the refresh token, which no tab ever possesses), logout, refresh-failed. Every tab subscribes on startup and reacts identically regardless of which tab originated the message.

**Fallback tier (NFR4):** if `navigator.locks`/`BroadcastChannel` are unavailable (feature-detected via `utils/browser-capability.ts`), degrade to a `localStorage`-based mutex (write holder ID + timestamp, re-read to confirm, `storage` event for cross-tab notification, staleness-timeout-based reclaim for crashed holders).

**Not implemented (RFC §19 "Not adopted"/"Deferred"):** `SharedWorker` coordination (permanent iOS Safari gap); backend refresh-rotation grace window (Option E) — deferred pending empirical confirmation via the required multi-tab test (§21 Test Checklist item), not implemented preemptively.

## 13. API Generation (Orval)

(Traces to RFC §11, §20)

- Source: `docs/api/openapi.json`, committed, produced by a standalone backend export script (backend-scope, separately authorized — not part of this SPEC's implementation list).
- Output: `frontend/src/generated/`, gitignored (not committed) — regenerated from the committed source on demand (`npm run generate:api`, matching the OpenAPI Export Discovery's proposed script naming).
- Generated calls route through the shared `services/api-client.ts` Axios instance, so FR9's error normalization applies uniformly.
- Multipart file-upload endpoints (the one confirmed precedent, `POST /suppliers/import`, correctly Swagger-annotated already) are expected to generate via Orval's standard `FormData` support — **[DISCLOSED GAP]**: this SPEC cannot confirm Orval's exact multipart output shape without generation actually being run; verify empirically once the export script and Orval config exist (§21 Test Checklist).
- **[DISCLOSED GAP]**: `SupplierImportSummary`'s undecorated-interface Swagger gap and the missing `@ApiCookieAuth()` metadata (RFC §20) are backend-scope recommendations, not implemented by this SPEC — until fixed, the generated client's method for that one endpoint will have an untyped/absent response type; this is expected, not a bug in the codegen step itself.

## 14. Query Layer

(Traces to RFC §12; RFC explicitly delegated key-convention detail to SPEC level — RFC §12: "left to SPEC-T031, not decided at the architecture level")

- Production `QueryClient` defaults are the already-existing, unchanged values in `providers/query-provider.tsx` (`staleTime: 30_000`, `refetchOnWindowFocus: false`, `retry: 1`) — this SPEC does not alter them.
- **[SPEC-LEVEL FILL]** Query-key convention: hierarchical array keys, most-general-to-most-specific (e.g., a resource-family segment followed by an operation/identifier segment followed by any filter/parameter object) — this is the standard, uncontroversial TanStack Query convention, not an RFC-evidenced decision; RFC §12 explicitly delegated this exact level of detail to SPEC.
- Test contexts use a fresh `QueryClient` per test with `retry: false`/`gcTime: 0` overrides (Testing & CI Discovery §7, referenced via RFC §22), never the production singleton.

## 15. Store Layer

(Traces to RFC §8, §13)

| Store | Holds | Traces to |
|---|---|---|
| Auth Store | Current access token (memory only), decoded claims (`permissions[]`, `isPlatformAdmin`, `organizationId`, etc.), authenticated flag, login/logout actions | RFC §9, §13 |
| UI Store | Sidebar collapsed/expanded state, transient UI flags not owned by URL or component-local state | RFC §13 |

Organization/settings data is **not** a Zustand store (§6 disclosed gap, §7 FR7) — it is a TanStack Query result (`GET /organizations/current`), consistent with it being server state, not client-only state (RFC §8's stated boundary rule).

## 16. Component Standards

(Traces to RFC §17)

- All new components use the shadcn CLI (`npx shadcn add <component>`), generated under `components/ui/`, following the project's configured `base-nova` style and `@base-ui/react` composition API (the `render` prop, not Radix's `asChild`) — binding for every future component, not a per-component choice.
- Cross-feature composite components (not generated by the CLI) live in `components/common/`; feature-specific components live under their own `features/<domain>/components/`.
- **[DISCLOSED GAP]**: no component-naming convention beyond "matches the shadcn CLI's own output naming" is specified — no discovery or RFC document proposed one.

## 17. UI Standards

(Traces to RFC §18)

- Design tokens: the existing, unmodified shadcn CSS-variable palette (`globals.css`, neutral `oklch` defaults, both light and dark modes already complete). **[DISCLOSED GAP]**: no project-specific brand palette is specified — RFC §18 found none proposed anywhere in the discovery evidence; do not invent brand colors during implementation.
- Icon library: `lucide-react` (already configured in `components.json`), continue using it for any new icon need.

## 18. Form Standards

(Traces to RFC §16)

- React Hook Form + `@hookform/resolvers`'s Zod resolver — both already installed, unused today; this SPEC establishes the library boundary only.
- Each form's Zod schema is co-located with the form component (standard RHF+Zod convention) — **[SPEC-LEVEL FILL]**, not an RFC-evidenced file-placement decision, but a direct, uncontroversial consequence of "co-located schema" being the dominant convention for this exact library pairing.
- shadcn's Form wrapper component (not yet added — §16 of the Foundation Audit found no forms exist yet to require it) is the expected integration point once the first real form is built.
- **[DISCLOSED GAP]**: no form-by-form design exists anywhere in the evidence base (RFC §"Open questions" explicitly named this) — this SPEC specifies the pattern, not any specific form's fields/validation.

## 19. Validation Standards

- Client-side validation schemas (Zod) should be derived from, or kept consistent with, the Orval-generated request DTO types where available (§13 API Generation) — this minimizes drift between what the backend's `class-validator` DTOs actually enforce and what the frontend validates before submission.
- **[DISCLOSED GAP]**: no automated mechanism for deriving Zod schemas from the OpenAPI/Orval output was evidenced anywhere (this would be a separate tool/convention, e.g. `orval`'s own Zod-generation mode or a manual-sync discipline) — not decided here; implementers must not assume automatic schema generation exists without separately confirming Orval's configuration supports it.

## 20. Error Handling Standards

(Traces to RFC §14)

- The Axios response interceptor is the single normalization point: on any non-2xx response matching the backend's `{success:false, code, message, errors, traceId, timestamp}` shape, unwrap to a consistent, typed error object before it reaches calling code (FR9). Calling code (components, hooks, TanStack Query `onError` callbacks) must never parse `error.response.data` directly.
- TanStack Query's `QueryCache`/`MutationCache` global `onError` hooks are the integration point for surfacing normalized errors to a Toast system — **[DISCLOSED GAP]**: no Toast component exists yet (Gap Analysis, Foundation Audit both confirmed absence); this SPEC specifies the integration point, not the Toast component's own design.
- Network-level failures (no response at all — offline, timeout) must be distinguished from backend-returned error envelopes in the same interceptor, surfaced distinctly (not coerced into the same `code`/`message` shape as a real backend error, since no such envelope was actually returned).

## 21. Loading Standards

(Traces to RFC §15)

- Route-level loading: Next.js App Router's native `loading.tsx` file convention, one per route segment that performs data-dependent rendering — not yet used anywhere (confirmed absent).
- Component-level loading: shadcn Skeleton primitives (not yet added) for in-place loading within an already-rendered page/shell.
- **Binding rule:** no custom loading-state system may be built that duplicates or conflicts with Next.js's own `loading.tsx` mechanism (RFC §15's flagged risk, carried from Gap Analysis §1.9).

## 22. Theme Standards

(Traces to RFC §18) `next-themes`, already fully wired and functional (`attribute="class"`, `defaultTheme="system"`, `enableSystem`) — kept exactly as-is, no changes specified.

## 23. Middleware Specification

(Traces to RFC §7)

- `middleware.ts` (does not exist yet) performs **UX-level routing only** — checks for the mere presence of the `refresh_token` cookie (server-side readable despite `HttpOnly`) to decide whether to redirect: absent + protected `(dashboard)` route → redirect to `/login`; present + `(auth)` route (e.g., already-logged-in user visiting `/login`) → redirect to `/dashboard`.
- **Binding rule, non-negotiable:** middleware performs no token validation, no permission check, and must never be treated as a security boundary — this is a structural fact (traced to `jwt-access.strategy.ts`'s per-request DB re-validation, RFC §7/§10), not a design preference that could be later "strengthened" into real enforcement at the middleware layer.
- **[DISCLOSED GAP]**: exact redirect-loop-prevention logic (e.g., avoiding a redirect cycle if both checks somehow fire) is not specified by any discovery or RFC document — a standard, uncontroversial implementation concern to handle during implementation, not a design decision requiring Architect input.

## 24. Environment Variables

| Variable | Status | Source |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Existing, unchanged | `.env.example`, already read by `lib/api.ts`/`services/api-client.ts` |
| `NEXT_PUBLIC_WS_URL` | Existing, unchanged | `.env.example` |

**No new environment variable is required by this SPEC's scope.** The OpenAPI document is consumed as a committed file path (§13), not an environment-configured URL; cross-tab coordination (§12) uses no environment configuration. If implementation reveals a genuine need for a new variable, it must be disclosed and added to `.env.example` at that time, not silently introduced.

## 25. Testing Specification

(Traces to RFC §22)

- Framework: Vitest + React Testing Library + `jsdom` + MSW (RFC §30 D-confirmed).
- Unit tests: pure functions (`utils/`), no DOM required.
- Component tests: RTL + `jsdom`, `@testing-library/jest-dom` matchers, `@testing-library/user-event` for interaction simulation.
- Hook/store tests: RTL's `renderHook` for React hooks; direct import + assertion for Zustand stores (no React rendering needed).
- API-client tests: MSW request handlers, never real network calls.
- Accessibility tests: `vitest-axe` (matching the Vitest choice) — see NFR7's disclosed conformance-level gap.
- Playwright E2E: `@playwright/test` (new dependency, not yet installed), reusing `tools/playwright/lib/screenshot.ts`'s `DEFAULT_BASE_URL` convention (RFC §30 D13) — kept in a directory separate from `tools/playwright/`'s existing screenshot scripts (RFC §30 D15, permanently separate purposes).
- Coverage: no enforced threshold in the Foundation phase (RFC §30 D12) — see §26 CI Specification for how this is *not* gated, not merely unenforced by oversight.

## 26. CI Specification

(Traces to RFC §21)

- Extend the existing `changes` → gated-job → `Backend`/`Frontend` aggregator pattern (already proven, T030.14B) — no new CI pattern is introduced.
- New `test` job: added to `frontend-ci.yml` at the same time the first real test file exists (RFC §30 D14) — not pre-provisioned as an empty/trivially-passing job ahead of that.
- New OpenAPI/Orval drift-check jobs (backend + frontend sides): dedicated jobs, not folded into existing `ci` steps (RFC §30 D10) — depends on the backend export script and `docs/api/openapi.json` existing first (§13, backend-scope, separately authorized).
- No change to the `Backend`/`Frontend` required-check ruleset itself is needed — new jobs compose as additional gated steps feeding the existing aggregators.

## 27. Performance Requirements

See NFR6 — **[DISCLOSED GAP]**, no numeric budget specified anywhere in the evidence base. This SPEC requires only that the already-made Turbopack choice (dev + build) is not reverted, and that no new dependency is added without considering its bundle-size impact — a general engineering discipline, not a measurable acceptance criterion.

## 28. Accessibility Requirements

See NFR7 — **[DISCLOSED GAP]**, no conformance level specified. This SPEC requires only that `vitest-axe`-based automated checks exist and run in the test suite (§25) — the specific pass/fail bar those checks enforce is not defined here and must be escalated to the Architect before being treated as a hard gate.

## 29. Security Requirements

(Traces to RFC §24)

- SR1: Access token never persisted to `localStorage`/`sessionStorage` (NFR2).
- SR2: Refresh token never accessed by frontend JS under any circumstance (NFR3, browser-enforced).
- SR3: No JWT claim is treated as a final authorization decision anywhere in frontend code — every claim is a UX hint only, re-validated by the corresponding backend endpoint on every real request (§10 binding rule).
- SR4: `SameSite=Lax` is accepted as the sole CSRF defense for this phase (RFC §30 D16) — no additional CSRF-token implementation is in this SPEC's scope.
- SR5: Cross-tab coordination (§12) never transmits the refresh token between tabs, by construction (it is never in a tab's possession to transmit).
- SR6: Backend follow-ups this SPEC's implementation depends on being requested separately, not performed here: `isPlatformAdmin` added to `UserInfoDto` (priority, per RFC §24) is required before FR6 can be implemented without a JWT-decode workaround; the cookie-not-cleared-on-failed-refresh and missing `auth.e2e-spec.ts` gaps do not block implementation but should be tracked.

## 30. File-by-file Implementation List

(Traces to RFC §6, §27 Migration Plan, §28 Milestones — reproduced as a definitive inventory, status per Foundation Audit's classification where applicable)

| File | Status | Purpose |
|---|---|---|
| `package.json` | Modify | Add `typecheck`/`test`/`format`/lint-staged scripts (Foundation Audit) |
| `.husky/pre-commit` | New | Wire lint-staged into the existing Husky setup |
| `README.md` | Modify | Replace boilerplate with a pointer to `docs/setup/DEVELOPMENT-SETUP.md` (RFC §30 D03) |
| `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | Remove | Confirmed unreferenced (Foundation Audit) |
| `src/lib/api.ts` | Remove (superseded) | Content migrates into `services/api-client.ts` |
| `src/services/api-client.ts` | New | Axios instance + request/response interceptors (§20 Error Handling) |
| `src/services/auth-coordination.ts` | New | Web Locks + BroadcastChannel + localStorage-fallback logic (§12) |
| `src/stores/auth-store.ts` | New | §15 |
| `src/stores/ui-store.ts` | New | §15 |
| `src/hooks/use-permission.ts` | New | §10 |
| `src/hooks/use-current-organization.ts` | New | §4 FR7 |
| `src/hooks/use-session-restore.ts` | New | §9 step 2 |
| `src/utils/decode-jwt.ts` | New | UX-only decode, no verification (§10) |
| `src/utils/browser-capability.ts` | New | Feature detection for §12's tiering |
| `src/providers/index.tsx` | Modify | Add an Auth provider to the existing composition chain |
| `src/middleware.ts` | New | §23 |
| `src/layouts/dashboard-shell.tsx` | New | §8 |
| `src/layouts/auth-shell.tsx` | New | §8 |
| `src/app/(auth)/login/page.tsx` | New | FR1 |
| `src/app/(auth)/forgot-password/page.tsx` | New | 3-step OTP flow |
| `src/app/(dashboard)/layout.tsx` | New | Composes `dashboard-shell.tsx` |
| `src/app/(dashboard)/page.tsx` | New | Dashboard home (placeholder content, no business module) |
| `src/app/page.tsx` | Modify | Replace placeholder content (Foundation Audit REPLACE classification) |
| `frontend/orval.config.ts` | New | §13 |
| `frontend/src/generated/` | New, gitignored | Orval output |
| `.github/workflows/frontend-ci.yml` | Modify | Add `test` job (§26), timed per RFC §30 D14 |
| `docs/api/openapi.json` | New (backend-scope, separate authorization) | §13 source |
| `backend/scripts/export-openapi.ts` | New (backend-scope, separate authorization) | Produces `docs/api/openapi.json` |
| `.github/workflows/backend-ci.yml` | Modify (backend-scope, separate authorization) | OpenAPI drift-check job |

**[DISCLOSED GAP]**: Toast, Error Boundary, and Skeleton components (§20, §21) are required by this SPEC's error/loading standards but have no dedicated file entries here — their exact file paths depend on which specific shadcn primitives are added via CLI during implementation, not predetermined by any discovery evidence.

## 31. Acceptance Criteria

Each criterion below maps to one or more Functional/Non-functional Requirements (§4/§5):

- AC1 (FR1): Submitting valid credentials on `/login` results in an authenticated state; submitting invalid credentials shows the normalized backend error message (FR9) without a page crash.
- AC2 (FR2): Reloading the app while a valid session cookie exists restores the authenticated state without requiring the user to re-enter credentials.
- AC3 (FR3): A simulated 401 on any authenticated call results in exactly one refresh attempt and a successful retry, observable via network-call assertions in a test.
- AC4 (FR4): Logging out clears the Auth Store and redirects to `/login`; a second, already-open tab reflects the logged-out state without requiring its own failed API call to discover it.
- AC5 (FR5/FR6, SR3): A component wrapped in a permission/Platform-Admin guard does not render its protected content when the corresponding claim is absent from the current token — and the underlying API call it would have made is independently confirmed (via a direct call, bypassing the UI) to still be rejected server-side.
- AC6 (FR10): The required multi-tab Playwright test (§32) passes: exactly one real `/auth/refresh` call across N simulated tabs, zero `revokeAllForUser` triggers.
- AC7 (FR8/FR9): No component or hook in the implemented code parses `error.response.data` directly, or calls `axios`/`fetch` outside the shared `services/api-client.ts` instance for any endpoint with a generated Orval counterpart.
- AC8 (NFR2/SR1): A static/code-review check confirms no `localStorage.setItem`/`sessionStorage.setItem` call anywhere stores a value resembling an access token.

## 32. Test Checklist

- [ ] Unit: `utils/decode-jwt.ts` correctly decodes a well-formed JWT payload without verifying signature.
- [ ] Unit: `browser-capability.ts` correctly detects presence/absence of `navigator.locks`/`BroadcastChannel`.
- [ ] Component: `theme-toggle.tsx` (existing) continues passing after any provider composition change.
- [ ] Component: any new Toast/Skeleton/Error Boundary primitive renders correctly in both light and dark mode.
- [ ] Hook: `use-permission.ts` returns the correct boolean for a mocked token with/without the target permission code.
- [ ] Store: `auth-store.ts` correctly clears all fields on a logout action.
- [ ] API client: MSW-mocked 401 triggers exactly one coordinated refresh call, not one per failed request (AC3).
- [ ] **Playwright E2E (required, not optional — RFC §19/§22, Cross-Tab Discovery §Q8):** N simulated tabs of the same authenticated user restore session near-simultaneously → exactly one real `/auth/refresh` request reaches the backend, all N tabs end authenticated, and a direct DB check confirms `revokeAllForUser` was never triggered (AC6).
- [ ] Playwright E2E: logout in one tab propagates to a second open tab without that tab making its own failing API call first.
- [ ] Accessibility: `vitest-axe` runs against every new component with zero violations at whatever conformance bar is set (NFR7 — bar itself is a disclosed gap, the *check running at all* is not).
- [ ] CI: a deliberately stale `openapi.json` (backend changed, file not regenerated) fails the drift-check job (§26).

## 33. Rollback Strategy

All work specified here is additive to a frontend that has **no production deployment yet** (RFC §25, Gap Analysis §H — deployment packaging is explicitly out of scope and does not exist) — there is no live, deployed system this work could take down. The overwhelming majority of files in §30 are **new** files with no existing consumers (matching the Foundation Audit's own finding that `lib/api.ts` and everything downstream of it currently has zero callers). Rollback for any implementation PR is therefore a standard `git revert` of that PR — no data migration, no backward-compatibility shim, and no phased rollback plan is warranted by the actual risk profile this evidence base supports. The only files modified in place (`package.json`, `providers/index.tsx`, `app/page.tsx`, `frontend-ci.yml`) are all low-risk, additive-in-nature changes (new scripts, a new provider in an existing composition chain, replaced placeholder content, a new CI job) — none of them removes or alters existing, working behavior in a way a plain revert wouldn't cleanly undo.

---

## Traceability Matrix (SPEC → RFC)

| SPEC section | RFC-T031 section(s) |
|---|---|
| §1–3 Scope/Goals/Non-Goals | RFC §1–3 |
| §4 Functional Requirements | RFC §9, §10, §11, §13, §14, §19 |
| §5 Non-functional Requirements | RFC §4, §9, §17, §19, §23, §24, §28 (disclosed gaps) |
| §6 Folder Structure | RFC §6 |
| §7 Routing Specification | RFC §7 |
| §8 Layout Specification | RFC §6 |
| §9 Authentication Flow | RFC §9 |
| §10 Authorization Flow | RFC §10 |
| §11 Token Lifecycle | RFC §9 |
| §12 Cross-tab Session Coordination | RFC §19 |
| §13 API Generation | RFC §11, §20 |
| §14 Query Layer | RFC §12 |
| §15 Store Layer | RFC §8, §13 |
| §16 Component Standards | RFC §17 |
| §17 UI Standards | RFC §18 |
| §18 Form Standards | RFC §16 |
| §19 Validation Standards | RFC §16 (disclosed extension) |
| §20 Error Handling Standards | RFC §14 |
| §21 Loading Standards | RFC §15 |
| §22 Theme Standards | RFC §18 |
| §23 Middleware Specification | RFC §7 |
| §24 Environment Variables | RFC §4 (Current State, existing vars) |
| §25 Testing Specification | RFC §22 |
| §26 CI Specification | RFC §21 |
| §27 Performance Requirements | RFC §23 (disclosed gap) |
| §28 Accessibility Requirements | RFC §22 (disclosed gap) |
| §29 Security Requirements | RFC §24 |
| §30 File-by-file List | RFC §6, §27, §28 |
| §31 Acceptance Criteria | Derived from §4/§5 |
| §32 Test Checklist | RFC §19, §22, §26 |
| §33 Rollback Strategy | RFC §25, §3 (Non-Goals) |

## File Inventory

See §30 in full — 26 file entries (18 new frontend, 3 modified frontend, 2 removed-and-superseded, 3 backend/CI-scope items requiring separate authorization, not implemented by this SPEC).

## Acceptance Checklist

See §31 (8 criteria, AC1–AC8) and §32 (11 test-checklist items) in full.

---

*This SPEC was authored by Claude under the same disclosed, scoped Architect exception recorded in RFC-T031's own closing note (T031.02/T031.03), not a new or independent exception. It does not itself constitute implementation authorization — per the T031.03 authorization, implementation remains forbidden pending further Architect review.*

# T031.01 — Frontend Foundation Discovery Report

**Status:** Discovery / Research only. Not an RFC, not a SPEC.
**Authority:** Architect authorization "T031.01 — Frontend Foundation," narrowed to Discovery/Research per Architect Decision (CLAUDE.md / PROJECT_RULES.md, Decision G01–G06 — RFC/SPEC authorship stays with the Architect, no exception granted for this package).
**Baseline commit surveyed:** `main` @ `baaaa683e15866ce6343eab3e7368b02f28a8b05` (post T030.14B).
**Output only:** this document. No source code written, no dependencies installed, no files created outside `docs/discovery/`.

---

## 1. Purpose

Survey the current Backend API contract and the current Frontend directory as they actually exist on `main` today, and propose (not decide) an architecture, folder structure, state management approach, routing strategy, API-generation strategy, risk analysis, implementation plan, and dependency graph — as raw material for the Architect to author RFC-T031 / SPEC-T031. Nothing in this document is authoritative; it is evidence and proposals only.

---

## 2. Backend API Survey

### 2.1 Response envelope and error contract (global, every endpoint)

Applied via `APP_INTERCEPTOR`/`APP_FILTER` in `backend/src/app.module.ts` — not opt-in per controller.

Success:
```json
{ "success": true, "data": <T>, "meta": object | null, "traceId": string | null, "timestamp": "ISO8601" }
```

Error (`backend/src/common/swagger/error-response.dto.ts`):
```json
{ "success": false, "code": "AUTH_001", "message": "...", "errors": [], "traceId": "...", "timestamp": "ISO8601" }
```

**Implication for Frontend:** every Axios/Orval response must be unwrapped at `data.data`, and every error path must be normalized from `error.response.data` (`code`/`message`/`errors`), not from Axios's own `error.message`. This is a single, global shape — a single Axios response/error interceptor pair is sufficient; no per-endpoint variation.

### 2.2 OpenAPI / Swagger status

`backend/src/main.ts`: `SwaggerModule.createDocument()` + `SwaggerModule.setup()` run **at runtime only**, gated by `SWAGGER_ENABLED` (default `true`, must be explicitly `false` in production per `env.validation.ts`). This means:

- **No `openapi.json`/`openapi.yaml` is committed anywhere in the repo.** Confirmed via full-tree search.
- NestJS's `SwaggerModule.setup(path, ...)` automatically also exposes `GET {path}-json` (e.g. `/api/docs-json`) when the app is running — this is the only current way to obtain the spec.
- `backend/package.json` has **no script** to export the OpenAPI document to a file (no `generate:openapi`, no standalone document-generation script).

**Implication:** Orval (the requested API-generation tool) needs a real OpenAPI document to read. Today that requires either (a) running the backend and fetching `/api/docs-json`, or (b) adding a small standalone script to `backend/` that boots just enough of Nest to call `SwaggerModule.createDocument()` and write it to a file, independent of a live server. Neither exists yet — this is a genuine open item, not a "just run orval" situation.

### 2.3 Auth API (`backend/src/modules/auth/presentation/auth.controller.ts`)

| Method | Path | Guard | Notes |
|---|---|---|---|
| POST | `/auth/login` | none (public) | Throttled 5/60s. Body: `{ organizationSlug, email, password, deviceName? }` — **slug required**, email is only unique per-organization, not globally. |
| POST | `/auth/refresh` | none (public) | Throttled 20/60s. |
| POST | `/auth/logout` | `JwtAuthGuard` | Revokes one session. |
| POST | `/auth/logout-all` | `JwtAuthGuard` | Revokes all sessions. |
| GET | `/auth/sessions` | `JwtAuthGuard` | Active-session list. |
| DELETE | `/auth/sessions/:id` | `JwtAuthGuard` | Revoke one device's session. |
| POST | `/auth/forgot-password` | none | OTP request. |
| POST | `/auth/verify-otp` | none | OTP verification. |
| POST | `/auth/reset-password` | none | Final step. |

**Critical, non-obvious contract detail — client-type-dependent token delivery:**
- Detected via request header `X-Client-Type` (`mobile` → MOBILE, anything else/absent → WEB).
- **WEB:** access token in JSON response body; refresh token delivered **only** as an `HttpOnly` cookie (`refresh_token`, path `/api/v1/auth`, `sameSite: lax`, `secure` in production). The refresh token is **never** present in the WEB JSON body. `/auth/refresh` for WEB reads the cookie automatically — the browser sends it, no explicit JS access needed or possible (`HttpOnly`).
- **MOBILE:** both tokens are in the JSON body; no cookie is set.
- This frontend is a **web app** → refresh token is never visible to frontend JS by design. Any "auto refresh" implementation must call `POST /auth/refresh` with an **empty or omitted body** and rely on `withCredentials: true` (cookies sent automatically) — it must NOT attempt to read/store a refresh token client-side.

`LoginResponseDto` (`login-response.dto.ts`):
```typescript
{
  accessToken: string;
  refreshToken?: string;       // MOBILE only
  userInfo: {
    id: string; email: string; username: string;
    organizationId: string; branchId: string | null;
    permissions: string[];
  };
}
```

**Gap found (disclosed, not fixed — out of Discovery scope):** `UserInfoDto` does **not** include `isPlatformAdmin`, even though the JWT access-token payload itself does (`JwtAccessPayload`, `backend/src/common/types/jwt-payload.type.ts`: `{ sub, organizationId, branchId, email, permissions, permissionVersion, isPlatformAdmin }`). A frontend that needs to know "is this user a Platform Admin" at login time (before any JWT decode) cannot get it from `userInfo` — it must decode the JWT itself (a plain base64 JSON payload, no verification needed client-side since it's only for UI branching, not security) or the backend gap needs closing. Flagging for the Architect; not something Discovery should silently work around.

**No "get current user" endpoint exists.** The only way to (re)obtain user identity after initial login is: (a) what was returned at login/refresh time, or (b) decoding the current access token client-side. There is a `GET /organizations/current` (see §2.5) but it returns the **Organization**, not the User.

### 2.4 Permission / RBAC API (`backend/src/modules/rbac/presentation/`)

| Method | Path | Guard | Permission required |
|---|---|---|---|
| GET | `/permissions` | `JwtAuthGuard, PermissionsGuard` | `permission:view` |
| GET | `/roles` | same | `role:view` |
| GET | `/roles/:id` | same | `role:view` |
| POST | `/roles` | same | `role:create` |
| POST | `/roles/:id/permissions` | same | `role:update` |
| POST | `/roles/assign` | same | `user:update` |

Permission enforcement mechanism (`backend/src/modules/rbac/presentation/permissions.guard.ts`): the JWT's `permissions: string[]` claim is checked directly against `@RequirePermissions(...)` metadata — **no server round-trip per check**, the full permission set is already inside the access token issued at login. This means a frontend "Permission Guard" (route-level or component-level) can be implemented purely client-side by decoding the current access token's `permissions` array — consistent with how the backend itself checks (same source of truth, no separate "can I do X" endpoint exists or is needed).

`permissionVersion` in the JWT exists specifically to force re-login when a user's permissions change server-side mid-session (referenced in code comments across the session; not exposed as its own endpoint — the mechanism is: old tokens with a stale `permissionVersion` get rejected, forcing a fresh login/refresh).

### 2.5 Organization API (`backend/src/modules/organization/presentation/organization.controller.ts`)

| Method | Path | Guard | Notes |
|---|---|---|---|
| POST | `/organizations` | `PlatformAdminGuard` | Platform Admin only — create org + owner atomically. |
| GET | `/organizations` | `PlatformAdminGuard` | Platform Admin only — list all orgs. |
| GET | `/organizations/current` | `PlatformAdminOrPermissionsGuard` (`organization:view`) | Returns the **caller's own** organization (resolved server-side from JWT `organizationId`, not a path param). |
| GET | `/organizations/:id` | same | Any specific org — Platform Admin can view any; tenant users only their own (`organization:view` + Organization Context check). |
| PATCH | `/organizations/:id` | same (`organization:update`) | |
| POST | `/organizations/:id/archive` | same (`organization:archive`) | Two-step confirm (`confirmSlug` body field must match). |
| POST | `/organizations/:id/transfer-owner` | same (`organization:transfer-owner`) | |

`OrganizationDetailResponseDto` includes nested `settings` (currency, decimals, default warehouse/branch, language) and `subscription` (plan, status, limits) objects — this is the natural source for an "Organization Context" (tenant-level settings/branding/limits) the frontend can cache globally alongside the Auth context.

**Isolated finding, not a Frontend concern but relevant context:** the `Backend`/`Frontend` distinction inside `PlatformAdminOrPermissionsGuard` (T030.12O/P) means Platform Admin is architecturally a **separate actor type** from any tenant Role — a frontend "admin console" (org creation/listing) is a genuinely distinct surface from the tenant-facing app, not just a permission-gated screen within it.

---

## 3. Existing Frontend Audit

`frontend/` on `main` is **not** a blank scaffold — a partial foundation already exists. Accurate current-state inventory:

**Already present and working:**
- Next.js `15.5.20` (App Router), React `19.1.0`, TypeScript with `"strict": true` already enabled in `tsconfig.json`.
- Path alias `@/*` → `./src/*` already configured.
- TailwindCSS v4, shadcn/ui already initialized (`components.json`: style `base-nova`, RSC on, lucide icons) — 2 components exist (`button.tsx`, `dropdown-menu.tsx`).
- `next-themes` wired (`ThemeProvider`, `theme-toggle.tsx`) — dark mode already functional.
- `@tanstack/react-query` `QueryProvider` already wired with sane defaults (`staleTime: 30s`, no refetch-on-focus, 1 retry).
- `axios`, `react-hook-form` + `@hookform/resolvers`, `zod`, `zustand` — all **already installed** as dependencies, but **not yet used anywhere** (no forms, no stores, no schemas exist yet).
- `src/lib/api.ts`: a bare Axios instance (`baseURL` from `NEXT_PUBLIC_API_URL`, `withCredentials: true` — already correctly anticipating the cookie-based refresh flow) with a response interceptor that is an explicit **stub** — its own comment says error normalization and refresh/401 handling are deferred to "Prompt Authentication (011+)," i.e., exactly the work this T031 sequence is now reaching.
- `.env.example`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` already defined.
- Root-level Husky (`prepare: husky`) and commitlint already active repo-wide (this is the same `commit-msg` hook every backend commit in this whole engagement has gone through).
- `frontend-ci.yml` (as of T030.14B): lint (`eslint .`) + typecheck (`tsc --noEmit`) + build, real check-runs, no path-filter gap.

**Confirmed missing (real gaps, not oversights to silently fill):**
- **Orval**: not installed, no config, no `generated/` directory, no OpenAPI document to read from (§2.2).
- **lint-staged**: not present anywhere (root or frontend `package.json`) — Husky exists but nothing runs it against staged files pre-commit; only commit-message linting is active today.
- No `test` script, no test runner (Jest/Vitest/Playwright component testing) configured for `frontend/`.
- No `hooks/`, `stores/`, `features/`, `services/`, `layouts/`, `types/`, `utils/` (beyond the one `lib/utils.ts` shadcn helper), or `config/` directories yet — only `app/`, `components/ui/`, `lib/`, `providers/` exist.
- No Toast/notification system, no Loading/Skeleton primitives, no Error Boundary component.
- No auth logic of any kind (no login page, no token storage, no auto-refresh, no permission guard, no route protection/middleware).
- No Zustand store files despite the dependency being installed.

---

## 4. Proposed Technology Stack — validated against current reality

| Requested | Status | Note |
|---|---|---|
| React 19 | ✅ already `19.1.0` | |
| Next.js 15 | ✅ already `15.5.20`, App Router | |
| TypeScript strict | ✅ already `strict: true` | |
| TailwindCSS | ✅ already v4 | |
| shadcn/ui | ✅ already initialized | only 2 primitives exist so far |
| TanStack Query | ✅ already wired | |
| React Hook Form | ✅ installed, unused | |
| Zod | ✅ installed, unused | |
| Axios | ✅ installed, stubbed | |
| Orval | ❌ not installed | needs an OpenAPI source first (§2.2) |
| Zustand | ✅ installed, unused | |
| ESLint | ✅ `next/core-web-vitals` + `next/typescript` + `prettier` | |
| Prettier | ✅ `.prettierrc` present | |
| Husky | ✅ active at repo root | |
| lint-staged | ❌ not installed | |

No stack substitutions are proposed — the requested stack matches what's already partially in place. The remaining work is genuinely additive (Orval, lint-staged, auth, state, structure), not a rebuild.

---

## 5. Proposed Architecture (feature-based, layered)

Given the backend's own Clean Architecture convention (domain/application/infrastructure/presentation per module) has proven durable across 20+ modules in this project, the natural frontend analogue — without forcing an inappropriate 1:1 mapping onto a fundamentally different runtime (React components + hooks, not services/repositories) — is a **feature-based** structure with a thin, explicit **shared/platform layer**:

- **`app/`** (Next.js App Router): routing shell only — layouts, route groups, `page.tsx` files that compose feature components. No business logic lives here directly.
- **`features/<domain>/`**: one folder per backend module-ish concern (`auth`, `organization`, and later real business features) — each containing its own components, hooks, and API-call wrappers for that domain. Mirrors the backend's per-module boundary without copying its internal layering.
- **`services/`**: the Orval-generated API client's hand-written wrapper layer (if any is needed beyond raw generated hooks) plus the shared Axios instance/interceptors.
- **`stores/`**: Zustand global stores (Auth, Setting, UI — §7).
- **`hooks/`**: cross-feature reusable hooks (e.g., `usePermission`, `useCurrentOrganization`) that read from stores/generated queries.
- **`providers/`**: already exists — root composition of context providers (Theme, Query, and later Auth).
- **`layouts/`**: shared page shells (dashboard shell with sidebar/topbar, auth-page shell) — currently absent.
- **`components/`**: `ui/` (shadcn primitives, already started) + genuinely cross-feature composite components (not feature-specific).
- **`types/`**: hand-written types that aren't Orval-generated (e.g., UI-only types).
- **`utils/`**: pure helpers (already has `utils.ts` from shadcn's `cn()`).
- **`config/`**: environment/constants access (currently only inline `process.env` reads in `lib/api.ts`).
- **`generated/`**: Orval output — untouched by hand, regenerated from the OpenAPI document.

This keeps `app/` as routing-only (matching Next.js App Router's own intended usage) and pushes all real logic into `features/`/`services/`/`stores/`/`hooks/`, which is what makes the App Router's file-system routing tractable at this project's scale.

---

## 6. Proposed Folder Structure

```
frontend/src/
  app/
    (auth)/
      login/page.tsx
      forgot-password/page.tsx
    (dashboard)/
      layout.tsx              # dashboard shell (sidebar/topbar), reads Auth/Org context
      page.tsx                # dashboard home
      organizations/          # Platform Admin surface (guarded)
    layout.tsx                 # root layout (exists)
    globals.css                 # exists
  components/
    ui/                        # shadcn primitives (2 exist: button, dropdown-menu)
    common/                     # cross-feature composites (Toast host, ErrorBoundary, Loading/Skeleton)
  features/
    auth/
      components/               # LoginForm, etc.
      hooks/                    # useLogin, useLogout, useAutoRefresh
    organization/
      components/
      hooks/
  hooks/
    use-permission.ts
    use-current-organization.ts
  services/
    api-client.ts                # Axios instance + interceptors (evolves from lib/api.ts)
    query-client-config.ts        # extracted from providers/query-provider.tsx if it grows
  stores/
    auth-store.ts
    settings-store.ts
    ui-store.ts
  providers/                     # exists: index.tsx, query-provider.tsx, theme-provider.tsx
  layouts/
    dashboard-shell.tsx
    auth-shell.tsx
  types/
  utils/                          # exists: utils.ts
  config/
    env.ts                        # typed wrapper over process.env.NEXT_PUBLIC_*
  generated/                       # Orval output, gitignored or committed — Architect decision
  styles/                          # only if globals.css needs splitting; not clearly needed yet
```

Deviates from the authorization's example list only by adding `layouts/` alongside `app/` (Next.js App Router layouts and reusable non-route shell components are different things) and folding `config/` in as a thin env-typing layer rather than a large configuration system — both flagged here for the Architect to accept, adjust, or reject in the real SPEC.

---

## 7. State Management Proposal

Two genuinely different kinds of state, kept deliberately separate (not conflated into one store, which is a common anti-pattern):

- **TanStack Query** — all server state: anything that comes from an API call (organization data, future business-module data). Already wired.
- **Zustand** — client-only state that isn't naturally a query result:
  - **Auth Store**: current access token (in-memory, not localStorage — see §10 risk), decoded `userInfo`/JWT claims (`permissions`, `isPlatformAdmin`, `organizationId`), authenticated flag, login/logout actions.
  - **Settings Store**: the current organization's `settings`/`subscription` payload (from `GET /organizations/current`) cached client-side — could arguably be a TanStack Query result instead (it IS server data); proposing it as a thin Zustand mirror only if synchronous, non-async access is needed in many places (e.g., permission checks during render) — otherwise this should just be a Query, not a store. **Open question for SPEC**, not resolved here.
  - **UI Store**: sidebar collapsed/expanded, active theme override beyond next-themes' own persistence if needed, transient UI flags that don't belong in URL state or component state.

---

## 8. Routing Strategy

Next.js App Router, route groups to separate concerns without affecting URL structure:
- `(auth)` — unauthenticated pages (login, forgot-password/verify-otp/reset-password as a 3-step flow matching §2.3).
- `(dashboard)` — authenticated shell, protected via `middleware.ts` (Next.js Edge Middleware) checking for a valid session indicator before rendering, plus a client-side redirect fallback for the access-token-in-memory case (Edge Middleware can't read an in-memory JS variable — it can only see cookies; since the refresh token is `HttpOnly` and the access token is memory-only, middleware-level protection needs its own design decision — flagged as a genuine open question for SPEC, not assumed away here).

Platform Admin routes (`/organizations`, org creation/listing) are a structurally separate surface (§2.5) — proposing they live under their own route segment (e.g., `(dashboard)/organizations`) gated by an `isPlatformAdmin` check, not a regular permission string (since Platform Admin bypasses the permission system entirely per backend design).

---

## 9. API Generation Strategy

Proposed Orval flow (once the OpenAPI-export gap in §2.2 is closed):
1. Add a backend-side script (e.g. `backend/scripts/export-openapi.ts` or similar) that produces `SwaggerModule.createDocument()`'s output to a JSON file **without** requiring a running server/DB/Redis (pure Nest app construction — should be fast and CI-friendly). This is backend work, out of this Discovery's frontend-only scope, but is a hard prerequisite — flagged clearly.
2. `orval.config.ts` in `frontend/` pointing at that generated JSON (local file path, not a live URL — avoids needing the backend running during `frontend` CI/dev codegen).
3. Orval's Axios + TanStack Query mode generates typed hooks directly into `generated/`, using the shared `services/api-client.ts` Axios instance (so the global error/response-envelope handling in §2.1 applies uniformly to generated calls too).
4. A `generate:api` npm script in `frontend/package.json`; whether it runs in CI as a drift-check (fail if generated output differs from committed output) is a SPEC-level decision, not decided here.

---

## 10. Authentication & Authorization Design (mapped to the real contract in §2.3/§2.4)

- **Access Token**: held in memory only (a Zustand store field, not `localStorage`/`sessionStorage`) — avoids XSS-exfiltration risk of persistent storage; accepted tradeoff is it's lost on hard refresh, requiring...
- **Refresh Token**: never touched by frontend JS at all (WEB client, `HttpOnly` cookie, §2.3) — this actually simplifies frontend security posture versus a naive "store both tokens" design.
- **Auto Refresh**: on hard page load (or access-token-store empty + a protected route is hit), call `POST /auth/refresh` with `withCredentials: true` and an empty body — the browser sends the `HttpOnly` cookie automatically; on success, populate the Auth store from the response. On 401 here, treat as logged out.
- Additionally, an Axios response interceptor should catch a 401 on **any** authenticated call, attempt exactly one silent `/auth/refresh`, retry the original request once, and only redirect to login if that also fails (standard token-refresh-interceptor pattern) — needs care to avoid a refresh stampede if multiple requests 401 simultaneously (a shared in-flight-refresh promise, not a new refresh call per failed request).
- **Logout**: call `POST /auth/logout` (or `/logout-all`), then clear the Auth store; the backend already clears the cookie server-side on WEB logout (`auth.controller.ts`'s `deliver`/`logout` methods).
- **Permission Guard**: purely client-side, reading the decoded access token's `permissions[]` (§2.4) — a `usePermission(code)` hook and/or a `<PermissionGuard>` wrapper component/HOC for route- and component-level gating. No new backend endpoint needed.
- **Organization Context**: populate from `GET /organizations/current` after login (or from JWT `organizationId` + a Query for the full org object) — feeds the Settings Store question in §7.

---

## 11. Setup Areas — status against the authorization's list

| Area | Status |
|---|---|
| Path Alias | ✅ done |
| Environment | ✅ done (`.env.example` exists; a typed `config/env.ts` wrapper is proposed but not required) |
| Axios | ⚠️ partial — instance exists, interceptors are stubs |
| TanStack Query | ✅ done |
| Theme | ✅ done |
| Dark Mode | ✅ done |
| Toast | ❌ not started |
| Loading | ❌ not started |
| Error Boundary | ❌ not started |

---

## 12. Risk Analysis

| Risk | Severity | Note |
|---|---|---|
| No OpenAPI export mechanism exists | High | Blocks Orval entirely until a backend-side script is added — cross-cuts into backend scope, needs its own authorization. |
| Access-token-in-memory means auth state is lost on hard refresh | Medium | Mitigated by the auto-refresh-on-load flow (§10), but adds a brief "checking session" loading state on every hard navigation — UX design decision for SPEC. |
| `UserInfoDto` missing `isPlatformAdmin` (§2.3) | Medium | Frontend must decode the JWT itself for this one field, or the backend DTO needs a follow-up fix — flagged, not fixed here (out of Frontend Discovery scope). |
| Edge Middleware route protection can't see an in-memory access token | Medium | Middleware-level protection (fastest, avoids content flash) is fundamentally limited to what's in cookies; the refresh-token cookie is `HttpOnly` (unreadable, but its mere *presence* could still gate middleware) — needs an explicit SPEC decision on which layer owns route protection. |
| No test runner configured for frontend | Medium | Explicitly out of this Discovery's requested scope (auth/permission/org APIs, not testing strategy), but worth the Architect's attention before real feature work starts. |
| `generated/` committed vs. gitignored | Low | Either is workable; affects whether CI needs a drift-check step (mirrors the backend's own OpenAPI-drift consideration once it exists). |
| lint-staged absent | Low | Husky already runs `commit-msg`; adding a `pre-commit` hook + lint-staged is small, low-risk, purely additive. |

---

## 13. Dependency Graph (what must happen before what)

```
Backend: OpenAPI export script (new, backend-scope)
        │
        ▼
Frontend: Orval config + generated/ client
        │
        ├──► services/api-client.ts (Axios instance, error normalization — §2.1)
        │           │
        │           ▼
        │     Auth Store + auto-refresh interceptor (§10)
        │           │
        │           ├──► Permission Guard (usePermission, needs decoded JWT from Auth Store)
        │           └──► Organization Context (needs authenticated Axios instance)
        │
        ├──► lint-staged + pre-commit hook (independent, no dependency)
        │
        └──► Toast / Loading / Error Boundary primitives (independent of auth, needed by any real feature)
                    │
                    ▼
              layouts/ (dashboard shell composes Auth + Org context + these primitives)
                    │
                    ▼
              First real protected route/page (out of T031.01 scope — "no business module")
```

---

## 14. Implementation Plan (phased, high-level — not code, not authorization to implement)

1. **Backend prerequisite**: OpenAPI export script (separate authorization, backend scope).
2. **Tooling**: install Orval, lint-staged; wire `generate:api` script and pre-commit hook.
3. **Shared primitives**: Toast, Loading/Skeleton, Error Boundary — no dependencies on auth, can proceed independently/in parallel with step 1–2.
4. **API client layer**: evolve `lib/api.ts` → `services/api-client.ts` with real response/error interceptors matching §2.1.
5. **Auth**: Auth Store, login/logout hooks, auto-refresh interceptor, JWT decode utility.
6. **Authorization**: Permission Guard hook/component, Organization Context (Settings Store or Query — SPEC decides).
7. **Layouts & routing shell**: `(auth)`/`(dashboard)` route groups, dashboard shell layout, middleware (pending the §12 route-protection-layer decision).
8. **Checklist sign-off** (§15) before any real business feature begins.

Every step above needs its own SPEC-level detail (exact interceptor logic, exact store shape, exact middleware behavior) — this plan sequences the *work*, it does not specify the *implementation*.

---

## 15. Checklist (for RFC/SPEC authors to verify against before closing T031.01-derived work)

- [ ] OpenAPI export mechanism exists and is CI-checked for drift (or explicitly decided not to be).
- [ ] Orval generates a working, typed client from that export.
- [ ] Global Axios error/response interceptor matches the real envelope (§2.1) exactly, including `success: false` error shape.
- [ ] Auto-refresh interceptor handles concurrent 401s without a refresh stampede.
- [ ] Access token is never written to `localStorage`/`sessionStorage`.
- [ ] Permission Guard reads from the same `permissions[]` source the backend itself trusts (the JWT), not a separate/duplicated list.
- [ ] `isPlatformAdmin` availability question (§2.3, §12) is explicitly resolved, not left ambiguous.
- [ ] Route-protection-layer decision (middleware vs. client-only) is explicit in SPEC, not implied.
- [ ] lint-staged + pre-commit wired, matches existing Husky/commitlint convention already active at repo root.
- [ ] No business-module code was written under this authorization (T031.01 scope boundary respected).

---

## 16. Explicitly out of scope for this Discovery Report

- No RFC-T031 or SPEC-T031 content — reserved for the Architect (Decision G01–G06).
- No code, no dependency installation, no new files outside `docs/discovery/`.
- No decision made on any "Open question" flagged above (§7 Settings Store shape, §10 refresh-stampede mitigation detail, §12 middleware route-protection layer, `generated/` commit policy) — these are surfaced for the Architect, not resolved.

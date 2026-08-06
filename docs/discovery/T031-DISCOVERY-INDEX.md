# T031 Discovery Index — Frontend Foundation

**Status:** Consolidation and publication of already-approved discovery evidence. **This document is not an RFC and not a SPEC** — see §9.
**Authority:** T031.01 through T031.01F — all APPROVED. This index (T031.01G) adds no new evidence; it consolidates, cross-references, and records the Architect Decisions made across those approvals.
**Baseline commit surveyed throughout the T031 sequence:** `main` @ `baaaa683e15866ce6343eab3e7368b02f28a8b05`.

---

## 1. Document inventory

| # | Document | Package | Covers |
|---|---|---|---|
| 1 | `T031-FRONTEND-FOUNDATION-DISCOVERY.md` | T031.01 | Backend API survey (response envelope, OpenAPI status, Auth/Permission/Organization contracts) + existing frontend audit + initial architecture/folder/state/routing/API-generation/auth proposals |
| 2 | `T031-FRONTEND-GAP-ANALYSIS.md` | T031.01A | Per-area (18 areas) gap review + dependency graph, folder gap table, auth/permission flow analysis, performance/testing/deployment/DX readiness |
| 3 | `T031-OPENAPI-EXPORT-DISCOVERY.md` | T031.01B | Whether OpenAPI can be generated without a live server/DB; option comparison (A-E); recommended export mechanism; cookie/multipart/pagination representation; 2 named DTO/Swagger gaps |
| 4 | `T031-FRONTEND-FOUNDATION-AUDIT.md` | T031.01C | Per-file (26 files) KEEP/REFACTOR/REPLACE/REMOVE/UNUSED classification with evidence; reusable-asset inventory; architecture-conflict check |
| 5 | `T031-FRONTEND-TESTING-CI-DISCOVERY.md` | T031.01D | Test-framework comparison (Vitest vs. Jest); confirmed zero test infra exists; required setup per test category; CI job structure proposal; mock strategy |
| 6 | `T031-FRONTEND-AUTH-SECURITY-DISCOVERY.md` | T031.01E | Deep auth/security read: refresh-token rotation + reuse detection (headline finding), CSRF posture, cookie attributes, middleware trust boundary, claim trust rules |
| 7 | `T031-CROSS-TAB-AUTH-COORDINATION-DISCOVERY.md` | T031.01F | Cross-tab coordination option comparison (A-E) for the multi-tab false-reuse-detection risk found in #6; recommended Web Locks + BroadcastChannel + localStorage fallback |
| 8 | `T031-DISCOVERY-INDEX.md` (this document) | T031.01G | Consolidation, Architect Decision record, traceability, RFC/SPEC input lists |

All 8 are read-only discovery/consolidation artifacts. No RFC, no SPEC, no code, no dependency changes were made in any of them.

---

## 2. Evidence-backed current-state summary

- **Backend is a stable, versioned contract**: response envelope (`{success, data, meta, traceId, timestamp}` / `{success:false, code, message, errors, traceId, timestamp}`) applied globally via `APP_INTERCEPTOR`/`APP_FILTER`; Auth (login/refresh/logout/sessions/forgot-password), Permission (JWT-embedded, no server round-trip per check), and Organization (Platform-Admin-vs-tenant split via `PlatformAdminOrPermissionsGuard`) APIs all traced end-to-end from real controller/service/DTO source (docs 1, 3, 6).
- **The existing frontend is a genuine partial foundation, not a blank scaffold**: Next.js 15.5.20/React 19.1.0/TS strict/Tailwind v4/shadcn already working; TanStack Query, dark mode, and both existing shadcn primitives are production-quality as-is (doc 4, 17/26 files KEEP). `lib/api.ts` exists but is imported by nothing today and has zero request interceptor (doc 4).
- **OpenAPI is runtime-only today** — no committed spec, no export script, and the sole hard blocker to generating one standalone is `PrismaService`'s eager `$connect()` (doc 3) — Redis is confirmed *not* a blocker.
- **No test infrastructure exists anywhere in the frontend** — confirmed first-party by the existing `tools/playwright/verify.ts`'s own comment (doc 5). The existing `tools/playwright/` scripts are screenshot-capture tooling, not an assertion-based E2E suite, and only the bare `playwright` library (not `@playwright/test`) is installed.
- **The backend already implements real, tested refresh-token rotation with theft/reuse detection** (doc 6, the sequence's headline finding) — which creates a concrete, mechanically-certain multi-tab race risk (doc 7) requiring deliberate cross-tab coordination, not an incidental nice-to-have.
- **Pre-existing, already-committed tooling (`tools/playwright/pages.ts`, `screenshot-dashboard.ts`) independently names a specific intended route map and `frontend/src/stores/auth-store.ts` path** (doc 2) — real, named evidence of prior intent, not proof of a mandate, but directly relevant to RFC-T031's routing/state decisions.

---

## 3. Approved Architect Decisions

The following were reviewed against all 7 prior discovery documents (§8 traceability) and confirmed **not** to contradict any evidence found — no item below required the STOP/ARCHITECT-DECISION-REQUIRED escalation this package's authorization would have triggered had one been unsupported.

1. **Preserve the existing Next.js/React foundation** — matches the Foundation Audit's 17-of-26-files KEEP finding; nothing evidenced there warranted a rebuild.
2. **shadcn `base-nova`/`@base-ui` convention** — already in active, working use (Foundation Audit); this decision resolves the one architecture-conflict item that document flagged as needing explicit confirmation (Radix-style assumptions elsewhere would have conflicted with what's actually installed).
3. **OpenAPI generated by a standalone backend script, with committed `openapi.json` and CI drift checking** — exactly the recommended option ((b)+(c)) in the OpenAPI Export Discovery, chosen specifically because it requires zero changes to `PrismaService` or any other production file.
4. **Vitest + React Testing Library + jsdom + MSW** — Vitest was presented as one of two genuinely evidenced options (vs. Jest) in the Testing & CI Discovery, not disqualified or unsupported; MSW was that document's own stated lean ("the stronger fit") over `axios-mock-adapter`. This decision resolves that document's Decision #1/#2.
5. **TanStack Query for server state** — already implemented and working; consistent across every document that touched state management.
6. **Zustand for client-only/auth state** — proposed from T031.01 onward, reaffirmed in the Auth/Security Discovery; resolves that document's Decision #4 groundwork (the store's existence, not yet its exact content).
7. **Memory-only access token** — the Auth/Security Discovery's own §3 finding ("remains the evidenced-sound recommendation") and explicit Decision #4 ask ("confirm... as the final decision, not just a carried-forward proposal") — this is exactly that confirmation.
8. **HttpOnly refresh cookie** — not a new decision; this is the backend's existing, already-shipped, already-tested behavior (Auth/Security Discovery §1-2), recorded here for completeness of the frontend's design constraints.
9. **Web Locks + BroadcastChannel coordination** — the Cross-Tab Discovery's explicit recommended option (A), chosen for its browser-guaranteed exclusivity and automatic crash recovery over the hand-rolled alternatives.
10. **localStorage mutex fallback** — the same document's recommended fallback tier (Option C) for browsers predating Web Locks/BroadcastChannel support (Safari < 15.4).
11. **Middleware is UX-only, never a security boundary** — the Auth/Security Discovery's own definitive, evidence-derived answer (traced directly to `jwt-access.strategy.ts`'s per-request DB re-validation) — not a preference, a structural fact about what Edge Middleware can and cannot verify.

---

## 4. Technical debts and unresolved items

- `README.md` (frontend) is unedited `create-next-app` boilerplate (doc 4).
- `package.json` (frontend) missing `typecheck`/`test`/`format`/lint-staged scripts (doc 4).
- 5 unused stock SVGs under `public/` confirmed safe to delete (doc 4).
- `lib/api.ts`'s stale comment references a pre-replan "Prompt Authentication (011+)" numbering scheme (doc 4).
- `UserInfoDto` (backend) omits `isPlatformAdmin` despite the JWT itself carrying it (docs 1, 3, 6) — a backend gap, not fixed by any T031 discovery package.
- `SupplierImportSummary` (backend) is a plain TS interface, invisible to Swagger reflection — one named endpoint will produce an untyped Orval client method until fixed (doc 3).
- `@ApiCookieAuth()` is never used anywhere — the refresh-cookie flow is undocumented in the OpenAPI schema (doc 3).
- No `auth.e2e-spec.ts` exists at all — the rotation/reuse/cookie-attribute contract is unit-tested with mocks only, never verified over real HTTP (doc 6).
- Failed `/auth/refresh` does not clear the cookie server-side (only explicit logout does) — a disclosed backend behavior gap (doc 6).
- `next.config.ts` has no deployment-relevant configuration yet (`output` mode, image domains) — doc 4/2.
- No frontend Dockerfile, no `docker-compose.yml` frontend service — deployment packaging is entirely unaddressed (doc 2).
- `tools/playwright/`'s route-map/store-path assumptions (doc 2) are unverified against whatever RFC-T031 ultimately decides — will need reconciliation either way.

## 5. Exact blockers before implementation

1. **OpenAPI export script does not exist** — hard-blocks Orval/typed-client work entirely until built (backend-scope, doc 3).
2. **No test framework installed** — hard-blocks any test-driven implementation work until Vitest/RTL/MSW (per §3 Decision 4) are actually installed and configured (doc 5) — this package explicitly does not install dependencies.
3. **Cross-tab coordination is unimplemented design, not code** — the Auth Store/API client work cannot be considered complete without it, given the concrete race risk in doc 6/7.
4. **`stores/auth-store.ts`, `services/api-client.ts`, `hooks/*`, `middleware.ts`, `generated/` — none exist yet** (doc 2 folder-gap table) — all are prerequisites named across multiple documents before any real authenticated screen can be built.

## 6. Proposed RFC-T031 decision list

(Input for the Architect's own RFC authorship — not itself an RFC, per §9.)

- Final folder structure (doc 1's proposal vs. any Architect adjustment).
- `lib/api.ts` → `services/api-client.ts`: relocate or extend in place (Foundation Audit Decision #1).
- Grace-window duration and authorization, if the Option E backend safety net (Cross-Tab Discovery) is wanted alongside client-side coordination.
- Whether the 4 backend gaps in §4 (`isPlatformAdmin`, `SupplierImportSummary`, `@ApiCookieAuth`, `auth.e2e-spec.ts`) become their own follow-up packages, get bundled into RFC-T031's scope, or are explicitly deferred.
- `openapi.json` commit location (`backend/` vs. `docs/api/`) and whether `generated/` (frontend) is committed or gitignored.
- Organization Context source: JWT claim only, `GET /organizations/current` only, or both (Auth/Security Discovery §11).
- Minimum supported browser policy (directly gates how much engineering effort the localStorage-mutex fallback deserves — Cross-Tab Discovery §7).
- `next.config.ts` deployment-relevant settings timing (now vs. deferred).
- `README.md` rewrite scope (full onboarding content vs. pointer to `docs/setup/DEVELOPMENT-SETUP.md`).

## 7. Proposed SPEC-T031 acceptance-area list

(Input for the Architect's own SPEC authorship — not itself a SPEC, per §9.)

- Auth: login/refresh/logout/session-restoration flow, cross-tab coordination behavior, logout propagation, refresh-failure handling.
- Permission/Platform-Admin guard behavior (client-side UX gating only, explicit non-reliance for security).
- Organization Context provider/store shape.
- API client: request/response interceptor behavior, error-envelope normalization, Orval-generated client integration.
- Test coverage floor for Foundation-phase code (Testing & CI Discovery §6 — explicitly not pre-set by any discovery document).
- CI job structure changes (`test` job addition, required-check impact).
- OpenAPI export + drift-check CI behavior.
- Multi-tab E2E test acceptance criteria (Cross-Tab Discovery §Q8's proposed Playwright multi-context test).

## 8. Traceability table

| Approved Decision (§3) | Source document(s) |
|---|---|
| 1. Preserve existing Next.js/React foundation | Foundation Audit |
| 2. shadcn `base-nova`/`@base-ui` | Foundation Audit §3 |
| 3. Standalone OpenAPI export script + committed `openapi.json` + CI drift check | OpenAPI Export Discovery §5 |
| 4. Vitest + RTL + jsdom + MSW | Testing & CI Discovery §1, §7 |
| 5. TanStack Query for server state | Foundation Discovery §7; Foundation Audit |
| 6. Zustand for client-only/auth state | Foundation Discovery §7; Auth/Security Discovery |
| 7. Memory-only access token | Auth/Security Discovery §3, §15 Decision 4 |
| 8. HttpOnly refresh cookie | Foundation Discovery §2.3; Auth/Security Discovery §1-2 |
| 9. Web Locks + BroadcastChannel | Cross-Tab Coordination Discovery §Recommended option |
| 10. localStorage mutex fallback | Cross-Tab Coordination Discovery §Q6 |
| 11. Middleware UX-only | Auth/Security Discovery §9 |

## 9. This index is not an RFC and not a SPEC

This document consolidates and cross-references evidence and Architect Decisions already recorded across T031.01-T031.01F. **It does not itself constitute RFC-T031 or SPEC-T031** — per this project's standing governance (CLAUDE.md, Decision G01-G06), RFC and SPEC authorship remains exclusively the Architect's. This index exists solely so RFC-T031/SPEC-T031 can be authored from one stable, cross-referenced source set rather than 7 separate documents — nothing here should be cited as if it were itself an approved specification for implementation.

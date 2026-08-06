# T031.01E — Frontend Security & Authentication Readiness Discovery

**Status:** Read-only discovery. No RFC, no SPEC, no code, no dependency changes, no commits.
**Authority:** T031.01 through T031.01D — all APPROVED.
**Baseline commit surveyed:** `main` @ `baaaa683e15866ce6343eab3e7368b02f28a8b05`.

This pass reads deeper than T031.01's original Auth API survey — specifically `auth.service.ts`, `token.service.ts`, `cors.util.ts`, and `jwt-access.strategy.ts` in full, plus their corroborating unit tests — to answer security-specific questions T031.01 didn't need to resolve.

---

## Headline finding: real, tested refresh-token rotation + reuse detection already exists

`backend/src/modules/auth/application/auth.service.ts`'s `refreshToken()` method implements the industry-standard rotation + theft-detection pattern completely:

- Every successful `/auth/refresh` call **revokes the presented token's session** (`sessionRepository.revokeById`) and issues a **brand-new** refresh token + access token (`issueSession()`) — the raw refresh token value changes on every single use. It is never reusable.
- If an **already-revoked** token is presented again (`existing.revokedAt` truthy), the service treats this as a theft signal and calls `sessionRepository.revokeAllForUser(existing.userId)` — every session for that user, across every device, is killed — then rejects with `AUTH_REFRESH_TOKEN_REUSED`.
- Corroborated by real, existing unit tests in `auth.service.spec.ts` (`revokeAllForUser` asserted called on the reuse path, asserted **not** called on other error paths — 3 separate assertions found).
- The refresh token itself is 64 random bytes (128 hex chars, `crypto.randomBytes`), **not a JWT** — opaque, unguessable, and only its HMAC-SHA256 hash (keyed with `JWT_REFRESH_SECRET`) is ever persisted server-side (`token.service.ts`). The raw value is returned to the client exactly once, at issuance.

This has a direct, serious implication for frontend design — see §5 and §15.

---

## Answers

### 1. Exact browser login flow

`POST /auth/login` — body `{ organizationSlug, email, password, deviceName? }` (no `X-Client-Type` header ⇒ treated as WEB). On success (`auth.controller.ts`'s `deliver()`):
- `accessToken` returned in the JSON body.
- `refreshToken` set via `Set-Cookie: refresh_token=...; HttpOnly; Secure (prod only); SameSite=Lax; Path=/api/v1/auth; Expires=<refreshTokenExpiresAt>` — **never** present in the WEB JSON body (confirmed again at this deeper read, matching T031.01).
- `userInfo` (`{ id, email, username, organizationId, branchId, permissions[] }`) also returned in the body — still missing `isPlatformAdmin`, as already flagged in T031.01/T031.01B.

### 2. Exact refresh flow

`POST /auth/refresh` — WEB sends no meaningful body (cookie carries the token, browser attaches it automatically given `withCredentials: true`/matching CORS+cookie config). Server: hashes the presented raw token, looks it up by hash, validates not-revoked/not-expired, re-checks the owning user is still `ACTIVE`, **revokes the presented session**, and issues an entirely new session (new access token + new rotated refresh token, same `deliver()` cookie-setting logic as login). This is a genuinely different flow from a "just re-sign a new access token" refresh — every refresh is a full session replacement.

### 3. How access token is stored in memory

Not a backend-determined fact — this is a frontend design choice. T031.01's original proposal (in-memory only, e.g. a Zustand store field, never `localStorage`/`sessionStorage`) remains the evidenced-sound recommendation: the access token is a bearer credential with no protection beyond possession, so persisting it anywhere JS-readable (`localStorage`) is a strictly larger XSS blast radius than keeping it in a JS variable that dies with the tab/reload. Not re-decided here, only reaffirmed against no new contradicting evidence.

### 4. How session restoration works after reload

Since the access token is memory-only (§3) and the refresh token is `HttpOnly` (invisible to JS entirely), the only viable restoration mechanism is: on app load, call `POST /auth/refresh` with `withCredentials: true` and no explicit token handling — the browser attaches the cookie automatically. Success repopulates the Auth store from the response; failure (401, any reason) means "not logged in," not an error to surface loudly.

**Critical, newly-discovered consequence of §"Headline finding":** because refresh is single-use-then-rotated, this restoration call **also rotates** the refresh token as a side effect of merely "checking" whether a session exists. This is fine for a single tab/single call — but see §5 for why it's a real risk under concurrency.

### 5. How concurrent 401 responses are handled without refresh storms

Standard mitigation: a single shared "in-flight refresh" promise — the first 401 triggers exactly one real `/auth/refresh` call; every other simultaneously-401ing request awaits that same promise instead of independently calling refresh, then all retry once it resolves. This is necessary but **not sufficient** given the rotation behavior in the Headline Finding: if two refresh calls were ever made concurrently with the *same* raw token (e.g., two browser tabs both restoring a session at the same moment, per §4, before either has received its rotated replacement) — because the first successful call revokes that session, the second concurrent call would find `existing.revokedAt` already set and trigger the **theft-detection path**, logging the legitimate user out of every device (`revokeAllForUser`). This is not a hypothetical edge case; it is the direct, mechanical consequence of combining (a) rotation-on-every-refresh with (b) multiple independent contexts (tabs) that can each independently decide "I should refresh now." A per-tab in-flight-promise mutex does **not** solve this — it only prevents duplicate calls *within* one tab. Cross-tab coordination (e.g., the Web Locks API, or a `BroadcastChannel`-based leader-election so only one tab ever performs the actual refresh call) is the real fix, and is an open design question, not resolved here.

### 6. How refresh failure logs the user out

The frontend must treat any `/auth/refresh` failure (expired, invalid, or reused-and-revoked) as "not logged in": clear the Auth store, redirect to `/login`. **Backend gap found**: `auth.controller.ts`'s cookie-clearing (`res.clearCookie(...)`) only happens on the explicit `/auth/logout`/`/auth/logout-all` routes — a *failed* `/auth/refresh` call does **not** clear the cookie server-side. The stale, now-permanently-invalid cookie remains set in the browser until it naturally expires (up to 30 days, `JWT_REFRESH_EXPIRES_IN` default) or is overwritten by a future successful login. This doesn't create a security hole (the token is genuinely revoked/unusable server-side either way), but it does mean the frontend cannot rely on "cookie present" as any kind of "probably still logged in" signal after a failed refresh — flagged as a real, disclosed backend behavior gap, not fixed here.

### 7. Whether CSRF protection is required for cookie refresh/logout routes

No explicit CSRF mechanism exists today (no CSRF token, no double-submit-cookie pattern) — the **only** defense is the cookie's `SameSite=Lax` attribute (§8) plus the fact that `/auth/refresh`/`/auth/logout`/`/auth/logout-all` are all POST-only (confirmed in `auth.controller.ts`). `SameSite=Lax` blocks the cookie from being attached to cross-site POST requests (including classic HTML `<form>`-based CSRF, which CORS does **not** protect against — CORS only governs whether JavaScript can *read* a cross-origin response, not whether a browser *sends* a form POST) — so a same-site-restricted-POST cookie is genuinely a meaningful, real defense against classic CSRF in all modern browsers (SameSite=Lax-by-default has been standard since ~Chrome 80, 2020). This is **not** a "no protection" situation, but it is **single-layered** — there is no defense-in-depth (a second, independent CSRF-token check) backing it up. Whether that single layer is acceptable is a genuine risk-acceptance decision, not something this Discovery resolves.

### 8. Whether SameSite/Secure cookie settings are sufficient

Exact configuration (`auth.controller.ts`): `httpOnly: true` (always), `secure: process.env.NODE_ENV === 'production'` (i.e. **not** secure in development — expected/normal for local `http://localhost` dev, not a production gap), `sameSite: 'lax'`, `path: '/api/v1/auth'` (scoped narrowly — the cookie is never sent to any route outside the auth module, reducing its exposure surface even further than a root-path cookie would). This is a reasonable, defensible configuration for a same-origin-in-production web app — but "sufficient" is ultimately a risk-tolerance judgment the Architect must make (§7), not a fact this Discovery can assert on the codebase's behalf. `SameSite=Strict` was not chosen (Lax was) — Strict would additionally block the cookie on top-level cross-site navigations (e.g., a user clicking a link from an external site directly into an authenticated page would not carry the cookie on that first navigation) — Lax is the more common practical choice for exactly this UX reason, and nothing found here suggests it was an oversight rather than a deliberate choice.

### 9. Whether Next.js middleware can enforce auth or only provide UX-level routing

**UX-level routing only — it cannot be a real security boundary, and no frontend architecture could make it one given this backend's design.** Edge Middleware runs server-side and can read cookies (including `HttpOnly` ones — `HttpOnly` only blocks *browser JavaScript* access, not server-side reads of the `Cookie` header) — so middleware *can* check for the mere **presence** of the `refresh_token` cookie and redirect obviously-logged-out users away from protected routes before any page flash. But presence is not validity: the cookie could be expired, or already revoked (§6's stale-cookie scenario), and middleware has no cheap way to verify this without making a real network call to the backend on every single navigation (a real latency/complexity cost, and still wouldn't check permissions, only "does *a* session exist"). **Real security enforcement is, and must remain, 100% server-side** — exactly as it already is today via `JwtAccessStrategy`'s per-request DB lookup (`user.status === 'ACTIVE'` + `permissionVersion` match, §12) — this is not a gap to close, it's the correct existing architecture; middleware can only ever add a UX layer on top of it, never replace it.

### 10. How permission and platform-admin guards should work

Same trust-boundary logic as §9: a client-side `usePermission(code)` hook / `<PermissionGuard>` component reading the decoded access token's `permissions[]` (§12) can hide/show UI elements for a smoother experience, but this is **never** a security boundary — the exact same `permissions[]` claim is independently, redundantly re-checked server-side on every request by `PermissionsGuard` (traced in T031.01 §2.4), which is the only enforcement that actually matters. Platform Admin is structurally different (T031.01 §2.5, T030.12O/P): it's not a permission string at all, it bypasses the permission system entirely (`PlatformAdminOrPermissionsGuard`) — so a frontend "is this user a Platform Admin" check must read the JWT's `isPlatformAdmin` boolean claim directly (once the `UserInfoDto` gap, §1, is resolved or worked around via JWT decode), not attempt to model it as a permission code.

### 11. How organization context is represented

Two viable sources, not decided between here: (a) the JWT's `organizationId` claim (available immediately, no extra call, but only an ID — no `settings`/`subscription` detail), or (b) `GET /organizations/current` (T031.01 §2.5) — full object with `settings`/`subscription` nested, but requires an authenticated call after login completes. A real frontend likely needs both: (a) for immediate, synchronous "which org am I in" checks, (b) for anything that needs the org's actual settings/branding/limits. Platform Admin's relationship to "current organization" is structurally different — they aren't scoped to one organization at all (§10) — so any "Organization Context" store/provider needs to explicitly handle the Platform Admin case as "no current organization" rather than erroring or defaulting to something arbitrary.

### 12. Which claims may be decoded client-side and which must never be trusted

**All claims can be freely decoded client-side** — a JWT's payload is base64-encoded, not encrypted; any JavaScript (the app's own, or an attacker's via XSS) can read `sub`, `organizationId`, `branchId`, `email`, `permissions[]`, `permissionVersion`, `isPlatformAdmin` without needing the signing secret. This is normal, expected JWT behavior, not a vulnerability by itself, **provided** nothing in the token is treated as a secret (nothing found here is — it's all identity/authorization metadata, not credentials).

**None of these claims should ever be *trusted* as a final security decision** — every one of them can go stale between token issuance and the moment it's read: `jwt-access.strategy.ts`'s `validate()` method proves this directly — it re-fetches the user from the DB on *every single authenticated request* and rejects (`AUTH_PERMISSION_VERSION_MISMATCH`) if the token's `permissionVersion` no longer matches the DB's current value, or if the account is no longer `ACTIVE`. This means even the *backend itself* doesn't trust a previously-issued token's claims at face value — it re-validates against current DB state every time. The frontend inherits the same rule by necessity: decoded claims are a UX/rendering hint, the server's response to the *next actual request* is the only ground truth.

### 13. Required security tests

- **Rotation/reuse-detection E2E, at the HTTP level**: does not exist today — searched `backend/test/` for any `auth*.e2e-spec.ts`, found **none**. Only `auth.service.spec.ts` (unit, mocked repositories) exercises this logic; nothing verifies the real `HttpOnly`/`Secure`/`SameSite` cookie attributes are actually present in a real `Set-Cookie` response header, and nothing exercises the theft-detection path over real HTTP with real cookies. This is a genuine, disclosed backend-testing gap directly relevant to frontend confidence — the frontend would be the *first* real, automated consumer of this exact flow.
- **Concurrent-refresh-race test**: does not exist anywhere (backend or frontend) — directly relevant to §5's finding; would need to prove that N simultaneous legitimate refresh attempts (e.g., simulating multiple tabs) do **not** trigger `revokeAllForUser` against a real user.
- **Cookie-attribute assertion test**: a straightforward E2E addition (inspect the real `Set-Cookie` header for `HttpOnly`/`Secure`/`SameSite=Lax`/correct `Path`) — currently unverified by any automated test.
- **CSRF-scenario test**: a request simulating a cross-site POST (mismatched/missing `Origin`, cookie theoretically attached per test-harness control) correctly rejected — partially adjacent to existing CORS tests, but no test specifically targets the refresh/logout routes' CSRF posture.
- **Frontend-side**: once a Permission Guard exists, a test proving it never becomes the *only* protection (i.e., a test that bypasses the client-side guard and confirms the backend still independently rejects) — this is really re-confirming existing backend `PermissionsGuard` tests already do their job, but is worth an explicit frontend-side regression test asserting the UI guard's absence/failure doesn't silently expose a working API call path.

### 14. Exact future file inventory (proposal, not implemented)

```
frontend/src/
  stores/auth-store.ts                 # already named by existing tooling (T031.01C §1.13);
                                         # in-memory access token + decoded claims + authenticated flag
  services/api-client.ts                # evolves from lib/api.ts (T031.01C):
                                         #   - request interceptor: attach Authorization header
                                         #   - response interceptor: single-flight refresh-on-401,
                                         #     cross-tab coordination (§5) — real design work, not
                                         #     a trivial interceptor
  utils/decode-jwt.ts                   # pure, no-signature-verification base64 payload decode
                                         # (client-side decode is a UX read, never a trust decision — §12)
  hooks/use-permission.ts
  hooks/use-current-organization.ts
  hooks/use-session-restore.ts          # the §4 "call /auth/refresh on load" flow
  middleware.ts                          # UX-level only (§9) — cookie-presence check + redirect
  providers/auth-provider.tsx            # or folded into providers/index.tsx (T031.01C §9 decision)
```

### 15. Security risks and Architect Decisions required

**Risks (ranked by concreteness of evidence, not assumed severity):**
1. **Concurrent/multi-tab refresh triggering false-positive theft detection** (§5) — the most concrete, mechanically-certain risk found in this whole Discovery: it follows directly and unavoidably from the already-shipped, already-tested backend rotation design combined with any naive multi-tab frontend session-restoration implementation. Needs an explicit cross-tab coordination design before implementation, not just a per-tab mutex.
2. **No CSRF token as defense-in-depth** (§7/§8) — `SameSite=Lax` is real protection, not "no protection," but it is the sole layer.
3. **Stale cookie not cleared on failed refresh** (§6) — a real, disclosed backend behavior, not a frontend-fixable gap.
4. **No E2E test coverage of the rotation/reuse/cookie-attribute contract at all** (§13) — the frontend would be building against a contract that's only unit-tested with mocks today, not verified over real HTTP.
5. **`UserInfoDto` missing `isPlatformAdmin`** (carried over from T031.01/T031.01B, reaffirmed relevant here for §10/§11) — frontend must decode the JWT for this one field.

**Architect Decisions required:**
1. Accept `SameSite=Lax`-only CSRF protection, or require an additional CSRF-token mechanism to be added (backend-scope work, out of frontend authority).
2. Cross-tab refresh coordination strategy (Web Locks API, `BroadcastChannel` leader election, or accept the race risk as a rare, recoverable-by-relogin edge case) — §5.
3. Whether to request the backend-side fixes disclosed here (`isPlatformAdmin` in `UserInfoDto`; clearing the cookie on failed refresh; adding `auth.e2e-spec.ts` coverage) as follow-up backend packages, bundle them into a future frontend-adjacent package, or explicitly defer.
4. Access-token storage confirmation: in-memory-only (§3) as the final decision, not just a carried-forward proposal.
5. Organization Context source: JWT claim only, `GET /organizations/current` only, or both (§11).

---

## Explicitly out of scope for this Discovery

No RFC-T031/SPEC-T031 content. No code, dependency, or config changes made. No file created or modified outside `docs/discovery/`. No decision made on any of the 5 items in §15.

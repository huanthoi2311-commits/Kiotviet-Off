# T031.01D — Frontend Testing & CI Readiness Discovery

**Status:** Read-only discovery. No RFC, no SPEC, no code, no dependency changes, no commits.
**Authority:** T031.01, T031.01A, T031.01B, T031.01C — all APPROVED.
**Baseline commit surveyed:** `main` @ `baaaa683e15866ce6343eab3e7368b02f28a8b05`.

---

## 0. Current state (before answering the numbered questions)

- **No test framework of any kind is installed or configured anywhere in this repository for the frontend** — confirmed by reading `frontend/package.json` (no `jest`, `vitest`, `@testing-library/*`, `jest-axe`, `msw`, or any test-related package) and the root `package.json` (only `playwright` — the browser-automation *library*, not the `@playwright/test` *test runner* — plus `husky`/`commitlint`/`tsx`/`commit-and-tag-version`).
- `tools/playwright/verify.ts`'s own header comment states this explicitly, first-party: *"không có test framework (Jest/Vitest...) nào được cấu hình cho thư mục này"* ("no test framework (Jest/Vitest...) is configured for this directory") — and describes itself as a deliberate, hand-rolled workaround (plain assertion functions + manual pass/fail counters, run via `tsx`) specifically **because** no real framework exists yet.
- No `jest.config.*`, no `vitest.config.*`, no `playwright.config.*` exist anywhere in the repository (confirmed by search).
- `frontend/package.json` has no `test` script.
- `.github/workflows/frontend-ci.yml` (as rebuilt in T030.14B) runs exactly: `Detect changed paths` → `Lint · Typecheck · Build` (lint + `tsc --noEmit` + `next build`) → `Frontend` aggregator. **No test step exists in CI today.**
- `tools/playwright/` (5 scripts + `lib/screenshot.ts` + `pages.ts`) is real, working, and already committed — but it is **visual screenshot-capture tooling**, not an assertion-based E2E test suite: every script drives a real Chromium instance via the bare `playwright` library and writes PNG files to `artifacts/screenshots/`; none of them use `expect()`/`test()` or produce a pass/fail signal beyond "did the script throw." `capture-all.ts` explicitly documents that if the backend session is absent, dashboard routes will correctly show a `/login` redirect and the script **still succeeds** (it's not asserting a particular page loaded, just capturing whatever rendered).
- The repository's required-status-check ruleset (T030.14B) requires a check literally named `Frontend` to pass — currently satisfied entirely by the lint/typecheck/build aggregator described above; no test result currently factors into it at all.

---

## Answers

### 1. Which test framework best fits the current stack?

Evidence-based comparison, not a decision:

| Factor | Vitest | Jest |
|---|---|---|
| Alignment with current build tooling | Vite-native; this project already uses Turbopack for **both** `dev` and `build` (confirmed in `package.json`'s scripts, an aggressive/uncommon choice — Turbopack is still opt-in for `build` even in Next 15) — Vitest and Turbopack share the same "fast, ESM-native" philosophy, though they are not the same tool and Vitest does not literally reuse Turbopack's config | Not aligned with Turbopack; requires Next.js's own `next/jest` preset (officially maintained by Vercel) to bridge Next.js's SWC/webpack-era transform pipeline into Jest |
| Consistency with backend | None — backend uses Jest exclusively (every `*.spec.ts` in `backend/`, confirmed throughout this entire engagement) | High — same runner, same mental model, same `describe`/`it`/`expect` API surface as everything already in `backend/` |
| React 19 / RSC support | Actively maintained, commonly paired with `@vitejs/plugin-react`; no React-19-specific blocker found in this Discovery's reading | `next/jest` is the Next.js team's own officially documented path, kept in sync with each Next.js release including 15.x |
| ESM/CJS friction | Native ESM, generally fewer transform-config issues in an App-Router-only (no `pages/`) project | Historically more transform-config friction with ESM-only dependencies (`@base-ui/react`, `next-themes`, etc. — none confirmed broken here, but Jest+ESM interop is a more commonly reported pain point industry-wide than Vitest+ESM) |
| Existing dependency footprint | Zero overlap with anything currently installed | Zero overlap with anything currently installed |

**No existing file, config, or dependency in this repository implies either choice today** (§2). This is a genuine open decision with real, evidenced tradeoffs on both sides — leaning toward Vitest for tooling-philosophy alignment (Turbopack/ESM-native) or toward Jest for cross-stack consistency with backend, depending on which the Architect weighs more heavily. Not decided here.

### 2. Is Vitest or Jest already implied by existing dependencies/config?

**No.** Confirmed by direct reading of `frontend/package.json` and root `package.json` — neither `vitest` nor `jest` (nor `@testing-library/*`, nor any test-adjacent package) appears in either file's `dependencies` or `devDependencies`. No config file for either exists anywhere in the repository.

### 3. Required setup per test category

- **Unit tests** (pure functions — today, only `lib/utils.ts`'s `cn()`; more will exist once `services/`/`hooks/`/`stores/` are built per T031.01's proposal): either runner works with zero additional setup beyond the runner itself — no DOM needed.
- **Component tests** (`theme-toggle.tsx`, `ui/button.tsx`, `ui/dropdown-menu.tsx` today; every future component): needs a DOM environment (`jsdom` for Jest, `jsdom` or `happy-dom` for Vitest) plus `@testing-library/react` (+ `@testing-library/jest-dom` for its `toBeInTheDocument()`-style matchers, + `@testing-library/user-event` for realistic interaction simulation). `theme-toggle.tsx` specifically also needs a `next-themes` test wrapper/mock since it calls `useTheme()`.
- **Hook/store tests** (future `usePermission`, `useCurrentOrganization`, Zustand stores per T031.01's proposal — none exist yet): `@testing-library/react`'s `renderHook` covers React hooks; Zustand stores are plain JS state containers and can be tested directly by importing the store and asserting on its state/actions without any React rendering at all — no extra library needed beyond the runner itself.
- **API-client tests** (future `services/api-client.ts` interceptors — currently `lib/api.ts`, confirmed **unused/unwired** by the prior Foundation Audit): needs an HTTP-mocking layer, since real Axios calls must not hit a real backend in tests. Two realistic options: **MSW (Mock Service Worker)** — intercepts at the network layer, framework-agnostic, reusable across component tests *and* (if ever wanted) real browser E2E; or **`axios-mock-adapter`** — simpler, Axios-specific, no network-layer interception. Neither is installed today.
- **Accessibility tests**: `jest-axe` (Jest) or `vitest-axe` (Vitest), both wrapping the same underlying `axe-core` engine — neither installed today. Needs to run against rendered component output (i.e., depends on the component-test setup above already working).
- **Playwright E2E**: fundamentally different from all the above — needs `@playwright/test` (the **test runner package**, not installed; only the bare `playwright` automation library is present, at the repo root, not in `frontend/`), a `playwright.config.ts` (doesn't exist anywhere), and a real running frontend (+ backend, for authenticated flows) — matching the existing `tools/playwright/` scripts' own documented requirement that nothing is auto-started, dev servers must already be running. The existing screenshot tooling's browser-binary install step (`npx playwright install chromium`, already documented in `tools/playwright/README.md`) is directly reusable — real E2E tests would need the same Chromium binary, no separate install path required.

### 4. Which tests should run in the required `Frontend` CI check?

Recommendation, not a decision: given the Foundation phase has essentially zero business logic yet (per the Foundation Audit — 17 of 26 files are KEEP-as-is scaffold/tooling, only `lib/api.ts` has any real future-facing logic and it's currently unwired), the honest near-term answer is **unit + component tests only**, once they exist, added to the same required `Frontend` check that already gates lint/typecheck/build. **Playwright E2E should not block the required `Frontend` check** — it needs a live server (and for authenticated routes, a live backend+Postgres+Redis), which is a fundamentally heavier, slower, more failure-prone dependency chain than the current fast lint/typecheck/build gate, mirroring exactly why backend's own `E2E (Postgres + Redis thật)` job is already a **separate** job from `Lint · Typecheck · Test · Prisma Validate · Build` (T030.14B) rather than folded into one. This is a direct structural precedent already established in this repository, not a new idea.

### 5. Exact CI job structure (proposal)

Extending the existing T030.14B pattern (`changes` → gated jobs → `Frontend` aggregator with `if: always()`), adding one new job:

```
changes (existing)
  │
  ├─► ci  (existing: lint + typecheck + build)
  ├─► test  (NEW: unit + component tests, once they exist — gated the same
  │          `if: needs.changes.outputs.frontend == 'true'` way as `ci`)
  │
  └─► Frontend (existing aggregator, `needs: [changes, ci, test]`, `if: always()`,
                same fail-safe logic as today extended to also require `test.result == 'success'`
                whenever `test` wasn't itself skipped)
```

A Playwright E2E job, if added, should remain **outside** the `Frontend` required check (separate job, possibly `on: schedule` or a separate manually-triggerable workflow, or gated to run only against `main`/nightly rather than every PR) — consistent with §4.

### 6. Coverage thresholds appropriate for Foundation phase

No hard threshold is proposed here (this is evidence-gathering, not a decision), but the evidence relevant to setting one: backend enforces a long-standing ≥90% convention across this entire project's history — but that convention accreted *module by module*, alongside real business logic, never as a Day-1 requirement on scaffold code. Frontend today has almost no business logic to cover (§3), so an immediate 90%-style gate would either be trivially met by testing nothing meaningful, or block on scaffold/config files that don't warrant deep testing (e.g. `providers/theme-provider.tsx`, a 4-line pass-through wrapper). The Architect may want either (a) no enforced threshold until real features land, then match backend's ≥90% convention from that point forward, or (b) a lower interim threshold as a floor. Not decided here.

### 7. Mock strategy for Axios, TanStack Query and Zustand

- **Axios**: MSW is the stronger fit given it can also serve real E2E tests later (§3) without a second mocking mechanism — but `axios-mock-adapter` is lower-effort for component/unit tests alone if E2E-level mocking is never needed. Both are viable; neither installed.
- **TanStack Query**: standard, well-documented pattern — wrap the component under test in a **fresh `QueryClientProvider`** per test (new `QueryClient` instance each time, not the app's singleton), with `retry: false` and `staleTime: 0`/`gcTime: 0` overridden for deterministic, fast test runs (the app's real `query-provider.tsx` defaults — `staleTime: 30_000`, `retry: 1` — are correct for production but wrong for tests, since they'd make tests slower/flakier). No extra library needed beyond `@tanstack/react-query` itself (already installed) — this is a test-setup pattern, not a dependency.
- **Zustand**: stores are plain functions returned by `create()` — the store itself can be reset between tests (e.g., capturing initial state and restoring it in `afterEach`, or constructing an isolated store instance per test file rather than importing the app's singleton export) — Zustand's own documentation recommends this pattern; no extra library required, though a small shared test-helper (e.g. a `resetStore()` utility) would likely emerge naturally once real stores exist (none do yet — see the Foundation Audit).

### 8. Browser environment requirements

- **Component/hook tests**: need a DOM emulation layer only (`jsdom`, bundled with Jest or addable to Vitest; `happy-dom` as a faster Vitest-specific alternative) — no real browser needed.
- **Playwright E2E**: needs a real browser binary. Already solved at the tooling level — root `package.json`'s `playwright` dependency + the documented `npx playwright install chromium` step (only Chromium, not Firefox/WebKit, an explicit existing choice per `tools/playwright/README.md`) is directly reusable; a real E2E setup would not need a new browser-install mechanism, only `@playwright/test` added alongside the existing `playwright` library and a `playwright.config.ts`.

### 9. Required dependency additions (depends on the Q1 framework choice — not decided here)

**If Vitest:** `vitest`, `@vitejs/plugin-react`, `jsdom` (or `happy-dom`), `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `vitest-axe` + `axe-core`, and an HTTP-mock library (`msw` or `axios-mock-adapter`, §7).

**If Jest:** `jest`, `jest-environment-jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jest-axe` + `axe-core`, and the same HTTP-mock choice. (`next/jest` itself ships as part of the `next` package already installed — no separate install needed for the Next.js/Jest bridge.)

**For real Playwright E2E (either path):** `@playwright/test` — note this can coexist with the existing bare `playwright` library (they're compatible, `@playwright/test` re-exports/builds on the same browser automation core), or the existing scripts could eventually migrate onto `@playwright/test`'s fixtures — not decided or assumed here.

### 10. Exact future file inventory (proposal, not implemented)

```
frontend/
  vitest.config.ts | jest.config.ts        # one of the two, per Q1 decision
  vitest.setup.ts | jest.setup.ts           # imports @testing-library/jest-dom matchers, etc.
  src/
    lib/utils.test.ts                       # first real unit test (cn() — trivial, safe starting point)
    components/theme-toggle.test.tsx        # first real component test
    components/ui/button.test.tsx
    components/ui/dropdown-menu.test.tsx
    services/api-client.test.ts             # once lib/api.ts is wired in (T031.01C §5)
    mocks/handlers.ts                       # if MSW is chosen (§7)
    mocks/server.ts                         # MSW node-server setup for tests
  playwright.config.ts                      # only if/when real Playwright E2E is authorized
  e2e/                                      # real Playwright *.spec.ts test files, separate
                                              # from tools/playwright/'s screenshot scripts
.github/workflows/frontend-ci.yml            # modified: new `test` job (§5)
```

### 11. Risks and Architect Decisions required

**Risks:**
- Choosing Jest for cross-stack consistency but hitting ESM-transform friction with `@base-ui/react`/`next-themes` (neither confirmed broken, but a real risk category for Jest+ESM generally, per §1) — would need to be discovered empirically once actually attempted, not knowable from static reading alone.
- Folding Playwright E2E into the required `Frontend` check (against this Discovery's recommendation in §4) would make every PR's merge gate dependent on a live server + possibly live backend/Postgres/Redis — a much heavier, more failure-prone dependency chain than lint/typecheck/build, mirroring exactly the kind of path-filter/required-check fragility already fixed once in T030.14B for the backend side.
- Setting a coverage threshold too early (§6) risks either being meaningless (passing trivially against near-zero business logic) or blocking legitimate scaffold/config files that don't warrant deep unit coverage.
- The existing `tools/playwright/` screenshot tooling and any future real `@playwright/test`-based E2E suite would both depend on the same Chromium binary and `DEFAULT_BASE_URL`/`FRONTEND_BASE_URL` convention (`tools/playwright/lib/screenshot.ts`) — if a real E2E suite is built without deliberately sharing that convention, the project would end up with two separate, divergent "how do I point Playwright at the running app" mechanisms.

**Architect Decisions required:**
1. Vitest vs. Jest (§1) — the single highest-leverage decision, since it determines nearly every dependency and config file in §9/§10.
2. HTTP-mock library: MSW vs. `axios-mock-adapter` (§7).
3. Whether/when a coverage threshold is enforced, and at what percentage (§6).
4. Whether Playwright E2E tests are authorized at all in this phase, and if so, whether they share `tools/playwright/`'s existing `DEFAULT_BASE_URL` convention or introduce a separate one.
5. Whether the required `Frontend` CI check gains a `test` job now (once any tests exist) or waits until real business-feature work begins.
6. Whether `tools/playwright/`'s existing screenshot scripts eventually migrate onto `@playwright/test` fixtures, or remain a permanently separate, simpler tool.

---

## Explicitly out of scope for this Discovery

No RFC-T031/SPEC-T031 content. No code, dependency, or config changes made. No file created or modified outside `docs/discovery/`. No decision made on any of the 6 items in §11.

# T031.01F — Cross-Tab Session Coordination Discovery

**Status:** Read-only design/comparison discovery. No RFC, no SPEC, no code, no dependency changes, no commits.
**Authority:** T031.01 through T031.01E — all APPROVED.
**Baseline commit surveyed:** `main` @ `baaaa683e15866ce6343eab3e7368b02f28a8b05`. Confirmed via grep: **no** cross-tab coordination code (`BroadcastChannel`, `navigator.locks`, `SharedWorker`, `storage` event handling) exists anywhere in `frontend/src/` today — this is entirely new design space.

This Discovery directly addresses the single most concrete risk raised in T031.01E §5/§15: the backend's real, already-shipped refresh-token rotation + reuse-detection design (T031.01E's "Headline finding") means any two browser tabs that independently attempt session restoration near-simultaneously can trigger `revokeAllForUser`, logging a legitimate user out of every device. Nothing here re-derives that backend evidence; it is treated as an established constraint.

---

## Option comparison

### A. Web Locks API + BroadcastChannel

**Mechanism:** `navigator.locks.request('auth-refresh', callback)` gives the browser's own, native, atomic mutual-exclusion primitive — only one same-origin context (tab, iframe, or worker) can hold a given named lock at a time; every other requester queues automatically, with no polling and no possibility of two holders existing simultaneously (this is enforced by the browser itself, not application code). The lock holder performs the real `POST /auth/refresh` call, then uses `BroadcastChannel('auth')` to publish the resulting access token (never the refresh token — see Q2) to every other open tab before releasing the lock.

**Strengths:** Provably exclusive (browser-guaranteed, not a hand-rolled protocol with its own race windows); automatic release on tab crash/close (Q4) with zero extra code; the two APIs are complementary (Web Locks solves "only one caller," BroadcastChannel solves "tell everyone the result") rather than overlapping, so the combination isn't redundant.

**Weaknesses:** Newest of the browser-native options — Safari support (both Web Locks and BroadcastChannel) only landed in Safari 15.4 (March 2022, §Q7) — anything older needs a fallback tier.

### B. BroadcastChannel leader election only (no Web Locks)

**Mechanism:** Hand-rolled leader election over `BroadcastChannel` alone — each tab announces itself, a deterministic tie-break (e.g. lowest random ID, or first-announced-wins) decides a "leader," the leader performs refreshes on behalf of everyone, and periodic heartbeats let followers detect a dead leader and re-elect.

**Strengths:** Slightly broader support than Web Locks (BroadcastChannel alone, no dependency on the newer Locks API) — though both landed in Safari at the same version (15.4), so in practice this doesn't buy meaningfully broader coverage over Option A for this project's likely browser matrix.

**Weaknesses:** This is application-level protocol design, not a browser guarantee — there is an inherent race window during election and during leader-death detection (a heartbeat-timeout scheme necessarily means "leader might be dead" is only known after waiting some timeout, during which a stale leader could still be alive-but-slow, or a truly-dead leader's absence hasn't been noticed yet) — meaningfully more complex and more failure-mode-prone to get right than delegating exclusivity to Web Locks. Recovery from a crashed leader (Q4) is slower and less certain than Option A's native release-on-close.

### C. localStorage-based mutex

**Mechanism:** The classic pre-Web-Locks pattern: write a lock key (holder ID + timestamp) to `localStorage`, re-read it back to confirm you actually won (accounts for the fact concurrent `localStorage` writes across tabs aren't atomic), and use the cross-tab `storage` event (fires in *other* tabs when a tab writes to `localStorage`, not in the writing tab itself) to notify/wake waiters.

**Strengths:** The widest possible browser support of any option here — `localStorage` and the `storage` event predate every other mechanism discussed and are supported essentially everywhere this product would ever run, including old Safari versions that lack Web Locks/BroadcastChannel.

**Weaknesses:** No automatic release on crash — a lock left behind by a crashed/killed tab persists in `localStorage` forever unless the protocol includes explicit staleness handling (a timestamp + "locks older than N seconds are reclaimable" rule), which reintroduces a detection-latency window similar to Option B's heartbeat problem, and risks prematurely reclaiming a lock from a genuinely-alive-but-slow holder if the timeout is set too aggressively. Generally considered a legacy pattern specifically because Web Locks was designed to replace it.

### D. SharedWorker

**Mechanism:** A `SharedWorker` is a single JavaScript execution context shared by every same-origin tab (unlike a normal dedicated `Worker`, which is per-tab). Centralizing all token/refresh logic inside the worker eliminates the coordination problem architecturally — there is only ever one execution context capable of calling `/auth/refresh` in the first place, so no explicit locking protocol is even needed; tabs simply message the worker "give me a valid token" and the worker serializes internally as a natural consequence of being single-threaded JS.

**Strengths:** Arguably the most architecturally elegant of the five — the race condition is structurally impossible rather than merely prevented by a protocol.

**Weaknesses (disqualifying, not merely "a browser gap"):** **`SharedWorker` has never been supported in Safari on iOS** — a long-standing, permanent WebKit platform limitation, not a "not yet shipped" situation like the others. Given this product's own backend Auth API already models a distinct `MOBILE` client type (`X-Client-Type` header, T031.01/T031.01E) — implying mobile usage is a real, anticipated audience, not a hypothetical — and given this is specifically a POS product, which in real-world deployments frequently runs on fixed, sometimes-dated terminal hardware/browsers (a product-specific consideration, not generic browser-compat noise), a solution with a permanent iOS Safari gap is a materially higher-risk choice than one with only a version-threshold gap (Options A/B, closeable by requiring a reasonably modern browser) or no gap at all (Option C).

### E. Backend tolerance window / reuse-detection redesign

**Mechanism:** Rather than (or in addition to) solving this purely client-side, the backend grants a short grace period (commonly a few seconds, e.g. Auth0's documented "Refresh Token Rotation Reuse Interval" implements exactly this pattern) after a refresh token is rotated, during which presenting the *just-rotated* (old) token again returns the **same already-issued replacement tokens** rather than being treated as reuse — only a presentation *after* the grace window has elapsed is treated as genuine theft/replay. This is a well-established, credible industry pattern (not invented for this Discovery), and it addresses the *root cause* (the race condition existing at all) rather than working around a symptom.

**Strengths:** Solves the problem even for callers that *don't* participate in any client-side coordination protocol at all (a defense-in-depth safety net against bugs in A/B/C/D's own implementation, a genuinely new tab opened in the exact race window before it's subscribed to the coordination channel, etc.).

**Weaknesses:** Requires real backend changes to `auth.service.ts`'s `refreshToken()` (a grace-window check before the `revokeAllForUser` branch fires, and care to avoid the "duplicate request within the window" path itself triggering yet another rotation, which would just move the race rather than resolve it) — explicitly out of this Discovery's frontend-only authority to implement. **Does not by itself prevent a request storm** — without any client-side coordination, N tabs would still each make a real HTTP call on load; the tolerance window only prevents the *worst* outcome (mass logout), it doesn't eliminate wasted round-trips or guarantee a single source of truth for "the current token" the way A/B/C/D do.

---

## Recommended option (comparison only — not decided here)

**A, with C as an automatic capability-detected fallback**, and **E as an optional backend-side defense-in-depth layer** (a separate decision, not required for A+C to work correctly on its own). Rationale:

- Web Locks gives a provably-safe exclusivity guarantee with zero hand-rolled protocol risk (unlike B), and automatic crash recovery (unlike B/C) — the strongest correctness properties among the client-side-only options.
- Its Safari-version gap is closeable by falling back to Option C specifically for that population, rather than needing to abandon the whole approach or accept SharedWorker's *permanent*, unfixable iOS gap (D).
- E is valuable as a safety net but is backend-scope work this Discovery cannot authorize, and does not on its own solve the request-storm/efficiency half of the problem — presented as a complementary decision, not an alternative to A+C.

---

## Sequence diagrams

### Happy path — two tabs restore session near-simultaneously (Option A)

```
Tab 1                          Browser (Web Locks)          Backend                  Tab 2
  │                                    │                        │                       │
  │  navigator.locks.request('auth')   │                        │                       │
  ├───────────────────────────────────►│                        │                       │
  │         (lock granted)             │                        │                       │
  │◄────────────────────────────────────┤                        │                       │
  │                                    │                        │   navigator.locks     │
  │                                    │◄───────────────────────────request('auth')──────┤
  │                                    │  (Tab 2 queued, waits) │                       │
  │  POST /auth/refresh (cookie auto-attached)                  │                       │
  ├──────────────────────────────────────────────────────────►│                       │
  │                                    │      rotates session   │                       │
  │◄──────────────────────────────────────────────────────────┤                       │
  │  new accessToken                  │                        │                       │
  │  BroadcastChannel('auth').postMessage({ type: 'token', accessToken })              │
  ├─────────────────────────────────────────────────────────────────────────────────►│
  │  release lock                     │                        │                       │
  ├───────────────────────────────────►│                        │                       │
  │                                    │   (lock granted to     │                       │
  │                                    │    Tab 2, but Tab 2     │                       │
  │                                    │    already has a fresh │                       │
  │                                    │    token via broadcast │                       │
  │                                    │    — checks staleness, │                       │
  │                                    │    skips refresh call, │                       │
  │                                    │    releases lock)      │                       │
  │                                    │◄─────────────────────────release (no-op)───────┤
```

Net result: **exactly one** real `/auth/refresh` HTTP call, both tabs end up with the current valid access token, no reuse-detection path is ever exercised.

### Crashed lock holder (Option A)

```
Tab 1 (holds lock)     Browser (Web Locks)      Tab 2 (waiting)
  │                          │                        │
  │  (holds 'auth' lock)     │                        │
  │                          │◄──── request('auth') ──┤
  │                          │   (Tab 2 queued)        │
  │  [Tab 1 process killed / tab closed — no explicit release call ever runs]
  │  X                       │                        │
  │                          │  (Web Locks detects     │
  │                          │   context destroyed,    │
  │                          │   auto-releases lock)   │
  │                          ├───── lock granted ─────►│
  │                          │                        │  proceeds with its own
  │                          │                        │  POST /auth/refresh
```

No manual timeout/staleness detection needed — this is the concrete advantage over Options B/C, both of which need an explicit heartbeat-or-timestamp scheme to reach the same outcome, with an unavoidable detection-latency window while doing so.

### Logout propagation

```
Tab 1 (user clicks Logout)          BroadcastChannel('auth')        Tab 2, Tab 3, ...
  │                                          │                              │
  │  POST /auth/logout                      │                              │
  ├──────────► Backend (revokes session,    │                              │
  │             clears cookie)               │                              │
  │  postMessage({ type: 'logout' })         │                              │
  ├──────────────────────────────────────────┼─────────────────────────────►│
  │                                          │        each tab clears its   │
  │                                          │        own Auth store,       │
  │                                          │        redirects to /login   │
```

Same channel/message-type pattern handles "refresh definitively failed" (§Q5 of T031.01E) — the tab that discovers the failure (whether the lock holder's own refresh call, or any tab's own 401-triggered refresh attempt) broadcasts `{ type: 'refresh-failed' }`, and every tab reacts identically to a real logout, rather than each independently discovering it only when *their own* next API call happens to 401.

---

## Answers

### 1. Which strategy safely guarantees one refresh request at a time across tabs?

**Web Locks API (Option A's core primitive)** is the only browser-*guaranteed* mutual exclusion among the widely-deployable options — the browser itself enforces at most one holder exists, with no protocol-level race window. SharedWorker (D) also guarantees it, structurally, but at the cost of a permanent iOS Safari gap (§Recommended option). Options B and C can be made to work reliably but are hand-rolled protocols with their own inherent race/timing risk, not native guarantees.

### 2. How do waiting tabs receive the new authenticated session state without ever accessing the HttpOnly refresh token?

They never touch it — this is structurally impossible for any of these options, `HttpOnly` blocks *all* JavaScript access to the cookie regardless of coordination mechanism, by design, at the browser level. Coordination is entirely about the **access token**: the one tab that performs the real `/auth/refresh` HTTP call receives the new access token in the JSON response body (exactly as a single-tab refresh already would, per T031.01E §2), then relays *that* value to other tabs via `BroadcastChannel` (or `postMessage` for Option D, or a `localStorage` write + `storage` event for Option C) — never the refresh token, which the relaying tab itself never had access to either.

### 3. Should access tokens be broadcast to other tabs, or should each tab request its own access token after coordination?

**Broadcasting the resulting access token** (recommended direction, not decided) is more efficient — it turns N tabs' worth of restoration into exactly one real backend round-trip instead of N sequential ones. The alternative (each tab, once it's "its turn" via the lock, independently calls `/auth/refresh`) is *safe* (serialized, so no false reuse-detection) but wasteful — N tabs would still mean N real rotations, each invalidating the previous, adding needless latency and load with no corresponding benefit. Security-wise, broadcasting doesn't meaningfully increase exposure: the access token already exists in that tab's memory the moment the HTTP response arrives; relaying it via a same-origin-only `BroadcastChannel` message doesn't expose it to anything that couldn't already reach it (no other origin, extension-sandboxed context, etc. gains new access purely because of this channel).

### 4. How is a crashed lock holder recovered?

Automatically, natively, with Web Locks (Option A) — see the "Crashed lock holder" sequence diagram above. This is the sharpest practical advantage Option A has over B/C, both of which require hand-rolled heartbeat-or-staleness-timeout logic to reach the same recovery, with an inherent detection-latency window (and, for C specifically, the risk of a timeout tuned too aggressively reclaiming a lock from a still-alive-but-momentarily-slow holder — e.g. a genuinely slow network response, not a crash).

### 5. How are logout and refresh failure propagated?

Via the same `BroadcastChannel` used for successful-token relay (§Q2/Q3) — a distinct message type (`logout` / `refresh-failed`) tells every open tab to clear its Auth store and redirect to `/login` immediately, rather than each tab only discovering the session is gone independently, the next time *it* happens to make a failing API call. See the "Logout propagation" sequence diagram above.

### 6. What is the fallback when Web Locks or BroadcastChannel is unavailable?

A capability-detected tiered fallback (Q10's `browser-capability.ts`): if Web Locks is unavailable but `BroadcastChannel` is, degrade to Option B (hand-rolled leader election over the still-available channel). If neither is available, degrade further to Option C (`localStorage` mutex + `storage` events — supported essentially everywhere). If even that were somehow unavailable (not a realistic concern for any browser this product would plausibly need to support), the system can simply accept the original, un-coordinated risk — worst case is an occasional forced re-login for that narrow population, a recoverable UX event, not a security failure.

### 7. Which browsers are supported?

| API | Chrome/Edge | Firefox | Safari (desktop) | Safari (iOS) |
|---|---|---|---|---|
| Web Locks API | 69+ | 96+ | 15.4+ (Mar 2022) | 15.4+ (Mar 2022) |
| BroadcastChannel | 54+ | 38+ | 15.4+ (Mar 2022) | 15.4+ (Mar 2022) |
| SharedWorker | Supported | Supported | Supported (historically some bugginess) | **Never supported — permanent WebKit gap** |
| `localStorage` + `storage` event | Universal | Universal | Universal | Universal |

The Safari-15.4 threshold is the single most consequential real-world constraint for Options A/B (any Safari older than March 2022 needs the Option C fallback) — **worth flagging as product-specific, not generic**: POS deployments frequently run on fixed, sometimes outdated terminal hardware/browsers in the field, so this population may be larger for this product than for a typical consumer web app.

### 8. What tests prove no false reuse detection occurs?

A **Playwright multi-context E2E test** (real browser tab semantics — Web Locks/BroadcastChannel cannot be meaningfully exercised in a `jsdom`-based unit test, per T031.01D's own testing-framework findings): open N same-origin browser contexts/pages sharing the same cookie jar (simulating N tabs of the same logged-in user), trigger session restoration in all of them at nearly the same instant, then assert: (a) exactly one real `/auth/refresh` request reached the backend (observable via network-request interception in the test, or a backend-side request counter/log), (b) all N contexts end up with a valid, working session afterward (a subsequent authenticated call succeeds in every context), (c) the backend's reuse-detection path (`revokeAllForUser`) was never triggered — verifiable by querying the sessions table directly after the test and confirming only ordinary, single-path rotation occurred, not the mass-revocation branch. This test does not exist today (confirmed: no auth E2E coverage exists at all per T031.01E §13) and would need to be net-new.

### 9. Does the backend need any change?

**Not for Options A/B/C/D** — the backend's existing rotation/reuse-detection design is correct and doesn't need to change; the frontend simply needs to stop *causing* the race condition it currently would trigger, by serializing its own refresh calls. **For Option E, yes, by definition** — that option *is* the backend change. Whether E is additionally authorized as a defense-in-depth safety net alongside a client-side option is a separate Architect Decision (§below), not a requirement for A/B/C/D to function correctly on their own.

### 10. Exact future frontend file inventory (proposal, not implemented)

```
frontend/src/
  services/
    auth-coordination.ts       # Web Locks acquire/release + BroadcastChannel pub/sub —
                                 # the core "only one tab refreshes, everyone else waits
                                 # for the broadcast" logic (Option A's implementation)
    api-client.ts               # (already proposed, T031.01E) — its 401-handling interceptor
                                 # now delegates to auth-coordination.ts instead of
                                 # independently calling /auth/refresh
  stores/
    auth-store.ts               # (already named, T031.01C) — gains a BroadcastChannel
                                 # listener for `token`/`logout`/`refresh-failed` messages
  hooks/
    use-session-restore.ts      # (already proposed, T031.01E) — now goes through
                                 # auth-coordination.ts rather than calling /auth/refresh directly
  utils/
    browser-capability.ts        # feature-detects `navigator.locks`/`BroadcastChannel`
                                  # availability, selects the Option A/B/C tier (§Q6)
    local-storage-mutex.ts        # Option C fallback implementation, only invoked when
                                   # browser-capability.ts determines it's needed
```

---

## Failure scenarios (consolidated)

| Scenario | Outcome under Option A (+C fallback) |
|---|---|
| Two tabs restore session within milliseconds of each other | Exactly one real refresh call; both end up authenticated (§Q1-3, sequence diagram) |
| Lock-holder tab crashes mid-refresh | Lock auto-released, next tab proceeds immediately, no manual timeout needed (§Q4) |
| User logs out in one tab while another is idle-but-open | Idle tab receives broadcast, clears its own session immediately (§Q5) |
| A brand-new tab opens in the exact race window, before subscribing to the channel | Not fully solved by A alone — this is precisely the scenario where Option E's backend grace window adds real value as a safety net |
| User's browser is old Safari (< 15.4) | Falls back to Option C automatically; slower/hackier but still race-safe |
| Network failure during the lock-holder's refresh call | Lock-holder's own error handling broadcasts `refresh-failed`; all tabs treat it as a logout (§Q5) — this is a legitimate "user must re-login" outcome, not a bug |

---

## Security analysis

- No option here changes what's exposed to XSS beyond what already exists today (T031.01E §3/§12) — the access token was already reachable by any script running in the page; relaying it via `BroadcastChannel` between same-origin tabs doesn't create a new attack surface, since `BroadcastChannel` is strictly same-origin (a compromised/malicious different-origin page cannot listen to it).
- The refresh token remains permanently inaccessible to JavaScript under every option discussed — this property is guaranteed by `HttpOnly` itself, not by any coordination mechanism, and none of A-E change that.
- Option E (backend grace window) does introduce a small, deliberate widening of the "acceptable reuse" definition — a token presented twice within the grace window is no longer automatically treated as theft. This is a real, if minor, security-policy loosening that needs explicit sign-off, not an unambiguous pure improvement — it trades a small amount of reuse-detection strictness for resilience against false positives, which is the correct tradeoff *if and only if* the window is kept short (seconds, not minutes) and is a deliberate decision, not an oversight.

---

## Browser-support matrix

(See §Q7 table above — reproduced there in full.)

---

## Implementation risks

1. **Getting Web Locks' queuing semantics subtly wrong** — e.g., forgetting that a released-then-immediately-re-requested lock can be granted to the *same* tab again (not a bug, but needs explicit handling so a tab doesn't naively assume "I got the lock, therefore I must be the one who needs to do a real refresh" — the correct check is "is my current token still fresh enough post-broadcast," not "did I get the lock").
2. **BroadcastChannel message ordering/timing** — a tab could receive `token` and `logout` messages out of order under pathological timing (e.g., a refresh in flight when logout is triggered elsewhere) — needs a clear precedence rule (logout always wins) rather than assuming last-message-wins is always correct.
3. **The Option C fallback's staleness-timeout tuning** — too short risks reclaiming a lock from a legitimately slow-but-alive holder (recreating the original race); too long risks a long stall for users on old browsers if a tab genuinely does crash without cleanup.
4. **Testing difficulty** — as noted in §Q8, this can only be meaningfully tested with real multi-context browser automation, not unit tests — a real, nonzero effort cost that needs to be budgeted, not assumed trivial.
5. **Option E, if authorized, needs careful backend design** to avoid the "duplicate request within the grace window itself triggering another rotation" trap described in the Option E write-up — a naive implementation could reintroduce a *narrower* version of the same race at the boundary of the grace window.

---

## Architect Decisions required

1. **Primary strategy**: A (+C fallback) as recommended here, or a different combination (§Option comparison).
2. **Whether Option E (backend grace window) is additionally authorized** as defense-in-depth, as a backend-scope follow-up package — separate from and not required for A+C to function.
3. **Minimum supported browser policy** — does this product need to support pre-15.4 Safari at all (relevant to how much engineering effort the Option C fallback deserves vs. treating it as a rare, acceptable-degradation edge case)? Directly informed by this product's real-world POS-hardware deployment context (§Q7).
4. **Broadcast-vs-independent-request** for propagating the refreshed token to waiting tabs (§Q3) — recommended as broadcast, not decided.
5. **Grace-window duration**, if Option E is authorized (implementation risk #5) — a security/UX tradeoff requiring explicit sign-off, not a default to silently pick.

---

## Explicitly out of scope for this Discovery

No RFC-T031/SPEC-T031 content. No code, dependency, or config changes made. No file created or modified outside `docs/discovery/`. No decision made on any of the 5 items above.

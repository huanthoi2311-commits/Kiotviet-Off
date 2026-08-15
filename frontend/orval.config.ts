import { defineConfig } from 'orval';

/**
 * SPEC-T031 §13. `docs/api/openapi.json` is produced by
 * `backend/scripts/export-openapi.ts` (T032.03) — run `npm run
 * export:openapi` in `backend/` first, then `npm run generate:api` here.
 *
 * T032.03 — `httpClient: 'axios'` is required, not optional: without it,
 * Orval defaults to fetch-style generated calls (`RequestInit`, a 2-arg
 * `mutator(url, options)` signature with `body`), which is incompatible
 * with `apiClientMutator`'s single-argument `AxiosRequestConfig` signature
 * in `services/api-client.ts`. Confirmed only by actually running
 * generation — the mismatch is a type/runtime error, not a lint warning.
 *
 * T052.05C — `headers: true` is required, not optional: without it, Orval
 * silently drops every OpenAPI `in: header` parameter (e.g. the required
 * `Idempotency-Key` on `POST /checkout` and `POST /supplier-payment`) —
 * generated operations only ever emit a hardcoded `Content-Type`, with no
 * argument through which a caller can supply any other header. Confirmed by
 * reading `@orval/core`'s generator directly (`output.headers` gates the
 * `headersProp`/`getQueryParams({queryParams: parameters.header, ...})` path
 * that merges a caller-supplied `headers` object into the request config) —
 * this is a generic, OpenAPI-driven mechanism, not an endpoint-specific
 * patch, so it applies uniformly to every current and future operation that
 * declares a header parameter.
 */
export default defineConfig({
  posErpApi: {
    input: '../docs/api/openapi.json',
    output: {
      mode: 'tags-split',
      target: 'src/generated',
      client: 'react-query',
      httpClient: 'axios',
      headers: true,
      override: {
        mutator: {
          path: './src/services/api-client.ts',
          name: 'apiClientMutator',
        },
      },
    },
  },
});

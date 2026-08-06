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
 */
export default defineConfig({
  posErpApi: {
    input: '../docs/api/openapi.json',
    output: {
      mode: 'tags-split',
      target: 'src/generated',
      client: 'react-query',
      httpClient: 'axios',
      override: {
        mutator: {
          path: './src/services/api-client.ts',
          name: 'apiClientMutator',
        },
      },
    },
  },
});

import { defineConfig } from 'orval';

/**
 * Config only (SPEC-T031 §13). Do NOT run `npm run generate:api` until
 * `docs/api/openapi.json` exists — that file, and the backend export script
 * that produces it, are backend-scope and require separate authorization.
 */
export default defineConfig({
  posErpApi: {
    input: '../docs/api/openapi.json',
    output: {
      mode: 'tags-split',
      target: 'src/generated',
      client: 'react-query',
      override: {
        mutator: {
          path: './src/services/api-client.ts',
          name: 'apiClientMutator',
        },
      },
    },
  },
});

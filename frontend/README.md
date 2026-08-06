# Frontend — POS ERP Enterprise

Next.js 15 (App Router) frontend, built to SPEC-T031 (`docs/specifications/SPEC-T031-Frontend-Architecture.md`).

For environment setup, prerequisites, and running the dev server against the backend, see
[`docs/setup/DEVELOPMENT-SETUP.md`](../docs/setup/DEVELOPMENT-SETUP.md).

## Scripts

| Script                 | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `npm run dev`          | Start the dev server (Turbopack)                             |
| `npm run build`        | Production build (Turbopack)                                 |
| `npm run lint`         | ESLint                                                       |
| `npm run typecheck`    | `tsc --noEmit`                                               |
| `npm run test`         | Vitest (unit/component)                                      |
| `npm run format`       | Prettier, write mode                                         |
| `npm run generate:api` | Regenerate the Orval API client from `docs/api/openapi.json` |

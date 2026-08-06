import type { HttpHandler } from 'msw';

/**
 * Shared MSW handlers (SPEC-T031 §25). Empty until real generated API
 * endpoints exist to mock — individual test files add their own handlers
 * via `server.use(...)` as needed.
 */
export const handlers: HttpHandler[] = [];

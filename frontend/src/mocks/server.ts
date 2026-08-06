import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Node-based MSW server for Vitest (SPEC-T031 §25) — never a real network call. */
export const server = setupServer(...handlers);

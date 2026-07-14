import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  requestId: string;
}

export const requestContextStorage =
  new AsyncLocalStorage<RequestContextStore>();

export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

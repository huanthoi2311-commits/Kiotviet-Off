import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '@/stores/auth-store';
import { broadcastLogout, requestCoordinatedRefresh } from './auth-coordination';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export interface NormalizedApiError {
  kind: 'api-error';
  code: string;
  message: string;
  errors?: unknown;
  traceId?: string;
  status?: number;
}

export interface NormalizedNetworkError {
  kind: 'network-error';
  message: string;
}

export type NormalizedError = NormalizedApiError | NormalizedNetworkError;

interface BackendErrorEnvelope {
  success: false;
  code: string;
  message: string;
  errors?: unknown;
  traceId?: string;
  timestamp?: string;
}

function isBackendErrorEnvelope(data: unknown): data is BackendErrorEnvelope {
  return (
    typeof data === 'object' && data !== null && (data as { success?: unknown }).success === false
  );
}

/**
 * Single normalization point for every API error (SPEC-T031 FR9, §20).
 * Calling code must never parse `error.response.data` itself, and a
 * network-level failure (no response at all) must never be coerced into
 * the same shape as a real backend error envelope.
 */
export function normalizeError(error: unknown): NormalizedError {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return { kind: 'network-error', message: error.message || 'Network error' };
    }

    const { data, status } = error.response;
    if (isBackendErrorEnvelope(data)) {
      return {
        kind: 'api-error',
        code: data.code,
        message: data.message,
        errors: data.errors,
        traceId: data.traceId,
        status,
      };
    }

    return { kind: 'api-error', code: 'UNKNOWN', message: error.message, status };
  }

  return {
    kind: 'network-error',
    message: error instanceof Error ? error.message : 'Unknown error',
  };
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

/**
 * Performs the real `/auth/refresh` call. Deliberately bypasses `apiClient`
 * (which would recurse back into the 401 handler below) — the refresh
 * cookie is attached automatically by the browser via `withCredentials`.
 * Exported so `use-session-restore.ts` shares this exact call instead of
 * duplicating it.
 */
export async function refreshAccessToken(): Promise<string> {
  const response = await axios.post<{ accessToken: string }>(
    `${API_BASE_URL}/auth/refresh`,
    undefined,
    {
      withCredentials: true,
    },
  );
  const { accessToken } = response.data;
  useAuthStore.getState().setAccessToken(accessToken);
  return accessToken;
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableRequestConfig | undefined;
    const isRefreshCall = config?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && config && !config._retried && !isRefreshCall) {
      config._retried = true;
      try {
        const newToken = await requestCoordinatedRefresh(
          refreshAccessToken,
          () => useAuthStore.getState().accessToken,
        );
        config.headers.set('Authorization', `Bearer ${newToken}`);
        return apiClient(config);
      } catch {
        useAuthStore.getState().clear();
        broadcastLogout();
        return Promise.reject(normalizeError(error));
      }
    }

    return Promise.reject(normalizeError(error));
  },
);

/**
 * Custom-instance mutator for Orval's `react-query` client (SPEC-T031 §13):
 * every generated call routes through `apiClient`, so FR9's error
 * normalization and the request/response interceptors above apply
 * uniformly. Referenced only from `orval.config.ts` — not exercised until
 * generation actually runs against a real `docs/api/openapi.json`.
 */
export function apiClientMutator<T>(config: AxiosRequestConfig): Promise<T> {
  return apiClient(config).then((response) => response.data as T);
}

import { useMutation } from '@tanstack/react-query';
import { apiClient, normalizeError, type NormalizedError } from '@/services/api-client';

/**
 * T049 AD-1 — the ONE approved exception to "always use generated Orval hooks" in this domain.
 * `GET /suppliers/export` returns a raw `.xlsx` binary with no OpenAPI response schema (the
 * controller bypasses the envelope via `@Res()`+`res.send(buffer)`), so the generated hook is
 * typed `void` and unusable for real download — `apiClientMutator` unconditionally assumes a JSON
 * envelope and unwraps `response.data.data`, which breaks on a raw binary body. This calls the
 * shared `apiClient` axios instance directly (same auth/refresh interceptors as every generated
 * hook, since those live on `apiClient` itself, not on `apiClientMutator`) with
 * `responseType: 'blob'`, bypassing only the envelope-unwrapping layer. Every other Supplier
 * endpoint uses generated hooks unchanged (T049 spec §8).
 */
export interface SupplierExportFilters {
  search?: string;
  status?: string;
  province?: string;
  sortBy?: string;
  sortOrder?: string;
}

const DEFAULT_FILENAME = 'suppliers.xlsx';

function extractFilename(contentDisposition: unknown): string {
  if (typeof contentDisposition !== 'string') return DEFAULT_FILENAME;
  const match = /filename="?([^"]+)"?/.exec(contentDisposition);
  return match?.[1] || DEFAULT_FILENAME;
}

async function exportSuppliersRequest(filters: SupplierExportFilters): Promise<void> {
  try {
    const response = await apiClient.get('/suppliers/export', {
      params: filters,
      responseType: 'blob',
    });
    const filename = extractFilename(response.headers['content-disposition']);
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw normalizeError(error);
  }
}

export function useSupplierExport() {
  return useMutation<void, NormalizedError, SupplierExportFilters>({
    mutationFn: exportSuppliersRequest,
  });
}

import { useMutation } from '@tanstack/react-query';
import { type NormalizedError } from '@/services/api-client';
import { downloadFile } from '@/lib/file-download';

/**
 * T049 AD-1 — the ONE approved exception to "always use generated Orval hooks" in this domain.
 * `GET /suppliers/export` returns a raw `.xlsx` binary with no OpenAPI response schema (the
 * controller bypasses the envelope via `@Res()`+`res.send(buffer)`), so the generated hook is
 * typed `void` and unusable for real download. Request/response/DOM-download plumbing now lives in
 * the shared `downloadFile` utility (T050 AD-2), extracted once Purchase Report Export proved the
 * identical failure mode a second time. Every other Supplier endpoint uses generated hooks
 * unchanged (T049 spec §8).
 */
export interface SupplierExportFilters {
  search?: string;
  status?: string;
  province?: string;
  sortBy?: string;
  sortOrder?: string;
}

const DEFAULT_FILENAME = 'suppliers.xlsx';

export function useSupplierExport() {
  return useMutation<void, NormalizedError, SupplierExportFilters>({
    mutationFn: (filters) =>
      downloadFile({
        url: '/suppliers/export',
        params: filters,
        fallbackFilename: DEFAULT_FILENAME,
      }),
  });
}

import { useMutation } from '@tanstack/react-query';
import { downloadFile } from '@/lib/file-download';
import { type NormalizedError } from '@/services/api-client';
import type {
  PurchaseReportControllerExportFormat,
  PurchaseReportControllerExportGroupBy,
} from '@/generated/pOSERPEnterpriseAPI.schemas';

/**
 * T050 AD-2 — second proven binary-download case, built on the shared `downloadFile` utility
 * extracted from Supplier Export (T049 AD-1). Filename is server-computed and dynamic
 * (`purchase-report-${groupBy}.${extension}`, delivered via Content-Disposition —
 * `purchase-report.controller.ts`); the fallback below mirrors that same server-side naming for
 * the rare case the header is unavailable.
 */
export interface PurchaseReportExportFilters {
  dateFrom?: string;
  dateTo?: string;
  groupBy: PurchaseReportControllerExportGroupBy;
  format: PurchaseReportControllerExportFormat;
}

const FILE_EXTENSION_BY_FORMAT: Record<PurchaseReportControllerExportFormat, string> = {
  EXCEL: 'xlsx',
  CSV: 'csv',
  PDF: 'pdf',
};

export function usePurchaseReportExport() {
  return useMutation<void, NormalizedError, PurchaseReportExportFilters>({
    mutationFn: (filters) =>
      downloadFile({
        url: '/purchase-reports/export',
        params: filters,
        fallbackFilename: `purchase-report-${filters.groupBy.toLowerCase()}.${FILE_EXTENSION_BY_FORMAT[filters.format]}`,
      }),
  });
}

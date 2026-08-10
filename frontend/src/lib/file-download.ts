import { apiClient, normalizeError } from '@/services/api-client';

/**
 * T050 AD-2 — extracted after two proven, structurally-identical binary-download endpoints
 * (Supplier Export, T049 AD-1; Purchase Report Export, T050 AD-2): both bypass the OpenAPI
 * envelope via `@Res()` + manual `res.send()`, so their generated Orval hooks are typed
 * `apiClientMutator<void>` — unusable, since `apiClientMutator` unconditionally unwraps a JSON
 * envelope that a raw binary body doesn't have. This shares only the request/response/DOM-download
 * plumbing that is verbatim-identical between the two cases (`apiClient` direct call with
 * `responseType: 'blob'`, Content-Disposition filename extraction, object-URL lifecycle). Each call
 * site still owns its own `useMutation` and public filter type — this is not a generic HTTP client
 * and not a replacement for Orval.
 */

export function extractFilenameFromContentDisposition(
  contentDisposition: unknown,
  fallbackFilename: string,
): string {
  if (typeof contentDisposition !== 'string') return fallbackFilename;
  const match = /filename="?([^"]+)"?/.exec(contentDisposition);
  return match?.[1] || fallbackFilename;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface DownloadFileParams<TFilters> {
  url: string;
  params: TFilters;
  fallbackFilename: string;
}

export async function downloadFile<TFilters>({
  url,
  params,
  fallbackFilename,
}: DownloadFileParams<TFilters>): Promise<void> {
  try {
    const response = await apiClient.get(url, { params, responseType: 'blob' });
    const filename = extractFilenameFromContentDisposition(
      response.headers['content-disposition'],
      fallbackFilename,
    );
    triggerBlobDownload(response.data as Blob, filename);
  } catch (error) {
    throw normalizeError(error);
  }
}

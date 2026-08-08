import { MutationCache, MutationObserver, QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportMutationError, reportQueryError } from './query-provider';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function apiError(code: string, message: string) {
  return { kind: 'api-error' as const, code, message };
}

describe('reportQueryError / reportMutationError (T038.08B, SPEC-T038A)', () => {
  beforeEach(async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
  });

  it('reportQueryError shows a toast for a NormalizedError (unchanged QueryCache behavior)', async () => {
    const { toast } = await import('sonner');
    reportQueryError(apiError('CATEGORY_001', 'Không tìm thấy danh mục'));
    expect(toast.error).toHaveBeenCalledWith('Không tìm thấy danh mục');
  });

  it('reportMutationError shows a toast when the mutation has no meta flag (default, unchanged behavior)', async () => {
    const { toast } = await import('sonner');
    const queryClient = new QueryClient();
    const mutationCache = new MutationCache({});
    const mutation = mutationCache.build<unknown, unknown, unknown, unknown>(queryClient, {
      mutationFn: async () => undefined,
    });

    reportMutationError(
      apiError('CATEGORY_001', 'Không tìm thấy danh mục'),
      undefined,
      undefined,
      mutation,
    );

    expect(toast.error).toHaveBeenCalledWith('Không tìm thấy danh mục');
  });

  it('reportMutationError skips the toast when meta.suppressGlobalErrorToast is true', async () => {
    const { toast } = await import('sonner');
    const queryClient = new QueryClient();
    const mutationCache = new MutationCache({});
    const mutation = mutationCache.build<unknown, unknown, unknown, unknown>(queryClient, {
      mutationFn: async () => undefined,
      meta: { suppressGlobalErrorToast: true },
    });

    reportMutationError(
      apiError('CATEGORY_004', 'Không thể xóa danh mục đang có sản phẩm sử dụng'),
      undefined,
      undefined,
      mutation,
    );

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('end-to-end: a real mutation without the flag still reports through MutationCache (existing/unrelated mutations retain current global-toast behavior)', async () => {
    const { toast } = await import('sonner');
    const queryClient = new QueryClient({
      mutationCache: new MutationCache({ onError: reportMutationError }),
    });
    const observer = new MutationObserver(queryClient, {
      mutationFn: async () => {
        throw apiError('CATEGORY_500', 'Đã xảy ra lỗi hệ thống');
      },
    });

    await observer.mutate().catch(() => {});

    expect(toast.error).toHaveBeenCalledWith('Đã xảy ra lỗi hệ thống');
  });

  it('end-to-end: a real mutation with the flag does not report through MutationCache', async () => {
    const { toast } = await import('sonner');
    const queryClient = new QueryClient({
      mutationCache: new MutationCache({ onError: reportMutationError }),
    });
    const observer = new MutationObserver(queryClient, {
      mutationFn: async () => {
        throw apiError('CATEGORY_004', 'Không thể xóa danh mục đang có sản phẩm sử dụng');
      },
      meta: { suppressGlobalErrorToast: true },
    });

    await observer.mutate().catch(() => {});

    expect(toast.error).not.toHaveBeenCalled();
  });
});

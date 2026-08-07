import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { NormalizedApiError } from '@/services/api-client';
import { useCrudForm } from './use-crud-form';

const schema = z.object({
  name: z.string().min(1, 'Tên là bắt buộc'),
});

describe('useCrudForm (T034.01 §12)', () => {
  it('validates against the supplied zod schema on submit', async () => {
    const { result } = renderHook(() => useCrudForm({ schema, defaultValues: { name: '' } }));

    await act(async () => {
      await result.current.handleSubmit(() => {})();
    });

    expect(result.current.formState.errors.name?.message).toBe('Tên là bắt buộc');
  });

  it('combines isMutating with RHF submitting state', () => {
    const { result, rerender } = renderHook(
      ({ isMutating }: { isMutating: boolean }) =>
        useCrudForm({ schema, defaultValues: { name: '' }, isMutating }),
      { initialProps: { isMutating: false } },
    );

    expect(result.current.isSubmitting).toBe(false);

    rerender({ isMutating: true });
    expect(result.current.isSubmitting).toBe(true);
  });

  it('setServerError joins a flat backend errors[] array into a single root-level form error (not per-field)', async () => {
    const { result, rerender } = renderHook(() =>
      useCrudForm({ schema, defaultValues: { name: '' } }),
    );
    // RHF only re-renders subscribers of a formState key once it has been
    // *read* during a render (its Proxy-based dirty tracking) — reading
    // `.errors` here first, then forcing a rerender after the update,
    // mirrors how a real consumer (e.g. `CrudForm`) observes it.
    void result.current.formState.errors;

    const error: NormalizedApiError = {
      kind: 'api-error',
      code: 'CATEGORY_002',
      message: 'Mã danh mục đã tồn tại',
      errors: ['Mã danh mục đã tồn tại', 'Vui lòng chọn mã khác'],
    };

    await act(async () => {
      result.current.setServerError(error);
    });
    rerender();

    expect(result.current.formState.errors.root?.message).toBe(
      'Mã danh mục đã tồn tại; Vui lòng chọn mã khác',
    );
    expect(result.current.formState.errors.name).toBeUndefined();
  });

  it('setServerError falls back to error.message when errors[] is absent or not a string array', async () => {
    const { result, rerender } = renderHook(() =>
      useCrudForm({ schema, defaultValues: { name: '' } }),
    );
    void result.current.formState.errors;

    await act(async () => {
      result.current.setServerError({
        kind: 'api-error',
        code: 'CATEGORY_500',
        message: 'Đã xảy ra lỗi hệ thống',
      });
    });
    rerender();

    expect(result.current.formState.errors.root?.message).toBe('Đã xảy ra lỗi hệ thống');
  });
});

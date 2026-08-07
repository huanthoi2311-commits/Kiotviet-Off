import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldValues, type UseFormProps, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import type { NormalizedApiError } from '@/services/api-client';

/**
 * `TFieldValues` is the schema's raw Input shape (what `defaultValues`,
 * `register()`, etc. work with); `TOutput` is its Output shape after
 * validation — they diverge for any schema using `z.coerce.*`,
 * `.transform()` or `.preprocess()` (T034.03A Fix #2: the previous
 * `z.ZodType<TSchema, TSchema>` constraint forced Input === Output,
 * rejecting exactly those schemas). Defaults to `TFieldValues` so callers
 * with a plain, non-transforming schema don't need to specify it.
 */
export interface UseCrudFormOptions<
  TFieldValues extends FieldValues,
  TOutput = TFieldValues,
> extends Omit<UseFormProps<TFieldValues, unknown, TOutput>, 'resolver'> {
  schema: z.ZodType<TOutput, TFieldValues>;
  /** Combined with RHF's own `formState.isSubmitting` — T034.01 §12. */
  isMutating?: boolean;
}

export interface UseCrudFormReturn<
  TFieldValues extends FieldValues,
  TOutput = TFieldValues,
> extends UseFormReturn<TFieldValues, unknown, TOutput> {
  isSubmitting: boolean;
  /**
   * T034.01 §12 — the backend's validation-error envelope is a flat
   * `errors: string[]` (confirmed via `http-exception.filter.ts`), with no
   * per-field association. This sets a single root-level form error
   * joining every message. A module's own form may additionally call
   * `setError(fieldName, ...)` itself when it recognizes a specific
   * `error.code` (e.g. Category's `CATEGORY_002` duplicate-code) — that
   * mapping is module-specific and deliberately not built into this
   * generic hook (Acceptance Criteria §23: zero module-specific
   * references in shared primitives).
   */
  setServerError: (error: NormalizedApiError) => void;
}

export function useCrudForm<TFieldValues extends FieldValues, TOutput = TFieldValues>({
  schema,
  isMutating = false,
  ...formOptions
}: UseCrudFormOptions<TFieldValues, TOutput>): UseCrudFormReturn<TFieldValues, TOutput> {
  const form = useForm<TFieldValues, unknown, TOutput>({
    ...formOptions,
    resolver: zodResolver(schema),
  });

  const setServerError = (error: NormalizedApiError) => {
    const messages =
      Array.isArray(error.errors) && error.errors.every((item) => typeof item === 'string')
        ? (error.errors as string[])
        : [error.message];

    form.setError('root', { type: 'server', message: messages.join('; ') });
  };

  return {
    ...form,
    isSubmitting: form.formState.isSubmitting || isMutating,
    setServerError,
  };
}

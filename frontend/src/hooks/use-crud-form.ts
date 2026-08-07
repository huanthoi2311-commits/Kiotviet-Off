import { zodResolver } from '@hookform/resolvers/zod';
import {
  useForm,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import type { z } from 'zod';
import type { NormalizedApiError } from '@/services/api-client';

export interface UseCrudFormOptions<TSchema extends FieldValues> extends Omit<
  UseFormProps<TSchema>,
  'resolver'
> {
  schema: z.ZodType<TSchema, TSchema>;
  /** Combined with RHF's own `formState.isSubmitting` — T034.01 §12. */
  isMutating?: boolean;
}

export interface UseCrudFormReturn<TSchema extends FieldValues> extends UseFormReturn<TSchema> {
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

export function useCrudForm<TSchema extends FieldValues>({
  schema,
  isMutating = false,
  ...formOptions
}: UseCrudFormOptions<TSchema>): UseCrudFormReturn<TSchema> {
  const form = useForm<TSchema>({
    ...formOptions,
    // zodResolver's generic inference from a caller-supplied `z.ZodType<TSchema>`
    // widens the resolver's input type to `FieldValues`, which `useForm<TSchema>`
    // then rejects — the runtime contract (schema's output IS TSchema) still
    // holds, so this narrows the type back rather than widening useForm's own.
    resolver: zodResolver(schema) as Resolver<TSchema>,
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

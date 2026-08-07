'use client';

import type { FieldValues } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { UseCrudFormReturn } from '@/hooks/use-crud-form';

export interface CrudFormProps<TSchema extends FieldValues> {
  form: UseCrudFormReturn<TSchema>;
  onSubmit: (values: TSchema) => void | Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  children: React.ReactNode;
}

/**
 * T034.01 §12/§21 — thin presentational wrapper: consistent field-row
 * container, root-error display, submit/cancel row. Owns none of the
 * actual field markup (`children`), so it stays agnostic to what fields
 * any given module needs (Acceptance Criteria §23).
 */
export function CrudForm<TSchema extends FieldValues>({
  form,
  onSubmit,
  onCancel,
  submitLabel = 'Lưu',
  cancelLabel = 'Hủy',
  children,
}: CrudFormProps<TSchema>) {
  const rootError = form.formState.errors.root;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {rootError?.message ? (
        <Alert variant="destructive">
          <AlertDescription>{rootError.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-4">{children}</div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={form.isSubmitting}>
          {cancelLabel}
        </Button>
        <Button type="submit" disabled={form.isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

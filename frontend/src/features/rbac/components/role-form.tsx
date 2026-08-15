'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getRolesControllerListQueryKey, useRolesControllerCreate } from '@/generated/rbac/rbac';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { CrudForm } from '@/components/common/crud-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCrudForm } from '@/hooks/use-crud-form';
import type { NormalizedError } from '@/services/api-client';
import { createRoleSchema, type CreateRoleFormValues } from '../schema';

/** T052.03C §4 — Role Create. Fields exactly match `CreateRoleDto`: code/name/description. No
 * `isSystem` field (not writable — backend never accepts it on create). */
export function RoleCreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const form = useCrudForm({
    schema: createRoleSchema,
    defaultValues: { code: '', name: '', description: '' },
  });
  // RHF's formState Proxy only registers a subscription once a key is *read* during render —
  // CrudForm reads `errors.root` internally but that alone doesn't subscribe this component
  // (same T036.10 finding as every other CrudForm-based create form in this codebase).
  void form.formState.errors.root;

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form.formState.isDirty]);

  const createMutation = useRolesControllerCreate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getRolesControllerListQueryKey() });
        toast.success('Đã tạo vai trò');
        router.push(`/roles/${response.id}`);
      },
      onError: (error) => {
        if (error.kind === 'api-error') {
          if (error.code === 'RBAC_002') {
            form.setError('code', { type: 'server', message: error.message });
            return;
          }
          form.setServerError(error);
          return;
        }
        form.setError('root', { type: 'server', message: error.message });
      },
    },
  });

  const onSubmit = (values: CreateRoleFormValues) => {
    createMutation.mutate({
      data: {
        code: values.code,
        name: values.name,
        description: values.description || undefined,
      },
    });
  };

  const handleCancel = () => {
    if (form.formState.isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    router.push('/roles');
  };

  return (
    <>
      <CrudForm form={form} onSubmit={onSubmit} onCancel={handleCancel} submitLabel="Tạo vai trò">
        <div className="space-y-1.5">
          <Label htmlFor="code">Mã vai trò</Label>
          <Input
            id="code"
            aria-invalid={Boolean(form.formState.errors.code)}
            {...form.register('code')}
          />
          {form.formState.errors.code && (
            <p className="text-destructive text-sm">{form.formState.errors.code.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Tên vai trò</Label>
          <Input
            id="name"
            aria-invalid={Boolean(form.formState.errors.name)}
            {...form.register('name')}
          />
          {form.formState.errors.name && (
            <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Mô tả</Label>
          <Input
            id="description"
            aria-invalid={Boolean(form.formState.errors.description)}
            {...form.register('description')}
          />
          {form.formState.errors.description && (
            <p className="text-destructive text-sm">{form.formState.errors.description.message}</p>
          )}
        </div>
      </CrudForm>
      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Hủy các thay đổi chưa lưu?"
        description="Các thay đổi bạn đã nhập sẽ không được lưu."
        confirmLabel="Hủy thay đổi"
        cancelLabel="Tiếp tục chỉnh sửa"
        danger
        onConfirm={() => router.push('/roles')}
      />
    </>
  );
}

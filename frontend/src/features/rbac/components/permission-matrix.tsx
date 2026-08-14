'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getRolesControllerDetailQueryKey,
  getRolesControllerListQueryKey,
  useRolesControllerAssignPermissions,
} from '@/generated/rbac/rbac';
import type { PermissionResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { NormalizedError } from '@/services/api-client';

/** Same nullable-string codegen quirk as `role-table.tsx`. */
function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export interface PermissionMatrixProps {
  roleId: string;
  permissions: PermissionResponseDto[];
  initialPermissionCodes: string[];
  /** `role:update` — read-only rendering (still shows current selection, just non-interactive
   * and no Save/Cancel row) when false, T052.03C §5/§6. */
  canEdit: boolean;
}

/**
 * T052.03C §6 — `POST /roles/:id/permissions` is REPLACE-ALL (backend `@ArrayNotEmpty()`), so
 * every save submits the COMPLETE selected set, never a delta. §7 — on `RBAC_OWNER_PERMISSION_REQUIRED`
 * (or any other mutation failure), the editor stays open with the user's in-progress selection
 * intact; only a successful save re-baselines `savedCodes`. This component never re-implements the
 * owner effective-permission algorithm itself — the backend is the sole authority (§7).
 */
export function PermissionMatrix({
  roleId,
  permissions,
  initialPermissionCodes,
  canEdit,
}: PermissionMatrixProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialPermissionCodes));
  const [savedCodes, setSavedCodes] = useState<Set<string>>(() => new Set(initialPermissionCodes));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionResponseDto[]>();
    for (const permission of permissions) {
      const list = map.get(permission.group) ?? [];
      list.push(permission);
      map.set(permission.group, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  const isDirty = useMemo(() => {
    if (selected.size !== savedCodes.size) return true;
    for (const code of selected) {
      if (!savedCodes.has(code)) return true;
    }
    return false;
  }, [selected, savedCodes]);

  const mutation = useRolesControllerAssignPermissions<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getRolesControllerDetailQueryKey(roleId) });
        queryClient.invalidateQueries({ queryKey: getRolesControllerListQueryKey() });
        const next = new Set(response.permissionCodes);
        setSavedCodes(next);
        setSelected(next);
        setMutationError(null);
        toast.success(
          'Đã lưu quyền. Thay đổi quyền sẽ có hiệu lực sau khi người dùng đăng nhập lại.',
        );
      },
      onError: (error) => {
        setMutationError(
          error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định',
        );
      },
    },
  });

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  function toggleGroup(codes: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const code of codes) {
        if (checked) {
          next.add(code);
        } else {
          next.delete(code);
        }
      }
      return next;
    });
  }

  function handleSave() {
    if (selected.size === 0) {
      setValidationError('Phải chọn ít nhất một quyền trước khi lưu.');
      return;
    }
    setValidationError(null);
    setMutationError(null);
    mutation.mutate({ id: roleId, data: { permissionCodes: Array.from(selected) } });
  }

  function handleCancel() {
    setSelected(new Set(savedCodes));
    setValidationError(null);
    setMutationError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold">Quyền hạn</h2>

      {mutationError && (
        <Alert variant="destructive">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}
      {validationError && (
        <Alert variant="destructive">
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        {grouped.map(([group, groupPermissions]) => {
          const codes = groupPermissions.map((permission) => permission.code);
          const selectedCount = codes.filter((code) => selected.has(code)).length;
          const allSelected = codes.length > 0 && selectedCount === codes.length;
          const someSelected = selectedCount > 0 && !allSelected;

          return (
            <fieldset key={group} className="rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium capitalize">{group}</legend>
              <div className="mb-2 flex items-center gap-2 border-b pb-2">
                <Checkbox
                  id={`permission-group-${group}`}
                  checked={allSelected}
                  indeterminate={someSelected}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => toggleGroup(codes, checked)}
                />
                <Label htmlFor={`permission-group-${group}`} className="text-sm font-normal">
                  Chọn tất cả — {group}
                </Label>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {groupPermissions.map((permission) => {
                  const description = asNullableString(permission.description);
                  const label = description
                    ? `${description} (${permission.code})`
                    : permission.code;
                  return (
                    <div key={permission.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`permission-${permission.code}`}
                        checked={selected.has(permission.code)}
                        disabled={!canEdit}
                        onCheckedChange={() => toggle(permission.code)}
                      />
                      <Label
                        htmlFor={`permission-${permission.code}`}
                        className="text-sm font-normal"
                      >
                        {label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={!isDirty || mutation.isPending}
          >
            Hủy thay đổi
          </Button>
          <Button type="button" onClick={handleSave} disabled={mutation.isPending}>
            Lưu quyền
          </Button>
        </div>
      )}
    </div>
  );
}

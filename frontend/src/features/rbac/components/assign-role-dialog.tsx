'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getUserControllerFindOneQueryKey } from '@/generated/user/user';
import { useRolesControllerAssignToUser } from '@/generated/rbac/rbac';
import type { RoleResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { NormalizedError } from '@/services/api-client';

export interface AssignRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** Already excludes roles the user currently holds (T052.03C §9 — idempotent-reassign avoidance:
   * an already-held role is never offered again). */
  availableRoles: RoleResponseDto[];
}

/** T052.03C §9 — `POST /roles/assign` with `{ userId, roleId }`. User can hold multiple roles. */
export function AssignRoleDialog({
  open,
  onOpenChange,
  userId,
  availableRoles,
}: AssignRoleDialogProps) {
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useRolesControllerAssignToUser<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getUserControllerFindOneQueryKey(userId) });
        toast.success('Đã gán vai trò cho người dùng');
        setErrorMessage(null);
        setRoleId(undefined);
        onOpenChange(false);
      },
      onError: (error) => {
        setErrorMessage(
          error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định',
        );
      },
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setErrorMessage(null);
      setRoleId(undefined);
    }
    onOpenChange(next);
  };

  const handleConfirm = () => {
    if (!roleId || mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate({ data: { userId, roleId } });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gán vai trò</DialogTitle>
          <DialogDescription>Chọn một vai trò để gán cho người dùng này.</DialogDescription>
        </DialogHeader>
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="assign-role-select">Vai trò</Label>
          <Select value={roleId} onValueChange={(value) => setRoleId(value ?? undefined)}>
            <SelectTrigger id="assign-role-select" className="w-full" aria-label="Vai trò">
              <SelectValue placeholder="— Chọn vai trò —" />
            </SelectTrigger>
            <SelectContent>
              {availableRoles.length === 0 ? (
                <div className="text-muted-foreground px-2 py-1.5 text-sm">
                  Không còn vai trò nào để gán.
                </div>
              ) : (
                availableRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name} ({role.code})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            aria-disabled={mutation.isPending}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            onClick={() => {
              if (mutation.isPending) return;
              handleOpenChange(false);
            }}
          >
            Hủy
          </Button>
          <Button
            aria-disabled={mutation.isPending || !roleId}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            onClick={handleConfirm}
          >
            Gán vai trò
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

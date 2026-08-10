'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardEdit } from 'lucide-react';
import { useInventoryAdjustmentControllerFindOne } from '@/generated/inventory-adjustment/inventory-adjustment';
import type { InventoryAdjustmentResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { PermissionButton } from '@/components/common/permission-button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { NormalizedError } from '@/services/api-client';
import { useProductOptions, useWarehouseOptions } from '../../inventory/use-inventory-relations';
import {
  InventoryAdjustmentActionDialog,
  type InventoryAdjustmentActionDialogMode,
} from './inventory-adjustment-action-dialog';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  SUBMITTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  COMPLETED: 'Hoàn tất',
};

const REASON_LABEL: Record<string, string> = {
  LOST: 'Thất lạc',
  DAMAGED: 'Hư hỏng',
  FOUND: 'Tìm thấy',
  SYSTEM: 'Hệ thống',
  OTHER: 'Khác',
};

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** T044 Phase M — Inventory Adjustment Detail. Actions: DRAFT → Submit, SUBMITTED → Approve, APPROVED → Complete. */
export function InventoryAdjustmentDetail({ id }: { id: string }) {
  const [actionMode, setActionMode] = useState<InventoryAdjustmentActionDialogMode | null>(null);

  const {
    data: adjustment,
    isLoading,
    isError,
    error,
    refetch,
  } = useInventoryAdjustmentControllerFindOne<InventoryAdjustmentResponseDto, NormalizedError>(id);

  const { warehouseOptions } = useWarehouseOptions(undefined);
  const { productOptions } = useProductOptions();
  const warehouseNameById = useMemo(
    () => new Map(warehouseOptions.map((o) => [o.value, o.label])),
    [warehouseOptions],
  );
  const productNameById = useMemo(
    () => new Map(productOptions.map((o) => [o.value, o.label])),
    [productOptions],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isError && error.kind === 'api-error' && error.code === 'INVENTORY_ADJUSTMENT_001') {
    return (
      <EmptyState
        icon={ClipboardEdit}
        title="Không tìm thấy phiếu điều chỉnh"
        description="Phiếu này có thể không tồn tại."
        action={<Button render={<Link href="/inventory-adjustments">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !adjustment) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <p className="text-destructive text-sm">
          {error?.message ?? 'Đã xảy ra lỗi không xác định'}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground text-sm">Mã phiếu</dt>
          <dd className="font-medium">{adjustment.code}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Trạng thái</dt>
          <dd className="font-medium">{STATUS_LABEL[adjustment.status] ?? adjustment.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Lý do</dt>
          <dd className="font-medium">{REASON_LABEL[adjustment.reason] ?? adjustment.reason}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Kho</dt>
          <dd className="font-medium">
            {warehouseNameById.get(adjustment.warehouseId) ?? adjustment.warehouseId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Ngày tạo</dt>
          <dd className="font-medium">{new Date(adjustment.createdAt).toLocaleString('vi-VN')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Ghi chú</dt>
          <dd className="font-medium">{asNullableString(adjustment.note) ?? '—'}</dd>
        </div>
      </dl>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sản phẩm</TableHead>
            <TableHead>Chênh lệch</TableHead>
            <TableHead>Ghi chú</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adjustment.items.map((item) => {
            const q = Number(item.quantity);
            return (
              <TableRow key={item.id}>
                <TableCell>{productNameById.get(item.productId) ?? item.productId}</TableCell>
                <TableCell>{q > 0 ? `+${item.quantity}` : item.quantity}</TableCell>
                <TableCell>{asNullableString(item.remark) ?? '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex gap-2">
        {adjustment.status === 'DRAFT' && (
          <PermissionButton permission="inventory:adjust" onClick={() => setActionMode('submit')}>
            Gửi duyệt
          </PermissionButton>
        )}
        {adjustment.status === 'SUBMITTED' && (
          <PermissionButton permission="inventory:approve" onClick={() => setActionMode('approve')}>
            Duyệt
          </PermissionButton>
        )}
        {adjustment.status === 'APPROVED' && (
          <PermissionButton
            permission="inventory:complete"
            onClick={() => setActionMode('complete')}
          >
            Hoàn tất
          </PermissionButton>
        )}
      </div>

      {actionMode && (
        <InventoryAdjustmentActionDialog
          open
          onOpenChange={(open) => {
            if (!open) setActionMode(null);
          }}
          adjustmentId={adjustment.id}
          adjustmentCode={adjustment.code}
          adjustmentVersion={adjustment.version}
          mode={actionMode}
        />
      )}
    </div>
  );
}

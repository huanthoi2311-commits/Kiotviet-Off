'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight } from 'lucide-react';
import { useTransferControllerFindOne } from '@/generated/transfer/transfer';
import type { TransferResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
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
import { TransferActionDialog, type TransferActionDialogMode } from './transfer-action-dialog';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  SHIPPING: 'Đang chuyển',
  RECEIVED: 'Đã nhận',
  CANCELLED: 'Đã hủy',
};

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** T044 Phase L — Transfer Detail. Actions are status-conditional: PENDING → Approve/Cancel, APPROVED → Receive/Cancel, else none. */
export function TransferDetail({ id }: { id: string }) {
  const [actionMode, setActionMode] = useState<TransferActionDialogMode | null>(null);

  const {
    data: transfer,
    isLoading,
    isError,
    error,
    refetch,
  } = useTransferControllerFindOne<TransferResponseDto, NormalizedError>(id);

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

  if (isError && error.kind === 'api-error' && error.code === 'TRANSFER_001') {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title="Không tìm thấy phiếu điều chuyển"
        description="Phiếu này có thể không tồn tại."
        action={<Button render={<Link href="/transfers">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !transfer) {
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
          <dd className="font-medium">{transfer.code}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Trạng thái</dt>
          <dd className="font-medium">{STATUS_LABEL[transfer.status] ?? transfer.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Ngày tạo</dt>
          <dd className="font-medium">{new Date(transfer.createdAt).toLocaleString('vi-VN')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Kho nguồn</dt>
          <dd className="font-medium">
            {warehouseNameById.get(transfer.fromWarehouseId) ?? transfer.fromWarehouseId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Kho đích</dt>
          <dd className="font-medium">
            {warehouseNameById.get(transfer.toWarehouseId) ?? transfer.toWarehouseId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Ghi chú</dt>
          <dd className="font-medium">{asNullableString(transfer.note) ?? '—'}</dd>
        </div>
      </dl>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sản phẩm</TableHead>
            <TableHead>Số lượng</TableHead>
            <TableHead>Giá vốn</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transfer.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{productNameById.get(item.productId) ?? item.productId}</TableCell>
              <TableCell>{item.quantity}</TableCell>
              <TableCell>{asNullableString(item.unitCost) ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex gap-2">
        {transfer.status === 'PENDING' && (
          <PermissionButton permission="transfer:approve" onClick={() => setActionMode('approve')}>
            Duyệt
          </PermissionButton>
        )}
        {transfer.status === 'APPROVED' && (
          <PermissionButton permission="transfer:receive" onClick={() => setActionMode('receive')}>
            Xác nhận nhận hàng
          </PermissionButton>
        )}
        {(transfer.status === 'PENDING' || transfer.status === 'APPROVED') && (
          <PermissionButton
            permission="transfer:cancel"
            variant="outline"
            onClick={() => setActionMode('cancel')}
          >
            Hủy phiếu
          </PermissionButton>
        )}
      </div>

      {actionMode && (
        <TransferActionDialog
          open
          onOpenChange={(open) => {
            if (!open) setActionMode(null);
          }}
          transferId={transfer.id}
          transferCode={transfer.code}
          transferVersion={transfer.version}
          mode={actionMode}
        />
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Undo2 } from 'lucide-react';
import { usePurchaseReturnControllerFindOne } from '@/generated/purchase-return/purchase-return';
import type { PurchaseReturnResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
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
import { useSupplierOptions } from '../../purchase/use-purchase-relations';
import {
  PurchaseReturnActionDialog,
  type PurchaseReturnActionDialogMode,
} from './purchase-return-action-dialog';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  APPROVED: 'Đã duyệt',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

const REASON_LABEL: Record<string, string> = {
  DAMAGED: 'Hư hỏng',
  WRONG_PRODUCT: 'Sai sản phẩm',
  EXPIRED: 'Hết hạn',
  OTHER: 'Khác',
};

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** T045 §7 — Purchase Return Detail. Actions: DRAFT → Approve/Cancel, APPROVED → Complete/Cancel, else none. */
export function PurchaseReturnDetail({ id }: { id: string }) {
  const [actionMode, setActionMode] = useState<PurchaseReturnActionDialogMode | null>(null);

  const {
    data: purchaseReturn,
    isLoading,
    isError,
    error,
    refetch,
  } = usePurchaseReturnControllerFindOne<PurchaseReturnResponseDto, NormalizedError>(id);

  const { supplierOptions } = useSupplierOptions();
  const { warehouseOptions } = useWarehouseOptions(undefined);
  const { productOptions } = useProductOptions();
  const supplierNameById = useMemo(
    () => new Map(supplierOptions.map((o) => [o.value, o.label])),
    [supplierOptions],
  );
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

  if (isError && error.kind === 'api-error' && error.code === 'PURCHASE_RETURN_001') {
    return (
      <EmptyState
        icon={Undo2}
        title="Không tìm thấy phiếu trả hàng"
        description="Phiếu này có thể không tồn tại."
        action={<Button render={<Link href="/purchase-returns">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !purchaseReturn) {
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
          <dd className="font-medium">{purchaseReturn.code}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Trạng thái</dt>
          <dd className="font-medium">
            {STATUS_LABEL[purchaseReturn.status] ?? purchaseReturn.status}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Lý do</dt>
          <dd className="font-medium">
            {REASON_LABEL[purchaseReturn.reason] ?? purchaseReturn.reason}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Nhà cung cấp</dt>
          <dd className="font-medium">
            {supplierNameById.get(purchaseReturn.supplierId) ?? purchaseReturn.supplierId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Đơn nhập hàng</dt>
          <dd className="font-medium">
            <Link href={`/purchase-orders/${purchaseReturn.purchaseOrderId}`} className="underline">
              Xem đơn nhập hàng
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Tổng tiền</dt>
          <dd className="font-medium">{purchaseReturn.totalAmount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Ghi chú</dt>
          <dd className="font-medium">{asNullableString(purchaseReturn.note) ?? '—'}</dd>
        </div>
      </dl>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sản phẩm</TableHead>
            <TableHead>Kho</TableHead>
            <TableHead>Số lượng trả</TableHead>
            <TableHead>Đơn giá</TableHead>
            <TableHead>Thành tiền</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchaseReturn.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{productNameById.get(item.productId) ?? item.productId}</TableCell>
              <TableCell>{warehouseNameById.get(item.warehouseId) ?? item.warehouseId}</TableCell>
              <TableCell>{item.quantity}</TableCell>
              <TableCell>{item.unitCost}</TableCell>
              <TableCell>{item.totalAmount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex gap-2">
        {purchaseReturn.status === 'DRAFT' && (
          <PermissionButton
            permission="purchase_return:approve"
            onClick={() => setActionMode('approve')}
          >
            Duyệt
          </PermissionButton>
        )}
        {purchaseReturn.status === 'APPROVED' && (
          <PermissionButton
            permission="purchase_return:complete"
            onClick={() => setActionMode('complete')}
          >
            Hoàn tất
          </PermissionButton>
        )}
        {(purchaseReturn.status === 'DRAFT' || purchaseReturn.status === 'APPROVED') && (
          <PermissionButton
            permission="purchase_return:cancel"
            variant="outline"
            onClick={() => setActionMode('cancel')}
          >
            Hủy phiếu
          </PermissionButton>
        )}
      </div>

      {actionMode && (
        <PurchaseReturnActionDialog
          open
          onOpenChange={(open) => {
            if (!open) setActionMode(null);
          }}
          purchaseReturnId={purchaseReturn.id}
          purchaseReturnCode={purchaseReturn.code}
          mode={actionMode}
        />
      )}
    </div>
  );
}

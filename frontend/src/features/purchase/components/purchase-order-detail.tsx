'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { usePurchaseOrderControllerFindOne } from '@/generated/purchase-order/purchase-order';
import type { PurchaseOrderResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
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
import {
  useBranchOptions,
  useProductOptions,
  useWarehouseOptions,
} from '../../inventory/use-inventory-relations';
import { useSupplierOptions } from '../use-purchase-relations';
import {
  PurchaseOrderActionDialog,
  type PurchaseOrderActionDialogMode,
} from './purchase-order-action-dialog';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  PENDING: 'Chờ xử lý',
  APPROVED: 'Đã duyệt',
  RECEIVED: 'Đã nhận hàng',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** T045 §5 — Purchase Order Detail. Actions: DRAFT → Approve/Cancel, APPROVED → Receive/Cancel, else none. */
export function PurchaseOrderDetail({ id }: { id: string }) {
  const [actionMode, setActionMode] = useState<PurchaseOrderActionDialogMode | null>(null);

  const {
    data: order,
    isLoading,
    isError,
    error,
    refetch,
  } = usePurchaseOrderControllerFindOne<PurchaseOrderResponseDto, NormalizedError>(id);

  const { supplierOptions } = useSupplierOptions();
  const { branchOptions } = useBranchOptions();
  const { warehouseOptions } = useWarehouseOptions(undefined);
  const { productOptions } = useProductOptions();
  const supplierNameById = useMemo(
    () => new Map(supplierOptions.map((o) => [o.value, o.label])),
    [supplierOptions],
  );
  const branchNameById = useMemo(
    () => new Map(branchOptions.map((o) => [o.value, o.label])),
    [branchOptions],
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

  if (isError && error.kind === 'api-error' && error.code === 'PURCHASE_ORDER_001') {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Không tìm thấy đơn nhập hàng"
        description="Đơn này có thể không tồn tại."
        action={<Button render={<Link href="/purchase-orders">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !order) {
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
          <dt className="text-muted-foreground text-sm">Mã đơn</dt>
          <dd className="font-medium">{order.code}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Trạng thái</dt>
          <dd className="font-medium">{STATUS_LABEL[order.status] ?? order.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Nhà cung cấp</dt>
          <dd className="font-medium">
            {supplierNameById.get(order.supplierId) ?? order.supplierId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Chi nhánh</dt>
          <dd className="font-medium">{branchNameById.get(order.branchId) ?? order.branchId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Ngày dự kiến nhận hàng</dt>
          <dd className="font-medium">
            {asNullableString(order.expectedAt)
              ? new Date(asNullableString(order.expectedAt) as string).toLocaleDateString('vi-VN')
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Tổng tiền</dt>
          <dd className="font-medium">{order.totalAmount}</dd>
        </div>
      </dl>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sản phẩm</TableHead>
            <TableHead>Kho</TableHead>
            <TableHead>Số lượng</TableHead>
            <TableHead>Đã nhận</TableHead>
            <TableHead>Đơn giá</TableHead>
            <TableHead>Chiết khấu</TableHead>
            <TableHead>Thuế</TableHead>
            <TableHead>Thành tiền</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {order.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{productNameById.get(item.productId) ?? item.productId}</TableCell>
              <TableCell>{warehouseNameById.get(item.warehouseId) ?? item.warehouseId}</TableCell>
              <TableCell>{item.quantity}</TableCell>
              <TableCell>{item.receivedQuantity}</TableCell>
              <TableCell>{item.unitCost}</TableCell>
              <TableCell>{item.discount}</TableCell>
              <TableCell>{item.taxAmount}</TableCell>
              <TableCell>{item.totalAmount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex gap-2">
        {order.status === 'DRAFT' && (
          <PermissionButton permission="purchase:approve" onClick={() => setActionMode('approve')}>
            Duyệt
          </PermissionButton>
        )}
        {order.status === 'APPROVED' && (
          <PermissionButton permission="purchase:receive" onClick={() => setActionMode('receive')}>
            Xác nhận nhận hàng
          </PermissionButton>
        )}
        {(order.status === 'DRAFT' || order.status === 'APPROVED') && (
          <PermissionButton
            permission="purchase:cancel"
            variant="outline"
            onClick={() => setActionMode('cancel')}
          >
            Hủy đơn
          </PermissionButton>
        )}
        {order.status === 'RECEIVED' && (
          <PermissionButton
            permission="purchase_return:create"
            variant="outline"
            render={
              <Link href={`/purchase-returns/new?purchaseOrderId=${order.id}`}>
                Trả hàng nhà cung cấp
              </Link>
            }
          />
        )}
      </div>

      {actionMode && (
        <PurchaseOrderActionDialog
          open
          onOpenChange={(open) => {
            if (!open) setActionMode(null);
          }}
          purchaseOrderId={order.id}
          purchaseOrderCode={order.code}
          purchaseOrderVersion={order.version}
          mode={actionMode}
        />
      )}
    </div>
  );
}

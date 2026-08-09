'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import {
  getSalesReturnControllerFindOneQueryKey,
  useSalesReturnControllerFindOne,
} from '@/generated/sales-return/sales-return';
import type { SalesReturnResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { useCustomerOptions } from '../../checkout/use-checkout-relations';
import {
  SalesReturnActionDialog,
  type SalesReturnActionDialogMode,
} from './sales-return-action-dialog';
import { RefundPanel } from './refund-panel';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  SUBMITTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  RECEIVED: 'Đã nhận hàng',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

const REASON_LABEL: Record<string, string> = {
  DAMAGED: 'Hư hỏng',
  DEFECTIVE: 'Lỗi sản xuất',
  WRONG_PRODUCT: 'Sai sản phẩm',
  CUSTOMER_CHANGED_MIND: 'Khách đổi ý',
  EXPIRED: 'Hết hạn',
  TRANSPORT_DAMAGE: 'Hư hỏng vận chuyển',
  OTHER: 'Khác',
};

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * T047 §4/§16 — Sales Return Detail. Real Optimistic Lock (`version`) means a conflict can
 * genuinely happen from another user's concurrent edit, not just a double-click — handled via the
 * "Tải lại" reload alert (Brand/Category's own established pattern), not the in-dialog stale-click
 * message used by every status-guard-only T04x module this session.
 */
export function SalesReturnDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [actionMode, setActionMode] = useState<SalesReturnActionDialogMode | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const {
    data: salesReturn,
    isLoading,
    isError,
    error,
    refetch,
  } = useSalesReturnControllerFindOne<SalesReturnResponseDto, NormalizedError>(id);

  const { customerOptions } = useCustomerOptions();
  const customerNameById = useMemo(
    () => new Map(customerOptions.map((o) => [o.value, o.label])),
    [customerOptions],
  );

  const handleVersionConflict = (message: string) => {
    setConflictMessage(message);
    queryClient.invalidateQueries({ queryKey: getSalesReturnControllerFindOneQueryKey(id) });
  };

  const handleReload = () => {
    setConflictMessage(null);
    refetch();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isError && error.kind === 'api-error' && error.code === 'SALES_RETURN_001') {
    return (
      <EmptyState
        icon={Undo2}
        title="Không tìm thấy phiếu trả hàng"
        description="Phiếu này có thể không tồn tại."
        action={<Button render={<Link href="/sales-returns">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !salesReturn) {
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

  const customerId = asNullableString(salesReturn.customerId);

  return (
    <div className="flex flex-col gap-6">
      {conflictMessage && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{conflictMessage}</span>
            <Button type="button" variant="outline" size="sm" onClick={handleReload}>
              Tải lại
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground text-sm">Mã phiếu</dt>
          <dd className="font-medium">{salesReturn.code}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Trạng thái</dt>
          <dd className="font-medium">{STATUS_LABEL[salesReturn.status] ?? salesReturn.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Khách hàng</dt>
          <dd className="font-medium">
            {customerId ? (customerNameById.get(customerId) ?? customerId) : 'Khách lẻ'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Hóa đơn gốc</dt>
          <dd className="font-medium">
            <Link href={`/invoices/${salesReturn.invoiceId}`} className="underline">
              Xem hóa đơn
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Tổng tiền</dt>
          <dd className="font-medium">{salesReturn.totalAmount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Ghi chú</dt>
          <dd className="font-medium">{asNullableString(salesReturn.note) ?? '—'}</dd>
        </div>
      </dl>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sản phẩm</TableHead>
            <TableHead>Đơn vị</TableHead>
            <TableHead>Số lượng</TableHead>
            <TableHead>Đơn giá</TableHead>
            <TableHead>Lý do</TableHead>
            <TableHead>Thành tiền</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {salesReturn.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.productNameSnapshot}</TableCell>
              <TableCell>{item.unitNameSnapshot}</TableCell>
              <TableCell>{item.quantity}</TableCell>
              <TableCell>{item.unitPrice}</TableCell>
              <TableCell>{REASON_LABEL[item.reason] ?? item.reason}</TableCell>
              <TableCell>{item.totalAmount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex gap-2">
        {salesReturn.status === 'DRAFT' && (
          <PermissionButton
            permission="sales_return:submit"
            onClick={() => setActionMode('submit')}
          >
            Gửi duyệt
          </PermissionButton>
        )}
        {salesReturn.status === 'SUBMITTED' && (
          <PermissionButton
            permission="sales_return:approve"
            onClick={() => setActionMode('approve')}
          >
            Duyệt
          </PermissionButton>
        )}
        {salesReturn.status === 'APPROVED' && (
          <PermissionButton
            permission="sales_return:receive"
            onClick={() => setActionMode('receive')}
          >
            Xác nhận nhận hàng
          </PermissionButton>
        )}
        {salesReturn.status === 'RECEIVED' && (
          <PermissionButton
            permission="sales_return:complete"
            onClick={() => setActionMode('complete')}
          >
            Hoàn tất
          </PermissionButton>
        )}
        {(salesReturn.status === 'DRAFT' ||
          salesReturn.status === 'SUBMITTED' ||
          salesReturn.status === 'APPROVED') && (
          <PermissionButton
            permission="sales_return:cancel"
            variant="outline"
            onClick={() => setActionMode('cancel')}
          >
            Hủy phiếu
          </PermissionButton>
        )}
      </div>

      <RefundPanel
        salesReturnId={salesReturn.id}
        salesReturnStatus={salesReturn.status}
        refunds={salesReturn.refunds}
        onVersionConflict={handleVersionConflict}
      />

      {actionMode && (
        <SalesReturnActionDialog
          open
          onOpenChange={(open) => {
            if (!open) setActionMode(null);
          }}
          salesReturnId={salesReturn.id}
          salesReturnCode={salesReturn.code}
          version={salesReturn.version}
          mode={actionMode}
          onVersionConflict={handleVersionConflict}
        />
      )}
    </div>
  );
}

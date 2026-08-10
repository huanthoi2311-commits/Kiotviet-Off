'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardCheck } from 'lucide-react';
import {
  getStockCountControllerFindOneQueryKey,
  getStockCountControllerSearchQueryKey,
  useStockCountControllerFindOne,
  useStockCountControllerStart,
} from '@/generated/stock-count/stock-count';
import type { StockCountResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
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
import { StockCountCompleteForm } from './stock-count-complete-form';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  COUNTING: 'Đang kiểm kê',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** T044 Phase N — Stock Count Detail. DRAFT → Start (simple confirm); COUNTING → real per-row Complete form. */
export function StockCountDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const {
    data: stockCount,
    isLoading,
    isError,
    error,
    refetch,
  } = useStockCountControllerFindOne<StockCountResponseDto, NormalizedError>(id);

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

  const startMutation = useStockCountControllerStart<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getStockCountControllerSearchQueryKey() });
        queryClient.invalidateQueries({ queryKey: getStockCountControllerFindOneQueryKey(id) });
        toast.success('Đã bắt đầu kiểm kê');
        setStartError(null);
        setShowStartConfirm(false);
      },
      onError: (err) => {
        setStartError(err.kind === 'api-error' ? err.message : 'Đã xảy ra lỗi không xác định');
      },
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isError && error.kind === 'api-error' && error.code === 'STOCK_COUNT_001') {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Không tìm thấy phiếu kiểm kê"
        description="Phiếu này có thể không tồn tại."
        action={<Button render={<Link href="/stock-count">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !stockCount) {
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
          <dd className="font-medium">{stockCount.code}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Trạng thái</dt>
          <dd className="font-medium">{STATUS_LABEL[stockCount.status] ?? stockCount.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Kho</dt>
          <dd className="font-medium">
            {warehouseNameById.get(stockCount.warehouseId) ?? stockCount.warehouseId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Ngày tạo</dt>
          <dd className="font-medium">{new Date(stockCount.createdAt).toLocaleString('vi-VN')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Ghi chú</dt>
          <dd className="font-medium">{asNullableString(stockCount.note) ?? '—'}</dd>
        </div>
      </dl>

      {stockCount.status === 'COUNTING' ? (
        <StockCountCompleteForm
          stockCountId={stockCount.id}
          stockCountVersion={stockCount.version}
          items={stockCount.items}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sản phẩm</TableHead>
              <TableHead>Tồn hệ thống</TableHead>
              <TableHead>Số lượng đếm</TableHead>
              <TableHead>Chênh lệch</TableHead>
              <TableHead>Ghi chú</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stockCount.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{productNameById.get(item.productId) ?? item.productId}</TableCell>
                <TableCell>{item.systemQty}</TableCell>
                <TableCell>{asNullableString(item.actualQty) ?? '—'}</TableCell>
                <TableCell>{asNullableString(item.difference) ?? '—'}</TableCell>
                <TableCell>{asNullableString(item.remark) ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {stockCount.status === 'DRAFT' && (
        <div className="flex gap-2">
          <PermissionButton
            permission="stock_count:start"
            onClick={() => setShowStartConfirm(true)}
          >
            Bắt đầu kiểm kê
          </PermissionButton>
        </div>
      )}

      <ConfirmDialog
        open={showStartConfirm}
        onOpenChange={(open) => {
          setShowStartConfirm(open);
          if (!open) setStartError(null);
        }}
        title="Bắt đầu kiểm kê?"
        description={`Phiếu "${stockCount.code}" sẽ chuyển sang trạng thái đang kiểm kê.`}
        confirmLabel="Bắt đầu"
        isConfirming={startMutation.isPending}
        errorMessage={startError}
        onConfirm={() => {
          setStartError(null);
          startMutation.mutate({ id: stockCount.id });
        }}
      />
    </div>
  );
}

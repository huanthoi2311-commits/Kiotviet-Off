'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { usePurchaseReportControllerGetBreakdown } from '@/generated/purchase-report/purchase-report';
import type {
  PurchaseReportBreakdownItemResponseDto,
  PurchaseReportControllerGetBreakdownGroupBy,
} from '@/generated/pOSERPEnterpriseAPI.schemas';
import { isNormalizedError, type NormalizedError } from '@/services/api-client';

const PAGE_LIMIT = 20;

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

interface PurchaseReportBreakdownProps {
  dateFrom?: string;
  dateTo?: string;
  groupBy: PurchaseReportControllerGetBreakdownGroupBy;
}

/** T050 — Breakdown table for one of the 6 real backend dimensions (SUPPLIER/PRODUCT/WAREHOUSE/
 * MONTH/USER/CATEGORY) — never an invented dimension. Resets to page 1 whenever the filter/groupBy
 * changes so a stale out-of-range page isn't silently requested. */
export function PurchaseReportBreakdown({
  dateFrom,
  dateTo,
  groupBy,
}: PurchaseReportBreakdownProps) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, groupBy]);

  const columns = useMemo<ColumnDef<PurchaseReportBreakdownItemResponseDto, unknown>[]>(
    () => [
      { id: 'label', header: 'Tên', cell: ({ row }) => row.original.label },
      {
        id: 'code',
        header: 'Mã',
        cell: ({ row }) => asNullableString(row.original.code) ?? '—',
      },
      { accessorKey: 'totalAmount', header: 'Tổng tiền' },
      { accessorKey: 'totalQuantity', header: 'Số lượng' },
      { accessorKey: 'orderCount', header: 'Số đơn' },
    ],
    [],
  );

  const { data, isLoading, isError, error, refetch } = usePurchaseReportControllerGetBreakdown({
    dateFrom,
    dateTo,
    groupBy,
    page,
    limit: PAGE_LIMIT,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  return (
    <DataTable
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      error={normalizedError}
      onRetry={() => refetch()}
      emptyState={
        <EmptyState
          title="Không có dữ liệu"
          description="Không có đơn nhập hàng nào khớp với bộ lọc hiện tại."
        />
      }
      pagination={{
        page,
        limit: PAGE_LIMIT,
        total: data?.total ?? 0,
        onPageChange: setPage,
      }}
    />
  );
}

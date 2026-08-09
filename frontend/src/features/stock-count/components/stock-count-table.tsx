'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardCheck } from 'lucide-react';
import { useStockCountControllerSearch } from '@/generated/stock-count/stock-count';
import {
  StockCountControllerSearchStatus,
  type StockCountResponseDto,
} from '@/generated/pOSERPEnterpriseAPI.schemas';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { PermissionButton } from '@/components/common/permission-button';
import { SearchToolbar } from '@/components/common/search-toolbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isNormalizedError, type NormalizedError } from '@/services/api-client';
import { useWarehouseOptions } from '../../inventory/use-inventory-relations';

const PAGE_LIMIT = 20;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  COUNTING: 'Đang kiểm kê',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

/**
 * T044 Phase N — Stock Count List. `CANCELLED` exists in the backend's own status enum but no
 * endpoint ever produces it (confirmed via `stock-count.service.ts` — no cancel logic anywhere),
 * so it's omitted from the filter, mirroring Transfer's DRAFT/SHIPPING precedent.
 */
const STATUS_FILTER_OPTIONS: { value: StockCountControllerSearchStatus | 'ALL'; label: string }[] =
  [
    { value: 'ALL', label: 'Tất cả trạng thái' },
    { value: StockCountControllerSearchStatus.DRAFT, label: 'Nháp' },
    { value: StockCountControllerSearchStatus.COUNTING, label: 'Đang kiểm kê' },
    { value: StockCountControllerSearchStatus.COMPLETED, label: 'Hoàn tất' },
  ];

export function StockCountTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StockCountControllerSearchStatus | 'ALL'>('ALL');
  const [warehouseId, setWarehouseId] = useState<string | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const { warehouseOptions } = useWarehouseOptions(undefined);
  const warehouseNameById = useMemo(
    () => new Map(warehouseOptions.map((o) => [o.value, o.label])),
    [warehouseOptions],
  );

  const columns = useMemo<ColumnDef<StockCountResponseDto, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã phiếu' },
      {
        id: 'warehouse',
        header: 'Kho',
        cell: ({ row }) =>
          warehouseNameById.get(row.original.warehouseId) ?? row.original.warehouseId,
      },
      {
        id: 'status',
        header: 'Trạng thái',
        cell: ({ row }) => STATUS_LABEL[row.original.status] ?? row.original.status,
      },
      {
        id: 'createdAt',
        header: 'Ngày tạo',
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString('vi-VN'),
      },
      {
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row }) => (
          <PermissionButton
            permission="stock_count:view"
            variant="outline"
            size="sm"
            render={<Link href={`/stock-count/${row.original.id}`}>Xem</Link>}
          />
        ),
      },
    ],
    [warehouseNameById],
  );

  const { data, isLoading, isError, error, refetch } = useStockCountControllerSearch({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    warehouseId: warehouseId === 'ALL' ? undefined : warehouseId,
    page,
    limit: PAGE_LIMIT,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter = search.trim().length > 0 || status !== 'ALL' || warehouseId !== 'ALL';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <SearchToolbar
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Tìm theo mã phiếu..."
          filters={
            <>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus((value as StockCountControllerSearchStatus | 'ALL') ?? 'ALL');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-44" aria-label="Lọc theo trạng thái">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={warehouseId}
                onValueChange={(value) => {
                  setWarehouseId(value ?? 'ALL');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-48" aria-label="Lọc theo kho">
                  <SelectValue placeholder="Kho" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả kho</SelectItem>
                  {warehouseOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />
        <PermissionButton
          permission="stock_count:create"
          render={<Link href="/stock-count/new">Tạo phiếu kiểm kê</Link>}
        />
      </div>
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={normalizedError}
        onRetry={() => refetch()}
        emptyState={
          hasActiveFilter ? (
            <EmptyState
              title="Không có kết quả"
              description="Không tìm thấy phiếu kiểm kê phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="Chưa có phiếu kiểm kê nào"
              description="Phiếu kiểm kê kho sẽ hiển thị ở đây sau khi được tạo."
            />
          )
        }
        pagination={{
          page,
          limit: PAGE_LIMIT,
          total: data?.total ?? 0,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight } from 'lucide-react';
import { useTransferControllerSearch } from '@/generated/transfer/transfer';
import {
  TransferControllerSearchStatus,
  type TransferResponseDto,
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

const STATUS_FILTER_OPTIONS: { value: TransferControllerSearchStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: TransferControllerSearchStatus.PENDING, label: 'Chờ duyệt' },
  { value: TransferControllerSearchStatus.APPROVED, label: 'Đã duyệt' },
  { value: TransferControllerSearchStatus.RECEIVED, label: 'Đã nhận' },
  { value: TransferControllerSearchStatus.CANCELLED, label: 'Đã hủy' },
];

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  SHIPPING: 'Đang chuyển',
  RECEIVED: 'Đã nhận',
  CANCELLED: 'Đã hủy',
};

/**
 * T044 Phase L — Transfer List. `status` here only offers PENDING/APPROVED/RECEIVED/CANCELLED —
 * DRAFT and SHIPPING are unreachable via the current create→approve→receive flow (SPEC-T044 §4.1),
 * so they're omitted from the filter to avoid implying a state no transfer can ever be in.
 */
export function TransferTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TransferControllerSearchStatus | 'ALL'>('ALL');
  const [fromWarehouseId, setFromWarehouseId] = useState<string | 'ALL'>('ALL');
  const [toWarehouseId, setToWarehouseId] = useState<string | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const { warehouseOptions } = useWarehouseOptions(undefined);
  const warehouseNameById = useMemo(
    () => new Map(warehouseOptions.map((o) => [o.value, o.label])),
    [warehouseOptions],
  );

  const columns = useMemo<ColumnDef<TransferResponseDto, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã phiếu' },
      {
        id: 'fromWarehouse',
        header: 'Kho nguồn',
        cell: ({ row }) =>
          warehouseNameById.get(row.original.fromWarehouseId) ?? row.original.fromWarehouseId,
      },
      {
        id: 'toWarehouse',
        header: 'Kho đích',
        cell: ({ row }) =>
          warehouseNameById.get(row.original.toWarehouseId) ?? row.original.toWarehouseId,
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
            permission="transfer:view"
            variant="outline"
            size="sm"
            render={<Link href={`/transfers/${row.original.id}`}>Xem</Link>}
          />
        ),
      },
    ],
    [warehouseNameById],
  );

  const { data, isLoading, isError, error, refetch } = useTransferControllerSearch({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    fromWarehouseId: fromWarehouseId === 'ALL' ? undefined : fromWarehouseId,
    toWarehouseId: toWarehouseId === 'ALL' ? undefined : toWarehouseId,
    page,
    limit: PAGE_LIMIT,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter =
    search.trim().length > 0 ||
    status !== 'ALL' ||
    fromWarehouseId !== 'ALL' ||
    toWarehouseId !== 'ALL';

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
                  setStatus((value as TransferControllerSearchStatus | 'ALL') ?? 'ALL');
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
                value={fromWarehouseId}
                onValueChange={(value) => {
                  setFromWarehouseId(value ?? 'ALL');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-48" aria-label="Lọc theo kho nguồn">
                  <SelectValue placeholder="Kho nguồn" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả kho nguồn</SelectItem>
                  {warehouseOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={toWarehouseId}
                onValueChange={(value) => {
                  setToWarehouseId(value ?? 'ALL');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-48" aria-label="Lọc theo kho đích">
                  <SelectValue placeholder="Kho đích" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả kho đích</SelectItem>
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
          permission="transfer:create"
          render={<Link href="/transfers/new">Tạo phiếu điều chuyển</Link>}
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
              description="Không tìm thấy phiếu điều chuyển phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={ArrowLeftRight}
              title="Chưa có phiếu điều chuyển nào"
              description="Phiếu điều chuyển sẽ hiển thị ở đây sau khi được tạo."
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

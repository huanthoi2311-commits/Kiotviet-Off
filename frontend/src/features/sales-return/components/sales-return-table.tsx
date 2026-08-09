'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Undo2 } from 'lucide-react';
import { useSalesReturnControllerSearch } from '@/generated/sales-return/sales-return';
import {
  SalesReturnControllerSearchStatus,
  type SalesReturnResponseDto,
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
import { useCustomerOptions } from '../../checkout/use-checkout-relations';

const PAGE_LIMIT = 20;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  SUBMITTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  RECEIVED: 'Đã nhận hàng',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

/** T047 §4 — all 6 statuses are genuinely reachable (unlike prior T04x modules), so all are offered. */
const STATUS_FILTER_OPTIONS: { value: SalesReturnControllerSearchStatus | 'ALL'; label: string }[] =
  [
    { value: 'ALL', label: 'Tất cả trạng thái' },
    { value: SalesReturnControllerSearchStatus.DRAFT, label: 'Nháp' },
    { value: SalesReturnControllerSearchStatus.SUBMITTED, label: 'Chờ duyệt' },
    { value: SalesReturnControllerSearchStatus.APPROVED, label: 'Đã duyệt' },
    { value: SalesReturnControllerSearchStatus.RECEIVED, label: 'Đã nhận hàng' },
    { value: SalesReturnControllerSearchStatus.COMPLETED, label: 'Hoàn tất' },
    { value: SalesReturnControllerSearchStatus.CANCELLED, label: 'Đã hủy' },
  ];

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function SalesReturnTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SalesReturnControllerSearchStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const { customerOptions } = useCustomerOptions();
  const customerNameById = useMemo(
    () => new Map(customerOptions.map((o) => [o.value, o.label])),
    [customerOptions],
  );

  const columns = useMemo<ColumnDef<SalesReturnResponseDto, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã phiếu' },
      {
        id: 'customer',
        header: 'Khách hàng',
        cell: ({ row }) => {
          const customerId = asNullableString(row.original.customerId);
          return customerId ? (customerNameById.get(customerId) ?? customerId) : 'Khách lẻ';
        },
      },
      {
        id: 'status',
        header: 'Trạng thái',
        cell: ({ row }) => STATUS_LABEL[row.original.status] ?? row.original.status,
      },
      { accessorKey: 'totalAmount', header: 'Tổng tiền' },
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
            permission="sales_return:view"
            variant="outline"
            size="sm"
            render={<Link href={`/sales-returns/${row.original.id}`}>Xem</Link>}
          />
        ),
      },
    ],
    [customerNameById],
  );

  const { data, isLoading, isError, error, refetch } = useSalesReturnControllerSearch({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    page,
    limit: PAGE_LIMIT,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter = search.trim().length > 0 || status !== 'ALL';

  return (
    <div className="flex flex-col gap-4">
      <SearchToolbar
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Tìm theo mã phiếu trả..."
        filters={
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus((value as SalesReturnControllerSearchStatus | 'ALL') ?? 'ALL');
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
        }
      />
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
              description="Không tìm thấy phiếu trả hàng phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={Undo2}
              title="Chưa có phiếu trả hàng nào"
              description='Bắt đầu trả hàng từ nút "Trả hàng" trên trang chi tiết hóa đơn.'
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

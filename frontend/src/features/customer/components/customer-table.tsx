'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Column, ColumnDef, SortingState } from '@tanstack/react-table';
import { Users } from 'lucide-react';
import { useCustomerControllerSearch } from '@/generated/customer/customer';
import {
  CustomerControllerSearchCustomerType,
  CustomerControllerSearchStatus,
  type CustomerControllerSearchSortBy,
  type CustomerControllerSearchSortOrder,
  type CustomerResponseDto,
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

const STATUS_FILTER_OPTIONS: { value: CustomerControllerSearchStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: CustomerControllerSearchStatus.ACTIVE, label: 'Đang hoạt động' },
  { value: CustomerControllerSearchStatus.INACTIVE, label: 'Ngừng hoạt động' },
  { value: CustomerControllerSearchStatus.ARCHIVED, label: 'Đã lưu trữ' },
];

const CUSTOMER_TYPE_FILTER_OPTIONS: {
  value: CustomerControllerSearchCustomerType | 'ALL';
  label: string;
}[] = [
  { value: 'ALL', label: 'Tất cả loại khách hàng' },
  { value: CustomerControllerSearchCustomerType.RETAIL, label: 'Khách lẻ' },
  { value: CustomerControllerSearchCustomerType.WHOLESALE, label: 'Khách sỉ' },
  { value: CustomerControllerSearchCustomerType.VIP, label: 'VIP' },
  { value: CustomerControllerSearchCustomerType.DEALER, label: 'Đại lý' },
  { value: CustomerControllerSearchCustomerType.COMPANY, label: 'Công ty' },
];

const PAGE_LIMIT = 20;

function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: Column<CustomerResponseDto, unknown>;
}) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className="flex items-center gap-1 font-medium"
    >
      {label}
      {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : null}
    </button>
  );
}

/** T048 Phase P — List. Archived visibility relies on T048.05 (GET /customers?status=ARCHIVED). */
export function CustomerTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerControllerSearchStatus | 'ALL'>('ALL');
  const [customerType, setCustomerType] = useState<CustomerControllerSearchCustomerType | 'ALL'>(
    'ALL',
  );
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'fullName', desc: false }]);

  const columns = useMemo<ColumnDef<CustomerResponseDto, unknown>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: ({ column }) => <SortableHeader label="Tên khách hàng" column={column} />,
      },
      {
        accessorKey: 'code',
        header: ({ column }) => <SortableHeader label="Mã" column={column} />,
      },
      {
        id: 'phone',
        header: 'Điện thoại',
        cell: ({ row }) => row.original.phone ?? '—',
      },
      { accessorKey: 'customerType', header: 'Loại khách hàng' },
      { accessorKey: 'status', header: 'Trạng thái' },
      {
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row }) => (
          <PermissionButton
            permission="customer:view"
            variant="outline"
            size="sm"
            render={<Link href={`/customers/${row.original.id}`}>Xem</Link>}
          />
        ),
      },
    ],
    [],
  );

  const activeSort = sorting[0];

  const { data, isLoading, isError, error, refetch } = useCustomerControllerSearch({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    customerType: customerType === 'ALL' ? undefined : customerType,
    page,
    limit: PAGE_LIMIT,
    sortBy: (activeSort?.id as CustomerControllerSearchSortBy | undefined) ?? 'fullName',
    sortOrder: (activeSort?.desc ? 'desc' : 'asc') as CustomerControllerSearchSortOrder,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter = search.trim().length > 0 || status !== 'ALL' || customerType !== 'ALL';

  return (
    <div className="flex flex-col gap-4">
      <SearchToolbar
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Tìm theo tên, SĐT, email, công ty hoặc MST..."
        filters={
          <>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus((value as CustomerControllerSearchStatus | 'ALL') ?? 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48" aria-label="Lọc theo trạng thái">
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
              value={customerType}
              onValueChange={(value) => {
                setCustomerType((value as CustomerControllerSearchCustomerType | 'ALL') ?? 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48" aria-label="Lọc theo loại khách hàng">
                <SelectValue placeholder="Loại khách hàng" />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_TYPE_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
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
              description="Không tìm thấy khách hàng phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={Users}
              title="Chưa có khách hàng nào"
              description="Khách hàng sẽ hiển thị ở đây sau khi được tạo."
            />
          )
        }
        pagination={{
          page,
          limit: PAGE_LIMIT,
          total: data?.total ?? 0,
          onPageChange: setPage,
        }}
        sorting={sorting}
        onSortingChange={setSorting}
      />
    </div>
  );
}

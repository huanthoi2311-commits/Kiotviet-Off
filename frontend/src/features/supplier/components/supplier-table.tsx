'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Column, ColumnDef, SortingState } from '@tanstack/react-table';
import { Truck } from 'lucide-react';
import { useSupplierControllerSearch } from '@/generated/supplier/supplier';
import {
  SupplierControllerSearchStatus,
  type SupplierControllerSearchSortBy,
  type SupplierControllerSearchSortOrder,
  type SupplierResponseDto,
} from '@/generated/pOSERPEnterpriseAPI.schemas';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useSupplierExport } from '../use-supplier-export';

const STATUS_FILTER_OPTIONS: { value: SupplierControllerSearchStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: SupplierControllerSearchStatus.ACTIVE, label: 'Đang hoạt động' },
  { value: SupplierControllerSearchStatus.INACTIVE, label: 'Ngừng hoạt động' },
  { value: SupplierControllerSearchStatus.ARCHIVED, label: 'Đã lưu trữ' },
];

const PAGE_LIMIT = 20;

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: Column<SupplierResponseDto, unknown>;
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

/** T049 Phase R — List. Archived visibility relies on T049.05 (GET /suppliers?status=ARCHIVED). */
export function SupplierTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SupplierControllerSearchStatus | 'ALL'>('ALL');
  const [province, setProvince] = useState('');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'companyName', desc: false }]);

  const exportMutation = useSupplierExport();

  const columns = useMemo<ColumnDef<SupplierResponseDto, unknown>[]>(
    () => [
      {
        accessorKey: 'companyName',
        header: ({ column }) => <SortableHeader label="Tên công ty" column={column} />,
      },
      {
        accessorKey: 'code',
        header: ({ column }) => <SortableHeader label="Mã" column={column} />,
      },
      {
        id: 'phone',
        header: 'Điện thoại',
        cell: ({ row }) => asNullableString(row.original.phone) ?? '—',
      },
      {
        id: 'province',
        header: 'Tỉnh/Thành',
        cell: ({ row }) => asNullableString(row.original.province) ?? '—',
      },
      { accessorKey: 'status', header: 'Trạng thái' },
      {
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row }) => (
          <PermissionButton
            permission="supplier:view"
            variant="outline"
            size="sm"
            render={<Link href={`/suppliers/${row.original.id}`}>Xem</Link>}
          />
        ),
      },
    ],
    [],
  );

  const activeSort = sorting[0];

  const searchParams = {
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    province: province || undefined,
    page,
    limit: PAGE_LIMIT,
    sortBy: (activeSort?.id as SupplierControllerSearchSortBy | undefined) ?? 'companyName',
    sortOrder: (activeSort?.desc ? 'desc' : 'asc') as SupplierControllerSearchSortOrder,
  };

  const { data, isLoading, isError, error, refetch } = useSupplierControllerSearch(searchParams);

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter =
    search.trim().length > 0 || status !== 'ALL' || province.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <SearchToolbar
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Tìm theo mã, tên công ty, MST, người liên hệ hoặc SĐT..."
        filters={
          <>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus((value as SupplierControllerSearchStatus | 'ALL') ?? 'ALL');
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
            <div className="flex items-center gap-1.5">
              <Label htmlFor="province-filter" className="sr-only">
                Tỉnh/Thành
              </Label>
              <Input
                id="province-filter"
                className="w-40"
                placeholder="Tỉnh/Thành"
                value={province}
                onChange={(e) => {
                  setProvince(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <PermissionButton
              permission="supplier:export"
              variant="outline"
              disabled={exportMutation.isPending}
              aria-disabled={exportMutation.isPending}
              onClick={() => {
                if (exportMutation.isPending) return;
                exportMutation.mutate({
                  search: searchParams.search,
                  status: searchParams.status,
                  province: searchParams.province,
                  sortBy: searchParams.sortBy,
                  sortOrder: searchParams.sortOrder,
                });
              }}
            >
              {exportMutation.isPending ? 'Đang xuất...' : 'Xuất Excel'}
            </PermissionButton>
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
              description="Không tìm thấy nhà cung cấp phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={Truck}
              title="Chưa có nhà cung cấp nào"
              description="Nhà cung cấp sẽ hiển thị ở đây sau khi được tạo."
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

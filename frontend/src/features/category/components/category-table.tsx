'use client';

import { useState } from 'react';
import type { Column, ColumnDef, SortingState } from '@tanstack/react-table';
import { FolderTree } from 'lucide-react';
import { useCategoryControllerList } from '@/generated/category/category';
import {
  CategoryControllerListStatus,
  type CategoryControllerListSortBy,
  type CategoryControllerListSortOrder,
  type CategoryResponseDto,
} from '@/generated/pOSERPEnterpriseAPI.schemas';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { SearchToolbar } from '@/components/common/search-toolbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isNormalizedError, type NormalizedError } from '@/services/api-client';

const STATUS_FILTER_OPTIONS: { value: CategoryControllerListStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: CategoryControllerListStatus.DRAFT, label: 'Nháp' },
  { value: CategoryControllerListStatus.ACTIVE, label: 'Đang hoạt động' },
  { value: CategoryControllerListStatus.INACTIVE, label: 'Ngừng hoạt động' },
  { value: CategoryControllerListStatus.ARCHIVED, label: 'Đã lưu trữ' },
];

const PAGE_LIMIT = 20;

/**
 * Sortable column header — `DataTable` (T034) passes `sorting`/`onSortingChange`
 * through to `useReactTable` but its own generic chrome doesn't render a
 * clickable header, so each sortable column provides one via TanStack
 * Table's per-column `column.getToggleSortingHandler()` (T035.10 finding).
 */
function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: Column<CategoryResponseDto, unknown>;
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

const columns: ColumnDef<CategoryResponseDto, unknown>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => <SortableHeader label="Tên" column={column} />,
  },
  { accessorKey: 'code', header: 'Mã' },
  {
    id: 'parentId',
    header: 'Danh mục cha',
    cell: ({ row }) => (row.original.parentId ? row.original.parentId.slice(0, 8) : '—'),
  },
  { accessorKey: 'status', header: 'Trạng thái' },
  {
    accessorKey: 'sortOrder',
    header: ({ column }) => <SortableHeader label="Thứ tự" column={column} />,
  },
];

/**
 * T035.10 — read-only: no create/edit/archive/restore actions, no tree
 * view. Search/status/pagination/sorting are all server-driven via
 * `CategoryControllerListParams`; component-local state only (no URL sync
 * in this package — out of T035.10's own scope).
 */
export function CategoryTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CategoryControllerListStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'sortOrder', desc: false }]);

  const activeSort = sorting[0];

  const { data, isLoading, isError, error, refetch } = useCategoryControllerList({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    page,
    limit: PAGE_LIMIT,
    sortBy: (activeSort?.id as CategoryControllerListSortBy | undefined) ?? 'sortOrder',
    sortOrder: (activeSort?.desc ? 'desc' : 'asc') as CategoryControllerListSortOrder,
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
        placeholder="Tìm theo tên hoặc mã danh mục..."
        filters={
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus((value as CategoryControllerListStatus | 'ALL') ?? 'ALL');
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
              description="Không tìm thấy danh mục phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={FolderTree}
              title="Chưa có danh mục nào"
              description="Danh mục sẽ hiển thị ở đây sau khi được tạo."
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

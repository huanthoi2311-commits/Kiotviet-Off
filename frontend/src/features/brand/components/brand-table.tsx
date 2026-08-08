'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Column, ColumnDef, SortingState } from '@tanstack/react-table';
import { Tag } from 'lucide-react';
import { useBrandControllerSearch } from '@/generated/brand/brand';
import {
  BrandControllerSearchStatus,
  type BrandControllerSearchSortBy,
  type BrandControllerSearchSortOrder,
  type BrandResponseDto,
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
import { Label } from '@/components/ui/label';
import { isNormalizedError, type NormalizedError } from '@/services/api-client';
import { BrandLifecycleDialog, type BrandLifecycleDialogMode } from './brand-lifecycle-dialog';

const STATUS_FILTER_OPTIONS: { value: BrandControllerSearchStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: BrandControllerSearchStatus.ACTIVE, label: 'Đang hoạt động' },
  { value: BrandControllerSearchStatus.INACTIVE, label: 'Ngừng hoạt động' },
];

const PAGE_LIMIT = 20;

function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: Column<BrandResponseDto, unknown>;
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

/**
 * T041 Phase C — Brand List. `archived` (T041.05, Decision AD-1) is a
 * separate, orthogonal filter from `status` — Brand has no `ARCHIVED`
 * status value (unlike Category), so it is never folded into the status
 * dropdown. When `archived` is on, every returned row is archived, so the
 * actions column is filter-state-conditional (Khôi phục only) rather than
 * per-row conditional the way Category's `row.original.status ===
 * 'ARCHIVED'` check is — there is no per-row signal to check here, since
 * `BrandResponseDto` doesn't expose `deletedAt` and `status` never becomes
 * ARCHIVED.
 */
export function BrandTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BrandControllerSearchStatus | 'ALL'>('ALL');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [lifecycleTarget, setLifecycleTarget] = useState<{
    id: string;
    name: string;
    mode: BrandLifecycleDialogMode;
  } | null>(null);

  const columns = useMemo<ColumnDef<BrandResponseDto, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <SortableHeader label="Tên" column={column} />,
      },
      {
        accessorKey: 'code',
        header: ({ column }) => <SortableHeader label="Mã" column={column} />,
      },
      {
        accessorKey: 'country',
        header: 'Quốc gia',
        cell: ({ row }) => row.original.country ?? '—',
      },
      { accessorKey: 'status', header: 'Trạng thái' },
      {
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row }) =>
          archived ? (
            <PermissionButton
              permission="brand:restore"
              variant="outline"
              size="sm"
              onClick={() =>
                setLifecycleTarget({
                  id: row.original.id,
                  name: row.original.name,
                  mode: 'restore',
                })
              }
            >
              Khôi phục
            </PermissionButton>
          ) : (
            <div className="flex items-center gap-2">
              <PermissionButton
                permission="brand:update"
                variant="outline"
                size="sm"
                render={<Link href={`/brands/${row.original.id}`}>Sửa</Link>}
              />
              <PermissionButton
                permission="brand:delete"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLifecycleTarget({
                    id: row.original.id,
                    name: row.original.name,
                    mode: 'archive',
                  })
                }
              >
                Lưu trữ
              </PermissionButton>
            </div>
          ),
      },
    ],
    [archived],
  );

  const activeSort = sorting[0];

  const { data, isLoading, isError, error, refetch } = useBrandControllerSearch({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    archived,
    page,
    limit: PAGE_LIMIT,
    sortBy: (activeSort?.id as BrandControllerSearchSortBy | undefined) ?? 'name',
    sortOrder: (activeSort?.desc ? 'desc' : 'asc') as BrandControllerSearchSortOrder,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter = search.trim().length > 0 || status !== 'ALL' || archived;

  return (
    <div className="flex flex-col gap-4">
      <SearchToolbar
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Tìm theo tên hoặc mã thương hiệu..."
        filters={
          <>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus((value as BrandControllerSearchStatus | 'ALL') ?? 'ALL');
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
            <div className="flex items-center gap-2">
              <input
                id="archived-filter"
                type="checkbox"
                className="size-4"
                checked={archived}
                onChange={(e) => {
                  setArchived(e.target.checked);
                  setPage(1);
                }}
              />
              <Label htmlFor="archived-filter">Hiển thị đã lưu trữ</Label>
            </div>
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
              description="Không tìm thấy thương hiệu phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={Tag}
              title="Chưa có thương hiệu nào"
              description="Thương hiệu sẽ hiển thị ở đây sau khi được tạo."
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
      {lifecycleTarget && (
        <BrandLifecycleDialog
          open
          onOpenChange={(open) => {
            if (!open) setLifecycleTarget(null);
          }}
          brandId={lifecycleTarget.id}
          brandName={lifecycleTarget.name}
          mode={lifecycleTarget.mode}
        />
      )}
    </div>
  );
}

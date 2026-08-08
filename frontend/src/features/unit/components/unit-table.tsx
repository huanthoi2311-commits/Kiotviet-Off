'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Column, ColumnDef, SortingState } from '@tanstack/react-table';
import { Ruler } from 'lucide-react';
import { useUnitControllerSearch } from '@/generated/unit/unit';
import {
  UnitControllerSearchStatus,
  type UnitControllerSearchSortBy,
  type UnitControllerSearchSortOrder,
  type UnitResponseDto,
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
import { UnitLifecycleDialog, type UnitLifecycleDialogMode } from './unit-lifecycle-dialog';

const STATUS_FILTER_OPTIONS: { value: UnitControllerSearchStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: UnitControllerSearchStatus.ACTIVE, label: 'Đang hoạt động' },
  { value: UnitControllerSearchStatus.INACTIVE, label: 'Ngừng hoạt động' },
  { value: UnitControllerSearchStatus.ARCHIVED, label: 'Đã lưu trữ' },
];

const PAGE_LIMIT = 20;

function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: Column<UnitResponseDto, unknown>;
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
 * T042 Phase C — Unit List. Unlike Brand, `UnitStatus` genuinely has an
 * `ARCHIVED` value, so — like Category — it's folded directly into the
 * single status filter dropdown (T042's own backend fix makes
 * `status=ARCHIVED` actually work), and the actions column is per-row
 * status-conditional (`row.original.status === 'ARCHIVED'`), not a
 * separate page-level checkbox the way Brand's `archived` filter is.
 */
export function UnitTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UnitControllerSearchStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [lifecycleTarget, setLifecycleTarget] = useState<{
    id: string;
    name: string;
    mode: UnitLifecycleDialogMode;
  } | null>(null);

  const columns = useMemo<ColumnDef<UnitResponseDto, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <SortableHeader label="Tên" column={column} />,
      },
      {
        accessorKey: 'code',
        header: ({ column }) => <SortableHeader label="Mã" column={column} />,
      },
      { accessorKey: 'symbol', header: 'Ký hiệu' },
      { accessorKey: 'status', header: 'Trạng thái' },
      {
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row }) =>
          row.original.status === 'ARCHIVED' ? (
            <PermissionButton
              permission="unit:restore"
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
                permission="unit:update"
                variant="outline"
                size="sm"
                render={<Link href={`/units/${row.original.id}`}>Sửa</Link>}
              />
              <PermissionButton
                permission="unit:delete"
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
    [],
  );

  const activeSort = sorting[0];

  const { data, isLoading, isError, error, refetch } = useUnitControllerSearch({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    page,
    limit: PAGE_LIMIT,
    sortBy: (activeSort?.id as UnitControllerSearchSortBy | undefined) ?? 'name',
    sortOrder: (activeSort?.desc ? 'desc' : 'asc') as UnitControllerSearchSortOrder,
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
        placeholder="Tìm theo tên hoặc mã đơn vị tính..."
        filters={
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus((value as UnitControllerSearchStatus | 'ALL') ?? 'ALL');
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
              description="Không tìm thấy đơn vị tính phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={Ruler}
              title="Chưa có đơn vị tính nào"
              description="Đơn vị tính sẽ hiển thị ở đây sau khi được tạo."
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
        <UnitLifecycleDialog
          open
          onOpenChange={(open) => {
            if (!open) setLifecycleTarget(null);
          }}
          unitId={lifecycleTarget.id}
          unitName={lifecycleTarget.name}
          mode={lifecycleTarget.mode}
        />
      )}
    </div>
  );
}

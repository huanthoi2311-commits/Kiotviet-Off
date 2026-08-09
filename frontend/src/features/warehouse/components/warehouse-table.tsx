'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Column, ColumnDef, SortingState } from '@tanstack/react-table';
import { Warehouse as WarehouseIcon } from 'lucide-react';
import { useWarehouseControllerSearch } from '@/generated/warehouse/warehouse';
import {
  WarehouseControllerSearchStatus,
  type WarehouseControllerSearchSortBy,
  type WarehouseControllerSearchSortOrder,
  type WarehouseResponseDto,
} from '@/generated/pOSERPEnterpriseAPI.schemas';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/common/empty-state';
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
import { useBranchOptions } from '../../inventory/use-inventory-relations';
import {
  WarehouseLifecycleDialog,
  type WarehouseLifecycleDialogMode,
} from './warehouse-lifecycle-dialog';

const STATUS_FILTER_OPTIONS: { value: WarehouseControllerSearchStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: WarehouseControllerSearchStatus.ACTIVE, label: 'Đang hoạt động' },
  { value: WarehouseControllerSearchStatus.INACTIVE, label: 'Ngừng hoạt động' },
];

const PAGE_LIMIT = 20;

function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: Column<WarehouseResponseDto, unknown>;
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
 * T044 Phase F/J — Warehouse List. `archived` (T044.05) is a separate, orthogonal filter from
 * `status` — Warehouse has no `ARCHIVED` status value (only ACTIVE/INACTIVE), so it mirrors Brand's
 * own page-level-checkbox pattern exactly, not Category/Unit's status-dropdown-fold.
 */
export function WarehouseTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WarehouseControllerSearchStatus | 'ALL'>('ALL');
  const [archived, setArchived] = useState(false);
  const [branchId, setBranchId] = useState<string | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [lifecycleTarget, setLifecycleTarget] = useState<{
    id: string;
    name: string;
    mode: WarehouseLifecycleDialogMode;
  } | null>(null);

  const { branchOptions } = useBranchOptions();

  const columns = useMemo<ColumnDef<WarehouseResponseDto, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <SortableHeader label="Tên kho" column={column} />,
      },
      {
        accessorKey: 'code',
        header: ({ column }) => <SortableHeader label="Mã" column={column} />,
      },
      { accessorKey: 'type', header: 'Loại' },
      { accessorKey: 'status', header: 'Trạng thái' },
      {
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row }) =>
          archived ? (
            <PermissionButton
              permission="warehouse:restore"
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
                permission="warehouse:update"
                variant="outline"
                size="sm"
                render={<Link href={`/warehouses/${row.original.id}`}>Sửa</Link>}
              />
              <PermissionButton
                permission="warehouse:delete"
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
                Xóa
              </PermissionButton>
            </div>
          ),
      },
    ],
    [archived],
  );

  const activeSort = sorting[0];

  const { data, isLoading, isError, error, refetch } = useWarehouseControllerSearch({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    branchId: branchId === 'ALL' ? undefined : branchId,
    archived,
    page,
    limit: PAGE_LIMIT,
    sortBy: (activeSort?.id as WarehouseControllerSearchSortBy | undefined) ?? 'name',
    sortOrder: (activeSort?.desc ? 'desc' : 'asc') as WarehouseControllerSearchSortOrder,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter =
    search.trim().length > 0 || status !== 'ALL' || branchId !== 'ALL' || archived;

  return (
    <div className="flex flex-col gap-4">
      <SearchToolbar
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Tìm theo tên hoặc mã kho..."
        filters={
          <>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus((value as WarehouseControllerSearchStatus | 'ALL') ?? 'ALL');
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
              value={branchId}
              onValueChange={(value) => {
                setBranchId(value ?? 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48" aria-label="Lọc theo chi nhánh">
                <SelectValue placeholder="Chi nhánh" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả chi nhánh</SelectItem>
                {branchOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <input
                id="warehouse-archived-filter"
                type="checkbox"
                className="size-4"
                checked={archived}
                onChange={(e) => {
                  setArchived(e.target.checked);
                  setPage(1);
                }}
              />
              <Label htmlFor="warehouse-archived-filter">Hiển thị đã xóa</Label>
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
              description="Không tìm thấy kho phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={WarehouseIcon}
              title="Chưa có kho nào"
              description="Kho sẽ hiển thị ở đây sau khi được tạo."
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
        <WarehouseLifecycleDialog
          open
          onOpenChange={(open) => {
            if (!open) setLifecycleTarget(null);
          }}
          warehouseId={lifecycleTarget.id}
          warehouseName={lifecycleTarget.name}
          mode={lifecycleTarget.mode}
        />
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardEdit } from 'lucide-react';
import { useInventoryAdjustmentControllerSearch } from '@/generated/inventory-adjustment/inventory-adjustment';
import {
  InventoryAdjustmentControllerSearchReason,
  InventoryAdjustmentControllerSearchStatus,
  type InventoryAdjustmentResponseDto,
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
  SUBMITTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  COMPLETED: 'Hoàn tất',
};

const STATUS_FILTER_OPTIONS: {
  value: InventoryAdjustmentControllerSearchStatus | 'ALL';
  label: string;
}[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: InventoryAdjustmentControllerSearchStatus.DRAFT, label: 'Nháp' },
  { value: InventoryAdjustmentControllerSearchStatus.SUBMITTED, label: 'Chờ duyệt' },
  { value: InventoryAdjustmentControllerSearchStatus.APPROVED, label: 'Đã duyệt' },
  { value: InventoryAdjustmentControllerSearchStatus.COMPLETED, label: 'Hoàn tất' },
];

const REASON_LABEL: Record<string, string> = {
  LOST: 'Thất lạc',
  DAMAGED: 'Hư hỏng',
  FOUND: 'Tìm thấy',
  SYSTEM: 'Hệ thống',
  OTHER: 'Khác',
};

const REASON_FILTER_OPTIONS: {
  value: InventoryAdjustmentControllerSearchReason | 'ALL';
  label: string;
}[] = [
  { value: 'ALL', label: 'Tất cả lý do' },
  { value: InventoryAdjustmentControllerSearchReason.LOST, label: 'Thất lạc' },
  { value: InventoryAdjustmentControllerSearchReason.DAMAGED, label: 'Hư hỏng' },
  { value: InventoryAdjustmentControllerSearchReason.FOUND, label: 'Tìm thấy' },
  { value: InventoryAdjustmentControllerSearchReason.SYSTEM, label: 'Hệ thống' },
  { value: InventoryAdjustmentControllerSearchReason.OTHER, label: 'Khác' },
];

/** T044 Phase M — Inventory Adjustment List. */
export function InventoryAdjustmentTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InventoryAdjustmentControllerSearchStatus | 'ALL'>('ALL');
  const [reason, setReason] = useState<InventoryAdjustmentControllerSearchReason | 'ALL'>('ALL');
  const [warehouseId, setWarehouseId] = useState<string | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const { warehouseOptions } = useWarehouseOptions(undefined);
  const warehouseNameById = useMemo(
    () => new Map(warehouseOptions.map((o) => [o.value, o.label])),
    [warehouseOptions],
  );

  const columns = useMemo<ColumnDef<InventoryAdjustmentResponseDto, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã phiếu' },
      {
        id: 'warehouse',
        header: 'Kho',
        cell: ({ row }) =>
          warehouseNameById.get(row.original.warehouseId) ?? row.original.warehouseId,
      },
      {
        id: 'reason',
        header: 'Lý do',
        cell: ({ row }) => REASON_LABEL[row.original.reason] ?? row.original.reason,
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
            permission="inventory:view"
            variant="outline"
            size="sm"
            render={<Link href={`/inventory-adjustments/${row.original.id}`}>Xem</Link>}
          />
        ),
      },
    ],
    [warehouseNameById],
  );

  const { data, isLoading, isError, error, refetch } = useInventoryAdjustmentControllerSearch({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    reason: reason === 'ALL' ? undefined : reason,
    warehouseId: warehouseId === 'ALL' ? undefined : warehouseId,
    page,
    limit: PAGE_LIMIT,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter =
    search.trim().length > 0 || status !== 'ALL' || reason !== 'ALL' || warehouseId !== 'ALL';

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
                  setStatus((value as InventoryAdjustmentControllerSearchStatus | 'ALL') ?? 'ALL');
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
                value={reason}
                onValueChange={(value) => {
                  setReason((value as InventoryAdjustmentControllerSearchReason | 'ALL') ?? 'ALL');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-40" aria-label="Lọc theo lý do">
                  <SelectValue placeholder="Lý do" />
                </SelectTrigger>
                <SelectContent>
                  {REASON_FILTER_OPTIONS.map((option) => (
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
          permission="inventory:adjust"
          render={<Link href="/inventory-adjustments/new">Tạo phiếu điều chỉnh</Link>}
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
              description="Không tìm thấy phiếu điều chỉnh phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={ClipboardEdit}
              title="Chưa có phiếu điều chỉnh nào"
              description="Phiếu điều chỉnh tồn kho sẽ hiển thị ở đây sau khi được tạo."
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

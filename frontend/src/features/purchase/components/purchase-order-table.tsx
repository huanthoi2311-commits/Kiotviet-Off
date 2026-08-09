'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ShoppingCart } from 'lucide-react';
import { usePurchaseOrderControllerSearch } from '@/generated/purchase-order/purchase-order';
import {
  PurchaseOrderControllerSearchStatus,
  type PurchaseOrderResponseDto,
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
import { useBranchOptions } from '../../inventory/use-inventory-relations';
import { useSupplierOptions } from '../use-purchase-relations';

const PAGE_LIMIT = 20;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  PENDING: 'Chờ xử lý',
  APPROVED: 'Đã duyệt',
  RECEIVED: 'Đã nhận hàng',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

/**
 * T045 §5 — Purchase Order List. `status` only offers DRAFT/APPROVED/RECEIVED/CANCELLED —
 * PENDING/COMPLETED are unreachable via any endpoint (SPEC-T045 §3), so they're omitted from the
 * filter to avoid implying a state no order can ever be in.
 */
const STATUS_FILTER_OPTIONS: {
  value: PurchaseOrderControllerSearchStatus | 'ALL';
  label: string;
}[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: PurchaseOrderControllerSearchStatus.DRAFT, label: 'Nháp' },
  { value: PurchaseOrderControllerSearchStatus.APPROVED, label: 'Đã duyệt' },
  { value: PurchaseOrderControllerSearchStatus.RECEIVED, label: 'Đã nhận hàng' },
  { value: PurchaseOrderControllerSearchStatus.CANCELLED, label: 'Đã hủy' },
];

export function PurchaseOrderTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseOrderControllerSearchStatus | 'ALL'>('ALL');
  const [supplierId, setSupplierId] = useState<string | 'ALL'>('ALL');
  const [branchId, setBranchId] = useState<string | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const { supplierOptions } = useSupplierOptions();
  const { branchOptions } = useBranchOptions();
  const supplierNameById = useMemo(
    () => new Map(supplierOptions.map((o) => [o.value, o.label])),
    [supplierOptions],
  );
  const branchNameById = useMemo(
    () => new Map(branchOptions.map((o) => [o.value, o.label])),
    [branchOptions],
  );

  const columns = useMemo<ColumnDef<PurchaseOrderResponseDto, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã đơn' },
      {
        id: 'supplier',
        header: 'Nhà cung cấp',
        cell: ({ row }) => supplierNameById.get(row.original.supplierId) ?? row.original.supplierId,
      },
      {
        id: 'branch',
        header: 'Chi nhánh',
        cell: ({ row }) => branchNameById.get(row.original.branchId) ?? row.original.branchId,
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
            permission="purchase:view"
            variant="outline"
            size="sm"
            render={<Link href={`/purchase-orders/${row.original.id}`}>Xem</Link>}
          />
        ),
      },
    ],
    [supplierNameById, branchNameById],
  );

  const { data, isLoading, isError, error, refetch } = usePurchaseOrderControllerSearch({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    supplierId: supplierId === 'ALL' ? undefined : supplierId,
    branchId: branchId === 'ALL' ? undefined : branchId,
    page,
    limit: PAGE_LIMIT,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter =
    search.trim().length > 0 || status !== 'ALL' || supplierId !== 'ALL' || branchId !== 'ALL';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <SearchToolbar
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Tìm theo mã đơn nhập..."
          filters={
            <>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus((value as PurchaseOrderControllerSearchStatus | 'ALL') ?? 'ALL');
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
                value={supplierId}
                onValueChange={(value) => {
                  setSupplierId(value ?? 'ALL');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-52" aria-label="Lọc theo nhà cung cấp">
                  <SelectValue placeholder="Nhà cung cấp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả nhà cung cấp</SelectItem>
                  {supplierOptions.map((option) => (
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
            </>
          }
        />
        <PermissionButton
          permission="purchase:create"
          render={<Link href="/purchase-orders/new">Tạo đơn nhập hàng</Link>}
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
              description="Không tìm thấy đơn nhập hàng phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={ShoppingCart}
              title="Chưa có đơn nhập hàng nào"
              description="Đơn nhập hàng sẽ hiển thị ở đây sau khi được tạo."
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

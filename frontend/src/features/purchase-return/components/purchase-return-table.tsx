'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Undo2 } from 'lucide-react';
import { usePurchaseReturnControllerSearch } from '@/generated/purchase-return/purchase-return';
import {
  PurchaseReturnControllerSearchStatus,
  type PurchaseReturnResponseDto,
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
import { useSupplierOptions } from '../../purchase/use-purchase-relations';

const PAGE_LIMIT = 20;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  APPROVED: 'Đã duyệt',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

const REASON_LABEL: Record<string, string> = {
  DAMAGED: 'Hư hỏng',
  WRONG_PRODUCT: 'Sai sản phẩm',
  EXPIRED: 'Hết hạn',
  OTHER: 'Khác',
};

const STATUS_FILTER_OPTIONS: {
  value: PurchaseReturnControllerSearchStatus | 'ALL';
  label: string;
}[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: PurchaseReturnControllerSearchStatus.DRAFT, label: 'Nháp' },
  { value: PurchaseReturnControllerSearchStatus.APPROVED, label: 'Đã duyệt' },
  { value: PurchaseReturnControllerSearchStatus.COMPLETED, label: 'Hoàn tất' },
  { value: PurchaseReturnControllerSearchStatus.CANCELLED, label: 'Đã hủy' },
];

export function PurchaseReturnTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseReturnControllerSearchStatus | 'ALL'>('ALL');
  const [supplierId, setSupplierId] = useState<string | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const { supplierOptions } = useSupplierOptions();
  const supplierNameById = useMemo(
    () => new Map(supplierOptions.map((o) => [o.value, o.label])),
    [supplierOptions],
  );

  const columns = useMemo<ColumnDef<PurchaseReturnResponseDto, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã phiếu' },
      {
        id: 'supplier',
        header: 'Nhà cung cấp',
        cell: ({ row }) => supplierNameById.get(row.original.supplierId) ?? row.original.supplierId,
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
            permission="purchase_return:view"
            variant="outline"
            size="sm"
            render={<Link href={`/purchase-returns/${row.original.id}`}>Xem</Link>}
          />
        ),
      },
    ],
    [supplierNameById],
  );

  const { data, isLoading, isError, error, refetch } = usePurchaseReturnControllerSearch({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    supplierId: supplierId === 'ALL' ? undefined : supplierId,
    page,
    limit: PAGE_LIMIT,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter = search.trim().length > 0 || status !== 'ALL' || supplierId !== 'ALL';

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
          <>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus((value as PurchaseReturnControllerSearchStatus | 'ALL') ?? 'ALL');
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
              description="Không tìm thấy phiếu trả hàng phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={Undo2}
              title="Chưa có phiếu trả hàng nào"
              description="Phiếu trả hàng nhà cung cấp sẽ hiển thị ở đây sau khi được tạo."
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

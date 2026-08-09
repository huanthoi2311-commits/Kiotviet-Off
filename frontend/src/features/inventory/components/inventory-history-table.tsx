'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { History } from 'lucide-react';
import { useInventoryControllerGetHistory } from '@/generated/inventory/inventory';
import {
  InventoryControllerGetHistoryMovementType,
  InventoryControllerGetHistoryReferenceType,
  type InventoryMovementResponseDto,
} from '@/generated/pOSERPEnterpriseAPI.schemas';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/common/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isNormalizedError, type NormalizedError } from '@/services/api-client';
import { useProductOptions, useWarehouseOptions } from '../use-inventory-relations';

const PAGE_LIMIT = 20;

const MOVEMENT_TYPE_OPTIONS: {
  value: InventoryControllerGetHistoryMovementType | 'ALL';
  label: string;
}[] = [
  { value: 'ALL', label: 'Tất cả loại' },
  { value: InventoryControllerGetHistoryMovementType.PURCHASE, label: 'Nhập mua' },
  { value: InventoryControllerGetHistoryMovementType.SALE, label: 'Bán hàng' },
  { value: InventoryControllerGetHistoryMovementType.RETURN, label: 'Trả hàng' },
  { value: InventoryControllerGetHistoryMovementType.TRANSFER_IN, label: 'Chuyển kho - Nhập' },
  { value: InventoryControllerGetHistoryMovementType.TRANSFER_OUT, label: 'Chuyển kho - Xuất' },
  { value: InventoryControllerGetHistoryMovementType.ADJUSTMENT, label: 'Điều chỉnh' },
  { value: InventoryControllerGetHistoryMovementType.COUNT, label: 'Kiểm kê' },
  { value: InventoryControllerGetHistoryMovementType.DAMAGE, label: 'Hư hỏng' },
  { value: InventoryControllerGetHistoryMovementType.INITIAL, label: 'Khởi tạo' },
];

const REFERENCE_TYPE_OPTIONS: {
  value: InventoryControllerGetHistoryReferenceType | 'ALL';
  label: string;
}[] = [
  { value: 'ALL', label: 'Tất cả nguồn' },
  { value: InventoryControllerGetHistoryReferenceType.PURCHASE, label: 'Nhập mua' },
  { value: InventoryControllerGetHistoryReferenceType.POS, label: 'Bán hàng (POS)' },
  { value: InventoryControllerGetHistoryReferenceType.TRANSFER, label: 'Chuyển kho' },
  { value: InventoryControllerGetHistoryReferenceType.COUNT, label: 'Kiểm kê' },
  { value: InventoryControllerGetHistoryReferenceType.RETURN, label: 'Trả hàng' },
  { value: InventoryControllerGetHistoryReferenceType.SYSTEM, label: 'Hệ thống' },
];

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** T044 Phase J — Inventory History (movement ledger, read-only, immutable rows). */
export function InventoryHistoryTable() {
  const [warehouseId, setWarehouseId] = useState<string | 'ALL'>('ALL');
  const [productId, setProductId] = useState<string | 'ALL'>('ALL');
  const [movementType, setMovementType] = useState<
    InventoryControllerGetHistoryMovementType | 'ALL'
  >('ALL');
  const [referenceType, setReferenceType] = useState<
    InventoryControllerGetHistoryReferenceType | 'ALL'
  >('ALL');
  const [page, setPage] = useState(1);

  const { warehouseOptions } = useWarehouseOptions(undefined);
  const { productOptions } = useProductOptions();
  const warehouseNameById = useMemo(
    () => new Map(warehouseOptions.map((o) => [o.value, o.label])),
    [warehouseOptions],
  );
  const productNameById = useMemo(
    () => new Map(productOptions.map((o) => [o.value, o.label])),
    [productOptions],
  );

  const columns = useMemo<ColumnDef<InventoryMovementResponseDto, unknown>[]>(
    () => [
      {
        id: 'product',
        header: 'Sản phẩm',
        cell: ({ row }) => productNameById.get(row.original.productId) ?? row.original.productId,
      },
      {
        id: 'warehouse',
        header: 'Kho',
        cell: ({ row }) =>
          warehouseNameById.get(row.original.warehouseId) ?? row.original.warehouseId,
      },
      { accessorKey: 'movementType', header: 'Loại' },
      { accessorKey: 'referenceType', header: 'Nguồn' },
      {
        id: 'quantity',
        header: 'Số lượng',
        cell: ({ row }) => {
          const q = Number(row.original.quantity);
          return q > 0 ? `+${row.original.quantity}` : row.original.quantity;
        },
      },
      { accessorKey: 'beforeQuantity', header: 'Trước' },
      { accessorKey: 'afterQuantity', header: 'Sau' },
      {
        id: 'remark',
        header: 'Ghi chú',
        cell: ({ row }) => asNullableString(row.original.remark) ?? '—',
      },
      {
        id: 'createdAt',
        header: 'Thời gian',
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString('vi-VN'),
      },
    ],
    [productNameById, warehouseNameById],
  );

  const { data, isLoading, isError, error, refetch } = useInventoryControllerGetHistory({
    warehouseId: warehouseId === 'ALL' ? undefined : warehouseId,
    productId: productId === 'ALL' ? undefined : productId,
    movementType: movementType === 'ALL' ? undefined : movementType,
    referenceType: referenceType === 'ALL' ? undefined : referenceType,
    page,
    limit: PAGE_LIMIT,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter =
    warehouseId !== 'ALL' ||
    productId !== 'ALL' ||
    movementType !== 'ALL' ||
    referenceType !== 'ALL';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
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

        <Select
          value={productId}
          onValueChange={(value) => {
            setProductId(value ?? 'ALL');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56" aria-label="Lọc theo sản phẩm">
            <SelectValue placeholder="Sản phẩm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả sản phẩm</SelectItem>
            {productOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={movementType}
          onValueChange={(value) => {
            setMovementType((value as InventoryControllerGetHistoryMovementType | 'ALL') ?? 'ALL');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-52" aria-label="Lọc theo loại biến động">
            <SelectValue placeholder="Loại biến động" />
          </SelectTrigger>
          <SelectContent>
            {MOVEMENT_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={referenceType}
          onValueChange={(value) => {
            setReferenceType(
              (value as InventoryControllerGetHistoryReferenceType | 'ALL') ?? 'ALL',
            );
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Lọc theo nguồn">
            <SelectValue placeholder="Nguồn" />
          </SelectTrigger>
          <SelectContent>
            {REFERENCE_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              description="Không tìm thấy biến động phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={History}
              title="Chưa có biến động tồn kho nào"
              description="Lịch sử biến động sẽ hiển thị ở đây khi phát sinh giao dịch."
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

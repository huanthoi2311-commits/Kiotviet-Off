'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Package } from 'lucide-react';
import { useInventoryControllerSearch } from '@/generated/inventory/inventory';
import type { InventoryResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
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

/**
 * T044 Phase J — Inventory List (read-only). `InventoryQueryDto` has no `search` param at all — no
 * `SearchToolbar` text box is rendered here, since there is nothing on the backend for it to
 * actually filter (matches the spec's own "never emulate unsupported server filtering client-side"
 * rule). Only `warehouseId`/`productId` dropdown filters, both server-driven.
 */
export function InventoryTable() {
  const [warehouseId, setWarehouseId] = useState<string | 'ALL'>('ALL');
  const [productId, setProductId] = useState<string | 'ALL'>('ALL');
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

  const columns = useMemo<ColumnDef<InventoryResponseDto, unknown>[]>(
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
      { accessorKey: 'quantity', header: 'Tồn kho' },
      { accessorKey: 'reservedQty', header: 'Đã giữ' },
      { accessorKey: 'availableQty', header: 'Khả dụng' },
      { accessorKey: 'avgCost', header: 'Giá vốn TB' },
    ],
    [productNameById, warehouseNameById],
  );

  const { data, isLoading, isError, error, refetch } = useInventoryControllerSearch({
    warehouseId: warehouseId === 'ALL' ? undefined : warehouseId,
    productId: productId === 'ALL' ? undefined : productId,
    page,
    limit: PAGE_LIMIT,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter = warehouseId !== 'ALL' || productId !== 'ALL';

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
              description="Không tìm thấy tồn kho phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={Package}
              title="Chưa có dữ liệu tồn kho"
              description="Tồn kho sẽ hiển thị ở đây sau khi phát sinh giao dịch."
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

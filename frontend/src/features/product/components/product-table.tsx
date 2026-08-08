'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Column, ColumnDef, SortingState } from '@tanstack/react-table';
import { Package } from 'lucide-react';
import { useProductControllerSearch } from '@/generated/product/product';
import {
  ProductControllerSearchStatus,
  ProductControllerSearchType,
  type ProductControllerSearchSortBy,
  type ProductControllerSearchSortOrder,
  type ProductResponseDto,
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
import { useProductRelationOptions } from '../use-product-relations';
import {
  ProductLifecycleDialog,
  type ProductLifecycleDialogMode,
} from './product-lifecycle-dialog';

const STATUS_FILTER_OPTIONS: { value: ProductControllerSearchStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: ProductControllerSearchStatus.ACTIVE, label: 'Đang hoạt động' },
  { value: ProductControllerSearchStatus.INACTIVE, label: 'Ngừng hoạt động' },
  { value: ProductControllerSearchStatus.ARCHIVED, label: 'Đã lưu trữ' },
];

const TYPE_FILTER_OPTIONS: { value: ProductControllerSearchType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả loại' },
  { value: ProductControllerSearchType.STANDARD, label: 'Sản phẩm thường' },
  { value: ProductControllerSearchType.SERVICE, label: 'Dịch vụ' },
  { value: ProductControllerSearchType.VARIANT_PARENT, label: 'Sản phẩm cha (Variant)' },
  { value: ProductControllerSearchType.VARIANT_CHILD, label: 'Biến thể (Variant)' },
];

const PAGE_LIMIT = 20;

function SortableHeader({
  label,
  column,
}: {
  label: string;
  column: Column<ProductResponseDto, unknown>;
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

function retailPriceOf(product: ProductResponseDto): string | null {
  const retail = product.prices.find((p) => p.type === 'RETAIL');
  return retail ? retail.price : null;
}

/**
 * T043 Phase D — Product List. `status` genuinely has `ARCHIVED` (like Category/Unit), so it's
 * folded into the single status dropdown, and the actions column is per-row status-conditional
 * (`row.original.status === 'ARCHIVED'` → Restore only) — not Brand's separate-checkbox pattern.
 * The Archive action is NOT hidden for `VARIANT_PARENT` rows with active children: the search
 * response has no field indicating whether a parent has active Variant Children, so hiding it
 * client-side isn't possible without inventing data the backend doesn't expose — PRODUCT_012 is
 * enforced by the real backend and surfaced through the lifecycle dialog instead (reactive, not
 * predictive), same principle already applied to PRODUCT_008 on Edit.
 */
export function ProductTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProductControllerSearchStatus | 'ALL'>('ALL');
  const [type, setType] = useState<ProductControllerSearchType | 'ALL'>('ALL');
  const [categoryId, setCategoryId] = useState<string | 'ALL'>('ALL');
  const [brandId, setBrandId] = useState<string | 'ALL'>('ALL');
  const [unitId, setUnitId] = useState<string | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [lifecycleTarget, setLifecycleTarget] = useState<{
    id: string;
    name: string;
    mode: ProductLifecycleDialogMode;
  } | null>(null);

  const { categoryOptions, brandOptions, unitOptions } = useProductRelationOptions(undefined);
  const categoryNameById = useMemo(
    () => new Map(categoryOptions.map((o) => [o.value, o.label])),
    [categoryOptions],
  );

  const columns = useMemo<ColumnDef<ProductResponseDto, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <SortableHeader label="Tên sản phẩm" column={column} />,
      },
      {
        accessorKey: 'sku',
        header: ({ column }) => <SortableHeader label="Mã (SKU)" column={column} />,
      },
      { accessorKey: 'type', header: 'Loại' },
      {
        id: 'category',
        header: 'Danh mục',
        cell: ({ row }) => categoryNameById.get(row.original.categoryId) ?? row.original.categoryId,
      },
      {
        id: 'retailPrice',
        header: ({ column }) => <SortableHeader label="Giá bán lẻ" column={column} />,
        cell: ({ row }) => retailPriceOf(row.original) ?? '—',
      },
      { accessorKey: 'status', header: 'Trạng thái' },
      {
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row }) =>
          row.original.status === 'ARCHIVED' ? (
            <PermissionButton
              permission="product:restore"
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
                permission="product:update"
                variant="outline"
                size="sm"
                render={<Link href={`/products/${row.original.id}`}>Sửa</Link>}
              />
              <PermissionButton
                permission="product:delete"
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
    [categoryNameById],
  );

  const activeSort = sorting[0];

  const { data, isLoading, isError, error, refetch } = useProductControllerSearch({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    type: type === 'ALL' ? undefined : type,
    categoryId: categoryId === 'ALL' ? undefined : categoryId,
    brandId: brandId === 'ALL' ? undefined : brandId,
    unitId: unitId === 'ALL' ? undefined : unitId,
    page,
    limit: PAGE_LIMIT,
    sortBy:
      ((activeSort?.id === 'retailPrice' ? 'price' : activeSort?.id) as
        ProductControllerSearchSortBy | undefined) ?? 'name',
    sortOrder: (activeSort?.desc ? 'desc' : 'asc') as ProductControllerSearchSortOrder,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter =
    search.trim().length > 0 ||
    status !== 'ALL' ||
    type !== 'ALL' ||
    categoryId !== 'ALL' ||
    brandId !== 'ALL' ||
    unitId !== 'ALL';

  return (
    <div className="flex flex-col gap-4">
      <SearchToolbar
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Tìm theo tên, SKU hoặc barcode..."
        filters={
          <div className="flex flex-wrap gap-2">
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus((value as ProductControllerSearchStatus | 'ALL') ?? 'ALL');
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
              value={type}
              onValueChange={(value) => {
                setType((value as ProductControllerSearchType | 'ALL') ?? 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-52" aria-label="Lọc theo loại sản phẩm">
                <SelectValue placeholder="Loại sản phẩm" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={categoryId}
              onValueChange={(value) => {
                setCategoryId(value ?? 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48" aria-label="Lọc theo danh mục">
                <SelectValue placeholder="Danh mục" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả danh mục</SelectItem>
                {categoryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={brandId}
              onValueChange={(value) => {
                setBrandId(value ?? 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48" aria-label="Lọc theo thương hiệu">
                <SelectValue placeholder="Thương hiệu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả thương hiệu</SelectItem>
                {brandOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={unitId}
              onValueChange={(value) => {
                setUnitId(value ?? 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-44" aria-label="Lọc theo đơn vị tính">
                <SelectValue placeholder="Đơn vị tính" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả đơn vị tính</SelectItem>
                {unitOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              description="Không tìm thấy sản phẩm phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={Package}
              title="Chưa có sản phẩm nào"
              description="Sản phẩm sẽ hiển thị ở đây sau khi được tạo."
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
        <ProductLifecycleDialog
          open
          onOpenChange={(open) => {
            if (!open) setLifecycleTarget(null);
          }}
          productId={lifecycleTarget.id}
          productName={lifecycleTarget.name}
          mode={lifecycleTarget.mode}
        />
      )}
    </div>
  );
}

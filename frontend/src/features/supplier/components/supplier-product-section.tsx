'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getSupplierProductControllerListQueryKey,
  useSupplierProductControllerList,
  useSupplierProductControllerRemove,
  useSupplierProductControllerUpsert,
} from '@/generated/supplier-product/supplier-product';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PermissionButton } from '@/components/common/permission-button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { isNormalizedError, type NormalizedError } from '@/services/api-client';
import { useProductOptions } from '../use-supplier-relations';

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

/** T049 §10 — Supplier-Product mapping, embedded directly in Supplier Detail (Classification A,
 * reuses Supplier's own supplier:view/supplier:update permissions — no separate namespace). */
export function SupplierProductSection({ supplierId }: { supplierId: string }) {
  const queryClient = useQueryClient();
  const { productOptions } = useProductOptions();
  const productNameById = new Map(productOptions.map((o) => [o.value, o.label]));

  const [productId, setProductId] = useState('');
  const [supplierSku, setSupplierSku] = useState('');
  const [defaultPrice, setDefaultPrice] = useState('');
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useSupplierProductControllerList(supplierId);

  const invalidateList = () => {
    queryClient.invalidateQueries({
      queryKey: getSupplierProductControllerListQueryKey(supplierId),
    });
  };

  const upsertMutation = useSupplierProductControllerUpsert<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        invalidateList();
        toast.success('Đã gán sản phẩm cho nhà cung cấp');
        setProductId('');
        setSupplierSku('');
        setDefaultPrice('');
        setFormError(null);
      },
      onError: (err) => {
        setFormError(err.kind === 'api-error' ? err.message : 'Đã xảy ra lỗi không xác định');
      },
    },
  });

  const removeMutation = useSupplierProductControllerRemove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        invalidateList();
        toast.success('Đã bỏ gán sản phẩm');
        setRemoveTarget(null);
      },
      onError: () => {
        setRemoveTarget(null);
      },
    },
  });

  const handleAssign = () => {
    setFormError(null);
    if (!productId) {
      setFormError('Vui lòng chọn sản phẩm');
      return;
    }
    upsertMutation.mutate({
      supplierId,
      data: {
        productId,
        supplierSku: supplierSku || undefined,
        defaultPrice: defaultPrice ? Number(defaultPrice) : undefined,
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SupplierProductAssignForm
        productOptions={productOptions}
        productId={productId}
        setProductId={setProductId}
        supplierSku={supplierSku}
        setSupplierSku={setSupplierSku}
        defaultPrice={defaultPrice}
        setDefaultPrice={setDefaultPrice}
        onAssign={handleAssign}
        isPending={upsertMutation.isPending}
        errorMessage={formError}
      />

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <p className="text-destructive text-sm">
            {isNormalizedError(error) ? error.message : 'Đã xảy ra lỗi không xác định'}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="Chưa có sản phẩm nào được gán"
          description="Gán sản phẩm để thiết lập nhà cung cấp ưu tiên, giá và thời gian giao hàng."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sản phẩm</TableHead>
              <TableHead>Mã NCC</TableHead>
              <TableHead>Giá mặc định</TableHead>
              <TableHead>Ưu tiên</TableHead>
              <TableHead>Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((mapping) => (
              <TableRow key={mapping.id}>
                <TableCell>{productNameById.get(mapping.productId) ?? mapping.productId}</TableCell>
                <TableCell>{asNullableString(mapping.supplierSku) ?? '—'}</TableCell>
                <TableCell>{asNullableString(mapping.defaultPrice) ?? '—'}</TableCell>
                <TableCell>{asNullableNumber(mapping.priority) ?? '—'}</TableCell>
                <TableCell>
                  <PermissionButton
                    permission="supplier:update"
                    variant="outline"
                    size="sm"
                    onClick={() => setRemoveTarget(mapping.productId)}
                  >
                    Bỏ gán
                  </PermissionButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="Bỏ gán sản phẩm?"
        description="Sản phẩm sẽ không còn liên kết với nhà cung cấp này."
        confirmLabel="Bỏ gán"
        danger
        isConfirming={removeMutation.isPending}
        onConfirm={() => {
          if (removeTarget) removeMutation.mutate({ supplierId, productId: removeTarget });
        }}
      />
    </div>
  );
}

function SupplierProductAssignForm({
  productOptions,
  productId,
  setProductId,
  supplierSku,
  setSupplierSku,
  defaultPrice,
  setDefaultPrice,
  onAssign,
  isPending,
  errorMessage,
}: {
  productOptions: { value: string; label: string }[];
  productId: string;
  setProductId: (value: string) => void;
  supplierSku: string;
  setSupplierSku: (value: string) => void;
  defaultPrice: string;
  setDefaultPrice: (value: string) => void;
  onAssign: () => void;
  isPending: boolean;
  errorMessage: string | null;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 border-b pb-4">
      <div className="space-y-1.5">
        <Label htmlFor="supplier-product-select">Sản phẩm</Label>
        <Select value={productId} onValueChange={(value) => setProductId(value ?? '')}>
          <SelectTrigger id="supplier-product-select" className="w-56" aria-label="Sản phẩm">
            <SelectValue placeholder="Chọn sản phẩm" />
          </SelectTrigger>
          <SelectContent>
            {productOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="supplier-product-sku">Mã NCC</Label>
        <Input
          id="supplier-product-sku"
          className="w-32"
          value={supplierSku}
          onChange={(e) => setSupplierSku(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="supplier-product-price">Giá mặc định</Label>
        <Input
          id="supplier-product-price"
          type="number"
          className="w-32"
          value={defaultPrice}
          onChange={(e) => setDefaultPrice(e.target.value)}
        />
      </div>
      <PermissionButton
        permission="supplier:update"
        onClick={onAssign}
        disabled={isPending}
        aria-disabled={isPending}
      >
        {isPending ? 'Đang gán...' : 'Gán sản phẩm'}
      </PermissionButton>
      {errorMessage && <p className="text-destructive w-full text-sm">{errorMessage}</p>}
    </div>
  );
}

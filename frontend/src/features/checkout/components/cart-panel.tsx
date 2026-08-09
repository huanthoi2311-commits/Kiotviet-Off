'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { barcodeControllerSearch } from '@/generated/barcode/barcode';
import {
  getCartControllerGetCartQueryKey,
  useCartControllerAdd,
  useCartControllerClear,
  useCartControllerGetCart,
  useCartControllerRemove,
  useCartControllerUpdate,
} from '@/generated/cart/cart';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useProductOptions } from '../../inventory/use-inventory-relations';

/**
 * T046 §4 — Cart is backend-persisted (Redis, per current user), not local UI state. No stock
 * availability is ever shown here — the backend performs zero reservation/validation at Cart
 * level (SPEC-T046 §4), only at Checkout. All totals shown are exactly what the backend returns.
 */
export function CartPanel() {
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState('');
  const [addQuantity, setAddQuantity] = useState('1');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const { productOptions } = useProductOptions();

  const { data: cart, isLoading, isError, error, refetch } = useCartControllerGetCart();

  const invalidateCart = () => {
    queryClient.invalidateQueries({ queryKey: getCartControllerGetCartQueryKey() });
  };

  const handleMutationError = (err: NormalizedError) => {
    setRootError(err.kind === 'api-error' ? err.message : 'Đã xảy ra lỗi không xác định');
  };

  const addMutation = useCartControllerAdd<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        invalidateCart();
        setRootError(null);
      },
      onError: handleMutationError,
    },
  });

  const updateMutation = useCartControllerUpdate<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        invalidateCart();
        setRootError(null);
      },
      onError: handleMutationError,
    },
  });

  const removeMutation = useCartControllerRemove<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        invalidateCart();
        setRootError(null);
      },
      onError: handleMutationError,
    },
  });

  const clearMutation = useCartControllerClear<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        invalidateCart();
        setRootError(null);
        toast.success('Đã xóa giỏ hàng');
        setShowClearConfirm(false);
      },
      onError: handleMutationError,
    },
  });

  const handleAddProduct = () => {
    if (!productId) return;
    const quantity = Number(addQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    addMutation.mutate({ data: { productId, quantity } });
  };

  const handleBarcodeLookup = async () => {
    const code = barcodeInput.trim();
    if (!code) return;
    setBarcodeError(null);
    setIsLookingUpBarcode(true);
    try {
      const result = await barcodeControllerSearch({ search: code, limit: 1 });
      const match = result.items[0];
      if (!match) {
        setBarcodeError(`Không tìm thấy mã vạch "${code}"`);
        return;
      }
      addMutation.mutate({ data: { productId: match.productId, quantity: 1 } });
      setBarcodeInput('');
    } catch {
      setBarcodeError('Không thể tra cứu mã vạch, vui lòng thử lại');
    } finally {
      setIsLookingUpBarcode(false);
    }
  };

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (normalizedError || !cart) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <p className="text-destructive text-sm">
          {normalizedError?.message ?? 'Đã xảy ra lỗi không xác định'}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rootError && (
        <Alert variant="destructive">
          <AlertDescription>{rootError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-64 space-y-1.5">
          <Label htmlFor="cart-product">Sản phẩm</Label>
          <Select
            items={productOptions}
            value={productId}
            onValueChange={(value) => setProductId(value ?? '')}
          >
            <SelectTrigger id="cart-product" className="w-full" aria-label="Sản phẩm">
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
        <div className="w-24 space-y-1.5">
          <Label htmlFor="cart-add-quantity">Số lượng</Label>
          <Input
            id="cart-add-quantity"
            type="number"
            min={0}
            step="any"
            value={addQuantity}
            onChange={(e) => setAddQuantity(e.target.value)}
          />
        </div>
        <Button
          type="button"
          disabled={!productId || addMutation.isPending}
          onClick={handleAddProduct}
        >
          <Plus className="size-4" />
          Thêm vào giỏ
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-64 space-y-1.5">
          <Label htmlFor="cart-barcode">Quét / nhập mã vạch</Label>
          <Input
            id="cart-barcode"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleBarcodeLookup();
              }
            }}
            aria-invalid={Boolean(barcodeError)}
          />
          {barcodeError && <p className="text-destructive text-sm">{barcodeError}</p>}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!barcodeInput.trim() || isLookingUpBarcode}
          onClick={() => void handleBarcodeLookup()}
        >
          Tra cứu
        </Button>
      </div>

      {cart.items.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Giỏ hàng đang trống"
          description="Thêm sản phẩm vào giỏ để bắt đầu bán hàng."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sản phẩm</TableHead>
                <TableHead>Đơn giá</TableHead>
                <TableHead>Số lượng</TableHead>
                <TableHead>Giảm giá</TableHead>
                <TableHead>Thuế</TableHead>
                <TableHead>Thành tiền</TableHead>
                <TableHead>
                  <span className="sr-only">Thao tác</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cart.items.map((item) => (
                <TableRow key={item.productId}>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell>{item.price}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Giảm số lượng ${item.productName}`}
                        disabled={updateMutation.isPending || Number(item.quantity) <= 1}
                        onClick={() =>
                          updateMutation.mutate({
                            data: {
                              productId: item.productId,
                              quantity: Number(item.quantity) - 1,
                            },
                          })
                        }
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-10 text-center">{item.quantity}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Tăng số lượng ${item.productName}`}
                        disabled={updateMutation.isPending}
                        onClick={() =>
                          updateMutation.mutate({
                            data: {
                              productId: item.productId,
                              quantity: Number(item.quantity) + 1,
                            },
                          })
                        }
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>{item.discount}</TableCell>
                  <TableCell>{item.tax}</TableCell>
                  <TableCell>{item.total}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Xóa ${item.productName} khỏi giỏ`}
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate({ data: { productId: item.productId } })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <dl
            aria-live="polite"
            className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:w-80 sm:self-end"
          >
            <dt className="text-muted-foreground">Tạm tính</dt>
            <dd className="text-right">{cart.subtotal}</dd>
            <dt className="text-muted-foreground">Giảm giá</dt>
            <dd className="text-right">{cart.totalDiscount}</dd>
            <dt className="text-muted-foreground">Thuế</dt>
            <dd className="text-right">{cart.totalTax}</dd>
            <dt className="font-medium">Tổng cộng</dt>
            <dd className="text-right font-medium">{cart.totalAmount}</dd>
          </dl>

          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => setShowClearConfirm(true)}
          >
            Xóa giỏ hàng
          </Button>
        </>
      )}

      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Xóa toàn bộ giỏ hàng?"
        description="Toàn bộ sản phẩm trong giỏ sẽ bị xóa."
        confirmLabel="Xóa giỏ hàng"
        danger
        isConfirming={clearMutation.isPending}
        onConfirm={() => clearMutation.mutate()}
      />
    </div>
  );
}

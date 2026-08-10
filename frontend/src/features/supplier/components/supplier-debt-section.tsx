'use client';

import { useSupplierDebtControllerSearch } from '@/generated/supplier-debt/supplier-debt';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/use-permission';
import { isNormalizedError } from '@/services/api-client';

/**
 * T049 §9 (Architect Decision AD-2) — READ-ONLY summary only. `totalDebt`/`totalPaid`/`balance`
 * are displayed exactly as returned by `GET /supplier-debt?supplierId=`, never recomputed
 * client-side. Gated independently by `debt:view` (not `supplier:view`) — hidden, not an error,
 * when absent. No payment recording, no payment history (no such endpoint exists).
 */
export function SupplierDebtSection({ supplierId }: { supplierId: string }) {
  const canViewDebt = usePermission('debt:view');

  const { data, isLoading, isError, error, refetch } = useSupplierDebtControllerSearch(
    { supplierId, limit: 1 },
    { query: { enabled: canViewDebt } },
  );

  if (!canViewDebt) return null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-64" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 text-center">
        <p className="text-destructive text-sm">
          {isNormalizedError(error) ? error.message : 'Đã xảy ra lỗi không xác định'}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  const debt = data?.items[0];
  if (!debt) {
    return <p className="text-muted-foreground text-sm">Chưa có phát sinh công nợ.</p>;
  }

  return (
    <dl className="grid grid-cols-3 gap-4">
      <div>
        <dt className="text-muted-foreground text-sm">Tổng phát sinh</dt>
        <dd className="font-medium">{debt.totalDebt}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-sm">Đã thanh toán</dt>
        <dd className="font-medium">{debt.totalPaid}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-sm">Công nợ hiện tại</dt>
        <dd className="font-medium">{debt.balance}</dd>
      </div>
    </dl>
  );
}

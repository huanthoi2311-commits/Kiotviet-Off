'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePurchaseReportControllerGetDashboard } from '@/generated/purchase-report/purchase-report';
import type { PurchaseReportBreakdownItemResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { isNormalizedError, type NormalizedError } from '@/services/api-client';

interface PurchaseReportDashboardProps {
  dateFrom?: string;
  dateTo?: string;
}

/**
 * T050 — Dashboard KPIs + Top Supplier/Top Product/Monthly Purchase, rendered exactly as returned
 * by `GET /purchase-reports/dashboard` — no client-side recomputation (matches Supplier Debt's own
 * established "backend-computed values only" convention, T049 AD-2). Money/quantity values are
 * rendered as the raw `Decimal` strings the backend returns, matching the codebase-wide convention
 * (e.g. `purchase-order-table.tsx`'s own `totalAmount` column) — no reformatting here.
 */
export function PurchaseReportDashboard({ dateFrom, dateTo }: PurchaseReportDashboardProps) {
  const { data, isLoading, isError, error, refetch } = usePurchaseReportControllerGetDashboard({
    dateFrom,
    dateTo,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    const normalized: NormalizedError = isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' };
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border p-6 text-center">
        <p className="text-destructive text-sm">{normalized.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <dt className="text-muted-foreground text-sm">Tổng tiền nhập hàng</dt>
          <dd className="text-lg font-semibold">{data.totalAmount}</dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-muted-foreground text-sm">Tổng số đơn</dt>
          <dd className="text-lg font-semibold">{data.totalOrders}</dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-muted-foreground text-sm">Giá vốn bình quân</dt>
          <dd className="text-lg font-semibold">{data.averageCost}</dd>
        </div>
      </dl>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BreakdownList title="Top nhà cung cấp" items={data.topSuppliers} />
        <BreakdownList title="Top sản phẩm" items={data.topProducts} />
        <BreakdownList title="Nhập hàng theo tháng" items={data.monthlyPurchase} />
      </div>
    </div>
  );
}

function BreakdownList({
  title,
  items,
}: {
  title: string;
  items: PurchaseReportBreakdownItemResponseDto[];
}) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Không có dữ liệu.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {items.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-2">
              <span>{item.label}</span>
              <span className="font-medium">{item.totalAmount}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

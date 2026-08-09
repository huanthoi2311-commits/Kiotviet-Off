'use client';

import { useState } from 'react';
import { useCustomerPointControllerHistory } from '@/generated/customer-point/customer-point';
import { EmptyState } from '@/components/common/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/use-permission';
import { isNormalizedError } from '@/services/api-client';

const PAGE_LIMIT = 20;

function formatReference(referenceType: unknown, referenceId: unknown): string {
  const type = typeof referenceType === 'string' ? referenceType : null;
  const id = typeof referenceId === 'string' ? referenceId : null;
  if (!type && !id) return '—';
  if (type && id) return `${type} (${id.slice(0, 8)})`;
  return type ?? id ?? '—';
}

function formatExpiredAt(expiredAt: unknown): string {
  if (typeof expiredAt !== 'string') return '—';
  return new Date(expiredAt).toLocaleDateString('vi-VN');
}

/**
 * T048 §8 (Architect Decision AD-1) — READ-ONLY balance + history only.
 * Balance comes from `Customer.totalPoint` (the caller's own response),
 * never recomputed here. History is gated independently by `point:view`
 * (not `customer:view`) — hidden, not an error, when absent.
 */
export function CustomerPointSection({
  customerId,
  totalPoint,
}: {
  customerId: string;
  totalPoint: number;
}) {
  const canViewPoints = usePermission('point:view');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useCustomerPointControllerHistory(
    { customerId, page, limit: PAGE_LIMIT },
    { query: { enabled: canViewPoints } },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Điểm tích lũy hiện tại</span>
        <span className="text-lg font-semibold">{totalPoint}</span>
      </div>

      {!canViewPoints ? null : isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <p className="text-destructive text-sm">
            {isNormalizedError(error) ? error.message : 'Đã xảy ra lỗi không xác định'}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="Chưa có lịch sử điểm"
          description="Lịch sử cộng/trừ điểm tích lũy sẽ hiển thị ở đây."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thời gian</TableHead>
              <TableHead>Thay đổi</TableHead>
              <TableHead>Số dư</TableHead>
              <TableHead>Nguồn</TableHead>
              <TableHead>Hết hạn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{new Date(entry.createdAt).toLocaleString('vi-VN')}</TableCell>
                <TableCell className={entry.point >= 0 ? 'text-green-600' : 'text-destructive'}>
                  {entry.point >= 0 ? `+${entry.point}` : entry.point}
                </TableCell>
                <TableCell>{entry.balance}</TableCell>
                <TableCell>{formatReference(entry.referenceType, entry.referenceId)}</TableCell>
                <TableCell>{formatExpiredAt(entry.expiredAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canViewPoints && data && data.total > PAGE_LIMIT && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page * PAGE_LIMIT >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      )}
    </div>
  );
}

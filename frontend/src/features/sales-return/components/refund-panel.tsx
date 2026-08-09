'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getSalesReturnControllerFindOneQueryKey,
  useSalesReturnControllerCreateRefund,
} from '@/generated/sales-return/sales-return';
import type { SalesReturnRefundResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { NormalizedError } from '@/services/api-client';
import { RefundActionDialog, type RefundActionDialogMode } from './refund-action-dialog';

const REFUND_METHOD_OPTIONS = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
  { value: 'CARD', label: 'Thẻ' },
  { value: 'E_WALLET', label: 'Ví điện tử' },
] as const;

const REFUND_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ xử lý',
  PROCESSING: 'Đang xử lý',
  COMPLETED: 'Hoàn tất',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
};

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

const REFUNDABLE_STATUSES = ['RECEIVED', 'COMPLETED'];

/**
 * T047 §9 — Refund is its own domain, embedded in `SalesReturnResponseDto.refunds` (no separate
 * query). Creation is gated to RECEIVED/COMPLETED sales returns — a real, derivable rule
 * (`SALES_RETURN_014` rejects refunds on a not-yet-received return), enforced here as a client-side
 * UX gate on top of the server's own authoritative check.
 */
export function RefundPanel({
  salesReturnId,
  salesReturnStatus,
  refunds,
  onVersionConflict,
}: {
  salesReturnId: string;
  salesReturnStatus: string;
  refunds: SalesReturnRefundResponseDto[];
  onVersionConflict: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof REFUND_METHOD_OPTIONS)[number]['value']>('CASH');
  const [externalReference, setExternalReference] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    refundId: string;
    version: number;
    mode: RefundActionDialogMode;
  } | null>(null);

  const createRefundMutation = useSalesReturnControllerCreateRefund<NormalizedError>({
    mutation: {
      meta: { suppressGlobalErrorToast: true },
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getSalesReturnControllerFindOneQueryKey(salesReturnId),
        });
        toast.success('Đã tạo hoàn tiền');
        setAmount('');
        setExternalReference('');
        setCreateError(null);
      },
      onError: (error) => {
        setCreateError(error.kind === 'api-error' ? error.message : 'Đã xảy ra lỗi không xác định');
      },
    },
  });

  const handleCreateRefund = () => {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setCreateError('Vui lòng nhập số tiền hợp lệ');
      return;
    }
    setCreateError(null);
    createRefundMutation.mutate({
      id: salesReturnId,
      data: { amount: parsedAmount, method, externalReference: externalReference || undefined },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium">Hoàn tiền</h2>

      {refunds.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Số tiền</TableHead>
              <TableHead>Phương thức</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Lý do thất bại</TableHead>
              <TableHead>
                <span className="sr-only">Thao tác</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {refunds.map((refund) => (
              <TableRow key={refund.id}>
                <TableCell>{refund.amount}</TableCell>
                <TableCell>{refund.method}</TableCell>
                <TableCell>{REFUND_STATUS_LABEL[refund.status] ?? refund.status}</TableCell>
                <TableCell>{asNullableString(refund.failureReason) ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {refund.status === 'PENDING' && (
                      <>
                        <PermissionButton
                          permission="sales_return:refund"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setActionTarget({
                              refundId: refund.id,
                              version: refund.version,
                              mode: 'process',
                            })
                          }
                        >
                          Xử lý
                        </PermissionButton>
                        <PermissionButton
                          permission="sales_return:refund"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setActionTarget({
                              refundId: refund.id,
                              version: refund.version,
                              mode: 'cancel',
                            })
                          }
                        >
                          Hủy
                        </PermissionButton>
                      </>
                    )}
                    {refund.status === 'PROCESSING' && (
                      <>
                        <PermissionButton
                          permission="sales_return:refund"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setActionTarget({
                              refundId: refund.id,
                              version: refund.version,
                              mode: 'complete',
                            })
                          }
                        >
                          Hoàn tất
                        </PermissionButton>
                        <PermissionButton
                          permission="sales_return:refund"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setActionTarget({
                              refundId: refund.id,
                              version: refund.version,
                              mode: 'fail',
                            })
                          }
                        >
                          Đánh dấu thất bại
                        </PermissionButton>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {REFUNDABLE_STATUSES.includes(salesReturnStatus) && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          {createError && (
            <Alert variant="destructive" className="w-full">
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}
          <div className="w-32 space-y-1.5">
            <Label htmlFor="refund-amount">Số tiền hoàn</Label>
            <Input
              id="refund-amount"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="w-44 space-y-1.5">
            <Label htmlFor="refund-method">Phương thức</Label>
            <Select
              items={REFUND_METHOD_OPTIONS}
              value={method}
              onValueChange={(value) => setMethod((value as typeof method) ?? 'CASH')}
            >
              <SelectTrigger
                id="refund-method"
                className="w-full"
                aria-label="Phương thức hoàn tiền"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFUND_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48 space-y-1.5">
            <Label htmlFor="refund-external-reference">Mã tham chiếu (nếu có)</Label>
            <Input
              id="refund-external-reference"
              value={externalReference}
              onChange={(e) => setExternalReference(e.target.value)}
            />
          </div>
          <PermissionButton
            permission="sales_return:refund"
            disabled={createRefundMutation.isPending}
            onClick={handleCreateRefund}
          >
            Tạo hoàn tiền
          </PermissionButton>
        </div>
      )}

      {actionTarget && (
        <RefundActionDialog
          open
          onOpenChange={(open) => {
            if (!open) setActionTarget(null);
          }}
          salesReturnId={salesReturnId}
          refundId={actionTarget.refundId}
          version={actionTarget.version}
          mode={actionTarget.mode}
          onVersionConflict={(message) => {
            setActionTarget(null);
            onVersionConflict(message);
          }}
        />
      )}
    </div>
  );
}

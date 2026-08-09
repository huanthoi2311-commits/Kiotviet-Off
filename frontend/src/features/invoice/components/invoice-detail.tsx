'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { useInvoiceControllerGetById } from '@/generated/invoice/invoice';
import { usePaymentControllerGetByInvoiceId } from '@/generated/payment/payment';
import type { InvoiceResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { NormalizedError } from '@/services/api-client';
import { useBranchOptions } from '../../inventory/use-inventory-relations';

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
  CARD: 'Thẻ',
  E_WALLET: 'Ví điện tử',
};

/**
 * T046 §6/§11 — Invoice Detail. Every item field (`productNameSnapshot`, `unitNameSnapshot`,
 * `productCodeSnapshot`) is already snapshotted on the response — no product/unit relation lookup
 * is needed, unlike Purchase Order/Transfer's id→name lookups (SPEC-T046 §11).
 */
export function InvoiceDetail({ id }: { id: string }) {
  const {
    data: invoice,
    isLoading,
    isError,
    error,
    refetch,
  } = useInvoiceControllerGetById<InvoiceResponseDto, NormalizedError>(id);

  const { branchOptions } = useBranchOptions();
  const branchNameById = useMemo(
    () => new Map(branchOptions.map((o) => [o.value, o.label])),
    [branchOptions],
  );

  const { data: payments } = usePaymentControllerGetByInvoiceId(
    { invoiceId: id },
    { query: { enabled: Boolean(invoice) } },
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (isError && error.kind === 'api-error' && error.code === 'INVOICE_001') {
    return (
      <EmptyState
        icon={Receipt}
        title="Không tìm thấy hóa đơn"
        description="Hóa đơn này có thể không tồn tại."
        action={<Button render={<Link href="/invoices">Quay lại danh sách</Link>} />}
      />
    );
  }

  if (isError || !invoice) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <p className="text-destructive text-sm">
          {error?.message ?? 'Đã xảy ra lỗi không xác định'}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground text-sm">Mã hóa đơn</dt>
          <dd className="font-medium">{invoice.code}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Trạng thái</dt>
          <dd className="font-medium">{invoice.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Chi nhánh</dt>
          <dd className="font-medium">
            {branchNameById.get(invoice.branchId) ?? invoice.branchId}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Khách hàng</dt>
          <dd className="font-medium">
            {asNullableString(invoice.customerNameSnapshot) ?? 'Khách lẻ'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Điện thoại khách hàng</dt>
          <dd className="font-medium">{asNullableString(invoice.customerPhoneSnapshot) ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Ngày tạo</dt>
          <dd className="font-medium">{new Date(invoice.createdAt).toLocaleString('vi-VN')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Tổng tiền</dt>
          <dd className="font-medium">{invoice.totalAmount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Đã thanh toán</dt>
          <dd className="font-medium">{invoice.paidAmount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Còn nợ</dt>
          <dd className="font-medium">{invoice.dueAmount}</dd>
        </div>
      </dl>

      {payments && payments.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium">Thanh toán</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phương thức</TableHead>
                <TableHead>Số tiền</TableHead>
                <TableHead>Thời gian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{PAYMENT_METHOD_LABEL[payment.method] ?? payment.method}</TableCell>
                  <TableCell>{payment.amount}</TableCell>
                  <TableCell>{new Date(payment.paidAt).toLocaleString('vi-VN')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sản phẩm</TableHead>
            <TableHead>Đơn vị</TableHead>
            <TableHead>Số lượng</TableHead>
            <TableHead>Đơn giá</TableHead>
            <TableHead>Giảm giá</TableHead>
            <TableHead>Thuế</TableHead>
            <TableHead>Thành tiền</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoice.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{asNullableString(item.productNameSnapshot) ?? item.productId}</TableCell>
              <TableCell>{asNullableString(item.unitNameSnapshot) ?? '—'}</TableCell>
              <TableCell>{item.quantity}</TableCell>
              <TableCell>{item.unitPrice}</TableCell>
              <TableCell>{item.discount}</TableCell>
              <TableCell>{item.taxAmount}</TableCell>
              <TableCell>{item.totalAmount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

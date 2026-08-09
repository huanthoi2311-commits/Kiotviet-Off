'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Receipt } from 'lucide-react';
import { useInvoiceControllerSearch } from '@/generated/invoice/invoice';
import {
  InvoiceControllerSearchStatus,
  type InvoiceResponseDto,
} from '@/generated/pOSERPEnterpriseAPI.schemas';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { PermissionButton } from '@/components/common/permission-button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isNormalizedError, type NormalizedError } from '@/services/api-client';
import { useCustomerOptions } from '../../checkout/use-checkout-relations';

const PAGE_LIMIT = 20;

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * T046 §6 — Invoice List. Only `PAID` is offered in the status filter — `UNPAID`/`PARTIAL`/
 * `CANCELLED` exist in the backend's enum but are unreachable: Invoice has no creation route other
 * than Checkout, which always hardcodes `status: 'PAID'` (SPEC-T046 §6).
 */
const STATUS_FILTER_OPTIONS: { value: InvoiceControllerSearchStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: InvoiceControllerSearchStatus.PAID, label: 'Đã thanh toán' },
];

export function InvoiceTable() {
  const [status, setStatus] = useState<InvoiceControllerSearchStatus | 'ALL'>('ALL');
  const [customerId, setCustomerId] = useState<string | 'ALL'>('ALL');
  const [page, setPage] = useState(1);

  const { customerOptions } = useCustomerOptions();
  const customerNameById = useMemo(
    () => new Map(customerOptions.map((o) => [o.value, o.label])),
    [customerOptions],
  );

  const columns = useMemo<ColumnDef<InvoiceResponseDto, unknown>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã hóa đơn' },
      {
        id: 'customer',
        header: 'Khách hàng',
        cell: ({ row }) => {
          const customerId = asNullableString(row.original.customerId);
          return (
            asNullableString(row.original.customerNameSnapshot) ??
            (customerId ? (customerNameById.get(customerId) ?? customerId) : 'Khách lẻ')
          );
        },
      },
      { accessorKey: 'status', header: 'Trạng thái' },
      { accessorKey: 'totalAmount', header: 'Tổng tiền' },
      {
        id: 'createdAt',
        header: 'Ngày tạo',
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleString('vi-VN'),
      },
      {
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row }) => (
          <PermissionButton
            permission="invoice:view"
            variant="outline"
            size="sm"
            render={<Link href={`/invoices/${row.original.id}`}>Xem</Link>}
          />
        ),
      },
    ],
    [customerNameById],
  );

  const { data, isLoading, isError, error, refetch } = useInvoiceControllerSearch({
    status: status === 'ALL' ? undefined : status,
    customerId: customerId === 'ALL' ? undefined : customerId,
    page,
    limit: PAGE_LIMIT,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter = status !== 'ALL' || customerId !== 'ALL';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus((value as InvoiceControllerSearchStatus | 'ALL') ?? 'ALL');
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
          value={customerId}
          onValueChange={(value) => {
            setCustomerId(value ?? 'ALL');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56" aria-label="Lọc theo khách hàng">
            <SelectValue placeholder="Khách hàng" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả khách hàng</SelectItem>
            {customerOptions.map((option) => (
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
              description="Không tìm thấy hóa đơn phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={Receipt}
              title="Chưa có hóa đơn nào"
              description="Hóa đơn sẽ hiển thị ở đây sau khi có giao dịch bán hàng."
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

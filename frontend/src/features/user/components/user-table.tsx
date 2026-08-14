'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { UsersRound } from 'lucide-react';
import { useUserControllerSearch } from '@/generated/user/user';
import {
  UserControllerSearchStatus,
  type UserResponseDto,
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
import { useBranchOptions } from '../../inventory/use-inventory-relations';

/** LOCKED exists on `UserControllerSearchStatus` (schema-generated) but is reserved/unreachable —
 * no code path in this system ever sets it (T052.02B §6/§27) — so it is deliberately not offered
 * as a filter option here (D — LOCKED remains untouched/reserved, not a usable state to filter by). */
const STATUS_FILTER_OPTIONS: { value: UserControllerSearchStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: UserControllerSearchStatus.ACTIVE, label: 'Đang hoạt động' },
  { value: UserControllerSearchStatus.INACTIVE, label: 'Ngừng hoạt động' },
];

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
  LOCKED: 'Đã khóa',
};

const PAGE_LIMIT = 20;

/** T052.02C — List. No server-side sort (`UserQueryDto` has no `sortBy`/`sortOrder`, T052.02B §UPDATE). */
export function UserTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserControllerSearchStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const { branchOptions } = useBranchOptions();

  const branchNameById = useMemo(
    () => new Map(branchOptions.map((option) => [option.value, option.label])),
    [branchOptions],
  );

  const columns = useMemo<ColumnDef<UserResponseDto, unknown>[]>(
    () => [
      { accessorKey: 'username', header: 'Tên đăng nhập' },
      {
        id: 'fullName',
        header: 'Họ tên',
        cell: ({ row }) =>
          typeof row.original.fullName === 'string' ? row.original.fullName : '—',
      },
      { accessorKey: 'email', header: 'Email' },
      {
        id: 'branch',
        header: 'Chi nhánh',
        cell: ({ row }) => {
          const branchId = row.original.branchId;
          if (typeof branchId !== 'string') return '—';
          return branchNameById.get(branchId) ?? '—';
        },
      },
      {
        id: 'status',
        header: 'Trạng thái',
        cell: ({ row }) => STATUS_LABELS[row.original.status] ?? row.original.status,
      },
      {
        id: 'lastLoginAt',
        header: 'Đăng nhập gần nhất',
        cell: ({ row }) => {
          const lastLoginAt = row.original.lastLoginAt;
          return typeof lastLoginAt === 'string'
            ? new Date(lastLoginAt).toLocaleString('vi-VN')
            : 'Chưa đăng nhập';
        },
      },
      {
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row }) => (
          <PermissionButton
            permission="user:view"
            variant="outline"
            size="sm"
            render={<Link href={`/users/${row.original.id}`}>Xem</Link>}
          />
        ),
      },
    ],
    [branchNameById],
  );

  const { data, isLoading, isError, error, refetch } = useUserControllerSearch({
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    page,
    limit: PAGE_LIMIT,
  });

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const hasActiveFilter = search.trim().length > 0 || status !== 'ALL';

  return (
    <div className="flex flex-col gap-4">
      <SearchToolbar
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Tìm theo tên đăng nhập, họ tên hoặc email..."
        filters={
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus((value as UserControllerSearchStatus | 'ALL') ?? 'ALL');
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
              description="Không tìm thấy nhân viên phù hợp với bộ lọc hiện tại."
            />
          ) : (
            <EmptyState
              icon={UsersRound}
              title="Chưa có nhân viên nào"
              description="Nhân viên sẽ hiển thị ở đây sau khi được tạo."
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

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ShieldCheck } from 'lucide-react';
import { useRolesControllerList } from '@/generated/rbac/rbac';
import type { RoleResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/common/empty-state';
import { SearchToolbar } from '@/components/common/search-toolbar';
import { isNormalizedError, type NormalizedError } from '@/services/api-client';

/** Orval renders nullable-string fields on `RoleResponseDto` as `{ [key: string]: unknown } | null`
 * (same known codegen quirk as `user-edit-form.tsx`'s own local helper). */
function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * T052.03C §3 — Role List. `GET /roles` is unpaginated and already org-scoped (no query params at
 * all — confirmed via the generated `useRolesControllerList()` signature), so search is
 * client-side rather than server-driven like Brand/Category/Unit. No permission-count column
 * (`RoleResponseDto` doesn't include `permissionCodes` — only `GET /roles/:id` does; adding a count
 * here would mean N+1 fetches, explicitly disallowed). No user-count column (no backend aggregate
 * exists). No delete/rename action — those endpoints don't exist.
 */
export function RoleTable() {
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch } = useRolesControllerList<
    RoleResponseDto[],
    NormalizedError
  >();

  const normalizedError: NormalizedError | null = isError
    ? isNormalizedError(error)
      ? error
      : { kind: 'network-error', message: 'Đã xảy ra lỗi không xác định' }
    : null;

  const filtered = useMemo(() => {
    const roles = data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return roles;
    return roles.filter(
      (role) => role.name.toLowerCase().includes(term) || role.code.toLowerCase().includes(term),
    );
  }, [data, search]);

  const columns = useMemo<ColumnDef<RoleResponseDto, unknown>[]>(
    () => [
      { accessorKey: 'name', header: 'Tên vai trò' },
      { accessorKey: 'code', header: 'Mã' },
      {
        id: 'isSystem',
        header: 'Loại',
        cell: ({ row }) =>
          row.original.isSystem ? (
            <span className="bg-muted inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium">
              Hệ thống
            </span>
          ) : (
            '—'
          ),
      },
      {
        id: 'description',
        header: 'Mô tả',
        cell: ({ row }) => asNullableString(row.original.description) ?? '—',
      },
      {
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/roles/${row.original.id}`}>Xem</Link>}
          />
        ),
      },
    ],
    [],
  );

  const hasActiveFilter = search.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <SearchToolbar
        value={search}
        onChange={setSearch}
        placeholder="Tìm theo tên hoặc mã vai trò..."
      />
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        error={normalizedError}
        onRetry={() => refetch()}
        emptyState={
          hasActiveFilter ? (
            <EmptyState
              title="Không có kết quả"
              description="Không tìm thấy vai trò phù hợp với từ khóa tìm kiếm."
            />
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="Chưa có vai trò nào"
              description="Vai trò sẽ hiển thị ở đây sau khi được tạo."
            />
          )
        }
        pagination={{
          page: 1,
          limit: Math.max(filtered.length, 1),
          total: filtered.length,
          onPageChange: () => {},
        }}
      />
    </div>
  );
}

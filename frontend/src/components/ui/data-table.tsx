'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type SortingState,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
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

export interface DataTablePaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<TRow> {
  columns: ColumnDef<TRow, unknown>[];
  data: TRow[];
  isLoading: boolean;
  error?: NormalizedError | null;
  onRetry?: () => void;
  emptyState: React.ReactNode;
  pagination: DataTablePaginationProps;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
}

/**
 * T034.01 §5/§11 — uses @tanstack/react-table for column/sort/pagination
 * STATE only (`getCoreRowModel`, no client-side pagination/sorting model —
 * both stay server-driven per T033.02's contract). Rendering is plain
 * shadcn `table.tsx` markup, not delegated to the library, so this stays a
 * small composable primitive rather than a wrapped framework.
 */
export function DataTable<TRow>({
  columns,
  data,
  isLoading,
  error,
  onRetry,
  emptyState,
  pagination,
  sorting,
  onSortingChange,
}: DataTableProps<TRow>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    onSortingChange,
    state: sorting ? { sorting } : undefined,
  });

  const columnCount = columns.length;
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {Array.from({ length: columnCount }).map((__, colIndex) => (
                    <TableCell key={`skeleton-cell-${colIndex}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="py-8 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-destructive text-sm">
                      {error.kind === 'network-error'
                        ? error.message
                        : 'message' in error
                          ? error.message
                          : 'Đã xảy ra lỗi'}
                    </p>
                    {onRetry ? (
                      <Button variant="outline" size="sm" onClick={onRetry}>
                        Thử lại
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="p-0">
                  {emptyState}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {!isLoading && !error && data.length > 0 ? (
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted-foreground">
            Trang {pagination.page} / {totalPages} — {pagination.total} bản ghi
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

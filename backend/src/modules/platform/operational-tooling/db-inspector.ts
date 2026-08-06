import type { PrismaClient } from '@prisma/client';

/**
 * SPEC-T023 Finding 9 (FR9.2) — CHỈ ĐỌC, dùng `Pick<PrismaClient, '$queryRaw'>` (enforce ở
 * compile-time không thể ghi). `pg_database_size` là hàm PostgreSQL chuẩn — không phát minh cách
 * tính mới. `pg_stat_user_tables.n_live_tup` là số dòng ước tính nhanh (thống kê nội bộ Postgres,
 * cập nhật qua autovacuum/analyze) — KHÔNG chạy `COUNT(*)` thật trên từng bảng (sẽ chậm với bảng
 * lớn) — đủ chính xác cho mục đích kiểm tra vận hành thông thường.
 */
type DbInspectablePrisma = Pick<PrismaClient, '$queryRaw'>;

export interface DatabaseSizeReport {
  databaseSizeBytes: number;
  databaseSizePretty: string;
}

export async function getDatabaseSize(
  prisma: DbInspectablePrisma,
): Promise<DatabaseSizeReport> {
  const rows = await prisma.$queryRaw<
    Array<{ size_bytes: bigint; size_pretty: string }>
  >`SELECT pg_database_size(current_database()) AS size_bytes, pg_size_pretty(pg_database_size(current_database())) AS size_pretty`;
  return {
    databaseSizeBytes: Number(rows[0].size_bytes),
    databaseSizePretty: rows[0].size_pretty,
  };
}

export interface TableRowCount {
  tableName: string;
  rowCount: number;
}

export async function getTableRowCounts(
  prisma: DbInspectablePrisma,
): Promise<TableRowCount[]> {
  const rows = await prisma.$queryRaw<
    Array<{ table_name: string; row_count: bigint }>
  >`SELECT relname AS table_name, n_live_tup AS row_count FROM pg_stat_user_tables ORDER BY n_live_tup DESC`;
  return rows.map((row) => ({
    tableName: row.table_name,
    rowCount: Number(row.row_count),
  }));
}

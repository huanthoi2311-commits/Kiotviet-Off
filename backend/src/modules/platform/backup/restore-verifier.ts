import { PrismaClient } from '@prisma/client';
import { buildDatabaseUrl, PgConnection } from './pg-connection-url';

/**
 * T051.03 §11 — danh sách bảng nghiệp vụ trọng yếu để xác nhận restore thành công, dùng ĐÚNG
 * tên bảng thật trong Postgres (theo `@@map(...)` của schema.prisma, không phải tên PascalCase
 * của Prisma model — vd `Inventory` map thành `inventories`, không phải `inventory`).
 */
export const DEFAULT_CRITICAL_TABLES = [
  'organizations',
  'users',
  'products',
  'inventories',
  'purchase_orders',
  'invoices',
] as const;

export interface TableCheckResult {
  table: string;
  exists: boolean;
  rowCount: number | null;
}

export interface RowCountComparison {
  table: string;
  sourceCount: number;
  restoredCount: number;
  matches: boolean;
}

export interface RestoreVerificationResult {
  connected: boolean;
  migrationsTableExists: boolean;
  migrationsCount: number | null;
  tables: TableCheckResult[];
  allCriticalTablesPresent: boolean;
  rowCountComparison: RowCountComparison[] | null;
}

export interface VerifyRestoreOptions {
  /** Connection trỏ THẲNG vào database vừa restore (database field = tên DB đích). */
  connection: PgConnection;
  criticalTables?: readonly string[];
  /** Nếu có: so sánh row-count giữa DB nguồn và DB vừa restore cho cùng tập bảng. */
  sourceConnection?: PgConnection;
  createClient?: (databaseUrl: string) => PrismaClient;
}

export class RestoreVerificationConnectionError extends Error {
  constructor(
    readonly database: string,
    cause: unknown,
  ) {
    super(
      `Không kết nối được tới database "${database}" để verify restore: ${(cause as Error)?.message ?? cause}`,
    );
    this.name = 'RestoreVerificationConnectionError';
  }
}

/**
 * T051.03 §11 — verify tối thiểu: kết nối được, `_prisma_migrations` tồn tại + đọc được, các
 * bảng nghiệp vụ trọng yếu tồn tại, và (nếu có DB nguồn để so sánh) row-count khớp cho tập bảng
 * đó. KHÔNG hardcode số dòng kỳ vọng — chỉ so sánh nguồn-vs-đích khi caller cung cấp cả hai.
 */
export async function verifyRestore(
  options: VerifyRestoreOptions,
): Promise<RestoreVerificationResult> {
  const {
    connection,
    criticalTables = DEFAULT_CRITICAL_TABLES,
    sourceConnection,
    createClient = (url: string) =>
      new PrismaClient({ datasources: { db: { url } } }),
  } = options;

  const client = createClient(buildDatabaseUrl(connection));
  try {
    try {
      await client.$queryRawUnsafe('SELECT 1');
    } catch (error) {
      throw new RestoreVerificationConnectionError(connection.database, error);
    }

    const migrationsTableExists = await tableExists(
      client,
      '_prisma_migrations',
    );
    const migrationsCount = migrationsTableExists
      ? await countRows(client, '_prisma_migrations')
      : null;

    const tables: TableCheckResult[] = [];
    for (const table of criticalTables) {
      const exists = await tableExists(client, table);
      const rowCount = exists ? await countRows(client, table) : null;
      tables.push({ table, exists, rowCount });
    }

    const allCriticalTablesPresent = tables.every((t) => t.exists);

    let rowCountComparison: RowCountComparison[] | null = null;
    if (sourceConnection) {
      const sourceClient = createClient(buildDatabaseUrl(sourceConnection));
      try {
        rowCountComparison = [];
        for (const table of criticalTables) {
          const sourceCount = (await tableExists(sourceClient, table))
            ? await countRows(sourceClient, table)
            : 0;
          const restoredEntry = tables.find((t) => t.table === table);
          const restoredCount = restoredEntry?.rowCount ?? 0;
          rowCountComparison.push({
            table,
            sourceCount,
            restoredCount,
            matches: sourceCount === restoredCount,
          });
        }
      } finally {
        await sourceClient.$disconnect();
      }
    }

    return {
      connected: true,
      migrationsTableExists,
      migrationsCount,
      tables,
      allCriticalTablesPresent,
      rowCountComparison,
    };
  } finally {
    await client.$disconnect();
  }
}

async function tableExists(
  client: PrismaClient,
  table: string,
): Promise<boolean> {
  const rows = await client.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    table,
  );
  return rows[0]?.exists ?? false;
}

async function countRows(client: PrismaClient, table: string): Promise<number> {
  const safeIdentifier = table.replace(/"/g, '""');
  const rows = await client.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "${safeIdentifier}"`,
  );
  return Number(rows[0]?.count ?? 0);
}

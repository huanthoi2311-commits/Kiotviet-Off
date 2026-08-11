import {
  RestoreVerificationConnectionError,
  verifyRestore,
} from './restore-verifier';
import type { PgConnection } from './pg-connection-url';

const connection: PgConnection = {
  host: 'localhost',
  port: 5432,
  database: 'pos_erp_restore_test',
  user: 'postgres',
  password: 'secret',
};

interface FakeDb {
  existingTables: Set<string>;
  rowCounts: Record<string, number>;
  connectable?: boolean;
}

function makeFakeClient(db: FakeDb) {
  return {
    $queryRawUnsafe: jest.fn((sql: string, ...args: unknown[]) => {
      if (db.connectable === false) {
        return Promise.reject(new Error('connection refused'));
      }
      if (sql === 'SELECT 1') {
        return Promise.resolve([{ '?column?': 1 }]);
      }
      if (sql.includes('information_schema.tables')) {
        const table = args[0] as string;
        return Promise.resolve([{ exists: db.existingTables.has(table) }]);
      }
      if (sql.startsWith('SELECT COUNT(*)')) {
        const match = /FROM "([^"]+)"/.exec(sql);
        const table = match?.[1] ?? '';
        return Promise.resolve([{ count: BigInt(db.rowCounts[table] ?? 0) }]);
      }
      return Promise.reject(
        new Error(`Unexpected query in test double: ${sql}`),
      );
    }),
    $disconnect: jest.fn(() => Promise.resolve(undefined)),
  };
}

describe('verifyRestore', () => {
  it('ném RestoreVerificationConnectionError nếu không kết nối được', async () => {
    const client = makeFakeClient({
      connectable: false,
      existingTables: new Set(),
      rowCounts: {},
    });

    await expect(
      verifyRestore({ connection, createClient: () => client as never }),
    ).rejects.toThrow(RestoreVerificationConnectionError);
  });

  it('luồng thành công: _prisma_migrations + tất cả bảng trọng yếu tồn tại, đếm đúng số dòng', async () => {
    const client = makeFakeClient({
      existingTables: new Set([
        '_prisma_migrations',
        'organizations',
        'users',
        'products',
        'inventories',
        'purchase_orders',
        'invoices',
      ]),
      rowCounts: {
        _prisma_migrations: 42,
        organizations: 1,
        users: 5,
        products: 100,
        inventories: 250,
        purchase_orders: 10,
        invoices: 20,
      },
    });

    const result = await verifyRestore({
      connection,
      createClient: () => client as never,
    });

    expect(result.connected).toBe(true);
    expect(result.migrationsTableExists).toBe(true);
    expect(result.migrationsCount).toBe(42);
    expect(result.allCriticalTablesPresent).toBe(true);
    expect(result.tables).toEqual([
      { table: 'organizations', exists: true, rowCount: 1 },
      { table: 'users', exists: true, rowCount: 5 },
      { table: 'products', exists: true, rowCount: 100 },
      { table: 'inventories', exists: true, rowCount: 250 },
      { table: 'purchase_orders', exists: true, rowCount: 10 },
      { table: 'invoices', exists: true, rowCount: 20 },
    ]);
    expect(result.rowCountComparison).toBeNull();
    expect(client.$disconnect).toHaveBeenCalled();
  });

  it('allCriticalTablesPresent=false nếu thiếu 1 bảng trọng yếu, rowCount null cho bảng đó', async () => {
    const client = makeFakeClient({
      existingTables: new Set([
        'organizations',
        'users',
        'products',
        'purchase_orders',
        'invoices',
      ]),
      rowCounts: {
        organizations: 1,
        users: 5,
        products: 100,
        purchase_orders: 10,
        invoices: 20,
      },
    });

    const result = await verifyRestore({
      connection,
      createClient: () => client as never,
    });

    expect(result.allCriticalTablesPresent).toBe(false);
    const inventoriesCheck = result.tables.find(
      (t) => t.table === 'inventories',
    );
    expect(inventoriesCheck).toEqual({
      table: 'inventories',
      exists: false,
      rowCount: null,
    });
  });

  it('migrationsTableExists=false và migrationsCount=null nếu bảng _prisma_migrations không có (không throw)', async () => {
    const client = makeFakeClient({ existingTables: new Set(), rowCounts: {} });

    const result = await verifyRestore({
      connection,
      createClient: () => client as never,
    });

    expect(result.migrationsTableExists).toBe(false);
    expect(result.migrationsCount).toBeNull();
  });

  it('so sánh row-count nguồn-vs-đích khi có sourceConnection', async () => {
    const restoredClient = makeFakeClient({
      existingTables: new Set([
        'organizations',
        'users',
        'products',
        'inventories',
        'purchase_orders',
        'invoices',
      ]),
      rowCounts: {
        organizations: 1,
        users: 5,
        products: 100,
        inventories: 250,
        purchase_orders: 10,
        invoices: 20,
      },
    });
    const sourceClient = makeFakeClient({
      existingTables: new Set([
        'organizations',
        'users',
        'products',
        'inventories',
        'purchase_orders',
        'invoices',
      ]),
      rowCounts: {
        organizations: 1,
        users: 5,
        products: 100,
        inventories: 250,
        purchase_orders: 10,
        invoices: 19,
      },
    });
    const clients = [restoredClient, sourceClient];
    let call = 0;

    const result = await verifyRestore({
      connection,
      sourceConnection: { ...connection, database: 'pos_erp' },
      createClient: () => clients[call++] as never,
    });

    expect(result.rowCountComparison).toEqual([
      {
        table: 'organizations',
        sourceCount: 1,
        restoredCount: 1,
        matches: true,
      },
      { table: 'users', sourceCount: 5, restoredCount: 5, matches: true },
      {
        table: 'products',
        sourceCount: 100,
        restoredCount: 100,
        matches: true,
      },
      {
        table: 'inventories',
        sourceCount: 250,
        restoredCount: 250,
        matches: true,
      },
      {
        table: 'purchase_orders',
        sourceCount: 10,
        restoredCount: 10,
        matches: true,
      },
      { table: 'invoices', sourceCount: 19, restoredCount: 20, matches: false },
    ]);
  });

  it('cho phép truyền criticalTables tuỳ chỉnh, không hardcode danh sách mặc định', async () => {
    const client = makeFakeClient({
      existingTables: new Set(['custom_table']),
      rowCounts: { custom_table: 3 },
    });

    const result = await verifyRestore({
      connection,
      criticalTables: ['custom_table'],
      createClient: () => client as never,
    });

    expect(result.tables).toEqual([
      { table: 'custom_table', exists: true, rowCount: 3 },
    ]);
  });
});

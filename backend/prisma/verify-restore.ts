import { parseDatabaseUrl } from '../src/modules/platform/backup/pg-connection-url';
import { verifyRestore } from '../src/modules/platform/backup/restore-verifier';

/**
 * T051.03 §11 — CLI verify database vừa restore. Gọi qua:
 *   npm run ops:verify-restore -- <tên-database-đích> [--compare-source]
 *
 * `--compare-source` (tuỳ chọn): so sánh row-count giữa database GỐC (lấy từ DATABASE_URL) và
 * database vừa restore cho tập bảng trọng yếu — chỉ dùng được khi cả hai database còn tồn tại
 * trên cùng server.
 *
 * Exit code 0 chỉ khi: kết nối được, `_prisma_migrations` tồn tại, VÀ tất cả bảng trọng yếu tồn
 * tại. Không tự động coi row-count lệch là lỗi cứng (in cảnh báo, không fail) — vì restore có
 * thể hợp lệ với dữ liệu khác thời điểm nguồn (backup không phải chụp đồng thời).
 */
async function main(): Promise<void> {
  const [targetDatabase, ...rest] = process.argv.slice(2);
  const compareSource = rest.includes('--compare-source');

  if (!targetDatabase) {
    console.error(
      'Cách dùng: npm run ops:verify-restore -- <tên-database-đích> [--compare-source]',
    );
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('✗ DATABASE_URL chưa được set.');
    process.exitCode = 1;
    return;
  }

  let sourceConnection: ReturnType<typeof parseDatabaseUrl>;
  try {
    sourceConnection = parseDatabaseUrl(databaseUrl);
  } catch (error) {
    console.error(`✗ ${(error as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const targetConnection = { ...sourceConnection, database: targetDatabase };

  console.log(`Verify database "${targetDatabase}"...`);

  try {
    const result = await verifyRestore({
      connection: targetConnection,
      sourceConnection: compareSource ? sourceConnection : undefined,
    });

    console.log(`  Kết nối: ${result.connected ? 'OK' : 'THẤT BẠI'}`);
    console.log(
      `  _prisma_migrations: ${result.migrationsTableExists ? `OK (${result.migrationsCount} dòng)` : 'KHÔNG TỒN TẠI'}`,
    );
    console.log('  Bảng trọng yếu:');
    for (const table of result.tables) {
      const status = table.exists
        ? `OK (${table.rowCount} dòng)`
        : 'KHÔNG TỒN TẠI';
      console.log(`    - ${table.table}: ${status}`);
    }

    if (result.rowCountComparison) {
      console.log('  So sánh row-count nguồn ↔ restore:');
      for (const comparison of result.rowCountComparison) {
        const status = comparison.matches ? 'KHỚP' : 'LỆCH';
        console.log(
          `    - ${comparison.table}: nguồn=${comparison.sourceCount}, restore=${comparison.restoredCount} (${status})`,
        );
      }
    }

    const passed =
      result.migrationsTableExists && result.allCriticalTablesPresent;
    if (passed) {
      console.log('✓ Verify PASS — restore hợp lệ.');
    } else {
      console.error(
        '✗ Verify FAIL — thiếu _prisma_migrations hoặc bảng trọng yếu.',
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`✗ Verify thất bại: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

main();

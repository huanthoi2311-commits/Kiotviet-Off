import { PrismaClient } from '@prisma/client';
import {
  getDatabaseSize,
  getTableRowCounts,
} from '../src/modules/platform/operational-tooling/db-inspector';

/**
 * SPEC-T023 Finding 9 (FR9.2) — script CLI mỏng, chỉ đọc, cùng pattern các script `prisma/*.ts`
 * trước đó.
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    const size = await getDatabaseSize(prisma);
    console.log(
      `Dung lượng database: ${size.databaseSizePretty} (${size.databaseSizeBytes} bytes)`,
    );

    const rowCounts = await getTableRowCounts(prisma);
    console.log('\nSố dòng ước tính theo bảng (n_live_tup, sắp giảm dần):');
    for (const table of rowCounts) {
      console.log(`  ${table.tableName}: ${table.rowCount}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { PrismaClient } from '@prisma/client';
import {
  runTenantForeignIdIntegrityAudit,
  totalMismatchCount,
} from '../src/modules/platform/operational-tooling/tenant-foreign-id-integrity-auditor';

/**
 * T053.05C-1/T053.05C-2 — script CLI mỏng, chỉ đọc, cùng pattern các script `prisma/*.ts` khác
 * (`inspect-db.ts`, `inspect-jobs.ts`). KHÔNG UPDATE, KHÔNG DELETE, KHÔNG tự sửa — chỉ báo cáo.
 * Exit non-zero khi phát hiện bất kỳ dòng tenant-inconsistent nào (cùng convention `verify-restore.ts`
 * — công cụ xác minh bất biến hệ thống, không phải công cụ tường thuật đơn thuần).
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    const report = await runTenantForeignIdIntegrityAudit(prisma);
    const total = totalMismatchCount(report);

    console.log(
      '=== T053.05C-1/T053.05C-2 Tenant Foreign-ID Integrity Audit (chỉ đọc) ===\n',
    );

    console.log(
      `SalesReturnItem ↔ Warehouse mismatch: ${report.salesReturnItemWarehouseMismatches.length}`,
    );
    for (const row of report.salesReturnItemWarehouseMismatches) {
      console.log(`  - ${JSON.stringify(row)}`);
    }

    console.log(
      `\nSupplierProduct (Supplier ↔ Product) mismatch: ${report.supplierProductMismatches.length}`,
    );
    for (const row of report.supplierProductMismatches) {
      console.log(`  - ${JSON.stringify(row)}`);
    }

    console.log(
      `\nInventory ↔ Warehouse mismatch: ${report.inventoryWarehouseMismatches.length}`,
    );
    for (const row of report.inventoryWarehouseMismatches) {
      console.log(`  - ${JSON.stringify(row)}`);
    }

    console.log(
      `\nInventoryMovement ↔ Warehouse mismatch: ${report.inventoryMovementWarehouseMismatches.length}`,
    );
    for (const row of report.inventoryMovementWarehouseMismatches) {
      console.log(`  - ${JSON.stringify(row)}`);
    }

    console.log(
      `\nBranch.managerUserId ↔ User mismatch: ${report.branchManagerUserMismatches.length}`,
    );
    for (const row of report.branchManagerUserMismatches) {
      console.log(`  - ${JSON.stringify(row)}`);
    }

    console.log(
      `\nBranch.defaultWarehouseId ↔ Warehouse mismatch: ${report.branchDefaultWarehouseMismatches.length}`,
    );
    for (const row of report.branchDefaultWarehouseMismatches) {
      console.log(`  - ${JSON.stringify(row)}`);
    }

    console.log(
      `\nProduct.categoryId ↔ Category mismatch: ${report.productCategoryMismatches.length}`,
    );
    for (const row of report.productCategoryMismatches) {
      console.log(`  - ${JSON.stringify(row)}`);
    }

    console.log(
      `\nProduct.brandId ↔ Brand mismatch: ${report.productBrandMismatches.length}`,
    );
    for (const row of report.productBrandMismatches) {
      console.log(`  - ${JSON.stringify(row)}`);
    }

    console.log(
      `\nProduct.unitId ↔ Unit mismatch: ${report.productUnitMismatches.length}`,
    );
    for (const row of report.productUnitMismatches) {
      console.log(`  - ${JSON.stringify(row)}`);
    }

    console.log(`\n=== Tổng số dòng tenant-inconsistent: ${total} ===`);

    if (total > 0) {
      console.error(
        '\nPhát hiện dữ liệu tenant-inconsistent — cần Architect review trước khi quyết định bước tiếp theo (script này KHÔNG tự sửa).',
      );
      process.exitCode = 1;
    } else {
      console.log(
        '\nKhông phát hiện dữ liệu tenant-inconsistent nào trong phạm vi T053.05C-1/T053.05C-2.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

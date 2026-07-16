import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { InventoryModule } from './inventory.module';
import { InventoryDomainService } from './application/inventory-domain.service';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';
import { PurchaseReturnModule } from '../purchase-return/purchase-return.module';
import { TransferModule } from '../transfer/transfer.module';
import { InventoryAdjustmentModule } from '../inventory-adjustment/inventory-adjustment.module';
import { StockCountModule } from '../stock-count/stock-count.module';
import { CheckoutModule } from '../checkout/checkout.module';

/**
 * T004.5 (SPEC-INV-001) — Architecture Verification tự động, không chỉ dựa vào grep thủ công
 * một lần. Test này quét TOÀN BỘ `backend/src/modules` (trừ chính `inventory` module) và thất
 * bại vĩnh viễn trong CI nếu có module nào trong tương lai vi phạm 2 bất biến "Single Writer":
 *
 *  1. Không module nào ngoài `inventory` được import `INVENTORY_REPOSITORY`/`IInventoryRepository`
 *     (Decision 11, SPEC-INV-001) — chỉ được gọi qua `InventoryDomainService`.
 *  2. Không module nào ngoài `inventory` được gọi các phương thức ghi
 *     (`upsert`/`update`/`updateMany`/`create`/`createMany`) trên `prisma.inventory`/
 *     `tx.inventory`/`prisma.inventoryMovement`/`tx.inventoryMovement` (Decision 13 acceptance).
 *
 * Không dùng `test/` (e2e) vì các file *.e2e-spec.ts cố ý gọi thẳng `INVENTORY_REPOSITORY` qua
 * `app.get()` để seed dữ liệu test (không đi qua constructor injection của 1 module nghiệp vụ)
 * — đây là quy ước test riêng, không phải "module nghiệp vụ ghi chéo", nên không thuộc phạm vi
 * kiểm tra của bất biến kiến trúc này.
 */
describe('Architecture: Inventory Single Writer (SPEC-INV-001, T004.5)', () => {
  const modulesRoot = join(__dirname, '..');
  const inventoryModuleDir = join(modulesRoot, 'inventory');

  function collectTsFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        collectTsFiles(fullPath, out);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
        out.push(fullPath);
      }
    }
    return out;
  }

  function filesOutsideInventoryModule(): string[] {
    return collectTsFiles(modulesRoot).filter(
      (file) => !file.startsWith(inventoryModuleDir),
    );
  }

  it('modulesRoot tồn tại và quét được > 0 file .ts (bảo vệ test khỏi false-negative do đường dẫn sai)', () => {
    expect(existsSync(inventoryModuleDir)).toBe(true);
    expect(filesOutsideInventoryModule().length).toBeGreaterThan(50);
  });

  it('không module nào ngoài inventory import INVENTORY_REPOSITORY hoặc IInventoryRepository', () => {
    const violations: string[] = [];
    for (const file of filesOutsideInventoryModule()) {
      const content = readFileSync(file, 'utf-8');
      if (
        content.includes('INVENTORY_REPOSITORY') ||
        content.includes('IInventoryRepository')
      ) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('không module nào ngoài inventory gọi phương thức ghi trên prisma.inventory/tx.inventory/inventoryMovement', () => {
    const writePattern =
      /\.(inventory|inventoryMovement)\.(upsert|update|updateMany|create|createMany)\s*\(/;
    const violations: string[] = [];
    for (const file of filesOutsideInventoryModule()) {
      const content = readFileSync(file, 'utf-8');
      if (writePattern.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('InventoryModule chỉ export InventoryDomainService, không export INVENTORY_REPOSITORY', () => {
    const exportsMeta: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, InventoryModule) ?? [];

    expect(exportsMeta).toContain(InventoryDomainService);
    expect(exportsMeta).toHaveLength(1);
  });

  it.each([
    ['purchase-order.module', PurchaseOrderModule],
    ['purchase-return.module', PurchaseReturnModule],
    ['transfer.module', TransferModule],
    ['inventory-adjustment.module', InventoryAdjustmentModule],
    ['stock-count.module', StockCountModule],
    ['checkout.module', CheckoutModule],
  ])(
    '%s import InventoryModule (được phép gọi InventoryDomainService)',
    (_name, ModuleClass) => {
      const importsMeta: unknown[] =
        Reflect.getMetadata(MODULE_METADATA.IMPORTS, ModuleClass) ?? [];

      expect(importsMeta).toContain(InventoryModule);
    },
  );
});

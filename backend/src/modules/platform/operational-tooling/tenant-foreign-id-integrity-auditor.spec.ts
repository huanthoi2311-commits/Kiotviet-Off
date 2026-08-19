import type { PrismaClient } from '@prisma/client';
import {
  findInventoryMovementWarehouseMismatches,
  findInventoryWarehouseMismatches,
  findSalesReturnItemWarehouseMismatches,
  findSupplierProductMismatches,
  runTenantForeignIdIntegrityAudit,
  totalMismatchCount,
} from './tenant-foreign-id-integrity-auditor';

describe('tenant-foreign-id-integrity-auditor — T053.05C-1 (chỉ đọc)', () => {
  function mockPrisma(rows: unknown) {
    return {
      $queryRaw: jest.fn().mockResolvedValue(rows),
    } as unknown as Pick<PrismaClient, '$queryRaw'>;
  }

  describe('findSalesReturnItemWarehouseMismatches', () => {
    it('map đúng field snake_case -> camelCase, mảng rỗng khi không có mismatch', async () => {
      const prisma = mockPrisma([]);
      await expect(
        findSalesReturnItemWarehouseMismatches(prisma),
      ).resolves.toEqual([]);
    });

    it('trả về mismatch khi có', async () => {
      const prisma = mockPrisma([
        {
          sales_return_item_id: 'sri-1',
          sales_return_id: 'sr-1',
          sales_return_organization_id: 'org-a',
          warehouse_id: 'wh-1',
          warehouse_organization_id: 'org-b',
        },
      ]);
      await expect(
        findSalesReturnItemWarehouseMismatches(prisma),
      ).resolves.toEqual([
        {
          salesReturnItemId: 'sri-1',
          salesReturnId: 'sr-1',
          salesReturnOrganizationId: 'org-a',
          warehouseId: 'wh-1',
          warehouseOrganizationId: 'org-b',
        },
      ]);
    });
  });

  describe('findSupplierProductMismatches', () => {
    it('trả về mismatch khi có', async () => {
      const prisma = mockPrisma([
        {
          supplier_product_id: 'sp-1',
          supplier_id: 'sup-1',
          supplier_organization_id: 'org-a',
          product_id: 'product-1',
          product_organization_id: 'org-b',
        },
      ]);
      await expect(findSupplierProductMismatches(prisma)).resolves.toEqual([
        {
          supplierProductId: 'sp-1',
          supplierId: 'sup-1',
          supplierOrganizationId: 'org-a',
          productId: 'product-1',
          productOrganizationId: 'org-b',
        },
      ]);
    });
  });

  describe('findInventoryWarehouseMismatches', () => {
    it('trả về mismatch khi có', async () => {
      const prisma = mockPrisma([
        {
          inventory_id: 'inv-1',
          inventory_organization_id: 'org-a',
          warehouse_id: 'wh-1',
          warehouse_organization_id: 'org-b',
        },
      ]);
      await expect(findInventoryWarehouseMismatches(prisma)).resolves.toEqual([
        {
          inventoryId: 'inv-1',
          inventoryOrganizationId: 'org-a',
          warehouseId: 'wh-1',
          warehouseOrganizationId: 'org-b',
        },
      ]);
    });
  });

  describe('findInventoryMovementWarehouseMismatches', () => {
    it('trả về mismatch khi có', async () => {
      const prisma = mockPrisma([
        {
          inventory_movement_id: 'mv-1',
          movement_organization_id: 'org-a',
          warehouse_id: 'wh-1',
          warehouse_organization_id: 'org-b',
        },
      ]);
      await expect(
        findInventoryMovementWarehouseMismatches(prisma),
      ).resolves.toEqual([
        {
          inventoryMovementId: 'mv-1',
          movementOrganizationId: 'org-a',
          warehouseId: 'wh-1',
          warehouseOrganizationId: 'org-b',
        },
      ]);
    });
  });

  describe('runTenantForeignIdIntegrityAudit / totalMismatchCount', () => {
    it('gộp cả 4 báo cáo, tổng đúng bằng tổng độ dài từng mảng', async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([
          {
            sales_return_item_id: 'sri-1',
            sales_return_id: 'sr-1',
            sales_return_organization_id: 'org-a',
            warehouse_id: 'wh-1',
            warehouse_organization_id: 'org-b',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            inventory_id: 'inv-1',
            inventory_organization_id: 'org-a',
            warehouse_id: 'wh-1',
            warehouse_organization_id: 'org-b',
          },
        ])
        .mockResolvedValueOnce([]);
      const prisma = { $queryRaw: queryRaw } as unknown as Pick<
        PrismaClient,
        '$queryRaw'
      >;

      const report = await runTenantForeignIdIntegrityAudit(prisma);

      expect(report.salesReturnItemWarehouseMismatches).toHaveLength(1);
      expect(report.supplierProductMismatches).toHaveLength(0);
      expect(report.inventoryWarehouseMismatches).toHaveLength(1);
      expect(report.inventoryMovementWarehouseMismatches).toHaveLength(0);
      expect(totalMismatchCount(report)).toBe(2);
    });

    it('không có mismatch nào -> tổng = 0', async () => {
      const prisma = mockPrisma([]);
      const report = await runTenantForeignIdIntegrityAudit(prisma);
      expect(totalMismatchCount(report)).toBe(0);
    });
  });

  describe('[read-only guarantee] cùng bất biến db-inspector.ts (Architect Decision T032.01E)', () => {
    it('mỗi hàm chỉ gọi $queryRaw — không phương thức ghi/xóa nào khác được truy cập', async () => {
      const queryRaw = jest.fn().mockResolvedValue([]);
      const prisma = { $queryRaw: queryRaw } as unknown as Pick<
        PrismaClient,
        '$queryRaw'
      >;

      await runTenantForeignIdIntegrityAudit(prisma);

      expect(queryRaw).toHaveBeenCalledTimes(4);
      expect(Object.keys(prisma)).toEqual(['$queryRaw']);
    });
  });
});

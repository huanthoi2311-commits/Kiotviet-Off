import type { PrismaClient } from '@prisma/client';
import {
  findInventoryMovementWarehouseMismatches,
  findInventoryWarehouseMismatches,
  findSalesReturnItemWarehouseMismatches,
  findSupplierProductMismatches,
  findBranchManagerUserMismatches,
  findBranchDefaultWarehouseMismatches,
  findProductCategoryMismatches,
  findProductBrandMismatches,
  findProductUnitMismatches,
  runTenantForeignIdIntegrityAudit,
  totalMismatchCount,
} from './tenant-foreign-id-integrity-auditor';

describe('tenant-foreign-id-integrity-auditor — T053.05C-1/T053.05C-2 (chỉ đọc)', () => {
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

  describe('findBranchManagerUserMismatches', () => {
    it('trả về mismatch khi có', async () => {
      const prisma = mockPrisma([
        {
          branch_id: 'branch-1',
          branch_organization_id: 'org-a',
          manager_user_id: 'user-1',
          manager_organization_id: 'org-b',
        },
      ]);
      await expect(findBranchManagerUserMismatches(prisma)).resolves.toEqual([
        {
          branchId: 'branch-1',
          branchOrganizationId: 'org-a',
          managerUserId: 'user-1',
          managerOrganizationId: 'org-b',
        },
      ]);
    });
  });

  describe('findBranchDefaultWarehouseMismatches', () => {
    it('trả về mismatch khi có', async () => {
      const prisma = mockPrisma([
        {
          branch_id: 'branch-1',
          branch_organization_id: 'org-a',
          default_warehouse_id: 'wh-1',
          warehouse_organization_id: 'org-b',
        },
      ]);
      await expect(
        findBranchDefaultWarehouseMismatches(prisma),
      ).resolves.toEqual([
        {
          branchId: 'branch-1',
          branchOrganizationId: 'org-a',
          defaultWarehouseId: 'wh-1',
          warehouseOrganizationId: 'org-b',
        },
      ]);
    });
  });

  describe('findProductCategoryMismatches', () => {
    it('trả về mismatch khi có', async () => {
      const prisma = mockPrisma([
        {
          product_id: 'product-1',
          product_organization_id: 'org-a',
          category_id: 'category-1',
          category_organization_id: 'org-b',
        },
      ]);
      await expect(findProductCategoryMismatches(prisma)).resolves.toEqual([
        {
          productId: 'product-1',
          productOrganizationId: 'org-a',
          categoryId: 'category-1',
          categoryOrganizationId: 'org-b',
        },
      ]);
    });
  });

  describe('findProductBrandMismatches', () => {
    it('trả về mismatch khi có', async () => {
      const prisma = mockPrisma([
        {
          product_id: 'product-1',
          product_organization_id: 'org-a',
          brand_id: 'brand-1',
          brand_organization_id: 'org-b',
        },
      ]);
      await expect(findProductBrandMismatches(prisma)).resolves.toEqual([
        {
          productId: 'product-1',
          productOrganizationId: 'org-a',
          brandId: 'brand-1',
          brandOrganizationId: 'org-b',
        },
      ]);
    });
  });

  describe('findProductUnitMismatches', () => {
    it('trả về mismatch khi có', async () => {
      const prisma = mockPrisma([
        {
          product_id: 'product-1',
          product_organization_id: 'org-a',
          unit_id: 'unit-1',
          unit_organization_id: 'org-b',
        },
      ]);
      await expect(findProductUnitMismatches(prisma)).resolves.toEqual([
        {
          productId: 'product-1',
          productOrganizationId: 'org-a',
          unitId: 'unit-1',
          unitOrganizationId: 'org-b',
        },
      ]);
    });
  });

  describe('runTenantForeignIdIntegrityAudit / totalMismatchCount', () => {
    it('gộp cả 9 báo cáo, tổng đúng bằng tổng độ dài từng mảng', async () => {
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
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            branch_id: 'branch-1',
            branch_organization_id: 'org-a',
            manager_user_id: 'user-1',
            manager_organization_id: 'org-b',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            product_id: 'product-1',
            product_organization_id: 'org-a',
            category_id: 'category-1',
            category_organization_id: 'org-b',
          },
        ])
        .mockResolvedValueOnce([])
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
      expect(report.branchManagerUserMismatches).toHaveLength(1);
      expect(report.branchDefaultWarehouseMismatches).toHaveLength(0);
      expect(report.productCategoryMismatches).toHaveLength(1);
      expect(report.productBrandMismatches).toHaveLength(0);
      expect(report.productUnitMismatches).toHaveLength(0);
      expect(totalMismatchCount(report)).toBe(4);
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

      expect(queryRaw).toHaveBeenCalledTimes(9);
      expect(Object.keys(prisma)).toEqual(['$queryRaw']);
    });
  });
});

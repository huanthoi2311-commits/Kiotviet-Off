import type { PrismaClient } from '@prisma/client';

/**
 * T053.05C-1 — CHỈ ĐỌC (cùng pattern `db-inspector.ts`, `Pick<PrismaClient, '$queryRaw'>` enforce
 * ở compile-time không thể ghi). Phát hiện dữ liệu tenant-inconsistent CÓ THỂ đã tồn tại TỪ TRƯỚC
 * khi các fix của T053.05C-1 được merge — không tự động sửa, không migration, chỉ báo cáo.
 *
 * Phạm vi ĐÚNG 4 quan hệ thuộc gói T053.05C-1 (SalesReturnItem/SupplierProduct/Inventory/
 * InventoryMovement ↔ Warehouse hoặc Product). Branch.managerUserId/defaultWarehouseId và
 * Product.categoryId/brandId/unitId thuộc phạm vi T053.05C-2 (chưa authorized), KHÔNG kiểm tra ở
 * đây để giữ đúng ranh giới gói.
 */
type AuditablePrisma = Pick<PrismaClient, '$queryRaw'>;

export interface SalesReturnItemWarehouseMismatch {
  salesReturnItemId: string;
  salesReturnId: string;
  salesReturnOrganizationId: string;
  warehouseId: string;
  warehouseOrganizationId: string;
}

export async function findSalesReturnItemWarehouseMismatches(
  prisma: AuditablePrisma,
): Promise<SalesReturnItemWarehouseMismatch[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      sales_return_item_id: string;
      sales_return_id: string;
      sales_return_organization_id: string;
      warehouse_id: string;
      warehouse_organization_id: string;
    }>
  >`
    SELECT
      sri.id AS sales_return_item_id,
      sr.id AS sales_return_id,
      sr."organizationId" AS sales_return_organization_id,
      w.id AS warehouse_id,
      w."organizationId" AS warehouse_organization_id
    FROM sales_return_items sri
    JOIN sales_returns sr ON sr.id = sri."salesReturnId"
    JOIN warehouses w ON w.id = sri."warehouseId"
    WHERE sri."warehouseId" IS NOT NULL
      AND sr."organizationId" <> w."organizationId"
  `;
  return rows.map((row) => ({
    salesReturnItemId: row.sales_return_item_id,
    salesReturnId: row.sales_return_id,
    salesReturnOrganizationId: row.sales_return_organization_id,
    warehouseId: row.warehouse_id,
    warehouseOrganizationId: row.warehouse_organization_id,
  }));
}

export interface SupplierProductMismatch {
  supplierProductId: string;
  supplierId: string;
  supplierOrganizationId: string;
  productId: string;
  productOrganizationId: string;
}

export async function findSupplierProductMismatches(
  prisma: AuditablePrisma,
): Promise<SupplierProductMismatch[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      supplier_product_id: string;
      supplier_id: string;
      supplier_organization_id: string;
      product_id: string;
      product_organization_id: string;
    }>
  >`
    SELECT
      sp.id AS supplier_product_id,
      s.id AS supplier_id,
      s."organizationId" AS supplier_organization_id,
      p.id AS product_id,
      p."organizationId" AS product_organization_id
    FROM supplier_products sp
    JOIN suppliers s ON s.id = sp."supplierId"
    JOIN products p ON p.id = sp."productId"
    WHERE s."organizationId" <> p."organizationId"
  `;
  return rows.map((row) => ({
    supplierProductId: row.supplier_product_id,
    supplierId: row.supplier_id,
    supplierOrganizationId: row.supplier_organization_id,
    productId: row.product_id,
    productOrganizationId: row.product_organization_id,
  }));
}

export interface InventoryWarehouseMismatch {
  inventoryId: string;
  inventoryOrganizationId: string;
  warehouseId: string;
  warehouseOrganizationId: string;
}

export async function findInventoryWarehouseMismatches(
  prisma: AuditablePrisma,
): Promise<InventoryWarehouseMismatch[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      inventory_id: string;
      inventory_organization_id: string;
      warehouse_id: string;
      warehouse_organization_id: string;
    }>
  >`
    SELECT
      i.id AS inventory_id,
      i."organizationId" AS inventory_organization_id,
      w.id AS warehouse_id,
      w."organizationId" AS warehouse_organization_id
    FROM inventories i
    JOIN warehouses w ON w.id = i."warehouseId"
    WHERE i."organizationId" <> w."organizationId"
  `;
  return rows.map((row) => ({
    inventoryId: row.inventory_id,
    inventoryOrganizationId: row.inventory_organization_id,
    warehouseId: row.warehouse_id,
    warehouseOrganizationId: row.warehouse_organization_id,
  }));
}

export interface InventoryMovementWarehouseMismatch {
  inventoryMovementId: string;
  movementOrganizationId: string;
  warehouseId: string;
  warehouseOrganizationId: string;
}

export async function findInventoryMovementWarehouseMismatches(
  prisma: AuditablePrisma,
): Promise<InventoryMovementWarehouseMismatch[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      inventory_movement_id: string;
      movement_organization_id: string;
      warehouse_id: string;
      warehouse_organization_id: string;
    }>
  >`
    SELECT
      im.id AS inventory_movement_id,
      im."organizationId" AS movement_organization_id,
      w.id AS warehouse_id,
      w."organizationId" AS warehouse_organization_id
    FROM inventory_movements im
    JOIN warehouses w ON w.id = im."warehouseId"
    WHERE im."organizationId" <> w."organizationId"
  `;
  return rows.map((row) => ({
    inventoryMovementId: row.inventory_movement_id,
    movementOrganizationId: row.movement_organization_id,
    warehouseId: row.warehouse_id,
    warehouseOrganizationId: row.warehouse_organization_id,
  }));
}

export interface TenantForeignIdIntegrityReport {
  salesReturnItemWarehouseMismatches: SalesReturnItemWarehouseMismatch[];
  supplierProductMismatches: SupplierProductMismatch[];
  inventoryWarehouseMismatches: InventoryWarehouseMismatch[];
  inventoryMovementWarehouseMismatches: InventoryMovementWarehouseMismatch[];
}

export function totalMismatchCount(
  report: TenantForeignIdIntegrityReport,
): number {
  return (
    report.salesReturnItemWarehouseMismatches.length +
    report.supplierProductMismatches.length +
    report.inventoryWarehouseMismatches.length +
    report.inventoryMovementWarehouseMismatches.length
  );
}

export async function runTenantForeignIdIntegrityAudit(
  prisma: AuditablePrisma,
): Promise<TenantForeignIdIntegrityReport> {
  const [
    salesReturnItemWarehouseMismatches,
    supplierProductMismatches,
    inventoryWarehouseMismatches,
    inventoryMovementWarehouseMismatches,
  ] = await Promise.all([
    findSalesReturnItemWarehouseMismatches(prisma),
    findSupplierProductMismatches(prisma),
    findInventoryWarehouseMismatches(prisma),
    findInventoryMovementWarehouseMismatches(prisma),
  ]);
  return {
    salesReturnItemWarehouseMismatches,
    supplierProductMismatches,
    inventoryWarehouseMismatches,
    inventoryMovementWarehouseMismatches,
  };
}

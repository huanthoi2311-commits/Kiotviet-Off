import type { PrismaClient } from '@prisma/client';

/**
 * T053.05C-1/T053.05C-2 — CHỈ ĐỌC (cùng pattern `db-inspector.ts`, `Pick<PrismaClient, '$queryRaw'>`
 * enforce ở compile-time không thể ghi). Phát hiện dữ liệu tenant-inconsistent CÓ THỂ đã tồn tại TỪ
 * TRƯỚC khi các fix của T053.05C-1/T053.05C-2 được merge — không tự động sửa, không migration, chỉ
 * báo cáo.
 *
 * T053.05C-1: 4 quan hệ (SalesReturnItem/SupplierProduct/Inventory/InventoryMovement ↔ Warehouse
 * hoặc Product). T053.05C-2 bổ sung đúng 5 quan hệ còn lại trong phạm vi đã authorized:
 * Branch.managerUserId↔User, Branch.defaultWarehouseId↔Warehouse, Product.categoryId↔Category,
 * Product.brandId↔Brand, Product.unitId↔Unit. Không mở rộng ra quan hệ nào khác ngoài 2 gói này.
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

export interface BranchManagerUserMismatch {
  branchId: string;
  branchOrganizationId: string;
  managerUserId: string;
  managerOrganizationId: string;
}

export async function findBranchManagerUserMismatches(
  prisma: AuditablePrisma,
): Promise<BranchManagerUserMismatch[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      branch_id: string;
      branch_organization_id: string;
      manager_user_id: string;
      manager_organization_id: string;
    }>
  >`
    SELECT
      b.id AS branch_id,
      b."organizationId" AS branch_organization_id,
      u.id AS manager_user_id,
      u."organizationId" AS manager_organization_id
    FROM branches b
    JOIN users u ON u.id = b."managerUserId"
    WHERE b."managerUserId" IS NOT NULL
      AND b."organizationId" <> u."organizationId"
  `;
  return rows.map((row) => ({
    branchId: row.branch_id,
    branchOrganizationId: row.branch_organization_id,
    managerUserId: row.manager_user_id,
    managerOrganizationId: row.manager_organization_id,
  }));
}

export interface BranchDefaultWarehouseMismatch {
  branchId: string;
  branchOrganizationId: string;
  defaultWarehouseId: string;
  warehouseOrganizationId: string;
}

export async function findBranchDefaultWarehouseMismatches(
  prisma: AuditablePrisma,
): Promise<BranchDefaultWarehouseMismatch[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      branch_id: string;
      branch_organization_id: string;
      default_warehouse_id: string;
      warehouse_organization_id: string;
    }>
  >`
    SELECT
      b.id AS branch_id,
      b."organizationId" AS branch_organization_id,
      w.id AS default_warehouse_id,
      w."organizationId" AS warehouse_organization_id
    FROM branches b
    JOIN warehouses w ON w.id = b."defaultWarehouseId"
    WHERE b."defaultWarehouseId" IS NOT NULL
      AND b."organizationId" <> w."organizationId"
  `;
  return rows.map((row) => ({
    branchId: row.branch_id,
    branchOrganizationId: row.branch_organization_id,
    defaultWarehouseId: row.default_warehouse_id,
    warehouseOrganizationId: row.warehouse_organization_id,
  }));
}

export interface ProductCategoryMismatch {
  productId: string;
  productOrganizationId: string;
  categoryId: string;
  categoryOrganizationId: string;
}

export async function findProductCategoryMismatches(
  prisma: AuditablePrisma,
): Promise<ProductCategoryMismatch[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      product_id: string;
      product_organization_id: string;
      category_id: string;
      category_organization_id: string;
    }>
  >`
    SELECT
      p.id AS product_id,
      p."organizationId" AS product_organization_id,
      c.id AS category_id,
      c."organizationId" AS category_organization_id
    FROM products p
    JOIN categories c ON c.id = p."categoryId"
    WHERE p."organizationId" <> c."organizationId"
  `;
  return rows.map((row) => ({
    productId: row.product_id,
    productOrganizationId: row.product_organization_id,
    categoryId: row.category_id,
    categoryOrganizationId: row.category_organization_id,
  }));
}

export interface ProductBrandMismatch {
  productId: string;
  productOrganizationId: string;
  brandId: string;
  brandOrganizationId: string;
}

export async function findProductBrandMismatches(
  prisma: AuditablePrisma,
): Promise<ProductBrandMismatch[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      product_id: string;
      product_organization_id: string;
      brand_id: string;
      brand_organization_id: string;
    }>
  >`
    SELECT
      p.id AS product_id,
      p."organizationId" AS product_organization_id,
      br.id AS brand_id,
      br."organizationId" AS brand_organization_id
    FROM products p
    JOIN brands br ON br.id = p."brandId"
    WHERE p."brandId" IS NOT NULL
      AND p."organizationId" <> br."organizationId"
  `;
  return rows.map((row) => ({
    productId: row.product_id,
    productOrganizationId: row.product_organization_id,
    brandId: row.brand_id,
    brandOrganizationId: row.brand_organization_id,
  }));
}

export interface ProductUnitMismatch {
  productId: string;
  productOrganizationId: string;
  unitId: string;
  unitOrganizationId: string;
}

export async function findProductUnitMismatches(
  prisma: AuditablePrisma,
): Promise<ProductUnitMismatch[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      product_id: string;
      product_organization_id: string;
      unit_id: string;
      unit_organization_id: string;
    }>
  >`
    SELECT
      p.id AS product_id,
      p."organizationId" AS product_organization_id,
      u.id AS unit_id,
      u."organizationId" AS unit_organization_id
    FROM products p
    JOIN units u ON u.id = p."unitId"
    WHERE p."organizationId" <> u."organizationId"
  `;
  return rows.map((row) => ({
    productId: row.product_id,
    productOrganizationId: row.product_organization_id,
    unitId: row.unit_id,
    unitOrganizationId: row.unit_organization_id,
  }));
}

export interface TenantForeignIdIntegrityReport {
  salesReturnItemWarehouseMismatches: SalesReturnItemWarehouseMismatch[];
  supplierProductMismatches: SupplierProductMismatch[];
  inventoryWarehouseMismatches: InventoryWarehouseMismatch[];
  inventoryMovementWarehouseMismatches: InventoryMovementWarehouseMismatch[];
  branchManagerUserMismatches: BranchManagerUserMismatch[];
  branchDefaultWarehouseMismatches: BranchDefaultWarehouseMismatch[];
  productCategoryMismatches: ProductCategoryMismatch[];
  productBrandMismatches: ProductBrandMismatch[];
  productUnitMismatches: ProductUnitMismatch[];
}

export function totalMismatchCount(
  report: TenantForeignIdIntegrityReport,
): number {
  return (
    report.salesReturnItemWarehouseMismatches.length +
    report.supplierProductMismatches.length +
    report.inventoryWarehouseMismatches.length +
    report.inventoryMovementWarehouseMismatches.length +
    report.branchManagerUserMismatches.length +
    report.branchDefaultWarehouseMismatches.length +
    report.productCategoryMismatches.length +
    report.productBrandMismatches.length +
    report.productUnitMismatches.length
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
    branchManagerUserMismatches,
    branchDefaultWarehouseMismatches,
    productCategoryMismatches,
    productBrandMismatches,
    productUnitMismatches,
  ] = await Promise.all([
    findSalesReturnItemWarehouseMismatches(prisma),
    findSupplierProductMismatches(prisma),
    findInventoryWarehouseMismatches(prisma),
    findInventoryMovementWarehouseMismatches(prisma),
    findBranchManagerUserMismatches(prisma),
    findBranchDefaultWarehouseMismatches(prisma),
    findProductCategoryMismatches(prisma),
    findProductBrandMismatches(prisma),
    findProductUnitMismatches(prisma),
  ]);
  return {
    salesReturnItemWarehouseMismatches,
    supplierProductMismatches,
    inventoryWarehouseMismatches,
    inventoryMovementWarehouseMismatches,
    branchManagerUserMismatches,
    branchDefaultWarehouseMismatches,
    productCategoryMismatches,
    productBrandMismatches,
    productUnitMismatches,
  };
}

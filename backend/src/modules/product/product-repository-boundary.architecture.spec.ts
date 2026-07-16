import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ProductModule } from './product.module';
import { ProductDomainService } from './application/product-domain.service';
import { CategoryModule } from '../category/category.module';
import { BrandModule } from '../brand/brand.module';
import { UnitModule } from '../unit/unit.module';
import { BarcodeModule } from '../barcode/barcode.module';
import { CartModule } from '../cart/cart.module';

/**
 * T005 (SPEC-PRODUCT-001 §11.3) — Architecture Verification tự động cho Repository Boundary của
 * Product (ADR-0010), theo đúng mẫu `inventory/single-writer.architecture.spec.ts` (T004.5).
 * Quét TOÀN BỘ `backend/src/modules` (trừ chính `product` module) và thất bại vĩnh viễn trong CI
 * nếu module tương lai nào vi phạm:
 *
 *  1. Không module nào ngoài `product` được import `PRODUCT_REPOSITORY`/`IProductRepository`
 *     (SPEC-PRODUCT-001 §7.2) — chỉ được gọi qua `ProductDomainService`.
 *  2. Không module nào ngoài `product` được gọi phương thức ghi
 *     (`upsert`/`update`/`updateMany`/`create`/`createMany`/`delete`/`deleteMany`) trên
 *     `prisma.product`/`tx.product`.
 *  3. `ProductModule` chỉ export `ProductDomainService`.
 *  4. Cả 5 module phụ thuộc (§7.3) import `ProductModule`.
 *
 * Dùng `\b` (word boundary) khi match `PRODUCT_REPOSITORY`/`IProductRepository` để tránh false
 * positive với `SUPPLIER_PRODUCT_REPOSITORY`/`ISupplierProductRepository` (token khác hoàn toàn,
 * thuộc domain Supplier-Product — lỗi đã tự phát hiện và sửa ở SPEC-PRODUCT-001 §0, xem lại đây
 * để không lặp lại sai lầm cũ bằng 1 grep/includes không có ranh giới từ).
 *
 * Không dùng `test/` (e2e) — các file *.e2e-spec.ts (nếu có) cố ý gọi thẳng `PRODUCT_REPOSITORY`
 * qua `app.get()` để seed dữ liệu, không đi qua constructor injection của 1 module nghiệp vụ.
 */
describe('Architecture: Product Repository Boundary (SPEC-PRODUCT-001, T005)', () => {
  const modulesRoot = join(__dirname, '..');
  const productModuleDir = join(modulesRoot, 'product');

  const PRODUCT_REPOSITORY_TOKEN_PATTERN =
    /\bPRODUCT_REPOSITORY\b|\bIProductRepository\b/;
  const PRODUCT_WRITE_PATTERN =
    /\.product\.(upsert|update|updateMany|create|createMany|delete|deleteMany)\s*\(/;

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

  function filesOutsideProductModule(): string[] {
    return collectTsFiles(modulesRoot).filter(
      (file) => !file.startsWith(productModuleDir),
    );
  }

  it('modulesRoot tồn tại và quét được > 0 file .ts (bảo vệ test khỏi false-negative do đường dẫn sai)', () => {
    expect(existsSync(productModuleDir)).toBe(true);
    expect(filesOutsideProductModule().length).toBeGreaterThan(50);
  });

  it('không module nào ngoài product import PRODUCT_REPOSITORY hoặc IProductRepository', () => {
    const violations: string[] = [];
    for (const file of filesOutsideProductModule()) {
      const content = readFileSync(file, 'utf-8');
      if (PRODUCT_REPOSITORY_TOKEN_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('không bị false positive với SUPPLIER_PRODUCT_REPOSITORY/ISupplierProductRepository (word boundary đúng)', () => {
    const supplierProductRepoFile = join(
      modulesRoot,
      'supplier',
      'domain',
      'repositories',
      'supplier-product.repository.interface.ts',
    );
    expect(existsSync(supplierProductRepoFile)).toBe(true);
    const content = readFileSync(supplierProductRepoFile, 'utf-8');
    expect(content.includes('SUPPLIER_PRODUCT_REPOSITORY')).toBe(true);
    expect(PRODUCT_REPOSITORY_TOKEN_PATTERN.test(content)).toBe(false);
  });

  it('không module nào ngoài product gọi phương thức ghi trên prisma.product/tx.product', () => {
    const violations: string[] = [];
    for (const file of filesOutsideProductModule()) {
      const content = readFileSync(file, 'utf-8');
      if (PRODUCT_WRITE_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('ProductModule chỉ export ProductDomainService, không export PRODUCT_REPOSITORY', () => {
    const exportsMeta: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, ProductModule) ?? [];

    expect(exportsMeta).toContain(ProductDomainService);
    expect(exportsMeta).toHaveLength(1);
  });

  it.each([
    ['category.module', CategoryModule],
    ['brand.module', BrandModule],
    ['unit.module', UnitModule],
    ['barcode.module', BarcodeModule],
    ['cart.module', CartModule],
  ])(
    '%s import ProductModule (được phép gọi ProductDomainService)',
    (_name, ModuleClass) => {
      const importsMeta: unknown[] =
        Reflect.getMetadata(MODULE_METADATA.IMPORTS, ModuleClass) ?? [];

      expect(importsMeta).toContain(ProductModule);
    },
  );
});

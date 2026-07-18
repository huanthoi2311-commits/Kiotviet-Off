import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { SupplierModule } from './supplier.module';
import { SupplierDomainService } from './application/supplier-domain.service';

/**
 * T012 (SPEC-T012-SUPPLIER-001 §9.4, Decision SR05/SP10) — Architecture Verification tự động cho
 * việc gỡ Technical Debt tồn tại từ trước T012: `supplier-debt` từng inject thẳng
 * `SUPPLIER_REPOSITORY` (vi phạm ADR-0010) — nay phải phụ thuộc `SupplierDomainService`.
 * Đúng mẫu `customer-repository-boundary.architecture.spec.ts` (T011).
 */
describe('Architecture: Supplier Repository Boundary (SPEC-T012-SUPPLIER-001, T012)', () => {
  const modulesRoot = join(__dirname, '..');
  const supplierModuleDir = join(__dirname);

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

  function filesOutsideSupplierModule(): string[] {
    return collectTsFiles(modulesRoot).filter(
      (file) => !file.startsWith(supplierModuleDir),
    );
  }

  function exportsOf(
    ModuleClass: new (...args: never[]) => unknown,
  ): unknown[] {
    return (
      (Reflect.getMetadata(
        MODULE_METADATA.EXPORTS,
        ModuleClass,
      ) as unknown[]) ?? []
    );
  }

  function importsOf(
    ModuleClass: new (...args: never[]) => unknown,
  ): unknown[] {
    return (
      (Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        ModuleClass,
      ) as unknown[]) ?? []
    );
  }

  // Decision SR05/SP10 — SupplierModule chỉ export SupplierDomainService, không 2 token cũ.
  it('SupplierModule chỉ export SupplierDomainService (không SUPPLIER_REPOSITORY/SUPPLIER_PRODUCT_REPOSITORY)', () => {
    const exportsMeta = exportsOf(SupplierModule);
    expect(exportsMeta).toEqual([SupplierDomainService]);
  });

  it('SupplierModule.imports không dùng forwardRef()', () => {
    const importsMeta = importsOf(SupplierModule);
    expect(
      importsMeta.some(
        (m) => typeof m === 'function' && m.name === 'forwardRef',
      ),
    ).toBe(false);
  });

  // Decision SR05/SP10 — không module nào ngoài supplier import SUPPLIER_REPOSITORY/ISupplierRepository/
  // SUPPLIER_PRODUCT_REPOSITORY/ISupplierProductRepository.
  it('không module nào ngoài supplier import SUPPLIER_REPOSITORY/ISupplierRepository/SUPPLIER_PRODUCT_REPOSITORY/ISupplierProductRepository', () => {
    const TOKEN_PATTERN =
      /\bSUPPLIER_REPOSITORY\b|\bISupplierRepository\b|\bSUPPLIER_PRODUCT_REPOSITORY\b|\bISupplierProductRepository\b/;
    const violations: string[] = [];
    for (const file of filesOutsideSupplierModule()) {
      const content = readFileSync(file, 'utf-8');
      if (TOKEN_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  // Decision SR05 — kiểm tra rõ ràng supplier-debt không còn inject SUPPLIER_REPOSITORY.
  it('supplier-debt.service.ts không import SUPPLIER_REPOSITORY/ISupplierRepository', () => {
    const content = readFileSync(
      join(
        modulesRoot,
        'supplier-debt',
        'application',
        'supplier-debt.service.ts',
      ),
      'utf-8',
    );
    expect(content.includes('SUPPLIER_REPOSITORY')).toBe(false);
    expect(content.includes('ISupplierRepository')).toBe(false);
  });

  it('không dùng forwardRef() trong supplier.module.ts', () => {
    const content = readFileSync(
      join(__dirname, 'supplier.module.ts'),
      'utf-8',
    );
    expect(content.includes('forwardRef')).toBe(false);
  });
});

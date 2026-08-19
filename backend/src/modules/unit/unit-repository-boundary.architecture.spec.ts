import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { UnitModule } from './unit.module';
import { UnitPersistenceModule } from './unit-persistence.module';
import { UnitReferenceModule } from './unit-reference.module';
import { UnitDomainService } from './application/unit-domain.service';
import { UnitService } from './application/unit.service';
import { BarcodeModule } from '../barcode/barcode.module';
import { BarcodePersistenceModule } from '../barcode/barcode-persistence.module';
import { BarcodeReferenceModule } from '../barcode/barcode-reference.module';
import { ProductModule } from '../product/product.module';

/**
 * T009 (SPEC-BARCODE-001 §9.4/§9.5) — Architecture Verification tự động cho Repository Boundary
 * của Unit (ADR-0010), theo đúng mẫu `product-repository-boundary.architecture.spec.ts` (T005).
 * Xác nhận `UnitModule` chỉ import `BarcodeReferenceModule` (KHÔNG `BarcodeModule`/
 * `BarcodePersistenceModule` — điều kiện tránh circular dependency, Decision RPC05).
 *
 * T053.05C-2 — Unit áp dụng lại đúng thiết kế 3 module (Persistence/Reference/đầy đủ) đã dùng cho
 * Barcode (Decision RPC01-RPC12), để `UnitReferenceModule` import được từ `ProductModule` mà không
 * tạo circular dependency (Product→Unit→Product, vì `UnitModule` đầy đủ đã import `ProductModule`
 * từ trước). Khác Barcode (không consumer nào import `BarcodeModule` đầy đủ để lấy provider), Unit
 * có 2 consumer hiện có (`CheckoutModule`, `BarcodeModule`) tiếp tục import `UnitModule` đầy đủ và
 * cần nhận `UnitDomainService` — nên `UnitModule` phải re-export bằng module class
 * (`UnitReferenceModule`), giữ hành vi cho 2 consumer đó không đổi.
 */
describe('Architecture: Unit Repository Boundary (SPEC-BARCODE-001, T009)', () => {
  const modulesRoot = join(__dirname, '..');
  const unitModuleDir = join(__dirname);

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

  function filesOutsideUnitModule(): string[] {
    return collectTsFiles(modulesRoot).filter(
      (file) => !file.startsWith(unitModuleDir),
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

  function providersOf(
    ModuleClass: new (...args: never[]) => unknown,
  ): unknown[] {
    return (
      (Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        ModuleClass,
      ) as unknown[]) ?? []
    );
  }

  // CD11 mục 1/CD11 mục 2/RPC08 mục 5/9 — UnitModule KHÔNG import BarcodeModule/BarcodePersistenceModule, CHỈ import BarcodeReferenceModule.
  it('UnitModule import BarcodeReferenceModule, KHÔNG import BarcodeModule/BarcodePersistenceModule', () => {
    const imports = importsOf(UnitModule);
    expect(imports).toContain(BarcodeReferenceModule);
    expect(imports).not.toContain(BarcodeModule);
    expect(imports).not.toContain(BarcodePersistenceModule);
  });

  // CD11 mục 9 — UNIT_REPOSITORY không được export từ UnitModule. T053.05C-2 — UnitModule re-export
  // UnitDomainService bằng module class (UnitReferenceModule), KHÔNG export bare UNIT_REPOSITORY
  // hay UnitDomainService trực tiếp (Nest's validateExportedProvider chỉ chấp nhận token export
  // nếu token đó được provide cục bộ — UnitModule không còn tự đăng ký UnitDomainService).
  it('UnitModule chỉ export UnitReferenceModule, không export UNIT_REPOSITORY trực tiếp', () => {
    const exportsMeta = exportsOf(UnitModule);
    expect(exportsMeta).toContain(UnitReferenceModule);
    expect(exportsMeta).toHaveLength(1);
    expect(exportsMeta).not.toContain(UnitPersistenceModule);
  });

  it('UnitModule import UnitPersistenceModule + UnitReferenceModule, UnitService vẫn là provider', () => {
    const imports = importsOf(UnitModule);
    expect(imports).toContain(UnitPersistenceModule);
    expect(imports).toContain(UnitReferenceModule);
    expect(providersOf(UnitModule)).toContain(UnitService);
    expect(providersOf(UnitModule)).not.toContain(UnitDomainService);
  });

  // Mẫu RPC08 mục 4/8/12 (Barcode) áp dụng cho Unit — UnitReferenceModule chỉ export
  // UnitDomainService, KHÔNG export UNIT_REPOSITORY, KHÔNG import module nghiệp vụ nào.
  it('UnitReferenceModule chỉ export UnitDomainService, chỉ import UnitPersistenceModule', () => {
    const exportsMeta = exportsOf(UnitReferenceModule);
    expect(exportsMeta).toContain(UnitDomainService);
    expect(exportsMeta).toHaveLength(1);
    expect(providersOf(UnitReferenceModule)).toContain(UnitDomainService);
    const imports = importsOf(UnitReferenceModule);
    expect(imports).toEqual([UnitPersistenceModule]);
    expect(imports).not.toContain(ProductModule);
    expect(imports).not.toContain(BarcodeReferenceModule);
  });

  // Mẫu RPC08 mục 1/2 (Barcode) — UNIT_REPOSITORY chỉ đăng ký + export từ UnitPersistenceModule,
  // module này không import module nghiệp vụ nào.
  it('UnitPersistenceModule đăng ký và export UNIT_REPOSITORY, không import module nghiệp vụ nào', () => {
    const providers = providersOf(UnitPersistenceModule);
    expect(
      providers.some(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          p.provide?.toString() === 'Symbol(UNIT_REPOSITORY)',
      ),
    ).toBe(true);
    expect(importsOf(UnitPersistenceModule)).toEqual([]);
  });

  it('không module nào ngoài unit import UNIT_REPOSITORY hoặc IUnitRepository', () => {
    const UNIT_REPOSITORY_TOKEN_PATTERN =
      /\bUNIT_REPOSITORY\b|\bIUnitRepository\b/;
    const violations: string[] = [];
    for (const file of filesOutsideUnitModule()) {
      const content = readFileSync(file, 'utf-8');
      if (UNIT_REPOSITORY_TOKEN_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('không dùng forwardRef() trong unit.module.ts', () => {
    const content = readFileSync(join(__dirname, 'unit.module.ts'), 'utf-8');
    expect(content.includes('forwardRef')).toBe(false);
  });
});

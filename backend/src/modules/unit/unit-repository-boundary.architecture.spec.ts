import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { UnitModule } from './unit.module';
import { UnitDomainService } from './application/unit-domain.service';
import { BarcodeModule } from '../barcode/barcode.module';
import { BarcodePersistenceModule } from '../barcode/barcode-persistence.module';
import { BarcodeReferenceModule } from '../barcode/barcode-reference.module';

/**
 * T009 (SPEC-BARCODE-001 §9.4/§9.5) — Architecture Verification tự động cho Repository Boundary
 * của Unit (ADR-0010), theo đúng mẫu `product-repository-boundary.architecture.spec.ts` (T005).
 * Xác nhận `UnitModule` chỉ import `BarcodeReferenceModule` (KHÔNG `BarcodeModule`/
 * `BarcodePersistenceModule` — điều kiện tránh circular dependency, Decision RPC05).
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

  // CD11 mục 1/CD11 mục 2/RPC08 mục 5/9 — UnitModule KHÔNG import BarcodeModule/BarcodePersistenceModule, CHỈ import BarcodeReferenceModule.
  it('UnitModule import BarcodeReferenceModule, KHÔNG import BarcodeModule/BarcodePersistenceModule', () => {
    const imports = importsOf(UnitModule);
    expect(imports).toContain(BarcodeReferenceModule);
    expect(imports).not.toContain(BarcodeModule);
    expect(imports).not.toContain(BarcodePersistenceModule);
  });

  // CD11 mục 9 — UNIT_REPOSITORY không được export từ UnitModule.
  it('UnitModule chỉ export UnitDomainService, không export UNIT_REPOSITORY', () => {
    const exportsMeta = exportsOf(UnitModule);
    expect(exportsMeta).toContain(UnitDomainService);
    expect(exportsMeta).toHaveLength(1);
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

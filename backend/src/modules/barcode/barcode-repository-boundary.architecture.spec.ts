import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { BarcodeModule } from './barcode.module';
import { BarcodePersistenceModule } from './barcode-persistence.module';
import { BarcodeReferenceModule } from './barcode-reference.module';
import { BarcodeDomainService } from './application/barcode-domain.service';
import { BarcodeService } from './application/barcode.service';
import { ProductModule } from '../product/product.module';
import { UnitModule } from '../unit/unit.module';

/**
 * T009 (SPEC-BARCODE-001 §9.3/§9.5) — Architecture Verification tự động cho thiết kế 3 module
 * (`BarcodePersistenceModule`/`BarcodeReferenceModule`/`BarcodeModule`) đã được xác nhận qua
 * `ARCHITECT RESOLUTION — T009 Barcode Repository Ownership Correction` (Decision RPC01-RPC12,
 * 12 assertion bắt buộc — RPC08), sau khi phát hiện + xử lý circular dependency Unit↔Barcode
 * (`ARCHITECT RESOLUTION — T009 Circular Module Dependency`, Decision CD01-CD12).
 */
describe('Architecture: Barcode Repository Boundary (SPEC-BARCODE-001, T009)', () => {
  const modulesRoot = join(__dirname, '..');
  const barcodeModuleDir = join(__dirname);

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

  function filesOutsideBarcodeModule(): string[] {
    return collectTsFiles(modulesRoot).filter(
      (file) => !file.startsWith(barcodeModuleDir),
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

  // RPC08 mục 3, CD11 mục 3 — BarcodeModule import UnitModule và BarcodeReferenceModule.
  it('BarcodeModule import UnitModule, BarcodeReferenceModule, BarcodePersistenceModule', () => {
    const imports = importsOf(BarcodeModule);
    expect(imports).toContain(UnitModule);
    expect(imports).toContain(BarcodeReferenceModule);
    expect(imports).toContain(BarcodePersistenceModule);
  });

  // RPC08 mục 3 — BarcodeModule không export BARCODE_REPOSITORY (exports rỗng, không export gì).
  it('BarcodeModule không export gì (đặc biệt không export BARCODE_REPOSITORY)', () => {
    expect(exportsOf(BarcodeModule)).toEqual([]);
  });

  // RPC08 mục 11 — BarcodeService vẫn thuộc BarcodeModule.
  it('BarcodeService vẫn là provider của BarcodeModule', () => {
    expect(providersOf(BarcodeModule)).toContain(BarcodeService);
  });

  // CD11 mục 4/5 — BarcodeReferenceModule không import UnitModule/ProductModule.
  it('BarcodeReferenceModule không import UnitModule hoặc ProductModule', () => {
    const imports = importsOf(BarcodeReferenceModule);
    expect(imports).not.toContain(UnitModule);
    expect(imports).not.toContain(ProductModule);
    expect(imports).toContain(BarcodePersistenceModule);
  });

  // RPC08 mục 4/8 — BarcodeReferenceModule không export BARCODE_REPOSITORY, chỉ export BarcodeDomainService.
  it('BarcodeReferenceModule chỉ export BarcodeDomainService', () => {
    const exportsMeta = exportsOf(BarcodeReferenceModule);
    expect(exportsMeta).toContain(BarcodeDomainService);
    expect(exportsMeta).toHaveLength(1);
  });

  // RPC08 mục 12 — BarcodeDomainService vẫn thuộc BarcodeReferenceModule.
  it('BarcodeDomainService vẫn là provider của BarcodeReferenceModule', () => {
    expect(providersOf(BarcodeReferenceModule)).toContain(BarcodeDomainService);
  });

  // RPC08 mục 1/2 — BARCODE_REPOSITORY chỉ đăng ký + export từ BarcodePersistenceModule.
  it('BarcodePersistenceModule đăng ký và export BARCODE_REPOSITORY, không import module nghiệp vụ nào', () => {
    const providers = providersOf(BarcodePersistenceModule);
    expect(
      providers.some(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          p.provide?.toString() === 'Symbol(BARCODE_REPOSITORY)',
      ),
    ).toBe(true);
    expect(importsOf(BarcodePersistenceModule)).toEqual([]);
  });

  // RPC08 mục 6 — ProductModule không import BarcodePersistenceModule.
  it('ProductModule không import BarcodePersistenceModule', () => {
    expect(importsOf(ProductModule)).not.toContain(BarcodePersistenceModule);
  });

  // RPC08 mục 5 (phía Unit) — kiểm tra chéo, xác nhận lại ở unit-repository-boundary.architecture.spec.ts.
  it('UnitModule không import BarcodePersistenceModule', () => {
    expect(importsOf(UnitModule)).not.toContain(BarcodePersistenceModule);
  });

  // RPC08 mục 7 — chỉ BarcodeModule và BarcodeReferenceModule được import BarcodePersistenceModule.
  it('không module nào ngoài BarcodeModule/BarcodeReferenceModule import BarcodePersistenceModule', () => {
    const violations: string[] = [];
    for (const file of filesOutsideBarcodeModule()) {
      const content = readFileSync(file, 'utf-8');
      if (/\bBarcodePersistenceModule\b/.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  // RPC08 mục 10, CD11 mục 6 — không dùng forwardRef() để giải quyết Unit-Barcode dependency.
  it('không module nào (barcode/unit) dùng forwardRef()', () => {
    const filesToCheck = [
      join(__dirname, 'barcode.module.ts'),
      join(__dirname, 'barcode-reference.module.ts'),
      join(__dirname, 'barcode-persistence.module.ts'),
      join(modulesRoot, 'unit', 'unit.module.ts'),
    ];
    for (const file of filesToCheck) {
      const content = readFileSync(file, 'utf-8');
      expect(content.includes('forwardRef')).toBe(false);
    }
  });

  // Không module nào ngoài barcode-persistence/barcode/barcode-reference import trực tiếp BARCODE_REPOSITORY/IBarcodeRepository.
  it('không module nào ngoài barcode import BARCODE_REPOSITORY hoặc IBarcodeRepository', () => {
    const BARCODE_REPOSITORY_TOKEN_PATTERN =
      /\bBARCODE_REPOSITORY\b|\bIBarcodeRepository\b/;
    const violations: string[] = [];
    for (const file of filesOutsideBarcodeModule()) {
      const content = readFileSync(file, 'utf-8');
      if (BARCODE_REPOSITORY_TOKEN_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });
});

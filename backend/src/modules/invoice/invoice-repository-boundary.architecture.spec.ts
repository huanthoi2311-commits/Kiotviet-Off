import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { InvoiceModule } from './invoice.module';
import { InvoiceService } from './application/invoice.service';

/**
 * T013 Phase 2 (SPEC-T013-SALES-FOUNDATION-001 §9.3/§9.6, ADR-0010 — Repository Boundary) —
 * `InvoiceModule` từng export cả `InvoiceService` VÀ `INVOICE_REPOSITORY` — nay chỉ export
 * `InvoiceService`. Không consumer nào (kể cả `checkout`) từng inject repository token trực
 * tiếp — fix này hoàn tất trọn vẹn trong Phase 2, không phụ thuộc Phase 3.
 */
describe('Architecture: Invoice Repository Boundary (SPEC-T013-SALES-FOUNDATION-001, T013 Phase 2)', () => {
  const modulesRoot = join(__dirname, '..');
  const invoiceModuleDir = join(__dirname);

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

  function filesOutsideInvoiceModule(): string[] {
    return collectTsFiles(modulesRoot).filter(
      (file) => !file.startsWith(invoiceModuleDir),
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

  it('InvoiceModule chỉ export InvoiceService', () => {
    const exportsMeta = exportsOf(InvoiceModule);
    expect(exportsMeta).toEqual([InvoiceService]);
  });

  it('không module nào ngoài invoice import INVOICE_REPOSITORY hoặc IInvoiceRepository', () => {
    const TOKEN_PATTERN = /\bINVOICE_REPOSITORY\b|\bIInvoiceRepository\b/;
    const violations: string[] = [];
    for (const file of filesOutsideInvoiceModule()) {
      const content = readFileSync(file, 'utf-8');
      if (TOKEN_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('checkout.service.ts không import INVOICE_REPOSITORY/IInvoiceRepository', () => {
    const content = readFileSync(
      join(modulesRoot, 'checkout', 'application', 'checkout.service.ts'),
      'utf-8',
    );
    expect(content.includes('INVOICE_REPOSITORY')).toBe(false);
    expect(content.includes('IInvoiceRepository')).toBe(false);
  });

  it('không dùng forwardRef() trong invoice.module.ts', () => {
    const content = readFileSync(join(__dirname, 'invoice.module.ts'), 'utf-8');
    expect(content.includes('forwardRef')).toBe(false);
  });
});

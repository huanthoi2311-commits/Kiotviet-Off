import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { PaymentModule } from './payment.module';
import { PaymentService } from './application/payment.service';

/**
 * T013 Phase 2 (SPEC-T013-SALES-FOUNDATION-001 §9.3/§9.6, ADR-0010 — Repository Boundary) —
 * `PaymentModule` từng export cả `PaymentService` VÀ `PAYMENT_REPOSITORY` — nay chỉ export
 * `PaymentService`. Không consumer nào (kể cả `checkout`) từng inject repository token trực
 * tiếp — fix này hoàn tất trọn vẹn trong Phase 2, không phụ thuộc Phase 3.
 */
describe('Architecture: Payment Repository Boundary (SPEC-T013-SALES-FOUNDATION-001, T013 Phase 2)', () => {
  const modulesRoot = join(__dirname, '..');
  const paymentModuleDir = join(__dirname);

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

  function filesOutsidePaymentModule(): string[] {
    return collectTsFiles(modulesRoot).filter(
      (file) => !file.startsWith(paymentModuleDir),
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

  it('PaymentModule chỉ export PaymentService', () => {
    const exportsMeta = exportsOf(PaymentModule);
    expect(exportsMeta).toEqual([PaymentService]);
  });

  it('không module nào ngoài payment import PAYMENT_REPOSITORY hoặc IPaymentRepository', () => {
    const TOKEN_PATTERN = /\bPAYMENT_REPOSITORY\b|\bIPaymentRepository\b/;
    const violations: string[] = [];
    for (const file of filesOutsidePaymentModule()) {
      const content = readFileSync(file, 'utf-8');
      if (TOKEN_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('checkout.service.ts không import PAYMENT_REPOSITORY/IPaymentRepository', () => {
    const content = readFileSync(
      join(modulesRoot, 'checkout', 'application', 'checkout.service.ts'),
      'utf-8',
    );
    expect(content.includes('PAYMENT_REPOSITORY')).toBe(false);
    expect(content.includes('IPaymentRepository')).toBe(false);
  });

  it('không dùng forwardRef() trong payment.module.ts', () => {
    const content = readFileSync(join(__dirname, 'payment.module.ts'), 'utf-8');
    expect(content.includes('forwardRef')).toBe(false);
  });
});

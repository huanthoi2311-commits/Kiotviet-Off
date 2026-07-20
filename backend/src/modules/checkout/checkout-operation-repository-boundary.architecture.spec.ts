import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { CheckoutModule } from './checkout.module';

/**
 * T013 Phase 1 (SPEC-T013-SALES-FOUNDATION-001 §9.5/§9.6, ADR-0010) — `CHECKOUT_OPERATION_REPOSITORY`
 * không được export ra ngoài module `checkout`, chỉ `CheckoutOperationService` (nội bộ module)
 * mới được inject. Đúng mẫu `customer-repository-boundary.architecture.spec.ts` (T011).
 */
describe('Architecture: CheckoutOperation Repository Boundary (SPEC-T013-SALES-FOUNDATION-001, T013 Phase 1)', () => {
  const modulesRoot = join(__dirname, '..');
  const checkoutModuleDir = join(__dirname);

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

  function filesOutsideCheckoutModule(): string[] {
    return collectTsFiles(modulesRoot).filter(
      (file) => !file.startsWith(checkoutModuleDir),
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

  it('CheckoutModule không export CHECKOUT_OPERATION_REPOSITORY', () => {
    const exportsMeta = exportsOf(CheckoutModule);
    // CheckoutModule hiện tại không export gì cả (không có key `exports`) — xác nhận vẫn đúng
    // sau khi thêm hạ tầng Idempotency ở Phase 1.
    expect(exportsMeta).toEqual([]);
  });

  it('không module nào ngoài checkout import CHECKOUT_OPERATION_REPOSITORY hoặc ICheckoutOperationRepository', () => {
    const TOKEN_PATTERN =
      /\bCHECKOUT_OPERATION_REPOSITORY\b|\bICheckoutOperationRepository\b/;
    const violations: string[] = [];
    for (const file of filesOutsideCheckoutModule()) {
      const content = readFileSync(file, 'utf-8');
      if (TOKEN_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('CheckoutOperationService là consumer nội bộ duy nhất của CHECKOUT_OPERATION_REPOSITORY', () => {
    const content = readFileSync(
      join(__dirname, 'application', 'checkout-operation.service.ts'),
      'utf-8',
    );
    expect(content.includes('CHECKOUT_OPERATION_REPOSITORY')).toBe(true);
  });

  it('không dùng forwardRef() trong checkout.module.ts', () => {
    const content = readFileSync(
      join(__dirname, 'checkout.module.ts'),
      'utf-8',
    );
    expect(content.includes('forwardRef')).toBe(false);
  });
});

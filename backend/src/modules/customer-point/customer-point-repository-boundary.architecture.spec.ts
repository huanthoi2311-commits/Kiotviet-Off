import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { CustomerPointModule } from './customer-point.module';
import { CustomerPointDomainService } from './application/customer-point-domain.service';

/**
 * T013 Phase 2 (Repository Boundary Cleanup) + Phase 3 (Checkout Refactor) —
 * SPEC-T013-SALES-FOUNDATION-001 §9.6, ADR-0010 — Repository Boundary. `checkout` từng inject
 * thẳng `CUSTOMER_POINT_REPOSITORY` — nay phụ thuộc `CustomerPointDomainService`. Đúng mẫu
 * `customer-repository-boundary.architecture.spec.ts` (T011).
 */
describe('Architecture: Customer Point Repository Boundary (SPEC-T013-SALES-FOUNDATION-001, T013 Phase 2+3)', () => {
  const modulesRoot = join(__dirname, '..');
  const customerPointModuleDir = join(__dirname);

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

  function filesOutsideCustomerPointModule(): string[] {
    return collectTsFiles(modulesRoot).filter(
      (file) => !file.startsWith(customerPointModuleDir),
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

  it('CustomerPointModule chỉ export CustomerPointDomainService', () => {
    const exportsMeta = exportsOf(CustomerPointModule);
    expect(exportsMeta).toEqual([CustomerPointDomainService]);
  });

  it('không module nào ngoài customer-point import CUSTOMER_POINT_REPOSITORY hoặc ICustomerPointRepository', () => {
    const TOKEN_PATTERN =
      /\bCUSTOMER_POINT_REPOSITORY\b|\bICustomerPointRepository\b/;
    const violations: string[] = [];
    for (const file of filesOutsideCustomerPointModule()) {
      const content = readFileSync(file, 'utf-8');
      if (TOKEN_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  // T013 Phase 3 (Checkout Refactor) — checkout.service.ts đã chuyển sang CustomerPointDomainService.
  it('checkout.service.ts không import CUSTOMER_POINT_REPOSITORY/ICustomerPointRepository', () => {
    const content = readFileSync(
      join(modulesRoot, 'checkout', 'application', 'checkout.service.ts'),
      'utf-8',
    );
    expect(content.includes('CUSTOMER_POINT_REPOSITORY')).toBe(false);
    expect(content.includes('ICustomerPointRepository')).toBe(false);
  });

  it('không dùng forwardRef() trong customer-point.module.ts', () => {
    const content = readFileSync(
      join(__dirname, 'customer-point.module.ts'),
      'utf-8',
    );
    expect(content.includes('forwardRef')).toBe(false);
  });
});

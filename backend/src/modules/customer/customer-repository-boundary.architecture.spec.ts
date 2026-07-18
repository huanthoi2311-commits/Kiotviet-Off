import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { CustomerModule } from './customer.module';
import { CustomerDomainService } from './application/customer-domain.service';

/**
 * T011 (SPEC-T011-CUSTOMER-001 §9.4, Decision CR08/SR04/SR13) — Architecture Verification tự
 * động cho việc gỡ Technical Debt tồn tại từ trước T011: `checkout`/`customer-point` từng inject
 * thẳng `CUSTOMER_REPOSITORY` (vi phạm ADR-0010) — nay phải phụ thuộc `CustomerDomainService`.
 * Đúng mẫu `barcode-repository-boundary.architecture.spec.ts` (T009).
 */
describe('Architecture: Customer Repository Boundary (SPEC-T011-CUSTOMER-001, T011)', () => {
  const modulesRoot = join(__dirname, '..');
  const customerModuleDir = join(__dirname);

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

  function filesOutsideCustomerModule(): string[] {
    return collectTsFiles(modulesRoot).filter(
      (file) => !file.startsWith(customerModuleDir),
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

  // Decision CR08/SR04 — CustomerModule chỉ export CustomerDomainService, không CUSTOMER_REPOSITORY.
  it('CustomerModule chỉ export CustomerDomainService', () => {
    const exportsMeta = exportsOf(CustomerModule);
    expect(exportsMeta).toContain(CustomerDomainService);
    expect(exportsMeta).toHaveLength(1);
  });

  // Decision SR04/SR13 — không module nào ngoài customer import CUSTOMER_REPOSITORY/ICustomerRepository.
  it('không module nào ngoài customer import CUSTOMER_REPOSITORY hoặc ICustomerRepository', () => {
    const CUSTOMER_REPOSITORY_TOKEN_PATTERN =
      /\bCUSTOMER_REPOSITORY\b|\bICustomerRepository\b/;
    const violations: string[] = [];
    for (const file of filesOutsideCustomerModule()) {
      const content = readFileSync(file, 'utf-8');
      if (CUSTOMER_REPOSITORY_TOKEN_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  // Decision SR13 — kiểm tra rõ ràng checkout không còn inject CUSTOMER_REPOSITORY.
  it('checkout.service.ts không import CUSTOMER_REPOSITORY/ICustomerRepository', () => {
    const content = readFileSync(
      join(modulesRoot, 'checkout', 'application', 'checkout.service.ts'),
      'utf-8',
    );
    expect(content.includes('CUSTOMER_REPOSITORY')).toBe(false);
    expect(content.includes('ICustomerRepository')).toBe(false);
  });

  // Decision SR13 — kiểm tra rõ ràng customer-point không còn inject CUSTOMER_REPOSITORY.
  it('customer-point.service.ts không import CUSTOMER_REPOSITORY/ICustomerRepository', () => {
    const content = readFileSync(
      join(
        modulesRoot,
        'customer-point',
        'application',
        'customer-point.service.ts',
      ),
      'utf-8',
    );
    expect(content.includes('CUSTOMER_REPOSITORY')).toBe(false);
    expect(content.includes('ICustomerRepository')).toBe(false);
  });

  it('không dùng forwardRef() trong customer.module.ts', () => {
    const content = readFileSync(
      join(__dirname, 'customer.module.ts'),
      'utf-8',
    );
    expect(content.includes('forwardRef')).toBe(false);
  });
});

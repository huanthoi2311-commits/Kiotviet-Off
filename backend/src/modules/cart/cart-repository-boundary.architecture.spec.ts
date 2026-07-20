import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { CartModule } from './cart.module';
import { CartDomainService } from './application/cart-domain.service';

/**
 * T013 Phase 2 (Repository Boundary Cleanup) + Phase 3 (Checkout Refactor) —
 * SPEC-T013-SALES-FOUNDATION-001 §9.6, ADR-0010 — Repository Boundary. `checkout` từng inject
 * thẳng `CART_REPOSITORY` — nay phụ thuộc `CartDomainService`. Đúng mẫu
 * `customer-repository-boundary.architecture.spec.ts` (T011).
 */
describe('Architecture: Cart Repository Boundary (SPEC-T013-SALES-FOUNDATION-001, T013 Phase 2+3)', () => {
  const modulesRoot = join(__dirname, '..');
  const cartModuleDir = join(__dirname);

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

  function filesOutsideCartModule(): string[] {
    return collectTsFiles(modulesRoot).filter(
      (file) => !file.startsWith(cartModuleDir),
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

  it('CartModule export CartService và CartDomainService, không export CART_REPOSITORY', () => {
    const exportsMeta = exportsOf(CartModule);
    expect(exportsMeta).toContain(CartDomainService);
    expect(exportsMeta).toHaveLength(2);
  });

  it('không module nào ngoài cart import CART_REPOSITORY hoặc ICartRepository', () => {
    const TOKEN_PATTERN = /\bCART_REPOSITORY\b|\bICartRepository\b/;
    const violations: string[] = [];
    for (const file of filesOutsideCartModule()) {
      const content = readFileSync(file, 'utf-8');
      if (TOKEN_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  // T013 Phase 3 (Checkout Refactor) — checkout.service.ts đã chuyển sang CartDomainService.
  it('checkout.service.ts không import CART_REPOSITORY/ICartRepository', () => {
    const content = readFileSync(
      join(modulesRoot, 'checkout', 'application', 'checkout.service.ts'),
      'utf-8',
    );
    expect(content.includes('CART_REPOSITORY')).toBe(false);
    expect(content.includes('ICartRepository')).toBe(false);
  });

  it('không dùng forwardRef() trong cart.module.ts', () => {
    const content = readFileSync(join(__dirname, 'cart.module.ts'), 'utf-8');
    expect(content.includes('forwardRef')).toBe(false);
  });
});

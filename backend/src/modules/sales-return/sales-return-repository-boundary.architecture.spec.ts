import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * T014 (SPEC-T014-SALES-RETURN-EXCHANGE-001 §16, Decision AD42) — không module nào ngoài
 * `sales-return` được import `SALES_RETURN_REPOSITORY`/`ISalesReturnRepository`; và
 * `sales-return` chính nó không được import repository token của module khác (INVOICE_REPOSITORY/
 * PAYMENT_REPOSITORY/INVENTORY_REPOSITORY/CUSTOMER_REPOSITORY) — chỉ được gọi qua Domain
 * Service/Application Service tương ứng.
 *
 * Decision AD46 (Phase 3): chỉ layer REPOSITORY (`infrastructure/persistence/`) bị cấm gọi
 * `InventoryDomainService` — layer Application Service (`application/sales-return.service.ts`)
 * ĐƯỢC PHÉP và ĐƯỢC KỲ VỌNG gọi (đó chính là mục đích của AD46: Application Service sở hữu
 * transaction, Repository chỉ tham gia). Bài test dưới đây do đó chỉ quét thư mục
 * `infrastructure/persistence/`, không quét toàn bộ module.
 */
describe('Architecture: Sales Return Repository Boundary (SPEC-T014-SALES-RETURN-EXCHANGE-001)', () => {
  const modulesRoot = join(__dirname, '..');
  const salesReturnModuleDir = join(__dirname);

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

  function filesOutsideSalesReturnModule(): string[] {
    return collectTsFiles(modulesRoot).filter(
      (file) => !file.startsWith(salesReturnModuleDir),
    );
  }

  function filesInsideSalesReturnModule(): string[] {
    return collectTsFiles(salesReturnModuleDir);
  }

  function filesInRepositoryLayer(): string[] {
    return collectTsFiles(
      join(salesReturnModuleDir, 'infrastructure', 'persistence'),
    );
  }

  it('không module nào ngoài sales-return import SALES_RETURN_REPOSITORY hoặc ISalesReturnRepository', () => {
    const TOKEN_PATTERN =
      /\bSALES_RETURN_REPOSITORY\b|\bISalesReturnRepository\b/;
    const violations: string[] = [];
    for (const file of filesOutsideSalesReturnModule()) {
      const content = readFileSync(file, 'utf-8');
      if (TOKEN_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('sales-return không import repository token/interface của module khác (chỉ được qua Domain Service)', () => {
    const FOREIGN_REPOSITORY_PATTERN =
      /\bINVOICE_REPOSITORY\b|\bIInvoiceRepository\b|\bPAYMENT_REPOSITORY\b|\bIPaymentRepository\b|\bINVENTORY_REPOSITORY\b|\bIInventoryRepository\b|\bCUSTOMER_REPOSITORY\b|\bICustomerRepository\b|\bPRODUCT_REPOSITORY\b|\bIProductRepository\b/;
    const violations: string[] = [];
    for (const file of filesInsideSalesReturnModule()) {
      const content = readFileSync(file, 'utf-8');
      if (FOREIGN_REPOSITORY_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('Repository layer (infrastructure/persistence) không import InventoryDomainService (Decision AD46)', () => {
    // Chỉ kiểm tra IMPORT thật (không bắt nhầm nhắc tới tên lớp trong doc comment giải thích
    // Decision AD46 — cùng gotcha grep-word-boundary đã ghi nhận ở các Architecture Test khác).
    // Chỉ quét layer Repository — Application Service (sales-return.service.ts) ĐƯỢC PHÉP gọi
    // InventoryDomainService, đó chính là mục đích của AD46.
    const IMPORT_PATTERN = /^\s*import[^;]*InventoryDomainService[^;]*;/m;
    const violations: string[] = [];
    for (const file of filesInRepositoryLayer()) {
      const content = readFileSync(file, 'utf-8');
      if (IMPORT_PATTERN.test(content)) {
        violations.push(relative(modulesRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('SalesReturnModule không export SALES_RETURN_REPOSITORY', () => {
    const content = readFileSync(
      join(salesReturnModuleDir, 'sales-return.module.ts'),
      'utf-8',
    );
    const exportsMatch = content.match(/exports:\s*\[([^\]]*)\]/);
    expect(exportsMatch).not.toBeNull();
    expect(exportsMatch![1]).not.toContain('SALES_RETURN_REPOSITORY');
  });
});

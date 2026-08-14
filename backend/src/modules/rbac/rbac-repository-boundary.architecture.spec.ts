import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { RbacModule } from './rbac.module';
import { OrganizationModule } from '../organization/organization.module';

/**
 * T052.03B — Architecture Verification cho quyết định "ARCHITECT DECISION — T052.03B MODULE
 * DEPENDENCY CONFLICT ROUND 2, Q4 APPROVED": RBAC cần đọc `Organization.ownerUserId` để thực thi
 * owner-lockout safety invariant, nhưng KHÔNG được `RbacModule -> OrganizationModule` — làm vậy sẽ
 * tái tạo chu trình `RbacModule -> OrganizationModule -> AuthModule -> RbacModule` bị phát hiện ở
 * P1 (xem báo cáo "T052.03B — MODULE DEPENDENCY CONFLICT, ROUND 2"). Giải pháp: một "RBAC POLICY
 * READ PORT" hẹp trên `IRoleRepository`/`PrismaRoleRepository` — đọc trực tiếp bảng `Organization`,
 * KHÔNG import `OrganizationModule`, KHÔNG inject `ORGANIZATION_REPOSITORY`.
 *
 * Đúng mẫu `barcode-repository-boundary.architecture.spec.ts` (T009) /
 * `customer-repository-boundary.architecture.spec.ts` (T011) — static source-analysis, không cần
 * DB thật. Việc chứng minh runtime DI graph (không có circular dependency) là bài kiểm tra RIÊNG
 * (`Test.createTestingModule({ imports: [AppModule] }).compile()`), không lặp lại ở đây.
 */
describe('Architecture: RBAC Repository Boundary (T052.03B)', () => {
  const rbacModuleDir = join(__dirname);

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

  /**
   * Strips `/** ... *\/` and `// ...` comments before pattern-matching source, so doc comments
   * that merely EXPLAIN why a dependency is avoided (as this file's own edited source does) don't
   * false-positive as an actual violation. Only real code (import statements, `@Inject(...)`,
   * identifier usage) should trip these checks.
   */
  function stripComments(content: string): string {
    return content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  // Q4 — RbacModule KHÔNG được import OrganizationModule (đây chính là chu trình bị từ chối ở P1).
  it('RbacModule không import OrganizationModule', () => {
    expect(importsOf(RbacModule)).not.toContain(OrganizationModule);
  });

  // Q4 — không file nào trong modules/rbac/** import OrganizationModule (đối chiếu trên source đã
  // strip comment — doc comment giải thích lý do TRÁNH dependency này không tính là vi phạm).
  it('không file nào trong modules/rbac/** import OrganizationModule', () => {
    const violations: string[] = [];
    for (const file of collectTsFiles(rbacModuleDir)) {
      const content = stripComments(readFileSync(file, 'utf-8'));
      if (/OrganizationModule/.test(content)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  // Q4 — RbacService/RbacModule không inject ORGANIZATION_REPOSITORY/IOrganizationRepository —
  // owner lookup đi qua ROLE_REPOSITORY (PrismaRoleRepository), không qua repository của Organization.
  it('không file nào trong modules/rbac/** inject ORGANIZATION_REPOSITORY hoặc IOrganizationRepository', () => {
    const ORGANIZATION_REPOSITORY_TOKEN_PATTERN =
      /\bORGANIZATION_REPOSITORY\b|\bIOrganizationRepository\b/;
    const violations: string[] = [];
    for (const file of collectTsFiles(rbacModuleDir)) {
      const content = stripComments(readFileSync(file, 'utf-8'));
      if (ORGANIZATION_REPOSITORY_TOKEN_PATTERN.test(content)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  // Standing prohibition (round-1 P1 approval AND round-2 Q4 decision) — không forwardRef() ở đâu
  // trong modules/rbac/** hoặc organization.module.ts/auth.module.ts (3 module trong chu trình cũ).
  it('không dùng forwardRef() trong rbac/** hoặc organization.module.ts/auth.module.ts', () => {
    const filesToCheck = [
      ...collectTsFiles(rbacModuleDir),
      join(rbacModuleDir, '..', 'organization', 'organization.module.ts'),
      join(rbacModuleDir, '..', 'auth', 'auth.module.ts'),
    ];
    for (const file of filesToCheck) {
      const content = readFileSync(file, 'utf-8');
      expect(content.includes('forwardRef')).toBe(false);
    }
  });

  // Q4 §2-4 — PrismaRoleRepository chỉ đọc (findUnique), không bao giờ ghi (create/update/delete/
  // upsert) lên bảng `organization`, và chỉ select `ownerUserId` — không đọc field nào khác của
  // Organization aggregate (settings/subscription/branches/status/...).
  it('PrismaRoleRepository chỉ đọc read-only Organization.ownerUserId, không mutate Organization', () => {
    const content = readFileSync(
      join(rbacModuleDir, 'infrastructure', 'prisma-role.repository.ts'),
      'utf-8',
    );
    const organizationWriteVerbs =
      /this\.prisma\.organization\.(create|update|upsert|delete|updateMany|deleteMany)/;
    expect(organizationWriteVerbs.test(content)).toBe(false);

    const organizationReadCallCount = (
      content.match(/this\.prisma\.organization\.findUnique/g) ?? []
    ).length;
    expect(organizationReadCallCount).toBe(1);

    const findOrganizationOwnerUserIdMatch = content.match(
      /async findOrganizationOwnerUserId\([\s\S]*?\n {2}\}/,
    );
    expect(findOrganizationOwnerUserIdMatch).not.toBeNull();
    const methodBody = findOrganizationOwnerUserIdMatch![0];
    expect(methodBody).toContain('select: { ownerUserId: true }');
  });
});

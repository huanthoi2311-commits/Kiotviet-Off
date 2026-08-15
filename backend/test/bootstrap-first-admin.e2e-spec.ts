import { execFileSync } from 'child_process';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';
import { AppModule } from '../src/app.module';
import {
  buildDatabaseUrl,
  parseDatabaseUrl,
} from '../src/modules/platform/backup/pg-connection-url';
import { seedPermissionCatalog } from '../src/modules/platform/bootstrap/permission-catalog-seeder';
import {
  FirstAdminInitializationInput,
  initializeFirstAdmin,
} from '../src/modules/platform/bootstrap/first-admin-initializer';

/**
 * T051.08D §10 — CHỨNG MINH THẬT trên Postgres THẬT, database RIÊNG BIỆT/cô lập (không dùng chung
 * database với các *.e2e-spec.ts khác trong cùng CI job — cần khẳng định "fresh database, chưa có
 * Organization nào" đúng nghĩa đen, điều các spec khác chạy `--runInBand` chung 1 DB không đảm bảo
 * được). Tái hiện ĐÚNG trình tự bring-up thật (`docker-compose.yml` service `bring-up`):
 * `prisma migrate deploy` → `seedPermissionCatalog()` (SPEC-T022A) → `initializeFirstAdmin()`
 * (SPEC-T022B1 + T051.08D) → khởi động AppModule thật trỏ vào ĐÚNG database đó → gọi HTTP thật
 * `GET /organizations/current`.
 *
 * Chứng minh 2 việc §10 yêu cầu: (1) bootstrap mới hoàn toàn tạo đủ Organization+Settings+
 * Subscription, current-org trả 200; (2) tổ chức bootstrap từ TRƯỚC T051.08D (thiếu Settings/
 * Subscription) được TỰ VÁ khi bootstrap chạy lại, current-org cũng trả 200.
 *
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker/PostgreSQL) — cùng giới hạn với các
 * *.e2e-spec.ts khác trong repo. Chạy trong CI qua `npm run test:e2e` (job "E2E (Postgres + Redis
 * thật)"). Thời gian chạy dài hơn các spec khác (tạo database mới + chạy migration thật) — timeout
 * riêng cho từng `it()`.
 */
describe('Bootstrap First-Admin — T051.08D (e2e, integration — Postgres thật, database riêng)', () => {
  const sourceDatabaseUrl = process.env.DATABASE_URL as string;
  const connection = parseDatabaseUrl(sourceDatabaseUrl);
  const freshDatabase = `pos_erp_bootstrap_it_${Date.now()}`;
  const freshDatabaseUrl = buildDatabaseUrl(connection, freshDatabase);
  const backendRoot = join(__dirname, '..');

  const validInput: FirstAdminInitializationInput = {
    organization: {
      code: 'ORG000001',
      displayName: 'Bootstrap IT Org',
      slug: `bootstrap-it-${Date.now()}`,
    },
    branch: { code: 'BR000001', name: 'Chi nhánh chính' },
    administrator: {
      username: 'bootstrap-it-owner',
      email: 'bootstrap-it-owner@pos-erp.local',
      password: 'a-genuinely-unique-strong-password-2026',
      fullName: 'Bootstrap IT Owner',
    },
  };

  let maintenanceClient: PrismaClient;
  let freshPrisma: PrismaClient;
  let app: INestApplication<App>;
  let ownerToken: string;
  let createdOrganizationId: string;

  beforeAll(async () => {
    maintenanceClient = new PrismaClient({
      datasources: { db: { url: buildDatabaseUrl(connection, 'postgres') } },
    });
    const safeIdentifier = freshDatabase.replace(/"/g, '""');
    await maintenanceClient.$executeRawUnsafe(
      `CREATE DATABASE "${safeIdentifier}"`,
    );

    // Trình tự THẬT giống hệt `npm run prisma:production-bring-up` — chạy `prisma migrate deploy`
    // như 1 process con TRỎ VÀO database mới (KHÔNG đổi `process.env.DATABASE_URL` của chính worker
    // Jest này ở bước này — chỉ override cho process con).
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: backendRoot,
      env: { ...process.env, DATABASE_URL: freshDatabaseUrl },
      stdio: 'inherit',
    });

    freshPrisma = new PrismaClient({
      datasources: { db: { url: freshDatabaseUrl } },
    });
    await freshPrisma.$connect();
  }, 120_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await freshPrisma?.$disconnect();
    const safeIdentifier = freshDatabase.replace(/"/g, '""');
    try {
      await maintenanceClient.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${safeIdentifier}"`,
      );
    } finally {
      await maintenanceClient.$disconnect();
    }
  }, 60_000);

  it('[10a] fresh bootstrap: tạo đủ Organization+Settings+Subscription (đúng organizationId), xác thực → GET /organizations/current = 200', async () => {
    await seedPermissionCatalog(freshPrisma);

    const result = await initializeFirstAdmin(freshPrisma, validInput);
    expect(result.outcome).toBe('CREATED');
    if (result.outcome !== 'CREATED') {
      throw new Error('expected CREATED outcome');
    }
    createdOrganizationId = result.organizationId;

    // Query DB THẬT trực tiếp — không qua lại chính hàm vừa test.
    const organization = await freshPrisma.organization.findUnique({
      where: { id: result.organizationId },
    });
    const settings = await freshPrisma.organizationSettings.findUnique({
      where: { organizationId: result.organizationId },
    });
    const subscription = await freshPrisma.organizationSubscription.findUnique({
      where: { organizationId: result.organizationId },
    });
    expect(organization).not.toBeNull();
    expect(settings).not.toBeNull();
    expect(settings?.organizationId).toBe(result.organizationId);
    expect(subscription).not.toBeNull();
    expect(subscription?.organizationId).toBe(result.organizationId);
    // T053.02 CASE 9 — thêm OrganizationPlan.TRIAL vào enum KHÔNG được tự ý biến bootstrap thành
    // TRIAL — `first-admin-initializer.ts` không hề đổi, subscription vẫn phải là FREE (mặc định
    // schema), mọi giới hạn vẫn null (D3: FREE giữ nguyên hành vi cũ).
    expect(subscription?.plan).toBe('FREE');
    expect(subscription?.maxUser).toBeNull();

    // Khởi động AppModule THẬT trỏ vào ĐÚNG database vừa bootstrap — PrismaService đọc
    // process.env.DATABASE_URL lúc construct (không nhận override qua constructor), nên phải đổi
    // tạm biến môi trường TRƯỚC KHI compile module, rồi khôi phục lại ngay sau đó (an toàn vì
    // `test:e2e` chạy `--runInBand`: các *.e2e-spec.ts khác chỉ bắt đầu SAU KHI toàn bộ hook của
    // file này, kể cả afterAll, chạy xong tuần tự — không có race giữa các file).
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = freshDatabaseUrl;
    let moduleFixture: TestingModule;
    try {
      moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
    } finally {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    app = await createE2eApp(moduleFixture);

    const jwtService = app.get(JwtService);
    const owner = await freshPrisma.user.findUniqueOrThrow({
      where: { id: result.userId },
    });
    const permissions = await freshPrisma.permission.findMany();
    ownerToken = jwtService.sign({
      sub: owner.id,
      organizationId: result.organizationId,
      branchId: result.branchId,
      email: owner.email,
      permissions: permissions.map((p) => p.code),
      permissionVersion: owner.permissionVersion,
      isPlatformAdmin: false,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.data.id).toBe(result.organizationId);
  }, 120_000);

  it('[10b] repair: tổ chức bootstrap từ TRƯỚC T051.08D (thiếu Settings/Subscription) được tự vá khi bootstrap chạy lại → GET /organizations/current = 200', async () => {
    // Mô phỏng deployment cũ: xoá 2 bảng đồng hành, giữ nguyên Organization/Branch/User/Role —
    // đúng trạng thái mà bootstrap Phase 1 (trước T051.08D) để lại.
    await freshPrisma.organizationSettings.deleteMany({
      where: { organizationId: createdOrganizationId },
    });
    await freshPrisma.organizationSubscription.deleteMany({
      where: { organizationId: createdOrganizationId },
    });

    const result = await initializeFirstAdmin(freshPrisma, validInput);
    expect(result.outcome).toBe('ALREADY_INITIALIZED');
    if (result.outcome !== 'ALREADY_INITIALIZED') {
      throw new Error('expected ALREADY_INITIALIZED outcome');
    }
    expect(result.organizationId).toBe(createdOrganizationId);
    expect(result.companionsRepaired).toBe(true);

    const settings = await freshPrisma.organizationSettings.findUnique({
      where: { organizationId: createdOrganizationId },
    });
    const subscription = await freshPrisma.organizationSubscription.findUnique({
      where: { organizationId: createdOrganizationId },
    });
    expect(settings).not.toBeNull();
    expect(subscription).not.toBeNull();

    // ownerToken/app còn nguyên từ test [10a] (cùng describe, cùng database) — chính token/JWT đó
    // trước đây từng nhận 200; xác nhận sau khi vá, current-org VẪN trả 200 (không cần đăng nhập
    // lại — chứng minh sửa chữa có hiệu lực ngay, không cần thao tác gì thêm từ người dùng).
    const res = await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.data.id).toBe(createdOrganizationId);
  }, 60_000);
});

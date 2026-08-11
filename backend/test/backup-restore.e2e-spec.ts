import { existsSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { runBackup } from '../src/modules/platform/backup/backup-runner';
import {
  buildDatabaseUrl,
  parseDatabaseUrl,
} from '../src/modules/platform/backup/pg-connection-url';
import {
  RestoreTargetExistsError,
  runRestore,
} from '../src/modules/platform/backup/restore-runner';
import { verifyRestore } from '../src/modules/platform/backup/restore-verifier';

/**
 * T051.03 §19-§20 — CHỨNG MINH THẬT: backup → restore vào database MỚI/cô lập → verify, chạy
 * pg_dump/pg_restore THẬT (mode='direct', binary có sẵn trên CI runner qua postgresql-client)
 * chống lại Postgres THẬT (service container của CI). KHÔNG mock pg_dump/pg_restore ở đây — spec
 * này CHÍNH LÀ bằng chứng restore thật; các unit test khác (backup-runner.spec.ts,
 * restore-runner.spec.ts, restore-verifier.spec.ts) chỉ chứng minh logic điều phối/xử lý lỗi
 * bằng test double, không thay thế được bằng chứng này (§19: "Do not call a mocked pg_dump test
 * a restore proof").
 *
 * KHÔNG tự chạy được trong sandbox này (thiếu Docker/PostgreSQL client) — cùng giới hạn với các
 * *.e2e-spec.ts khác trong repo. Chạy trong CI qua `npm run test:e2e` (job "E2E (Postgres + Redis
 * thật)"), sau bước cài postgresql-client.
 */
describe('Backup/Restore Module (e2e, integration — pg_dump/pg_restore thật)', () => {
  const databaseUrl = process.env.DATABASE_URL as string;
  const connection = parseDatabaseUrl(databaseUrl);
  const targetDatabase = `pos_erp_restore_it_${Date.now()}`;

  let backupDir: string;
  let prisma: PrismaClient;
  let backupFilePath: string;

  beforeAll(async () => {
    backupDir = await mkdtemp(join(tmpdir(), 'backup-restore-it-'));
    prisma = new PrismaClient();
    await prisma.$connect();

    // Seed 1 dòng đại diện, đủ để row-count comparison có ý nghĩa (không phụ thuộc dữ liệu do
    // các *.e2e-spec.ts khác để lại — test này chỉ cần organizations có ít nhất 1 dòng ở CẢ HAI
    // phía nguồn/restore và khớp nhau).
    await prisma.organization.upsert({
      where: { slug: 'backup-restore-it' },
      create: {
        code: 'BACKUP-IT',
        displayName: 'Backup Restore IT Org',
        slug: 'backup-restore-it',
      },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await rm(backupDir, { recursive: true, force: true });

    // Dọn dẹp best-effort database đích nếu còn sót lại (test giữa chừng thất bại).
    const maintenanceClient = new PrismaClient({
      datasources: { db: { url: buildDatabaseUrl(connection, 'postgres') } },
    });
    try {
      const safeIdentifier = targetDatabase.replace(/"/g, '""');
      await maintenanceClient.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${safeIdentifier}"`,
      );
    } finally {
      await maintenanceClient.$disconnect();
    }
  });

  it('backup → verify artifact (pg_restore --list) → restore vào DB MỚI → verify restore → row-count khớp nguồn', async () => {
    // 1. BACKUP thật.
    const backupResult = await runBackup({
      connection,
      backupDir,
      mode: 'direct',
    });
    backupFilePath = backupResult.filePath;

    expect(existsSync(backupResult.filePath)).toBe(true);
    expect(backupResult.sizeBytes).toBeGreaterThan(0);
    // §9 — verify (pg_restore --list) đã chạy BÊN TRONG runBackup(); nếu nó fail, runBackup()
    // đã throw và test này không tới được đây — file tồn tại + không throw = verify đã pass.

    // 2. RESTORE thật vào database MỚI, cô lập — không đụng tới database nguồn đang chạy.
    const restoreResult = await runRestore({
      connection,
      backupFilePath: backupResult.filePath,
      targetDatabase,
      mode: 'direct',
    });
    expect(restoreResult.targetDatabase).toBe(targetDatabase);

    // 3. VERIFY thật: kết nối, _prisma_migrations, bảng trọng yếu, so sánh row-count nguồn↔đích.
    const verification = await verifyRestore({
      connection: { ...connection, database: targetDatabase },
      sourceConnection: connection,
    });

    expect(verification.connected).toBe(true);
    expect(verification.migrationsTableExists).toBe(true);
    expect(verification.migrationsCount).toBeGreaterThan(0);
    expect(verification.allCriticalTablesPresent).toBe(true);

    const organizationsComparison = verification.rowCountComparison?.find(
      (c) => c.table === 'organizations',
    );
    expect(organizationsComparison?.restoredCount).toBeGreaterThan(0);
    expect(organizationsComparison?.matches).toBe(true);

    for (const comparison of verification.rowCountComparison ?? []) {
      expect(comparison.matches).toBe(true);
    }
  }, 120_000);

  it('restore từ chối ghi đè database đích đã tồn tại (an toàn theo thiết kế)', async () => {
    // targetDatabase đã được tạo bởi test trước trong file này (chạy tuần tự) — thử restore lại
    // CÙNG tên phải bị từ chối, không được âm thầm ghi đè.
    await expect(
      runRestore({
        connection,
        backupFilePath,
        targetDatabase,
        mode: 'direct',
      }),
    ).rejects.toThrow(RestoreTargetExistsError);
  }, 60_000);
});

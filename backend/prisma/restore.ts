import { parseDatabaseUrl } from '../src/modules/platform/backup/pg-connection-url';
import type { PgToolMode } from '../src/modules/platform/backup/pg-tool-invocation';
import { runRestore } from '../src/modules/platform/backup/restore-runner';

/**
 * T051.03 — CLI restore PostgreSQL (pg_restore, LUÔN vào database MỚI/cô lập, không bao giờ ghi
 * đè database có sẵn — xem docs/release/BACKUP-RESTORE-RUNBOOK.md). Gọi qua:
 *   npm run ops:restore -- <đường-dẫn-file-backup> <tên-database-đích>
 *
 * Biến môi trường:
 *   DATABASE_URL             dùng để lấy host/port/user/password của SERVER (phần database bị
 *                             bỏ qua — CREATE DATABASE tự nối vào database bảo trì "postgres").
 *   BACKUP_MODE               'docker-compose' (mặc định) | 'direct'.
 *   DOCKER_COMPOSE_SERVICE    tên service Postgres trong docker-compose.yml (mặc định "postgres").
 *   RESTORE_TIMEOUT_MS        timeout cho pg_restore (mặc định 15 phút).
 */
async function main(): Promise<void> {
  const [backupFilePath, targetDatabase] = process.argv.slice(2);
  if (!backupFilePath || !targetDatabase) {
    console.error(
      'Cách dùng: npm run ops:restore -- <đường-dẫn-file-backup> <tên-database-đích>',
    );
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('✗ DATABASE_URL chưa được set — không thể restore.');
    process.exitCode = 1;
    return;
  }

  let connection: ReturnType<typeof parseDatabaseUrl>;
  try {
    connection = parseDatabaseUrl(databaseUrl);
  } catch (error) {
    console.error(`✗ ${(error as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const mode =
    (process.env.BACKUP_MODE as PgToolMode | undefined) ?? 'docker-compose';
  const dockerComposeService = process.env.DOCKER_COMPOSE_SERVICE;
  const timeoutMs = process.env.RESTORE_TIMEOUT_MS
    ? Number(process.env.RESTORE_TIMEOUT_MS)
    : undefined;

  console.log(
    `Bắt đầu restore "${backupFilePath}" vào database MỚI "${targetDatabase}" (mode=${mode})...`,
  );

  try {
    const result = await runRestore({
      connection,
      backupFilePath,
      targetDatabase,
      mode,
      dockerComposeService,
      timeoutMs,
    });
    console.log(
      `✓ Restore thành công vào database "${result.targetDatabase}".`,
    );
    if (result.stderr.trim()) {
      console.log(
        `  pg_restore stderr (không fatal, exit code 0):\n${result.stderr}`,
      );
    }
    console.log(
      `  Tiếp theo: chạy \`npm run ops:verify-restore -- ${result.targetDatabase}\` để xác nhận.`,
    );
  } catch (error) {
    console.error(`✗ Restore thất bại: ${(error as Error).message}`);
    const stderr = (error as { stderr?: string }).stderr;
    if (stderr) {
      console.error(`  pg_restore stderr:\n${stderr}`);
    }
    process.exitCode = 1;
  }
}

main();

// Import cho side-effect: `@prisma/client` tự nạp `.env` khi import lần đầu (đã xác nhận qua
// thực nghiệm trong quá trình phát triển T051.03) — phải import TRƯỚC khi đọc process.env.DATABASE_URL.
import '@prisma/client';
import { join } from 'path';
import { runBackup } from '../src/modules/platform/backup/backup-runner';
import { parseDatabaseUrl } from '../src/modules/platform/backup/pg-connection-url';
import type { PgToolMode } from '../src/modules/platform/backup/pg-tool-invocation';
import { DEFAULT_RETENTION_COUNT } from '../src/modules/platform/backup/retention-policy';

/**
 * T051.03 — CLI backup PostgreSQL (pg_dump custom format). Gọi qua `npm run ops:backup`.
 * Biến môi trường:
 *   BACKUP_DIR              thư mục lưu backup (mặc định "./backups", tương đối cwd lúc chạy).
 *   BACKUP_MODE              'docker-compose' (mặc định — khớp triển khai local đã duyệt AD01/AD02,
 *                             gọi qua `docker compose exec`) hoặc 'direct' (binary pg_dump có sẵn
 *                             trên PATH — dùng khi CI/máy đã cài PostgreSQL client).
 *   BACKUP_RETENTION_COUNT   số bản backup giữ lại sau mỗi lần chạy thành công (mặc định 7).
 *   DOCKER_COMPOSE_SERVICE   tên service Postgres trong docker-compose.yml (mặc định "postgres").
 *   BACKUP_TIMEOUT_MS        timeout cho pg_dump/pg_restore --list (mặc định 10 phút).
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('✗ DATABASE_URL chưa được set — không thể backup.');
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

  const backupDir = process.env.BACKUP_DIR ?? join(process.cwd(), 'backups');
  const mode =
    (process.env.BACKUP_MODE as PgToolMode | undefined) ?? 'docker-compose';
  const keepCount = process.env.BACKUP_RETENTION_COUNT
    ? Number(process.env.BACKUP_RETENTION_COUNT)
    : DEFAULT_RETENTION_COUNT;
  const dockerComposeService = process.env.DOCKER_COMPOSE_SERVICE;
  const timeoutMs = process.env.BACKUP_TIMEOUT_MS
    ? Number(process.env.BACKUP_TIMEOUT_MS)
    : undefined;

  console.log(
    `Bắt đầu backup database "${connection.database}" (mode=${mode}, thư mục=${backupDir}, giữ lại ${keepCount} bản)...`,
  );

  try {
    const result = await runBackup({
      connection,
      backupDir,
      mode,
      keepCount,
      dockerComposeService,
      timeoutMs,
    });
    console.log(
      `✓ Backup thành công: ${result.filePath} (${result.sizeBytes} bytes)`,
    );
    if (result.deletedOldBackups.length > 0) {
      console.log(
        `  Đã xoá ${result.deletedOldBackups.length} bản backup cũ theo retention policy: ${result.deletedOldBackups.join(', ')}`,
      );
    }
  } catch (error) {
    console.error(`✗ Backup thất bại: ${(error as Error).message}`);
    const stderr = (error as { stderr?: string }).stderr;
    if (stderr) {
      console.error(`  pg_dump stderr:\n${stderr}`);
    }
    process.exitCode = 1;
  }
}

main();

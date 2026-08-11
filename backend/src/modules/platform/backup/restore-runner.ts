import { createReadStream, existsSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { buildDatabaseUrl, PgConnection } from './pg-connection-url';
import { runPgTool } from './pg-process-runner';
import { buildPgToolInvocation, PgToolMode } from './pg-tool-invocation';

/** Database bảo trì mặc định của mọi cluster Postgres — dùng để CREATE/DROP DATABASE khác. */
const MAINTENANCE_DATABASE = 'postgres';
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 phút — restore thường chậm hơn dump.

export interface RestoreOptions {
  /** Connection trỏ tới server (database field bị bỏ qua — CREATE DATABASE tự dùng database bảo trì). */
  connection: PgConnection;
  backupFilePath: string;
  targetDatabase: string;
  mode: PgToolMode;
  timeoutMs?: number;
  dockerComposeService?: string;
  runTool?: typeof runPgTool;
  /** Injection cho unit test — mặc định tạo PrismaClient thật. */
  createMaintenanceClient?: (databaseUrl: string) => PrismaClient;
}

export interface RestoreResult {
  targetDatabase: string;
  stderr: string;
}

export class RestoreTargetExistsError extends Error {
  constructor(readonly targetDatabase: string) {
    super(
      `Database đích "${targetDatabase}" đã tồn tại — T051.03 KHÔNG restore đè lên database có sẵn ` +
        `(an toàn theo thiết kế: luôn restore vào database MỚI/cô lập trước, xem docs/release/BACKUP-RESTORE-RUNBOOK.md). ` +
        `Hãy chọn tên database đích khác, hoặc tự xoá database cũ (thao tác thủ công, có chủ đích) trước khi thử lại.`,
    );
    this.name = 'RestoreTargetExistsError';
  }
}

export class BackupFileNotFoundError extends Error {
  constructor(readonly filePath: string) {
    super(`Không tìm thấy file backup: ${filePath}`);
    this.name = 'BackupFileNotFoundError';
  }
}

export class RestoreFailedError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'RestoreFailedError';
  }
}

/**
 * T051.03 §10 — Restore LUÔN vào một database MỚI, cô lập (`CREATE DATABASE`), KHÔNG BAO GIỜ ghi
 * đè một database đang tồn tại. Nếu `pg_restore` thất bại, database đích vừa tạo bị DROP lại
 * (rollback) — không để lại một database "trông có vẻ restore xong" nhưng thực ra dở dang.
 */
export async function runRestore(
  options: RestoreOptions,
): Promise<RestoreResult> {
  const {
    connection,
    backupFilePath,
    targetDatabase,
    mode,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    dockerComposeService,
    runTool = runPgTool,
    createMaintenanceClient = (url: string) =>
      new PrismaClient({ datasources: { db: { url } } }),
  } = options;

  if (!existsSync(backupFilePath)) {
    throw new BackupFileNotFoundError(backupFilePath);
  }

  const maintenanceUrl = buildDatabaseUrl(connection, MAINTENANCE_DATABASE);
  const maintenanceClient = createMaintenanceClient(maintenanceUrl);

  try {
    const existing = await maintenanceClient.$queryRawUnsafe<
      { exists: boolean }[]
    >(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
      targetDatabase,
    );
    if (existing[0]?.exists) {
      throw new RestoreTargetExistsError(targetDatabase);
    }

    // Tên database không nhận tham số bind được trong DDL — nhưng targetDatabase đã được kiểm
    // tra tồn tại qua query có bind ở trên, và §10 giới hạn caller ở script vận hành nội bộ
    // (không nhận input từ HTTP), nên rủi ro injection ở đây tương đương các script CLI khác
    // trong `backend/prisma/*.ts`. Vẫn escape dấu ngoặc kép để an toàn hơn.
    const safeIdentifier = targetDatabase.replace(/"/g, '""');
    await maintenanceClient.$executeRawUnsafe(
      `CREATE DATABASE "${safeIdentifier}"`,
    );
  } finally {
    await maintenanceClient.$disconnect();
  }

  const restoreInvocation = buildPgToolInvocation({
    tool: 'pg_restore',
    mode,
    connection: { ...connection, database: targetDatabase },
    toolArgs: ['--no-owner', '--no-privileges', '--exit-on-error'],
    dockerComposeService,
  });

  let restoreResult: Awaited<ReturnType<typeof runPgTool>>;
  try {
    restoreResult = await runTool({
      invocation: restoreInvocation,
      stdin: createReadStream(backupFilePath),
      timeoutMs,
    });
  } catch (error) {
    await dropDatabase(createMaintenanceClient(maintenanceUrl), targetDatabase);
    throw new RestoreFailedError(
      `Không khởi chạy được pg_restore: ${(error as Error).message}`,
      '',
    );
  }

  if (restoreResult.exitCode !== 0 || restoreResult.timedOut) {
    await dropDatabase(createMaintenanceClient(maintenanceUrl), targetDatabase);
    const reason = restoreResult.timedOut
      ? `timeout sau ${timeoutMs}ms`
      : `exit code ${restoreResult.exitCode}`;
    throw new RestoreFailedError(
      `pg_restore thất bại (${reason}). Database đích "${targetDatabase}" đã bị rollback (DROP) — không để lại restore dở dang.`,
      restoreResult.stderr,
    );
  }

  return { targetDatabase, stderr: restoreResult.stderr };
}

async function dropDatabase(
  client: PrismaClient,
  database: string,
): Promise<void> {
  try {
    const safeIdentifier = database.replace(/"/g, '""');
    await client.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS "${safeIdentifier}"`,
    );
  } finally {
    await client.$disconnect();
  }
}

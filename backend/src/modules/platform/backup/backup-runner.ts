import { createReadStream, existsSync } from 'fs';
import { mkdir, open, readdir, rename, rm, stat } from 'fs/promises';
import { join } from 'path';
import type { Writable } from 'stream';
import { buildBackupFilename, parseBackupFilename } from './backup-filename';
import type { PgConnection } from './pg-connection-url';
import { runPgTool } from './pg-process-runner';
import { buildPgToolInvocation, PgToolMode } from './pg-tool-invocation';
import {
  DEFAULT_RETENTION_COUNT,
  RetentionCandidate,
  selectBackupsToDelete,
} from './retention-policy';

export interface BackupOptions {
  connection: PgConnection;
  backupDir: string;
  mode: PgToolMode;
  keepCount?: number;
  timeoutMs?: number;
  now?: Date;
  dockerComposeService?: string;
  /** Injection point cho unit test — mặc định dùng runPgTool thật (spawn thật). */
  runTool?: typeof runPgTool;
}

export interface BackupResult {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  deletedOldBackups: string[];
}

export class BackupFailedError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'BackupFailedError';
  }
}

export class BackupVerificationFailedError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'BackupVerificationFailedError';
  }
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 phút — đủ cho DB single-PC quy mô V1.

/**
 * T051.03 §6-§9 — Tạo 1 bản backup pg_dump (custom format -Fc), verify (file tồn tại + size>0 +
 * `pg_restore --list` đọc được TOC), rồi MỚI áp dụng retention cleanup. Backup lỗi hoặc verify
 * lỗi → KHÔNG đổi tên thành file cuối cùng (giữ nguyên `.partial`, không được advertise là hợp
 * lệ) và KHÔNG xoá bất kỳ backup cũ nào.
 */
export async function runBackup(options: BackupOptions): Promise<BackupResult> {
  const {
    connection,
    backupDir,
    mode,
    keepCount = DEFAULT_RETENTION_COUNT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    now = new Date(),
    dockerComposeService,
    runTool = runPgTool,
  } = options;

  await mkdir(backupDir, { recursive: true });

  const fileName = buildBackupFilename(now);
  const finalPath = join(backupDir, fileName);
  const partialPath = `${finalPath}.partial`;

  if (existsSync(finalPath)) {
    throw new Error(
      `Backup artifact đã tồn tại, KHÔNG được ghi đè: ${finalPath} (kiểm tra đồng hồ hệ thống hoặc chạy lại sau ít nhất 1 giây).`,
    );
  }

  const dumpInvocation = buildPgToolInvocation({
    tool: 'pg_dump',
    mode,
    connection,
    toolArgs: ['-Fc', '--no-password'],
    dockerComposeService,
  });

  // Dùng `fs.promises.open()` (fully awaited) thay vì `createWriteStream()` + chờ event 'open' —
  // loại bỏ HOÀN TOÀN khả năng race giữa việc file thực sự tồn tại trên đĩa và các nhánh lỗi bên
  // dưới gọi `safeRemove()` (event-based 'open' từng để lại `.partial` mồ côi trong CI — event
  // 'open' của WriteStream không đảm bảo thứ tự chặt như một Promise được await trực tiếp).
  const fileHandle = await open(partialPath, 'wx');
  const writeStream = fileHandle.createWriteStream();

  let dumpResult: Awaited<ReturnType<typeof runPgTool>>;
  try {
    dumpResult = await runTool({
      invocation: dumpInvocation,
      stdout: writeStream,
      timeoutMs,
    });
  } catch (error) {
    await closeAndRemove(writeStream, partialPath);
    throw new BackupFailedError(
      `Không khởi chạy được pg_dump (${mode === 'docker-compose' ? 'qua docker compose exec' : 'binary trực tiếp'}): ${(error as Error).message}`,
      '',
    );
  }

  if (dumpResult.exitCode !== 0 || dumpResult.timedOut) {
    await closeAndRemove(writeStream, partialPath);
    const reason = dumpResult.timedOut
      ? `timeout sau ${timeoutMs}ms`
      : `exit code ${dumpResult.exitCode}`;
    throw new BackupFailedError(
      `pg_dump thất bại (${reason}). Backup artifact KHÔNG được tạo.`,
      dumpResult.stderr,
    );
  }

  // §9 — verify tối thiểu: file tồn tại + size > 0 + pg_restore --list đọc được TOC.
  const stats = await stat(partialPath);
  if (stats.size === 0) {
    await closeAndRemove(writeStream, partialPath);
    throw new BackupVerificationFailedError(
      'File backup rỗng (0 byte) sau khi pg_dump báo thành công — coi như lỗi, không advertise là hợp lệ.',
      '',
    );
  }

  const listInvocation = buildPgToolInvocation({
    tool: 'pg_restore',
    mode,
    connection,
    toolArgs: ['--list'],
    dockerComposeService,
  });
  const listResult = await runTool({
    invocation: listInvocation,
    stdin: createReadStream(partialPath),
    timeoutMs,
  });
  if (listResult.exitCode !== 0) {
    await closeAndRemove(writeStream, partialPath);
    throw new BackupVerificationFailedError(
      'pg_restore --list không đọc được file backup vừa tạo — artifact coi như hỏng, KHÔNG advertise là hợp lệ.',
      listResult.stderr,
    );
  }

  // Chỉ đổi tên thành file cuối cùng SAU KHI verify thành công — tránh một tiến trình khác
  // (retention listing, operator) nhìn thấy file "trông giống" backup hợp lệ giữa chừng.
  await rename(partialPath, finalPath);

  const deletedOldBackups = await applyRetention(backupDir, keepCount);

  return {
    filePath: finalPath,
    fileName,
    sizeBytes: stats.size,
    deletedOldBackups,
  };
}

async function applyRetention(
  backupDir: string,
  keepCount: number,
): Promise<string[]> {
  const entries = await readdir(backupDir);
  const candidates: RetentionCandidate[] = entries
    .map((filename) => {
      const createdAt = parseBackupFilename(filename);
      return createdAt ? { filename, createdAt } : null;
    })
    .filter((c): c is RetentionCandidate => c !== null);

  const toDelete = selectBackupsToDelete(candidates, keepCount);
  for (const candidate of toDelete) {
    await safeRemove(join(backupDir, candidate.filename));
  }
  return toDelete.map((c) => c.filename);
}

async function safeRemove(path: string): Promise<void> {
  await rm(path, { force: true });
}

/**
 * `.destroy()` giải phóng file descriptor bên dưới (stream tạo từ FileHandle tự đóng fd khi
 * destroy/finish) TRƯỚC KHI xoá file — thiếu bước này để lại fd rò rỉ tới khi garbage collector
 * dọn (đã bắt được qua cảnh báo "Closing file descriptor on garbage collection" trong CI). An
 * toàn gọi `.destroy()` trên stream đã đóng sẵn (no-op).
 */
async function closeAndRemove(
  writeStream: Writable,
  path: string,
): Promise<void> {
  await new Promise<void>((resolve) => {
    if (writeStream.destroyed) {
      resolve();
      return;
    }
    writeStream.once('close', () => resolve());
    writeStream.destroy();
  });
  await safeRemove(path);
}

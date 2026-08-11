import { mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BackupFailedError,
  BackupVerificationFailedError,
  runBackup,
} from './backup-runner';
import type { PgConnection } from './pg-connection-url';
import type { PgToolRunResult, RunPgToolOptions } from './pg-process-runner';

function mockRunTool(result: PgToolRunResult) {
  return jest
    .fn<Promise<PgToolRunResult>, [RunPgToolOptions]>()
    .mockResolvedValue(result);
}

const connection: PgConnection = {
  host: 'localhost',
  port: 5432,
  database: 'pos_erp',
  user: 'postgres',
  password: 'secret',
};

function makeSuccessfulTool(dumpContent = 'FAKE-CUSTOM-FORMAT-DUMP-BYTES') {
  return jest.fn(
    async (options: RunPgToolOptions): Promise<PgToolRunResult> => {
      if (options.stdout) {
        // Mô phỏng pg_dump: ghi nội dung fake vào file backup.
        await new Promise<void>((resolve, reject) => {
          options.stdout!.write(dumpContent, (err) =>
            err ? reject(err) : resolve(),
          );
        });
        options.stdout.end();
        await new Promise((resolve) => options.stdout!.once('finish', resolve));
      }
      return { exitCode: 0, signal: null, stderr: '', timedOut: false };
    },
  );
}

describe('runBackup', () => {
  let backupDir: string;

  beforeEach(async () => {
    backupDir = await mkdtemp(join(tmpdir(), 'backup-runner-test-'));
  });

  afterEach(async () => {
    await rm(backupDir, { recursive: true, force: true });
  });

  it('tạo file backup thành công: ghi đúng nội dung, verify pg_restore --list, không xoá gì (chưa vượt keepCount)', async () => {
    const runTool = makeSuccessfulTool();
    const now = new Date(Date.UTC(2026, 7, 11, 3, 0, 0));

    const result = await runBackup({
      connection,
      backupDir,
      mode: 'direct',
      now,
      runTool,
    });

    expect(result.fileName).toBe('pos-erp-20260811-030000.dump');
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.deletedOldBackups).toEqual([]);

    const content = await readFile(result.filePath, 'utf-8');
    expect(content).toBe('FAKE-CUSTOM-FORMAT-DUMP-BYTES');

    // 2 lệnh: pg_dump (stdout) + pg_restore --list (stdin).
    expect(runTool).toHaveBeenCalledTimes(2);
    const dumpCall = runTool.mock.calls[0][0];
    expect(dumpCall.invocation.args).toContain('-Fc');
    const listCall = runTool.mock.calls[1][0];
    expect(listCall.invocation.args).toContain('--list');
  });

  it('KHÔNG để lại file .partial hay file cuối cùng nào nếu pg_dump exit non-zero', async () => {
    const runTool = mockRunTool({
      exitCode: 1,
      signal: null,
      stderr: 'pg_dump: connection to server failed',
      timedOut: false,
    });

    await expect(
      runBackup({ connection, backupDir, mode: 'direct', runTool }),
    ).rejects.toThrow(BackupFailedError);

    const files = await readdir(backupDir);
    expect(files).toEqual([]);
  });

  it('lỗi actionable bao gồm stderr của pg_dump khi thất bại', async () => {
    const runTool = mockRunTool({
      exitCode: 1,
      signal: null,
      stderr: 'FATAL: password authentication failed',
      timedOut: false,
    });

    await expect(
      runBackup({ connection, backupDir, mode: 'direct', runTool }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('password authentication failed'),
    });
  });

  it('coi file 0 byte là lỗi verify, không advertise là backup hợp lệ', async () => {
    const runTool = jest.fn(
      async (options: RunPgToolOptions): Promise<PgToolRunResult> => {
        if (options.stdout) {
          options.stdout.end(); // Không ghi byte nào.
          await new Promise((resolve) =>
            options.stdout!.once('finish', resolve),
          );
        }
        return { exitCode: 0, signal: null, stderr: '', timedOut: false };
      },
    );

    await expect(
      runBackup({ connection, backupDir, mode: 'direct', runTool }),
    ).rejects.toThrow(BackupVerificationFailedError);

    const files = await readdir(backupDir);
    expect(files).toEqual([]);
  });

  it('coi pg_restore --list thất bại là lỗi verify, xoá artifact, không đổi tên thành file cuối', async () => {
    const runTool = jest.fn(
      async (options: RunPgToolOptions): Promise<PgToolRunResult> => {
        if (options.stdout) {
          await new Promise<void>((resolve, reject) => {
            options.stdout!.write('corrupt-bytes', (err) =>
              err ? reject(err) : resolve(),
            );
          });
          options.stdout.end();
          await new Promise((resolve) =>
            options.stdout!.once('finish', resolve),
          );
          return { exitCode: 0, signal: null, stderr: '', timedOut: false };
        }
        // Lệnh pg_restore --list.
        return {
          exitCode: 1,
          signal: null,
          stderr:
            'pg_restore: error: input file does not appear to be a valid archive',
          timedOut: false,
        };
      },
    );

    await expect(
      runBackup({ connection, backupDir, mode: 'direct', runTool }),
    ).rejects.toThrow(BackupVerificationFailedError);

    const files = await readdir(backupDir);
    expect(files).toEqual([]);
  });

  it('không ghi đè artifact đã tồn tại — ném lỗi trước khi gọi pg_dump', async () => {
    const now = new Date(Date.UTC(2026, 7, 11, 3, 0, 0));
    await writeFile(
      join(backupDir, 'pos-erp-20260811-030000.dump'),
      'existing',
    );
    const runTool = jest.fn();

    await expect(
      runBackup({ connection, backupDir, mode: 'direct', now, runTool }),
    ).rejects.toThrow('đã tồn tại');
    expect(runTool).not.toHaveBeenCalled();
  });

  it('retention: chỉ giữ lại keepCount bản gần nhất SAU KHI backup mới verify thành công', async () => {
    // 3 backup cũ đã có sẵn trong thư mục (giả lập ngày trước).
    await writeFile(join(backupDir, 'pos-erp-20260808-030000.dump'), 'old-1');
    await writeFile(join(backupDir, 'pos-erp-20260809-030000.dump'), 'old-2');
    await writeFile(join(backupDir, 'pos-erp-20260810-030000.dump'), 'old-3');

    const runTool = makeSuccessfulTool();
    const now = new Date(Date.UTC(2026, 7, 11, 3, 0, 0));

    const result = await runBackup({
      connection,
      backupDir,
      mode: 'direct',
      now,
      keepCount: 2,
      runTool,
    });

    expect(result.deletedOldBackups.sort()).toEqual([
      'pos-erp-20260808-030000.dump',
      'pos-erp-20260809-030000.dump',
    ]);
    const remaining = (await readdir(backupDir)).sort();
    expect(remaining).toEqual([
      'pos-erp-20260810-030000.dump',
      'pos-erp-20260811-030000.dump',
    ]);
  });

  it('KHÔNG xoá backup cũ nào nếu backup mới thất bại (retention chỉ chạy sau thành công)', async () => {
    await writeFile(join(backupDir, 'pos-erp-20260808-030000.dump'), 'old-1');
    const runTool = mockRunTool({
      exitCode: 1,
      signal: null,
      stderr: 'boom',
      timedOut: false,
    });

    await expect(
      runBackup({
        connection,
        backupDir,
        mode: 'direct',
        keepCount: 1,
        runTool,
      }),
    ).rejects.toThrow();

    const files = await readdir(backupDir);
    expect(files).toEqual(['pos-erp-20260808-030000.dump']);
  });

  it('reject rõ ràng khi spawn tự lỗi (vd binary/docker không tồn tại)', async () => {
    const runTool = jest
      .fn<Promise<PgToolRunResult>, [RunPgToolOptions]>()
      .mockRejectedValue(new Error('spawn docker ENOENT'));

    await expect(
      runBackup({ connection, backupDir, mode: 'docker-compose', runTool }),
    ).rejects.toThrow(BackupFailedError);
  });
});

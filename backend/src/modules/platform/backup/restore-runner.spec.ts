import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BackupFileNotFoundError,
  RestoreFailedError,
  RestoreTargetExistsError,
  runRestore,
} from './restore-runner';
import type { PgConnection } from './pg-connection-url';
import type { PgToolRunResult, RunPgToolOptions } from './pg-process-runner';

const connection: PgConnection = {
  host: 'localhost',
  port: 5432,
  database: 'pos_erp',
  user: 'postgres',
  password: 'secret',
};

function makeFakeMaintenanceClient(options: { targetExists: boolean }) {
  const calls: { sql: string; args: unknown[] }[] = [];
  const client = {
    $queryRawUnsafe: jest.fn((sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      return Promise.resolve([{ exists: options.targetExists }]);
    }),
    $executeRawUnsafe: jest.fn((sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      return Promise.resolve(0);
    }),
    $disconnect: jest.fn(() => Promise.resolve(undefined)),
  };
  return { client, calls };
}

function mockRunTool(result: PgToolRunResult) {
  return jest
    .fn<Promise<PgToolRunResult>, [RunPgToolOptions]>()
    .mockImplementation(async (options) => {
      if (options.stdin) {
        // Tiêu thụ (drain) stdin cho tới hết, giống hành vi thật của runPgTool (pipe vào
        // child.stdin) — bỏ qua bước này để lại một ReadStream (từ createReadStream trong
        // runRestore()) chưa từng được đọc/đóng, có thể fire lỗi bất đồng bộ muộn sau khi
        // afterEach() đã xoá backupDir (đã bắt được cùng nguyên nhân với ENOENT ngắt quãng
        // trong backup-runner.spec.ts — xem closeAndRemove/T051.03 CI fix).
        await new Promise<void>((resolve, reject) => {
          options.stdin!.on('data', () => undefined);
          options.stdin!.once('end', resolve);
          options.stdin!.once('error', reject);
        });
      }
      return result;
    });
}

describe('runRestore', () => {
  let backupDir: string;
  let backupFilePath: string;

  beforeEach(async () => {
    backupDir = await mkdtemp(join(tmpdir(), 'restore-runner-test-'));
    backupFilePath = join(backupDir, 'pos-erp-20260811-030000.dump');
    await writeFile(backupFilePath, 'fake-dump-bytes');
  });

  afterEach(async () => {
    await rm(backupDir, { recursive: true, force: true });
  });

  it('luồng thành công: kiểm tra target chưa tồn tại → CREATE DATABASE → pg_restore, không DROP', async () => {
    const { client, calls } = makeFakeMaintenanceClient({
      targetExists: false,
    });
    const runTool = mockRunTool({
      exitCode: 0,
      signal: null,
      stderr: '',
      timedOut: false,
    });

    const result = await runRestore({
      connection,
      backupFilePath,
      targetDatabase: 'pos_erp_restore_test',
      mode: 'direct',
      runTool,
      createMaintenanceClient: () => client as never,
    });

    expect(result.targetDatabase).toBe('pos_erp_restore_test');
    expect(calls[0].sql).toContain('pg_database');
    expect(calls[1].sql).toBe('CREATE DATABASE "pos_erp_restore_test"');
    expect(client.$disconnect).toHaveBeenCalled();

    const restoreCall = runTool.mock.calls[0][0];
    expect(restoreCall.invocation.args).toEqual(
      expect.arrayContaining([
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
      ]),
    );
    // Phải trỏ vào database ĐÍCH mới, không phải connection.database gốc.
    expect(restoreCall.invocation.args).toContain('pos_erp_restore_test');
    expect(restoreCall.invocation.args).not.toContain('pos_erp');
  });

  it('ném RestoreTargetExistsError nếu database đích đã tồn tại, KHÔNG gọi CREATE/pg_restore', async () => {
    const { client, calls } = makeFakeMaintenanceClient({ targetExists: true });
    const runTool = jest.fn();

    await expect(
      runRestore({
        connection,
        backupFilePath,
        targetDatabase: 'pos_erp',
        mode: 'direct',
        runTool,
        createMaintenanceClient: () => client as never,
      }),
    ).rejects.toThrow(RestoreTargetExistsError);

    expect(calls.some((c) => c.sql.startsWith('CREATE DATABASE'))).toBe(false);
    expect(runTool).not.toHaveBeenCalled();
  });

  it('ném BackupFileNotFoundError nếu file backup không tồn tại, không đụng tới DB', async () => {
    const runTool = jest.fn();
    const createMaintenanceClient = jest.fn();

    await expect(
      runRestore({
        connection,
        backupFilePath: join(backupDir, 'khong-ton-tai.dump'),
        targetDatabase: 'pos_erp_restore_test',
        mode: 'direct',
        runTool,
        createMaintenanceClient: createMaintenanceClient as never,
      }),
    ).rejects.toThrow(BackupFileNotFoundError);

    expect(createMaintenanceClient).not.toHaveBeenCalled();
    expect(runTool).not.toHaveBeenCalled();
  });

  it('rollback: DROP DATABASE database đích vừa tạo nếu pg_restore exit non-zero', async () => {
    const { client, calls } = makeFakeMaintenanceClient({
      targetExists: false,
    });
    let clientCallCount = 0;
    const clients = [
      client,
      makeFakeMaintenanceClient({ targetExists: false }).client,
    ];
    const runTool = mockRunTool({
      exitCode: 1,
      signal: null,
      stderr: 'pg_restore: error: could not execute query',
      timedOut: false,
    });

    await expect(
      runRestore({
        connection,
        backupFilePath,
        targetDatabase: 'pos_erp_restore_test',
        mode: 'direct',
        runTool,
        createMaintenanceClient: () => clients[clientCallCount++] as never,
      }),
    ).rejects.toThrow(RestoreFailedError);

    expect(calls.some((c) => c.sql.startsWith('CREATE DATABASE'))).toBe(true);
    // DROP phải được gọi trên client thứ 2 (mở lại sau khi client đầu tiên đã disconnect).
    expect(clients[1].$executeRawUnsafe).toHaveBeenCalledWith(
      'DROP DATABASE IF EXISTS "pos_erp_restore_test"',
    );
  });

  it('lỗi actionable bao gồm stderr của pg_restore khi thất bại', async () => {
    const { client } = makeFakeMaintenanceClient({ targetExists: false });
    let call = 0;
    const clients = [
      client,
      makeFakeMaintenanceClient({ targetExists: false }).client,
    ];
    const runTool = mockRunTool({
      exitCode: 1,
      signal: null,
      stderr: 'FATAL: role "missing_role" does not exist',
      timedOut: false,
    });

    await expect(
      runRestore({
        connection,
        backupFilePath,
        targetDatabase: 'pos_erp_restore_test',
        mode: 'direct',
        runTool,
        createMaintenanceClient: () => clients[call++] as never,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('missing_role'),
    });
  });

  it('rollback khi spawn tự lỗi (vd docker không tồn tại)', async () => {
    const { client } = makeFakeMaintenanceClient({ targetExists: false });
    let call = 0;
    const clients = [
      client,
      makeFakeMaintenanceClient({ targetExists: false }).client,
    ];
    const runTool = jest
      .fn<Promise<PgToolRunResult>, [RunPgToolOptions]>()
      .mockRejectedValue(new Error('spawn docker ENOENT'));

    await expect(
      runRestore({
        connection,
        backupFilePath,
        targetDatabase: 'pos_erp_restore_test',
        mode: 'docker-compose',
        runTool,
        createMaintenanceClient: () => clients[call++] as never,
      }),
    ).rejects.toThrow(RestoreFailedError);

    expect(clients[1].$executeRawUnsafe).toHaveBeenCalledWith(
      'DROP DATABASE IF EXISTS "pos_erp_restore_test"',
    );
  });
});

import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { runPgTool } from './pg-process-runner';
import type { PgToolInvocation } from './pg-tool-invocation';

const spawnMock = jest.fn();

jest.mock('child_process', () => ({
  spawn: (...args: unknown[]): unknown => spawnMock(...args) as unknown,
}));

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  killed = false;
  kill(signal: NodeJS.Signals) {
    this.killed = true;
    this.emit('close', null, signal);
  }
}

const invocation: PgToolInvocation = {
  command: 'pg_dump',
  args: ['-h', 'localhost', '-d', 'pos_erp'],
  env: { PGPASSWORD: 'secret' },
};

describe('runPgTool', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('gọi spawn với đúng command/args/env/cwd, resolve exitCode 0 khi tiến trình con đóng thành công', async () => {
    const fakeChild = new FakeChildProcess();
    spawnMock.mockReturnValue(fakeChild);

    const promise = runPgTool({ invocation, cwd: '/repo' });
    fakeChild.emit('close', 0, null);
    const result = await promise;

    expect(spawnMock).toHaveBeenCalledWith(
      'pg_dump',
      ['-h', 'localhost', '-d', 'pos_erp'],
      expect.objectContaining({ env: invocation.env, cwd: '/repo' }),
    );
    expect(result).toEqual({
      exitCode: 0,
      signal: null,
      stderr: '',
      timedOut: false,
    });
  });

  it('capture stderr từ tiến trình con', async () => {
    const fakeChild = new FakeChildProcess();
    spawnMock.mockReturnValue(fakeChild);

    const promise = runPgTool({ invocation });
    fakeChild.stderr.write('pg_dump: error: connection refused\n');
    fakeChild.emit('close', 1, null);
    const result = await promise;

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('connection refused');
  });

  it('pipe stdout tiến trình con vào Writable được truyền vào (dùng cho ghi file backup)', async () => {
    const fakeChild = new FakeChildProcess();
    spawnMock.mockReturnValue(fakeChild);

    const chunks: Buffer[] = [];
    const sink = new PassThrough();
    sink.on('data', (chunk: Buffer) => chunks.push(chunk));

    const promise = runPgTool({ invocation, stdout: sink });
    fakeChild.stdout.write('binary-dump-content');
    fakeChild.stdout.end();
    fakeChild.emit('close', 0, null);
    await promise;

    expect(Buffer.concat(chunks).toString()).toBe('binary-dump-content');
  });

  it('reject promise khi spawn tự bắn lỗi (vd binary không tồn tại — ENOENT)', async () => {
    const fakeChild = new FakeChildProcess();
    spawnMock.mockReturnValue(fakeChild);

    const promise = runPgTool({ invocation });
    fakeChild.emit('error', new Error('spawn pg_dump ENOENT'));

    await expect(promise).rejects.toThrow('ENOENT');
  });

  it('timeout: SIGKILL tiến trình con và trả timedOut true khi vượt quá timeoutMs', async () => {
    jest.useFakeTimers();
    const fakeChild = new FakeChildProcess();
    spawnMock.mockReturnValue(fakeChild);
    const killSpy = jest.spyOn(fakeChild, 'kill');

    const promise = runPgTool({ invocation, timeoutMs: 5000 });
    jest.advanceTimersByTime(5000);
    const result = await promise;

    expect(killSpy).toHaveBeenCalledWith('SIGKILL');
    expect(result.timedOut).toBe(true);
    jest.useRealTimers();
  });

  it('EPIPE trên child.stdin KHÔNG làm promise reject — tiến trình con (vd pg_restore --list) có thể đóng stdin sớm khi đã đọc đủ', async () => {
    const fakeChild = new FakeChildProcess();
    spawnMock.mockReturnValue(fakeChild);
    const source = new PassThrough();

    const promise = runPgTool({ invocation, stdin: source });
    const epipeError = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
    });
    fakeChild.stdin.emit('error', epipeError);
    fakeChild.emit('close', 0, null);

    const result = await promise;
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('lỗi KHÁC EPIPE trên child.stdin được ghi vào stderr (không làm reject, vẫn phản ánh qua exit code thật)', async () => {
    const fakeChild = new FakeChildProcess();
    spawnMock.mockReturnValue(fakeChild);
    const source = new PassThrough();

    const promise = runPgTool({ invocation, stdin: source });
    const otherError = Object.assign(new Error('write ENOSPC'), {
      code: 'ENOSPC',
    });
    fakeChild.stdin.emit('error', otherError);
    fakeChild.emit('close', 1, null);

    const result = await promise;
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ENOSPC');
  });

  it('không pipe stdin/stdout nếu không được truyền vào (stdio ignore)', async () => {
    const fakeChild = new FakeChildProcess();
    spawnMock.mockReturnValue(fakeChild);

    const promise = runPgTool({ invocation });
    fakeChild.emit('close', 0, null);
    await promise;

    expect(spawnMock).toHaveBeenCalledWith(
      'pg_dump',
      expect.any(Array),
      expect.objectContaining({ stdio: ['ignore', 'ignore', 'pipe'] }),
    );
  });
});

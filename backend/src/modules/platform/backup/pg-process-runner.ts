import { spawn } from 'child_process';
import type { Readable, Writable } from 'stream';
import type { PgToolInvocation } from './pg-tool-invocation';

export interface RunPgToolOptions {
  invocation: PgToolInvocation;
  /** Nếu có: pipe stdout của tiến trình con vào đây (pg_dump ghi file backup). */
  stdout?: Writable;
  /** Nếu có: pipe nội dung này vào stdin của tiến trình con (pg_restore đọc file backup). */
  stdin?: Readable;
  /** Timeout tổng — vượt quá sẽ SIGKILL tiến trình con và trả `timedOut: true`. */
  timeoutMs?: number;
  cwd?: string;
}

export interface PgToolRunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  timedOut: boolean;
}

/**
 * T051.03 §6 — wrapper mỏng quanh `child_process.spawn`, KHÔNG dùng shell (`shell: true`) để
 * tránh injection qua path/tên file; toàn bộ đối số truyền dưới dạng mảng, an toàn theo mặc định.
 * Stderr luôn được capture (dùng để làm actionable error message — §17).
 */
export function runPgTool(options: RunPgToolOptions): Promise<PgToolRunResult> {
  const { invocation, stdout, stdin, timeoutMs, cwd } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      env: invocation.env,
      cwd,
      stdio: [stdin ? 'pipe' : 'ignore', stdout ? 'pipe' : 'ignore', 'pipe'],
    });

    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    if (timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
    }

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    if (stdin && child.stdin) {
      stdin.pipe(child.stdin);
    }
    if (stdout && child.stdout) {
      child.stdout.pipe(stdout);
    }

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    });

    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ exitCode, signal, stderr, timedOut });
    });
  });
}

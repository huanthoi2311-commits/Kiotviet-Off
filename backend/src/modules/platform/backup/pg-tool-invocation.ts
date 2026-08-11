import type { PgConnection } from './pg-connection-url';

/**
 * T051.03 §15 — hai cách gọi pg_dump/pg_restore:
 *  - 'direct': gọi thẳng binary trên PATH (dùng khi máy chạy script CÓ cài PostgreSQL client —
 *    đúng trường hợp CI runner, đã xác nhận có sẵn postgresql-client trên ubuntu-latest).
 *  - 'docker-compose': exec vào container `postgres` đang chạy qua `docker compose exec`, mượn
 *    chính binary pg_dump/pg_restore có sẵn trong image postgres:16-alpine (khớp version server
 *    tuyệt đối, không cần cài gì trên máy vận hành Windows — máy này KHÔNG có pg_dump/psql cài
 *    sẵn, đã xác nhận qua `where pg_dump`/`where psql` trong quá trình discovery T051.03).
 *
 * Mặc định là 'docker-compose' vì đó là cơ chế triển khai local đã được duyệt (AD01/AD02,
 * offline-single-computer-readiness-audit.md) — operator KHÔNG cần cài thêm gì ngoài Docker đã
 * có sẵn theo yêu cầu triển khai hiện tại.
 */
export type PgToolMode = 'direct' | 'docker-compose';

export type PgToolName = 'pg_dump' | 'pg_restore';

export interface PgToolInvocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export interface BuildPgToolInvocationOptions {
  tool: PgToolName;
  mode: PgToolMode;
  connection: PgConnection;
  toolArgs: string[];
  /** Chỉ dùng ở mode 'docker-compose'. Mặc định 'postgres' — khớp service name trong docker-compose.yml. */
  dockerComposeService?: string;
}

export function buildPgToolInvocation(
  options: BuildPgToolInvocationOptions,
): PgToolInvocation {
  const { tool, mode, connection, toolArgs } = options;
  const dockerComposeService = options.dockerComposeService ?? 'postgres';

  if (mode === 'direct') {
    return {
      command: tool,
      args: [
        '-h',
        connection.host,
        '-p',
        String(connection.port),
        '-U',
        connection.user,
        '-d',
        connection.database,
        ...toolArgs,
      ],
      // PGPASSWORD chỉ tồn tại trong env của tiến trình con — không bao giờ xuất hiện trong argv
      // (tránh lộ qua `ps`/process list).
      env: { ...process.env, PGPASSWORD: connection.password },
    };
  }

  // docker-compose mode: connection.host/port của HOST không áp dụng bên trong container — bên
  // trong container Postgres, server luôn lắng nghe tại chính nó, nên dùng 'localhost'/5432 cố
  // định (không phải connection.host/port, vốn là địa chỉ NHÌN TỪ HOST).
  //
  // Password truyền qua `-e PGPASSWORD=...` của `docker compose exec` — limitation đã biết: giá
  // trị này xuất hiện ngắn hạn trong process list CỦA MÁY LOCAL trong lúc lệnh chạy. Chấp nhận
  // được cho mục tiêu V1 (máy đơn, offline, không network-exposed) — ghi rõ trong
  // docs/release/BACKUP-RESTORE-RUNBOOK.md, mục Security.
  return {
    command: 'docker',
    args: [
      'compose',
      'exec',
      '-T',
      '-e',
      `PGPASSWORD=${connection.password}`,
      dockerComposeService,
      tool,
      '-h',
      'localhost',
      '-p',
      '5432',
      '-U',
      connection.user,
      '-d',
      connection.database,
      ...toolArgs,
    ],
    env: process.env,
  };
}

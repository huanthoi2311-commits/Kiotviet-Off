/**
 * T051.03 — Parse `DATABASE_URL` (chuẩn `postgresql://user:pass@host:port/db?...`) thành các
 * thành phần rời rạc, để pg_dump/pg_restore nhận host/port/user/db qua flag riêng và password
 * qua biến môi trường `PGPASSWORD` — KHÔNG bao giờ đưa password vào command-line argv (tránh lộ
 * qua `ps`/process list).
 */
export interface PgConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function parseDatabaseUrl(databaseUrl: string): PgConnection {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL không hợp lệ: không parse được như một URL.');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(
      `DATABASE_URL không hợp lệ: protocol phải là postgresql:// hoặc postgres:// (nhận '${url.protocol}').`,
    );
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error(
      'DATABASE_URL không hợp lệ: thiếu tên database (path rỗng).',
    );
  }

  if (!url.hostname) {
    throw new Error('DATABASE_URL không hợp lệ: thiếu host.');
  }

  if (!url.username) {
    throw new Error('DATABASE_URL không hợp lệ: thiếu user.');
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

/**
 * Dựng lại DATABASE_URL từ PgConnection — dùng khi cần trỏ Prisma tới một database KHÁC trên
 * cùng server (vd database bảo trì 'postgres' để chạy CREATE DATABASE, hoặc database đích mới
 * tạo để verify restore).
 */
export function buildDatabaseUrl(
  connection: PgConnection,
  overrideDatabase?: string,
): string {
  const database = overrideDatabase ?? connection.database;
  const user = encodeURIComponent(connection.user);
  const password = encodeURIComponent(connection.password);
  return `postgresql://${user}:${password}@${connection.host}:${connection.port}/${database}?schema=public`;
}

import { PgConnection } from './pg-connection-url';
import { buildPgToolInvocation } from './pg-tool-invocation';

const connection: PgConnection = {
  host: 'db-host',
  port: 5433,
  database: 'pos_erp',
  user: 'postgres',
  password: 'sekret',
};

describe('buildPgToolInvocation — mode direct', () => {
  it('gọi thẳng binary với -h/-p/-U/-d và toolArgs, password chỉ trong env', () => {
    const invocation = buildPgToolInvocation({
      tool: 'pg_dump',
      mode: 'direct',
      connection,
      toolArgs: ['-Fc', '-v'],
    });

    expect(invocation.command).toBe('pg_dump');
    expect(invocation.args).toEqual([
      '-h',
      'db-host',
      '-p',
      '5433',
      '-U',
      'postgres',
      '-d',
      'pos_erp',
      '-Fc',
      '-v',
    ]);
    expect(invocation.env.PGPASSWORD).toBe('sekret');
    // Password KHÔNG được xuất hiện trong argv.
    expect(invocation.args.join(' ')).not.toContain('sekret');
  });

  it('hoạt động với pg_restore tương tự pg_dump', () => {
    const invocation = buildPgToolInvocation({
      tool: 'pg_restore',
      mode: 'direct',
      connection,
      toolArgs: ['--clean'],
    });
    expect(invocation.command).toBe('pg_restore');
    expect(invocation.args).toContain('--clean');
  });
});

describe('buildPgToolInvocation — mode docker-compose', () => {
  it('gọi qua `docker compose exec -T -e PGPASSWORD=... <service> <tool>`, host/port cố định localhost:5432 bên trong container', () => {
    const invocation = buildPgToolInvocation({
      tool: 'pg_dump',
      mode: 'docker-compose',
      connection,
      toolArgs: ['-Fc'],
    });

    expect(invocation.command).toBe('docker');
    expect(invocation.args).toEqual([
      'compose',
      'exec',
      '-T',
      '-e',
      'PGPASSWORD=sekret',
      'postgres',
      'pg_dump',
      '-h',
      'localhost',
      '-p',
      '5432',
      '-U',
      'postgres',
      '-d',
      'pos_erp',
      '-Fc',
    ]);
  });

  it('dùng dockerComposeService tuỳ chỉnh nếu truyền vào', () => {
    const invocation = buildPgToolInvocation({
      tool: 'pg_restore',
      mode: 'docker-compose',
      connection,
      toolArgs: [],
      dockerComposeService: 'postgres-custom',
    });
    expect(invocation.args).toContain('postgres-custom');
  });

  it('KHÔNG dùng connection.host/port của host cho địa chỉ kết nối bên trong container', () => {
    const invocation = buildPgToolInvocation({
      tool: 'pg_dump',
      mode: 'docker-compose',
      connection,
      toolArgs: [],
    });
    expect(invocation.args).not.toContain('db-host');
    expect(invocation.args).not.toContain('5433');
  });
});

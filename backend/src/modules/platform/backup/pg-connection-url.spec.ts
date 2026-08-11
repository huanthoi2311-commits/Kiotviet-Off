import { buildDatabaseUrl, parseDatabaseUrl } from './pg-connection-url';

describe('parseDatabaseUrl', () => {
  it('parse đúng đầy đủ host/port/database/user/password', () => {
    const result = parseDatabaseUrl(
      'postgresql://postgres:secret@localhost:5432/pos_erp?schema=public',
    );
    expect(result).toEqual({
      host: 'localhost',
      port: 5432,
      database: 'pos_erp',
      user: 'postgres',
      password: 'secret',
    });
  });

  it('mặc định port 5432 khi URL không ghi port', () => {
    const result = parseDatabaseUrl(
      'postgresql://postgres:secret@db-host/pos_erp',
    );
    expect(result.port).toBe(5432);
  });

  it('decode ký tự đặc biệt trong user/password/database (percent-encoding)', () => {
    const result = parseDatabaseUrl(
      'postgresql://my%40user:p%40ss%23word@localhost:5432/my%20db',
    );
    expect(result.user).toBe('my@user');
    expect(result.password).toBe('p@ss#word');
    expect(result.database).toBe('my db');
  });

  it('chấp nhận protocol postgres:// (alias)', () => {
    const result = parseDatabaseUrl(
      'postgres://postgres:secret@localhost:5432/pos_erp',
    );
    expect(result.database).toBe('pos_erp');
  });

  it('ném lỗi khi không phải URL hợp lệ', () => {
    expect(() => parseDatabaseUrl('not-a-url')).toThrow('không parse được');
  });

  it('ném lỗi khi protocol không phải postgresql/postgres', () => {
    expect(() =>
      parseDatabaseUrl('mysql://postgres:secret@localhost:5432/pos_erp'),
    ).toThrow('protocol phải là');
  });

  it('ném lỗi khi thiếu tên database', () => {
    expect(() =>
      parseDatabaseUrl('postgresql://postgres:secret@localhost:5432/'),
    ).toThrow('thiếu tên database');
  });

  it('ném lỗi khi thiếu user', () => {
    expect(() =>
      parseDatabaseUrl('postgresql://localhost:5432/pos_erp'),
    ).toThrow('thiếu user');
  });
});

describe('buildDatabaseUrl', () => {
  const connection = {
    host: 'localhost',
    port: 5432,
    database: 'pos_erp',
    user: 'postgres',
    password: 'secret',
  };

  it('dựng lại đúng URL từ connection gốc khi không override database', () => {
    expect(buildDatabaseUrl(connection)).toBe(
      'postgresql://postgres:secret@localhost:5432/pos_erp?schema=public',
    );
  });

  it('dùng overrideDatabase khi được truyền vào (vd trỏ tới DB đích mới tạo)', () => {
    expect(buildDatabaseUrl(connection, 'pos_erp_restore_test')).toBe(
      'postgresql://postgres:secret@localhost:5432/pos_erp_restore_test?schema=public',
    );
  });

  it('round-trip: parseDatabaseUrl(buildDatabaseUrl(x)) === x', () => {
    const url = buildDatabaseUrl(connection);
    expect(parseDatabaseUrl(url)).toEqual(connection);
  });

  it('encode ký tự đặc biệt trong user/password khi dựng URL', () => {
    const url = buildDatabaseUrl({
      ...connection,
      user: 'a@b',
      password: 'p#w',
    });
    expect(url).toContain('a%40b');
    expect(url).toContain('p%23w');
  });
});

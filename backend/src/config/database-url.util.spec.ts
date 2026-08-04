import { validateDatabaseUrl } from './database-url.util';

const VALID_DEV_URL = 'postgresql://user:pass@localhost:5432/db';

describe('validateDatabaseUrl — T030.7', () => {
  it('[1] URL hợp lệ, không production → không lỗi', () => {
    expect(validateDatabaseUrl(VALID_DEV_URL, { isProduction: false })).toEqual(
      [],
    );
  });

  it('[1b] chuỗi không parse được → 1 lỗi duy nhất', () => {
    expect(validateDatabaseUrl('not-a-url', { isProduction: false })).toEqual([
      'không parse được thành URL hợp lệ',
    ]);
  });

  it('[2] protocol không phải postgresql/postgres bị từ chối', () => {
    const errors = validateDatabaseUrl('mysql://user:pass@localhost:3306/db', {
      isProduction: false,
    });
    expect(errors.some((e) => e.includes('protocol'))).toBe(true);
  });

  it('protocol "postgres://" (dạng rút gọn hợp lệ) được chấp nhận', () => {
    expect(
      validateDatabaseUrl('postgres://user:pass@localhost:5432/db', {
        isProduction: false,
      }),
    ).toEqual([]);
  });

  it('[3] thiếu host bị từ chối', () => {
    const errors = validateDatabaseUrl('postgresql:///db', {
      isProduction: false,
    });
    expect(errors.some((e) => e.includes('host'))).toBe(true);
  });

  it('[4] thiếu tên database bị từ chối', () => {
    const errors = validateDatabaseUrl(
      'postgresql://user:pass@localhost:5432/',
      {
        isProduction: false,
      },
    );
    expect(errors.some((e) => e.includes('database'))).toBe(true);
  });

  it('[5] thiếu username bị từ chối', () => {
    const errors = validateDatabaseUrl('postgresql://localhost:5432/db', {
      isProduction: false,
    });
    expect(errors.some((e) => e.includes('username'))).toBe(true);
  });

  it('[6] development: thiếu password KHÔNG bị từ chối (chỉ production mới bắt buộc password)', () => {
    expect(
      validateDatabaseUrl('postgresql://user@localhost:5432/db', {
        isProduction: false,
      }),
    ).toEqual([]);
  });

  it('[10] production: thiếu password bị từ chối', () => {
    const errors = validateDatabaseUrl('postgresql://user@localhost:5432/db', {
      isProduction: true,
    });
    expect(errors.some((e) => e.includes('password'))).toBe(true);
  });

  it.each(['postgres', 'password', 'change-me-postgres-password', 'Admin@123'])(
    '[11] production: password yếu đã biết công khai ("%s") bị từ chối',
    (weakPassword) => {
      const errors = validateDatabaseUrl(
        `postgresql://user:${weakPassword}@localhost:5432/db`,
        { isProduction: true },
      );
      expect(errors.some((e) => e.includes('yếu'))).toBe(true);
    },
  );

  it('production: password mạnh, không nằm trong danh sách yếu → không lỗi password', () => {
    const errors = validateDatabaseUrl(
      'postgresql://user:a-genuinely-strong-random-password-value@localhost:5432/db',
      { isProduction: true },
    );
    expect(
      errors.some((e) => e.includes('password') || e.includes('yếu')),
    ).toBe(false);
  });

  it('[8] production: tên database bắt đầu bằng tiền tố t029_disposable_ bị từ chối', () => {
    const errors = validateDatabaseUrl(
      'postgresql://user:a-strong-password@localhost:5432/t029_disposable_something',
      { isProduction: true },
    );
    expect(errors.some((e) => e.includes('disposable'))).toBe(true);
  });

  it('[8b] production: tên database "test" bị từ chối', () => {
    const errors = validateDatabaseUrl(
      'postgresql://user:a-strong-password@localhost:5432/test',
      { isProduction: true },
    );
    expect(errors.some((e) => e.includes('disposable'))).toBe(true);
  });

  it('[9] DATABASE_URL trùng T029_DISPOSABLE_DATABASE_URL bị từ chối (bất kể môi trường)', () => {
    const url = 'postgresql://user:pass@localhost:5432/t029_disposable_abc123';
    const errors = validateDatabaseUrl(url, {
      isProduction: false,
      disposableTestUrl: url,
    });
    expect(errors.some((e) => e.includes('T029_DISPOSABLE_DATABASE_URL'))).toBe(
      true,
    );
  });

  it('[9b] DATABASE_URL khác T029_DISPOSABLE_DATABASE_URL → không lỗi trùng', () => {
    const errors = validateDatabaseUrl(VALID_DEV_URL, {
      isProduction: false,
      disposableTestUrl:
        'postgresql://user:pass@localhost:5432/t029_disposable_xyz',
    });
    expect(errors.some((e) => e.includes('T029_DISPOSABLE_DATABASE_URL'))).toBe(
      false,
    );
  });

  it('không có lỗi nào chứa giá trị password đã parse ("pass") trong bất kỳ thông báo nào', () => {
    const errors = validateDatabaseUrl(
      'postgresql://user:postgres@localhost:5432/db',
      {
        isProduction: true,
      },
    );
    expect(errors.join(' ')).not.toContain('postgres@');
    // Thông báo mô tả VẤN ĐỀ (vd "password là giá trị yếu..."), không lặp lại chính giá trị đó.
    errors.forEach((error) => expect(error).not.toContain(':postgres@'));
  });
});

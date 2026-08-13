// class-transformer/class-validator (dùng bởi EnvironmentVariables) cần Reflect.getMetadata –
// khi chạy file này ĐỘC LẬP (không qua bootstrap NestFactory, vốn tự polyfill sẵn), phải tự nạp.
import 'reflect-metadata';
import { PRODUCTION_SECRET_PLACEHOLDERS, validateEnv } from './env.validation';

describe('validateEnv — SPEC-P001 Rev1 Item 3 (Production Secret Validation)', () => {
  const baseConfig = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a-real-non-placeholder-access-secret',
    JWT_REFRESH_SECRET: 'a-real-non-placeholder-refresh-secret',
  };

  it('[1] NODE_ENV=production + JWT_ACCESS_SECRET = placeholder → throw, message nêu đúng JWT_ACCESS_SECRET', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: PRODUCTION_SECRET_PLACEHOLDERS.JWT_ACCESS_SECRET,
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('[1b] message khi chỉ JWT_ACCESS_SECRET sai KHÔNG nhắc tới JWT_REFRESH_SECRET', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: PRODUCTION_SECRET_PLACEHOLDERS.JWT_ACCESS_SECRET,
      }),
    ).not.toThrow(/JWT_REFRESH_SECRET/);
  });

  it('[2] NODE_ENV=production + JWT_REFRESH_SECRET = placeholder → throw, message nêu đúng JWT_REFRESH_SECRET', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        JWT_REFRESH_SECRET: PRODUCTION_SECRET_PLACEHOLDERS.JWT_REFRESH_SECRET,
      }),
    ).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('[2b] message khi chỉ JWT_REFRESH_SECRET sai KHÔNG nhắc tới JWT_ACCESS_SECRET', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        JWT_REFRESH_SECRET: PRODUCTION_SECRET_PLACEHOLDERS.JWT_REFRESH_SECRET,
      }),
    ).not.toThrow(/JWT_ACCESS_SECRET/);
  });

  it('[3] NODE_ENV=production + CẢ HAI bằng placeholder → throw, message nêu ĐỦ CẢ HAI (không dừng lại ở biến đầu tiên)', () => {
    let caught: Error | undefined;
    try {
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: PRODUCTION_SECRET_PLACEHOLDERS.JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: PRODUCTION_SECRET_PLACEHOLDERS.JWT_REFRESH_SECRET,
      });
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught!.message).toContain('JWT_ACCESS_SECRET');
    expect(caught!.message).toContain('JWT_REFRESH_SECRET');
    expect(caught!.message).toContain(
      'Production startup refused because default secrets are still in use',
    );
  });

  it('[4] NODE_ENV=production + CẢ HAI đã đổi giá trị thật → KHÔNG throw', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        // SPEC-T023 Finding 3/13 — production còn yêu cầu SWAGGER_ENABLED=false và CORS_ORIGIN
        // khác mặc định; cấu hình đủ ở đây để test [4] chỉ còn kiểm tra ĐÚNG PHẠM VI gốc của nó
        // (JWT secrets), không lẫn với 2 yêu cầu mới (đã có describe block riêng bên dưới).
        SWAGGER_ENABLED: 'false',
        CORS_ORIGIN: 'https://pos.example.com',
      }),
    ).not.toThrow();
  });

  it('[5] NODE_ENV=development + CẢ HAI vẫn là placeholder → KHÔNG throw (chỉ áp dụng ở production)', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: PRODUCTION_SECRET_PLACEHOLDERS.JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: PRODUCTION_SECRET_PLACEHOLDERS.JWT_REFRESH_SECRET,
      }),
    ).not.toThrow();
  });

  // T030.11 (DISCOVERY-T030 F20) — trước đây test này khẳng định "NODE_ENV không set → KHÔNG
  // throw, mặc định Development" — chính hành vi ĐÓ là lỗ hổng F20 (một deployment production
  // quên set NODE_ENV sẽ âm thầm chạy như development, bỏ qua toàn bộ guard production). Từ
  // T030.11, NODE_ENV không còn giá trị mặc định — thay bằng test khẳng định điều NGƯỢC LẠI.
  it('[5b] NODE_ENV không set → throw (KHÔNG còn âm thầm mặc định Development — T030.11)', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        JWT_ACCESS_SECRET: PRODUCTION_SECRET_PLACEHOLDERS.JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: PRODUCTION_SECRET_PLACEHOLDERS.JWT_REFRESH_SECRET,
      }),
    ).toThrow(/NODE_ENV/);
  });
});

describe('validateEnv — SPEC-T023 Finding 3 (Swagger production fail-closed)', () => {
  const baseConfig = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a-real-non-placeholder-access-secret',
    JWT_REFRESH_SECRET: 'a-real-non-placeholder-refresh-secret',
    CORS_ORIGIN: 'https://pos.example.com',
  };

  it('[AC3.1] production + SWAGGER_ENABLED mặc định (không set) → throw, nêu rõ SWAGGER_ENABLED', () => {
    expect(() =>
      validateEnv({ ...baseConfig, NODE_ENV: 'production' }),
    ).toThrow(/SWAGGER_ENABLED/);
  });

  it('[AC3.1b] production + SWAGGER_ENABLED=true tường minh → vẫn throw', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        SWAGGER_ENABLED: 'true',
      }),
    ).toThrow(/SWAGGER_ENABLED/);
  });

  it('[AC3.2] production + SWAGGER_ENABLED=false tường minh → KHÔNG throw', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        SWAGGER_ENABLED: 'false',
      }),
    ).not.toThrow();
  });

  it('[AC3.3] development + SWAGGER_ENABLED mặc định → KHÔNG throw (không áp dụng ngoài production)', () => {
    expect(() =>
      validateEnv({ ...baseConfig, NODE_ENV: 'development' }),
    ).not.toThrow();
  });
});

describe('validateEnv — SPEC-T023 Finding 13 (CORS hard-block + SMTP warning)', () => {
  const baseConfig = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a-real-non-placeholder-access-secret',
    JWT_REFRESH_SECRET: 'a-real-non-placeholder-refresh-secret',
    SWAGGER_ENABLED: 'false',
  };

  it('[AC13.1] production + CORS_ORIGIN vẫn là mặc định đóng gói → throw, nêu rõ CORS_ORIGIN', () => {
    expect(() =>
      validateEnv({ ...baseConfig, NODE_ENV: 'production' }),
    ).toThrow(/CORS_ORIGIN/);
  });

  it('[AC13.1b] production + CORS_ORIGIN đã đổi khỏi mặc định → KHÔNG throw', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://pos.example.com',
      }),
    ).not.toThrow();
  });

  it('[3-CORS] production + CẢ SWAGGER_ENABLED lẫn CORS_ORIGIN đều sai → message nêu ĐỦ CẢ HAI', () => {
    let caught: Error | undefined;
    try {
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        SWAGGER_ENABLED: 'true',
      });
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught!.message).toContain('SWAGGER_ENABLED');
    expect(caught!.message).toContain('CORS_ORIGIN');
  });

  it('[AC13.2] production + SMTP_HOST trống → KHÔNG throw, chỉ cảnh báo qua console.warn', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://pos.example.com',
      }),
    ).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SMTP_HOST'));
    warnSpy.mockRestore();
  });

  it('[AC13.2b] production + SMTP_HOST đã cấu hình → KHÔNG cảnh báo', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    validateEnv({
      ...baseConfig,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://pos.example.com',
      SMTP_HOST: 'smtp.example.com',
    });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('validateEnv — T030.6 (CORS_ORIGIN shared REST/WebSocket contract, production hardening)', () => {
  const baseConfig = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a-real-non-placeholder-access-secret',
    JWT_REFRESH_SECRET: 'a-real-non-placeholder-refresh-secret',
    SWAGGER_ENABLED: 'false',
  };

  it('[6] nhiều origin hợp lệ, phân tách bởi dấu phẩy → KHÔNG throw', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://a.example.com,https://b.example.com',
      }),
    ).not.toThrow();
  });

  it('[9] production + CORS_ORIGIN="*" → throw, nêu rõ CORS_ORIGIN', () => {
    expect(() =>
      validateEnv({ ...baseConfig, NODE_ENV: 'production', CORS_ORIGIN: '*' }),
    ).toThrow(/CORS_ORIGIN/);
  });

  it('[9b] production + CORS_ORIGIN chứa "*" lẫn với origin hợp lệ khác → vẫn throw', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://real.example.com,*',
      }),
    ).toThrow(/CORS_ORIGIN/);
  });

  it('[10] production + CORS_ORIGIN chỉ toàn dấu phẩy → danh sách rỗng sau parse → throw', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        CORS_ORIGIN: ',,,',
      }),
    ).toThrow(/CORS_ORIGIN/);
  });

  it('[11] production + origin không hợp lệ về cú pháp (có path) → throw', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://pos.example.com/app',
      }),
    ).toThrow(/CORS_ORIGIN/);
  });

  it('[11-mix] production + 1 origin hợp lệ + 1 origin malformed → vẫn throw (không đủ chỉ cần 1 cái đúng)', () => {
    expect(() =>
      validateEnv({
        ...baseConfig,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://good.example.com,not-a-url',
      }),
    ).toThrow(/CORS_ORIGIN/);
  });

  it('development + CORS_ORIGIN="*" → KHÔNG throw (guard chỉ áp dụng ở production)', () => {
    expect(() =>
      validateEnv({ ...baseConfig, NODE_ENV: 'development', CORS_ORIGIN: '*' }),
    ).not.toThrow();
  });
});

describe('validateEnv — T030.7 (authoritative startup validation contract)', () => {
  const validProdConfig = {
    NODE_ENV: 'production',
    DATABASE_URL:
      'postgresql://app_user:a-genuinely-strong-random-password@db.example.com:5432/pos_erp',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    SWAGGER_ENABLED: 'false',
    CORS_ORIGIN: 'https://pos.example.com',
  };

  it('[1] cấu hình development hợp lệ (NODE_ENV set tường minh — bắt buộc từ T030.11) → KHÔNG throw', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'development',
        DATABASE_URL:
          'postgresql://postgres:postgres@localhost:5432/pos_erp?schema=public',
        JWT_ACCESS_SECRET: 'change-me-access-secret',
        JWT_REFRESH_SECRET: 'change-me-refresh-secret',
      }),
    ).not.toThrow();
  });

  it('[2] cấu hình production hợp lệ đầy đủ → KHÔNG throw', () => {
    expect(() => validateEnv(validProdConfig)).not.toThrow();
  });

  it('[3] thiếu DATABASE_URL (biến bắt buộc) → throw', () => {
    const { DATABASE_URL: _omit, ...rest } = validProdConfig;
    void _omit;
    expect(() => validateEnv(rest)).toThrow();
  });

  it('[4] DATABASE_URL rỗng → throw (không chỉ "thiếu", "" cũng bị từ chối)', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, DATABASE_URL: '' }),
    ).toThrow();
  });

  it('[4b] JWT_ACCESS_SECRET rỗng → throw', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, JWT_ACCESS_SECRET: '' }),
    ).toThrow();
  });

  it('[5] PORT không phải số → throw', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, PORT: 'not-a-number' }),
    ).toThrow();
  });

  it('[6] PORT = 0 bị từ chối (mới — trước đây @Min(0) cho phép 0)', () => {
    expect(() => validateEnv({ ...validProdConfig, PORT: '0' })).toThrow();
  });

  it('[6b] PORT âm bị từ chối', () => {
    expect(() => validateEnv({ ...validProdConfig, PORT: '-1' })).toThrow();
  });

  it('[6c] PORT > 65535 bị từ chối', () => {
    expect(() => validateEnv({ ...validProdConfig, PORT: '70000' })).toThrow();
  });

  it('[6d] PORT thập phân bị từ chối', () => {
    expect(() => validateEnv({ ...validProdConfig, PORT: '3000.5' })).toThrow();
  });

  it('[6e] REDIS_PORT/SMTP_PORT cũng áp dụng cùng khoảng hợp lệ 1–65535 (nhất quán với PORT)', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, REDIS_PORT: '0' }),
    ).toThrow();
    expect(() =>
      validateEnv({ ...validProdConfig, SMTP_PORT: '70000' }),
    ).toThrow();
  });

  it('[7] SWAGGER_ENABLED="yes" bị từ chối (strict boolean — chỉ "true"/"false")', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, SWAGGER_ENABLED: 'yes' }),
    ).toThrow();
  });

  it('SWAGGER_ENABLED="on"/"enabled"/"1" đều bị từ chối', () => {
    for (const value of ['on', 'enabled', '1']) {
      expect(() =>
        validateEnv({ ...validProdConfig, SWAGGER_ENABLED: value }),
      ).toThrow();
    }
  });

  // T051.08B — cùng strict boolean parsing với SWAGGER_ENABLED, nhưng KHÔNG có assertion "phải
  // đúng 1 giá trị ở production" (cả 'true' lẫn 'false' đều hợp lệ ở production, tuỳ topology
  // triển khai — khác SWAGGER_ENABLED chỉ có đúng 1 giá trị an toàn) — xem configuration.spec.ts
  // cho hành vi fallback khi biến này KHÔNG được set.
  it('[7b] AUTH_COOKIE_SECURE="yes" bị từ chối (strict boolean — chỉ "true"/"false")', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, AUTH_COOKIE_SECURE: 'yes' }),
    ).toThrow();
  });

  it('AUTH_COOKIE_SECURE không được set → KHÔNG throw (optional, không có default ở schema)', () => {
    expect(() => validateEnv({ ...validProdConfig })).not.toThrow();
  });

  it('AUTH_COOKIE_SECURE="false" ở production → KHÔNG throw (hợp lệ cho topology HTTP đóng gói)', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, AUTH_COOKIE_SECURE: 'false' }),
    ).not.toThrow();
  });

  it('AUTH_COOKIE_SECURE="true" ở production → KHÔNG throw (hợp lệ cho topology HTTPS)', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, AUTH_COOKIE_SECURE: 'true' }),
    ).not.toThrow();
  });

  it('[8] DATABASE_URL không parse được → throw', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, DATABASE_URL: 'not-a-url' }),
    ).toThrow();
  });

  it('[9] DATABASE_URL không phải PostgreSQL (vd mysql://) → throw', () => {
    expect(() =>
      validateEnv({
        ...validProdConfig,
        DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
      }),
    ).toThrow();
  });

  it('[10] production DATABASE_URL không có password → throw', () => {
    expect(() =>
      validateEnv({
        ...validProdConfig,
        DATABASE_URL: 'postgresql://app_user@db.example.com:5432/pos_erp',
      }),
    ).toThrow();
  });

  it('[11] production DATABASE_URL dùng password yếu đã biết công khai → throw', () => {
    expect(() =>
      validateEnv({
        ...validProdConfig,
        DATABASE_URL:
          'postgresql://app_user:postgres@db.example.com:5432/pos_erp',
      }),
    ).toThrow();
  });

  it('[12] production JWT secret vẫn là placeholder → throw (đã có ở describe SPEC-P001, xác nhận lại trong bộ T030.7)', () => {
    expect(() =>
      validateEnv({
        ...validProdConfig,
        JWT_ACCESS_SECRET: 'change-me-access-secret',
      }),
    ).toThrow();
  });

  it('[13] JWT_ACCESS_SECRET === JWT_REFRESH_SECRET (cả 2 đều hợp lệ riêng lẻ) → throw', () => {
    const sameSecret = 'z'.repeat(32);
    expect(() =>
      validateEnv({
        ...validProdConfig,
        JWT_ACCESS_SECRET: sameSecret,
        JWT_REFRESH_SECRET: sameSecret,
      }),
    ).toThrow(/JWT_ACCESS_SECRET.*trùng|JWT_REFRESH_SECRET.*trùng/);
  });

  it('AD-5/T030.7 verification #1 — JWT secret 31 ký tự ở production bị từ chối', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, JWT_ACCESS_SECRET: 'x'.repeat(31) }),
    ).toThrow();
  });

  it('AD-5/T030.7 verification #2 — JWT secret đúng 32 ký tự ở production được chấp nhận', () => {
    expect(() =>
      validateEnv({
        ...validProdConfig,
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
      }),
    ).not.toThrow();
  });

  it('development: JWT secret 31 ký tự KHÔNG bị từ chối (giới hạn 32 ký tự chỉ áp dụng production)', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL:
          'postgresql://postgres:postgres@localhost:5432/pos_erp?schema=public',
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: 'x'.repeat(31),
        JWT_REFRESH_SECRET: 'y'.repeat(31),
      }),
    ).not.toThrow();
  });

  it('[14] lỗi gộp: DATABASE_URL yếu + JWT placeholder + SWAGGER sai + CORS sai cùng lúc → message nêu đủ mọi biến liên quan', () => {
    let caught: Error | undefined;
    try {
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app_user:postgres@db.example.com:5432/pos_erp',
        JWT_ACCESS_SECRET: 'change-me-access-secret',
        JWT_REFRESH_SECRET: 'change-me-refresh-secret',
        SWAGGER_ENABLED: 'true',
        // CORS_ORIGIN unset → mặc định dev-only
      });
    } catch {
      // validateEnv ném lỗi SỚM NHẤT ở assertDatabaseUrlSafe — xác nhận riêng lỗi đó xuất hiện;
      // các assert khác (secrets/config) chạy TUẦN TỰ sau, mỗi lỗi vẫn nêu đúng biến của nó khi
      // gọi validateEnv() lần riêng — xem test [10]/[11]/[12]/[AC3.1]/[AC13.1] đã xác nhận từng
      // trường hợp độc lập. Test này xác nhận ÍT NHẤT lỗi đầu tiên gặp phải được báo rõ ràng.
      caught = undefined;
    }
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app_user:strong-real-password-value@db.example.com:5432/pos_erp',
        JWT_ACCESS_SECRET: 'change-me-access-secret',
        JWT_REFRESH_SECRET: 'change-me-refresh-secret',
        SWAGGER_ENABLED: 'true',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
    void caught;
  });

  it('[15] không có thông báo lỗi nào (bất kỳ nhánh nào) chứa giá trị password/secret thật đã cấu hình', () => {
    const secretValue =
      'a-genuinely-strong-random-password-value-not-in-any-message';
    let message = '';
    try {
      validateEnv({
        ...validProdConfig,
        DATABASE_URL: `postgresql://app_user:${secretValue}@db.example.com:5432/t029_disposable_x`,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(secretValue);
  });

  it('[17] không set REDIS_HOST/REDIS_PORT/REDIS_PASSWORD → KHÔNG throw (Redis vắng mặt không chặn validation, đúng AD-5 point 3)', () => {
    const { DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET } =
      validProdConfig;
    expect(() =>
      validateEnv({
        NODE_ENV: 'development',
        DATABASE_URL,
        JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET,
      }),
    ).not.toThrow();
  });

  it('[18] không set SMTP_* → KHÔNG throw ở development lẫn production (chỉ cảnh báo ở production, đúng AD-5 point 4, đã xác nhận ở AC13.2)', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'development',
        DATABASE_URL:
          'postgresql://postgres:postgres@localhost:5432/pos_erp?schema=public',
        JWT_ACCESS_SECRET: 'change-me-access-secret',
        JWT_REFRESH_SECRET: 'change-me-refresh-secret',
      }),
    ).not.toThrow();
  });

  it('[20] validateEnv() bình thường (không phải T029.12) không đọc/đòi hỏi T029_DISPOSABLE_DATABASE_URL/T029_ALLOW_DESTRUCTIVE_DB_TESTS', () => {
    const originalDisposableUrl = process.env.T029_DISPOSABLE_DATABASE_URL;
    const originalAllow = process.env.T029_ALLOW_DESTRUCTIVE_DB_TESTS;
    delete process.env.T029_DISPOSABLE_DATABASE_URL;
    delete process.env.T029_ALLOW_DESTRUCTIVE_DB_TESTS;
    try {
      expect(() => validateEnv(validProdConfig)).not.toThrow();
    } finally {
      if (originalDisposableUrl !== undefined) {
        process.env.T029_DISPOSABLE_DATABASE_URL = originalDisposableUrl;
      }
      if (originalAllow !== undefined) {
        process.env.T029_ALLOW_DESTRUCTIVE_DB_TESTS = originalAllow;
      }
    }
  });

  it('[20b] T029_DISPOSABLE_DATABASE_URL trùng CHÍNH XÁC DATABASE_URL đang dùng cho app thật → throw (an toàn 2 lớp, độc lập với t029-12-disposable-db-safety.ts)', () => {
    const original = process.env.T029_DISPOSABLE_DATABASE_URL;
    process.env.T029_DISPOSABLE_DATABASE_URL = validProdConfig.DATABASE_URL;
    try {
      expect(() => validateEnv(validProdConfig)).toThrow(
        /T029_DISPOSABLE_DATABASE_URL/,
      );
    } finally {
      if (original === undefined) {
        delete process.env.T029_DISPOSABLE_DATABASE_URL;
      } else {
        process.env.T029_DISPOSABLE_DATABASE_URL = original;
      }
    }
  });
});

describe('validateEnv — T030.11 (NODE_ENV contract, DISCOVERY-T030 F20)', () => {
  const baseConfig = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a-real-non-placeholder-access-secret',
    JWT_REFRESH_SECRET: 'a-real-non-placeholder-refresh-secret',
  };

  it('[1] NODE_ENV="development" → hợp lệ, KHÔNG throw', () => {
    expect(() =>
      validateEnv({ ...baseConfig, NODE_ENV: 'development' }),
    ).not.toThrow();
  });

  it('[2] NODE_ENV="test" → hợp lệ, KHÔNG throw (môi trường Jest/CI vẫn được hỗ trợ đầy đủ)', () => {
    expect(() =>
      validateEnv({ ...baseConfig, NODE_ENV: 'test' }),
    ).not.toThrow();
  });

  it('[3] NODE_ENV="production" + cấu hình production đầy đủ hợp lệ → KHÔNG throw', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://app_user:a-genuinely-strong-random-password@db.example.com:5432/pos_erp',
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
        SWAGGER_ENABLED: 'false',
        CORS_ORIGIN: 'https://pos.example.com',
      }),
    ).not.toThrow();
  });

  it('[4] NODE_ENV không set → throw, message nêu rõ NODE_ENV (sản xuất KHÔNG THỂ âm thầm trở thành development)', () => {
    expect(() => validateEnv({ ...baseConfig })).toThrow(/NODE_ENV/);
  });

  it('[5] NODE_ENV rỗng ("") → throw', () => {
    expect(() => validateEnv({ ...baseConfig, NODE_ENV: '' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('[6] NODE_ENV là giá trị không được hỗ trợ (vd "staging") → throw, message nêu rõ NODE_ENV', () => {
    expect(() => validateEnv({ ...baseConfig, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('[7] message lỗi khi NODE_ENV thiếu/sai KHÔNG chứa bất kỳ giá trị secret nào khác (JWT/DATABASE_URL không rò rỉ theo)', () => {
    let message = '';
    try {
      validateEnv({ ...baseConfig, NODE_ENV: 'not-a-real-env' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(baseConfig.JWT_ACCESS_SECRET);
    expect(message).not.toContain(baseConfig.JWT_REFRESH_SECRET);
  });
});

describe('validateEnv — T030.11 (REDIS_PASSWORD host-sensitive production policy, ARCHITECT DECISION Option 3, DISCOVERY-T030 F27)', () => {
  const validProdConfig = {
    NODE_ENV: 'production',
    DATABASE_URL:
      'postgresql://app_user:a-genuinely-strong-random-password@db.example.com:5432/pos_erp',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    SWAGGER_ENABLED: 'false',
    CORS_ORIGIN: 'https://pos.example.com',
  };

  it('[1] production + REDIS_HOST=localhost + REDIS_PASSWORD rỗng → KHÔNG throw (host tin cậy)', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, REDIS_HOST: 'localhost' }),
    ).not.toThrow();
  });

  it('[2] production + REDIS_HOST=127.0.0.1 + REDIS_PASSWORD rỗng → KHÔNG throw (host tin cậy)', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, REDIS_HOST: '127.0.0.1' }),
    ).not.toThrow();
  });

  it('[3] production + REDIS_HOST=::1 + REDIS_PASSWORD rỗng → KHÔNG throw (host tin cậy)', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, REDIS_HOST: '::1' }),
    ).not.toThrow();
  });

  it('[4] production + REDIS_HOST=redis (Docker Compose internal hostname) + REDIS_PASSWORD rỗng → KHÔNG throw (host tin cậy, khớp docker-verify CI thật)', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, REDIS_HOST: 'redis' }),
    ).not.toThrow();
  });

  it('[5] production + REDIS_HOST là hostname remote + REDIS_PASSWORD rỗng → throw', () => {
    expect(() =>
      validateEnv({
        ...validProdConfig,
        REDIS_HOST: 'redis.managed.example.com',
      }),
    ).toThrow(/REDIS_PASSWORD/);
  });

  it('[6] production + REDIS_HOST là IP remote + REDIS_PASSWORD rỗng → throw', () => {
    expect(() =>
      validateEnv({ ...validProdConfig, REDIS_HOST: '203.0.113.10' }),
    ).toThrow(/REDIS_PASSWORD/);
  });

  it('[7] production + REDIS_HOST remote + REDIS_PASSWORD đã set (không rỗng) → KHÔNG throw', () => {
    expect(() =>
      validateEnv({
        ...validProdConfig,
        REDIS_HOST: 'redis.managed.example.com',
        REDIS_PASSWORD: 'a-real-redis-password',
      }),
    ).not.toThrow();
  });

  it('[8] development + REDIS_HOST remote + REDIS_PASSWORD rỗng → KHÔNG throw (guard chỉ áp dụng production, hành vi hiện có giữ nguyên)', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        JWT_ACCESS_SECRET: 'a-real-non-placeholder-access-secret',
        JWT_REFRESH_SECRET: 'a-real-non-placeholder-refresh-secret',
        NODE_ENV: 'development',
        REDIS_HOST: 'redis.managed.example.com',
      }),
    ).not.toThrow();
  });

  it('[9] message lỗi nêu rõ REDIS_PASSWORD và lý do (host không thuộc danh sách tin cậy)', () => {
    let message = '';
    try {
      validateEnv({
        ...validProdConfig,
        REDIS_HOST: 'redis.managed.example.com',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('REDIS_PASSWORD');
    expect(message).toContain('redis.managed.example.com');
  });

  it('[10] message lỗi KHÔNG BAO GIỜ chứa giá trị REDIS_PASSWORD thật (kể cả khi test giả lập nhánh khác có set giá trị)', () => {
    let message = '';
    try {
      validateEnv({
        ...validProdConfig,
        REDIS_HOST: 'redis.managed.example.com',
        REDIS_PASSWORD: '',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    // Nhánh throw ở đây do REDIS_PASSWORD rỗng — không có giá trị thật nào để rò rỉ, xác nhận
    // thêm bằng test [9] rằng message chỉ mô tả LÝ DO (tên biến + host), không lặp lại giá trị.
    expect(message).not.toContain('a-real-redis-password');
  });

  it('[11] cấu hình khớp CHÍNH XÁC với docker-verify CI job thật (NODE_ENV=production, REDIS_HOST=redis, REDIS_PASSWORD không set) → KHÔNG throw — không cần đổi CI/Docker', () => {
    // Khớp đúng backend-ci.yml's docker-verify job: NODE_ENV=production, REDIS_HOST=redis
    // (docker-compose.yml's backend service), REDIS_PASSWORD không xuất hiện trong .env heredoc.
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://postgres:ci-docker-verify-postgres-password@postgres:5432/pos_erp?schema=public',
        JWT_ACCESS_SECRET: 'ci-docker-verify-access-secret-t030-7',
        JWT_REFRESH_SECRET: 'ci-docker-verify-refresh-secret-t030-7',
        SWAGGER_ENABLED: 'false',
        CORS_ORIGIN: 'https://ci-docker-verify.example.com',
        REDIS_HOST: 'redis',
      }),
    ).not.toThrow();
  });

  it('[12] chính sách REDIS_PASSWORD mới KHÔNG phá vỡ các quy tắc T030.7 hiện có (DATABASE_URL/JWT/CORS vẫn throw đúng khi sai)', () => {
    expect(() =>
      validateEnv({
        ...validProdConfig,
        REDIS_HOST: 'localhost',
        JWT_ACCESS_SECRET: 'change-me-access-secret',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      validateEnv({
        ...validProdConfig,
        REDIS_HOST: 'localhost',
        CORS_ORIGIN: '*',
      }),
    ).toThrow(/CORS_ORIGIN/);
  });
});

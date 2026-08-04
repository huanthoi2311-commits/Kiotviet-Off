/**
 * T030.7 — nguồn kiểm tra `DATABASE_URL` DUY NHẤT (ngoài Prisma tự parse `DATABASE_URL` cho kết
 * nối thật, không liên quan tới file này). KHÔNG BAO GIỜ đưa mật khẩu đã parse vào chuỗi lỗi trả
 * về — mọi lý do lỗi chỉ mô tả VẤN ĐỀ GÌ, không lặp lại giá trị nhạy cảm.
 */

/**
 * Giá trị mật khẩu Postgres đã biết là yếu/mặc định công khai — theo đúng danh sách "at minimum"
 * trong ARCHITECT AUTHORIZATION T030.7. Không thêm suy đoán ngoài danh sách này (tránh false
 * positive với mật khẩu thật ngẫu nhiên chỉ vì "trông giống").
 */
const WEAK_PRODUCTION_PASSWORDS = new Set<string>([
  'postgres',
  'password',
  'change-me-postgres-password',
  'Admin@123',
]);

/**
 * Tiền tố database dùng riêng cho hạ tầng test hủy-được của T029.12
 * (`backend/test/t029-12-disposable-db-safety.ts`'s `DISPOSABLE_PREFIX`) — khai báo lại độc lập
 * ở đây (không import từ `backend/test/`, vì `backend/src/` không được phụ thuộc ngược vào code
 * test) để nhận diện DATABASE_URL production trỏ nhầm vào 1 database test/disposable.
 */
const DISPOSABLE_DATABASE_NAME_PREFIX = 't029_disposable_';
const OBVIOUS_TEST_DATABASE_NAMES = new Set<string>(['test']);

export interface ValidateDatabaseUrlOptions {
  isProduction: boolean;
  /** Giá trị `T029_DISPOSABLE_DATABASE_URL` hiện tại (nếu process có set) — không phải field của EnvironmentVariables, đọc trực tiếp process.env ở nơi gọi. */
  disposableTestUrl?: string;
}

function normalizeForComparison(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Trả về danh sách lý do lỗi (rỗng = hợp lệ). Không bao giờ chứa password đã parse. */
export function validateDatabaseUrl(
  raw: string,
  options: ValidateDatabaseUrlOptions,
): string[] {
  const errors: string[] = [];

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return ['không parse được thành URL hợp lệ'];
  }

  const protocol = parsed.protocol.replace(/:$/, '');
  if (protocol !== 'postgresql' && protocol !== 'postgres') {
    errors.push(
      `protocol phải là postgresql/postgres (hiện tại: "${protocol}")`,
    );
  }
  if (!parsed.hostname) {
    errors.push('thiếu host');
  }
  const databaseName = parsed.pathname.replace(/^\//, '');
  if (!databaseName) {
    errors.push('thiếu tên database');
  }
  if (!parsed.username) {
    errors.push('thiếu username');
  }

  if (options.isProduction) {
    if (!parsed.password) {
      errors.push('thiếu password (bắt buộc ở production)');
    } else {
      // `URL.password` trả về dạng ĐÃ percent-encode (vd "@" trong password gốc → "%40" khi
      // serialize lại) — phải decode trước khi so khớp với danh sách yếu (viết dạng thường/chưa
      // encode), nếu không "Admin@123" sẽ không khớp "Admin%40123" và lọt qua kiểm tra.
      const decodedPassword = decodeURIComponent(parsed.password);
      if (WEAK_PRODUCTION_PASSWORDS.has(decodedPassword)) {
        errors.push('password là giá trị yếu/mặc định đã biết công khai');
      }
    }
    if (
      databaseName &&
      (databaseName.startsWith(DISPOSABLE_DATABASE_NAME_PREFIX) ||
        OBVIOUS_TEST_DATABASE_NAMES.has(databaseName.toLowerCase()))
    ) {
      errors.push(
        'tên database trông như database test/disposable, không phải production thật',
      );
    }
  }

  if (
    options.disposableTestUrl &&
    normalizeForComparison(raw) ===
      normalizeForComparison(options.disposableTestUrl)
  ) {
    errors.push(
      'trùng với T029_DISPOSABLE_DATABASE_URL — không được dùng chung',
    );
  }

  return errors;
}

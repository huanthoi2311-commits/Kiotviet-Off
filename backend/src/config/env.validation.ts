import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';
import {
  DEFAULT_CORS_ORIGIN,
  isWellFormedOrigin,
  parseCorsOrigins,
} from './cors.util';
import { validateDatabaseUrl } from './database-url.util';

/** T030.7 — production yêu cầu JWT secret tối thiểu 32 ký tự (chính sách độ mạnh cơ sở của dự
 * án — KHÔNG phải bằng chứng entropy 256-bit; secret thật vẫn phải sinh ngẫu nhiên thật và cấp
 * qua cơ chế quản lý secret khi triển khai, không phải chỉ cần đủ độ dài 32 ký tự). */
export const MIN_JWT_SECRET_LENGTH = 32;

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * SPEC-P001 Rev1, Item 3 — nguồn sự thật DUY NHẤT cho 2 giá trị placeholder JWT secret đã đóng
 * gói sẵn trong `.env.example`. Không được chép lại literal string này ở bất kỳ nơi nào khác
 * (kể cả test) — mọi chỗ cần biết giá trị placeholder phải tham chiếu object này.
 */
export const PRODUCTION_SECRET_PLACEHOLDERS = {
  JWT_ACCESS_SECRET: 'change-me-access-secret',
  JWT_REFRESH_SECRET: 'change-me-refresh-secret',
} as const;

class EnvironmentVariables {
  // T030.11 (DISCOVERY-T030 F20) — TRƯỚC ĐÂY có `@IsOptional()` + mặc định `NodeEnv.Development`:
  // một deployment production quên set biến này sẽ ÂM THẦM chạy như development, bỏ qua toàn bộ
  // `assertProductionSecretsChanged`/`assertProductionConfigSafe`/`warnIfProductionSmtpIncomplete`
  // (cả 3 đều chỉ kiểm tra `if (config.NODE_ENV !== NodeEnv.Production) return;`). Bắt buộc phải
  // khai báo tường minh — cùng pattern với `DATABASE_URL`/`JWT_ACCESS_SECRET` (@IsNotEmpty(), không
  // có default) — đã xác nhận an toàn cho mọi luồng hợp pháp hiện có trước khi đổi: `.env.example`
  // đã sẵn `NODE_ENV=development` tường minh; `backend-ci.yml`'s cả 3 job đều tự set NODE_ENV riêng
  // trong `env:`; `Dockerfile`'s runtime stage có `ENV NODE_ENV=production` (dòng 17); kịch bản
  // `production-bring-up.ts`/`prisma/seed.ts` không gọi `validateEnv()` nên không bị ảnh hưởng.
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsOptional()
  REDIS_HOST: string = 'localhost';

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '30d';

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:3001';

  // T030.7 — chỉ chấp nhận đúng 2 giá trị 'true'/'false' (strict boolean parsing); trước đây
  // @IsString() chấp nhận MỌI chuỗi (vd "yes"), rồi bị configuration.ts âm thầm hiểu là "false"
  // vì so sánh `=== 'true'` — hành vi gây nhầm lẫn thật, không phải giả định.
  @IsString()
  @IsIn(['true', 'false'])
  @IsOptional()
  SWAGGER_ENABLED: string = 'true';

  // T032.01E (R1 recovery, Architect Decision) — cùng strict boolean parsing với SWAGGER_ENABLED
  // (T030.7) và cùng lý do: chỉ 'true'/'false' được chấp nhận, không suy đoán từ chuỗi khác.
  @IsString()
  @IsIn(['true', 'false'])
  @IsOptional()
  METRICS_ENABLED: string = 'false';

  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  SMTP_PORT: number = 587;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASS?: string;

  @IsString()
  @IsOptional()
  SMTP_FROM: string = 'no-reply@pos-erp.local';
}

/**
 * SPEC-P001 Rev1, Item 3, mở rộng bởi T030.7 (ARCHITECT DECISION — Option 2 APPROVED) — chặn khởi
 * động ở production nếu JWT_ACCESS_SECRET/JWT_REFRESH_SECRET: (a) vẫn còn giá trị placeholder mặc
 * định đóng gói trong `.env.example` (đọc từ `PRODUCTION_SECRET_PLACEHOLDERS`, nguồn sự thật duy
 * nhất); (b) ngắn hơn `MIN_JWT_SECRET_LENGTH` (32 ký tự — chính sách độ mạnh cơ sở, KHÔNG phải
 * bằng chứng entropy 256-bit); (c) 2 secret giống hệt nhau. Không chạy ngoài `NODE_ENV=production`.
 * Giữ nguyên format message gốc `"Production startup refused because default secrets are still in
 * use: ..."` khi lỗi CHỈ do placeholder (test [3] cũ xác nhận đúng substring này) — lỗi độ
 * dài/trùng nhau dùng message riêng, gộp cùng 1 lần throw (Error có thể nhiều dòng) để không bỏ
 * sót lỗi nào, không dừng lại ở lỗi đầu tiên. KHÔNG BAO GIỜ in giá trị secret thật vào message.
 */
function assertProductionSecretsChanged(config: EnvironmentVariables): void {
  if (config.NODE_ENV !== NodeEnv.Production) {
    return;
  }

  const isAccessPlaceholder =
    config.JWT_ACCESS_SECRET ===
    PRODUCTION_SECRET_PLACEHOLDERS.JWT_ACCESS_SECRET;
  const isRefreshPlaceholder =
    config.JWT_REFRESH_SECRET ===
    PRODUCTION_SECRET_PLACEHOLDERS.JWT_REFRESH_SECRET;

  const placeholderVariables: string[] = [];
  if (isAccessPlaceholder) placeholderVariables.push('JWT_ACCESS_SECRET');
  if (isRefreshPlaceholder) placeholderVariables.push('JWT_REFRESH_SECRET');

  const otherIssues: string[] = [];
  if (
    !isAccessPlaceholder &&
    config.JWT_ACCESS_SECRET.length < MIN_JWT_SECRET_LENGTH
  ) {
    otherIssues.push(
      `JWT_ACCESS_SECRET (độ dài dưới mức tối thiểu ${MIN_JWT_SECRET_LENGTH} ký tự)`,
    );
  }
  if (
    !isRefreshPlaceholder &&
    config.JWT_REFRESH_SECRET.length < MIN_JWT_SECRET_LENGTH
  ) {
    otherIssues.push(
      `JWT_REFRESH_SECRET (độ dài dưới mức tối thiểu ${MIN_JWT_SECRET_LENGTH} ký tự)`,
    );
  }
  // Chỉ báo "trùng nhau" khi CẢ HAI đều đã "sạch" riêng lẻ (không placeholder, đủ độ dài) — nếu
  // 1 trong 2 đã có lý do lỗi khác, lý do đó đã đủ rõ ràng, không cần báo thêm trùng lặp.
  const bothCleanIndividually =
    !isAccessPlaceholder &&
    !isRefreshPlaceholder &&
    config.JWT_ACCESS_SECRET.length >= MIN_JWT_SECRET_LENGTH &&
    config.JWT_REFRESH_SECRET.length >= MIN_JWT_SECRET_LENGTH;
  if (
    bothCleanIndividually &&
    config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET
  ) {
    otherIssues.push(
      'JWT_ACCESS_SECRET (trùng với JWT_REFRESH_SECRET)',
      'JWT_REFRESH_SECRET (trùng với JWT_ACCESS_SECRET)',
    );
  }

  const messages: string[] = [];
  if (placeholderVariables.length > 0) {
    messages.push(
      `Production startup refused because default secrets are still in use: ${placeholderVariables.join(', ')}`,
    );
  }
  if (otherIssues.length > 0) {
    messages.push(
      `Production startup refused because unsafe JWT secrets are in use: ${otherIssues.join(', ')}`,
    );
  }

  if (messages.length > 0) {
    throw new Error(messages.join('\n'));
  }
}

/**
 * SPEC-T023 Finding 3 (FR3.1/FR3.2) / Finding 13 (FR13.1), mở rộng bởi T030.6 (RFC-T030 §5 Option D
 * Decision 1) — cùng pattern với `assertProductionSecretsChanged` (chỉ chạy ở production, báo
 * TOÀN BỘ biến sai trong 1 lần ném lỗi, KHÔNG dừng lại ở biến đầu tiên — giữ nguyên hành vi này vì
 * `env.validation.spec.ts` test [3-CORS] xác nhận SWAGGER_ENABLED và CORS_ORIGIN cùng lỗi phải
 * cùng xuất hiện trong 1 message). Swagger PHẢI được tắt tường minh (`SWAGGER_ENABLED=false`) ở
 * production. CORS_ORIGIN PHẢI: khác giá trị mặc định đóng gói sẵn (dev-only); không rỗng sau khi
 * parse; không chứa ký tự đại diện `*`; mọi origin đều hợp lệ về cú pháp (`isWellFormedOrigin`).
 * Cùng 1 hàm parse (`parseCorsOrigins`) mà `configuration.ts` dùng cho REST/WebSocket — không parse
 * lại theo cách khác ở đây.
 */
function assertProductionConfigSafe(config: EnvironmentVariables): void {
  if (config.NODE_ENV !== NodeEnv.Production) {
    return;
  }

  const offendingVariables: string[] = [];
  if (config.SWAGGER_ENABLED !== 'false') {
    offendingVariables.push('SWAGGER_ENABLED');
  }

  const corsOrigins = parseCorsOrigins(config.CORS_ORIGIN);
  const corsReasons: string[] = [];
  if (config.CORS_ORIGIN === DEFAULT_CORS_ORIGIN) {
    corsReasons.push('vẫn là giá trị mặc định dev-only');
  }
  if (corsOrigins.length === 0) {
    corsReasons.push('danh sách origin rỗng sau khi phân tích');
  }
  if (corsOrigins.includes('*')) {
    corsReasons.push('chứa ký tự đại diện "*"');
  }
  const malformedOrigins = corsOrigins.filter(
    (origin) => origin !== '*' && !isWellFormedOrigin(origin),
  );
  if (malformedOrigins.length > 0) {
    corsReasons.push(
      `chứa origin không hợp lệ: ${malformedOrigins.join(', ')}`,
    );
  }
  if (corsReasons.length > 0) {
    offendingVariables.push(`CORS_ORIGIN (${corsReasons.join('; ')})`);
  }

  if (offendingVariables.length > 0) {
    throw new Error(
      `Production startup refused because unsafe configuration is still in use: ${offendingVariables.join(', ')}`,
    );
  }
}

/**
 * SPEC-T023 Finding 13 (FR13.2) — CHỈ cảnh báo (không chặn khởi động, khác hẳn
 * `assertProductionConfigSafe`) khi SMTP chưa cấu hình đủ ở production — Forgot Password OTP
 * (Prompt 014) sẽ chỉ log ra console thay vì gửi email thật, đúng hành vi `MailService` đã có sẵn.
 */
function warnIfProductionSmtpIncomplete(config: EnvironmentVariables): void {
  if (config.NODE_ENV !== NodeEnv.Production) {
    return;
  }
  if (!config.SMTP_HOST) {
    console.warn(
      'CẢNH BÁO: SMTP_HOST chưa được cấu hình ở production — email (Forgot Password OTP) sẽ không được gửi thật, chỉ log ra console.',
    );
  }
}

/**
 * T030.11 (DISCOVERY-T030 F27, ARCHITECT DECISION — Option 3 APPROVED) — thực thi REDIS_PASSWORD
 * ở production theo host, KHÔNG toàn cục. Danh sách host tin cậy này ĐÓNG (chỉ 4 giá trị đã được
 * Architect phê duyệt tường minh — "Do not add any other hostname exemption without a new
 * Architect Decision") — khớp chính xác 2 topology đã xác nhận đang chạy thật với Redis không mật
 * khẩu: local Hybrid (`localhost`/`127.0.0.1`/`::1`) và `docker-compose.yml`'s service Redis nội
 * bộ (hostname Docker Compose `redis`, dùng bởi `docker-verify` CI job — xem
 * `docker-compose.yml`'s backend service `REDIS_HOST: redis`). Bất kỳ REDIS_HOST nào KHÁC ở
 * production (remote/managed Redis) bắt buộc phải có REDIS_PASSWORD — fail-fast, KHÔNG warn-only
 * (khác `warnIfProductionSmtpIncomplete` — Architect đã chỉ rõ "Do not use warn-only behavior for
 * remote production Redis"). KHÔNG BAO GIỜ in giá trị REDIS_PASSWORD thật vào message lỗi.
 */
const TRUSTED_LOCAL_REDIS_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'redis',
]);

function assertProductionRedisPasswordSet(config: EnvironmentVariables): void {
  if (config.NODE_ENV !== NodeEnv.Production) {
    return;
  }
  if (TRUSTED_LOCAL_REDIS_HOSTS.has(config.REDIS_HOST)) {
    return;
  }
  if (!config.REDIS_PASSWORD) {
    throw new Error(
      `Production startup refused because REDIS_PASSWORD is required: REDIS_HOST "${config.REDIS_HOST}" is not one of the trusted local/Compose hosts (${[...TRUSTED_LOCAL_REDIS_HOSTS].join(', ')})`,
    );
  }
}

/**
 * T030.7 — DATABASE_URL: kiểm tra cấu trúc (parse được, protocol postgresql/postgres, có
 * host/tên-database/username) ở MỌI môi trường; kiểm tra an toàn (bắt buộc có password, password
 * không nằm trong danh sách yếu đã biết, tên database không giống database test/disposable) CHỈ ở
 * production; kiểm tra không trùng `T029_DISPOSABLE_DATABASE_URL` ở MỌI môi trường (biến này CHỦ
 * Ý không thuộc `EnvironmentVariables` — T030.4 Decision 2 — đọc trực tiếp `process.env` tại đây,
 * không thêm vào schema chính). KHÔNG BAO GIỜ in giá trị DATABASE_URL/password vào message lỗi —
 * `validateDatabaseUrl()` (`database-url.util.ts`) tự đảm bảo điều này, ở đây chỉ ghép câu.
 */
function assertDatabaseUrlSafe(config: EnvironmentVariables): void {
  const errors = validateDatabaseUrl(config.DATABASE_URL, {
    isProduction: config.NODE_ENV === NodeEnv.Production,
    disposableTestUrl: process.env.T029_DISPOSABLE_DATABASE_URL,
  });

  if (errors.length > 0) {
    throw new Error(
      `DATABASE_URL không hợp lệ hoặc không an toàn: ${errors.join('; ')}`,
    );
  }
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Config validation failed:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  assertDatabaseUrlSafe(validatedConfig);
  assertProductionSecretsChanged(validatedConfig);
  assertProductionConfigSafe(validatedConfig);
  assertProductionRedisPasswordSet(validatedConfig);
  warnIfProductionSmtpIncomplete(validatedConfig);

  return validatedConfig;
}

import { parseCorsOrigins } from './cors.util';

export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  cors: {
    // T030.6 — nguồn phân tích DUY NHẤT (backend/src/config/cors.util.ts), dùng chung cho REST
    // (main.ts) VÀ WebSocket (main.ts + websocket/validated-cors.adapter.ts). KHÔNG dùng '*' khi
    // credentials:true (trình duyệt sẽ tự chặn, và về bảo mật cũng không nên cho phép mọi origin
    // gửi cookie).
    origins: parseCorsOrigins(process.env.CORS_ORIGIN),
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },
  // T051.08B — transport (HTTP/HTTPS) của `refresh_token` cookie, tách khỏi `env` (NODE_ENV) ở
  // trên: khi AUTH_COOKIE_SECURE chưa được set, GIỮ NGUYÊN hành vi cũ (secure = production) để
  // không phá vỡ mọi dev/test hiện có; khi được set tường minh, override — gói triển khai V1
  // (production + HTTP localhost, không TLS) set AUTH_COOKIE_SECURE=false tường minh trong
  // docker-compose.yml, một deployment HTTPS tương lai set =true.
  auth: {
    cookieSecure:
      process.env.AUTH_COOKIE_SECURE !== undefined
        ? process.env.AUTH_COOKIE_SECURE === 'true'
        : process.env.NODE_ENV === 'production',
  },
  swagger: {
    enabled: (process.env.SWAGGER_ENABLED ?? 'true') === 'true',
    path: process.env.SWAGGER_PATH ?? 'api/docs',
  },
  // T032.01E (R1 recovery, Architect Decision) — mặc định TẮT, khác hẳn swagger (mặc định BẬT ở
  // dev). Khi bật, MetricsController vẫn chỉ cho Platform Admin truy cập (xem
  // metrics-enabled.guard.ts) — cờ này chỉ quyết định endpoint có tồn tại hay không (404 khi tắt).
  metrics: {
    enabled: (process.env.METRICS_ENABLED ?? 'false') === 'true',
  },
  mail: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? 'no-reply@pos-erp.local',
  },
});

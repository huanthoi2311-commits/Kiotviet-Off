/**
 * T030.6 — nguồn phân tích/kiểm tra CORS_ORIGIN DUY NHẤT của toàn bộ backend. `configuration.ts`
 * (REST, expose qua ConfigService cho `main.ts`) VÀ `env.validation.ts` (kiểm tra an toàn
 * production) đều gọi các hàm ở đây thay vì tự đọc biến môi trường CORS_ORIGIN/tự parse riêng.
 * WebSocket (`main.ts` + `websocket/validated-cors.adapter.ts`) nhận origin đã parse qua
 * ConfigService — KHÔNG tự đọc biến môi trường CORS_ORIGIN ở bất kỳ đâu khác trong toàn bộ backend.
 */

export const DEFAULT_CORS_ORIGIN = 'http://localhost:3001';

/** Danh sách whitelist origin, phân tách bởi dấu phẩy, trim khoảng trắng, loại bỏ mục rỗng. */
export function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Origin cho phép nếu KHÔNG có `Origin` header (curl, server-to-server, health check...) HOẶC
 * origin nằm trong whitelist đã validate — dùng bởi REST (`main.ts`'s `enableCors` callback).
 * WebSocket không cần hàm này: Socket.IO tự so khớp mảng origin trực tiếp (không có khái niệm
 * "request không kèm Origin" cho một handshake trình duyệt thật) — xem `validated-cors.adapter.ts`.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
): boolean {
  return !origin || allowedOrigins.includes(origin);
}

/**
 * Một origin hợp lệ là scheme+host[:port] thuần túy (http/https), không path/query/hash/trailing
 * slash — dùng `URL.origin` để chuẩn hóa rồi so khớp lại chính xác với chuỗi gốc.
 */
export function isWellFormedOrigin(origin: string): boolean {
  if (origin === '*') return false;
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      (url.protocol === 'http:' || url.protocol === 'https:')
    );
  } catch {
    return false;
  }
}

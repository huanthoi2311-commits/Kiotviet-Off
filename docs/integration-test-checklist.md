# Integration Test Checklist — Gate B

**Mục đích:** danh sách thao tác cụ thể để xác minh Gate B (xem [release-gates.md](./release-gates.md)) trên môi trường có Docker thật. Chạy tuần tự từ trên xuống — mỗi mục có lệnh gợi ý và kết quả kỳ vọng.

**Điều kiện tiên quyết:** Docker Desktop (hoặc Docker Engine) đã cài, cổng `5432`/`6379`/`3000` trống.

---

## 0. Khởi động hạ tầng

```bash
cd "kiotviet off"
docker compose up -d postgres redis
docker compose ps   # cả 2 service phải "healthy"
```

```bash
cd backend
cp .env.example .env   # nếu chưa có, rồi điền JWT secret thật (không dùng giá trị mẫu ở production)
npm install
npx prisma migrate deploy
npm run prisma:seed
```

**Kỳ vọng:** `migrate deploy` áp dụng đủ 3 migration (`init`, `add_refresh_token_last_used_at`, `session_and_permission_version`) không lỗi. Seed in ra `Đăng nhập thử: admin@pos-erp.local / Admin@123`.

☐ Đạt

---

## 1. PostgreSQL thật

```bash
npm run start:dev
curl http://localhost:3000/health
```

**Kỳ vọng:** JSON `{"success":true,"data":{"status":"ok","dependencies":{"database":"up","redis":"up"}}}`.

☐ Đạt — ☐ Không đạt (ghi lỗi: ______________________)

## 2. Redis thật

Xem log khi start: KHÔNG có dòng `Redis error`. `dependencies.redis` ở bước 1 phải là `"up"`.

☐ Đạt

## 3. BullMQ

Kích hoạt qua bước 8 (Forgot Password) — job `send-otp-email` phải chuyển trạng thái `completed` (kiểm tra qua log hoặc Redis `KEYS bull:mail:*`).

☐ Đạt

## 4. Mail

Nếu chưa cấu hình SMTP thật (`SMTP_HOST` rỗng trong `.env`): log phải in `SMTP chưa cấu hình... log OTP thay vì gửi thật: to=... otp=...` — lấy OTP từ log này để test bước 8.
Nếu đã cấu hình SMTP thật: kiểm tra hộp thư nhận được mail OTP.

☐ Đạt

## 5. Login (organizationSlug + email)

```bash
curl -i -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Client-Type: mobile" \
  -d '{"organizationSlug":"default","email":"admin@pos-erp.local","password":"Admin@123"}'
```

**Kỳ vọng:** HTTP 200, body có `accessToken`, `refreshToken`, `userInfo.permissions` là mảng khoảng 140 permission code (role `owner` seed full quyền).

Test thêm với `-H "X-Client-Type: web"` (hoặc bỏ header): response **không có** `refreshToken` trong body, thay vào đó header `Set-Cookie: refresh_token=...; HttpOnly; SameSite=Lax`.

☐ Đạt (mobile) — ☐ Đạt (web)

## 6. Refresh

```bash
curl -i -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -H "X-Client-Type: mobile" \
  -d '{"refreshToken":"<refreshToken bước 5>"}'
```

**Kỳ vọng:** HTTP 200, `accessToken`/`refreshToken` MỚI (khác giá trị cũ). Gọi lại với token cũ → HTTP 401 `AUTH_004` (refresh token reused).

☐ Đạt

## 7. Logout / Logout All

```bash
curl -i -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -H "X-Client-Type: mobile" -d '{"refreshToken":"<refreshToken hiện tại>"}'
```

**Kỳ vọng:** HTTP 204. Gọi `/auth/refresh` lại với token vừa logout → 401.

Test `logout-all` tương tự sau khi login từ ≥ 2 "thiết bị" (đổi `User-Agent` header) — kiểm tra `GET /auth/sessions` rỗng sau đó.

☐ Đạt

## 8. Forgot Password / OTP (cooldown + rate limit)

```bash
curl -i -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"organizationSlug":"default","email":"admin@pos-erp.local"}'
```

**Kỳ vọng:** HTTP 204. Gọi lại ngay lập tức → HTTP 429 `OTP_006` (cooldown). Đợi 60s, gọi lại → HTTP 204. Lặp lại đủ 6 lần trong 1 giờ → lần thứ 6 trả 429 `OTP_001`.

Lấy OTP từ log (mục 4), verify:

```bash
curl -i -X POST http://localhost:3000/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"organizationSlug":"default","email":"admin@pos-erp.local","otp":"<otp từ log>"}'
```

**Kỳ vọng:** HTTP 204. Sau đó `reset-password` với mật khẩu mới → HTTP 204. Login lại bằng mật khẩu mới thành công; **mọi session cũ đã bị revoke** (refresh token cũ trả 401).

☐ Đạt

## 9. Session Management

```bash
curl http://localhost:3000/api/v1/auth/sessions -H "Authorization: Bearer <accessToken>"
```

**Kỳ vọng:** mảng session, mỗi phần tử có `browser`, `os` (parse từ `User-Agent` thật), `clientType`, `lastActivityAt`. `country`/`city` có thể `null` khi test từ IP nội bộ/loopback (bình thường — `geoip-lite` không phân giải được IP private).

`DELETE /auth/sessions/:id` với id của chính session khác → session đó biến mất khỏi danh sách.

☐ Đạt

## 10. RBAC — permissionVersion invalidation

1. Login lấy `accessToken` A.
2. Admin khác (hoặc cùng user nếu có quyền `role:update`) gọi `POST /roles/:id/permissions` đổi quyền của role mà user đang giữ.
3. Gọi lại API bất kỳ cần auth bằng `accessToken` A (chưa hết hạn 15 phút).

**Kỳ vọng:** HTTP 401 `AUTH_006` (permission version mismatch) — access token cũ bị vô hiệu ngay cả khi chưa hết hạn theo thời gian.

☐ Đạt

## 11. Swagger UI

Mở trình duyệt `http://localhost:3000/api/docs` — thử trực tiếp `POST /auth/login` qua "Try it out".

☐ Đạt

## 12. Bộ kiểm thử API tự động (Postman/Newman)

Xuất Postman Collection từ Swagger (`/api/docs-json`) hoặc viết thủ công, chạy:

```bash
newman run pos-erp-auth.postman_collection.json --env-var baseUrl=http://localhost:3000
```

**Kỳ vọng:** toàn bộ request pass. *(Chưa có collection sẵn trong repo — cần tạo khi thực hiện Gate B lần đầu.)*

☐ Đạt

---

## Tổng kết

| Mục | Đạt? |
|---|---|
| 1. PostgreSQL | ☐ |
| 2. Redis | ☐ |
| 3. BullMQ | ☐ |
| 4. Mail | ☐ |
| 5. Login | ☐ |
| 6. Refresh | ☐ |
| 7. Logout/Logout All | ☐ |
| 8. Forgot Password/OTP | ☐ |
| 9. Session Management | ☐ |
| 10. RBAC permissionVersion | ☐ |
| 11. Swagger UI | ☐ |
| 12. Postman/Newman | ☐ |

**Tất cả 12/12 đạt → cập nhật [release-gates.md](./release-gates.md): Gate B = PASS.**

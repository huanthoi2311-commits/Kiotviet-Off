# First Customer Checklist — Operator Deployment & Onboarding

**Trạng thái:** Áp dụng cho mô hình đã được Architect chấp thuận (FIRST PAYING CUSTOMER RC —
READY WITH CONDITIONS): 1–5 khách hàng trả phí, vận hành viên quản lý onboarding, hoá đơn thủ công,
đổi plan qua CLI đã duyệt, triển khai Docker Compose, chưa có billing tự động.

**Quyết định Architect đã KHOÁ cho pilot:**
- **Network:** MODE B — TRUSTED-LAN POS (xem "PRE-DEPLOY" §2).
- **Backup:** bản copy off-host là BẮT BUỘC cho Khách hàng #1 (xem "BACKUP").
- **SMTP:** cấu hình cho Khách hàng #1 nếu có thể — tự phục vụ là đường chính, admin reset là dự
  phòng (xem "SMTP / KHÔI PHỤC MẬT KHẨU").

**Mục đích tài liệu này:** gộp các RELEASE CONDITION đã được Architect duyệt thành 1 checklist thực
thi được từng bước cho vận hành viên khi triển khai/onboard Khách hàng #1. Tài liệu này KHÔNG thay
thế `WINDOWS-DEPLOYMENT-RUNBOOK.md`/`BACKUP-RESTORE-RUNBOOK.md` — nó tổng hợp và trỏ tới 2 tài liệu
đó cho chi tiết đầy đủ, chỉ thêm phần tổng hợp/checklist riêng cho tình huống "khách hàng đầu tiên."

**Không có thay đổi hành vi ứng dụng nào trong gói này** — chỉ tài liệu vận hành. Mọi lệnh dưới đây
đã được xác minh tồn tại thật trong repo (không có lệnh hư cấu).

---

## PRE-DEPLOY

### 1. Production Config Checklist

Đặt các biến sau trong `backend\.env` (và root `.env` cho các biến Compose cần) — **không đặt giá
trị thật trong tài liệu này**, chỉ liệt kê mục đích/quy tắc/cách xác minh:

| Biến | Mục đích | Bắt buộc? | Quy tắc production | Cách xác minh | Kết quả an toàn kỳ vọng |
|---|---|---|---|---|---|
| `JWT_ACCESS_SECRET` | Ký access token | Bắt buộc | Không phải placeholder đóng gói, tối thiểu 32 ký tự, khác `JWT_REFRESH_SECRET` | Khởi động `bring-up`, xem log | Khởi động thành công; nếu sai, `bring-up` thoát khác 0 với thông báo rõ biến nào sai |
| `JWT_REFRESH_SECRET` | Ký refresh token | Bắt buộc | Như trên | Như trên | Như trên |
| `SIGNUP_SECRET` | Bảo vệ luồng trial signup | Bắt buộc | Không phải placeholder | Như trên | Như trên |
| `FORGOT_PASSWORD_OTP_SECRET` | HMAC mã OTP quên mật khẩu | Bắt buộc | Không phải placeholder | Như trên | Như trên |
| `FIRST_ADMIN_PASSWORD` | Mật khẩu quản trị viên đầu tiên | Bắt buộc | Không phải placeholder đóng gói, không phải mật khẩu demo công khai (`Admin@123`), tối thiểu 8 ký tự | Như trên | Như trên |
| `DATABASE_URL` | Kết nối Postgres | Bắt buộc | Đúng cấu trúc `postgresql://...`, không phải URL test dùng-1-lần | Như trên | Như trên |
| `REDIS_HOST`/`REDIS_PASSWORD` | Kết nối Redis | `REDIS_PASSWORD` bắt buộc NẾU `REDIS_HOST` không phải host Compose nội bộ tin cậy | Nếu dùng Redis từ xa/managed → bắt buộc có mật khẩu | Như trên | Như trên |
| `CORS_ORIGIN` | Whitelist origin frontend | Bắt buộc | Không phải giá trị dev mặc định, không rỗng, không chứa `*`, mỗi origin đúng định dạng | Như trên | Như trên |
| `SWAGGER_ENABLED` | Bật/tắt Swagger UI | Bắt buộc = `false` ở production | Phải là chuỗi `false` tường minh | Như trên; sau khi lên: `curl http://localhost:3000/api/docs` (đường dẫn mặc định, đổi được qua `SWAGGER_PATH`) phải KHÔNG trả trang Swagger | Bring-up từ chối khởi động nếu khác `false` |
| SMTP (`SMTP_HOST`, v.v.) | Gửi email OTP quên mật khẩu | Tuỳ chọn | Nếu bỏ trống, chỉ cảnh báo (không chặn khởi động) — xem mục "SMTP / Khôi phục mật khẩu" bên dưới | Xem log `bring-up`/`backend` lúc khởi động | Có cảnh báo rõ ràng nếu thiếu, không chặn hệ thống chạy |
| Nơi lưu backup (`BACKUP_DIR`) | Thư mục chứa file `.dump` | Tuỳ chọn (mặc định `./backups`) | Không phải thư mục tạm dễ mất | Chạy `npm run ops:backup`, kiểm tra file xuất hiện | File `.dump` > 0 byte tại đúng thư mục |

**Xác minh nhanh mọi guard đang hoạt động:** thử khởi động `bring-up` với 1 biến còn để placeholder
— kỳ vọng thoát khác 0, thông báo rõ tên biến sai (không phải crash mơ hồ). Đây chính là hành vi đã
được CI xác nhận qua `Deployment Smoke` — không cần vận hành viên tự kiểm chứng lại từ đầu, chỉ cần
đối chiếu 1 lần khi triển khai thật.

### 2. Network Exposure — ✅ ARCHITECT DECISION LOCKED: MODE B — TRUSTED-LAN POS

**Quyết định đã khoá cho pilot Khách hàng #1:** ứng dụng được phép truy cập từ các máy POS/client
được uỷ quyền bên trong mạng LAN riêng, tin cậy của khách hàng. **TUYỆT ĐỐI KHÔNG** được chủ ý expose
ra Internet công cộng — không port-forward trên router. Postgres và Redis **KHÔNG ĐƯỢC** expose ra
LAN/Internet công cộng dưới bất kỳ hình thức nào. Firewall host chỉ nên cho phép đúng các cổng ứng
dụng thật sự cần thiết cho client LAN tin cậy.

**Sự thật kỹ thuật hiện tại (chưa đổi gì trong gói tài liệu này):** `docker-compose.yml` map cổng
backend/frontend (`3000`/`3001`) ra tất cả interface mạng của máy host, không chỉ `127.0.0.1` — điều
này **khớp đúng** với MODE B (client LAN cần truy cập được, không chỉ chính máy chủ). Postgres/Redis
đã **đúng sẵn** — KHÔNG map ra host trong file production thật (`docker-compose.yml`, chỉ map trong
`docker-compose.override.yml` dành riêng cho dev, không dùng ở production).

| | **MODE B — TRUSTED-LAN POS (✅ ĐÃ DUYỆT CHO PILOT)** | MODE A — SINGLE-PC (chỉ tham khảo) |
|---|---|---|
| Mức lộ mạng | Mọi thiết bị cùng LAN tin cậy (thu ngân, quầy khác) truy cập được máy chủ | Chỉ máy chủ tự truy cập chính nó |
| Giả định bảo mật | Toàn bộ mạng LAN được coi là tin cậy (không có thiết bị lạ/khách vãng lai chung mạng) | Không có thiết bị khác nào trên cùng mạng có thể/được phép truy cập |
| Kỳ vọng firewall | Firewall Windows cho phép cổng ứng dụng từ dải IP LAN nội bộ, vẫn chặn từ ngoài (không port-forward ra Internet) | Firewall Windows chặn cổng ứng dụng từ mạng ngoài máy chủ |
| Cấu hình Compose hiện tại có đúng không? | **Đúng như hiện tại** — không cần đổi gì | Cần đổi `"3000:3000"`/`"3001:3001"` thành `"127.0.0.1:..."` — thay đổi mã nguồn, ngoài phạm vi tài liệu này, không được chọn cho pilot |

**Không có HTTPS/TLS ở V1** (đúng kiến trúc đã ghi trong `WINDOWS-DEPLOYMENT-RUNBOOK.md` — dịch vụ
chạy HTTP thuần). Đây KHÔNG phải triển khai Internet công cộng — nếu tương lai cần public-facing, đó
là phạm vi hoàn toàn khác (xem roadmap "BEFORE SELF-SERVICE SAAS" trong báo cáo RC).

### 2A. Network Safety Checklist — Khách hàng #1

- [ ] Mạng của khách hàng là private/trusted (không phải Wi-Fi công cộng/khách vãng lai chung dải mạng)
- [ ] Không có port-forward trên router cho cổng backend/frontend
- [ ] Postgres KHÔNG được publish ra LAN/Internet công cộng
- [ ] Redis KHÔNG được publish ra LAN/Internet công cộng
- [ ] Firewall host đã được rà soát
- [ ] Chỉ đúng các cổng ứng dụng cần thiết mới truy cập được từ LAN tin cậy
- [ ] Ứng dụng KHÔNG bị chủ ý expose ra Internet công cộng

---

## DEPLOY

Làm theo `WINDOWS-DEPLOYMENT-RUNBOOK.md` §1-5 đầy đủ. Tóm tắt lệnh cho tham chiếu nhanh (đã xác
minh đúng với repo hiện tại):

```powershell
# Build + khởi động toàn bộ stack (Postgres/Redis/bring-up/Backend/Frontend)
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml up -d --wait

# Trạng thái từng service
docker compose -f docker-compose.yml ps
```

Kỳ vọng: mọi service `running (healthy)` (riêng `bring-up` là `exited (0)` — ĐÚNG, không phải lỗi).

---

## POST-DEPLOY VERIFICATION (Health Check)

```powershell
# Backend
curl.exe http://localhost:3000/health
# Kỳ vọng: JSON chứa "status":"ok", "dependencies":{"database":"up","redis":"up"}

# Frontend
# Mở trình duyệt: http://localhost:3001/login — phải load được trang đăng nhập
# (LƯU Ý: "/" một mình là trang landing tĩnh có chủ đích, KHÔNG phải trang đăng nhập
# và KHÔNG redirect sang /login — xem frontend/src/middleware.ts)

# Database/Redis (gián tiếp qua docker compose ps — cả 2 đã có healthcheck riêng)
docker compose -f docker-compose.yml ps
# Kỳ vọng: postgres và redis đều "running (healthy)"
```

---

## CUSTOMER ONBOARDING

**Bất biến quan trọng đã xác nhận qua audit:** `POST /organizations` (cách tạo tổ chức khách hàng
mới) **KHÔNG tự động tạo Chi nhánh (Branch)** nào. Thiếu bước tạo Branch, Kho (Warehouse) không tạo
được (`branchId` bắt buộc), nghĩa là tổ chức mới sẽ không dùng được cho tới khi vận hành viên tạo
Branch thủ công qua API. Trình tự dưới đây bắt buộc theo đúng thứ tự, dùng API đã hỗ trợ — **không
có bước nào chỉnh sửa database trực tiếp**.

### Bước 1 — Cấp quyền Platform Admin (chỉ cần 1 lần cho toàn bộ triển khai, bỏ qua nếu đã có)

```powershell
docker compose -f docker-compose.yml run --rm bring-up `
  npm run platform-admin:promote -- --organization-slug=<slug tổ chức vận hành> --email=<email vận hành viên>
```

Đăng nhập lại (`POST /auth/login`) để lấy access token mới mang `isPlatformAdmin=true`.

### Bước 2 — Tạo tổ chức khách hàng (`POST /organizations`, cần Platform Admin token)

```
POST /api/v1/organizations
Authorization: Bearer <platform admin token>

{
  "organization": { "displayName": "<Tên khách hàng>", "slug": "<slug-duy-nhat>" },
  "owner": { "fullName": "<Tên chủ sở hữu>", "email": "<email owner>", "password": "<mật khẩu>" },
  "subscription": { "plan": "TRIAL" }
}
```

`plan` có thể là `FREE`/`TRIAL`/`BASIC`/`PRO`/`ENTERPRISE` — chọn plan mong muốn ngay từ đầu. Bỏ
trống → mặc định `FREE`.

### Bước 3 — Xác nhận subscription (`GET /organizations/current`, dùng token owner vừa tạo)

Kỳ vọng: 200, trong response có subscription đúng plan vừa chọn.

### Bước 4 — Owner đăng nhập lần đầu

`POST /auth/login` với `organizationSlug`/`email`/`password` vừa tạo ở Bước 2.

### Bước 5 — ⚠️ TẠO ÍT NHẤT 1 CHI NHÁNH (bắt buộc, dùng API — không SQL trực tiếp)

```
POST /api/v1/branches
Authorization: Bearer <owner token>

{ "name": "<Tên chi nhánh chính>" }
```

### Bước 6 — Tạo Kho (Warehouse), cần `branchId` từ Bước 5

```
POST /api/v1/warehouses
Authorization: Bearer <owner token>

{ "branchId": "<id chi nhánh vừa tạo>", "code": "KHO-01", "name": "Kho chính" }
```

### Bước 7 — Dữ liệu cơ bản (master data)

Tạo tối thiểu: 1 Đơn vị tính (Unit), 1 Danh mục (Category), 1 Sản phẩm (Product), 1 Nhà cung cấp
(Supplier) nếu cần nhập hàng, 1 Khách hàng (Customer) nếu cần — qua UI hoặc API, theo nhu cầu thật
của khách hàng.

### Bước 8 — Xác nhận đăng nhập UI thật

Owner đăng nhập qua `http://localhost:3001/login`, xác nhận vào được `/dashboard`.

### Bước 9 — Giao dịch đại diện (representative transaction)

Thực hiện 1 giao dịch bán hàng qua màn hình POS (`/pos`) hoặc 1 quy trình Đơn nhập hàng
(Purchase Order: Tạo → Duyệt → Nhận hàng) để xác nhận tồn kho biến động đúng.

---

## BACKUP

### ✅ ARCHITECT DECISION LOCKED: bản copy off-host là BẮT BUỘC cho Khách hàng #1

Backup KHÔNG ĐƯỢC PHÉP chỉ tồn tại trên máy chủ POS/ứng dụng. Copy thủ công là chấp nhận được ở quy
mô pilot 1–5 khách hàng (không cần tự động hoá trong gói này), nhưng bước copy off-host là **điều
kiện bắt buộc để hoàn tất bàn giao** — xem "GO-LIVE ACCEPTANCE" cuối tài liệu: bàn giao KHÔNG ĐƯỢC
đánh dấu hoàn tất nếu chưa thực hiện copy off-host.

### Quy trình sao lưu + copy off-host cho Khách hàng #1

Cơ chế backup/restore đã được chứng minh đúng qua CI thật (Deployment Smoke). Thực hiện thủ công
theo 7 bước sau:

1. **Chạy lệnh backup đã duyệt:**
   ```powershell
   npm run ops:backup
   ```
2. **Xác nhận thành công:** log in ra dòng `✓ Backup thành công: <đường dẫn>.dump (<số byte>)`.
3. **Xác định file vừa tạo:** mặc định tại `./backups/pos-erp-YYYYMMDD-HHmmss.dump` (giờ UTC).
4. **Copy file ra khỏi máy chủ** — chọn 1 trong các phương án sau (không bắt buộc nhà cung cấp cụ
   thể):
   - Ổ đĩa rời (USB/ổ cứng ngoài) cắm định kỳ.
   - Thư mục mạng/NAS trong mạng nội bộ.
   - Một máy chủ thứ 2 đã được bảo vệ (vd qua `robocopy`/`scp` thủ công).
   - Dịch vụ lưu trữ đám mây đã được duyệt (Architect/khách hàng chọn nhà cung cấp).
5. **Xác nhận file đã copy tồn tại** ở đích (kiểm tra kích thước khớp file gốc).
6. **Ghi lại ngày giờ** đã thực hiện (sổ tay vận hành hoặc bảng tính đơn giản) — phục vụ theo dõi
   RPO thực tế.
7. **Định kỳ xác minh khôi phục được** (không chỉ tin file backup "chắc là đúng") — xem quy trình
   dưới.

### Xác minh khôi phục định kỳ (khuyến nghị: hàng tháng hoặc trước mỗi lần nâng cấp)

```powershell
npm run ops:restore -- <đường dẫn file .dump> pos_erp_restore_drill
npm run ops:verify-restore -- pos_erp_restore_drill --compare-source
```

### Backup — checklist chấp nhận bàn giao (bắt buộc, không tuỳ chọn)

- [ ] Backup local thành công (`npm run ops:backup`)
- [ ] Xác minh khôi phục thành công (`ops:restore` + `ops:verify-restore --compare-source` vào DB tạm)
- [ ] Backup đã được copy off-host
- [ ] Đã xác nhận file đã copy tồn tại ở đích (kích thước khớp file gốc)
- [ ] Vận hành viên đã ghi lại ngày giờ thực hiện backup
- [ ] Vận hành viên nắm rõ quy trình restore (kể cả khi chưa cần dùng tới)

**⚠️ CẢNH BÁO BẮT BUỘC:** KHÔNG BAO GIỜ chạy `ops:restore` trực tiếp lên database production đang
chạy (`pos_erp` hoặc tên đã cấu hình) — luôn dùng tên database TẠM khác (như `pos_erp_restore_drill`
ở trên) để xác minh, sau đó xoá database tạm đó. Khôi phục thật lên production chỉ thực hiện trong
tình huống sự cố thật, đã xác nhận cần thiết.

---

## TRIAL → PAID

Dùng CLI đã duyệt (T053.06I), luôn xem trước (preview) trước khi xác nhận:

```powershell
# Bước 1 — Xem trước, KHÔNG ghi gì
docker compose -f docker-compose.yml run --rm bring-up `
  npm run subscription:change-plan -- --organization-id=<uuid tổ chức> --plan=BASIC

# Bước 2 — Xác nhận thật (chỉ sau khi đã xem preview và đồng ý)
docker compose -f docker-compose.yml run --rm bring-up `
  npm run subscription:change-plan -- --organization-id=<uuid tổ chức> --plan=BASIC --confirm
```

Kỳ vọng sau xác nhận: plan chuyển sang `BASIC` (hoặc plan mục tiêu đã chọn), trạng thái `ACTIVE`,
ngày hết hạn được xoá, hạn mức tài nguyên đúng theo plan mới, quyền lợi (entitlement) của gói mới có
hiệu lực NGAY (không cần thao tác gì thêm). Xác minh bằng cách gọi thử 1 tính năng chỉ gói mới mới
có (vd `POST /suppliers` với plan BASIC) — kỳ vọng thành công.

**Xác minh audit:** mỗi lần đổi plan thành công đều ghi 1 bản ghi `AuditLog` với
`action: "organization.subscription.plan_changed"` — vận hành viên có DB access có thể tra cứu nếu
cần đối chiếu lịch sử.

**KHÔNG hỗ trợ đổi plan mục tiêu về TRIAL** — không có chính sách "dùng thử lại" nào được duyệt.
Lệnh sẽ báo lỗi rõ ràng nếu thử.

---

## DOWNGRADE

```powershell
# Xem trước trước — LUÔN LUÔN, để biết usage hiện tại và liệu có bị chặn không
docker compose -f docker-compose.yml run --rm bring-up `
  npm run subscription:change-plan -- --organization-id=<uuid tổ chức> --plan=BASIC
```

Kết quả xem trước cho biết: usage hiện tại của cả 5 loại tài nguyên (User/Chi nhánh/Kho/Sản phẩm/
Khách hàng), có được phép hạ cấp hay không, và nếu bị chặn thì đúng tài nguyên nào vượt hạn mức.

- **Nếu bị chặn:** KHÔNG được xoá/vô hiệu hoá dữ liệu khách hàng chỉ để ép hạ cấp thành công. Trao
  đổi với khách hàng để giảm usage thật (vd hợp nhất/xoá tài khoản nhân viên không dùng nữa) hoặc
  giữ nguyên plan hiện tại/chọn plan khác phù hợp hơn.
- **Nếu được phép:** chạy lại với `--confirm` để xác nhận thật.

---

## SMTP / KHÔI PHỤC MẬT KHẨU

### ✅ ARCHITECT DECISION LOCKED: cấu hình SMTP cho Khách hàng #1 nếu có thể

Quên-mật-khẩu-tự-phục-vụ (self-service) là đường phục hồi BÌNH THƯỜNG cho Khách hàng #1. Đặt lại
mật khẩu qua admin là đường DỰ PHÒNG, không phải đường chính.

### Đường CHÍNH — SMTP đã cấu hình

Người dùng tự dùng "Quên mật khẩu" trên UI, nhận OTP qua email thật. Xác minh: cấu hình đủ biến
`SMTP_HOST` (và các biến SMTP liên quan) trong `backend\.env`, khởi động lại, thử luồng quên mật
khẩu thật với 1 tài khoản thử.

### Đường DỰ PHÒNG — SMTP không khả dụng

Hệ thống KHÔNG chặn khởi động (chỉ cảnh báo trong log) nhưng OTP sẽ không gửi được qua email thật —
người dùng tự thao tác "Quên mật khẩu" sẽ không nhận được gì. Vận hành viên PHẢI thực hiện đặt lại
mật khẩu thay cho người dùng, qua API đã hỗ trợ sẵn (không phải SQL trực tiếp):

```
PATCH /api/v1/users/:id/reset-password
Authorization: Bearer <admin/owner token có quyền user:update>
```

**Xác minh:** thử luồng quên-mật-khẩu-tự-phục-vụ với 1 tài khoản test — nếu email không tới trong
vài phút, chuyển sang quy trình admin reset ở trên (đường dự phòng).

### Password recovery — checklist chấp nhận bàn giao

- [ ] SMTP đã cấu hình CHO Khách hàng #1, HOẶC đường dự phòng (admin reset) đã được chấp nhận tường minh nếu SMTP chưa khả dụng
- [ ] Đã thử nghiệm thật đường phục hồi mật khẩu (tự phục vụ hoặc admin reset, tuỳ trường hợp trên)
- [ ] Vận hành viên nắm rõ quy trình admin reset (`PATCH /api/v1/users/:id/reset-password`)

---

## INCIDENT / RECOVERY

| Sự cố | Quy trình |
|---|---|
| Backend không phản hồi | `docker compose -f docker-compose.yml restart backend`, sau đó xác nhận `curl.exe http://localhost:3000/health` |
| Cần khởi động lại toàn bộ stack | `docker compose -f docker-compose.yml down` rồi `docker compose -f docker-compose.yml up -d --wait` (KHÔNG dùng `-v` — xoá named volume, mất toàn bộ dữ liệu) |
| Xem log để chẩn đoán | `docker compose -f docker-compose.yml logs -f backend` (hoặc `postgres`/`redis`/`frontend`) |
| Platform Admin duy nhất bị mất quyền/khoá tài khoản do thao tác nhầm | Chạy lại `npm run platform-admin:promote` với đúng tổ chức/email (idempotent, an toàn chạy lại) — cần quyền truy cập máy chủ |
| Quên mật khẩu, không có SMTP | Xem mục "SMTP / Khôi phục mật khẩu" — đường dự phòng ở trên |
| Nghi ngờ mất dữ liệu / cần khôi phục từ backup thật | Xem `BACKUP-RESTORE-RUNBOOK.md` §6 (Disaster Recovery) — LUÔN khôi phục vào database TẠM để xác minh trước, không ghi đè trực tiếp production |
| Cổng 3000/3001 bị chiếm | Đóng chương trình đang chiếm cổng, hoặc đổi port mapping trong `docker-compose.yml` (thay đổi mã nguồn, KHÔNG được chọn cho MODE B đã duyệt — xem "Network Exposure" ở trên) |

---

## CUSTOMER HANDOVER — Trách nhiệm vận hành viên

Trong giai đoạn pilot 1–5 khách hàng, vận hành viên (KHÔNG phải hệ thống tự động) chịu trách nhiệm:

- Onboarding từng khách hàng mới (theo trình tự "CUSTOMER ONBOARDING" ở trên).
- Đổi plan/gia hạn khi khách hàng thanh toán (thủ công, qua CLI đã duyệt).
- Xuất hoá đơn thủ công (chưa có billing tự động).
- Sao lưu định kỳ + copy off-host định kỳ (xem "BACKUP" ở trên).
- Kiểm tra health/log định kỳ (chưa có cảnh báo tự động — không có cơ chế chủ động báo khi backend/
  database/Redis/lịch backup/lịch trial-expiry gặp lỗi).
- Là điểm dự phòng đặt lại mật khẩu khi SMTP chưa cấu hình.
- Là điểm ứng phó sự cố đầu tiên (không có đội vận hành 24/7, không có SLA cam kết).

**Không có tuyên bố "vận hành SaaS không người can thiệp" ở giai đoạn này** — mô hình đã duyệt là
vận hành viên chủ động quản lý toàn bộ vòng đời khách hàng.

---

## CUSTOMER #1 ACCEPTANCE CHECK

Đánh dấu PASS/FAIL từng mục trước khi coi triển khai đã sẵn sàng bàn giao:

- [ ] Production secrets đã cấu hình (không phải placeholder)
- [ ] Swagger đã tắt (`SWAGGER_ENABLED=false`, xác minh `/api/docs` không truy cập được)
- [ ] CORS_ORIGIN đúng domain/địa chỉ thật
- [ ] Network mode MODE B (TRUSTED-LAN POS) đã được xác nhận áp dụng đúng cho triển khai này (xem "Network Safety Checklist" ở trên)
- [ ] Firewall đã xác minh khớp với MODE B
- [ ] Database `healthy` (`docker compose ps`)
- [ ] Redis `healthy` (`docker compose ps`)
- [ ] Frontend truy cập được (`http://localhost:3001`)
- [ ] Tổ chức đầu tiên của khách hàng đã tạo (`POST /organizations`)
- [ ] Owner đăng nhập được qua UI thật
- [ ] Ít nhất 1 Chi nhánh (Branch) đã tạo
- [ ] Ít nhất 1 Kho (Warehouse) đã tạo
- [ ] Ít nhất 1 Sản phẩm cơ bản đã tạo
- [ ] Nhà cung cấp/Khách hàng dùng được (nếu khách hàng cần)
- [ ] 1 giao dịch POS thành công
- [ ] Tồn kho biến động đúng sau giao dịch
- [ ] `npm run ops:backup` chạy thành công
- [ ] Bản copy off-host của ít nhất 1 file backup đã tồn tại
- [ ] Đã xác minh khôi phục được (restore vào DB tạm + verify-restore PASS)
- [ ] Đường khôi phục mật khẩu (SMTP hoặc admin reset) đã xác minh
- [ ] Quy trình Trial→Paid đã được vận hành viên hiểu và thử qua (preview trước khi confirm)
- [ ] Người/đầu mối chịu trách nhiệm vận hành đã xác định rõ (tên, cách liên hệ)

---

## CUSTOMER DEPLOYMENT RECORD (mẫu — TEMPLATE)

**⚠️ Đây là MẪU (template).** Copy phần dưới sang 1 tài liệu vận hành riêng NGOÀI git (sổ tay vận
hành, hệ thống quản lý nội bộ đã được duyệt) khi triển khai thật cho từng khách hàng. **KHÔNG điền
thông tin khách hàng thật vào bản trong git này** — xem "Quy tắc dữ liệu khách hàng / bí mật" bên
dưới.

```
Customer:
Deployment date:
Operator:
Application version/SHA:
Deployment machine:
Network mode:
LAN subnet:
Application URL:
Backup destination:
SMTP status:
Organization ID:
Organization slug:
Subscription plan:
Branch created:
Warehouse created:
```

---

## GO-LIVE ACCEPTANCE

Cổng chấp nhận cuối cùng trước khi coi triển khai đã sẵn sàng phục vụ khách hàng thật. Đánh dấu
PASS/FAIL cho từng hạng mục — **bất kỳ mục nào FAIL nghĩa là GO-LIVE CHƯA được duyệt cho tới khi
khắc phục xong**, không có ngoại lệ "sẽ sửa sau."

| Hạng mục | PASS/FAIL |
|---|---|
| CONFIGURATION (production config checklist §"PRE-DEPLOY") | [ ] |
| NETWORK (network safety checklist §2A) | [ ] |
| DATABASE | [ ] |
| REDIS | [ ] |
| APPLICATION HEALTH | [ ] |
| LOGIN | [ ] |
| ORGANIZATION | [ ] |
| OWNER | [ ] |
| BRANCH | [ ] |
| WAREHOUSE | [ ] |
| PRODUCT | [ ] |
| CUSTOMER | [ ] |
| SUPPLIER | [ ] |
| INVENTORY | [ ] |
| POS SALE | [ ] |
| PURCHASE | [ ] |
| SALES RETURN | [ ] |
| PASSWORD RECOVERY | [ ] |
| BACKUP | [ ] |
| OFF-HOST BACKUP | [ ] |
| RESTORE VERIFICATION | [ ] |
| TRIAL/PLAN PROCEDURE | [ ] |
| OPERATOR RESPONSIBILITY | [ ] |

---

## VERSION PINNING

Mỗi lần triển khai PHẢI ghi lại chính xác Git SHA/release đang triển khai (điền vào trường
"Application version/SHA" trong CUSTOMER DEPLOYMENT RECORD ở trên). **Không giả định khách hàng
tương lai dùng cùng SHA với tài liệu chuẩn bị hiện tại.**

SHA chuẩn bị cho gói tài liệu này (tại thời điểm viết, KHÔNG phải SHA bắt buộc cho mọi khách hàng
tương lai):

```
710a3a5309de3c51207532413f1a0c8e5cde619c
```

---

## Quy tắc dữ liệu khách hàng / bí mật

Tài liệu checklist/mẫu đã commit vào git **KHÔNG ĐƯỢC** chứa:

- mật khẩu thật
- JWT secret thật
- thông tin đăng nhập database thật
- mật khẩu Redis thật
- mật khẩu SMTP thật
- thông tin cá nhân khách hàng
- token production thật

Bản đã điền đầy đủ thông tin cho từng khách hàng cụ thể (CUSTOMER DEPLOYMENT RECORD đã điền, hoặc
bất kỳ ghi chú nào chứa dữ liệu thật) PHẢI lưu theo quy trình vận hành bảo mật riêng của vận hành
viên — **không commit vào repository này**.

---

## Tài liệu liên quan

- `docs/release/WINDOWS-DEPLOYMENT-RUNBOOK.md` — chi tiết đầy đủ triển khai/vận hành hàng ngày.
- `docs/release/BACKUP-RESTORE-RUNBOOK.md` — chi tiết đầy đủ backup/restore/DR, RPO/RTO, bảo mật.

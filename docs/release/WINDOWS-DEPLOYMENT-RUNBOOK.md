# Windows Docker Deployment Runbook (T051.04)

Vận hành POS ERP Enterprise trên **một máy Windows đơn, offline** qua Docker Desktop / Docker
Compose — kiến trúc đã được duyệt (AD01/AD02,
`docs/architecture/offline-single-computer-readiness-audit.md`). T051.04 **không** mở lại quyết
định Docker-vs-native — sprint này chỉ hoàn thiện gói triển khai.

Cho disaster recovery (mất dữ liệu, khôi phục từ backup), xem
**`docs/release/BACKUP-RESTORE-RUNBOOK.md`** — tài liệu này chỉ liên kết tới, không lặp lại.

## 1. Yêu cầu máy (Prerequisites)

- Windows 10/11 (64-bit), đã bật WSL2 (Docker Desktop tự yêu cầu khi cài nếu thiếu).
- **Docker Desktop** (bao gồm Docker Engine + Docker Compose v2) — tải từ
  https://www.docker.com/products/docker-desktop/, cài đặt, khởi động lại máy nếu được yêu cầu.
- Tối thiểu ~4GB RAM dành riêng cho Docker Desktop, ~10GB dung lượng đĩa trống (ảnh Docker + dữ
  liệu Postgres).
- Không cần cài Node.js, PostgreSQL client, hay bất kỳ công cụ phát triển nào trên máy vận hành —
  toàn bộ chạy trong container.
- Không cần Git nếu nhận package đóng gói sẵn; cần Git nếu lấy mã nguồn qua `git clone`.

**Xác nhận Docker Desktop đang chạy** (bắt buộc trước mọi bước sau):

```powershell
docker version
```

Nếu lệnh báo lỗi kết nối — mở Docker Desktop từ Start Menu, đợi biểu tượng cá voi ở khay hệ thống
chuyển sang trạng thái "running" (không còn animation loading).

## 2. Lấy mã nguồn / package

```powershell
git clone <repository-url> "C:\pos-erp"
cd "C:\pos-erp"
```

(Hoặc giải nén package đã nhận vào `C:\pos-erp` và mở PowerShell tại đó.)

## 3. Tạo file cấu hình môi trường

**Hai file `.env` riêng biệt, không được nhầm lẫn:**

```powershell
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env
```

Mở `.env` (gốc repo) bằng Notepad, đổi:
```
POSTGRES_PASSWORD=<mật khẩu Postgres do bạn tự đặt — KHÔNG dùng giá trị mẫu>
```

Mở `backend\.env` bằng Notepad, đổi **tất cả** các dòng sau (mặc định của
`backend/.env.example` là cấu hình PHÁT TRIỂN, không phải vận hành thật):
```
NODE_ENV=production
SWAGGER_ENABLED=false
JWT_ACCESS_SECRET=<chuỗi ngẫu nhiên dài, tự đặt — KHÔNG dùng giá trị mẫu "change-me-..."'>
JWT_REFRESH_SECRET=<chuỗi ngẫu nhiên dài khác — KHÔNG trùng JWT_ACCESS_SECRET>
FIRST_ADMIN_EMAIL=<email quản trị viên đầu tiên của bạn>
FIRST_ADMIN_PASSWORD=<mật khẩu quản trị viên đầu tiên — tối thiểu 8 ký tự, không dùng mật khẩu demo/mặc định phổ biến>
```

**Bắt buộc `NODE_ENV=production`**: đây không chỉ là quy ước — `env.validation.ts` chủ động
**từ chối khởi động** (throw lỗi rõ ràng) nếu `NODE_ENV=production` mà `SWAGGER_ENABLED` vẫn là
`true`/chưa set, đúng chủ đích chặn triển khai thật vô tình để lộ Swagger UI. Nếu quên đổi
`NODE_ENV`, ứng dụng vẫn chạy được nhưng ở chế độ PHÁT TRIỂN (Swagger UI công khai tại
`/api/docs`, log chi tiết hơn mức cần) — không đúng cấu hình vận hành đã duyệt.

Sinh chuỗi ngẫu nhiên cho JWT secrets bằng PowerShell (tuỳ chọn, không bắt buộc dùng đúng lệnh này):
```powershell
-join ((48..57)+(65..90)+(97..122)|Get-Random -Count 48|%{[char]$_})
```

**Không bao giờ commit `.env`/`backend\.env` vào git** — cả hai đã nằm trong `.gitignore`.

Toàn bộ biến môi trường và giá trị mặc định: `docs/setup/ENVIRONMENT-CONTRACT.md`.

## 4. Khởi động lần đầu (Full Clean-Start)

```powershell
docker compose -f docker-compose.yml up -d --wait
```

**Ghi chú cú pháp quan trọng**: dùng đúng `-f docker-compose.yml` (không có `docker-compose.override.yml`
đi kèm) — đây là cấu hình vận hành THẬT, không lộ cổng Postgres(5432)/Redis(6379) ra ngoài máy
(§12, xem `docs/setup/ENVIRONMENT-CONTRACT.md`). Nếu chỉ gõ `docker compose up -d` (không có `-f`),
Compose SẼ tự động gộp thêm `docker-compose.override.yml` nếu file đó tồn tại trên máy bạn (quy
ước mặc định của Compose) — file đó chỉ nên có trên máy phát triển, không nên có trên máy vận
hành thật.

Lần đầu chạy sẽ: kéo/build 4 image (postgres, redis, backend, frontend) → khởi động Postgres/Redis
→ chờ cả hai healthy → chạy `bring-up` (migrate + seed permission catalog + tạo quản trị viên đầu
tiên từ `FIRST_ADMIN_EMAIL`/`FIRST_ADMIN_PASSWORD`) → khởi động backend → chờ backend healthy →
khởi động frontend → chờ frontend healthy. Có thể mất vài phút ở lần chạy đầu (build image).

`--wait` khiến lệnh CHỜ tới khi mọi service healthy rồi mới trả về — không cần tự đoán thời gian.

## 5. Kiểm tra trạng thái (Health Verification)

```powershell
docker compose -f docker-compose.yml ps
```

Mọi service phải ở trạng thái `running (healthy)` (riêng `bring-up` sẽ hiện `exited (0)` — ĐÚNG,
đây là service chạy một lần rồi thoát, không phải lỗi).

Kiểm tra backend:
```powershell
curl.exe http://localhost:3000/health
```
Kỳ vọng: JSON chứa `"status":"ok"`.

Kiểm tra frontend: mở trình duyệt tới **http://localhost:3001**.

## 6. Đăng nhập lần đầu

- URL: **http://localhost:3001/login**
- Tổ chức (slug): giá trị `FIRST_ADMIN_ORG_SLUG` đã cấu hình (mặc định `cua-hang-cua-toi`)
- Email/Mật khẩu: giá trị `FIRST_ADMIN_EMAIL`/`FIRST_ADMIN_PASSWORD` đã cấu hình ở bước 3.

## 7. Xác nhận dữ liệu bền vững (Persistence Sanity Check)

Tạo thử 1 bản ghi bất kỳ (vd 1 Đơn vị tính ở màn hình Đơn vị tính), sau đó:

```powershell
docker compose -f docker-compose.yml restart backend
```

Tải lại trang, xác nhận bản ghi vừa tạo vẫn còn. Dữ liệu nằm trong Postgres (named volume
`postgres_data`), độc lập với vòng đời container backend.

## 8. Thực hiện Backup

```powershell
cd backend
$env:BACKUP_MODE = "docker-compose"
npm run ops:backup
```

Yêu cầu Node.js đã cài trên máy CHỈ để chạy lệnh này (khác với vận hành bình thường — xem §14 Câu
hỏi thường gặp bên dưới). Chi tiết đầy đủ: `docs/release/BACKUP-RESTORE-RUNBOOK.md`.

## 9. Dừng / Khởi động lại (Normal Shutdown / Restart)

**Dừng (giữ nguyên dữ liệu):**
```powershell
docker compose -f docker-compose.yml down
```

**Khởi động lại:**
```powershell
docker compose -f docker-compose.yml up -d --wait
```

**⚠️ CẢNH BÁO — LỆNH PHÁ HUỶ, KHÔNG DÙNG TRONG VẬN HÀNH BÌNH THƯỜNG:**
```powershell
docker compose -f docker-compose.yml down -v
```
Cờ `-v` XOÁ VĨNH VIỄN named volume, bao gồm **toàn bộ dữ liệu Postgres** (mọi đơn hàng, tồn kho,
khách hàng...) và log đã lưu. Chỉ dùng khi CHỦ ĐÍCH muốn xoá sạch để cài lại từ đầu, và **chỉ sau
khi đã có backup xác minh được** (§8).

## 10. Tự khởi động cùng Windows (Auto-Start)

Docker Desktop có tuỳ chọn "Start Docker Desktop when you sign in" (Settings → General) — bật tuỳ
chọn này. Kết hợp với `restart: unless-stopped` đã cấu hình cho mọi service trong
`docker-compose.yml`, khi Docker Desktop khởi động lại, các container trước đó (nếu chưa bị `down`)
sẽ tự khởi động lại theo policy này — **miễn là chúng đang ở trạng thái "stopped" chứ không phải
đã bị `docker compose down`** (dừng bằng `down` gỡ bỏ container khỏi Docker hoàn toàn, không có gì
để "tự khởi động lại" — chỉ `restart: unless-stopped` áp dụng khi Docker Desktop/máy khởi động lại
ĐANG LÚC container tồn tại, vd sau khi máy mất điện đột ngột hoặc Windows tự update-restart).

**Giới hạn đã biết**: nếu vận hành viên chủ động chạy `docker compose down` rồi tắt máy, khi bật
máy lại KHÔNG có gì tự chạy `docker compose up` — cần vận hành viên tự chạy lại (§9), hoặc tạo một
Windows Task Scheduler task chạy `docker compose -f docker-compose.yml up -d --wait` khi đăng nhập
Windows nếu muốn hoàn toàn tự động. T051.04 không tự xây dựng Windows Service riêng (không có bằng
chứng cần thiết cho V1 — Docker Desktop's restart policy + thao tác thủ công đơn giản là đủ).

## 11. Logs

Log JSON xoay vòng hằng ngày (giữ 14 ngày) nằm trong named volume `backend_logs`, sống sót qua mọi
lần tái tạo container. Xem log:

```powershell
# Log console thời gian thực (STDOUT — luôn có, không phụ thuộc volume)
docker compose -f docker-compose.yml logs -f backend

# Log JSON chi tiết đã lưu trong volume (copy ra máy host để đọc)
docker compose -f docker-compose.yml exec backend sh -c "ls /app/logs"
docker cp $(docker compose -f docker-compose.yml ps -q backend):/app/logs "C:\pos-erp-logs"
```

## 12. Nâng cấp phiên bản (Upgrade Procedure)

1. **Backup xác minh được trước tiên** — chạy §8, xác nhận file `.dump` có kích thước > 0.
2. Lấy mã nguồn/package phiên bản mới (`git pull` hoặc giải nén package mới đè lên, GIỮ NGUYÊN
   `.env`/`backend\.env` hiện có — không ghi đè 2 file này).
3. `docker compose -f docker-compose.yml build` (build lại image với mã mới).
4. `docker compose -f docker-compose.yml up -d --wait` — service `bring-up` tự chạy lại
   `prisma migrate deploy` (áp dụng migration mới nếu có, migration cũ đã áp dụng thì Prisma tự bỏ
   qua — idempotent theo thiết kế của chính Prisma) rồi mới khởi động backend.
5. Xác nhận health (§5) + đăng nhập thử (§6) + kiểm tra 1-2 luồng nghiệp vụ chính bằng tay.
6. Nếu có vấn đề nghiêm trọng → xem §13 Rollback bên dưới.

**KHÔNG có "hạ cấp database tự động."** Nếu migration mới đã áp dụng thành công rồi phát hiện lỗi
ở tầng ứng dụng, hạ cấp CODE (quay lại image cũ) vẫn hoạt động MIỄN LÀ schema mới tương thích
ngược (backward-compatible) — Prisma không cung cấp cơ chế tự động "un-apply" một migration đã
chạy. Nếu migration mới có breaking schema change, phục hồi database phải đi qua backup/restore
(`docs/release/BACKUP-RESTORE-RUNBOOK.md`), không phải "rollback migration."

## 13. Rollback

Ba phạm vi tách biệt, không được nhầm lẫn với nhau:

**A. Rollback mã nguồn/Git** — hoàn tác một thay đổi CODE (vd một PR vừa merge có vấn đề):
```
git revert <commit-sha>
```
Chạy sạch, không đụng gì tới database hay image đang chạy.

**B. Rollback container/image** — quay lại phiên bản ứng dụng TRƯỚC (image cũ đã build/pull sẵn,
hoặc build lại từ 1 tag Git cũ hơn):
```powershell
git checkout <tag-hoặc-commit-cũ>
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml up -d --wait
```
An toàn MIỄN LÀ schema database hiện tại vẫn tương thích ngược với code cũ (thường đúng nếu chỉ
mới upgrade lên 1 phiên bản có thêm cột/bảng mới, chưa xoá/đổi tên gì).

**C. Rollback/khôi phục database** — KHÔNG tự động, KHÔNG giống A/B. Nếu migration mới không
tương thích ngược hoặc dữ liệu bị hỏng, con đường DUY NHẤT là restore từ backup đã xác minh
(`docs/release/BACKUP-RESTORE-RUNBOOK.md` §4-§6) — restore luôn vào 1 database MỚI/cô lập trước,
xác minh xong mới cutover thủ công. Không có "un-migrate" tự động.

## 14. Câu hỏi thường gặp / Troubleshooting

| Triệu chứng | Nguyên nhân khả dĩ | Cách xử lý |
|---|---|---|
| `docker version` báo lỗi kết nối | Docker Desktop chưa chạy | Mở Docker Desktop, đợi tới khi hết trạng thái loading |
| `docker compose up` báo "port is already allocated" | Cổng 3000/3001 đã bị chương trình khác dùng | Đóng chương trình đang chiếm cổng, hoặc đổi port mapping trong `docker-compose.yml` (vd `"3002:3001"`) |
| `bring-up` service báo lỗi rồi thoát khác 0 | `.env`/`backend\.env` thiếu biến bắt buộc, hoặc `FIRST_ADMIN_PASSWORD` là giá trị mặc định/quá ngắn | Xem log: `docker compose logs bring-up`; sửa `.env` theo thông báo lỗi, chạy lại `docker compose up -d --wait` |
| Postgres/Redis không lên `healthy` | Đĩa đầy, hoặc named volume bị hỏng | `docker compose logs postgres`/`redis`; kiểm tra dung lượng đĩa còn trống |
| Backend không lên `healthy` dù Postgres/Redis đã healthy | Sai `DATABASE_URL`/JWT secrets, hoặc migration thất bại | `docker compose logs backend`; kiểm tra `bring-up` đã thoát 0 chưa (`docker compose ps`) |
| Frontend load được nhưng gọi API lỗi | `NEXT_PUBLIC_API_URL` sai lúc build (giá trị bị NHÚNG VÀO BUNDLE lúc build, không đổi được bằng cách sửa `.env` rồi restart — phải build lại) | Sửa `.env`, chạy `docker compose build frontend` rồi `up -d --wait` |
| `docker compose down` xong không tự lên lại sau khi khởi động lại Windows | `down` đã gỡ container hoàn toàn — `restart: unless-stopped` không áp dụng cho container không còn tồn tại | Chạy lại `docker compose up -d --wait` thủ công, hoặc dùng Task Scheduler (§10) |
| Mất dữ liệu sau `docker compose down -v` | `-v` đã xoá named volume — hành vi PHÁ HUỶ, không phải lỗi | Restore từ backup gần nhất (`docs/release/BACKUP-RESTORE-RUNBOOK.md`) — nếu chưa từng backup, dữ liệu không thể phục hồi |
| `npm run ops:backup` báo lỗi "docker: command not found" | Máy chạy lệnh backup không có Docker CLI trên PATH | Chạy đúng trên máy Windows có Docker Desktop (không chạy trong container khác, không chạy trên máy thứ 2 không có Docker) |
| Ổ đĩa đầy giữa lúc backup | `pg_dump` thất bại rõ ràng, không để lại file `.partial` mồ côi | Giải phóng dung lượng đĩa, chạy lại `npm run ops:backup` |

## 15. Bảo mật (tóm tắt — chi tiết đầy đủ ở §21 báo cáo T051.04)

- Không public port Postgres(5432)/Redis(6379) ra ngoài máy ở cấu hình vận hành (§3, §4).
- Swagger BẮT BUỘC tắt ở production (`SWAGGER_ENABLED=false`, §3) — `env.validation.ts` từ chối
  khởi động nếu quên, không dựa vào giá trị mặc định của `.env.example` (mặc định đó dành cho
  phát triển, xem cảnh báo ở §3).
- Không commit `.env`/`backend\.env`/file backup `.dump` vào git — đã có `.gitignore`.
- Log không chứa mật khẩu/token (đã audit `winston.logger.ts` — chỉ log message/level/requestId).

## 16. Liên kết liên quan

- Disaster recovery đầy đủ: `docs/release/BACKUP-RESTORE-RUNBOOK.md`
- Toàn bộ biến môi trường: `docs/setup/ENVIRONMENT-CONTRACT.md`
- Kiến trúc offline single-computer đã duyệt: `docs/architecture/offline-single-computer-readiness-audit.md`

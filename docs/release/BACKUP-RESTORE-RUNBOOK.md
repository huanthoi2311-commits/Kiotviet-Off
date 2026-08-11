# PostgreSQL Backup / Restore Runbook (T051.03)

Toàn bộ tooling backup/restore của POS ERP Enterprise. Áp dụng cho triển khai V1: máy đơn,
offline, Docker Compose (AD01/AD02 — xem `docs/architecture/offline-single-computer-readiness-audit.md`).

## 1. Kiến trúc & phạm vi

**Phạm vi backup được duyệt: CHỈ PostgreSQL** (Architect Decision, T051.03 §1). Toàn bộ 68 model
Prisma — dữ liệu nghiệp vụ, người dùng, phiên đăng nhập (`sessions`), audit log
(`audit_logs`), `_prisma_migrations` — nằm trong **một** database Postgres duy nhất
(`DATABASE_URL`), nên **một** lần `pg_dump`/`pg_restore` bao phủ toàn bộ hệ thống-của-bản-ghi.

Redis **không** nằm trong phạm vi backup — xem §7.

```
┌─────────────────────────────────────────────────────────┐
│                      docker-compose.yml                  │
│                                                            │
│  ┌──────────┐   ┌──────────┐   ┌─────────────────────┐  │
│  │ postgres │   │  redis   │   │       backend         │  │
│  │  :5432   │   │  :6379   │   │        :3000          │  │
│  └────┬─────┘   └──────────┘   └───────────┬───────────┘  │
│       │                                     │              │
│       │ pg_dump / pg_restore                │              │
│       │ (qua `docker compose exec`)         │              │
└───────┼─────────────────────────────────────┼──────────────┘
        │                                     │
        ▼                                     ▼
  ./backups/*.dump                    (Redis: KHÔNG backup —
  (thư mục host, ngoài                 xem §7)
   Docker volume)
```

Code nguồn: `backend/src/modules/platform/backup/` (logic, đầy đủ unit test) +
`backend/prisma/{backup,restore,verify-restore}.ts` (CLI mỏng, gọi qua `npm run ops:*`).

## 2. Định dạng backup

`pg_dump` **custom format** (`-Fc`). Lý do:

- Nén sẵn (nhỏ hơn plain SQL đáng kể).
- Hỗ trợ verify độc lập bằng `pg_restore --list` (đọc bảng nội dung/TOC mà **không cần** kết nối
  database) — đây là cơ chế verify chính của T051.03 (§9).
- Hỗ trợ restore có chọn lọc (không dùng ở V1, nhưng để ngỏ cho tương lai).
- Không cần cài thêm gì ngoài chính `pg_dump`/`pg_restore` đã có sẵn trong image
  `postgres:16-alpine`.

Directory format bị loại vì phức tạp hơn (nhiều file) mà V1 không cần dump song song. Plain SQL bị
loại vì không verify được bằng `pg_restore --list` và file lớn hơn không nén.

## 3. Lệnh Backup

```bash
cd backend
npm run ops:backup
```

Biến môi trường (tất cả có mặc định hợp lý):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | *(bắt buộc, đã có trong `.env`)* | Nguồn kết nối Postgres |
| `BACKUP_DIR` | `./backups` | Thư mục lưu file `.dump` |
| `BACKUP_MODE` | `docker-compose` | `docker-compose` (gọi qua container) hoặc `direct` (binary trên PATH) |
| `DOCKER_COMPOSE_SERVICE` | `postgres` | Tên service trong `docker-compose.yml` |
| `BACKUP_RETENTION_COUNT` | `7` | Số bản backup giữ lại sau mỗi lần chạy thành công |
| `BACKUP_TIMEOUT_MS` | `600000` (10 phút) | Timeout cho pg_dump/verify |

Quy ước tên file: `pos-erp-YYYYMMDD-HHmmss.dump` (giờ UTC).

**Những gì lệnh này làm, theo thứ tự:**

1. Tạo thư mục `BACKUP_DIR` nếu chưa có.
2. Chạy `pg_dump -Fc` ghi ra file tạm `<tên-file>.dump.partial`.
3. **Verify tối thiểu (§9):** file tồn tại, size > 0, và `pg_restore --list` đọc được TOC của file
   vừa tạo.
4. Chỉ khi verify PASS: đổi tên `.partial` → tên file cuối cùng.
5. Áp dụng retention: xoá các bản backup cũ vượt quá `BACKUP_RETENTION_COUNT`, **chỉ sau khi**
   bước 3-4 thành công (backup lỗi không bao giờ kích hoạt xoá backup cũ — không có nguy cơ mất
   luôn bản backup hợp lệ gần nhất vì một lần chạy hỏng).

Nếu bất kỳ bước nào thất bại: file `.partial`/file lỗi bị xoá ngay, **không** để lại artifact
trông giống hợp lệ nhưng thực chất hỏng, và lệnh thoát với exit code khác 0.

## 4. Lệnh Restore

**Nguyên tắc an toàn cốt lõi: LUÔN restore vào một database MỚI, cô lập — không bao giờ ghi đè
database đang chạy.** Muốn "khôi phục sản xuất", operator tự quyết định bước cutover thủ công sau
khi đã verify bản restore (xem §6).

```bash
cd backend
npm run ops:restore -- ./backups/pos-erp-20260811-030000.dump pos_erp_restore_drill
```

Đối số: `<đường-dẫn-file-backup> <tên-database-đích>`.

**Những gì lệnh này làm:**

1. Kiểm tra file backup tồn tại.
2. Kết nối vào database bảo trì (`postgres`), kiểm tra `<tên-database-đích>` **chưa tồn tại** —
   nếu đã tồn tại, từ chối ngay (`RestoreTargetExistsError`), không đụng gì cả.
3. `CREATE DATABASE "<tên-database-đích>"`.
4. `pg_restore --no-owner --no-privileges --exit-on-error` đọc file backup, ghi vào database mới.
5. Nếu `pg_restore` thất bại (exit code khác 0, hoặc timeout): **rollback** —
   `DROP DATABASE "<tên-database-đích>"` — không để lại một database "trông như đã restore" nhưng
   thực ra dở dang.

Biến môi trường: `BACKUP_MODE`, `DOCKER_COMPOSE_SERVICE` giống §3; `RESTORE_TIMEOUT_MS` (mặc định
15 phút — restore thường chậm hơn dump).

## 5. Verify Restore

```bash
npm run ops:verify-restore -- pos_erp_restore_drill --compare-source
```

Kiểm tra tối thiểu (§11):

- Kết nối được tới database đích.
- Bảng `_prisma_migrations` tồn tại và đọc được (kèm số dòng).
- 6 bảng nghiệp vụ trọng yếu tồn tại: `organizations`, `users`, `products`, `inventories`,
  `purchase_orders`, `invoices` (tên bảng thật trong Postgres — `Inventory` model map thành
  `inventories`, không phải `inventory`).
- Với `--compare-source`: so sánh row-count từng bảng trọng yếu giữa database nguồn (từ
  `DATABASE_URL`) và database vừa restore.

Exit code 0 chỉ khi: kết nối OK, `_prisma_migrations` tồn tại, VÀ tất cả bảng trọng yếu tồn tại.
Row-count lệch **không** tự động fail lệnh (in cảnh báo "LỆCH") — vì backup không chụp đồng thời
với thời điểm so sánh nên lệch là bình thường nếu có ghi dữ liệu giữa lúc backup và lúc so sánh;
operator tự đánh giá mức lệch có chấp nhận được không.

## 6. Quy trình Disaster Recovery đầy đủ

1. Xác định bản backup cần khôi phục (`./backups/*.dump`, mới nhất trừ khi có lý do dùng bản cũ
   hơn — vd nghi ngờ dữ liệu bị hỏng ở bản mới nhất).
2. **Đảm bảo đã có sẵn:** `.env`/secrets của môi trường đích (§14 — backup Postgres **không**
   phục hồi được các thứ này).
3. Dừng ứng dụng backend (`docker compose stop backend`) — tránh ghi dữ liệu mới vào database
   nguồn trong lúc thao tác (không bắt buộc về mặt kỹ thuật cho restore-vào-DB-mới, nhưng tránh
   nhầm lẫn vận hành).
4. `npm run ops:restore -- <file-backup> pos_erp_restore_drill` (tên tạm, không phải tên production).
5. `npm run ops:verify-restore -- pos_erp_restore_drill --compare-source`.
6. Xem xét kết quả verify. Nếu PASS và row-count hợp lý:
   - **Cutover thủ công có chủ đích** (KHÔNG tự động): đổi `DATABASE_URL` của backend trỏ sang
     `pos_erp_restore_drill`, HOẶC đổi tên database (`ALTER DATABASE pos_erp RENAME TO
     pos_erp_broken; ALTER DATABASE pos_erp_restore_drill RENAME TO pos_erp;`) — đây là bước
     operator tự tay xác nhận, không có trong tooling này (§10: "Never restore blindly over a
     live production database without an explicit operator step").
7. Khởi động lại backend, xác nhận `/health` OK, kiểm tra vài luồng nghiệp vụ chính bằng tay.
8. Nếu verify FAIL ở bước 5: **không cutover.** Thử bản backup cũ hơn, hoặc điều tra nguyên nhân
   (xem §11 Troubleshooting).

## 7. Vì sao Redis bị loại khỏi phạm vi backup

4 nhóm nội dung Redis, tất cả tái tạo được hoặc chủ đích ngắn hạn:

| Nội dung | TTL | Điều gì xảy ra nếu mất sau disaster restore | Chấp nhận được vì |
|---|---|---|---|
| Giỏ hàng (Cart) | 30 phút | Khách/nhân viên POS mất giỏ hàng đang thao tác dở, phải thêm lại từ đầu | Chưa checkout — không phải giao dịch đã hoàn tất, không mất doanh thu đã ghi nhận |
| OTP quên mật khẩu | 5 phút | Người dùng đang reset mật khẩu phải yêu cầu OTP mới | OTP vốn chỉ sống 5 phút theo thiết kế, mất sớm hơn dự kiến vài phút không khác gì OTP hết hạn bình thường |
| Trạng thái xác minh OTP / cooldown / đếm số lần gửi | 1-60 phút | Người dùng có thể gửi lại OTP sớm hơn giới hạn thông thường | Giới hạn chống spam tạm thời nới lỏng, không phải mất dữ liệu nghiệp vụ |
| Hàng đợi gửi mail (BullMQ — OTP/reset password) | Tới khi xử lý xong (thường vài giây) + tối đa 3 lần retry | Email đang trong hàng đợi lúc backup có thể không được gửi | Người dùng bấm "Quên mật khẩu"/OTP lại là thao tác lặp lại được, không mất dữ liệu |

**Phiên đăng nhập/refresh token KHÔNG nằm trong Redis** — bảng `sessions` là bảng Postgres
(`backend/src/modules/auth/infrastructure/persistence/prisma-session.repository.ts`), đã nằm
trong phạm vi backup Postgres ở §1.

Không có nội dung nào trong Redis là dữ liệu nghiệp vụ không thể tái tạo (đơn hàng, tồn kho, công
nợ, hoá đơn — toàn bộ đều ở Postgres).

## 8. RPO / RTO (mục tiêu V1, thực tế theo lịch backup)

Máy đơn, offline, backup theo lịch (không có replication liên tục) — **KHÔNG** cam kết zero-data-
loss hay restore tức thời.

- **RPO (Recovery Point Objective): tối đa 24 giờ** — bằng chu kỳ backup hằng ngày khuyến nghị
  (§9). Mọi giao dịch ghi vào Postgres SAU lần backup gần nhất và TRƯỚC khi xảy ra sự cố sẽ mất
  nếu phải restore từ bản backup đó. Muốn RPO ngắn hơn, tăng tần suất chạy `ops:backup` (vd mỗi
  giờ) — đây là lựa chọn vận hành, không phải giới hạn kỹ thuật của tooling.
- **RTO (Recovery Time Objective): ước tính 15-30 phút** cho một database quy mô V1 (single-PC,
  không phải dữ liệu hàng trăm GB) — bao gồm thời gian chạy `pg_restore` + verify + cutover thủ
  công. Chưa đo thực tế trên dữ liệu production quy mô lớn; con số này là ước tính kỹ thuật dựa
  trên kích thước dump thử nghiệm trong CI, không phải SLA đã cam kết.

## 9. Retention (mặc định V1)

**"1 backup/ngày, giữ 7 bản gần nhất"** (`BACKUP_RETENTION_COUNT=7`, xem
`backend/src/modules/platform/backup/retention-policy.ts`). Đây là mặc định vận hành, không phải
bất biến — chỉnh qua biến môi trường nếu cần giữ lâu hơn.

Cleanup **chỉ** chạy sau khi backup mới đã verify thành công (§3 bước 5) — một lần chạy hỏng
không bao giờ xoá mất bản backup hợp lệ gần nhất.

`selectBackupsToDelete()` từ chối cấu hình `keepCount < 1` — không thể vô tình cấu hình "xoá sạch
toàn bộ backup."

## 10. Lịch chạy (Windows Task Scheduler / cron)

T051.03 chỉ cung cấp **lệnh có thể lên lịch được** (`npm run ops:backup`), không tự xây dựng nền
tảng lập lịch (§16 — "Do NOT overbuild a scheduling platform"). Tích hợp auto-start/scheduler
cuối cùng có thể hoàn thiện ở T051.04 (Deployment Packaging) nếu đó là lớp sở hữu phù hợp hơn.

Ví dụ Windows Task Scheduler (chạy mỗi ngày lúc 2:00 sáng):

```
Program/script:  npm.cmd
Arguments:       run ops:backup
Start in:        E:\kiotviet off\backend
Trigger:         Daily, 02:00
```

Ví dụ cron (nếu chạy trên Linux/WSL):

```cron
0 2 * * * cd /path/to/backend && npm run ops:backup >> /var/log/pos-erp-backup.log 2>&1
```

## 11. Windows / Docker

Máy vận hành Windows **không có** `pg_dump`/`pg_restore`/`psql` cài sẵn (đã xác nhận qua
`where pg_dump` trong quá trình phát triển T051.03). Vì Postgres chạy trong container
`postgres:16-alpine` (đã có `pg_dump`/`pg_restore` khớp version server), `BACKUP_MODE=docker-
compose` (mặc định) gọi:

```
docker compose exec -T -e PGPASSWORD=<mật khẩu> postgres pg_dump -h localhost -p 5432 -U <user> -d <db> -Fc ...
```

**Yêu cầu:** `docker compose up` đang chạy (container `postgres` healthy) và lệnh `ops:backup`/
`ops:restore` được chạy từ thư mục gốc repo (nơi có `docker-compose.yml`) hoặc `cwd` được truyền
đúng.

`BACKUP_MODE=direct` dùng khi máy chạy script **có sẵn** client Postgres trên PATH (đúng trường
hợp CI runner — xem §12).

## 12. Bằng chứng CI (Integration test thật)

`backend/test/backup-restore.e2e-spec.ts` chạy **thật** — không mock `pg_dump`/`pg_restore` —
trong job CI "E2E (Postgres + Redis thật)":

1. Cài `postgresql-client` trên CI runner (bước "Install PostgreSQL client tools").
2. Seed 1 dòng dữ liệu đại diện.
3. `runBackup()` thật (mode `direct`) → verify file + `pg_restore --list`.
4. `runRestore()` thật vào database MỚI, cô lập.
5. `verifyRestore()` thật: kết nối, `_prisma_migrations`, 6 bảng trọng yếu, so sánh row-count
   nguồn↔đích cho TOÀN BỘ dữ liệu đã tích luỹ trong CI database tới thời điểm đó (không chỉ dòng
   vừa seed).
6. Test thứ 2: xác nhận restore từ chối ghi đè database đích đã tồn tại.

Các unit test khác (`backup-runner.spec.ts`, `restore-runner.spec.ts`, `restore-verifier.spec.ts`,
`pg-process-runner.spec.ts`, `pg-tool-invocation.spec.ts`) dùng test double cho `child_process`/
Prisma client — chứng minh logic điều phối và xử lý lỗi (filename generation, retention selection,
race conditions, rollback-on-failure), **không** thay thế cho bằng chứng restore thật ở trên.

**Giới hạn đã biết:** integration test CI chạy `BACKUP_MODE='direct'` (binary trên PATH của CI
runner), không phải `docker-compose` (đường mà operator Windows thực tế dùng) — vì CI không dựng
`docker compose` cho job này (Postgres của CI là GitHub Actions service container, kết nối TCP
trực tiếp, không qua Compose). Đường gọi `docker-compose` (§11) được xây dựng và có unit test
kiểm tra đúng cấu trúc lệnh (`pg-tool-invocation.spec.ts`), nhưng **không** có bằng chứng end-to-
end tự động cho chính đường gọi đó — chỉ có review mã nguồn tĩnh + hướng dẫn vận hành thủ công ở
runbook này. Vận hành viên nên tự chạy thử một lần "backup drill" thật trên máy triển khai thật
trước khi tin tưởng hoàn toàn vào đường `docker-compose`.

## 13. Xử lý lỗi (Failure Modes)

| Lỗi | Hành vi | Cách xử lý |
|---|---|---|
| Postgres không kết nối được | `pg_dump`/`pg_restore` exit non-zero, lỗi actionable kèm `stderr` gốc | Kiểm tra `docker compose ps`, `DATABASE_URL` |
| Sai user/password | `pg_dump: FATAL: password authentication failed` trong `stderr` | Kiểm tra `.env` khớp `docker-compose.yml` |
| Đĩa đầy giữa lúc dump | `pg_dump` exit non-zero, file `.partial` bị xoá ngay | Giải phóng dung lượng, chạy lại |
| Thư mục backup không truy cập được | `mkdir` ném lỗi trước khi chạm tới `pg_dump` | Kiểm tra quyền/tồn tại của `BACKUP_DIR` |
| File backup 0 byte dù `pg_dump` báo exit 0 | Coi là lỗi verify (`BackupVerificationFailedError`), file bị xoá | Hiếm gặp — thử lại, kiểm tra dung lượng đĩa |
| `pg_restore --list` không đọc được file | Coi là lỗi verify, file bị xoá, không đổi tên thành bản cuối | File backup hỏng thật sự — dùng bản backup khác |
| Database đích đã tồn tại lúc restore | Từ chối ngay, không CREATE/pg_restore | Chọn tên khác, hoặc tự xoá database cũ có chủ đích |
| `pg_restore` thất bại giữa chừng | Database đích vừa tạo bị `DROP` (rollback) | Kiểm tra `stderr`, thử bản backup khác hoặc sửa nguyên nhân |
| Đĩa đầy giữa lúc restore | `pg_restore` exit non-zero → rollback như trên | Giải phóng dung lượng |
| Version Postgres không tương thích | `pg_restore` báo lỗi cụ thể trong `stderr` | Backup/restore cùng major version Postgres (V1: luôn `postgres:16-alpine`) |

Mọi lỗi đều: (1) có exit code khác 0, (2) in `stderr` gốc của `pg_dump`/`pg_restore` để operator
chẩn đoán, (3) không để lại artifact/database nửa vời trông như đã thành công.

## 14. Config / Secrets — KHÔNG nằm trong backup Postgres

Backup database **không** tự động bảo toàn cấu hình môi trường. Operator phải tự lưu trữ riêng
(ngoài `pg_dump`, KHÔNG bao giờ bỏ secrets vào chung artifact backup):

- `backend/.env` (production) — `DATABASE_URL`, `REDIS_*`, SMTP config.
- `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` — do operator cấu hình qua biến môi trường
  (`.env.example`), **không** được sinh động và lưu nội bộ ứng dụng — nếu mất `.env`, các secret
  này phải được tái cấp phát thủ công (đổi giá trị mới), việc này làm **mọi session đang đăng
  nhập bị vô hiệu** (không phải mất dữ liệu — chỉ là người dùng phải đăng nhập lại).
- `docker-compose.yml` + `.env` gốc repo (POSTGRES_USER/PASSWORD/DB).

Không phát hiện secret nào được sinh động lúc runtime và không thể thay thế được — không có điều
kiện STOP nào theo §14 của authorization.

## 15. Bảo mật

- File backup (`.dump`) chứa **toàn bộ dữ liệu nghiệp vụ** — coi như dữ liệu nhạy cảm tương đương
  chính database.
- `BACKUP_DIR` mặc định (`./backups`) nằm **ngoài** thư mục được git track (`.gitignore` đã thêm
  `/backups/` và `*.dump` — xem `backend/.gitignore`) — không bao giờ commit artifact backup lên
  git.
- Không public/serve file backup qua web — tooling này không có endpoint HTTP nào expose backup
  (§23 — đúng theo yêu cầu "no public backup HTTP endpoint").
- Password Postgres **không bao giờ** xuất hiện trong argv khi chạy `BACKUP_MODE=direct` (chỉ qua
  biến môi trường `PGPASSWORD` của tiến trình con).
- **Giới hạn đã biết (`BACKUP_MODE=docker-compose`):** password truyền qua
  `docker compose exec -e PGPASSWORD=...`, xuất hiện ngắn hạn trong danh sách tiến trình (`ps`)
  **của chính máy local** trong lúc lệnh chạy. Chấp nhận được cho mục tiêu V1 (máy đơn, offline,
  không network-exposed, không có user khác trên cùng máy trong mô hình triển khai hiện tại).
  Không tự phát minh hệ thống mã hoá/quản lý khoá trong T051.03 (§18 — "Do not invent an
  encryption/key-management system... unless one already exists").
- Khuyến nghị (tuỳ chọn, chưa triển khai): mã hoá file backup ở nghỉ (at rest) bằng công cụ hệ
  điều hành sẵn có (BitLocker trên Windows) nếu máy vận hành lưu trữ dữ liệu nhạy cảm và có nguy
  cơ mất thiết bị vật lý.

## 16. Troubleshooting nhanh

| Triệu chứng | Kiểm tra |
|---|---|
| `ops:backup` báo "DATABASE_URL chưa được set" | `backend/.env` có tồn tại và có `DATABASE_URL` không? |
| `ops:backup` treo lâu không phản hồi | `docker compose ps` — container `postgres` có healthy không? |
| `ops:restore` báo "đã tồn tại" | Database trùng tên còn từ lần restore trước — đổi tên đích hoặc tự xoá |
| `ops:verify-restore` báo thiếu bảng trọng yếu | `pg_restore` có thật sự exit 0 không (xem log `ops:restore`)? Backup có đúng là từ schema hiện tại không? |
| CI job "E2E (Postgres + Redis thật)" fail ở bước backup/restore | Xem log bước "Install PostgreSQL client tools" và test `backup-restore.e2e-spec.ts` cụ thể |

## 17. Rollback tooling này

Xoá tooling T051.03 không cần migration schema nào (không thêm/đổi cột nào trong `schema.prisma`
— thuần túy operational code). `git revert` commit T051.03 khôi phục nguyên trạng trước đó sạch
sẽ. Xem FINAL SPRINT REPORT — T051.03 để có bằng chứng `git revert --no-commit` đã chạy sạch.

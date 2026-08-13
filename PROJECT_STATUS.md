# Project Status

**Nguồn trạng thái chính của dự án** (Decision T006-R04, thu gọn phạm vi theo Decision P04 — chỉ giữ Version/Sprint hiện tại/Release; Progress/Module Status/Overall Project/Roadmap chuyển hẳn sang `docs/SPRINT_DASHBOARD.md`, không lặp lại ở đây). Đọc file này + `SPRINT_DASHBOARD.md` trước khi bắt đầu bất kỳ task mới nào sau khi hết session.

**Cập nhật lần cuối:** 2026-08-13 (T051.05 Documentation Sync — thay thế nội dung cũ mô tả trạng thái T013/T014, đã lệch thực tế ~40 task).

---

## Version

**Tag chính thức gần nhất:** `v0.10.0-sales-return-exchange` (2026-07-27) — xem `git tag -l` cho toàn bộ 11 tag từ `v0.1.0-foundation`. **HEAD hiện tại (`main` @ `d13fa15`) đã vượt xa tag này** — toàn bộ chuỗi T030 (Environment Recovery) → T031 (Frontend Foundation) → T032 (Platform Recovery) → T033-T050 (module hoá lại Category/Brand/Unit/Product/Inventory/Purchase/Sales/SalesReturn/Customer/Supplier/Purchase Report theo numbering phụ thuộc mới) → T051 (Release Hardening series) đã merge vào `main` **CHƯA GẮN TAG mới**. Việc đồng bộ version 3 `package.json` (hiện không nhất quán: root `0.1.0`, backend `0.0.1`, frontend `0.1.0`) + tạo tag `v1.0.0-rc1` nằm trong lộ trình hoàn tất V1.0 dưới đây — **CHƯA thực hiện ở package này (T051.05 chỉ là docs-sync).**

## Giai đoạn hiện tại: RELEASE HARDENING — FEATURE FREEZE ĐANG HIỆU LỰC

Phát triển tính năng nghiệp vụ mới **ĐANG ĐÓNG BĂNG**. Toàn bộ domain nghiệp vụ cốt lõi cho phạm vi V1 (Product/Category/Brand/Unit/Barcode, Customer/Supplier, Purchase/PurchaseReturn, Sales/SalesReturn, Inventory/Transfer/StockCount/InventoryAdjustment, Checkout/Invoice/Payment, Purchase Report, RBAC) đã hoàn tất triển khai — **T050 (Purchase Report) là task nghiệp vụ cuối cùng, ĐÃ ĐÓNG** (PR #40). Từ đó trở đi, công việc là chuỗi **T051.x — Release Hardening**, không phải tính năng mới:

| Package | Nội dung | Trạng thái |
|---|---|---|
| T051.00 | RBAC Tenant Isolation — vá 1 lỗ hổng cross-tenant đã xác nhận trên endpoint role/permission | **ĐÃ ĐÓNG** (PR #41) |
| T051.02 | Concurrency Hardening — optimistic-lock/CAS cho PurchaseOrder.receive, PurchaseReturn.complete, Transfer transitions, StockCount.complete, InventoryAdjustment.complete | **ĐÃ ĐÓNG** (PR #42) |
| T051.03 | Backup / Restore (PostgreSQL) — pg_dump/pg_restore, xác minh bằng `pg_restore --list`, retention, loại trừ Redis khỏi phạm vi backup | **ĐÃ ĐÓNG** (PR #43, #44) |
| T051.04 | Deployment Packaging — Windows → Docker Desktop/Compose → Postgres+Redis → bring-up → backend → frontend, đã chứng minh thật qua CI trên merge commit | **ĐÃ ĐÓNG** (PR #45) |
| — | **V1.0 Release Candidate Readiness Audit** — đánh giá lại từ nguồn sau 4 package trên | **HOÀN TẤT — 0 RC blocker được xác nhận** (`docs/release/T051-V1-RELEASE-CANDIDATE-READINESS.md`) |
| T051.05 | Documentation Sync (package này) — đồng bộ `PROJECT_STATUS.md`/`SPRINT_DASHBOARD.md` với thực tế post-T051.04 | **ĐANG THỰC HIỆN** |

**Phần việc còn lại là hoàn thiện phát hành (release finalization), KHÔNG phải phát triển tính năng mới.** Xem mục "Lộ trình hoàn tất V1.0" bên dưới.

## Release

- **Tag chính thức gần nhất:** `v0.10.0-sales-return-exchange` (2026-07-27). ~2.5 tuần công việc (T030 → T051.04, PR #3 → #45) đã merge vào `main` nhưng chưa gắn tag mới — xem mục "Version" ở trên.
- **V1.0 Release Candidate Readiness Audit** (2026-08-13, `docs/release/T051-V1-RELEASE-CANDIDATE-READINESS.md`): đánh giá lại TỪ NGUỒN (không tái sử dụng audit cũ chưa xác minh) 4 package hardening + toàn bộ hạng mục RC (branch protection, tenant isolation, concurrency, frontend E2E, migration/rollback, first-admin bootstrap, operator experience, security, docs, versioning). Kết luận: **0 RC blocker xác nhận**. Feature completeness ước tính ~90-95%, Release readiness ước tính ~80-85% (hai số không gộp — xem tài liệu gốc để hiểu rõ khác biệt).
- **Lộ trình hoàn tất V1.0** (đã Architect duyệt, thứ tự cố định — không phải RC blocker, là điều kiện cho FINAL v1.0.0):
  1. **T051.05 — Documentation Sync** (package này)
  2. Branch Protection phạm vi thu hẹp (required status checks + chặn force-push `main`)
  3. Tenant Audit phạm vi thu hẹp — CHỈ 6 module (`supplier-debt`/payment, `customer-point`, `discount`, `payment`, `product-price`, `cart`), không phải toàn bộ 27 module
  4. Playwright suite tối thiểu — 1 kịch bản liền mạch Login→PO→Receive→Inventory→Checkout→Invoice→SalesReturn→Inventory
  5. Ổn định 2 test flaky đã biết (`use-supplier-export.test.tsx`, `use-purchase-report-export.test.tsx` — real-timer race, không phải lỗi production)
  6. Xác minh phát hành cuối + gắn tag `v1.0.0` chính thức
- **Versioning Policy** (Decision T006-R07, vẫn hiệu lực): giữ `v0.x.y` cho tới khi hoàn tất đầy đủ domain theo roadmap — **điều kiện này nay đã thoả** (xem giai đoạn hiện tại ở trên); chuyển `v1.0.0` được thực hiện qua đúng lộ trình 6 bước trên, không phát hành sớm/ngoài quy trình.

## Tài liệu tham chiếu nhanh

| Cần gì | Xem ở đâu |
|---|---|
| Tiến độ / Module Status / Roadmap | `docs/SPRINT_DASHBOARD.md` |
| Quy trình AI phải theo trước khi code | `docs/project-governance/AI_WORKFLOW.md` |
| Toàn bộ quy tắc governance | `docs/project-governance/README.md` |
| Template chuẩn Master Data (Decision P01) | `docs/architecture/MASTER_DATA_TEMPLATE.md` |
| Quyết định đã ổn định, tổng hợp (Decision P02) | `docs/architecture/MASTER_DECISION.md` |
| Mặc định được tự áp dụng không cần hỏi lại (Decision P03) | `docs/architecture/DEFAULT_DECISIONS.md` |
| Kiến trúc bất biến / ADR | `docs/architecture/adr/` |
| Báo cáo implementation từng Task | `docs/implementation/t0xx-*.md` |
| Release Note từng Task | `docs/release/t0xx-release-note.md` |
| SPEC đã duyệt | `docs/specifications/SPEC-*.md` |
| Technical Debt / PENDING đang mở | `docs/architecture/technical-debt.md` |
| V1.0 Release Candidate Readiness Audit (đầy đủ, có bằng chứng file:line) | `docs/release/T051-V1-RELEASE-CANDIDATE-READINESS.md` |
| Windows Deployment Runbook (vận hành viên) | `docs/release/WINDOWS-DEPLOYMENT-RUNBOOK.md` |
| Backup/Restore Runbook | `docs/release/BACKUP-RESTORE-RUNBOOK.md` |

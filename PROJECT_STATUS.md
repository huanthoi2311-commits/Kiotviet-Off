# Project Status

**Nguồn trạng thái chính của dự án** (Decision T006-R04, thu gọn phạm vi theo Decision P04 — chỉ giữ Version/Sprint hiện tại/Release; Progress/Module Status/Overall Project/Roadmap chuyển hẳn sang `docs/SPRINT_DASHBOARD.md`, không lặp lại ở đây). Đọc file này + `SPRINT_DASHBOARD.md` trước khi bắt đầu bất kỳ task mới nào sau khi hết session.

**Cập nhật lần cuối:** 2026-08-14 (T051.09 Final V1.0 Finalization).

---

## Version

**Tag chính thức gần nhất:** `v0.10.0-sales-return-exchange` (2026-07-27) — xem `git tag -l` cho toàn bộ 11 tag từ `v0.1.0-foundation`. **HEAD hiện tại đã vượt xa tag này** — toàn bộ chuỗi T030 → T051.09 đã merge vào `main`, **CHƯA GẮN TAG mới**. **Git tag là nguồn định danh phát hành chính thức duy nhất của dự án** (xác nhận qua lịch sử: cả 10 tag `v0.1.0-foundation` → `v0.10.0-sales-return-exchange` đều KHÔNG đồng bộ với version trong 3 `package.json`, vốn vẫn giữ nguyên `0.1.0`/`0.0.1`/`0.1.0` xuyên suốt — 3 file này KHÔNG dùng làm định danh phát hành, không cần đồng bộ). Tag tiếp theo dự kiến: **`v1.0.0`** (không hậu tố — bản GA đầu tiên, khác quy ước hậu tố theo module của các tag trước) — **CHƯA được tạo, chờ Architect uỷ quyền riêng.**

## Giai đoạn hiện tại: V1.0 READY FOR RELEASE — FEATURE FREEZE ĐANG HIỆU LỰC

Phát triển tính năng nghiệp vụ mới **ĐANG ĐÓNG BĂNG**. Toàn bộ domain nghiệp vụ cốt lõi cho phạm vi V1 đã hoàn tất triển khai — **T050 (Purchase Report) là task nghiệp vụ cuối cùng, ĐÃ ĐÓNG** (PR #40). Toàn bộ chuỗi **T051.x — Release Hardening** đã đóng:

| Package | Nội dung | Trạng thái |
|---|---|---|
| T051.00 | RBAC Tenant Isolation — vá 1 lỗ hổng cross-tenant đã xác nhận trên endpoint role/permission | **ĐÃ ĐÓNG** (PR #41) |
| T051.01 | Branch Protection (`main`) — GitHub Repository Ruleset (ID 20395629) | **ĐÃ ĐÓNG**, tái xác nhận T051.09 (xem ghi chú dưới) |
| T051.02 | Concurrency Hardening — optimistic-lock/CAS cho PurchaseOrder.receive, PurchaseReturn.complete, Transfer transitions, StockCount.complete, InventoryAdjustment.complete | **ĐÃ ĐÓNG** (PR #42) |
| T051.03 | Backup / Restore (PostgreSQL) | **ĐÃ ĐÓNG** (PR #43, #44) |
| T051.04 | Deployment Packaging | **ĐÃ ĐÓNG** (PR #45) |
| T051.05 | Documentation Sync | **ĐÃ ĐÓNG** |
| T051.06A/B | Checkout Tenant Isolation / Tenant-Owned Foreign-ID Hardening | **ĐÃ ĐÓNG** |
| T051.08A-D | Auth Envelope / Cookie Secure Transport / Cookie Path / Bootstrap Organization Completeness | **ĐÃ ĐÓNG** |
| T051.08 | Real-Browser Release E2E (7/7 test, stack đóng gói thật) | **ĐÃ ĐÓNG** |
| T051.09 | Final V1.0 Finalization (package này) — ổn định 2 flaky test, sửa `useCurrentOrganization` envelope, audit raw Axios, tái xác nhận security/tenant/concurrency, release notes, acceptance matrix | **ĐANG HOÀN TẤT** — xem `docs/release/V1.0.0-RELEASE-NOTES.md` |

**T051.01 Branch Protection — ghi chú quan trọng (T051.09)**: audit độc lập ban đầu dùng sai API endpoint (legacy `branches/{branch}/protection`, trả 404) và tưởng nhầm protection đã mất. Xác nhận lại qua đúng API Repository Ruleset: ruleset `20395629` "Protect main" **vẫn active liên tục từ 2026-08-04**, chưa từng bị xoá/tắt — 404 ở endpoint cũ là do repo dùng cơ chế Ruleset (mới hơn), không phải Classic Branch Protection. Không có khoảng trống bảo vệ thật nào từng xảy ra.

**Phần việc còn lại**: chờ Architect xác nhận ma trận chấp nhận phát hành (T051.09) rồi uỷ quyền tạo tag `v1.0.0` + GitHub Release — KHÔNG phải phát triển thêm.

## Release

- **Tag chính thức gần nhất:** `v0.10.0-sales-return-exchange` (2026-07-27). Toàn bộ T030 → T051.09 đã merge vào `main` nhưng chưa gắn tag mới.
- **V1.0 Release Candidate Readiness Audit** (2026-08-13, `docs/release/T051-V1-RELEASE-CANDIDATE-READINESS.md`): 0 RC blocker xác nhận tại thời điểm đó.
- **T051.09 Final V1.0 Finalization** (2026-08-14): ổn định `use-supplier-export.test.tsx` VÀ `use-purchase-report-export.test.tsx` (cả 2 cùng 1 lớp lỗi real-timer race trong test — đã sửa bằng Promise tự kiểm soát thay vì `setTimeout` thật, xác nhận qua 10 lần chạy toàn bộ Vitest suite liên tiếp không lỗi); sửa `useCurrentOrganization()` (cùng lớp lỗi envelope đã sửa ở T051.08A, latent nhưng đã xác nhận đủ điều kiện sửa trước V1); audit raw Axios lần cuối (không còn consumer envelope chưa xác định); tái xác nhận security/tenant/concurrency/branch-protection; release notes + acceptance matrix. Chi tiết đầy đủ: `docs/release/V1.0.0-RELEASE-NOTES.md`.
- **Versioning Policy** (Decision T006-R07, vẫn hiệu lực): giữ `v0.x.y` cho tới khi hoàn tất đầy đủ domain theo roadmap — điều kiện này đã thoả. Chuyển `v1.0.0` chờ Architect uỷ quyền riêng (KHÔNG tự tạo tag/GitHub Release trong package T051.09).

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

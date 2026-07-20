# Project Status

**Nguồn trạng thái chính của dự án** (Decision T006-R04, thu gọn phạm vi theo Decision P04 — chỉ giữ Version/Sprint hiện tại/Release; Progress/Module Status/Overall Project/Roadmap chuyển hẳn sang `docs/SPRINT_DASHBOARD.md`, không lặp lại ở đây). Đọc file này + `SPRINT_DASHBOARD.md` trước khi bắt đầu bất kỳ task mới nào sau khi hết session.

---

## Version

**Version hiện tại (đã tag):** `v0.8.0-supplier-domain`
**Version đề xuất cho T013 (chưa tag):** `v0.9.0-sales-foundation` — chờ Final Release Review (Decision AD16) xác nhận.

## Sprint hiện tại

**Roadmap toàn dự án được chốt lại** (`ARCHITECT SCOPE CORRECTION`, Decision SC01-SC13) — hệ thống chuyển hẳn sang mô hình **Offline Single-Computer** (chi tiết đầy đủ ở `docs/SPRINT_DASHBOARD.md`). **T013 — Sales Foundation (Type A): COMPLETED ở cấp độ kiến trúc** — toàn bộ 7 Phase (Idempotency Foundation → Repository Boundary Cleanup → Checkout Refactor → Invoice Number Integration → Invoice Snapshot → Service Product Support → Final Regression & Release Readiness) đều APPROVED, phát sinh Decision AD07-AD16 (chi tiết đầy đủ `docs/project-governance/AI_WORKFLOW.md`, `docs/implementation/IMPLEMENTATION-PLAN-T013-SALES-FOUNDATION.md`). Release Readiness Checklist (Phase 7) 7/7 PASS. **Trạng thái: Ready for Release Preparation** — release note đã soạn (`docs/release/t013-release-note.md`), CHƯA commit/push/tag (Decision AD16 yêu cầu một vòng Final Release Review riêng trước khi authorize). **Module kế tiếp:** T014 — Sales Return, WAITING RFC từ Architect.

## Release

- **Tag mới nhất (đã phát hành):** `v0.8.0-supplier-domain` — Release Note: `docs/release/t012-release-note.md`.
- **T013 Sales Foundation — Release Note đã soạn, chưa tag:** `docs/release/t013-release-note.md` (đề xuất `v0.9.0-sales-foundation`, chờ Final Release Review).
- **Technical Complete (T013) = YES** (Phase 7 Release Readiness Checklist 7/7 PASS — RFC/SPEC implemented, không API breaking ngoài dự kiến, không schema drift, không Repository Boundary violation, không Transaction regression). **Operational Complete = PENDING** (Docker Integration Test/Rollback Test/Manual Smoke Test/End-to-End Acceptance Scenario cho T013 — theo dõi tập trung ở `docs/architecture/technical-debt.md`).
- **Regression Baseline tại thời điểm Phase 7 (T013, chưa tag):** 166/166 test suite PASS, 1584/1584 test PASS (chạy lại 2 lần, cả 2 lần fully clean — không có flake).
- **Regression Baseline tại thời điểm release T012 (đã tag):** 156/157 test suite PASS, 1523/1525 test PASS.
- **Versioning Policy** (Decision T006-R07): `v0.x.y` xuyên suốt Foundation + Master Data + CRM + Inventory + POS + ERP Core. Chỉ chuyển `v1.0.0` khi hoàn thành đầy đủ các domain trên theo roadmap — không phát hành sớm.

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

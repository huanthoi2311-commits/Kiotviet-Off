# Project Status

**Nguồn trạng thái chính của dự án** (Decision T006-R04, thu gọn phạm vi theo Decision P04 — chỉ giữ Version/Sprint hiện tại/Release; Progress/Module Status/Overall Project/Roadmap chuyển hẳn sang `docs/SPRINT_DASHBOARD.md`, không lặp lại ở đây). Đọc file này + `SPRINT_DASHBOARD.md` trước khi bắt đầu bất kỳ task mới nào sau khi hết session.

---

## Version

**Version hiện tại:** `v0.8.0-supplier-domain`

## Sprint hiện tại

**Roadmap toàn dự án được chốt lại** (`ARCHITECT SCOPE CORRECTION`, Decision SC01-SC13) — hệ thống chuyển hẳn sang mô hình **Offline Single-Computer** (chi tiết đầy đủ ở `docs/SPRINT_DASHBOARD.md`). **T012 — Supplier Domain: DONE** (`FINAL RELEASE REVIEW` APPROVED — Repository Boundary fix `supplier-debt` + `SequenceCodeGeneratorService` dùng chung là điểm nổi bật nhất, chi tiết `docs/release/t012-release-note.md`). Sau T012, dự án chính thức áp dụng **Decision AD06 — Type A (Business-Critical) có quy trình chi tiết 13 bước, không Fast Track** — xem `docs/project-governance/AI_WORKFLOW.md`. Module kế tiếp: **T013 — Sales Foundation** (Type A), WAITING RFC từ Architect. Không tự viết RFC/SPEC/Implementation Plan/code cho T013.

## Release

- **Tag mới nhất:** `v0.8.0-supplier-domain` — Release Note đầy đủ: `docs/release/t012-release-note.md`.
- **Technical Complete = YES, Operational Complete = PENDING** (Docker Integration Test/Rollback Test/Manual Smoke Test/Performance Benchmark/End-to-End Acceptance Scenario/Branch Coverage Barcode+Customer+Supplier ≥90% — theo dõi tập trung ở `docs/architecture/technical-debt.md`).
- **Regression Baseline tại thời điểm release:** 156/157 test suite PASS, 1523/1525 test PASS (Sprint-00 + T005 Product + T006 Category + T007 Brand + T008 Unit + T009 Barcode + T011 Customer + T012 Supplier).
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

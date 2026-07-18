# Project Status

**Nguồn trạng thái chính của dự án** (Decision T006-R04, thu gọn phạm vi theo Decision P04 — chỉ giữ Version/Sprint hiện tại/Release; Progress/Module Status/Overall Project/Roadmap chuyển hẳn sang `docs/SPRINT_DASHBOARD.md`, không lặp lại ở đây). Đọc file này + `SPRINT_DASHBOARD.md` trước khi bắt đầu bất kỳ task mới nào sau khi hết session.

---

## Version

**Version hiện tại:** `v0.7.0-customer-domain`

## Sprint hiện tại

**Roadmap toàn dự án được chốt lại** (`ARCHITECT SCOPE CORRECTION`, Decision SC01-SC13) — hệ thống chuyển hẳn sang mô hình **Offline Single-Computer** (chi tiết đầy đủ ở `docs/SPRINT_DASHBOARD.md`). **T011 — Customer Domain: DONE** (`FINAL RELEASE REVIEW`, FR01-FR10 APPROVED — Repository Boundary fix `checkout`/`customer-point` là điểm nổi bật nhất, chi tiết `docs/release/t011-release-note.md`). Sau T011, dự án chính thức áp dụng **Decision AD05 — phân loại module Type A (Business-Critical, đủ 7 bước + Implementation Plan) / Type B (Standard Master Data, Fast Track 5 bước không Implementation Plan)** — xem `docs/project-governance/AI_WORKFLOW.md`. **T012 — Supplier Domain (Type B): IMPLEMENTATION REPORT đã nộp, chờ `FINAL RELEASE REVIEW` từ Architect** (RFC v2 → SPEC-T012-SUPPLIER-001 → Architecture Review SP01-SP13 → Implementation — chưa commit/push/tag, chi tiết `docs/release/t012-release-note.md`). Không tự commit/push/tag khi chưa có Final Release Review.

## Release

- **Tag mới nhất:** `v0.7.0-customer-domain` — Release Note đầy đủ: `docs/release/t011-release-note.md`.
- **Technical Complete = YES, Operational Complete = PENDING** (Docker Integration Test/Rollback Test/Manual Smoke Test/Performance Benchmark/End-to-End Migration Scenario/Branch Coverage Barcode+Customer ≥90% — theo dõi tập trung ở `docs/architecture/technical-debt.md`).
- **Regression Baseline tại thời điểm release:** 153/153 test suite PASS, 1478/1478 test PASS (Sprint-00 + T005 Product + T006 Category + T007 Brand + T008 Unit + T009 Barcode + T011 Customer).
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

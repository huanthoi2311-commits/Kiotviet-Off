# Project Status

**Nguồn trạng thái chính của dự án** (Decision T006-R04, thu gọn phạm vi theo Decision P04 — chỉ giữ Version/Sprint hiện tại/Release; Progress/Module Status/Overall Project/Roadmap chuyển hẳn sang `docs/SPRINT_DASHBOARD.md`, không lặp lại ở đây). Đọc file này + `SPRINT_DASHBOARD.md` trước khi bắt đầu bất kỳ task mới nào sau khi hết session.

---

## Version

**Version hiện tại (đã tag & release):** `v0.9.0-sales-foundation` (commit `aefdfa7`, docs hotfix `3ca8066`) — T013 Sales Foundation.

## Sprint hiện tại

**Roadmap toàn dự án được chốt lại** (`ARCHITECT SCOPE CORRECTION`, Decision SC01-SC13) — hệ thống chuyển hẳn sang mô hình **Offline Single-Computer** (chi tiết đầy đủ ở `docs/SPRINT_DASHBOARD.md`). **T013 — Sales Foundation: RELEASED** (commit/tag/push hoàn tất qua Release Workflow 4 bước, Decision AD16/AD19-AD23; GitHub Release publish thủ công do môi trường không có `gh` CLI/token). **T014 — Sales Return & Exchange (Type A): RFC-T014 v1.1 APPROVED** (2 Critical Finding của v1.0 — Refund/Return lifecycle contradiction, Eligible Quantity concurrency — đã giải quyết ở mức kiến trúc, xem `docs/architecture/T014-rfc-v1.1-architecture-review.md`; Decision AD27-AD45 là baseline chính thức, `docs/project-governance/AI_WORKFLOW.md`). **Trạng thái: SPEC-T014 AUTHORIZED, đang soạn.** Implementation CHƯA được phép. Branch làm việc: `feature/T014-sales-return` (tạo từ baseline `3ca8066`, chưa push).

## Release

- **Tag mới nhất (đã phát hành):** `v0.9.0-sales-foundation` — Release Note: `docs/release/t013-release-note.md`, `docs/release/RELEASE-NOTES-T013.md`, `docs/release/CHANGELOG-T013.md`. Commit `aefdfa7` (feature) + `3ca8066` (docs hotfix), cả hai đã push lên `origin/main`. GitHub Release: publish thủ công (không có `gh` CLI/token trong môi trường phát triển).
- **Tag trước:** `v0.8.0-supplier-domain` — Release Note: `docs/release/t012-release-note.md`.
- **Regression Baseline tại thời điểm release T013:** 166/166 test suite PASS, 1584-1590/1584-1590 test PASS (chạy nhiều lần ở Phase 7 + RC Validation Lite, luôn fully clean hoặc chỉ có flake Argon2 đã biết, không phải regression).
- **T014 — Discovery** (`docs/discovery/T014-SALES-RETURN-DISCOVERY.md`) **→ RFC v1 (Not Approved, 2 Critical) → RFC v1.1 (APPROVED)** (`docs/rfc/RFC-T014-SALES-RETURN-EXCHANGE.md`, review: `docs/architecture/T014-rfc-architecture-review.md` + `docs/architecture/T014-rfc-v1.1-architecture-review.md`). SPEC-T014 đang soạn.
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

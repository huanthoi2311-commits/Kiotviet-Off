# Project Status

**Đây là nguồn trạng thái chính của dự án** (Decision T006-R04) — đọc file này để biết đang ở đâu, việc gì vừa xong, việc gì tiếp theo, trước khi bắt đầu bất kỳ task mới nào sau khi hết session. Cập nhật file này mỗi khi đóng 1 Sprint task (T00x) hoặc phát hành version mới.

**Version hiện tại:** `v0.4.0-brand-foundation`
**Sprint hiện tại:** Sprint-01 (đang tiến hành, ~30% — Decision T007-R07)
**Task tiếp theo:** T008 — Unit Domain, chờ Architect ban hành `RFC-0004 — Unit Domain`. **Không tự bắt đầu RFC-0004/SPEC/code cho T008 khi chưa có chỉ đạo của Architect** (Decision T007-R08). Roadmap cố định: Brand → Unit → Barcode → Attribute → Variant, không bỏ qua thứ tự.

---

## Sprint-00 — Architecture Stabilization (ĐÃ ĐÓNG)

Tag `v0.1.0-foundation`. Xem `docs/implementation/sprint-00-summary.md`, `docs/release/gate-status.md`.

## Sprint-01 — Progress

| Task | Domain | SPEC | Trạng thái | Tag |
|---|---|---|---|---|
| T005 | Product Refactor | `SPEC-PRODUCT-001` | ✅ **DONE** (Technical Complete, Operational Complete PENDING) | `v0.2.0-product-foundation` |
| T006 | Category Implementation | `SPEC-CATEGORY-001` | ✅ **DONE** (Technical Complete, Operational Complete PENDING) | `v0.3.0-category-foundation` |
| T007 | Brand Domain | `SPEC-BRAND-001` | ✅ **DONE** (Technical Complete, Operational Complete PENDING) | `v0.4.0-brand-foundation` |
| T008 | Unit Domain | — | ⬜ Chờ `RFC-0004` từ Architect | — |

**Quy trình chuẩn đang áp dụng** (từ T006 trở đi, chạy trọn vẹn):
`Dependency Audit → RFC → Architecture Review → SPEC → Implementation Plan → Architecture Review → Code (theo đúng thứ tự bước, không gộp) → Architecture Review → Release`.

## Regression Baseline (Decision T006-R06, mở rộng bởi T007-04.9)

Từ T006 trở đi, **mỗi Sprint task mới phải xác nhận toàn bộ Task đã DONE trước đó vẫn PASS** — chạy `npx jest` toàn bộ, không chỉ phạm vi module đang làm. Hiện tại (sau T007 DONE): **139/139 test suite PASS, 1318/1318 test PASS** — xác nhận T005 (Product) + T006 (Category) + Auth/RBAC/Inventory/Organization/Branch đều không bị ảnh hưởng bởi T007. Baseline cho T008 (Unit) gồm **T005 + T006 + T007**.

## Operational Pending toàn dự án

Xem `docs/architecture/technical-debt.md` — theo dõi tập trung mọi mục PENDING do giới hạn môi trường (không có Docker/Postgres/Redis trong sandbox phát triển hiện tại), không phải Bug/Technical Debt thật.

## Versioning Policy (Decision T006-R07)

- `v0.x.y` cho toàn bộ giai đoạn Foundation và phát triển các domain (Master Data, CRM, Inventory, POS, ERP Core).
- Chỉ chuyển sang `v1.0.0` khi hoàn thành đầy đủ các domain trên theo roadmap.
- **Không phát hành `v1.0.0` sớm.**

## Tài liệu tham chiếu nhanh

| Cần gì | Xem ở đâu |
|---|---|
| Quy trình AI phải theo trước khi code | `docs/project-governance/AI_WORKFLOW.md` |
| Toàn bộ quy tắc governance | `docs/project-governance/README.md` |
| Kiến trúc bất biến / ADR | `docs/architecture/adr/` |
| Báo cáo implementation từng Task | `docs/implementation/t0xx-*.md` |
| Release Note từng Task | `docs/release/t0xx-release-note.md` |
| SPEC đã duyệt | `docs/specifications/SPEC-*.md` |
| Technical Debt / PENDING đang mở | `docs/architecture/technical-debt.md` |

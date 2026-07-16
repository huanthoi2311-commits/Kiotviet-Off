# Project Status

**Đây là nguồn trạng thái chính của dự án** (Decision T006-R04) — đọc file này để biết đang ở đâu, việc gì vừa xong, việc gì tiếp theo, trước khi bắt đầu bất kỳ task mới nào sau khi hết session. Cập nhật file này mỗi khi đóng 1 Sprint task (T00x) hoặc phát hành version mới.

**Version hiện tại:** `v0.5.0-unit-foundation`
**Sprint hiện tại:** Sprint-01 (đang tiến hành, ~40% — Decision UR08)
**Task tiếp theo:** ⚠️ **Chưa xác định — có mâu thuẫn cần Architect xác nhận lại**, xem "Ghi chú roadmap" ngay dưới đây. Không tự bắt đầu Audit/RFC mới cho tới khi rõ ràng (Decision UR08).

### ⚠️ Ghi chú roadmap (cần Architect xác nhận)

`ARCHITECTURE REVIEW – T008 Unit Implementation` (Decision UR08) nêu module kế tiếp là **T009 — Customer Domain**, "WAITING RFC-0005". Điều này khác với roadmap cố định đã thiết lập nhiều lần trước đó:
- `ARCHITECT DECISION – CLOSE T006 & START SPRINT T007` (Decision T007-03): *"Brand → Unit → Barcode → Attribute → Variant, không được bỏ qua thứ tự."*
- `ARCHITECT DECISION – CLOSE T007 & START RFC-0004`: giữ nguyên đúng thứ tự này.
- Bản thân `docs/release/t008-release-note.md` (mục "Next Sprint", viết ngay trước Decision UR08) vẫn ghi T009 = Barcode.
- `Customer` còn không thuộc nhóm Master Data — theo Versioning Policy (mục dưới), Customer thuộc nhóm **CRM**, một giai đoạn roadmap khác, tách biệt khỏi Master Data (Product/Category/Brand/Unit/Barcode/Attribute/Variant).

Chưa rõ đây là quyết định đổi ưu tiên có chủ đích (bỏ qua Barcode/Attribute/Variant, chuyển thẳng sang CRM) hay nhầm lẫn giữa 2 module kế tiếp trong message. **Claude Code không tự chọn 1 trong 2 phương án** — chờ Architect xác nhận rõ trước khi bắt đầu Dependency Audit cho T009, dù là Barcode hay Customer.

---

## Sprint-00 — Architecture Stabilization (ĐÃ ĐÓNG)

Tag `v0.1.0-foundation`. Xem `docs/implementation/sprint-00-summary.md`, `docs/release/gate-status.md`.

## Sprint-01 — Progress

| Task | Domain | SPEC | Trạng thái | Tag |
|---|---|---|---|---|
| T005 | Product Refactor | `SPEC-PRODUCT-001` | ✅ **DONE** (Technical Complete, Operational Complete PENDING) | `v0.2.0-product-foundation` |
| T006 | Category Implementation | `SPEC-CATEGORY-001` | ✅ **DONE** (Technical Complete, Operational Complete PENDING) | `v0.3.0-category-foundation` |
| T007 | Brand Domain | `SPEC-BRAND-001` | ✅ **DONE** (Technical Complete, Operational Complete PENDING) | `v0.4.0-brand-foundation` |
| T008 | Unit Domain | `SPEC-UNIT-001` | ✅ **DONE** (Technical Complete, Operational Complete PENDING) | `v0.5.0-unit-foundation` |
| T009 | Barcode Domain **hoặc** Customer Domain (⚠️ chưa rõ, xem ghi chú roadmap ở trên) | — | ⬜ Chờ RFC + xác nhận module đúng từ Architect | — |

**Quy trình chuẩn đang áp dụng** (từ T006 trở đi, chạy trọn vẹn):
`Dependency Audit → RFC → Architecture Review → SPEC → Implementation Plan → Architecture Review → Code (theo đúng thứ tự bước, không gộp) → Architecture Review → Release`.

## Regression Baseline (Decision T006-R06, mở rộng bởi T007-04.9/UP10)

Từ T006 trở đi, **mỗi Sprint task mới phải xác nhận toàn bộ Task đã DONE trước đó vẫn PASS** — chạy `npx jest` toàn bộ, không chỉ phạm vi module đang làm. Hiện tại (sau T008 code xong): **142/142 test suite PASS, 1352/1352 test PASS** — xác nhận T005 (Product) + T006 (Category) + T007 (Brand) + Auth/RBAC/Inventory/Organization/Branch đều không bị ảnh hưởng bởi T008. Baseline cho T009 (Barcode) gồm **T005 + T006 + T007 + T008**.

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

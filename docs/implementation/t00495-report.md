# T004.95 — Architecture Decision Records: Report

**SPEC:** `SPEC-T004.95` (nhận trực tiếp từ user, không phải file trong repo).
**Phạm vi:** chỉ tài liệu — không sửa code, không tạo/sửa migration, không đổi schema, không commit (chờ Architecture Review theo Commit Policy §6 của SPEC).

## 1. Tóm tắt

Tạo `docs/architecture/adr/` gồm 12 ADR + 1 `README.md` index, đúng tên file và cấu trúc theo `SPEC-T004.95`. Đây là lần viết lại thứ 2 — lần đầu (trước khi có SPEC chính thức) tự chọn tên/format 8 file khác (`ADR-0001-single-writer.md` v.v.), đã bị loại bỏ hoàn toàn (soft-reset, chưa từng push nên không để lại dấu vết trong lịch sử git) để thay bằng đúng 12 file theo SPEC.

## 2. Đối chiếu Acceptance Criteria (SPEC-T004.95 §4)

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Tạo đủ 12 ADR | ✅ | `ls docs/architecture/adr/*.md \| grep -v README \| wc -l` → 12 |
| Không trùng lặp | ✅ (xem §3 phân tích ranh giới) | — |
| Có liên kết chéo tới SPEC/Sprint | ✅ | Mỗi ADR có mục `# References` trỏ SPEC/Sprint/Report/Module cụ thể, không để trống |
| Không thay đổi code | ✅ | `git status --short` — chỉ `docs/` thay đổi |
| Không thay đổi migration | ✅ | Không file nào trong `backend/prisma/migrations/` bị chạm |
| Không thay đổi schema | ✅ | `backend/prisma/schema.prisma` không đổi |
| Không commit | ✅ | Toàn bộ 15 file (12 ADR + README + report + gate-status.md sửa) hiện ở trạng thái staged/uncommitted, chờ Architecture Review |

## 3. Ranh giới nội dung giữa các ADR liên quan tới nhau (kiểm tra "không trùng lặp")

3 nhóm ADR có chủ đề gần nhau, cố ý tách theo góc nhìn khác nhau, không lặp lại cùng 1 nội dung:

- **ADR-0005 (Single Writer)** vs **ADR-0006 (InventoryDomainService)** vs **ADR-0010 (Repository Boundary)**: ADR-0005 trả lời "TẠI SAO cần 1 điểm ghi duy nhất" (vấn đề lịch sử: 5 module ghi trực tiếp, race condition thật). ADR-0006 trả lời "InventoryDomainService CỤ THỂ có hình dạng gì" (5 phương thức public, không thêm tầng kiến trúc mới). ADR-0010 trả lời "QUY TẮC CHUNG cho toàn dự án" (không module nào được export Repository, áp dụng cho MỌI module tương lai, không riêng Inventory). Ba góc nhìn bổ sung nhau, không lặp.
- **ADR-0009 (Domain Events)** vs **ADR-0011 (Outbox Pattern)**: ADR-0009 là NGUYÊN TẮC (khi nào publish — sau commit, không bao giờ trong transaction). ADR-0011 là CƠ CHẾ đảm bảo nguyên tắc đó không vỡ khi có crash (Outbox thay vì emit trực tiếp). Không lặp — 1 cái là luật, 1 cái là cách thực thi luật.
- **ADR-0001 (System Architecture)** vs **ADR-0002 (Clean Architecture)**: ADR-0001 là lựa chọn Ở CẤP TOÀN HỆ THỐNG (Monolithic vs Microservice). ADR-0002 là lựa chọn Ở CẤP TRONG-1-MODULE (layering 4 lớp). Không chồng lấn phạm vi.

## 4. Điểm cần Architecture Review quyết định (không tự ý quyết định thay)

- **ADR-0011 (Outbox Pattern)** ghi `Status: Accepted (implementation pending)` — quyết định KIẾN TRÚC đã chốt (do user quyết định ở phiên trước), nhưng schema `OutboxEvent` và cơ chế kích hoạt Worker CHƯA thiết kế — cố ý để trống, thuộc phạm vi `SPEC-EVENT-001`/T006 sau này, không tự thiết kế trước.
- **ADR-0012 (Testing Strategy)** disclose trung thực: lớp Performance và Security hiện "chưa thiết lập" (khớp đúng trạng thái NOT STARTED của Gate C/D trong `docs/release-gates.md`) — không giả vờ đã có nội dung cụ thể cho 2 lớp này.

## 5. File List

**Mới (14 file):**
- `docs/architecture/adr/README.md`
- `docs/architecture/adr/ADR-0001-system-architecture.md` .. `ADR-0012-testing-strategy.md` (12 file)
- `docs/implementation/t00495-report.md` (chính file này)

**Sửa (1 file):**
- `docs/release/gate-status.md` — cập nhật dòng T004.95 (từ "8 ADR, hoàn thành" sang "12 ADR đúng SPEC-T004.95, chờ Architecture Review"), thêm log entry.

**Không đổi:** mọi file `backend/` — xác nhận bằng `git status --short`.

## 6. Trạng thái commit

Theo đúng Commit Policy (`SPEC-T004.95` §6): **không commit**. Toàn bộ thay đổi ở trạng thái staged, sẵn sàng commit ngay khi Architecture Review thông qua.

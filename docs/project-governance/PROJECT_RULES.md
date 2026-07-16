# PROJECT_RULES

Quy tắc nền tảng của dự án **POS ERP Enterprise** — áp dụng cho mọi Sprint, mọi thành viên (kể cả AI). Đây là văn bản gốc; các file khác trong `docs/project-governance/` chi tiết hóa từng khía cạnh (kiến trúc, code, test, review, release).

## 1. Bối cảnh dự án

- Sản phẩm: ERP/POS đa tenant (Organization → Branch → Warehouse), phát triển để **bán thương mại** — không phải dự án nội bộ/thử nghiệm. Mọi quyết định kiến trúc cân nhắc khả năng mở rộng lâu dài, không chỉ tốc độ giao tính năng ngắn hạn.
- Ngăn xếp: NestJS 11 (backend, Monolithic Modular — xem `ARCHITECTURE_RULES.md`), Next.js 15 (frontend), Postgres (Prisma), Redis, BullMQ.
- Lịch sử: dự án bắt đầu từ Foundation (Prompt 001-015A, tag `v0.1.0`), qua nhiều Prompt tính năng tuyến tính (016-035), sau đó chuyển sang **Sprint-00: Architecture Stabilization** (T001-T004.95, tag `v0.1.0-foundation`) để ổn định nền tảng trước khi mở rộng. Từ Sprint-01 trở đi, dự án vận hành theo quy trình chính thức mô tả ở file này.

## 2. Vai trò

| Vai trò | Ai | Trách nhiệm |
|---|---|---|
| **Kiến trúc sư (Architect)** | User | Soạn RFC, SPEC, ADR khi có quyết định lớn; ban hành ARCHITECT DECISION khi Claude Code báo xung đột; phê duyệt Architecture Review trước khi cho phép code/commit. |
| **Người triển khai (Implementer)** | Claude Code | Đọc RFC/SPEC/ADR/quy tắc trước khi code (xem `AI_WORKFLOW.md`); triển khai đúng theo văn bản đã duyệt; KHÔNG tự thiết kế quyết định kiến trúc/nghiệp vụ khi phát hiện thiếu sót — dừng lại và hỏi bằng bằng chứng cụ thể; báo cáo trung thực (kể cả khi kết quả không đạt yêu cầu). |

**Ranh giới quan trọng nhất**: Claude Code **không tự soạn RFC/SPEC** — kể cả bản nháp — cho tới khi User giao. Việc này không đổi kể từ khi nguyên tắc Specification First được thiết lập (Sprint-00) và tiếp tục áp dụng cho mọi Sprint sau.

## 3. Quy trình chuẩn (từ Sprint-01)

```
RFC → SPEC → Implementation → Review → Release
```

| Bước | Ai soạn | Nội dung | Ví dụ |
|---|---|---|---|
| **RFC** (Request for Comments) | User | Khám phá vấn đề/không gian giải pháp, CHƯA chốt chi tiết kỹ thuật — trả lời "nên làm gì và vì sao", chưa cần trả lời "làm chính xác như thế nào". | `RFC-0001` (Product Domain) |
| **SPEC** | User | Chốt chi tiết: Entity/Business Rules/API/Permission/Migration/Event/Performance/Security/Acceptance Criteria — đủ chi tiết để Claude Code triển khai không cần đoán. | `SPEC-PRODUCT-001` |
| **Implementation** | Claude Code | Code đúng theo SPEC đã "APPROVED FOR IMPLEMENTATION"/"APPROVED FOR DEVELOPMENT". Nếu phát hiện thiếu/mâu thuẫn: dừng, hỏi bằng bằng chứng (file:line), không tự thiết kế. | — |
| **Review** | User (Architecture Review) + Claude Code (self-review trước khi trình) | Đối chiếu Acceptance Criteria, Gate (xem `REVIEW_RULES.md`). Chỉ merge/tiếp tục sau khi Review PASS. | — |
| **Release** | User quyết định, Claude Code thực thi khi được phép | Commit, tag, push, CHANGELOG — xem `RELEASE_RULES.md`. | `v0.1.0-foundation` |

**ADR** (Architecture Decision Record) không nằm trong luồng tuyến tính trên — là kho lưu trữ SONG SONG, ghi lại các quyết định kiến trúc quan trọng bất cứ khi nào chúng xảy ra (thường phát sinh từ RFC/SPEC lớn), để không ai phải đoán "vì sao lại quyết định như vậy" khi đội ngũ mở rộng. Xem `docs/architecture/adr/`.

## 4. Quy ước đặt tên/đánh số

| Loại | Định dạng | Ví dụ |
|---|---|---|
| RFC | `RFC-NNNN` (4 chữ số, tăng dần, không tái sử dụng số đã bỏ) | `RFC-0001` |
| SPEC | `SPEC-<DOMAIN>-NNN` (DOMAIN viết hoa, NNN 3 chữ số) | `SPEC-PRODUCT-001`, `SPEC-INV-001` |
| ADR | `ADR-NNNN-ten-quyet-dinh.md` (không đánh số lại khi Superseded) | `ADR-0005-single-writer.md` |
| Sprint task | `T0NN` (số nguyên) hoặc `T0NN.N`/`T0NN.NN` cho bước con chèn thêm giữa chừng | `T004`, `T004.5`, `T004.95` |
| Gate | `Gate-0N` gắn với Sprint tương ứng | `Gate-00` (Sprint-00), `Gate-01` (Sprint-01) |
| Tag release | `vMAJOR.MINOR.PATCH[-milestone]` | `v0.1.0`, `v0.1.0-foundation` |

## 5. Các file governance khác

- `ARCHITECTURE_RULES.md` — bất biến kiến trúc, tham chiếu ADR.
- `CODING_RULES.md` — quy ước viết code.
- `TEST_RULES.md` — chiến lược kiểm thử (5 lớp theo ADR-0012).
- `REVIEW_RULES.md` — checklist self-review, kỷ luật disclose.
- `RELEASE_RULES.md` — commit/tag/push/CHANGELOG.
- `AI_WORKFLOW.md` — quy trình cụ thể Claude Code phải theo trước khi code, bao gồm khi nào dừng lại hỏi.

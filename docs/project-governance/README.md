# Project Governance

Bộ quy tắc vận hành dự án, thiết lập từ khi đóng Sprint-00 (tag `v0.1.0-foundation`) để chuẩn hóa quy trình **RFC → SPEC → Implementation → Review → Release** cho Sprint-01 trở đi, giảm số lần cần hỏi User các quyết định lặp lại.

| File | Nội dung |
|---|---|
| [PROJECT_RULES.md](./PROJECT_RULES.md) | Bối cảnh dự án, vai trò, quy trình chuẩn, quy ước đặt tên (RFC/SPEC/ADR/Sprint/Tag). Đọc đầu tiên. |
| [ARCHITECTURE_RULES.md](./ARCHITECTURE_RULES.md) | Bất biến kiến trúc bắt buộc, tóm tắt từ `docs/architecture/adr/`. |
| [CODING_RULES.md](./CODING_RULES.md) | Quy ước viết code (cấm TODO/FIXME/`any`, DI, xử lý lỗi, transaction, đặt tên). |
| [TEST_RULES.md](./TEST_RULES.md) | Chiến lược 5 lớp kiểm thử (Unit/Integration/Architecture/Performance/Security). |
| [REVIEW_RULES.md](./REVIEW_RULES.md) | Checklist self-review, kỷ luật "Disclosure không thay thế Fix", khi nào dừng lại hỏi. |
| [RELEASE_RULES.md](./RELEASE_RULES.md) | Quy tắc commit/tag/push/CHANGELOG, quy trình đóng Sprint. |
| [AI_WORKFLOW.md](./AI_WORKFLOW.md) | Quy trình 6 bước AI phải theo trước khi code — **đọc file này đầu tiên khi bắt đầu bất kỳ task mới nào**. |

## Liên quan

- `docs/architecture/adr/` — Architecture Decision Records, nguồn sự thật chi tiết cho `ARCHITECTURE_RULES.md`.
- `docs/release/gate-status.md` — theo dõi Gate cấp từng hạng mục Sprint.
- `docs/release-gates.md` — Gate A/B/C/D cấp toàn sản phẩm.
- `/CLAUDE.md` (gốc repo) — trỏ tới `AI_WORKFLOW.md` để mọi phiên làm việc AI mới tự động nạp quy trình này.

# POS ERP Enterprise — Hướng dẫn cho AI Coding Agent

Dự án đã đóng Sprint-00 (tag `v0.1.0-foundation`) và vận hành theo quy trình chính thức **RFC → SPEC → Implementation → Review → Release** kể từ Sprint-01.

**Trước khi làm bất kỳ task nào, đọc `docs/project-governance/AI_WORKFLOW.md` trước tiên.** File đó mô tả quy trình 6 bước bắt buộc (đọc RFC → đọc SPEC → kiểm tra ADR → kiểm tra quy tắc → xác nhận đủ điều kiện → mới code) và khi nào phải dừng lại hỏi thay vì tự thiết kế.

Toàn bộ quy tắc chi tiết: `docs/project-governance/README.md` (index tới PROJECT/ARCHITECTURE/CODING/TEST/REVIEW/RELEASE_RULES).

## Nguyên tắc không đổi, quan trọng nhất

- **Specification First**: RFC và SPEC do User soạn. Không tự viết RFC/SPEC — kể cả bản nháp — cho tới khi User giao và đánh dấu rõ "APPROVED FOR DEVELOPMENT"/"APPROVED FOR IMPLEMENTATION".
- Khi phát hiện SPEC/ADR/code mâu thuẫn nhau: dừng lại, trình bày bằng chứng cụ thể (file:line), không tự thiết kế giải pháp thay User.
- Báo cáo trung thực một thiếu sót KHÔNG tự động là giải pháp — nếu sửa được trong phạm vi hợp lý, phải sửa trước khi báo hoàn thành (xem `docs/project-governance/REVIEW_RULES.md` §4).

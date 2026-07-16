# REVIEW_RULES

Quy tắc self-review (Claude Code tự kiểm tra trước khi trình User) và Architecture Review (User duyệt trước khi cho phép commit/tiếp tục).

## 1. Checklist self-review bắt buộc trước khi báo "hoàn thành"

Trước khi báo cáo bất kỳ task nào là xong, chạy và xác nhận PASS (hoặc PENDING có lý do hạ tầng rõ ràng — không phải FAIL âm thầm bỏ qua):

1. Build (`npm run build`)
2. Lint (`npx eslint ...`)
3. TypeCheck (`npx tsc --noEmit`)
4. Unit Test (`npx jest`) — toàn bộ, không chỉ phần vừa sửa
5. Coverage — so sánh với baseline trước thay đổi (xem `TEST_RULES.md` §1)
6. Circular Dependency (`grep forwardRef` + boot thử DI container nếu thay đổi động tới module wiring)
7. TODO/FIXME/`any` không cần thiết — grep trong phạm vi vừa sửa
8. Architecture Test liên quan (nếu bất biến kiến trúc bị chạm tới)
9. `git status --short` — xác nhận đúng phạm vi file đã đổi, không có file lạ/thừa

Kết quả từng mục ghi vào báo cáo (Implementation Report/Test Report), không tóm tắt mập mờ kiểu "mọi thứ đều ổn".

## 2. Gate tracking

- `docs/release/gate-status.md` — Gate cấp từng hạng mục T00x trong Sprint đang chạy (chi tiết, gắn với Acceptance Criteria cụ thể của SPEC/ARCHITECT DECISION).
- `docs/release-gates.md` — Gate A/B/C/D cấp toàn sản phẩm (build cơ bản → Docker Integration → Performance → Production), áp dụng xuyên Sprint.
- Cập nhật CẢ HAI khi trạng thái đổi — không để lệch nhau.

## 3. Ký hiệu trạng thái — dùng nhất quán, không mập mờ

- ✅ **PASS** — đã chạy, đạt yêu cầu.
- ❌ **FAIL** — đã chạy, không đạt.
- 🟡 **PENDING** — chưa xác minh được (thường do thiếu hạ tầng, vd không có Docker) — **không được tính là PASS**, không dùng ký hiệu `⚠️` mập mờ thay cho PENDING/FAIL rõ ràng.

## 4. Kỷ luật: Disclosure không thay thế Fix

**Bài học trực tiếp từ Sprint-00 (T004):** báo cáo trung thực 1 thiếu sót (vd "Coverage giảm 0.06pp, đã giải thích nguyên nhân") KHÔNG tự động là đủ điều kiện để coi task hoàn thành — User đã từ chối commit dù báo cáo trung thực, yêu cầu khắc phục THẬT. Quy tắc rút ra:

1. Trước khi báo 1 thiếu sót là "chấp nhận được", tự hỏi: thiếu sót này có sửa được trong phạm vi hợp lý không? Nếu có, SỬA TRƯỚC khi báo cáo, không trình bản có caveat rồi chờ được bảo đi sửa.
2. Chỉ trình bày 1 gap như đã disclose-và-chấp-nhận-được khi THỰC SỰ không sửa được trong phạm vi hiện tại (vd thiếu Docker trong sandbox — giới hạn hạ tầng, không phải lỗi code) — và ngay cả khi đó, gọi đúng tên trạng thái (PENDING), không giảm nhẹ bằng từ ngữ mơ hồ.
3. Không tự ý coi im lặng của User (chưa phản hồi) là đồng ý với 1 caveat đã nêu — nếu không chắc, hỏi thẳng.

## 5. Khi nào dừng lại và hỏi (thay vì tự thiết kế)

Dừng lại, trình bày bằng chứng cụ thể (file:line/số liệu thật, không suy đoán), và chờ ARCHITECT DECISION khi:
- SPEC/RFC mâu thuẫn với code/schema thực tế hiện có.
- 2 quyết định/Decision trong CÙNG 1 văn bản (hoặc giữa các văn bản liên quan) mâu thuẫn nhau.
- SPEC không đề cập tới 1 tình huống thực tế code sẽ gặp phải, và cách xử lý ảnh hưởng tới hành vi nghiệp vụ (không phải chi tiết triển khai thuần túy).

**Không dừng lại hỏi** cho các quyết định implementation-level không ảnh hưởng hành vi nghiệp vụ mà SPEC không cần chỉ định chính xác (vd tên biến nội bộ, cấu trúc file phụ) — tự quyết định hợp lý, disclose trong báo cáo, không hỏi những gì có thể tự suy luận từ quy ước đã có trong `CODING_RULES.md`/`ARCHITECTURE_RULES.md`.

Xem `AI_WORKFLOW.md` cho quy trình đầy đủ áp dụng quy tắc này trước khi bắt đầu code.

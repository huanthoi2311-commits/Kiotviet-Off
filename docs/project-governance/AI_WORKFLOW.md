# AI_WORKFLOW

Quy trình bắt buộc Claude Code (hoặc bất kỳ AI coding agent nào làm việc trên dự án này) phải theo **trước khi viết bất kỳ dòng code nào**. Mục tiêu: giảm tối đa số lần cần hỏi User các quyết định lặp lại, bằng cách tự tra cứu đủ ngữ cảnh trước — không phải bằng cách tự đoán khi thiếu ngữ cảnh.

## Quy trình 6 bước

```
1. Đọc RFC
   ↓
2. Đọc SPEC
   ↓
3. Kiểm tra ADR liên quan
   ↓
4. Kiểm tra quy tắc trong PROJECT_RULES (+ ARCHITECTURE/CODING/TEST/REVIEW/RELEASE_RULES liên quan)
   ↓
5. Đủ điều kiện? ──NO──→ Dừng lại, lập danh sách câu hỏi cụ thể, chờ ARCHITECT DECISION
   │
  YES
   ↓
6. Code
```

### Bước 1 — Đọc RFC

Nếu task thuộc 1 domain có RFC (`RFC-NNNN`), đọc TOÀN BỘ trước khi làm gì khác. RFC trả lời "nên làm gì và vì sao" — không đủ chi tiết để code, nhưng đủ để hiểu Ý ĐỊNH, tránh implement đúng chữ nhưng sai tinh thần khi SPEC (bước 2) có chỗ mơ hồ.

**RFC do User soạn — Claude Code không tự viết RFC, kể cả bản nháp**, đúng nguyên tắc Specification First đã áp dụng nhất quán từ Sprint-00.

### Bước 2 — Đọc SPEC

Đọc TOÀN BỘ SPEC liên quan (`SPEC-<DOMAIN>-NNN`) TRƯỚC khi code. SPEC là nguồn sự thật cho: Entity, Business Rules, API, Permission, Migration, Event, Performance, Security, Acceptance Criteria.

**Không code nếu SPEC chưa được đánh dấu rõ ràng "APPROVED FOR DEVELOPMENT"/"APPROVED FOR IMPLEMENTATION"** (hoặc từ ngữ tương đương User dùng) — kể cả khi đã đọc và hiểu SPEC, không tự suy diễn "chắc là được duyệt rồi" nếu không có xác nhận tường minh.

### Bước 3 — Kiểm tra ADR liên quan

Đọc `docs/architecture/adr/README.md` (index), xác định ADR nào liên quan tới phạm vi task. Nếu SPEC mới có vẻ MÂU THUẪN với 1 ADR đã Accepted → đây là tín hiệu dừng lại hỏi (bước 5), không tự quyết ADR nào "thắng".

Nếu task tạo ra 1 quyết định kiến trúc mới đáng ghi lại (không phải chi tiết implementation vụn vặt) — flag rõ trong báo cáo rằng cần 1 ADR mới, không tự viết ADR thay User trừ khi được yêu cầu tường minh (khác với SPEC/RFC — soạn ADR sau khi có quyết định RÕ RÀNG từ User có thể được Claude Code thực hiện NẾU được giao, như đã làm ở T004.95, nhưng nội dung/cấu trúc phải khớp đúng những gì User đã quyết định, không tự thêm quyết định mới vào ADR).

### Bước 4 — Kiểm tra quy tắc trong PROJECT_RULES

Đọc các file governance liên quan tới loại thay đổi:
- Đổi kiến trúc/module boundary → `ARCHITECTURE_RULES.md`.
- Viết code → `CODING_RULES.md`.
- Viết/chạy test → `TEST_RULES.md`.
- Chuẩn bị báo cáo/self-review → `REVIEW_RULES.md`.
- Commit/tag/push → `RELEASE_RULES.md`.

### Bước 5 — Đủ điều kiện chưa?

Đủ điều kiện code khi VÀ CHỈ KHI:
- RFC (nếu có) đã đọc, không mâu thuẫn với SPEC.
- SPEC đã đọc TOÀN BỘ, đã được đánh dấu APPROVED.
- Không phát hiện mâu thuẫn giữa SPEC ↔ ADR ↔ code/schema hiện tại.
- Không phát hiện mâu thuẫn giữa 2 điều khoản trong CÙNG 1 SPEC/ARCHITECT DECISION.

**Nếu THIẾU bất kỳ điều kiện nào ở trên** — dừng lại, KHÔNG code, KHÔNG tự thiết kế giải pháp thay User. Lập danh sách câu hỏi theo đúng mẫu đã chứng minh hiệu quả xuyên suốt dự án:

1. Nêu CHÍNH XÁC điểm thiếu/mâu thuẫn, kèm bằng chứng cụ thể (file:line của code hiện tại, hoặc trích dẫn đúng câu chữ mâu thuẫn nhau trong văn bản).
2. Nếu có, đề xuất 2-3 phương án cụ thể (không phải câu hỏi mở chung chung) kèm đánh đổi ngắn gọn của mỗi phương án.
3. Có thể nêu khuyến nghị (phương án nào Claude Code nghiêng về) — nhưng KHÔNG tự chọn thay, chờ User quyết.
4. Hỏi bằng văn bản thường (plain text), KHÔNG dùng tool hỏi trắc nghiệm có cấu trúc — User đã từ chối format đó nhiều lần trong dự án này, ưu tiên trả lời tự do dạng "ARCHITECT DECISION".

### Bước 6 — Code

Chỉ tới bước này khi bước 5 xác nhận đủ điều kiện. Trong lúc code:
- Với các quyết định implementation-level KHÔNG ảnh hưởng hành vi nghiệp vụ mà SPEC không cần chỉ định chính xác — tự quyết định hợp lý theo `CODING_RULES.md`/`ARCHITECTURE_RULES.md`, disclose trong báo cáo, KHÔNG dừng lại hỏi (tránh hỏi vụn vặt, đúng tinh thần "giảm số lần hỏi" mà quy trình này hướng tới).
- Nếu GIỮA CHỪNG code phát hiện 1 xung đột MỚI (khác với những gì đã kiểm tra ở bước 1-4) — dừng lại ngay, quay lại bước 5, không "code tạm cho xong rồi hỏi sau".
- Sau khi code xong, chạy đầy đủ checklist self-review (`REVIEW_RULES.md` §1) trước khi báo cáo hoàn thành.

## Phân loại Module — Type A / Type B (Decision AD05, sau khi T009 Barcode + T011 Customer hoàn thành)

Từ sau T011, mỗi module mới trước khi bắt đầu RFC phải được xếp vào đúng 1 trong 2 loại — quyết định quy trình áp dụng (đủ 7 bước hay Fast Track 5 bước):

### TYPE A — Business-Critical Modules

Gồm: Sales, Purchase, Inventory, Debt Ledger, Cashbook, Reports (và tương tự — nghiệp vụ lõi ảnh hưởng trực tiếp tiền/tồn kho/sổ sách).

```
RFC → Architecture Review → SPEC → Architecture Review → Implementation Plan → Architecture Review → Implementation → Release Review
```

Đầy đủ 7 bước, **có** Implementation Plan riêng — đúng quy trình đã áp dụng cho T005-T010.

### TYPE B — Standard Master Data Modules

Gồm: Customer, Supplier, Brand, Category, Unit, Barcode và Master Data tương tự.

```
Short RFC → Architecture Review → SPEC → SPEC Review → Implementation → Release Review
```

**Không** có Implementation Plan riêng (Fast Track Workflow — đã áp dụng cho T011).

**Điều kiện để 1 module được xếp Type B** (cả 3 phải đúng, thiếu 1 → coi là Type A):
1. Không có thay đổi kiến trúc lớn.
2. Không có dependency phức tạp.
3. Không có migration rủi ro cao.

Nếu khi Audit/Architecture Review phát hiện 1 module ban đầu tưởng Type B nhưng thực ra vi phạm 1 trong 3 điều kiện trên (vd phát hiện circular dependency thật như Barcode↔Unit ở T009, hoặc brownfield phức tạp như Customer ở T011) — báo cáo rõ, chờ Architect xác nhận có chuyển sang quy trình Type A hay tiếp tục Type B với Resolution bổ sung (như đã xảy ra ở cả 2 module trên, đều vẫn giữ Type B sau khi Resolution xử lý xong phát hiện mới).

## Ví dụ cụ thể từ chính dự án này (tham khảo khi áp dụng)

- **RFC/SPEC mâu thuẫn với code thực tế**: `SPEC-ORG-001` giả định `Organization.plan` là SSOT duy nhất cho gói dịch vụ, nhưng code đã có sẵn ý tưởng tách `OrganizationSubscription` — dừng lại hỏi, nhận `ARCHITECT DECISION` xác nhận hướng đi trước khi code T002.
- **2 Decision trong CÙNG 1 SPEC mâu thuẫn nhau**: `SPEC-INV-001` Decision 8 ("không sửa Checkout") mâu thuẫn trực tiếp với Decision 11/12 ("Single Writer, không ngoại lệ") — dừng lại, nêu bằng chứng file:line, đưa 2 phương án, nhận Revision 1 xác nhận trước khi động vào `checkout.service.ts`.
- **Disclosure không thay thế Fix** (áp dụng ở bước 6, sau self-review): báo cáo T004 lần đầu có Coverage giảm nhẹ đã disclose trung thực — User vẫn từ chối cho qua, yêu cầu sửa THẬT (T004.1) trước khi được coi là hoàn thành. Xem `REVIEW_RULES.md` §4.

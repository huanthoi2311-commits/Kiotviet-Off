# Implementation Report — Prompt 034: Discount Engine

**Ngày:** 2026-07-15
**Phạm vi:** Engine tính giảm giá — **Internal Service, không có API public**, dùng Strategy Pattern cho 4 loại discount, áp theo đúng thứ tự ưu tiên Manual → Promotion → Voucher → Member.

## 1. Vì sao không có Controller/DTO/route nào

Prompt 034 nói rõ: "API: Internal Service. Không Public." Đây là module thứ hai (sau Cart, Prompt 033) không có `presentation/` layer — không `Controller`, không expose HTTP route nào, không đăng ký permission nào. `DiscountModule` chỉ export `DiscountEngineService` để module khác (Checkout Engine, Prompt 035) inject và gọi trực tiếp trong tiến trình — không qua HTTP, không qua Domain Event (khác Customer Point, Prompt 032, vì đây không phải giao tiếp CHÉO module lúc runtime mà là 1 utility service được dùng NGAY TRONG luồng nghiệp vụ của caller).

## 2. Quyết định phạm vi quan trọng: Engine chỉ TÍNH TOÁN, không tự tra cứu Promotion/Voucher/Member

Đây là quyết định thiết kế lớn nhất của Prompt này, cần nêu rõ vì Prompt chỉ có 8 dòng mô tả (ngắn hơn nhiều so với Prompt 031/032), không liệt kê Entity hay input/output cụ thể.

`Promotion`/`PromotionCondition`/`Voucher` đã có bảng trong schema (từ Foundation) nhưng **chưa có CRUD module quản lý** (chưa phải phạm vi Prompt 034 — đó sẽ là Prompt Promotion/Voucher Module riêng, thuộc Volume Promotion trong kế hoạch Dependency Graph). "Member" (giảm giá theo hạng thành viên) **chưa có trường dữ liệu nào** đại diện trong `Customer` (Prompt 031 không có field kiểu `memberDiscountRate`).

Có 2 hướng: (a) Discount Engine tự định nghĩa `IPromotionRepository`/`IVoucherRepository` riêng, tự truy vấn Postgres, tự suy ra rate "Member" từ đâu đó; hoặc (b) Engine chỉ nhận **input đã chuẩn bị sẵn** (`CandidateDiscount[]`) từ caller, thuần túy áp dụng đúng Strategy theo `type` và đúng thứ tự theo `source`.

Chọn **(b)** vì:
- Đúng nghĩa đen "Engine tính giảm giá" (calculation engine) — không phải "Promotion/Voucher lookup service".
- Tránh vướng vào việc thiết kế "Member discount rate lấy từ đâu" — một câu hỏi nghiệp vụ mà Prompt 034 hoàn toàn không trả lời, và tự suy ra sẽ vi phạm tinh thần "không tự vá phụ thuộc còn thiếu" (đã áp dụng nghiêm ở lần dừng Prompt 036 trước đây) — ở đây khác một chút vì Discount Engine **không cần** dữ liệu Member thật để hoạt động đúng, chỉ cần Strategy đúng khi ĐƯỢC ĐƯA giá trị; nên không cần dừng lại hỏi, chỉ cần không tự bịa nguồn dữ liệu.
- Giữ Engine 100% thuần túy (pure function tính toán), dễ đạt "Test: 100 Rule" + "Sai số 0 đồng" một cách CÓ CHỨNG MINH được (xem mục 4), không phụ thuộc trạng thái DB khi test.
- Checkout Engine (Prompt 035) — nơi thực sự gọi Discount Engine — sẽ là nơi tự nhiên để tra Promotion đang ACTIVE, validate Voucher theo code, và xác định rate Member (nếu có), rồi build `CandidateDiscount[]` truyền vào. Quyết định "Member lấy rate từ đâu" được **hoãn đúng lúc** sang Prompt 035, không giải quyết non ở đây.

## 3. Strategy Pattern

`IDiscountStrategy` (domain) — 1 method `calculate(context, candidate): Decimal`. 4 implementation (infrastructure, đều `@Injectable()`):

| DiscountType | Công thức |
|---|---|
| `PERCENT` | `currentTotal × value%`, có trần `maxDiscount` nếu candidate khai |
| `AMOUNT` | `value` (số tiền cố định), có trần `maxDiscount` |
| `FIXED_PRICE` | `(đơn giá gốc − giá cố định) × quantity` của đúng `productId` |
| `BUY_X_GET_Y` | `floor(quantity / (buyQuantity + getQuantity)) × getQuantity × đơn giá` của đúng `productId` |

`DiscountEngineService` nhận mảng `IDiscountStrategy[]` qua NestJS **multi-provider** (`DISCOUNT_STRATEGIES` token, `useFactory` gom 4 provider riêng thành 1 mảng), build `Map<DiscountType, IDiscountStrategy>` để dispatch O(1) — đúng tinh thần Strategy Pattern: thêm loại discount mới trong tương lai chỉ cần thêm 1 class + đăng ký, không sửa `DiscountEngineService`.

## 4. Cascading + "0 đồng sai số" được đảm bảo có cấu trúc

Áp dụng **tuần tự** theo thứ tự ưu tiên cố định `MANUAL(0) → PROMOTION(1) → VOUCHER(2) → MEMBER(3)` (sort ổn định, không phụ thuộc thứ tự input) — mỗi discount tính trên phần **CÒN LẠI** sau các discount ưu tiên cao hơn (không phải subtotal gốc). Đây là mô hình chuẩn của giảm giá chồng (coupon stacking) trong bán lẻ, và tự nhiên đảm bảo `finalTotal` không bao giờ âm.

Mỗi bước: `raw = strategy.calculate(...)` → `clamp` về `[0, currentTotal]` **và làm tròn 2 chữ số ngay lập tức** → trừ khỏi `currentTotal`. `totalDiscount` được tính là `subtotal − finalTotal` (không cộng dồn `amount` một cách độc lập) — vì vậy đẳng thức `subtotal ≡ finalTotal + totalDiscount` đúng **tuyệt đối bằng cấu trúc code**, không phụ thuộc số discount hay thứ tự làm tròn. "Sai số 0 đồng" không phải là điều test "may mắn" thấy đúng, mà là điều không thể sai theo cách engine được viết.

## 5. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/discount/`: domain (`entities/discount.entity.ts` — `DiscountType`, `DiscountSource`, `DISCOUNT_PRIORITY`, `CandidateDiscount`, `AppliedDiscount`, `DiscountCalculationResult`; `strategies/discount-strategy.interface.ts`), infrastructure (4 Strategy + spec riêng từng cái), application (`discount-engine.service.ts` + spec), `discount.module.ts`.
**Sửa**: `backend/src/app.module.ts` (đăng ký `DiscountModule`).
**Không đổi**: `schema.prisma`, `error-codes.ts` (Engine không throw `HttpException` — không có API nào để trả lỗi HTTP; input bất thường được `clamp` an toàn về 0 thay vì ném lỗi, vì đây là internal calculation, không phải validation boundary).

## 6. Test — "100 Rule"

- **127 test, 5 suite, tất cả PASS.** Coverage: **100% statement / 100% branch / 100% function / 100% line** (loại trừ `discount.module.ts` — DI wiring thuần, cùng quy ước loại trừ `.module.ts` đã áp dụng từ Prompt 032/033).
- Từng Strategy có spec riêng: công thức đúng, trần `maxDiscount` (áp và không áp), input thiếu/0 → về 0, chặn chia cho 0 (`BUY_X_GET_Y` khi `buyQuantity`/`getQuantity` ≤ 0), không tìm thấy `productId` trong giỏ → 0 (không lỗi), không giảm giá âm (`FIXED_PRICE` khi giá mới cao hơn giá gốc).
- `DiscountEngineService`: thứ tự ưu tiên đúng dù input xáo trộn, cascading đúng (discount sau tính trên phần còn lại), clamp không âm/không vượt phần còn lại, bỏ qua an toàn khi `type` không có trong registry, kết hợp đủ 4 loại discount cùng lúc trong 1 lần tính.
- **Khối "100 Rule — Acceptance: sai số 0 đồng"**: `it.each` chạy đúng **100 rule** tham số hóa (subtotal/quantity/đơn giá/số lượng discount/loại/nguồn đều biến thiên theo công thức xác định từ seed, KHÔNG random không tái lập được — đảm bảo test luôn deterministic khi CI chạy lại). Mỗi rule verify: `finalTotal + totalDiscount === subtotal` (Decimal chính xác tuyệt đối, không so sánh số thực dấu phẩy động), `finalTotal ≥ 0`, `totalDiscount ≤ subtotal`. Đáp ứng đúng nghĩa đen "Test: 100 Rule" của Prompt.

## 7. Self-Review

- **Không TODO/FIXME/console.log/`any`** — grep xác nhận rỗng trong `src/modules/discount/`.
- **Đúng "API: Internal Service, Không Public"** — không có `Controller`, không route nào lộ ra `AppModule`, không permission nào cần thêm.
- **Strategy Pattern đúng nghĩa** — thêm 1 `DiscountType` mới trong tương lai chỉ cần 1 class mới + đăng ký trong `discount.module.ts`, không sửa `DiscountEngineService`.
- **"Sai số 0 đồng"** không chỉ được test bằng 100 rule mà còn đúng **theo cấu trúc code** (mục 4) — mức đảm bảo cao hơn việc chỉ dựa vào test coverage.
- Build/Lint/TypeCheck: **PASS** trên toàn repo (không có migration nên không cần `prisma validate` riêng cho Prompt này).
- **Full backend suite**: 106 suite / 990 test — **987 PASS**, 3 fail (cùng `argon2-password-hasher.spec.ts` timeout đã biết từ Prompt 032/033, do tải máy khi chạy chung với build/lint nền; xác nhận lại 3/3 PASS khi chạy cô lập, không liên quan Discount Engine).
- **Không có gap phụ thuộc kiểu Sales Order (036)** — Prompt 034 hoàn toàn tự chứa cho mục đích TÍNH TOÁN; việc "Member rate lấy từ đâu" được hoãn đúng chỗ sang Prompt 035 (Checkout Engine, nơi thực sự cần dữ liệu Customer/Promotion/Voucher thật), không phải một dependency bị thiếu mà Prompt 034 cần để hoạt động đúng.

**Definition of Done đạt được** ("Sai số 0 đồng" — đạt bằng cấu trúc + 100 test tham số hóa xác nhận). Sẵn sàng cho Prompt 035 (POS Checkout Engine) — nơi Discount Engine lần đầu được gọi thật trong 1 luồng nghiệp vụ.

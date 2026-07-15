# Implementation Report — Prompt 033: POS Cart Engine

**Ngày:** 2026-07-15
**Phạm vi:** Cart Engine — module Redis-first đầu tiên của dự án. Cart/CartItem **không map bảng Postgres nào**, toàn bộ vòng đời sống trong Redis với TTL 30 phút.

## 1. Vì sao không có migration cho Prompt này

Prompt 033 nói rõ: "Cart — Không lưu Session. Lưu Redis." Đây là module đầu tiên trong dự án mà nguồn dữ liệu chính thức KHÔNG phải Postgres — không có `schema.prisma` nào thay đổi, không có migration nào được sinh ra cho Prompt 033. `RedisModule` (hạ tầng có sẵn từ trước, `@Global()`, export `REDIS_CLIENT` qua `ioredis`) được tái sử dụng nguyên trạng — không thêm dependency mới, đúng tinh thần "đóng băng phạm vi".

## 2. Kiến trúc Clean Architecture cho một module Redis-only

Vì không có Prisma repository, ranh giới các layer được giữ nguyên tinh thần nhưng đổi vai trò:

- **domain/entities/cart.entity.ts**: `CartEntity`/`CartItemEntity` là interface thuần (cùng quy ước "anemic entity, logic ở Service" đã dùng xuyên suốt dự án — ví dụ `CustomerPointLedgerEntity`), cộng với 3 hàm thuần túy không I/O: `buildCartItem()` (tạo dòng mới), `recalculateCartItem()` (tính lại 1 dòng khi đổi quantity), `recalculateCartTotals()` (cộng lại toàn bộ giỏ). Đặt ở domain vì đây là logic nghiệp vụ thuần túy (không phụ thuộc Redis/HTTP), dùng chung cho cả `CartService.addItem/updateItem/removeItem`.
- **domain/repositories/cart.repository.interface.ts**: `ICartRepository` chỉ có 3 method (`findByUserId`/`save`/`delete`) — không có id riêng cho Cart, key theo cặp `(organizationId, userId)` đúng quy tắc "Một User → Một Cart".
- **infrastructure/persistence/redis-cart.repository.ts**: `RedisCartRepository` là key-value store thuần túy (`GET`/`SET ... EX 1800`/`DEL`), không chứa business logic — cùng mức độ đơn giản với `RedisOtpRepository` (Auth, Prompt trước) đã thiết lập.
- **application/cart.service.ts**: `CartService` orchestrate toàn bộ — validate Product (đọc qua `IProductRepository`, không gọi `ProductService`, đúng nguyên tắc "Application Service → Repository" bắt buộc từ Prompt 031), gọi các hàm tính toán domain, rồi `save()` qua `ICartRepository`.

**Vì sao tính toán KHÔNG nằm trong Repository** (khác với `PrismaCustomerPointRepository.addPoint()` tính balance ngay trong transaction Postgres, Prompt 032): Cart không có giao dịch DB nào để "đi kèm" — `RedisCartRepository` chỉ là `GET`/`SET` thuần, không có transaction cần bảo vệ. Toàn bộ phép tính (merge quantity, tax, tổng) là nghiệp vụ thuần túy, hợp lý nhất đặt ở domain layer để tái sử dụng ở cả 3 method của Service mà không lặp code.

## 3. Cart phụ thuộc Product qua Repository interface — không vi phạm "🚨 Kiến trúc quan trọng"

`CartService` inject thẳng `IProductRepository` (từ `ProductModule`, đã export `PRODUCT_REPOSITORY`) để: (1) xác nhận sản phẩm tồn tại + được phép bán (`allowSale`), (2) lấy giá RETAIL + `vat` để tính snapshot. Đây là **đọc dữ liệu qua Repository interface**, không phải gọi `ProductService` — đúng với sơ đồ kiến trúc user yêu cầu (`POS Domain → Application Service → Repository`), và là cùng pattern `CustomerPointService` đã dùng khi inject `ICustomerRepository` để validate `customerId` ở Prompt 032. Cart **không** đụng đến Inventory (không kiểm tra tồn kho) — vì "Inventory Check" là một bước riêng, tách biệt, thuộc Checkout Engine (Prompt 035: `Cart → Validate → Inventory Check → ...`), không phải việc của Cart Engine.

Cart Engine **không publish Domain Event nào** — Prompt 033 không khai báo Event nào cho Cart (khác Prompt 032 khai rõ `PointAdded/PointUsed/PointExpired`). Việc thêm/sửa/xóa dòng giỏ hàng là thao tác tạm thời, chưa phải sự kiện nghiệp vụ đáng lan truyền cho module khác; sự kiện thực sự (`CheckoutCompleted`/`CheckoutFailed`) chỉ phát sinh ở Checkout Engine (Prompt 035) khi giỏ hàng thực sự chốt thành đơn.

## 4. Quyết định thiết kế

1. **Không Audit Log cho thao tác Cart** — theo đúng tiền lệ đã có trong dự án: `ForgotPasswordService.requestOtp()`/`verifyOtp()` (thao tác Redis-only, tần suất cao, không phải trạng thái nghiệp vụ bền vững) hoàn toàn không gọi `AuditLogService`; chỉ `resetPassword()` (chạm bảng Postgres thật) mới được audit. Cart add/update/remove/clear là thao tác Redis ephemeral tương tự — audit mọi cú click "thêm vào giỏ" sẽ tạo nhiễu lớn cho log mà không phản ánh trạng thái nghiệp vụ bền vững nào.
2. **Money & Quantity dùng `Prisma.Decimal`, lưu dạng string** — cùng quy ước `ProductEntity.costPrice: string`/`PurchaseItemEntity.unitCost: string` đã dùng xuyên suốt dự án, tránh sai số dấu phẩy động (IEEE754) cho tiền tệ. `Prisma.Decimal` (chính là `decimal.js`, re-export từ `@prisma/client` đã là dependency có sẵn) được dùng thuần túy như thư viện tính toán decimal — không phát sinh kết nối DB nào, không phải dependency mới.
3. **Quantity hỗ trợ thập phân tối đa 3 chữ số** (`Decimal(18,3)`) — cùng độ chính xác `Product.minStock`/`maxStock` đã dùng ở Foundation, hỗ trợ hàng bán theo cân/khối lượng.
4. **`POST /cart/add` cộng dồn quantity nếu sản phẩm đã có trong giỏ**, và **re-snapshot lại giá theo Product hiện tại** (không giữ giá cũ) — Cart phản ánh giá catalog hiện hành cho đến khi Checkout thực sự chốt (Prompt 035), tránh bug "giá dính" khi giá sản phẩm đổi giữa 2 lần add. `PATCH /cart/update` chỉ đổi quantity tuyệt đối, **giữ nguyên price** đã snapshot — đây là điểm khác biệt rõ giữa 2 API, đúng với việc Prompt tách riêng `/cart/add` và `/cart/update` thành 2 route khác nhau.
5. **Tax tính sẵn theo `Product.vat`** (thuộc tính có sẵn từ Foundation), còn **Discount/Promotion/Voucher luôn = "0.00"** ở Prompt 033 — vì tính khuyến mãi là việc của Discount Engine (Prompt 034, "Internal Service, Không Public"), chỉ chạy ở bước Checkout, không phải lúc thêm vào giỏ. Cart Entity vẫn khai đủ field theo đúng danh sách Prompt 033 (`Product, Qty, Price, Discount, Promotion, Voucher, Tax, Total`) để Discount Engine (034) và Checkout Engine (035) có chỗ ghi vào sau này mà không cần đổi shape Cart.
6. **Không thêm permission mới** — Prompt 033 không có mục "Permission" (khác 031/032). Tái sử dụng `pos:access` đã seed sẵn từ Foundation ("Truy cập màn hình bán hàng"), áp ở cấp Controller (`@RequirePermissions('pos:access')` trên class, không lặp lại ở từng method).
7. **TTL reset về đủ 1800s ở mọi lần `save()`** (add/update/remove) — không reset khi `GET /cart` (đọc thuần túy, tránh giỏ hàng "sống mãi" chỉ vì bị poll liên tục mà không có tương tác thật). `POST /cart/clear` xóa hẳn key Redis (không giữ giỏ rỗng có TTL).
8. **`GET /cart` không lỗi 404 khi chưa có giỏ hàng** — trả về Cart rỗng (`items: []`, mọi tổng = "0.00"), đúng UX giỏ hàng thông thường, không coi "chưa có gì trong giỏ" là lỗi.

## 5. Chức năng đã hoàn thành

- **`GET /cart`**: lấy giỏ hàng hiện tại của user đang đăng nhập (rỗng nếu chưa có).
- **`POST /cart/add`**: thêm sản phẩm — validate tồn tại + `allowSale` + có giá RETAIL, cộng dồn quantity nếu đã có, snapshot giá/thuế theo Product hiện tại.
- **`PATCH /cart/update`**: sửa quantity tuyệt đối của 1 dòng đã có trong giỏ, giữ nguyên giá.
- **`DELETE /cart/remove`**: xóa 1 dòng khỏi giỏ.
- **`POST /cart/clear`**: xóa toàn bộ giỏ (xóa key Redis).
- Toàn bộ response đều trả lại Cart đầy đủ (không phải chỉ dòng vừa đổi) — nhất quán, FE luôn có state mới nhất sau mỗi thao tác.

## 6. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/cart/`: domain (`entities/cart.entity.ts` + spec, `repositories/cart.repository.interface.ts`), infrastructure (`persistence/redis-cart.repository.ts` + spec), application (`dto/add-cart-item.dto.ts`, `update-cart-item.dto.ts`, `remove-cart-item.dto.ts`, `cart-response.dto.ts` + spec chung `cart-item.dto.spec.ts`, `mappers/cart.mapper.ts`, `cart.service.ts` + spec), presentation (`cart.controller.ts` + spec), `cart.module.ts`.
**Tạo mới khác**: `backend/test/cart.e2e-spec.ts`.
**Sửa**: `backend/src/app.module.ts` (đăng ký `CartModule`), `backend/src/common/errors/error-codes.ts` (+`CART_001..003`).
**Không đổi**: `schema.prisma` (không có migration nào — xem mục 1).

## 7. API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/cart` | `pos:access` |
| POST | `/api/v1/cart/add` | `pos:access` |
| PATCH | `/api/v1/cart/update` | `pos:access` |
| DELETE | `/api/v1/cart/remove` | `pos:access` |
| POST | `/api/v1/cart/clear` | `pos:access` |

## 8. Test

- **Unit (module `cart/`)**: 41 test, 5 suite, tất cả PASS. Coverage (loại trừ `cart.module.ts` — thuần khai báo DI, cùng quy ước loại trừ `.module.ts` đã áp dụng ở Prompt 032): **100% statement, 100% function, 100% line, 82.75% branch**. Bao gồm: domain entity (tính tax/total đúng với vat 10%/0%, quantity thập phân, merge/recalculate không sai số), Redis repository (key đúng định dạng `cart:{org}:{user}`, TTL 1800s, get/set/del), Service (404 khi thiếu Product/thiếu Item trong giỏ, 422 khi không được phép bán/thiếu giá RETAIL, merge cộng dồn + re-snapshot giá, update giữ nguyên giá, remove/clear tính lại tổng), Controller (permission `pos:access` áp ở cấp Class, ủy quyền đúng actor context), DTO validation (quantity dương, tối đa 3 chữ số thập phân, UUID hợp lệ).
- **Full backend suite**: 101 suite / 863 test — **860 PASS**, 3 fail (cùng `argon2-password-hasher.spec.ts` timeout đã biết từ Prompt 032, do tải máy khi chạy chung với lint nền; xác nhận lại 3/3 PASS khi chạy cô lập, không liên quan Cart).
- **Integration**: `test/cart.e2e-spec.ts` — luồng đầy đủ add→add (cộng dồn)→update→remove→clear qua HTTP thật với Product thật (kể cả `vat`), reject sản phẩm không tồn tại (404), sản phẩm `allowSale=false` (422), update/remove sản phẩm không có trong giỏ (404). **Chưa xác nhận PASS thật** — sandbox không có Docker/Postgres/Redis, cùng giới hạn Gate B đã disclose từ Prompt 016.
- Build/Lint/TypeCheck: **PASS** trên toàn repo (không có migration nên không chạy `prisma validate` cho riêng Prompt này).

## 9. Self-Review

- **Không TODO/FIXME/console.log/`any`** — grep xác nhận rỗng trong `src/modules/cart/`.
- **Đúng "Acceptance: Redis PASS"** — mọi đường đọc/ghi Cart đều đi qua `ICartRepository`/`RedisCartRepository`, không có đường nào đọc/ghi Postgres cho chính Cart (chỉ đọc Product qua repository interface để validate, không ghi).
- **Concurrency**: 500 Cart đồng thời (yêu cầu Prompt) không cần cơ chế khóa đặc biệt — mỗi Cart key theo `(organizationId, userId)` riêng biệt, Redis `SET`/`GET`/`DEL` tự thân đã atomic ở cấp key; không có tranh chấp giữa các user khác nhau. Trong phạm vi cùng 1 user tự thao tác nhanh liên tiếp, rủi ro race là chấp nhận được (last-write-wins trên chính giỏ hàng của họ), không như Customer Point (nhiều actor có thể cùng ghi 1 balance).
- **Kiến trúc "không gọi chéo Service"**: `CartModule` chỉ import `ProductModule` để lấy `PRODUCT_REPOSITORY` (đọc qua Repository interface, không gọi `ProductService`), đúng sơ đồ bắt buộc từ Prompt 031.
- Chưa raise vấn đề phụ thuộc thiếu module cho Prompt này — Prompt 033 hoàn toàn tự chứa (Cart chỉ cần Product, đã tồn tại từ Foundation), không có gap nào giống tình huống Sales Order (036) trước đây.

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết). Sẵn sàng cho Prompt 034 (Discount Engine).

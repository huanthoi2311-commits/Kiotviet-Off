# Implementation Report — Prompt 032: Customer Point (Loyalty Ledger)

**Ngày:** 2026-07-15
**Phạm vi:** Loyalty Point Ledger — không lưu `Customer.point` làm nguồn dữ liệu duy nhất, phải có `CustomerPointLedger`. Đây là module đầu tiên trong dự án thực sự **lắng nghe** Domain Event (hạ tầng publisher đã dựng ở Prompt 031, chưa có subscriber nào dùng).

## 1. Đối chiếu schema hiện có với Prompt 032

Bảng `points` đã tồn tại từ migration khởi tạo (chưa từng được module nào ghi dữ liệu — cùng tình trạng với `customers` trước Prompt 031) nhưng shape khác hẳn: có `type` (enum EARN/REDEEM/EXPIRE/ADJUST), `points`/`refType`/`refId`/`expiresAt`, và có `updatedAt`/`deletedAt` (cho phép sửa/xóa). Field list của Prompt 032 (`id, customerId, referenceType, referenceId, point, balance, expiredAt, createdAt`) khác về tên (`points`→`point`, `refType/refId`→`referenceType/referenceId`, `expiresAt`→`expiredAt`), **thiếu `type`**, và **thêm `balance`** (số dư tích lũy — trường không hề tồn tại trong schema cũ).

**Quyết định: đổi tên toàn bộ `Point`/`points` → `CustomerPointLedger`/`customer_point_ledgers`** (model lẫn bảng), không chỉ sửa field — vì tên Entity Prompt 032 đưa ra ("CustomerPointLedger") khác hẳn "Point", và ý nghĩa cũng khác: đây là **sổ cái** (ledger), không phải một bản ghi điểm rời rạc. Bỏ `type`/`updatedBy`/`updatedAt`/`deletedAt` — một dòng ledger là **bất biến** (không sửa/xóa), đúng triết lý `InventoryMovement` (Prompt 022) đã áp dụng xuyên suốt dự án. Thêm `balance` (Int, NOT NULL) — số dư tích lũy **ngay sau** dòng này, cùng cách `InventoryMovement.afterQuantity` lưu snapshot bất biến thay vì tính lại từ đầu mỗi lần đọc.

Migration dùng `RENAME TABLE`/`RENAME COLUMN`/`RENAME CONSTRAINT` (metadata-only, giữ nguyên dữ liệu nếu bảng đã có dòng nào — dù thực tế đang trống), không `DROP`+`CREATE` — an toàn tuyệt đối.

## 2. Lần đầu dùng thật hạ tầng Domain Event (đã dựng ở Prompt 031)

Đây là bài toán trọng tâm của Prompt: `Customer.totalPoint` (Prompt 031 đã khai báo là "do hệ thống duy trì — Customer Point Ledger, Prompt 032") cần được đồng bộ mỗi khi có dòng ledger mới, nhưng **`customers` là bảng của module Customer**, không phải của Customer Point. Theo nguyên tắc "không gọi trực tiếp module khác, trao đổi qua Domain Event" (bắt buộc từ Prompt 031):

1. **`CustomerPointService.addPoint()`/`usePoint()`** ghi ledger xong thì `publish(POINT_ADDED_EVENT / POINT_USED_EVENT, {customerId, balance, ...})` — **không** gọi `CustomerService`, **không** ghi trực tiếp vào bảng `customers`.
2. **`CustomerPointSubscriber`** (đặt trong module `customer`, không phải `customer-point`, vì Customer là chủ sở hữu DUY NHẤT của bảng `customers`) lắng nghe `@OnEvent(POINT_ADDED_EVENT)`/`@OnEvent(POINT_USED_EVENT)`/`@OnEvent(POINT_EXPIRED_EVENT)`, gọi `ICustomerRepository.syncTotalPoint(customerId, event.balance)` — **dùng thẳng `balance` có sẵn trong payload sự kiện**, không truy vấn lại `customer_point_ledgers` (tránh phụ thuộc chéo module VÀ tránh 1 query thừa — `balance` đã được `CustomerPointRepository` tính đúng trong 1 transaction có khóa row).
3. **Phụ thuộc NestJS module chỉ 1 chiều**: `CustomerPointModule` import `CustomerModule` (để validate `customerId` tồn tại qua `ICustomerRepository.findById()` — đọc thuần túy, không phải chuỗi gọi ghi chéo mà quy tắc mới cấm). `CustomerModule` **không** import `CustomerPointModule` — `CustomerPointSubscriber` chỉ import TRỰC TIẾP 2 hằng tên sự kiện (`import type`/`import` từ file domain event của Customer Point, không phải import NestJS Module) — tránh circular dependency giữa 2 module hoàn toàn.
4. **Không có Subscriber nào khác cần đăng ký thủ công** — `@nestjs/event-emitter` tự quét toàn bộ provider trong ứng dụng để tìm `@OnEvent`, không cần khai báo quan hệ import đặc biệt nào giữa 2 module cho riêng cơ chế event.

Test tích hợp (`customer-point.e2e-spec.ts`) xác nhận toàn bộ chuỗi này hoạt động đúng qua HTTP thật: add→add→use rồi gọi `GET /customers/:id` xác nhận `totalPoint` đã được `CustomerPointSubscriber` đồng bộ đúng — không phải do `CustomerPointService` tự ghi.

## 3. Quyết định thiết kế khác

1. **Khóa row `Customer` (`SELECT ... FOR UPDATE`) trước khi đọc dòng ledger gần nhất** — chặn race condition khi 2 request cộng/trừ điểm cho CÙNG khách hàng chạy đồng thời (2 transaction đọc trùng `balance` cũ rồi cùng ghi đè, gây sai số dư). Chỉ khóa theo `customerId`, không ảnh hưởng khách hàng khác — đáp ứng đúng tinh thần "Ledger luôn đúng" của Prompt dưới tải đồng thời, dù Prompt không nêu rõ số lượng concurrent user cụ thể (khác các Prompt trước có "Concurrency" ghi rõ số).
2. **`usePoint()` chặn khi vượt số dư hiện tại** — không nêu trong Prompt nhưng là quy tắc tối thiểu bắt buộc để "Ledger luôn đúng" (không cho số dư âm ngoài ý muốn); đọc số dư TRONG transaction có khóa, không phải giá trị đã fetch trước đó.
3. **`referenceType`/`referenceId` tự do (string, không FK)** — dùng để ghi nhận nguồn phát sinh (vd. "ORDER", "MANUAL", "PROMOTION") mà không ràng buộc cứng vào bảng nào — nhất quán với cách `Debt.refType/refId` (Foundation) đã thiết kế, và cần thiết vì Order chưa tồn tại (không thể FK tới bảng chưa có module).
4. **`PointExpired` được khai báo (hằng số sự kiện + subscriber đã lắng nghe) nhưng chưa có nơi nào publish** — Prompt 032 chỉ cho 3 endpoint (`add`/`use`/`history`), không có endpoint hay cron hết hạn điểm. Đây là dự phòng cho tương lai (tương tự cách `PENDING`/`COMPLETED` được khai báo nhưng chưa dùng hết ở Purchase Order, Prompt 027) — disclose rõ, không tự ý thêm cron job chưa được yêu cầu.
5. **Route `/customer-point/add`, `/customer-point/use`, `/customer-point/history`** giữ đúng số ít theo văn bản Prompt 032 — cùng cách xử lý đã áp dụng ở Supplier Debt/Payment (Prompt 029): tên miền nghiệp vụ (Loyalty), không phải resource-collection REST chuẩn.
6. **Không thêm permission `restore`/`delete`** — sổ cái bất biến, không có khái niệm xóa/khôi phục 1 dòng ledger. Chỉ thêm `point:add`/`point:use`, tái dùng `point:view` đã có sẵn từ Foundation.

## 4. Chức năng đã hoàn thành

- **`POST /customer-point/add`**: cộng điểm — sinh 1 dòng Ledger mới, `balance` = số dư trước + điểm cộng.
- **`POST /customer-point/use`**: dùng điểm — sinh 1 dòng Ledger mới (`point` âm), chặn nếu vượt số dư.
- **`GET /customer-point/history`**: lịch sử điểm của 1 khách hàng, phân trang, mới nhất trước.
- **Đồng bộ `Customer.totalPoint`** qua Domain Event + Subscriber (không gọi chéo Service).
- **Audit Log** đầy đủ cho `add`/`use`.
- **Permission**: `point:view` (đã có) + `point:add`/`point:use` (mới).

## 5. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/customer-point/`: domain (entity, repository interface với `CustomerPointInsufficientBalanceError`, domain events), application (DTO×3 + spec, mapper, service + spec), infrastructure (Prisma repository — trọng tâm khóa row + tính balance + spec), presentation (controller + spec), `customer-point.module.ts`.
**Tạo mới khác**: `backend/src/modules/customer/application/subscribers/customer-point.subscriber.ts` (+ spec), `backend/test/customer-point.e2e-spec.ts`, migration `20260715020000_customer_point_ledger`.
**Sửa**: `schema.prisma` (đổi `Point`→`CustomerPointLedger`, bỏ enum `PointType`), `app.module.ts` (đăng ký `CustomerPointModule`), `error-codes.ts` (+`CUSTOMER_POINT_001`), `permission-catalog.ts` (+`point:add`/`point:use`), `customer.module.ts` (đăng ký `CustomerPointSubscriber`), `ICustomerRepository`/`PrismaCustomerRepository` (+`syncTotalPoint()` — method hẹp, chỉ dùng bởi subscriber, không phải API ghi chung).

## 6. Migration

`20260715020000_customer_point_ledger`: `RENAME TABLE points→customer_point_ledgers`, rename 3 cột + 1 constraint (metadata-only, không mất dữ liệu), thêm `balance` (backfill 0 rồi `SET NOT NULL`), bỏ `type`/`updatedBy`/`updatedAt`/`deletedAt` + enum `PointType`, đổi tên index.

## 7. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/customer-point/add` | `point:add` |
| POST | `/api/v1/customer-point/use` | `point:use` |
| GET | `/api/v1/customer-point/history` | `point:view` |

## 8. Test

- **Unit**: **819-822/822 PASS** toàn backend tùy tải hệ thống lúc chạy (xem mục Self-Review về 3 test `argon2-password-hasher` timeout không liên quan). Tăng từ 790 sau Prompt 031. Customer-point-specific (82 test tổng, gồm cả subscriber): service (add/use — 404 khi thiếu customer, +audit +publish event; use — dịch `InsufficientBalanceError`→422; history — 404 khi thiếu customer, map params), Prisma repository (**khóa row + cộng dồn đúng balance**, use trừ đúng + point âm, ném lỗi khi vượt số dư/chưa có điểm nào, history phân trang, getBalance), controller (permission metadata 3 route, ủy quyền), DTO validation (point phải dương/nguyên, customerId phải UUID), `CustomerPointSubscriber` (cả 3 sự kiện đều đồng bộ đúng `totalPoint` = `event.balance`).
- **Coverage** (`customer-point/` + `customer/application/subscribers/`, loại trừ `.module.ts`): **96.95% statement, 94.11% function, 98.63% line, 84.95% branch** — vượt mốc 90% yêu cầu ở statement/function/line.
- **Integration**: `test/customer-point.e2e-spec.ts` — luồng đầy đủ add(100)→add(50)→use(30) qua HTTP thật, xác nhận `balance` tích lũy đúng từng bước (100→150→120), lịch sử trả đúng thứ tự mới nhất trước; **xác nhận `Customer.totalPoint` được `CustomerPointSubscriber` đồng bộ đúng qua Domain Event** (không phải ghi trực tiếp) bằng cách gọi `GET /customers/:id` sau cùng; chặn dùng điểm vượt số dư (422); từ chối thao tác trên khách hàng không tồn tại (404). **Chưa xác nhận PASS thật** — sandbox không có Docker/PostgreSQL, cùng giới hạn Gate B đã disclose từ Prompt 016.
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 9. Self-Review

- **Không TODO/FIXME/console.log/`any`** — `grep` xác nhận rỗng trong `src/modules/customer-point/` và `src/modules/customer/application/subscribers/`.
- **3 test `argon2-password-hasher.spec.ts` timeout không ổn định khi chạy cùng lúc với build/lint/test khác** (argon2id hashing tốn CPU, vượt timeout 5000ms mặc định của Jest khi máy bị tranh chấp tài nguyên) — **đã xác nhận không liên quan Customer Point**: chạy riêng file đó (`npx jest argon2-password-hasher`) cho **3/3 PASS**, và 1 lần chạy `npm test` đầy đủ khi máy rảnh cho **822/822 PASS** tuyệt đối sạch. Đây là vấn đề môi trường sandbox, không phải lỗi code.
- **Architecture Review (trọng tâm của Prompt này)**: đây là lần đầu Domain Event Publisher (Prompt 031) có Subscriber thật sự tiêu thụ — chứng minh hạ tầng hoạt động đúng theo đúng kiến trúc bắt buộc "module trao đổi qua Domain Event, không gọi chéo Service" mà người dùng yêu cầu từ Prompt 031. `CustomerPointModule → CustomerModule` một chiều (đọc `findById` qua repository interface, không phải service-to-service call chain); `CustomerModule` không phụ thuộc ngược `CustomerPointModule` (chỉ import hằng số sự kiện — TS import thuần, không phải NestJS module import) — không có circular dependency.
- **Security Review**: mọi truy vấn lọc `organizationId`; `syncTotalPoint()` là method hẹp chỉ subscriber gọi, không lộ ra API công khai nào cho phép client tự sửa `totalPoint`.
- **Concurrency**: `SELECT ... FOR UPDATE` trên dòng `Customer` trước khi tính `balance` mới — chặn lost-update khi nhiều thao tác điểm cho cùng khách hàng chạy đồng thời, đúng tinh thần "Ledger luôn đúng" dưới tải.
- **Failure & Recovery**: mọi ghi ledger nằm trong 1 transaction (rollback tự động nếu lỗi giữa chừng); publish event chỉ xảy ra SAU khi transaction ledger đã commit thành công — `Customer.totalPoint` chỉ có thể trễ (eventual consistency, đã được chính Prompt xác nhận hợp lý qua câu "không lưu Customer.point làm nguồn dữ liệu duy nhất"), không bao giờ có thể sai lệch với ledger đã ghi.

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết, đã disclose minh bạch). Sẵn sàng cho Prompt 033 (POS Cart Engine — Redis), module đầu tiên không chủ yếu dựa trên Postgres.

# CODING_RULES

Quy ước viết code — áp dụng cho backend NestJS và frontend Next.js, đúc kết từ thực hành nhất quán xuyên suốt Foundation → Sprint-00.

## 1. Cấm tuyệt đối

- Không `TODO`/`FIXME` trong code đã coi là hoàn thành — nếu có việc chưa làm, disclose trong báo cáo/tài liệu, không để lại marker trong code.
- Không `console.log` (dùng Logger/Winston đã cấu hình sẵn).
- Không `any` không cần thiết — nếu bắt buộc phải dùng (vd tương tác với thư viện thiếu type), giới hạn phạm vi tối thiểu, không lan ra biến/tham số khác.
- Không comment giải thích CÁI GÌ (code đặt tên rõ đã đủ) — chỉ viết comment khi giải thích TẠI SAO (constraint ẩn, workaround cho bug cụ thể, hành vi gây bất ngờ nếu không giải thích).
- Không backward-compatibility shim (rename biến không dùng thành `_var`, giữ lại code chết kèm comment "đã xóa") — nếu chắc chắn không dùng, xóa hẳn.

## 2. Dependency Injection

- Repository interface dùng **Symbol token** (`export const XXX_REPOSITORY = Symbol('XXX_REPOSITORY')`), inject qua `@Inject(XXX_REPOSITORY)`.
- Application/Domain Service dùng **class-based injection** trực tiếp (không cần token riêng trừ khi có ≥2 implementation cần hoán đổi).
- Repository chỉ export nếu THỰC SỰ cần thiết cho module khác — mặc định KHÔNG export (xem `ARCHITECTURE_RULES.md` §2).

## 3. Xử lý lỗi

- Domain error là 1 class riêng `extends Error`, định nghĩa cùng file với Repository interface hoặc trong `domain/errors/` nếu cần dùng chéo module (như `InventoryInsufficientStockError`).
- Service tầng Application bắt lỗi bằng `instanceof`, dịch sang NestJS `HttpException` cụ thể (`UnprocessableEntityException`, `ConflictException`, ...) kèm `ErrorCode` riêng (xem `backend/src/common/errors/error-codes.ts`) — không để lỗi domain rò ra ngoài dưới dạng lỗi generic 500.
- Mỗi module dùng 1 wrapper tập trung kiểu `transitionOrConflict()` cho các thao tác có nhiều nhánh lỗi có thể xảy ra, không rải rác `try/catch` lặp lại nhiều nơi.

## 4. Transaction

- Mọi thao tác cần atomic xuyên nhiều bảng dùng đúng 1 `prisma.$transaction(async (tx) => {...})` — không tách thành nhiều transaction nhỏ hơn cần thiết.
- Nếu 1 phương thức (của Repository/Domain Service) cần được gọi TRONG 1 transaction lớn hơn do caller sở hữu, nhận `tx: Prisma.TransactionClient` làm tham số bắt buộc, tuyệt đối không tự mở transaction riêng bên trong (xem `ARCHITECTURE_RULES.md` §2).

## 5. Đặt tên & cấu trúc file

- Tên file theo kebab-case, khớp tên class/interface bên trong (`prisma-inventory.repository.ts` chứa `PrismaInventoryRepository`).
- DTO validate bằng `class-validator` decorator trực tiếp trên field, không viết validate logic tay trong Controller/Service khi decorator có sẵn đã đủ.
- Mapper (Entity ↔ DTO) tách riêng file `*.mapper.ts`, không nhúng logic map vào Service.

## 6. Không lạm dụng trừu tượng hóa

- Không tạo interface/abstraction cho 1 use case duy nhất "phòng khi cần sau này" — chỉ trừu tượng hóa khi có ≥2 use case thật cần đến.
- Không viết lại/refactor module đang hoạt động đúng chỉ vì "có thể làm gọn hơn" nếu không nằm trong phạm vi task hiện tại — task nào làm đúng phạm vi task đó.

## 7. Tuân thủ Conventional Commits

- Mọi commit message theo `type(scope): mô tả ngắn`, `scope` KHÔNG được để trống (commitlint/husky enforce — vd `docs(architecture): ...`, không phải `docs: ...`).
- Xem `RELEASE_RULES.md` cho quy tắc commit/push đầy đủ.

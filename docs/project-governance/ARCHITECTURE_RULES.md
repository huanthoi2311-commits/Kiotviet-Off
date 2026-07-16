# ARCHITECTURE_RULES

Bất biến kiến trúc bắt buộc của dự án. Nguồn sự thật đầy đủ, có Context/Alternatives/Rejected cho từng quyết định nằm ở `docs/architecture/adr/` — file này là bản tóm tắt "phải tuân theo cái gì", không lặp lại lý do (đọc ADR tương ứng nếu cần hiểu "vì sao").

## 1. Cấu trúc hệ thống

- **Monolithic Modular** (ADR-0001) — 1 backend NestJS, chia theo Module theo bounded context. Không tách Microservice trừ khi có ADR mới thay thế ADR-0001.
- **Clean Architecture 4 lớp** trong MỌI module (ADR-0002): `domain/ → application/ → infrastructure/ → presentation/`, dependency chỉ đi vào trong. Ngoại lệ phải disclose tường minh (như `discount/` không có `presentation/`, `platform/` là hạ tầng dùng chung) — không tạo ngoại lệ mới mà không ghi lại lý do.
- **Multi-tenant**: Organization → Branch → Warehouse (ADR-0003). Mọi bảng nghiệp vụ mới PHẢI có `organizationId`, mọi Repository/Query PHẢI filter theo đó.
- **RBAC per-tenant** (ADR-0004): Role/Permission luôn thuộc 1 Organization. Không tạo Role liên-tenant. Quyền nạp vào JWT lúc đăng nhập, không query DB mỗi request — dùng `permissionVersion` để vô hiệu JWT cũ khi quyền đổi.

## 2. Quy tắc ghi dữ liệu xuyên module (Single Writer / Repository Boundary)

Áp dụng cho MỌI module tương lai có nhu cầu tương tự Inventory (T004), không chỉ riêng Inventory:

- **Repository không export ra ngoài module sở hữu** (ADR-0010) — chỉ Application/Domain Service được export. Đây là quy tắc CHUNG, không phải ngoại lệ riêng cho Inventory.
- Nếu 1 module cần là điểm ghi DUY NHẤT cho 1 loại dữ liệu (như Inventory — ADR-0005), thiết kế theo mẫu `XxxDomainService` (ADR-0006): 1 class Application Service làm cổng public duy nhất, Repository lùi thành nội bộ, KHÔNG thêm 1 tầng "Domain Service" chính thức mới vào Clean Architecture 4 lớp trừ khi ≥2 module chứng minh cùng nhu cầu.
- **Domain Service không tự quản lý transaction** (ADR-0008) — mọi phương thức public nhận `tx: Prisma.TransactionClient` bắt buộc (thường ở tham số đầu), không tự mở/commit/rollback. Caller (module gọi) luôn sở hữu ranh giới transaction của chính nó.
- **Xác minh bất biến này bằng test tự động**, không chỉ code review thủ công (xem `TEST_RULES.md` lớp Architecture) — mẫu tham chiếu: `backend/src/modules/inventory/single-writer.architecture.spec.ts`.

## 3. Concurrency

- **Optimistic Lock là mặc định** cho dữ liệu tranh chấp cao (ADR-0007) — compare-and-swap (`UPDATE ... WHERE <cột> = <giá trị vừa đọc>`), an toàn dưới READ COMMITTED (mức cô lập mặc định dự án, không cần SERIALIZABLE).
- Pessimistic Lock (`SELECT ... FOR UPDATE`) chỉ dùng khi có 1 hot path cụ thể chứng minh retry-storm tốn kém hơn chi phí chờ khóa — không phải mặc định, cần ADR riêng nếu áp dụng.

## 4. Domain Events

- **Publish sau khi transaction commit, không bao giờ publish bên trong transaction** (ADR-0009) — nguyên tắc bất biến, áp dụng cho MỌI domain có event, không chỉ Inventory.
- **Outbox Pattern bắt buộc cho event MỚI từ Sprint-01** (ADR-0011) — không gọi `eventEmitter.emit()`/`publish()` trực tiếp cho code mới; ghi `OutboxEvent` atomic cùng transaction nghiệp vụ, Worker riêng publish sau. Code cũ (`customer`, `customer-point`, `checkout` — publish trực tiếp) không bắt buộc migrate ngược trừ khi có SPEC riêng.
- Đặt tên event: PascalCase theo tên nghiệp vụ cụ thể (`InventoryIncreased`, `TransferApproved`) — KHÔNG dùng 1 event tổng quát kiểu `XxxChanged` (quyết định tường minh, xem `docs/architecture/event-architecture-review.md`).

## 5. Không có circular dependency

- `forwardRef` không được xuất hiện trong `imports` của bất kỳ `*.module.ts` nào (grep xác nhận 0 kết quả xuyên suốt dự án tới Sprint-00). Nếu 1 thiết kế MỚI cần `forwardRef` để giải quyết phụ thuộc vòng, đây là tín hiệu module boundary đang sai — thiết kế lại thay vì dùng `forwardRef` để né tránh.
- Xác minh bằng `grep forwardRef` VÀ boot thử `NestFactory.createApplicationContext(AppModule)` thật (không chỉ `tsc --noEmit`) trước khi báo "không có circular dependency".

## 6. Khi thiết kế module MỚI (Sprint-01 trở đi)

Checklist tối thiểu trước khi implement 1 module mới:
1. Có cần là "Single Writer" cho dữ liệu nào không? Nếu có, áp dụng mẫu §2.
2. Có Domain Event nào cần publish không? Nếu có, dùng Outbox (ADR-0011), đặt tên theo §4.
3. Layering đúng 4 lớp (ADR-0002), không lẫn logic nghiệp vụ vào Infrastructure/Presentation.
4. Repository của module có cần export không? Mặc định KHÔNG — chỉ export nếu module khác thực sự cần đọc/ghi qua đó VÀ không có rủi ro bypass gate nghiệp vụ nào.
5. Nếu phát sinh 1 quyết định kiến trúc lớn không nằm trong ADR hiện có → ghi ADR mới, không quyết định ngầm rồi quên ghi lại.

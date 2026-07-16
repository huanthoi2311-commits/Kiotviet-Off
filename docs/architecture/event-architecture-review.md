# T004.9 — Event Architecture Review

> Tài liệu phân tích/thiết kế. **Không sửa code, không tạo migration, không cài đặt event nào.** Mục đích: thống nhất kiến trúc Domain Event TRƯỚC khi user soạn `SPEC-EVENT-001` và Claude Code triển khai T005.
>
> **Cập nhật 2026-07-16 — 2 quyết định đã chốt (ARCHITECT DECISION, sau khi đọc bản đầu tài liệu này):**
> 1. **Danh sách Event: dùng nhiều Event cụ thể**, KHÔNG dùng 1 event tổng quát (`InventoryChanged`) — trái với đề xuất ban đầu của T003.5 (`inventory-event-flow.md` §3.2). Lý do user đưa ra: dễ mở rộng, Subscriber không cần switch-case, dễ log/audit, dễ publish sang Kafka/RabbitMQ/BullMQ sau này, phù hợp Event Sourcing nếu áp dụng sau này. §2 dưới đây cập nhật theo đúng quyết định này, KHÔNG còn là open question.
> 2. **Outbox Pattern bắt buộc từ T005** — thay thế hoàn toàn cơ chế "publish trực tiếp qua `eventEmitter.emit()` sau khi transaction commit" mà §4 bản đầu mô tả. Xem §4 (viết lại toàn bộ) và `docs/architecture/adr/ADR-0008-outbox-pattern.md`.

## 1. Hiện trạng — chưa có Domain Event nào cho Inventory, nhưng đã có mẫu hình sẵn cho toàn hệ thống

Grep xác nhận `inventory` module (kể cả sau T004) **chưa publish bất kỳ Domain Event nào**. Project đã có mẫu hình Domain Event hoạt động thật ở 3 module khác (`customer`, `customer-point`, `checkout`) — mẫu hình này giờ được xác định là **ADR-0005, đã Superseded bởi ADR-0008** (xem `docs/architecture/adr/`). Tóm tắt mẫu cũ (vẫn đúng cho code hiện tại, KHÔNG bắt buộc migrate ngược — chỉ không còn là mẫu cho code MỚI từ T005):

- Cơ chế: `@nestjs/event-emitter`, `DomainEventPublisher.publish(eventName, payload)`, subscribe qua `@OnEvent(eventName)`.
- Đặt tên cũ: `'<module>.<action>'` dạng chuỗi (`customer.created`) — **khác với quy ước MỚI ở §2** (PascalCase không có dấu chấm, theo đúng ví dụ user: `InventoryIncreased`).
- Publish sau khi `$transaction(...)` trả về, KHÔNG bên trong transaction — nguyên tắc này **vẫn đúng và được Outbox Pattern kế thừa**, chỉ đổi cách hiện thực (xem §4).

## 2. Danh sách Domain Event — ĐÃ CHỐT (không còn open question)

Theo đúng quyết định của user. Cột "Write path hiện có?" đối chiếu với `InventoryDomainService` (T004) và `docs/architecture/inventory/inventory-domain-model.md` (T003.5) để không liệt kê event cho tính năng chưa tồn tại mà không disclose rõ.

| Event (PascalCase) | Nguồn phát (module) | `movementType`/thao tác tương ứng | Write path hiện có? |
|---|---|---|---|
| `InventoryIncreased` | `purchase-order` (sau `receive()` commit) | `increase()` → `PURCHASE`/`INITIAL` | ✅ Có (T004) |
| `InventoryDecreased` | `purchase-return` (sau `complete()` commit) | `decrease()` → `RETURN` | ✅ Có (T004) |
| `InventoryAdjusted` | `inventory-adjustment` (sau `complete()` commit) | `adjust()` → `ADJUSTMENT` | ✅ Có (T004) |
| `TransferApproved` | `transfer` (sau `approve()` commit) | `transfer()` direction=OUT → `TRANSFER_OUT` | ✅ Có (T004) |
| `TransferReceived` | `transfer` (sau `receive()` commit) | `transfer()` direction=IN → `TRANSFER_IN` | ✅ Có (T004) |
| `PurchaseReceived` | `purchase-order` (sau `receive()` commit) | Sự kiện cấp Purchase Order (status → RECEIVED), tách biệt với `InventoryIncreased` (sự kiện cấp Inventory) — cùng 1 lần commit phát CẢ HAI | ✅ Có (T004, cùng transaction với `InventoryIncreased`) |
| `PurchaseReturned` | `purchase-return` (sau `complete()` commit) | Tương tự — cấp Purchase Return, song song `InventoryDecreased` | ✅ Có (T004) |
| `StockCountCompleted` | `stock-count` (sau `complete()` commit) | Cấp Stock Count; `adjust()` → `COUNT` phát `InventoryAdjusted` RIÊNG cho mỗi dòng có `difference ≠ 0` — 1 lần `complete()` có thể phát 1 `StockCountCompleted` + N `InventoryAdjusted` (N = số dòng lệch) | ✅ Có (T004) |
| `InventoryReserved` | *(chưa xác định — module chưa tồn tại)* | Ứng với 1 hàm `reserve()` chưa có trên `InventoryDomainService` | ❌ **KHÔNG có write path** — xem cảnh báo dưới |
| `InventoryReleased` | *(chưa xác định — module chưa tồn tại)* | Ứng với 1 hàm `release()` chưa có trên `InventoryDomainService` | ❌ **KHÔNG có write path** — xem cảnh báo dưới |

**⚠️ Cảnh báo cần disclose rõ, không im lặng bỏ qua**: `InventoryReserved`/`InventoryReleased` giả định sự tồn tại của `InventoryReservation` — một aggregate **CHƯA ĐƯỢC THIẾT KẾ**, đã nêu rõ ở `inventory-domain-model.md` §4.2 (T003.5): field `Inventory.reservedQty` tồn tại trong schema nhưng **chưa từng có write path nào** (kể cả sau T004) từng ghi vào nó ngoài giá trị khởi tạo `0`. `InventoryDomainService` hiện KHÔNG có phương thức `reserve()`/`release()` nào tương ứng.

**Hệ quả cho SPEC-EVENT-001**: 2 event này không thể triển khai ở T005 nếu chỉ dựa vào code hiện có — cần 1 trong 2 hướng: (a) SPEC-EVENT-001 chỉ ĐỊNH NGHĨA tên/shape 2 event này làm chỗ đứng trước (contract-first), chưa publish thật cho tới khi có 1 SPEC riêng cho `InventoryReservation` (giống cách `POINT_EXPIRED_EVENT` đã tồn tại tên nhưng chưa ai publish); hoặc (b) tách `InventoryReservation` thành 1 SPEC/Sprint riêng TRƯỚC, rồi mới hoàn thiện `InventoryReserved`/`InventoryReleased` cùng lúc. Khuyến nghị (a) — ít rủi ro hơn, không mở rộng phạm vi T005 sang xây cả Reservation.

## 3. Publisher / Subscriber

### 3.1 Publisher — LUÔN là module NGUỒN, không phải `inventory`

`InventoryDomainService.increase()/decrease()/adjust()/transfer()` nhận `tx` từ CALLER — chỉ module gọi (`purchase-order`, `purchase-return`, `transfer`, `inventory-adjustment`, `stock-count`, `checkout`) mới biết chính xác khi nào transaction của NÓ hoàn tất về mặt nghiệp vụ (có thể còn làm thêm việc khác sau khi gọi InventoryDomainService, vd ghi Debt). Do đó việc QUYẾT ĐỊNH "sự kiện nghiệp vụ nào vừa xảy ra" (vd `PurchaseReceived`) vẫn thuộc về module nguồn.

**Điểm khác biệt quan trọng so với bản đầu tài liệu này (đã giải quyết bằng Outbox Pattern, xem §4)**: trước đây, việc `InventoryDomainService.onMovementRecorded()` hook (chừa sẵn từ T004) có tự ghi `InventoryIncreased`/`InventoryDecreased`/`InventoryAdjusted` hay không bị vướng bởi câu hỏi "publish tại đây không đảm bảo transaction ngoài đã commit". Với Outbox Pattern, vấn đề này KHÔNG còn tồn tại: hook chỉ cần **ghi 1 dòng `OutboxEvent` bằng đúng `tx` nó đang có sẵn** (không phải gọi `eventPublisher.publish()` trực tiếp) — dòng `OutboxEvent` này COMMIT HAY ROLLBACK CÙNG với toàn bộ transaction của caller một cách tự nhiên, không cần biết caller còn làm gì thêm sau đó. Đây là lý do Outbox Pattern phù hợp hơn hẳn cho đúng tình huống kiến trúc mà T004 để lại.

**Kết luận cho T005**: `InventoryDomainService.onMovementRecorded()` NÊN là nơi ghi `OutboxEvent` cho các event cấp Inventory (`InventoryIncreased`/`InventoryDecreased`/`InventoryAdjusted`/`TransferApproved`/`TransferReceived`). Các event cấp module nguồn (`PurchaseReceived`, `PurchaseReturned`, `StockCountCompleted`) do chính module đó ghi `OutboxEvent` riêng, cùng `tx` của nó.

### 3.2 Subscriber — chưa có nhu cầu cụ thể ngay, nhưng hạ tầng nên sẵn sàng

Hiện không có module nào cần phản ứng real-time với biến động tồn kho. T005 xây hạ tầng phát event (Outbox + Worker) là chuẩn bị, không phải nhu cầu cấp thiết ngay — Subscriber đầu tiên thực tế nhiều khả năng là 1 module tương lai (Low Stock Alert, Reporting), không phải module đang tồn tại.

## 4. Quy tắc phát hành — Outbox Pattern (thay thế hoàn toàn "publish trực tiếp sau commit")

**Quyết định của user, bắt buộc từ T005:** KHÔNG được `eventEmitter.emit()`/`DomainEventPublisher.publish()` trực tiếp ngay sau khi transaction commit. Luồng bắt buộc:

```
Business Transaction (1 $transaction Prisma)
  ├─ Insert/Update dữ liệu nghiệp vụ (vd Inventory, InventoryMovement, PurchaseOrder)
  └─ Insert OutboxEvent (CÙNG transaction, cùng tx)
COMMIT (business data + OutboxEvent commit ATOMIC với nhau — cùng 1 transaction)
  ↓
Background Worker (poll hoặc trigger định kỳ, NGOÀI transaction nghiệp vụ)
  ↓
Publish Event ra kênh thật (BullMQ nội bộ trước mắt; RabbitMQ/Kafka nếu tách microservice sau này)
  ↓
Mark OutboxEvent.publishedAt (đánh dấu đã publish thành công)
```

**Vì sao đổi từ "emit trực tiếp sau commit" sang Outbox** (lý do user đưa ra, ghi lại để không quên khi review sau này): mẫu cũ (ADR-0005) đúng về nguyên tắc "không publish trong transaction" nhưng vẫn có 1 khoảng hở — giữa lúc `$transaction` trả về và lúc `eventPublisher.publish()` thực thi xong, nếu process crash đúng lúc đó, event mất vĩnh viễn dù business data đã commit (không có gì ghi lại "lẽ ra phải publish event này"). Outbox đóng khoảng hở này bằng cách biến "ghi nhận rằng 1 event CẦN được publish" thành một phần của CHÍNH transaction nghiệp vụ — nếu transaction rollback, `OutboxEvent` cũng rollback theo (không có event ma cho 1 nghiệp vụ chưa từng xảy ra thật); nếu transaction commit, `OutboxEvent` chắc chắn tồn tại để Worker xử lý sau, kể cả khi app crash ngay sau đó.

**Hệ quả thiết kế cho T005 (chưa code, chỉ ghi nhận để SPEC-EVENT-001 cụ thể hóa):**
- Cần 1 bảng `OutboxEvent` mới (schema/migration thuộc phạm vi SPEC-EVENT-001, KHÔNG tự thiết kế ở đây) — tối thiểu cần: `eventType` (tên event, vd `InventoryIncreased`), `payload` (JSON), `organizationId`, `createdAt`, `publishedAt` (nullable — null nghĩa là chưa publish).
- Cần 1 Background Worker — ứng viên tự nhiên là BullMQ (đã có sẵn trong stack, dùng cho mail queue) chạy theo chu kỳ ngắn hoặc được kích hoạt ngay sau mỗi lần ghi `OutboxEvent` (vd qua `LISTEN/NOTIFY` của Postgres, hoặc đơn giản là poll định kỳ — quyết định thuộc SPEC-EVENT-001).
- Mọi module nguồn (`purchase-order`, `purchase-return`, `transfer`, `inventory-adjustment`, `stock-count`, và `InventoryDomainService` cho các event cấp Inventory) ghi `OutboxEvent` bằng `tx` đang có sẵn, KHÔNG gọi `DomainEventPublisher.publish()` trực tiếp nữa cho code MỚI.
- `checkout`/`customer`/`customer-point` (đã dùng ADR-0005) — KHÔNG bắt buộc migrate ngược sang Outbox như một phần của T005 (ngoài phạm vi, cần SPEC riêng nếu muốn đồng bộ hóa toàn bộ hệ thống).

## 5. Idempotency, Retry, Dead Letter Queue

Outbox Pattern tự nhiên hỗ trợ tốt hơn cho các mục dưới đây so với emit trực tiếp — mỗi `OutboxEvent` là 1 dòng DB có định danh riêng (`id`), nên bản thân bảng Outbox đã là nơi tự nhiên để lưu trạng thái publish/retry:

1. **Idempotency key** — đề xuất dùng `OutboxEvent.id` (UUID của chính dòng Outbox) làm khóa duy nhất Consumer/Subscriber dựa vào để kiểm tra "đã xử lý message này chưa" trước khi áp dụng side-effect lần 2 — không cần suy ra khóa nghiệp vụ phức tạp như đề xuất ở bản đầu tài liệu này.
2. **Retry có giới hạn** — Worker thử publish lại N lần nếu thất bại (lỗi mạng, broker down), có backoff; không tự động rollback nghiệp vụ đã commit (Outbox chỉ đồng bộ side-effect, `InventoryMovement` vẫn luôn là nguồn sự thật — xem `inventory-event-flow.md` §3.5).
3. **Dead Letter Queue (DLQ)** — sau N lần thất bại, chuyển `OutboxEvent` sang trạng thái "failed"/đẩy vào 1 bảng hoặc queue DLQ riêng để người vận hành xem xét thủ công, KHÔNG được retry vô hạn hoặc âm thầm bỏ qua.
4. **Event Versioning** — user có nhắc tới trong danh sách yêu cầu cho `SPEC-EVENT-001` (Domain Events chi tiết, Outbox, Event Bus, Retry, Idempotency, DLQ, Event Versioning, Naming Convention, Event Testing, Acceptance Criteria) — chưa phân tích sâu ở tài liệu này, để SPEC-EVENT-001 tự định nghĩa (vd field `eventVersion` trên `OutboxEvent`, chiến lược khi payload shape đổi giữa các phiên bản Subscriber cũ/mới).

## 6. Open Questions còn lại cho SPEC-EVENT-001

Đã loại bỏ 2 open question ở bản đầu (event tổng quát/cụ thể — chốt §2; message queue thật hay in-memory — chốt Outbox+BullMQ §4). Còn lại:

1. **`InventoryReserved`/`InventoryReleased` xử lý thế nào khi chưa có `InventoryReservation`?** Xem cảnh báo ở §2 — khuyến nghị định nghĩa tên/shape trước, publish thật sau khi có SPEC Reservation riêng.
2. **`OutboxEvent` schema chính xác** — chưa thiết kế field-by-field (thuộc phạm vi SPEC-EVENT-001, không tự thiết kế schema ở đây theo đúng nguyên tắc "Specification First").
3. **Cơ chế kích hoạt Worker** — poll định kỳ (đơn giản, có độ trễ) hay `LISTEN/NOTIFY` Postgres (gần realtime, phức tạp hơn) hay BullMQ job được enqueue ngay sau khi `OutboxEvent` insert (nhưng vậy lại quay về vấn đề "enqueue trong transaction có đảm bảo an toàn không" cần phân tích riêng) — SPEC-EVENT-001 quyết định.
4. **Event Testing** — user liệt kê là 1 phần bắt buộc của SPEC-EVENT-001 nhưng chưa có mẫu hình test nào cho Outbox+Worker trong codebase hiện tại (khác với unit test thông thường) — cần SPEC-EVENT-001 định nghĩa chiến lược test (vd test Worker riêng biệt với test nghiệp vụ ghi OutboxEvent).

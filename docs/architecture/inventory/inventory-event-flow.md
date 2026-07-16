# Inventory — Event Flow

> Tài liệu phân tích/thiết kế (T003.5). Không sửa code. Nội dung là **đề xuất** cho `SPEC-INV-001` / T005 (Domain Events).

## 1. Hiện trạng: chưa có Domain Event nào cho Inventory

Grep toàn bộ `src/modules/inventory/` không tìm thấy bất kỳ `DomainEventPublisher.publish()` hay định nghĩa event nào. Đây là **greenfield hoàn toàn** — khác với `customer`/`customer-point`/`checkout` (đã có event từ Prompt 031-035). T005 (Domain Events, sau T004) sẽ phải xây từ đầu, dựa trên thiết kế dưới đây.

## 2. Mẫu event đã thiết lập trong dự án (dùng làm khuôn cho Inventory)

Từ `customer`/`customer-point`/`checkout` (đã hoạt động, có test):

- Thư viện: `@nestjs/event-emitter`, publish qua `DomainEventPublisher.publish(eventName, payload)` (`platform/events/domain-event-publisher.service.ts`), subscribe qua decorator `@OnEvent(eventName)`.
- Tên event là hằng số string dạng `'<module>.<action>'` (`customer.created`, `point.added`, `checkout.completed`), khai báo tại `domain/events/<module>.events.ts`.
- Payload là interface thuần (không class), luôn có `occurredAt: Date` + `organizationId` + khóa chính đối tượng liên quan.
- Subscriber sống ở `application/subscribers/<tên>.subscriber.ts` của module TIÊU THỤ event, không phải module phát ra — ví dụ `CustomerPointSubscriber` nằm trong `customer` module, lắng nghe event của `customer-point` module, để đồng bộ field cache `Customer.totalPoint` mà KHÔNG gọi thẳng Service/Repository của `customer-point` — comment gốc: *"module trao đổi qua Domain Event, không gọi chéo Service"* (luật bắt buộc từ Prompt 031).
- **Thời điểm publish: SAU khi transaction DB đã commit**, không phát bên trong `$transaction`. Xác nhận từ `checkout.service.ts`: `await this.prisma.$transaction(...)` hoàn tất và gán vào `outcome` xong, RỒI mới gọi `this.eventPublisher.publish(CHECKOUT_COMPLETED_EVENT, ...)` ở ngoài transaction. Lý do: tránh subscriber phản ứng với một biến động sau đó bị rollback.

## 3. Thiết kế đề xuất cho Inventory

### 3.1 Ánh xạ ví dụ của SPEC vào thực tế

Ví dụ SPEC đưa ra: `PurchaseReceived → InventoryReceived → InventorySnapshotUpdated → InventoryAvailableChanged`

Ánh xạ vào kiến trúc hiện tại (4 bước của SPEC thực chất là 2 loại event khác nhau, không phải 1 chuỗi tuần tự 4 event độc lập):

| Bước SPEC | Ai phát | Loại | Đề xuất tên hằng số |
|---|---|---|---|
| `PurchaseReceived` | `purchase-order` module, SAU khi transaction `receive()` commit | Business-source event (nguyên nhân) | `PURCHASE_ORDER_RECEIVED_EVENT = 'purchase-order.received'` |
| `InventoryReceived` / `InventorySnapshotUpdated` | `inventory` module (write path), SAU khi transaction ghi Movement+Inventory commit | Kết quả ghi Inventory (hệ quả) | `INVENTORY_MOVEMENT_RECORDED_EVENT = 'inventory.movement-recorded'` |
| `InventoryAvailableChanged` | `inventory` module, phái sinh từ event trên | Derived — chỉ phát khi `availableQty` (quantity - reservedQty) thay đổi | `INVENTORY_AVAILABLE_CHANGED_EVENT = 'inventory.available-changed'` |

### 3.2 Không phát 1 event riêng cho mỗi `movementType`

Có 9 giá trị `InventoryMovementType` (PURCHASE/SALE/RETURN/TRANSFER_IN/TRANSFER_OUT/ADJUSTMENT/COUNT/DAMAGE/INITIAL). Đề xuất: **KHÔNG** tạo 9 event name riêng biệt (`InventoryPurchased`, `InventorySold`, ...). Thay vào đó, phát **1 event tổng quát duy nhất** mỗi khi write path ghi thành công, mang theo `movementType`/`referenceType` để subscriber tự lọc theo nhu cầu — giữ bề mặt event nhỏ, giống cách `customer-point` chỉ có đúng 3 event (`POINT_ADDED`/`POINT_USED`/`POINT_EXPIRED`) dù có nhiều nguồn phát sinh điểm khác nhau.

Payload đề xuất cho `INVENTORY_MOVEMENT_RECORDED_EVENT`:

```ts
interface InventoryMovementRecordedEvent {
  organizationId: string;
  warehouseId: string;
  productId: string;
  movementType: InventoryMovementType;
  referenceType: InventoryReferenceType;
  referenceId: string | null;
  beforeQuantity: string;
  afterQuantity: string;
  occurredAt: Date;
}
```

Publish tại đúng 1 nơi: bên trong hàm ghi tổng quát của `IInventoryRepository` (xem [[inventory-write-path]] §4), NGAY SAU khi `this.prisma.$transaction(...)` bao ngoài của CALLER (không phải của chính hàm ghi — vì write path sẽ nhận `tx` composable, transaction thật sự do caller sở hữu) commit. Điều này đặt ra một ràng buộc thiết kế: hàm ghi bên trong `IInventoryRepository` không thể tự publish ngay sau khi mình ghi xong (vì `tx` truyền vào chưa chắc đã commit — caller có thể còn làm thêm việc khác trong cùng transaction, ví dụ `PurchaseOrder.receive()` còn ghi `Debt` sau vòng lặp Inventory). Publish phải do **caller** (Application Service của module nguồn — `PurchaseOrderService`, `CheckoutService`, ...) thực hiện sau khi `$transaction` của chính họ hoàn tất — đúng mẫu `checkout.service.ts` đang làm với `CHECKOUT_COMPLETED_EVENT`.

**Hệ quả kiến trúc:** event Inventory không được publish TỪ BÊN TRONG `inventory` module, mà từ module NGUỒN gây ra biến động, sau khi commit toàn bộ transaction nghiệp vụ của module đó. `inventory` module chỉ định nghĩa tên event + payload shape (trong `domain/events/inventory.events.ts`), các module nguồn import và publish.

### 3.3 `InventoryAvailableChanged` — phụ thuộc vào Reservation chưa tồn tại

`availableQty = quantity - reservedQty`. Vì `reservedQty` hiện luôn là 0 (xem [[inventory-domain-model]] §4.2), `INVENTORY_AVAILABLE_CHANGED_EVENT` hôm nay về bản chất **luôn đồng nhất với thay đổi `quantity`** — không mang thêm thông tin gì so với event chính. Event này chỉ thực sự có ý nghĩa riêng biệt SAU KHI `InventoryReservation` được xây (SPEC riêng, chưa có). Đề xuất: định nghĩa sẵn tên event này trong T005 (không tốn chi phí), nhưng không cần logic phân biệt với event chính cho tới khi Reservation tồn tại.

### 3.4 Ai tiêu thụ các event này hôm nay?

**Chưa có subscriber nào cần thiết ngay.** Không có module nào hiện tại cần phản ứng real-time với biến động tồn kho (không có cảnh báo tồn kho thấp, không có đồng bộ kênh bán online, không có webhook tồn kho). Giống hệt tình huống `POINT_EXPIRED_EVENT` đã disclosed rõ trong code: *"Chưa có nơi nào publish sự kiện này... sẵn sàng cho tương lai."* Áp dụng nguyên văn tinh thần đó ở đây: xây hạ tầng event tại T005 là chuẩn bị cho tương lai (low-stock alert, sync kênh bán), không phải nhu cầu cấp thiết hôm nay.

### 3.5 Quan hệ giữa Event và Ledger — không thay thế nhau

`InventoryMovement` (ledger DB, bền vững, truy vấn được, audit trail) vẫn là **nguồn sự thật chính**. Domain Event chỉ dùng để đồng bộ phản ứng CHÉO MODULE theo thời gian thực (in-memory, không bền vững — nếu app crash giữa lúc publish, event mất, nhưng `InventoryMovement` đã commit vẫn còn nguyên). Không được thiết kế bất kỳ luồng nào coi Domain Event là nơi lưu trữ duy nhất của một biến động tồn kho.

## 4. Việc CHƯA làm trong T003.5

Không tạo file `domain/events/inventory.events.ts`, không thêm `DomainEventPublisher` vào bất kỳ service nào. Đây là thiết kế cho T005, sau khi T004 (di chuyển write path) hoàn tất và SPEC-INV-001 phê duyệt.

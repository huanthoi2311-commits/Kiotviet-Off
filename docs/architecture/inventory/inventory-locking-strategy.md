# Inventory — Locking Strategy

> Tài liệu phân tích/thiết kế (T003.5). Không sửa code. Quyết định cuối cùng thuộc `SPEC-INV-001`.

## 1. Quyết định cần đưa ra: Optimistic hay Pessimistic Lock, khi nào dùng cái nào

## 2. Hiện trạng: 2 chuẩn khác nhau đang tồn tại song song

| Hàm | Cơ chế | Chi tiết |
|---|---|---|
| `recordSaleMovement()` (Checkout/POS) | **Optimistic Lock** | `updateMany({ where: { warehouseId, productId, quantity: beforeQuantity }, data: {...} })` — nếu `count === 0`, nghĩa là `quantity` đã bị transaction khác đổi giữa lúc đọc và lúc ghi → ném `InventoryConcurrencyConflictError` thay vì ghi đè mù |
| `recordMovement()` + toàn bộ 5 module trực tiếp (`purchase-order`, `purchase-return`, `transfer`, `stock-count`, `inventory-adjustment`) | **Không khóa gì cả** | `findUnique` đọc, tính toán, rồi `upsert` — kinh điển read-modify-write race condition, có thể mất-cập-nhật (lost update) nếu 2 transaction chạy chen nhau trên cùng `(warehouseId, productId)` |

Đây là bất đối xứng nghiêm trọng nhất mà T003.5 phát hiện: **6/7 con đường ghi Inventory hôm nay không có bảo vệ concurrency nào**, chỉ Checkout (module mới nhất, Prompt 035) được bảo vệ. Kịch bản cụ thể minh họa hậu quả ở [[inventory-concurrency]].

## 3. Vì sao compare-and-swap (`updateMany WHERE quantity = X`) hoạt động đúng dưới READ COMMITTED

Postgres/Prisma trong dự án này chạy ở mức cô lập mặc định READ COMMITTED (không có cấu hình `SERIALIZABLE` ở đâu trong `PrismaService`). Điểm mấu chốt kỹ thuật cần ghi rõ: **câu lệnh `UPDATE` (kể cả bên trong `updateMany`) luôn tự khóa hàng nó chạm vào VÀ tái kiểm tra mệnh đề `WHERE` với dữ liệu mới nhất đã commit tại thời điểm UPDATE thực thi** — không phải dữ liệu tại thời điểm transaction bắt đầu. Vì vậy, nếu transaction A đọc `quantity = 10` và commit trước (đổi thành 9), thì khi transaction B chạy `updateMany WHERE quantity = 10` sau đó, Postgres sẽ thấy giá trị THẬT hiện tại là 9, không khớp `WHERE`, nên `count = 0` — B phát hiện đúng conflict dù B đã đọc giá trị cũ TRƯỚC KHI A commit.

Kết luận: pattern compare-and-swap hiện tại KHÔNG cần nâng isolation level lên SERIALIZABLE để an toàn — nó đã đúng dưới READ COMMITTED, miễn là MỌI bên ghi cùng tuân theo compare-and-swap (một bên có lock, một bên không có, thì bên không có lock vẫn có thể ghi đè mù lên bên có lock — xem [[inventory-concurrency]] Case 2).

## 4. Đề xuất: Optimistic Lock làm mặc định cho MỌI đường ghi Inventory

**Khuyến nghị (không phải quyết định cuối):** tổng quát hóa đúng cơ chế compare-and-swap của `recordSaleMovement()` vào hàm ghi dùng chung cho cả 9 loại `movementType`, không chỉ riêng SALE.

**Lý do:**
- Tồn kho là dữ liệu "hot" — sản phẩm bán chạy có thể bị nhiều thao tác (bán tại nhiều quầy, nhập hàng, điều chỉnh) chạm vào gần như đồng thời trong giờ cao điểm, nhưng XÁC SUẤT XUNG ĐỘT THẬT trên đúng 1 sản phẩm tại đúng 1 thời điểm vẫn thấp so với tổng lưu lượng — đây là đặc điểm kinh điển "low contention, high throughput", nơi Optimistic Lock hiệu quả hơn Pessimistic Lock (không tốn chi phí giữ khóa hàng khi phần lớn thao tác không xung đột).
- Codebase hiện tại **không có bất kỳ `SELECT ... FOR UPDATE` nào** ở bất kỳ module nào — Pessimistic Lock chưa từng là idiom được dùng trong dự án. Optimistic Lock nhất quán với phong cách đã có.
- Chi phí triển khai thấp — pattern đã tồn tại sẵn, chỉ cần tổng quát hóa (không phải xây từ đầu).

## 5. Khi nào Pessimistic Lock (`SELECT ... FOR UPDATE`) mới đáng cân nhắc

Đề xuất: **không dùng làm mặc định**, chỉ cân nhắc cho các trường hợp hẹp, cụ thể, nơi retry-storm của Optimistic Lock tệ hơn chi phí khóa:

- **Batch nhiều dòng trong 1 transaction lớn** — ví dụ Purchase Receive với hàng trăm dòng hàng: nếu dùng Optimistic Lock, 1 dòng bị conflict giữa chừng sẽ làm ROLLBACK TOÀN BỘ transaction (bao gồm hàng trăm dòng đã tính toán xong), phải retry lại từ đầu toàn bộ — tốn kém hơn nhiều so với khóa trước các hàng liên quan rồi ghi tuần tự. Đây là ứng viên hợp lý nhất cho Pessimistic Lock, nhưng KHÔNG cấp thiết ở quy mô dữ liệu hiện tại.
- **Stock Count có yêu cầu "khóa sản phẩm khỏi biến động khác trong lúc đếm"** (xem [[inventory-domain-model]] §4.2 và [[inventory-concurrency]] Case 5) — nếu SPEC-INV-001 quyết định nghiệp vụ THỰC SỰ cần "đóng băng" một tập sản phẩm trong lúc kiểm kê, đó là use case chính đáng cho Pessimistic Lock (khóa các hàng `Inventory` liên quan khi `StockCount` chuyển sang `COUNTING`, giữ khóa tới khi `complete()`) — nhưng đây là quyết định nghiệp vụ (có chấp nhận chặn thao tác khác trong lúc đếm không), không phải quyết định kỹ thuật thuần túy.

**[OPEN QUESTION cho SPEC-INV-001]:** Có cần Pessimistic Lock cho 1 trong 2 trường hợp trên không, hay Optimistic Lock + retry ở tầng gọi là đủ cho quy mô hiện tại?

## 6. Chính sách khi phát hiện conflict: fail-fast, không tự động retry

Hiện tại (Checkout): khi `InventoryConcurrencyConflictError` bị ném, nó lan thẳng lên caller — KHÔNG có auto-retry ở bất kỳ tầng nào (Repository/Service/Controller). Người dùng (thu ngân) nhận lỗi và phải thao tác lại thủ công.

**Khuyến nghị:** giữ nguyên "fail-fast, báo lỗi cho caller" làm mặc định cho các luồng có người dùng trực tiếp đứng chờ (Checkout, và tương lai các luồng tương tác trực tiếp khác) — tự động retry ở tầng hạ tầng có thể che giấu tình trạng tranh chấp thật (ví dụ 1 sản phẩm liên tục bị over-sold do lỗi thiết kế khác) đằng sau một retry loop vô hình. Với các luồng chạy nền/không có người dùng chờ trực tiếp (ví dụ một tác vụ đối soát tồn kho tự động tương lai), retry có giới hạn số lần (bounded retry) có thể hợp lý hơn — nhưng đây là quyết định riêng cho từng luồng cụ thể khi luồng đó được xây, không phải quy tắc chung áp cho toàn bộ Inventory.

## 7. Gap liên quan: chưa có idempotency key cho `InventoryMovement`

Nếu caller nhận `InventoryConcurrencyConflictError` rồi retry đúng thao tác nghiệp vụ (ví dụ Checkout Service tự thử lại toàn bộ `checkout()` sau khi conflict), không có gì trong `InventoryMovement` ngăn việc ghi trùng 2 dòng Movement cho cùng 1 sự kiện nghiệp vụ nếu tầng gọi retry sai cách (gọi lại từ giữa chừng thay vì từ đầu transaction). Hiện tại không phải vấn đề vì KHÔNG CÓ auto-retry nào tồn tại (mục 6) — nhưng nếu SPEC-INV-001 sau này quyết định thêm auto-retry cho bất kỳ luồng nào, cần thiết kế idempotency key đi kèm (ví dụ `referenceId` + `movementType` unique constraint có điều kiện). Ghi nhận làm điểm cần nhớ, không giải quyết trong T003.5.

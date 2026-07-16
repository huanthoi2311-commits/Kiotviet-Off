# Inventory — Concurrency Test Cases

> Tài liệu phân tích/thiết kế (T003.5). Không sửa code, không viết test thật. Các case dưới đây là kịch bản THIẾT KẾ cần được hiện thực thành test tích hợp thật khi T004 code — mục tiêu ở đây là xác định rõ **hành vi đúng kỳ vọng** trước khi viết code, theo đúng yêu cầu SPEC.

Quy ước bảng: **Hiện trạng** = hành vi thật của code hôm nay (đã verify). **Target** = hành vi kỳ vọng sau khi T004 tổng quát hóa Optimistic Lock cho toàn bộ 6 đường ghi (theo đề xuất ở [[inventory-locking-strategy]]).

## Case 1 — Hai Checkout đồng thời bán cùng 1 sản phẩm/kho (tranh nhau đơn vị cuối cùng)

**Kịch bản:** Thu ngân A và thu ngân B cùng bán sản phẩm X tại kho Y, tồn kho hiện chỉ còn 1 đơn vị, cả hai bấm thanh toán gần như cùng lúc.

- **Hiện trạng:** cả hai đi qua `recordSaleMovement()` (đã có Optimistic Lock). Giao dịch nào `updateMany WHERE quantity = beforeQuantity` chạy trước và commit trước sẽ thành công. Giao dịch còn lại, khi `updateMany` của nó thực thi, thấy `quantity` thực tế đã đổi (không còn khớp `beforeQuantity` nó đọc) → `count = 0` → ném `InventoryConcurrencyConflictError` → toàn bộ transaction Checkout đó rollback (Invoice/Payment vừa tạo trong cùng tx cũng bị hủy) → thu ngân thua nhận lỗi, phải thử lại (sẽ thấy hết hàng).
- **Đánh giá:** ✅ Đã đúng hôm nay — không cần sửa gì.

## Case 2 — Checkout đồng thời với Purchase Receive trên cùng sản phẩm/kho

**Kịch bản:** Thu ngân đang bán sản phẩm X (trừ kho) đúng lúc kho đang nhập thêm hàng X (cùng kho).

- **Hiện trạng:** Checkout có lock, Purchase Receive KHÔNG có lock (đọc `findUnique` rồi `upsert` mù). Kết quả phụ thuộc thứ tự interleaving:
  - Nếu Purchase Receive đọc `quantity` TRƯỚC khi Checkout commit, rồi Purchase Receive `upsert` SAU khi Checkout đã commit → **Purchase Receive ghi đè lên kết quả của Checkout bằng một `afterQuantity` tính từ `beforeQuantity` đã LỖI THỜI** → mất bản cập nhật của Checkout trong bảng `Inventory` (dù dòng `InventoryMovement` của Checkout vẫn được ghi đúng — ledger không sai, nhưng snapshot `Inventory.quantity` sai, không còn khớp tổng các Movement). Đây chính là **lost update bug** mà Prompt A01 cảnh báo ở mức kiến trúc, giờ được chỉ rõ bằng kịch bản cụ thể.
  - Nếu chiều ngược lại (Checkout đọc/ghi sau khi Purchase Receive đã commit) → Checkout's `updateMany WHERE quantity = X` sẽ tự phát hiện sai khớp (vì Purchase Receive đã đổi `quantity`) → Checkout đúng, tự rollback, thu ngân retry. Chiều này AN TOÀN vì Checkout có lock.
  - **Kết luận:** rủi ro là MỘT CHIỀU — chỉ khi bên không có lock (Purchase Receive) ghi ĐÈ SAU bên có lock (Checkout) mới sinh lỗi im lặng. Đây là lý do vì sao "1 trong 2 bên có lock" là KHÔNG ĐỦ — phải CẢ HAI bên cùng dùng compare-and-swap thì đảm bảo mới đúng trong mọi thứ tự interleaving.
- **Target (sau khi tổng quát hóa lock cho Purchase Receive):** dù thứ tự interleaving thế nào, bên nào `updateMany` commit trước thắng; bên còn lại luôn phát hiện đúng conflict và rollback toàn bộ, không có lost update ở bất kỳ chiều nào.

## Case 3 — Transfer OUT đồng thời với Checkout trên cùng sản phẩm/kho nguồn

**Kịch bản:** Kho A vừa duyệt phiếu điều chuyển (trừ kho A) đúng lúc một thu ngân tại kho A bán cùng sản phẩm đó.

- **Hiện trạng:** giống hệt Case 2 (Transfer OUT cũng không có lock) — CỘNG THÊM một gap khác: Transfer OUT hoàn toàn không kiểm tra `allowNegativeStock` (xem [[inventory-transaction-boundary]] §2). Nếu 2 lượt này cùng chạm vào đơn vị tồn kho cuối cùng, khả năng cả hai đều "thành công" theo góc nhìn của chính chúng (do một bên ghi đè bên kia) là có thật, và tổng số âm kho có thể xảy ra mà không ai phát hiện.
- **Target:** Transfer OUT cần (a) Optimistic Lock giống Case 2, VÀ (b) negative-stock check giống Return/Adjustment — 2 thay đổi cộng dồn để đóng gap này hoàn toàn (xem [[inventory-migration-plan]] mục Transfer).

## Case 4 — Kịch bản 3 chiều của SPEC: Checkout + Purchase Receive + Transfer OUT cùng lúc trên 1 sản phẩm

**Kịch bản (nguyên văn yêu cầu):** Thu ngân A bán hàng + một phiếu Nhập hàng + một phiếu Điều chuyển, cả ba cùng chạm vào đúng 1 sản phẩm tại cùng 1 thời điểm.

- **Target (giả định cả 3 đường đã dùng Optimistic Lock sau T004):**
  1. Cả 3 transaction đọc `Inventory.quantity` gần như đồng thời (có thể đọc cùng 1 giá trị nếu chưa ai commit).
  2. Transaction nào chạy câu lệnh `updateMany WHERE quantity = X` TRƯỚC (theo thứ tự thực thi thật trên Postgres, không phải thứ tự đọc) sẽ thành công — đây luôn là transaction commit sớm nhất.
  3. Hai transaction còn lại, khi `updateMany` của chúng thực thi, Postgres tái kiểm tra `WHERE` với giá trị MỚI NHẤT đã đổi → cả hai đều `count = 0` → cả hai đều phát hiện đúng conflict → cả hai transaction đều rollback toàn bộ.
  4. Cả 2 caller thua cuộc (ví dụ: Purchase Receive và Transfer) nhận lỗi, phải retry. Khi retry, mỗi bên đọc lại `quantity` MỚI (đã phản ánh kết quả của bên thắng ở bước 2), tính lại, và submit lại — tuần tự áp dụng cho tới khi cả 3 đều thành công.
  5. **Kết quả cuối cùng đúng theo kỳ vọng:** `Inventory.quantity` cuối cùng bằng đúng tổng của giá trị ban đầu cộng dồn cả 3 delta (bán ra, nhập vào, chuyển đi), và tồn tại đúng 3 dòng `InventoryMovement` (hoặc nhiều hơn nếu có retry ghi thêm — LƯU Ý: retry ở đây là caller tự thực hiện lại TOÀN BỘ business transaction từ đầu, không phải chỉ gọi lại bước ghi Inventory, nên không sinh Movement trùng cho lần thất bại — lần thất bại rollback nguyên transaction, không để lại dấu vết trong `InventoryMovement`).
  6. **Chi phí chấp nhận được:** tối đa 2 trong 3 thao tác gặp lỗi và cần thử lại khi tranh chấp thật sự xảy ra (hiếm, chỉ khi đúng cùng sản phẩm/kho/thời điểm) — đây là đánh đổi hợp lý cho POS/ERP, ưu tiên đúng dữ liệu hơn là tránh mọi lỗi hiển thị cho người dùng. Không nên "sửa" bằng cách nới lỏng kiểm tra để tránh lỗi hiển thị — điều đó sẽ tái tạo lại chính bug lost-update ở Case 2.

## Case 5 — Stock Count hoàn tất trong lúc có Sale xảy ra giữa lúc đang đếm

**Kịch bản:** Phiếu kiểm kê được tạo lúc 8:00 (chụp `systemQty`), nhân viên đếm hàng vật lý tới 10:00 mới hoàn tất — trong khoảng đó, cửa hàng vẫn bán hàng bình thường trên sản phẩm đang được kiểm kê (không có gì khóa/chặn — xem [[inventory-transaction-boundary]] §6).

- **Hiện trạng:** `complete()` đọc `Inventory.quantity` MỚI NHẤT (không dùng `systemQty` cũ) để tính `beforeQuantity`/`afterQuantity` thật khi ghi Movement — nên **số học của `Inventory.quantity` cuối cùng luôn đúng** (không có lost update ở khía cạnh này, vì `complete()` tự nó không có xung đột đọc-ghi với các Sale khác nếu tổng quát hóa lock — xem thêm bên dưới). NHƯNG `StockCountItem.difference` (được tính = `actualQty` người dùng đếm − `systemQty` CHỤP LÚC TẠO PHIẾU lúc 8:00, không phải so với tồn kho ngay trước khi hoàn tất lúc 10:00) có thể mang ý nghĩa SAI: một phần "chênh lệch" đó thực chất là do các đơn bán hợp lệ diễn ra trong lúc đếm (8:00-10:00), bị gộp nhầm vào "thất thoát tồn kho" khi báo cáo cho người dùng.
- **Target:** bản thân việc ghi Inventory ở `complete()` cần Optimistic Lock như mọi đường ghi khác (đề phòng 1 Sale khác chạy ĐÚNG lúc `complete()` đang chạy, tranh nhau `updateMany`) — điều này xử lý đúng phần SỐ HỌC. Nhưng vấn đề Ý NGHĨA của `difference` là **câu hỏi nghiệp vụ, không phải câu hỏi kỹ thuật** — không có cách sửa thuần kỹ thuật nào làm `difference` "đúng" hơn nếu nghiệp vụ không quyết định có nên khóa sản phẩm khỏi bán/nhập trong lúc đếm hay không.
- **[OPEN QUESTION cho SPEC-INV-001]:** chấp nhận `difference` có thể lệch ý nghĩa nếu có biến động xen giữa (rồi diễn giải rõ trong UI/report là "chênh lệch tại thời điểm tạo phiếu, không phải thời điểm hoàn tất"), hay bắt buộc khóa sản phẩm (Pessimistic Lock, xem [[inventory-locking-strategy]] §5) trong suốt quá trình đếm?

## Case 6 — Không có Reservation: 2 thu ngân cùng dựng giỏ hàng chứa đơn vị tồn kho cuối cùng

**Kịch bản:** Chỉ còn 1 đơn vị sản phẩm X. Thu ngân A và B đều thêm X vào giỏ hàng của khách (Cart Engine, Prompt 033) gần như đồng thời — cả hai giỏ hàng đều "hợp lệ" tại thời điểm thêm vào giỏ, vì Cart không kiểm tra/giữ chỗ tồn kho (không có `InventoryReservation`, xem [[inventory-domain-model]] §4.2).

- **Hiện trạng:** không có gì ngăn cả A và B tiếp tục toàn bộ quy trình bán hàng (chọn khách hàng, áp dụng khuyến mãi, tính tiền...) cho tới tận bước Checkout commit. Chỉ tại bước CUỐI CÙNG đó, Optimistic Lock của `recordSaleMovement()` mới phát huy tác dụng — một trong hai sẽ thất bại. Về mặt DỮ LIỆU, kết quả vẫn đúng (không bao giờ bán vượt quá tồn kho thật). Nhưng về mặt TRẢI NGHIỆM, người thua có thể đã dẫn khách qua toàn bộ quy trình thanh toán rồi mới biết hết hàng ở bước cuối — trải nghiệm kém, dù dữ liệu không sai.
- **Target:** đây chính là use case kinh điển của `InventoryReservation` (giữ chỗ ngay khi thêm vào giỏ, timeout tự giải phóng) — nằm ngoài phạm vi T004 (T004 chỉ xử lý 5 module ghi trực tiếp). Ghi nhận làm input cho SPEC Reservation tương lai, không giải quyết ở đây.

## Tổng kết

| Case | Vấn đề chính | Sửa bằng gì | Thuộc phạm vi T004? |
|---|---|---|---|
| 1 | — (đã đúng) | — | — |
| 2, 3, 4 | Lost update do thiếu lock ở 1/nhiều bên | Tổng quát hóa Optimistic Lock cho cả 6 đường ghi | ✅ Có |
| 3 (phần negative-stock) | Transfer OUT không chặn âm kho | Thêm check, cần SPEC duyệt vì đổi hành vi nghiệp vụ | ✅ Có (cần SPEC xác nhận) |
| 5 | `difference` lệch ý nghĩa nếu có biến động xen giữa lúc đếm | Câu hỏi nghiệp vụ — SPEC quyết định khóa hay chấp nhận | ❌ Không — cần SPEC riêng |
| 6 | Không có giữ chỗ ở tầng Cart | Xây `InventoryReservation` | ❌ Không — cần SPEC riêng |

# Implementation Report — Prompt 030: Purchase Report Module

**Ngày:** 2026-07-14
**Phạm vi:** Sinh toàn bộ báo cáo nhập hàng — theo Supplier/Product/Warehouse/Month/User/Category. Dashboard: Total Purchase, Top Supplier, Top Product, Average Cost, Monthly Purchase. Export: Excel/CSV/PDF. Acceptance: 100.000 Purchase phải xử lý <3s. Đây là Prompt cuối cùng trong loạt Purchase (026-030).

## 1. Quyết định thiết kế quan trọng nhất: mọi truy vấn là SQL aggregation, không có ngoại lệ

Đây là Prompt đầu tiên trong toàn bộ dự án có **acceptance criterion định lượng về hiệu năng** ("100.000 Purchase phải xử lý <3s"). Quyết định kiến trúc bao trùm toàn bộ module: **không bao giờ tải `PurchaseOrder`/`PurchaseItem` thô về Node rồi cộng dồn bằng JavaScript** — mọi con số (Total Purchase, breakdown theo 6 chiều, Average Cost) đều được tính bằng `SUM`/`COUNT`/`GROUP BY` chạy trực tiếp trong Postgres, Node chỉ nhận về đúng số dòng kết quả đã gộp (tối đa vài trăm dòng — bằng số lượng Supplier/Product/Kho/Tháng/User/Category phân biệt, không phụ thuộc số lượng Purchase Order). Đây là điều kiện *cần* (không phải *đủ* — còn cần index đúng và Postgres thật để đo) để đạt được mốc <3s.

- **2/6 chiều (Product, Warehouse, Category) và cả Average Cost cần join qua `PurchaseItem`** — Prisma's `groupBy` không hỗ trợ group theo field của bảng liên kết (vd. `Product.categoryId` khi group trên `PurchaseItem`) và không hỗ trợ biểu thức (`date_trunc` cho Month). Vì vậy **cả 6 chiều đều dùng `$queryRaw` với `Prisma.sql` tagged-template** (tự động tham số hóa, chống SQL injection) thay vì trộn lẫn Prisma `groupBy` cho một số chiều và raw SQL cho số còn lại — giữ 1 pattern nhất quán, dễ kiểm chứng.
- **Thêm 1 index tổng hợp mới**: `@@index([organizationId, status, createdAt])` trên `PurchaseOrder` — mọi câu truy vấn báo cáo đều lọc theo đúng 3 điều kiện này (tổ chức + chỉ tính đơn RECEIVED/COMPLETED + khoảng thời gian/group theo tháng) trước khi join sang `PurchaseItem`. Migration chỉ `CREATE INDEX`, không đổi dữ liệu — an toàn tuyệt đối.
- **Chỉ tính đơn `RECEIVED`/`COMPLETED`** — đơn `DRAFT`/`PENDING`/`APPROVED` chưa có Movement thật (chưa thực sự "nhập hàng"), đơn `CANCELLED` không có giá trị nhập hàng thực tế. Đây là diễn giải hợp lý nhất của "báo cáo nhập hàng" (phải phản ánh hàng đã thực nhận, không phải đơn đang treo).
- **Không thể tự benchmark 100.000 dòng trong sandbox này** (không có Docker/PostgreSQL, cùng giới hạn đã disclose xuyên suốt từ Prompt 016) — đã đảm bảo tính đúng đắn về mặt THIẾT KẾ truy vấn (aggregation ở tầng DB, index đúng cột lọc) thay vì đo đạc thực tế; đây là phần có thể chuẩn bị tốt nhất trong điều kiện không có môi trường thật.

## 2. Quyết định thiết kế khác

1. **1 endpoint `breakdown?groupBy=` linh hoạt thay vì 6 endpoint riêng** (`/by-supplier`, `/by-product`, ...) — Prompt 030 không cho danh sách API cụ thể nào (khác mọi Prompt trước), nên tự thiết kế. 6 endpoint gần như giống hệt nhau (cùng response shape, cùng filter) sẽ nhân bản code 6 lần không cần thiết — 1 endpoint tham số hóa bằng enum `groupBy` (SUPPLIER/PRODUCT/WAREHOUSE/MONTH/USER/CATEGORY) đáp ứng đúng yêu cầu "theo Supplier/Product/Warehouse/Month/User/Category" với 1 lượng code tối thiểu.
2. **`GET /purchase-reports/dashboard`** tổng hợp đúng 5 chỉ số Prompt liệt kê: Total Purchase (`totalAmount`+`totalOrders`), Top Supplier (`topSuppliers`, top 5), Top Product (`topProducts`, top 5), Average Cost (`averageCost` — bình quân gia quyền `SUM(quantity×unitCost)/SUM(quantity)`, không lẫn discount/tax để phản ánh đúng giá vốn thuần), Monthly Purchase (`monthlyPurchase`, 12 tháng gần nhất). `getDashboard()` **ủy quyền cho chính `getBreakdown()`** của cùng repository (không viết lại logic Supplier/Product/Month lần nữa) — chỉ 2 truy vấn scalar bổ sung (totals, averageCost).
3. **`GET /purchase-reports/export` không phân trang** — luôn xuất TOÀN BỘ dòng khớp filter (giới hạn kỹ thuật `limit=100000` chỉ để phòng hờ, không phải giá trị thực tế sẽ đạt tới — số dòng xuất ra bị chặn trên bởi số lượng Supplier/Product/... phân biệt của 1 tổ chức, gần như luôn nhỏ hơn nhiều so với số Purchase Order).
4. **Export dùng 1 port `IPurchaseReportExportPort` với 3 method** (`buildExcel`/`buildCsv`/`buildPdf`) thay vì 3 port riêng — cả 3 định dạng cùng phục vụ 1 khái niệm (xuất breakdown ra file), khác với Supplier Excel (Prompt 026) chỉ có 1 định dạng nên chỉ cần 1 port/1 method. `exceljs` (đã có từ Prompt 026) tái sử dụng cho Excel; CSV không cần thư viện (string thuần, có escape dấu phẩy/ngoặc kép, thêm BOM UTF-8 để Excel hiển thị đúng dấu tiếng Việt khi mở); **PDF cần thư viện mới `pdfkit`** — được chính Prompt 030 ủy quyền trực tiếp qua "Export: Excel/CSV/PDF", không vi phạm "Đóng băng phạm vi".
5. **Không thêm permission mới** — tái dùng nguyên trạng `report:view` (dashboard + breakdown) và `report:export` (export) đã có sẵn trong catalog Foundation (Prompt 015), đúng mô tả sẵn có ("Xem báo cáo", "Xuất báo cáo") — cùng mẫu tái dùng đã áp dụng ở Prompt 029.
6. **Không có Entity/bảng DB mới** — toàn bộ dữ liệu đọc từ `PurchaseOrder`/`PurchaseItem`/`Supplier`/`Product`/`Warehouse`/`Category`/`User` đã có sẵn từ Prompt 026-029. `PurchaseReportBreakdownItemEntity`/`PurchaseReportDashboardEntity` là read-model thuần túy (tương tự `SupplierDebtEntity` ở Prompt 029), không có bảng tương ứng.

## 3. Chức năng đã hoàn thành

- **`GET /purchase-reports/dashboard`**: Total Purchase, Top Supplier (5), Top Product (5), Average Cost, Monthly Purchase (12 tháng), lọc theo khoảng ngày tùy chọn.
- **`GET /purchase-reports/breakdown?groupBy=`**: phân tích theo 1 trong 6 chiều, phân trang, lọc theo khoảng ngày.
- **`GET /purchase-reports/export?groupBy=&format=`**: xuất Excel (.xlsx)/CSV/PDF, tự đặt tên file theo chiều đã chọn.

## 4. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/purchase-report/` (không có `application/dto` cho update/create vì module chỉ đọc, không có `infrastructure/generators` vì không có mã nghiệp vụ nào cần sinh): domain (2 entity — `PurchaseReportBreakdownItemEntity`/`PurchaseReportDashboardEntity`, repository interface, export port interface), application (3 DTO + spec, mapper, service + spec), infrastructure (Prisma repository dùng `$queryRaw`/`Prisma.sql` cho cả 6 chiều + dashboard + spec, `PurchaseReportExportAdapter` — 1 adapter cho cả 3 định dạng + spec real round-trip giống mẫu Supplier Excel), presentation (1 controller (3 route) + spec), `purchase-report.module.ts`.
**Tạo mới khác**: `backend/test/purchase-report.e2e-spec.ts`, migration `20260714140000_purchase_report_index`.
**Sửa**: `schema.prisma` (+1 index tổng hợp trên `PurchaseOrder`), `app.module.ts` (đăng ký `PurchaseReportModule`), `package.json`/`package-lock.json` (+`pdfkit`, +`@types/pdfkit`).
**Không sửa**: `error-codes.ts` (module chỉ đọc/export, không có domain error nào cần mã riêng — kết quả rỗng là hợp lệ, không phải lỗi), `permission-catalog.ts` (tái dùng nguyên trạng `report:view`/`report:export`).

## 5. Phụ thuộc mới

- **`pdfkit@^0.15.0`** (runtime) + **`@types/pdfkit@^0.13.0`** (dev) — được Prompt 030 ủy quyền trực tiếp ("Export: Excel/CSV/PDF"). `npm audit` xác nhận **không phát sinh lỗ hổng mới** — chỉ còn đúng 2 lỗ hổng `uuid` (qua `exceljs`) đã disclose từ Prompt 026, không liên quan `pdfkit`.

## 6. Migration

`20260714140000_purchase_report_index`: chỉ `CREATE INDEX` (`organizationId, status, createdAt` trên `purchase_orders`) — không đổi dữ liệu/cột/bảng nào, an toàn tuyệt đối với dữ liệu hiện có.

## 7. API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/purchase-reports/dashboard` | `report:view` |
| GET | `/api/v1/purchase-reports/breakdown` | `report:view` |
| GET | `/api/v1/purchase-reports/export` | `report:export` |

## 8. Test

- **Unit**: **739/739 PASS** toàn backend (tăng từ 702 sau Prompt 029). Purchase-report-specific (37 test): `PurchaseReportService` (dashboard map filter+organizationId, breakdown map query+page/limit mặc định, export — đúng contentType/extension cho cả 3 định dạng, luôn gọi `getBreakdown` với `limit=100000` không phân trang), `PrismaPurchaseReportRepository` (breakdown — map đúng entity Decimal→string/bigint→number, nhãn mặc định khi null, **cả 6 dimension đều chạy được** (`it.each`), áp dụng đúng date filter vào câu SQL; dashboard — ủy quyền đúng cho `getBreakdown` với `groupBy`/`limit` tương ứng, xử lý đúng khi chưa có dữ liệu (totals/averageCost null→0)), `PurchaseReportExportAdapter` (**Excel dùng exceljs thật** — round-trip build→load đúng dữ liệu, magic bytes ZIP; **CSV** — escape đúng dấu phẩy/ngoặc kép, xử lý danh sách rỗng; **PDF dùng pdfkit thật** — magic bytes `%PDF`, vẫn hợp lệ khi danh sách rỗng), controller (permission metadata 3 route, export gửi đúng header), DTO validation (groupBy/format bắt buộc và đúng enum, dateFrom/dateTo đúng ISO 8601).
- **Coverage** (`purchase-report/`, loại trừ `.module.ts`): **97.29% statement, 91.89% function, 97.09% line, 87.17% branch** — vượt mốc 90% yêu cầu ở statement/function/line.
- **Integration**: `test/purchase-report.e2e-spec.ts` — tạo 2 Purchase Order RECEIVED thật (10×8000 + 5×10000 = 130.000) qua HTTP thật; **Dashboard** xác nhận đúng `totalAmount`=130000, `totalOrders`=2, `averageCost`≈8666.67 (bình quân gia quyền), `topSuppliers[0]` đúng NCC; **Breakdown** đúng cho cả 6 chiều (Supplier/Warehouse/Product/Category/Month/User) — mỗi chiều xác nhận đúng `code`/`totalAmount`/`totalQuantity`/`orderCount` thật; **Export** cả 3 định dạng — Excel (magic bytes PK + Content-Type spreadsheetml), CSV (Content-Type text/csv + chứa đúng mã NCC), PDF (magic bytes `%PDF` + Content-Type application/pdf), dùng `supertest.buffer(true).parse(...)` để nhận đúng dữ liệu nhị phân cho Excel/PDF (cùng kỹ thuật đã dùng ở Prompt 026). **Chưa xác nhận PASS thật, và đặc biệt CHƯA benchmark được acceptance criterion "100.000 Purchase <3s"** — sandbox không có Docker/PostgreSQL, cùng giới hạn Gate B đã disclose từ Prompt 016; đã bù đắp bằng thiết kế truy vấn (SQL aggregation + index đúng cột) thay vì đo đạc thực tế.
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 9. Self-Review

- **Không TODO/FIXME/console.log/`any`** — `grep` xác nhận rỗng trong `src/modules/purchase-report/`.
- **Architecture Review**: `exceljs`/`pdfkit` bị cô lập hoàn toàn sau `IPurchaseReportExportPort`, domain/application không phụ thuộc chúng — đúng nguyên tắc đã áp dụng cho `exceljs` ở Prompt 026. `$queryRaw`/`Prisma.sql` chỉ xuất hiện trong `infrastructure/persistence/`, domain layer không biết SQL thô tồn tại. `PurchaseReportModule` không phụ thuộc module Purchase nào khác (không cần — chỉ đọc trực tiếp qua Prisma) — module cuối cùng của loạt, dependency graph vẫn phẳng.
- **Security Review**: mọi truy vấn raw SQL dùng `Prisma.sql` tagged-template (tự động tham số hóa `organizationId`/`dateFrom`/`dateTo`/`limit`/`offset` — không có chuỗi nối tay nào chứa giá trị người dùng, loại trừ SQL injection); mọi truy vấn lọc `organizationId` (multi-tenant isolation giữ nguyên dù dùng raw SQL).
- **Performance Review (trọng tâm của Prompt này)**: mọi phép tính là SQL aggregation, không có N+1, không có tải-toàn-bộ-rồi-cộng-dồn-bằng-JS ở bất kỳ đâu; thêm index tổng hợp đúng cột lọc chính. Đây là cách chuẩn bị tốt nhất có thể cho acceptance criterion "100.000 Purchase <3s" khi không có môi trường Postgres thật để đo — rủi ro còn lại (nếu có) chỉ có thể phát hiện qua benchmark thực tế, đã disclose minh bạch.
- **Data correctness**: `totalAmount` mọi chiều đều tính từ `SUM(PurchaseItem.totalAmount)` (nhất quán với cách `PurchaseOrder.totalAmount` được tính từ Prompt 027 — tổng các dòng hàng), không trộn lẫn cách tính giữa các chiều.

**Definition of Done đạt được** (trừ Integration Test PASS thật và benchmark 100k-dòng — cả hai bị chặn bởi hạ tầng không có sẵn trong sandbox, đã disclose rõ). **Đây là báo cáo khép lại toàn bộ loạt Prompt 026-030 (Supplier → Purchase Order → Purchase Return → Supplier Debt → Purchase Report)** — 5 module liên tiếp cùng chia sẻ một nền tảng nhất quán: Inventory ledger (Prompt 022-025) làm nguồn sự thật cho tồn kho, Debt/Payment ledger (khởi động từ Prompt 028, hoàn thiện ở 029) làm nguồn sự thật cho công nợ, và giờ Purchase Report tổng hợp toàn bộ dữ liệu đó thành báo cáo — không có bất kỳ con số trung gian/cache nào được lưu ở bất kỳ đâu trong toàn chuỗi.

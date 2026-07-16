# Default Decisions — Áp dụng không cần hỏi lại

**Mục đích:** Danh sách các quyết định kỹ thuật đã được xác nhận NHẤT QUÁN từ 3 module trở lên (Product/Category/Brand/Unit) — Claude Code được phép **tự áp dụng trực tiếp** trong RFC/SPEC/Implementation Plan/Code cho module Master Data mới (Barcode/Attribute/Variant), **không cần đặt lại thành câu hỏi mở** chờ Architecture Review riêng cho từng mục.

**Đây KHÔNG phải bypass Specification First.** RFC/SPEC vẫn phải NÊU RÕ các mặc định này được áp dụng (để Architect thấy và có thể phản đối nếu module cụ thể cần khác) — chỉ là không cần đóng khung dưới dạng "phương án trung lập chờ quyết định" (khác cách RFC-0004/Unit từng làm theo Decision U10). Nếu Architect không phản đối trong Architecture Review, mặc định coi là xác nhận.

**Chỉ tổng hợp từ Decision đã APPROVED trước đó — không tạo quy tắc mới.**

---

## Được phép tự áp dụng

1. **Aggregate Root Master Data mặc định có `version`** (Optimistic Lock). Áp dụng trực tiếp trong SPEC, không cần hỏi "có cần Optimistic Lock không". *(4/4 module: Product/Category/Brand/Unit.)*

2. **Query Convention cố định**: `page`, `limit`, `search`, `sortBy`, `sortOrder`, `status`, `isActive`. Không đặt tên khác (`pageSize`/`sort`). `parentId` CHỈ thêm nếu module có cấu trúc cây — không mặc định. *(3/3 lần xác nhận Category→Brand→Unit, không đổi.)*

3. **`isActive` là filter alias cho `status`, không tạo cột schema mới** — trừ khi RFC nêu rõ lý do nghiệp vụ thật cần tách biệt (nguyên tắc "Business First, Consistency Second"). *(Xác nhận chuẩn chung từ Decision SU04 — "trở thành chuẩn cho toàn bộ Master Data".)*

4. **Restore (khi module có) luôn set `status = INACTIVE`**, không bao giờ trực tiếp `ACTIVE`. *(4/4 module có Restore: Product/Category/Brand/Unit.)*

5. **Không tạo `XxxDomainService` khi chưa có consumer thật** (YAGNI, ADR-0010) — chỉ tạo khi Dependency Audit xác nhận có module khác thật sự cần đọc, và chỉ thêm đúng method thật cần dùng. *(Xác nhận 3 lần: Category/Brand/Unit đều audit ra 0 consumer.)*

6. **Soft Delete luôn set `deletedAt`**; set thêm `status = <giá trị terminal>` CHỈ NẾU status enum của module có giá trị đó (không phải mọi module — Brand's `CommonStatus` không có). Đây là hệ quả kỹ thuật của mục #9 bên dưới (hình dạng `status`), không phải 1 mặc định tách biệt cần hỏi thêm.

7. **`version` không xuất hiện trên `CreateDto`** (mặc định `1` ở Repository) — chỉ xuất hiện, **bắt buộc**, trên `UpdateDto`.

8. **Optimistic Lock KHÔNG áp dụng cho `GET`/`LIST`/`RESTORE`/`ARCHIVE`** — chỉ `PATCH`.

9. **`CreateDto`/`UpdateDto` không nhận giá trị `status` "terminal"** (vd `ARCHIVED`) trực tiếp — giá trị đó chỉ đạt được qua `DELETE` (có guard). Áp dụng khi module có status shape hỗ trợ giá trị terminal (không áp dụng cho Brand — không có giá trị này).

10. **Coverage ≥ 90% tính theo phạm vi module đang triển khai**, không phải toàn backend. *(Xác nhận qua Decision R01/T007, tái xác nhận UP09/T008 — cùng cách hiểu.)*

11. **Repository method ghi (`update`/`softDelete`/`restore`) lọc `organizationId` trong `where`** — áp dụng cho MODULE MỚI từ T008 trở đi (chuẩn xác lập tại Decision SU03). **Không tự động retro-fit Product/Category/Brand** — 3 module đó chỉ sửa khi tới đúng Sprint riêng, không phải mặc định áp dụng ngược.

12. **Migration: mỗi thay đổi schema độc lập → 1 migration độc lập**, có `rollback.sql`, backfill (nếu có) chỉ 1 bước đơn giản.

13. **4 hook Domain Event no-op** (`onXxxCreated/Updated/Archived/Restored`) — reserve tên, không publish thật. Không cần hỏi có nên thêm hook không — mặc định luôn thêm dạng no-op.

14. **Permission**: `crud(group, label, extra)`, thêm `'restore'` vào `extra` CHỈ KHI module thật có Restore.

---

## KHÔNG thuộc phạm vi mặc định — vẫn phải hỏi/nêu rõ trong RFC mỗi lần

Để tránh hiểu lầm phạm vi tài liệu này, các mục sau **KHÔNG** được tự quyết:

- **Hình dạng `status`** (không dùng `CommonStatus`, enum riêng 3 giá trị, hay enum riêng 4 giá trị có `DRAFT`) — đã có 3 hình dạng khác nhau qua 4 module, chưa có mẫu số chung đủ để làm mặc định.
- **Module có cần Restore hay không** — mặc định #4 chỉ áp dụng CÁCH Restore hoạt động (luôn →`INACTIVE`) khi module ĐÃ được quyết định có Restore, không phải tự động thêm Restore cho mọi module.
- **Cấu trúc phân cấp (cây, `parentId`)** — đặc thù Category, không mặc định cho module khác.
- **RFC authorship** — RFC luôn do Architect soạn, không có ngoại lệ mặc định nào (PROJECT_RULES.md §2, Decision G01-G06) — tài liệu này không thay đổi ranh giới đó.
- **SPEC authorship** — vẫn cần ủy quyền tường minh theo từng trường hợp (Decision G02), tài liệu này không tự động cấp quyền viết SPEC.
- **Bất kỳ thay đổi Business Rule/API/Migration nào ngoài phạm vi các mục đã liệt kê ở trên.**
- **Impact Analysis cụ thể** (module nào bị ảnh hưởng, cần touch gì) — luôn phải làm mới qua Dependency Audit riêng cho từng module, không suy diễn từ module trước.

---

**Cách dùng:** khi soạn RFC/SPEC cho Barcode/Attribute/Variant, với mỗi mục ở "Được phép tự áp dụng", ghi thẳng vào tài liệu dưới dạng đã quyết định (kèm trích dẫn mục tương ứng ở đây), không đặt thành câu hỏi mở. Với mọi mục khác — kể cả mục "trông giống" nhưng không khớp chính xác điều kiện áp dụng — vẫn phải hỏi như quy trình thông thường.

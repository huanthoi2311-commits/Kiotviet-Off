# Status

Accepted

---

# Context

Với kiến trúc Monolithic Modular (ADR-0001), cần 1 layering nhất quán trong MỖI module để: (a) tách logic nghiệp vụ khỏi framework/hạ tầng, (b) test được business rule mà không cần DB thật, (c) cho phép đổi implementation hạ tầng (vd đổi ORM) mà không ảnh hưởng logic nghiệp vụ.

---

# Decision

Mỗi module tuân theo 4 lớp Clean Architecture:

```
Domain
  ↑
Application
  ↑
Infrastructure
  ↑
Presentation
```

Dependency chỉ đi vào trong (Presentation → Application → Domain; Infrastructure implement interface của Domain nhưng Domain không biết Infrastructure tồn tại — Dependency Inversion).

---

# Consequences

**Ưu điểm**
- Domain/Application test được bằng cách mock Repository interface — không cần DB thật, test nhanh, ổn định (không giòn theo trạng thái DB).
- Đổi Prisma sang ORM khác (giả định) chỉ ảnh hưởng tầng Infrastructure, Domain/Application không đổi.
- Logic nghiệp vụ tập trung ở Domain/Application, dễ tìm, dễ review đúng-sai nghiệp vụ mà không lẫn chi tiết kỹ thuật.

**Nhược điểm**
- Nhiều file/thư mục hơn so với cách viết gộp 1 Service làm hết (Transaction Script).
- Người mới cần hiểu quy ước 4 lớp trước khi đóng góp code hiệu quả.

**Ảnh hưởng**
- Áp dụng nhất quán 25/25 module hiện có, trừ 2 ngoại lệ có chủ đích, đã disclose khi xây: `discount/` không có `presentation/` (Internal Service, không public API), `platform/` là hạ tầng dùng chung (`audit-log/`, `events/`), không phải 1 bounded context nghiệp vụ nên không theo đủ 4 lớp.
- Mọi module MỚI (Product/Category/Brand/Unit/Variant/Barcode ở Sprint-01 sắp tới) bắt buộc theo đúng layering này.

---

# Alternatives

- **Transaction Script** — 1 Service phẳng chứa cả logic nghiệp vụ lẫn truy vấn DB trực tiếp, không tách Domain/Infrastructure.

---

# Rejected

**Transaction Script thuần túy** — bị loại. Không đủ tách biệt để unit-test business rule mà không cần DB thật; mock DB thật cho mọi test rất chậm và giòn, không thực tế để đạt yêu cầu coverage ≥90% theo đúng tinh thần dự án; logic nghiệp vụ và chi tiết truy vấn lẫn vào nhau khiến review khó phân biệt "sai nghiệp vụ" và "sai kỹ thuật".

---

# References

- Module: mọi module trong `backend/src/modules/`; ví dụ đầy đủ nhất 4 lớp: `backend/src/modules/inventory/` (`domain/`, `application/`, `infrastructure/`, `presentation/`).
- Sprint: Foundation.

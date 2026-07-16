# Status

Accepted

---

# Context

Từ Prompt 031, dự án áp dụng luật "module trao đổi qua Domain Event, không gọi chéo Service" (vd `CustomerPointSubscriber` lắng nghe event của `customer-point` thay vì gọi thẳng Service của nó). Cần 1 quy tắc rõ ràng về THỜI ĐIỂM publish để tránh Subscriber phản ứng với 1 biến động chưa từng thực sự xảy ra (nếu transaction sau đó rollback).

---

# Decision

Domain Event chỉ được **publish SAU KHI transaction nghiệp vụ đã commit thành công** — tuyệt đối **không publish bên trong** `$transaction(async (tx) => {...})`.

---

# Consequences

**Ưu điểm**
- Subscriber không bao giờ phản ứng với 1 biến động chưa thực sự xảy ra thật — nếu transaction rollback, không có event nào được publish cho nó.
- Nhất quán với mẫu đã hoạt động đúng ở `checkout.service.ts` (`CHECKOUT_COMPLETED_EVENT` publish sau khi `$transaction()` trả về).

**Nhược điểm**
- Có 1 khoảng thời gian ngắn giữa "transaction commit xong" và "publish thực sự chạy" — nếu cơ chế publish là in-process đồng bộ (`@nestjs/event-emitter`) và app crash đúng lúc đó, event có thể mất dù dữ liệu nghiệp vụ đã lưu đúng.

**Ảnh hưởng**
- Mọi module nguồn publish Domain Event phải gọi `.publish()` (hoặc ghi Outbox — xem ADR-0011) NGAY SAU khối `await this.prisma.$transaction(...)` trả về, không phải bên trong.
- Khoảng hở delivery nêu ở Nhược điểm là động lực trực tiếp dẫn tới ADR-0011 (Outbox Pattern) — ADR này quy định NGUYÊN TẮC (khi nào publish), ADR-0011 quy định CƠ CHẾ đảm bảo nguyên tắc đó không bị phá vỡ bởi crash.

---

# Alternatives

- **Publish bên trong transaction**, dựa vào rollback của Prisma để "hủy" hiệu lực nếu transaction thất bại.

---

# Rejected

**Publish bên trong transaction** — bị loại. Cơ chế event in-process (`@nestjs/event-emitter`) không biết gì về transaction Postgres — nếu publish bên trong `$transaction` rồi transaction đó rollback vì lý do khác xảy ra sau đó trong cùng khối, Subscriber đã phản ứng với 1 sự kiện không hề xảy ra thật, không có cách nào "thu hồi" event đã publish.

---

# References

- Report: `docs/architecture/event-architecture-review.md` (T004.9).
- Module: `backend/src/modules/checkout/application/checkout.service.ts` (ví dụ hiện có, `CHECKOUT_COMPLETED_EVENT`), `backend/src/modules/platform/events/domain-event-publisher.service.ts`.

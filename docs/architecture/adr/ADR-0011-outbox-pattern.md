# Status

Accepted (implementation pending — thuộc phạm vi Sprint-01/T006, chưa code)

---

# Context

ADR-0009 quy định "publish Event sau commit, không publish trong transaction" — đúng nguyên tắc nhưng cơ chế hiện có (`@nestjs/event-emitter`, in-process, đồng bộ) vẫn có 1 khoảng hở: nếu process crash giữa lúc transaction vừa commit xong và lúc `.publish()` thực thi xong, event mất vĩnh viễn dù dữ liệu nghiệp vụ đã lưu đúng — không có gì ghi lại "lẽ ra phải publish event này". Chấp nhận được khi chưa có Subscriber quan trọng, nhưng dự án chuẩn bị mở rộng Domain Event sang nhiều domain hơn (T004.9) và có kế hoạch dài hạn chuyển sang RabbitMQ/Kafka hoặc tách microservice — 1 cơ chế publish-trực-tiếp sẽ cần viết lại hoàn toàn ở thời điểm đó.

---

# Decision

```
Business Transaction
  ↓
Outbox (ghi 1 dòng OutboxEvent, CÙNG transaction, CÙNG tx)
  ↓
Commit (business data + OutboxEvent atomic)
  ↓
Worker (background, ngoài transaction nghiệp vụ)
  ↓
Publish (ra kênh thật)
```

**Không emit trực tiếp.** Tuyệt đối không gọi `eventEmitter.emit()`/`DomainEventPublisher.publish()` trực tiếp bên trong hay ngay sau transaction cho code MỚI — thay bằng ghi `OutboxEvent`.

---

# Consequences

**Ưu điểm**
- Đảm bảo at-least-once delivery sống sót qua process crash — event không còn "biến mất" nếu app crash sau khi business transaction đã commit.
- Nếu sau này chuyển sang RabbitMQ, Kafka, BullMQ, hoặc tách microservice, chỉ cần đổi Worker (bước "Publish ra kênh thật"), KHÔNG cần refactor lại toàn bộ code nghiệp vụ đã ghi Outbox.
- Mỗi `OutboxEvent` là 1 dòng DB có định danh riêng — hỗ trợ tự nhiên Idempotency key, Retry, Dead Letter Queue.

**Nhược điểm**
- Độ trễ giữa "business transaction commit" và "Subscriber thực sự nhận được event" tăng lên (không còn đồng bộ trong cùng request).
- Cần thêm hạ tầng mới: bảng `OutboxEvent` + Background Worker (chưa tồn tại, thuộc phạm vi thiết kế chi tiết của T006).

**Ảnh hưởng**
- Cần 1 bảng `OutboxEvent` mới — schema chi tiết (field, index, retention) thuộc phạm vi SPEC/thiết kế chi tiết của T006, không tự thiết kế trong ADR này.
- `InventoryDomainService.onMovementRecorded()` (hook chừa sẵn từ T004, hiện no-op) trở thành điểm ghi `OutboxEvent` tự nhiên cho các event cấp Inventory — dùng CHÍNH `tx` nó đã nhận, giải quyết gọn vấn đề "publish tại đây không biết transaction ngoài có commit hay không".
- Code hiện có theo mẫu cũ (`customer`, `customer-point`, `checkout` — publish trực tiếp qua `@nestjs/event-emitter`) KHÔNG bắt buộc migrate ngược sang Outbox như một phần của Sprint-01, trừ khi có SPEC riêng yêu cầu.

---

# Alternatives

- **Giữ nguyên cơ chế in-process/đồng bộ hiện có** cho tới khi có nhu cầu thật rõ ràng (khuyến nghị ban đầu của Claude Code ở bản đầu `event-architecture-review.md`).
- **Dual-write** — ghi business row VÀ publish thẳng lên message broker trong cùng đoạn code, không qua bảng Outbox trung gian.

---

# Rejected

- **Giữ nguyên cơ chế hiện có** — không được chọn. User ưu tiên tránh phải viết lại toàn bộ cơ chế publish khi hệ thống mở rộng sang message broker thật/microservice sau này, chấp nhận đầu tư thêm ngay từ Sprint-01 dù chưa có Subscriber thật cần tới mức đó.
- **Dual-write** — bị loại vì rủi ro kinh điển "dual-write inconsistency": broker publish thành công nhưng DB transaction rollback (hoặc ngược lại) không có cách nào đảm bảo cả hai luôn đồng bộ. Outbox Pattern tồn tại chính xác để loại bỏ rủi ro này bằng cách chỉ có 1 nguồn ghi ATOMIC duy nhất (DB transaction).

---

# References

- Report: `docs/architecture/event-architecture-review.md` (T004.9).
- Sprint: Sprint-01 (T006 — Outbox Pattern, theo kế hoạch mới).

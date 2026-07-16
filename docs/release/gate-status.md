# Sprint-00 — Gate Status Tracker

**Trạng thái Sprint: ĐÃ ĐÓNG (2026-07-16) — tag `v0.1.0-foundation`.** T001-T004.95 hoàn thành. T005 trở đi chuyển sang đánh số Sprint-01, xem `docs/implementation/sprint-00-summary.md` §7 và `docs/project-governance/`.

**Phạm vi:** theo dõi trạng thái PASS/FAIL/PENDING của từng Gate cho từng hạng mục **Sprint-00: Architecture Stabilization** (T001-T004.95), theo đúng Acceptance Criteria mà mỗi SPEC/ARCHITECT DECISION đặt ra. Giữ nguyên làm hồ sơ lịch sử sau khi Sprint đóng — không cập nhật thêm cho công việc Sprint-01 (Sprint-01 dùng Gate-01 riêng, theo `docs/project-governance/RELEASE_RULES.md`).

**Khác với `docs/release-gates.md`:** file đó theo dõi **Gate A/B/C/D** — mức độ trưởng thành của toàn sản phẩm (Build cơ bản → Docker Integration → Performance → Production), áp dụng xuyên suốt dự án từ Prompt 015A. File này hẹp hơn và chi tiết hơn — theo dõi Gate ở **cấp từng hạng mục T00x trong riêng Sprint-00**, đúng các tiêu chí acceptance cụ thể mà SPEC của hạng mục đó đặt ra (vd Decision 13 của `SPEC-INV-001` cho T004). Hai file bổ sung cho nhau, không thay thế nhau.

**Quy ước trạng thái:**
- ✅ **PASS** — đã xác minh, đạt yêu cầu.
- ❌ **FAIL** — đã chạy, không đạt.
- 🟡 **PENDING** — chưa xác minh được (thường do thiếu hạ tầng, vd không có Docker/Postgres/Redis trong sandbox) — KHÔNG được tính là PASS.
- ⬜ **N/A** — không áp dụng cho hạng mục này.

---

## Tổng quan Sprint-00

| Hạng mục | Nội dung | Trạng thái tổng |
|---|---|---|
| T001 | Architecture Audit (Prompt A01) | ✅ Hoàn thành — `docs/architecture/dependency-graph.md`, commit `fb4c21f` |
| T002 | Organization Module (SPEC-ORG-001) | ✅ Hoàn thành — commit `d69b82a` |
| T003 | Branch Module (SPEC-BRANCH-001) | ✅ Hoàn thành — commit `d69b82a` |
| T003.5 | Inventory Architecture Specification & Review | ✅ Hoàn thành — 7 tài liệu `docs/architecture/inventory/*.md`, committed cùng T004 (`fb8628d`) |
| T004 | Inventory Refactor (SPEC-INV-001 + Revision 1 + T004.1/T004.5) | ✅ **APPROVED & COMMITTED** — commit `fb8628d`, 10/11 Gate PASS (Integration Test PENDING do thiếu Docker) |
| T004.9 | Event Architecture Review (chuẩn bị T005, chưa phải SPEC) | ✅ Hoàn thành — `docs/architecture/event-architecture-review.md`, 2 quyết định đã chốt (Event cụ thể + Outbox Pattern) |
| T004.95 | Architecture Decision Records (ADR, `SPEC-T004.95`) | ✅ **APPROVED & COMMITTED** — commit `c001f31`, `docs/architecture/adr/` (12 ADR + index) |

**Sprint-00 đóng tại T004.95 — không còn T005/T006 trong Sprint-00** (quyết định của user: T005 trở đi thuộc Sprint-01, đánh số/quy trình riêng — xem `docs/project-governance/`).

---

## T004 — Chi tiết Gate (SPEC-INV-001 Decision 13, xác minh lần cuối: 2026-07-16)

| # | Gate | Lệnh xác minh | Trạng thái | Ghi chú |
|---|---|---|---|---|
| 1 | Build | `npm run build` (`nest build`) | ✅ PASS | 0 lỗi |
| 2 | Lint | `npx eslint "{src,apps,libs,test}/**/*.ts"` | ✅ PASS | 0 lỗi, 0 warning sau `--fix` + sửa tay |
| 3 | TypeCheck | `npx tsc --noEmit` | ✅ PASS | 0 lỗi |
| 4 | Unit Test | `npx jest` | ✅ PASS | 135 suites / 1223 test, 0 fail |
| 5 | Existing Test không vỡ | So sánh với baseline trước T004 (1195 test) | ✅ PASS | Toàn bộ 1195 test cũ vẫn pass nguyên vẹn |
| 6 | Coverage không giảm | `npx jest --coverage`, so sánh qua `git stash` | ✅ PASS | Cao hơn baseline cả 4/4 chỉ số (Stmts +3.71pp, Branch +1.03pp, Funcs +0.07pp, Lines +3.36pp) |
| 7 | Circular Dependency | `grep forwardRef` + `NestFactory.createApplicationContext()` thật | ✅ PASS | 0 `forwardRef`; DI graph resolve đến bước connect DB (giới hạn sandbox, không phải lỗi DI) |
| 8 | TODO/FIXME | `grep TODO\|FIXME` trong phạm vi code T004 chạm tới | ✅ PASS | 0 kết quả |
| 9 | `any` không cần thiết | `grep ": any\|<any>\|as any"` trong phạm vi code T004 chạm tới | ✅ PASS | 0 kết quả |
| 10 | Prisma Inventory update chỉ qua InventoryDomainService | Test tự động `single-writer.architecture.spec.ts` (10 test case) + grep thủ công đối chiếu | ✅ PASS | Đúng 1 file (`prisma-inventory.repository.ts`) còn ghi trực tiếp; 6 module xác nhận có import `InventoryModule`; `InventoryModule` xác nhận chỉ export `InventoryDomainService` |
| 11 | Integration Test (e2e) | `npm run test:e2e` (cần Docker) | 🟡 **PENDING** | Không có Docker/Postgres/Redis trong sandbox — 5 file `*.e2e-spec.ts` đã cập nhật chữ ký mới, biên dịch đúng qua TypeCheck, chưa chạy được thật |

**Kết luận T004:** 10/11 Gate PASS, 1/11 PENDING (Integration Test — giới hạn hạ tầng, không phải lỗi code). Theo Decision 15 (SPEC-INV-001), chỉ commit khi "Build/Lint/TypeCheck/Test đạt yêu cầu và Architecture Verification PASS" — các điều kiện này đã đạt; Integration Test PENDING không nằm trong danh sách chặn commit tường minh của Decision 15/T004, nhưng vẫn được liệt kê minh bạch ở đây, không che giấu, để user tự quyết có chờ Docker hay không trước khi cho phép commit.

**ARCHITECT APPROVAL nhận được — đã commit.** Commit `fb8628d` ("refactor(inventory): centralize inventory writes through InventoryDomainService"), 57 file thay đổi. Integration Test vẫn giữ nguyên trạng thái PENDING sau commit — sẽ chuyển PASS/FAIL khi có môi trường Docker chạy `npm run test:e2e` thật, không tự động coi là PASS chỉ vì đã commit.

## T004.95 — Architecture Decision Records (`SPEC-T004.95`)

`docs/architecture/adr/` — **12 ADR** theo đúng chuẩn `SPEC-T004.95` (Status/Context/Decision/Consequences/Alternatives/Rejected/References): System Architecture, Clean Architecture, Multi-Tenant, RBAC, Single Writer, InventoryDomainService, Optimistic Lock, Transaction Boundary, Domain Events, Repository Boundary, Outbox Pattern, Testing Strategy. Index đầy đủ: `docs/architecture/adr/README.md`. Báo cáo: `docs/implementation/t00495-report.md`.

**ARCHITECT APPROVAL nhận được — đã commit `c001f31` và push.** Commit Policy (`SPEC-T004.95` §6, "KHÔNG commit — chờ Architecture Review") đã được thỏa mãn: Architecture Review hoàn tất, user cho phép commit+push trong cùng quyết định đóng Sprint-00.

> Lịch sử: bộ 8 ADR đầu tiên (tên/format khác, viết trước khi có `SPEC-T004.95`) đã bị soft-reset và thay thế hoàn toàn bằng bộ 12 file này — không tồn tại trong lịch sử git (chưa từng push), không cần disclose thêm ở đây ngoài việc ghi nhận đã redo theo đúng SPEC.

## T004.9 — Event Architecture Review

`docs/architecture/event-architecture-review.md` — chuẩn bị cho `SPEC-EVENT-001`, KHÔNG phải bản thân SPEC, KHÔNG code. 2 quyết định đã chốt trong lúc review: (1) dùng nhiều Domain Event cụ thể theo tên nghiệp vụ (`InventoryIncreased`, `TransferApproved`, ...), không dùng 1 event tổng quát; (2) bắt buộc Outbox Pattern cho mọi event MỚI từ T005/Sprint-01, thay thế hoàn toàn "publish trực tiếp sau commit" (nguyên tắc gốc nay là ADR-0009, cơ chế Outbox là ADR-0011).

## Nhật ký thay đổi trạng thái

| Ngày | Sự kiện |
|---|---|
| 2026-07-16 | T004 code hoàn thành lần 1 — Unit Test 1213/1213, Coverage giảm nhẹ 0.06-0.07pp ở 2/4 chỉ số, Integration Test ghi "⚠️ không chạy được" (chưa phân biệt PENDING/FAIL) — user KHÔNG cho phép commit, ban hành ARCHITECT DECISION T004 yêu cầu T004.1 + T004.5 |
| 2026-07-16 | T004.1 hoàn thành — thêm `single-writer.architecture.spec.ts` (đồng thời phục vụ T004.5), Coverage vượt baseline cả 4/4 chỉ số, Integration Test đổi thành PENDING rõ ràng, file này được tạo |
| 2026-07-16 | ARCHITECT APPROVAL — T004 committed as `fb8628d` |
| 2026-07-16 | User yêu cầu chèn T004.95 (ADR) trước T005, quyết định dùng nhiều Event cụ thể + bắt buộc Outbox Pattern — T004.9 cập nhật lại theo 2 quyết định này, T004.95 (8 ADR, tên/format tự chọn) hoàn thành lần 1 |
| 2026-07-16 | User ban hành `SPEC-T004.95` chính thức — cấu trúc 12 ADR, tên file, format Status/Context/Decision/Consequences/Alternatives/Rejected/References khác với bản tự làm lần 1. Soft-reset commit local (chưa push) chứa 8 ADR cũ, viết lại đúng 12 ADR theo SPEC + `t00495-report.md`. Commit Policy: không commit, chờ Architecture Review |
| 2026-07-16 | ARCHITECT APPROVAL — T004.95 committed as `c001f31`. User quyết định: đóng Sprint-00, gắn tag `v0.1.0-foundation`; Sprint-01 bắt đầu bằng `RFC-0001` (Product Domain, user soạn) → `SPEC-PRODUCT-001` → Implementation → Review → Release; thiết lập `docs/project-governance/` để giảm số lần cần hỏi quyết định lặp lại trong Sprint-01 |

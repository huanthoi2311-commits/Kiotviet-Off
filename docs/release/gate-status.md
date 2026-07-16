# Sprint-00 — Gate Status Tracker

**Phạm vi:** theo dõi trạng thái PASS/FAIL/PENDING của từng Gate cho từng hạng mục **Sprint-00: Architecture Stabilization** (T001-T006), theo đúng Acceptance Criteria mà mỗi SPEC/ARCHITECT DECISION đặt ra. Cập nhật mỗi khi một hạng mục hoàn thành hoặc trạng thái Gate đổi.

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
| T003.5 | Inventory Architecture Specification & Review | ✅ Hoàn thành — 7 tài liệu `docs/architecture/inventory/*.md`, chưa commit riêng (gộp cùng T004) |
| T004 | Inventory Refactor (SPEC-INV-001 + Revision 1 + T004.1/T004.5) | 🟡 Code xong, Gate PASS trừ Integration Test PENDING — **chưa commit**, chờ xác nhận |
| T005 | Domain Events | ⬜ Chưa bắt đầu |
| T006 | Release Gates (Gate-00 tổng kết Sprint-00) | ⬜ Chưa bắt đầu |

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

## Nhật ký thay đổi trạng thái

| Ngày | Sự kiện |
|---|---|
| 2026-07-16 | T004 code hoàn thành lần 1 — Unit Test 1213/1213, Coverage giảm nhẹ 0.06-0.07pp ở 2/4 chỉ số, Integration Test ghi "⚠️ không chạy được" (chưa phân biệt PENDING/FAIL) — user KHÔNG cho phép commit, ban hành ARCHITECT DECISION T004 yêu cầu T004.1 + T004.5 |
| 2026-07-16 | T004.1 hoàn thành — thêm `single-writer.architecture.spec.ts` (đồng thời phục vụ T004.5), Coverage vượt baseline cả 4/4 chỉ số, Integration Test đổi thành PENDING rõ ràng, file này được tạo |

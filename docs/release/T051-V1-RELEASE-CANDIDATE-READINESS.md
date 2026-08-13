# T051.09 — V1.0 Release Candidate Readiness Audit

**Ngày**: 2026-08-13 | **Đánh giá tại**: `main` @ `d13fa15d08b343d17440f8a1c29205825f663773` | **Loại**: LEVEL 3 AUDIT / DECISION GATE — không sửa code, không sửa CI, không đổi GitHub settings.

Audit này đánh giá LẠI TỪ NGUỒN sau khi 4 sprint hardening đã đóng: T051.00 (RBAC Tenant Isolation), T051.02 (Concurrency Hardening), T051.03 (Backup/Restore), T051.04 (Deployment Packaging). Không tái sử dụng kết luận của audit gap cũ (`T051-RELEASE-READINESS-PLAN.md`) mà không tái xác minh — mọi phát hiện dưới đây đều có bằng chứng source/CI mới trong phiên này.

---

## 1. Phase A — Fresh Baseline

| Kiểm tra | Kết quả |
|---|---|
| `local main == origin/main` | ✅ cả hai == `d13fa15d08b343d17440f8a1c29205825f663773` |
| Clean tracked tree | ✅ 0 thay đổi tracked |
| Stale T051.00/.02/.03/.04 branches | ✅ không còn |
| Active git operation | ✅ không có (không MERGE_HEAD/REBASE/REVERT_HEAD/CHERRY_PICK_HEAD) |
| Backup/deployment test residue | ✅ không có (.dump/backups/ci-backups) |
| Untracked baseline | ✅ khớp baseline đã biết từ đầu phiên (docs/discovery, docs/specifications, prisma seed build artifacts — không liên quan T051) |

---

## 2. Re-audit 4 mảng hardening đã đóng

| Mảng | Trạng thái | Bằng chứng mới trong phiên này |
|---|---|---|
| **SECURITY — RBAC tenant isolation (T051.00)** | ✅ CLOSED | `backend/test/rbac-tenant-isolation.e2e-spec.ts:195-294` vẫn còn nguyên, test thật qua Postgres+HTTP; không file nào trong `rbac/`/`prisma-role.repository.ts` bị đụng bởi T051.02/.03/.04 (diff rỗng) |
| **CONCURRENCY — PO/PurchaseReturn/Transfer/StockCount/InventoryAdjustment (T051.02)** | ✅ CLOSED | Spot-check xác nhận cơ chế THẬT trong source, không chỉ comment: Transfer dùng đúng pattern CAS-first như PurchaseOrder — `prisma-transfer.repository.ts:144-166` (`updateMany WHERE id, organizationId, status IN (...), version=expected`), `prisma-purchase-order.repository.ts:173-197` tương tự |
| **DISASTER RECOVERY — backup/restore/verify/retention/Redis exclusion (T051.03)** | ✅ CLOSED | Re-xác nhận qua merge-commit CI (`deployment-smoke` chạy trên `d13fa15`, không chỉ PR-head): pg_dump/pg_restore/pg_restore --list/verify-restore --compare-source đều PASS qua đường docker-compose thật |
| **DEPLOYMENT — Compose/Postgres/Redis/bring-up/images/health chain/runbook/backup path (T051.04)** | ✅ CLOSED | Re-xác nhận qua merge-commit CI (26/26 bước PASS, 4m21s) + tree-identity check (`d13fa15^{tree}` == PR-head tree, byte-identical) |

Không mục nào cần REOPEN — không có bằng chứng mới về defect thật trong 4 mảng đã đóng.

---

## 3. Branch Protection — RC Decision

Kiểm tra trực tiếp qua `gh api repos/.../branches/main/protection` → **404 "Branch not protected"**. Repo: public, 1 collaborator duy nhất (`huanthoi2311-commits`), `delete_branch_on_merge: false`.

**Quyết định**: Thiếu branch protection do GitHub thực thi **KHÔNG chặn V1.0 RC**. Với mô hình một-người-bảo-trì hiện tại, kỷ luật quy trình đã có (relay PR → CI xanh → review thủ công → squash merge, đã chứng minh nhất quán suốt T051.00-.04) đủ thay thế cho enforcement tự động ở giai đoạn RC.

**Chính sách nhỏ nhất đề xuất trước FINAL v1.0** (không bắt buộc cho RC):
- Required status checks trước khi merge (chặn merge nhầm khi CI đỏ)
- Chặn force-push trực tiếp vào `main`
- (Tuỳ chọn) Yêu cầu PR thay vì push thẳng — kể cả tự-approve — để giữ lại lịch sử review dù là 1 người

---

## 4. Tenant Isolation — Full-System RC Decision

**Bằng chứng thu thập được** (agent nghiên cứu, trích dẫn file:line đầy đủ):

- Chỉ **2 file test** trong toàn repo có cross-tenant negative-path test chuyên biệt: `rbac-tenant-isolation.e2e-spec.ts` (đúng phạm vi T051.00) và `organization.e2e-spec.ts:251-275`.
- Sample 11 module (purchase-order, invoice, inventory, customer, supplier, warehouse, product, category, branch, rbac, organization): tất cả đều lọc `organizationId` trong `where` của các method đọc/update theo ID — **trừ một điểm**: `prisma-branch.repository.ts:94-118`'s `update()` nhận `_organizationId` nhưng KHÔNG dùng trong `where` (`:101`) — pattern "Class B" đã được `T051-RELEASE-READINESS-PLAN.md:255` ghi nhận và CHẤP NHẬN từ trước (tenant được xác minh ở lần đọc trước đó tại service layer, không phải bug mới).
- Permission catalog là GLOBAL BY DESIGN, có ghi chú tường minh trong code (`permission-catalog.ts:25`).
- **Platform Admin** (`platform-admin.guard.ts:16-30`) bypass cross-org hoàn toàn dựa trên 1 boolean JWT-embedded (`isPlatformAdmin`), KHÔNG có "acting-as-tenant-X" context, KHÔNG có audit trail riêng — hành vi có chủ đích nhưng chưa được audit độc lập.
- **18/29 module KHÔNG được re-verify độc lập trong phiên này** — chỉ dựa vào phân loại từ chính audit T051 cũ (không phải bằng chứng mới).

**Risk-based assessment**: **B — cần audit tập trung vào module rủi ro cao**, KHÔNG phải C (full endpoint-by-endpoint 27 module) và KHÔNG phải A (coverage hiện tại đủ).

Lý do chọn B thay vì A: pattern "Class B" (tenant verify ở service layer, không phải ở chính method update/delete) là chính xác kiểu lỗi mà T051.00 đã từng xảy ra thật — một điểm sót duy nhất trong tương lai lặp lại là hoàn toàn khả thi, và 18 module chưa được re-verify độc lập.

Lý do không chọn C: pattern tổng thể (lọc organizationId ở read) nhất quán trong toàn bộ sample đã kiểm tra, không có bằng chứng cụ thể của lỗ hổng THỨ HAI đang tồn tại — audit toàn bộ 27 module là chi phí không tương xứng với rủi ro đã biết.

**Module cụ thể đề xuất audit tập trung** (ưu tiên theo tác động tài chính/tồn kho + có mutation method dạng update/delete không tự lọc organizationId trong where — chưa kiểm chứng độc lập trong phiên này):
`supplier-debt` (payment), `customer-point`, `discount`, `payment`, `product-price`, `cart` — đây cũng chính là các module có mutation gần với tiền/tồn kho nhất trong danh sách 18 module chưa re-verify.

---

## 5. Concurrency — Remaining RC Risk

| Module | Concurrency Model | Rủi ro corrupt dữ liệu | Frontend reachable |
|---|---|---|---|
| Inventory | Optimistic lock (`updateMany WHERE quantity=before`) + append-only movement | Không | Có |
| Warehouse | Metadata thuần, không có field tài chính/tồn kho để race | Không | Có |
| Invoice | Append-only, không có public endpoint (chỉ gọi trong tx của Checkout) | Không | Có (gián tiếp) |
| Payment (generic) | Append-only, không có public endpoint (chỉ gọi trong tx của Checkout) | Không | Có (gián tiếp) |
| Checkout | Idempotency key + `$transaction` bao trọn Inventory/Invoice/Payment | Không | Có |
| SalesReturn | Optimistic lock (version CAS) + pessimistic `SELECT...FOR UPDATE` khi tính lại số lượng được trả | Không | Có |
| ProductPrice | Optimistic lock (`priceVersion` CAS, 409 khi lệch) | Không | Chưa xác nhận wiring frontend |
| **SupplierPayment/Debt** | **KHÔNG có khoá nào** — `computeBalance()` (aggregate SUM trong tx) rồi `payment.create` cùng tx, nhưng không `FOR UPDATE`/version/unique guard, Read Committed mặc định | **CÓ — tái hiện được**: 2 request đồng thời cùng thấy `balance=1000` (cả hai đều chưa commit), cả hai pass `800<=1000`, cả hai insert → tổng trả 1600 cho nợ 1000 | **KHÔNG** — không mutation hook nào được gọi trong `frontend/src` ngoài generated client; UI hiện tại chỉ có `useSupplierDebtControllerSearch` (read-only) |

**Kết luận**: Chỉ **SupplierPayment** có race thật, tái hiện được trên Postgres thật — nhưng **KHÔNG có đường tiếp cận từ UI V1 hiện tại**. Theo đúng nguyên tắc "không tự nâng cấp rủi ro backend-latent thành RC blocker khi chưa có đường tiếp cận thật" — đây là **backend latent risk, KHÔNG BLOCKS RC**. Phải sửa trước khi "Supplier Payment UI" (đã nằm trong danh sách deferred sẵn) được triển khai — tức là **REQUIRED BEFORE V1 FINAL nếu/khi Supplier Payment UI được lên lịch**, không sớm hơn.

Không thêm version field cho các module đã an toàn chỉ để "nhất quán" — đúng theo chỉ đạo.

---

## 6. Frontend Real-Browser E2E — RC Decision

**Bằng chứng**: Toàn repo chỉ có **1 file Playwright** (`frontend/e2e/auth/multi-tab-refresh.spec.ts` — coordination refresh token đa tab, không liên quan luồng nghiệp vụ). `playwright.config.ts:16` hard-code `testDir: './e2e/auth'` — không có cấu hình nào khác từng tồn tại để chạy suite rộng hơn. CI (`frontend-ci.yml`) chỉ chạy đúng job này ("Playwright Auth E2E").

Chuỗi **Login → PO create → Receive → Inventory tăng → POS Checkout → Invoice → Sales Return → Inventory giảm/đối soát**: **0/8 bước có real-browser coverage**. Toàn bộ coverage hiện có là component-level (RTL, API mocked) hoặc backend service/controller unit test — không có test nào lái trình duyệt thật qua toàn chuỗi.

**Quyết định**: **B — required before FINAL v1.0 release, KHÔNG phải RC blocker.**

Lý do: `deployment-smoke` CI đã chứng minh cả stack thật (Docker, health, auth API, persistence) hoạt động; mỗi bước nghiệp vụ đều có backend service test + frontend component test riêng lẻ; rủi ro còn lại là "các bước có thực sự nối với nhau đúng qua UI thật không" — rủi ro này CHẤP NHẬN được cho một RC (sẽ được xác minh bằng UAT thủ công trước khi release cuối), nhưng KHÔNG chấp nhận được để phát hành v1.0 GA mà chưa từng có một bằng chứng browser-thật nào.

**Đề xuất cho RC**: một lượt walkthrough THỦ CÔNG qua đúng chuỗi 8 bước trên (xem §17 Acceptance Checklist).

**Suite tối thiểu đề xuất trước FINAL** (không triển khai ở đây theo đúng chỉ đạo): 1 kịch bản Playwright duy nhất nối toàn bộ chuỗi 8 bước (login thật → tạo PO → nhận hàng → xác nhận tồn kho tăng → checkout POS → xác nhận invoice → tạo sales return → xác nhận tồn kho giảm) — không cần 8 test file riêng, một chuỗi liền mạch là đủ để chứng minh tính toàn vẹn end-to-end.

---

## 7. Frontend Test Flakes

`use-supplier-export.test.tsx` ("duplicate-click protection"): **Không phải bug xác định (deterministic)** — nguyên nhân là real `setTimeout(100ms)` + 3 lần `userEvent.click` liên tiếp không dùng `vi.useFakeTimers()`, phụ thuộc microtask/macrotask scheduling thật dưới tải CPU cao (full-suite parallel). Guard logic (`isPending` từ React Query) khớp chính xác với component production thật (`supplier-table.tsx:180-193`) — không có sai khác giữa test và code thật.

Không phải instance đơn lẻ: cùng pattern (real-timer + sequential click + `toHaveBeenCalledTimes`) cũng tồn tại ở `use-purchase-report-export.test.tsx:159-176`.

**Quyết định**: **RECOMMENDED, KHÔNG required before RC.** Không phải rủi ro hành vi production — là rủi ro độ tin cậy CI (một flaky test ngẫu nhiên có thể chặn nhầm release trong tương lai nếu không sửa). Đề xuất trước FINAL: chuyển 2 test này sang `vi.useFakeTimers()`/`waitFor`-based assertion thay vì real-timer.

---

## 8. Migration / Rollback Readiness

41 migration, **20/41 có `rollback.sql`** — convention chỉ bắt đầu từ `20260716020000_product_status_type_version_parent/` trở đi (18 migration đầu tiên + 1 migration lẻ `20260808000000_product_price_version` không có).

Runbook **KHÔNG hề** ngộ nhận khả năng rollback tự động — `WINDOWS-DEPLOYMENT-RUNBOOK.md:216-219` nói rõ ràng "KHÔNG có hạ cấp database tự động", §13 tách 3 phạm vi rollback (code/image/database), phần C nói rõ backup/restore là con đường DUY NHẤT. Không có mâu thuẫn giữa tài liệu và thực tế.

**Quyết định**: Thiếu `rollback.sql` lịch sử **KHÔNG blocks RC** — backup/restore (đã CLOSED ở T051.03, re-verified §2 ở trên) là cơ chế rollback database THẬT SỰ được hỗ trợ và đã đúng như vậy xuyên suốt mọi release trước đó (v0.1.0 → v0.10.0) mà không hề chặn các release đó. Không fabricate rollback script cho lịch sử.

---

## 9. First Admin / RBAC Operability

Audit trực tiếp `first-admin-initializer.ts` + `bootstrap-first-admin.ts`:

- 1 transaction nguyên tử duy nhất: Organization → Branch → User → update ownerUserId → Role "owner" → gán TOÀN BỘ permission hiện có → UserRole.
- Chặn mật khẩu demo/yếu đã biết (`Admin@123`, `password`, `Password123`, `admin123`, `changeme`) TRƯỚC khi tạo bất kỳ record nào.
- `argon2id` hash.
- Idempotent (kiểm tra tồn tại Organization bất kỳ) — an toàn chạy lại mỗi lần `docker compose up`.
- Fail rõ ràng + rollback toàn bộ transaction nếu Permission catalog rỗng (chưa chạy `bootstrap-permissions` trước).
- `FIRST_ADMIN_EMAIL`/`FIRST_ADMIN_PASSWORD` thiếu → throw rõ ràng → `bring-up` exit 1 → `backend`'s `depends_on: service_completed_successfully` KHÔNG thoả → backend không khởi động (fail-fast đúng chuỗi, không khởi động ở trạng thái half-broken).

**Quyết định**: Owner-only V1 flow đã **hoàn chỉnh về mặt vận hành**. Không cần RBAC UI cho RC (đúng theo chỉ đạo "no RBAC UI authorized").

---

## 10. Operator Experience

Đánh giá dựa trên `WINDOWS-DEPLOYMENT-RUNBOOK.md` (16 mục) + `BACKUP-RESTORE-RUNBOOK.md`, đã đọc/audit trực tiếp trong sprint T051.04 và re-xác nhận khớp với source đã merge:

Toàn bộ lệnh là PowerShell, không có bước nào bắt buộc Bash. Chuỗi cài đặt → cấu hình `.env` (bao gồm cảnh báo bắt buộc đổi `NODE_ENV`/`SWAGGER_ENABLED`/`CORS_ORIGIN`) → khởi động lần đầu → xác minh health → đăng nhập → backup → restart → nâng cấp → rollback → troubleshooting (11 dòng) đều có trong runbook và đã được CI (`deployment-smoke`) chứng minh chạy đúng thứ tự thật.

**Không tìm thấy bước nào đòi hỏi kiến thức developer không được ghi lại.**

**Quyết định**: Không có RC BLOCKER ở mục này.

---

## 11. Backup/Restore Operator Drill

`deployment-smoke` CI đã chứng minh TOÀN BỘ cơ chế backup/restore thật qua docker-compose (không phải giả lập) trên merge-commit — bao gồm cả `pg_restore --list` verify và `--compare-source`. Cơ chế lệnh (PowerShell trên Windows thật) giống hệt cơ chế đã chạy trên CI runner Linux — khác OS, không khác cơ chế gọi lệnh (đã ghi chú tường minh trong chính workflow).

**Quyết định**: **CI proof chấp nhận được cho RC.** Một lượt drill thủ công trên máy Windows thật là RECOMMENDED trước FINAL (xây dựng niềm tin vận hành viên, không phải để chứng minh kỹ thuật — kỹ thuật đã được chứng minh).

---

## 12. Security Release Check

Grep trực tiếp trên `backend/src`: không tìm thấy hardcoded password, wildcard CORS, debug/auth-bypass flag nào. `NODE_ENV=production` + `SWAGGER_ENABLED=false` + `CORS_ORIGIN` non-default đều được validate bắt buộc lúc khởi động (throw nếu sai — pre-existing `env.validation.ts`, re-xác nhận còn nguyên). Postgres/Redis không expose port ra host trong compose production. Backup directory không nằm trong đường web-served. Log không chứa secret (đã audit Winston logger).

**Quyết định**: Không phát hiện điểm yếu bảo mật nào blocks RC.

---

## 13. Documentation Integrity

`PROJECT_STATUS.md` và `docs/SPRINT_DASHBOARD.md` **RẤT cũ** — cả hai vẫn mô tả trạng thái T013/T014 ("SPEC-T014 đang soạn", roadmap liệt kê T015-T025 "NOT STARTED"), trong khi thực tế đã qua T051.04. `PROJECT_STATUS.md:9` ghi version `v0.9.0-sales-foundation` — thực tế tag mới nhất là `v0.10.0-sales-return-exchange`, và có ~2.5 tuần công việc chưa gắn tag nào (T015 → T051.04).

Ngược lại, các tài liệu vận hành/release chuyên biệt (`WINDOWS-DEPLOYMENT-RUNBOOK.md`, `BACKUP-RESTORE-RUNBOOK.md`, `T051-RELEASE-READINESS-PLAN.md`) đều CHÍNH XÁC, khớp source đã merge.

**Phân loại**: **B — có thể cập nhật SAU khi tạo RC candidate.** `PROJECT_STATUS.md`/`SPRINT_DASHBOARD.md` là tài liệu quản trị dự án nội bộ, không phải input cho operator/developer triển khai thật (các tài liệu ĐÓ đã chính xác). Tuy nhiên đây là rủi ro QUY TRÌNH đáng kể: `CLAUDE.md` (gốc dự án) yêu cầu đọc `PROJECT_STATUS.md` TRƯỚC MỌI TASK — trạng thái sai lệch ~40 task có thể khiến phiên làm việc tương lai (kể cả AI agent) hiểu sai hoàn toàn bối cảnh. Khuyến nghị cập nhật NGAY sau khi Architect ra quyết định ở audit này, trước khi giao task tiếp theo.

---

## 14. Release Versioning / Artifacts

| Hạng mục | Trạng thái |
|---|---|
| Version number | Không nhất quán: root `0.1.0`, backend `0.0.1`, frontend `0.1.0` |
| Git tag | 11 tag semantic, mới nhất `v0.10.0-sales-return-exchange` (2026-07-27) — KHÔNG có `v1.0.0`/`v1.0.0-rc*` |
| Release notes | `CHANGELOG.md` tồn tại nhưng cũ — `[Unreleased]` vẫn mô tả T013 |
| Docker image tagging | KHÔNG có — build local only, không đăng ký/tag versioned image nào lên registry |
| DB compatibility/upgrade policy | Chỉ có runbook §12/§13 (rollback), không có policy doc riêng biệt |

**Quyết định**: Đây là hạng mục DUY NHẤT trong toàn bộ audit này thực sự **REQUIRED BEFORE RC** — không có bất kỳ định danh version/tag nào thì khái niệm "Release Candidate" chưa có ý nghĩa cụ thể để gắn vào. Yêu cầu tối thiểu: đồng bộ version 3 package.json + tạo tag `v1.0.0-rc1` (hoặc tương đương) khi Architect xác nhận sẵn sàng — không cần Docker registry tagging cho RC (single-machine offline deployment không cần registry).

---

## 15. Smoke / Acceptance Checklist (draft cho RC)

| Hạng mục | AUTOMATED | MANUAL | Ghi chú |
|---|---|---|---|
| Install/start | ✅ (`deployment-smoke`) | | |
| Health | ✅ | | |
| Login | ✅ (API-level) | ✅ (browser thật) | API đã tự động, browser thật cần thủ công cho RC |
| Product/Category/Brand/Unit | | ✅ | Component test có, browser thật chưa |
| Purchase Order → Receive | | ✅ | |
| Inventory tăng/giảm | | ✅ | |
| POS Checkout | | ✅ | |
| Invoice | | ✅ | |
| Sales Return | | ✅ | |
| Backup | ✅ (CI, docker-compose path thật) | (khuyến nghị 1 lượt trên Windows thật) | |
| Restore | ✅ (CI) | (khuyến nghị) | |
| Restart/persistence | ✅ (CI, drill đầy đủ) | | |
| Tenant security (phạm vi T051.00) | ✅ (e2e test) | | |
| Rollback (code/image) | ✅ (revert dry-run đã chứng minh 2 lần) | | |
| Rollback (database) | ✅ (backup/restore CI) | | |

BOTH = automated coverage tồn tại cho phần kỹ thuật + 1 lượt thủ công cho phần trải nghiệm người dùng thật, ở các mục Login/business-flow/backup-restore.

---

## 16. Performance / Scale Sanity

Pattern phân trang (`take: params.limit`) áp dụng nhất quán trên ít nhất 20 repository (barcode, branch, brand, category, customer, ...). Không tìm thấy bằng chứng cụ thể của N+1 nghiêm trọng hay query không giới hạn trên đường nghiệp vụ chính trong phạm vi kiểm tra nhanh (spot-check, không phải audit performance đầy đủ — đúng theo chỉ đạo "không khởi động dự án performance-engineering").

**Quyết định**: Không có bằng chứng khối lượng dữ liệu V1 thông thường sẽ gây lỗi. Không blocks RC.

---

## 17. Observability

`/health` kiểm tra THẬT (`SELECT 1` + Redis ping, không phải liveness hời hợt). Log JSON xoay vòng (Winston) đã có volume bền vững (T051.04). Endpoint metrics kiểu Prometheus tồn tại, có guard bật/tắt qua `METRICS_ENABLED`. Đủ cho single-PC V1 — không cần distributed tracing.

**Quyết định**: Không blocks RC.

---

## 18. Deferred Feature Confirmation

Xác nhận vẫn deferred hợp lệ, KHÔNG blocks RC: Supplier Import UI, Supplier Payment UI, Customer Point mutations, RBAC management UI, Discount admin UI, Organization Settings UI, thêm báo cáo, multi-branch management UI, backup encryption at rest, custom Windows service.

Riêng **Supplier Payment UI**: giữ nguyên deferred, NHƯNG khi được lên lịch triển khai, PHẢI kèm theo việc sửa race điều kiện đã xác nhận ở §5 trước khi mở khoá UI — ghi chú này nên được mang theo vào bất kỳ RFC/SPEC nào tương lai cho Supplier Payment UI.

Không mục nào trong danh sách deferred bị nâng cấp thành mandatory bởi bằng chứng mới trong audit này.

---

## 19. Release-Candidate Completion Score

**FEATURE COMPLETENESS**: ~90-95% (so với phạm vi V1 đã hoạch định — không phải một ERP tối đa giả định). Gần như toàn bộ luồng nghiệp vụ cốt lõi (Product/Category/Brand/Unit/Barcode, Customer/Supplier, Purchase/PurchaseReturn, Sales/SalesReturn, Transfer/StockCount/InventoryAdjustment, Checkout/Invoice/Payment, RBAC, Reports cơ bản, Warehouse/Branch/Organization) đã triển khai; phần còn thiếu là các UI quản trị/nâng cao đã CHỦ ĐÍCH deferred (không phải thiếu sót).

**RELEASE READINESS**: ~80-85%. Kỹ thuật nền tảng (deployment/backup/concurrency-core/RBAC-core) đã được chứng minh vững chắc qua CI thật trên merge commit. Điểm còn thiếu: chưa có định danh version/tag RC (§14 — nhỏ, nhanh), governance docs lệch pha nặng (§13 — không chặn nhưng cần sửa sớm), chưa có bằng chứng browser-thật cho luồng nghiệp vụ (§6 — chấp nhận được cho RC qua UAT thủ công, không chấp nhận được cho FINAL), và audit tenant-isolation mới phủ được phần lõi, chưa phủ 18/29 module (§4).

Hai con số này KHÔNG gộp lại — feature completeness đo phạm vi chức năng, release readiness đo mức độ sẵn sàng vận hành/quy trình.

**Số RC blocker đã xác nhận**: **0** (không có defect/thiếu sót nào được chứng minh chặn RC — chỉ có 1 hành động nhỏ bắt buộc: định danh version/tag, xem §14/§21).

**Số yêu cầu trước V1 FINAL (không chặn RC)**: **6** — (1) versioning/tagging chính thức mở rộng (registry nếu cần), (2) cập nhật `PROJECT_STATUS.md`/`SPRINT_DASHBOARD.md`, (3) audit tenant tập trung 6 module đã nêu ở §4, (4) suite Playwright tối thiểu cho luồng nghiệp vụ chính, (5) sửa race SupplierPayment TRƯỚC KHI mở UI, (6) ổn định 2 test flaky đã nêu ở §7.

---

## 20. Decision Matrix

| ITEM | CURRENT STATUS | RISK | RC BLOCKER? | V1 FINAL REQUIRED? | RECOMMENDED ACTION | PACKAGE |
|---|---|---|---|---|---|---|
| Branch protection | Không bật (404) | Thấp (solo maintainer) | Không | Khuyến nghị | Bật required status checks + chặn force-push | T051.01 (scoped nhỏ) |
| Tenant isolation — phạm vi T051.00 | CLOSED, re-verified | — | — | — | Không cần hành động | — |
| Tenant isolation — full-system | Chỉ 11/29 module spot-check, 18 chưa | Trung bình | Không | Có | Audit tập trung 6 module đã nêu §4 | T051.06 (scoped, không phải full 27 module) |
| Concurrency — 5 module T051.02 | CLOSED, re-verified | — | — | — | Không cần hành động | — |
| Concurrency — SupplierPayment race | Xác nhận tái hiện được, không reachable từ UI | Trung bình (chỉ khi UI ra mắt) | Không | Có, trước khi Supplier Payment UI ra mắt | Thêm `FOR UPDATE`/version guard trước khi mở UI | Kèm theo Supplier Payment UI feature sau này |
| Deployment packaging | CLOSED, re-verified trên merge commit | — | — | — | Không cần hành động | — |
| Backup/Restore | CLOSED, re-verified trên merge commit | — | — | — | Không cần hành động | — |
| Frontend real-browser E2E | 0/8 bước luồng nghiệp vụ có coverage | Trung bình | Không (UAT thủ công thay thế cho RC) | Có | 1 suite Playwright tối thiểu, chuỗi liền mạch | T051.08 (scoped: 1 kịch bản, không phải suite lớn) |
| Frontend test flake | 2 test dùng real-timer, đã xác nhận không phải bug production | Thấp | Không | Khuyến nghị | Chuyển sang `vi.useFakeTimers()` | Nhỏ, gộp vào bất kỳ package frontend nào tiện |
| Migration rollback.sql gaps | 21/41 thiếu | Thấp (backup/restore đã là cơ chế thật) | Không | Không | Không hành động (không fabricate lịch sử) | — |
| Versioning/tagging | Không nhất quán, chưa có tag v1.0.0 | Trung bình (chặn khái niệm "RC" có ý nghĩa) | **Có — nhỏ, nhanh** | — | Đồng bộ version + tag `v1.0.0-rc1` | Hành động độc lập, không cần package riêng |
| Documentation staleness (PROJECT_STATUS/SPRINT_DASHBOARD) | Lệch ~40 task | Trung bình (rủi ro quy trình, không phải sản phẩm) | Không | Có (khuyến nghị ngay sau audit này) | Cập nhật pointer trạng thái hiện tại | T051.05 (scoped: chỉ 2 file, không phải full docs sync) |
| Security config | Sạch | — | Không | — | Không cần hành động | — |
| Operator runbooks | Chính xác, đầy đủ | — | Không | — | Không cần hành động | — |

---

## 21. Package Minimization

**Bộ nhỏ nhất cần thiết để đạt V1.0 RELEASE CANDIDATE**: KHÔNG package nào trong 4 package được liệt kê (T051.01/.05/.06/.08) ở dạng ĐẦY ĐỦ ban đầu là bắt buộc. Chỉ cần:

1. Đồng bộ version 3 `package.json` + tạo tag `v1.0.0-rc1` (không phải một package — một hành động nhỏ trực tiếp).
2. (Khuyến nghị mạnh, không bắt buộc kỹ thuật) 1 lượt UAT thủ công qua chuỗi 8 bước nghiệp vụ (§6/§17) trước khi gắn nhãn "RC" chính thức.

**Giữa RC và FINAL v1.0** (không chặn RC nhưng cần trước khi phát hành chính thức):

- T051.01 scoped nhỏ (branch protection tối thiểu)
- T051.05 scoped nhỏ (chỉ đồng bộ `PROJECT_STATUS.md`/`SPRINT_DASHBOARD.md`, không phải rà soát toàn bộ docs)
- T051.06 scoped nhỏ (audit 6 module đã nêu, không phải 27 module)
- T051.08 scoped nhỏ (1 kịch bản Playwright liền mạch, không phải suite lớn)
- Sửa SupplierPayment race trước khi Supplier Payment UI ra mắt (gộp vào feature đó, không phải package riêng)
- Ổn định 2 test flaky

---

## 22. Ordered Path

**RC**: (1) Version/tag → (2) UAT thủ công 8-bước → gắn nhãn `v1.0.0-rc1`.

**RC → FINAL**: (1) T051.05-scoped (docs sync) → (2) T051.01-scoped (branch protection) → (3) T051.06-scoped (tenant audit 6 module) → (4) T051.08-scoped (Playwright tối thiểu) → (5) ổn định flaky test → (6) FINAL v1.0.0 tag.

Thứ tự trên ưu tiên các hạng mục rẻ/nhanh/rủi ro-quy-trình trước (docs, branch protection), rồi đến các hạng mục cần điều tra sâu hơn (tenant audit, E2E) — không có phụ thuộc cứng bắt buộc thứ tự khác giữa chúng, Architect có thể sắp xếp lại tuỳ nguồn lực.

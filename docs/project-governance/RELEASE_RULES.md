# RELEASE_RULES

Quy tắc commit, tag, push, CHANGELOG.

## 1. Commit

- **Chỉ commit khi được User cho phép tường minh** ("cho phép commit", "ARCHITECT APPROVAL", hoặc tương đương) — không tự suy diễn im lặng là đồng ý, không commit "để tiện" giữa chừng 1 task chưa được duyệt.
- Conventional Commits bắt buộc, `scope` không được để trống (commitlint/husky enforce ở `commit-msg` hook) — vd `refactor(inventory): ...`, `docs(architecture): ...`, `chore(release): ...`. `docs: ...` (không scope) sẽ bị hook chặn.
- Mỗi commit scope theo 1 đơn vị logic rõ ràng — không gộp nhiều thay đổi không liên quan vào 1 commit chỉ vì tiện. Ví dụ Sprint-00: T004 (code refactor) và T004.95 (ADR) là 2 commit riêng dù cùng ngày, cùng Sprint.
- Luôn có dòng `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` khi Claude Code là bên thực hiện commit.
- **Không amend commit đã tồn tại** trừ khi User yêu cầu tường minh — tạo commit mới. Ngoại lệ AN TOÀN duy nhất: `git reset --soft` (không phải `--hard`) trên commit CHƯA PUSH để sửa lại nội dung trước khi 1 SPEC chính thức thay thế bản nháp tự làm (đã áp dụng ở T004.95 khi SPEC-T004.95 thay thế bộ ADR tự chọn trước đó) — luôn xác nhận bằng `git log` so với `origin/<branch>` rằng commit thực sự chưa push trước khi reset.

## 2. Push

- **Chỉ push khi được User cho phép tường minh**, tách biệt với quyền commit — "cho phép commit" không tự động nghĩa là "cho phép push", trừ khi User nói rõ cả hai trong cùng 1 câu.
- Trước khi push, `git fetch` rồi kiểm tra không có divergence với remote (tránh push tạo conflict/cần force).
- **Không bao giờ force-push** lên `main` — nếu cần, cảnh báo User và chờ xác nhận tường minh.

## 3. Tag

- Định dạng `vMAJOR.MINOR.PATCH[-milestone]` (xem `PROJECT_RULES.md` §4).
- Dùng annotated tag (`git tag -a`, có message) — không dùng lightweight tag cho mốc release chính thức.
- Tag đánh dấu ĐÚNG commit mà CHANGELOG.md đã phản ánh nội dung tương ứng — không tag rồi mới cập nhật CHANGELOG sau.
- **Versioning Policy (Decision T006-R07):** giữ `v0.x.y` cho toàn bộ giai đoạn Foundation và phát triển các domain (Master Data, CRM, Inventory, POS, ERP Core theo roadmap). Chỉ chuyển sang `v1.0.0` khi hoàn thành đầy đủ các domain trên — **không phát hành `v1.0.0` sớm**.

## 4. CHANGELOG.md

- Theo chuẩn [Keep a Changelog](https://keepachangelog.com/) — mục `[Unreleased]` chứa thay đổi CHƯA tag; khi tag, đổi tên mục đó thành `[version] - YYYY-MM-DD` và mở `[Unreleased]` mới trống.
- Ghi theo nhóm `### Added` / `### Changed` / `### Security` / `### Known Limitations` (không bắt buộc đủ mọi nhóm, chỉ dùng nhóm có nội dung thật).
- Mục `Known Limitations` dùng cho các PENDING đã biết (vd Integration Test thiếu Docker) — không giấu trong phần Added/Changed.

## 5. Đóng Sprint

Khi 1 Sprint đóng (tất cả T00x của Sprint đó hoàn thành, Architecture Review cuối Sprint PASS):
1. Cập nhật CHANGELOG.md — đóng `[Unreleased]` thành `[version-milestone]`.
2. Cập nhật `docs/release/gate-status.md`/tài liệu tổng kết Sprint — đánh dấu rõ Sprint đã đóng, không nhận thêm T00x mới vào Sprint đó.
3. Tag annotated đúng commit cuối cùng của Sprint.
4. Push commit + tag.
5. Chỉ SAU KHI có tag mới bắt đầu chuẩn bị hạ tầng/tài liệu cho Sprint tiếp theo (tránh lẫn lộn nội dung 2 Sprint trong cùng 1 khoảng lịch sử git chưa rõ ràng).

## 6. CI/CD hiện có (Foundation, không đổi)

- GitHub Actions: `backend-ci.yml` (lint, typecheck, test, prisma validate, build), `frontend-ci.yml` (lint, typecheck, build).
- `commit-and-tag-version` + `.versionrc.json` — công cụ semver bump tự động sẵn có, có thể dùng thay thao tác tag thủ công nếu phù hợp quy trình Sprint sau này (chưa bắt buộc, Sprint-00 vẫn tag thủ công).

## 7. Regression Baseline (Decision T006-R06, áp dụng từ T006 trở đi)

Mỗi Sprint task (T00x) mới, trước khi được phép đóng, phải xác nhận **toàn bộ các Task đã DONE trước đó vẫn PASS** — chạy `npx jest` (hoặc tương đương) trên **toàn bộ** test suite, không chỉ phạm vi module của Task đang làm. Danh sách Baseline mở rộng dần theo từng Task DONE (xem `PROJECT_STATUS.md` để biết Baseline hiện tại). Mục đích: phát hiện sớm regression giữa các domain, không chỉ dựa vào việc module mới tự test module mới.

## 8. Operational Pending / Technical Debt Register

Mọi mục PENDING do giới hạn hạ tầng (không có Docker/Postgres/Redis trong sandbox phát triển) được theo dõi tập trung ở `docs/architecture/technical-debt.md` (Decision T006-R05) — không mở Bug, không mở Hotfix, không tính là Technical Debt thiết kế. Mỗi mục ghi rõ Nguyên nhân/Điều kiện hoàn thành/Mức ưu tiên/Sprint dự kiến xử lý.

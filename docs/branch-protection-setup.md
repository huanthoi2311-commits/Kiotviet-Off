# Thiết lập Branch Protection cho `main`

**Vì sao tài liệu này tồn tại:** Claude Code chạy trong sandbox không có `gh` CLI và không có token với quyền admin repository, nên **không thể tự bật Branch Protection qua API**. Đây là thao tác duy nhất trong "8 việc DevOps" cần bạn tự thực hiện (1 lần, mất khoảng 2 phút).

## Cách 1 — Qua giao diện GitHub (khuyến nghị, không cần cài gì thêm)

1. Vào **Settings → Branches** tại: `https://github.com/huanthoi2311-commits/Kiotviet-Off/settings/branches`
2. Bấm **Add branch ruleset** (hoặc **Add rule** nếu repo dùng giao diện Protection Rules cũ), branch name pattern: `main`.
3. Bật các mục sau (đúng 4 yêu cầu đã đặt ra):
   - ✅ **Require a pull request before merging**
     - ✅ Require approvals — tối thiểu **1** review (nếu bạn làm một mình, GitHub cho phép tick "Allow specified actors to bypass required pull requests" cho chính bạn, hoặc tạm để 0 approval bắt buộc và chỉ giữ "Require PR" — xem ghi chú bên dưới).
   - ✅ **Require status checks to pass before merging**
     - Tick **Require branches to be up to date before merging**.
     - Tìm và chọn 2 check: **`Backend CI / ci`** và **`Frontend CI / ci`**.
     - ⚠️ Hai check này chỉ xuất hiện trong danh sách **sau khi** workflow đã chạy ít nhất 1 lần (tức là sau khi bạn mở PR đầu tiên vào `main` kể từ khi 2 file trong `.github/workflows/` được push lên). Nếu chưa thấy, mở 1 PR nháp trước, đợi CI chạy xong, rồi quay lại bước này.
   - ✅ **Require conversation resolution before merging**
4. Bấm **Create** / **Save changes**.

## Cách 2 — Qua `gh` CLI (nếu bạn cài trên máy của bạn)

```bash
gh api repos/huanthoi2311-commits/Kiotviet-Off/branches/main/protection \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks[strict]=true \
  -f "required_status_checks[contexts][]=Backend CI / ci" \
  -f "required_status_checks[contexts][]=Frontend CI / ci" \
  -f enforce_admins=true \
  -f "required_pull_request_reviews[required_approving_review_count]=1" \
  -f required_conversation_resolution=true \
  -f restrictions=null
```

Chạy lệnh `gh auth login` trước nếu chưa đăng nhập `gh`.

## Ghi chú quan trọng: dự án hiện chỉ có 1 người

Yêu cầu "1 approval" sẽ tự khóa chính bạn (bạn không thể tự approve PR của mình trên GitHub theo mặc định). Hai lựa chọn:

- **Tạm thời** đặt `required_approving_review_count = 0`, chỉ giữ "Require PR" + "Require status checks" + "Require conversation resolution" — vẫn chặn push thẳng vào `main` và bắt buộc CI xanh, chỉ bỏ yêu cầu review (hợp lý khi làm một mình).
- Hoặc thêm chính bạn vào danh sách **bypass list** của rule, để required review không áp dụng cho riêng bạn nhưng vẫn áp dụng khi có người khác tham gia sau này.

Khi có thêm thành viên team, quay lại bật `required_approving_review_count = 1` và bỏ bypass — lúc đó CODEOWNERS (`.github/CODEOWNERS`) sẽ tự động gắn reviewer phù hợp theo thư mục thay đổi.

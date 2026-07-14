# POS ERP Enterprise v1.0 — Design System

**Prompt:** 009 — Thiết kế Design System
**Input bắt buộc:** [007](../../frontend) (Next.js + Tailwind v4 + shadcn/ui đã cấu hình), [008-routing-sitemap.md](./008-routing-sitemap.md)
**Không chứa code.** Token dưới đây map trực tiếp sang CSS variables trong `frontend/src/app/globals.css` (đã có sẵn khung shadcn) khi hiện thực ở Prompt UI Component tương ứng.

> Bảng màu là **placeholder trung tính**, đã được kiểm định độ tương phản/an toàn mù màu (CVD) theo quy trình dataviz chuẩn — khi có brand color chính thức, chỉ thay giá trị hex, giữ nguyên vai trò (role) và thứ tự slot.

---

## 1. Màu sắc (Color)

### 1.1 Semantic UI Tokens (nền tảng shadcn/ui — light/dark)

| Role | Light | Dark | Dùng cho |
|---|---|---|---|
| `background` | `#fcfcfb` | `#1a1a19` | Nền trang |
| `foreground` | `#0b0b0b` | `#ffffff` | Chữ chính |
| `card` | `#ffffff` | `#212120` | Nền Card/Panel |
| `card-foreground` | `#0b0b0b` | `#ffffff` | Chữ trong Card |
| `popover` | `#ffffff` | `#212120` | Nền Dropdown/Popover |
| `primary` | `#2a78d6` | `#3987e5` | Nút chính, link, focus state |
| `primary-foreground` | `#ffffff` | `#ffffff` | Chữ trên nền primary |
| `secondary` | `#f4f4f2` | `#2c2c2a` | Nút phụ, nền nhẹ |
| `secondary-foreground` | `#0b0b0b` | `#ffffff` | Chữ trên nền secondary |
| `muted` | `#f4f4f2` | `#2c2c2a` | Nền vùng phụ, skeleton |
| `muted-foreground` | `#52514e` | `#c3c2b7` | Chữ phụ, placeholder, caption |
| `accent` | `#eef4fc` | `#1c2733` | Hover/active nhẹ |
| `accent-foreground` | `#0b0b0b` | `#ffffff` | Chữ trên accent |
| `destructive` | `#d03b3b` | `#e66767` | Nút/hành động xóa, lỗi |
| `destructive-foreground` | `#ffffff` | `#ffffff` | Chữ trên nền destructive |
| `border` | `#e1e0d9` | `#2c2c2a` | Viền input, card, divider |
| `input` | `#e1e0d9` | `#383835` | Viền input mặc định |
| `ring` | `#2a78d6` | `#3987e5` | Focus ring (a11y) |

### 1.2 Status Palette (cố định — không đổi theo theme brand)

| Trạng thái | Hex | Dùng cho |
|---|---|---|
| `status-good` | `#0ca30c` | Đơn hoàn tất, thanh toán thành công, tồn kho đủ |
| `status-warning` | `#fab219` | Sắp hết hàng, công nợ sắp đến hạn |
| `status-serious` | `#ec835a` | Công nợ quá hạn, đơn bị trả một phần |
| `status-critical` | `#d03b3b` | Hết hàng, đơn hủy, lỗi hệ thống |

**Quy tắc bắt buộc:** trạng thái không bao giờ chỉ thể hiện bằng màu — luôn đi kèm icon + label (badge dạng "● Còn hàng", không chỉ chấm màu).

### 1.3 Chart Palette (Categorical — thứ tự slot cố định, không đảo/cycle)

| Slot | Hue | Light | Dark | Series gợi ý |
|---|---|---|---|---|
| 1 | blue | `#2a78d6` | `#3987e5` | Doanh thu |
| 2 | aqua | `#1baf7a` | `#199e70` | Lợi nhuận |
| 3 | yellow | `#eda100` | `#c98500` | Chi phí |
| 4 | green | `#008300` | `#008300` | Đơn hoàn tất |
| 5 | violet | `#4a3aa7` | `#9085e9` | Khách hàng mới |
| 6 | red | `#e34948` | `#e66767` | Trả hàng/hủy |
| 7 | magenta | `#e87ba4` | `#d55181` | Khuyến mãi |
| 8 | orange | `#eb6834` | `#d95926` | Nhập hàng |

Slot 1 (blue) trùng với `primary` — đảm bảo nhất quán giữa UI chính và biểu đồ. Thêm series thứ 9 → gộp vào "Khác", không sinh hue mới.

### 1.4 Chart Sequential (magnitude — tồn kho, heatmap giờ bán chạy)

Một hue duy nhất (blue), sáng → đậm theo giá trị: `#cde2fb → #86b6ef → #3987e5 → #2a78d6 → #256abf → #1c5cab → #184f95 → #104281 → #0d366b`. Không dùng rainbow.

### 1.5 Chart Diverging (so sánh kỳ này/kỳ trước, tăng/giảm)

Blue (tăng) ↔ Red (giảm), trung điểm trung tính xám (`#f0efec` light / `#383835` dark).

### 1.6 Ràng buộc kiểm định (bắt buộc trước khi đưa palette vào code)

- Chạy `validate_palette.js` (skill dataviz) mỗi khi đổi hex — mục tiêu CVD ΔE ≥ 12 giữa các slot liền kề.
- 3 slot light-mode có tương phản dưới 3:1 (aqua, yellow, magenta) → luôn có nhãn trực tiếp hoặc bảng dữ liệu đi kèm biểu đồ, không chỉ dựa vào màu.
- Dark mode là bộ giá trị **riêng**, được chọn lại cho nền tối — không tự động đảo sáng/tối từ light.

---

## 2. Typography

Font hệ thống (khớp Prompt 007 đã cấu hình Geist qua `next/font`): `Geist Sans` (UI/text), `Geist Mono` (số liệu cần căn cột — mã đơn hàng, số tiền trong bảng).

| Token | Size / Line-height | Weight | Dùng cho |
|---|---|---|---|
| `text-display` | 32px / 40px | 600 | Số liệu hero (Dashboard: "Doanh thu thuần") |
| `text-h1` | 24px / 32px | 600 | Tiêu đề trang |
| `text-h2` | 20px / 28px | 600 | Tiêu đề section/card |
| `text-h3` | 16px / 24px | 600 | Tiêu đề sub-section, table group |
| `text-body` | 14px / 20px | 400 | Nội dung mặc định |
| `text-body-medium` | 14px / 20px | 500 | Label, nhấn nhẹ |
| `text-small` | 13px / 18px | 400 | Caption, meta, timestamp |
| `text-tiny` | 12px / 16px | 400 | Badge, tag |

Quy tắc: số liệu lớn đứng một mình (hero figure, stat tile) dùng proportional figures mặc định; cột số trong bảng/báo cáo dùng `font-variant-numeric: tabular-nums` để căn thẳng hàng.

---

## 3. Spacing

Thang 4px (Tailwind mặc định), dùng nhất quán toàn hệ thống:

| Token | Giá trị | Dùng cho |
|---|---|---|
| `space-1` | 4px | Khoảng cách icon-text |
| `space-2` | 8px | Padding trong button nhỏ, gap giữa badge |
| `space-3` | 12px | Padding input, gap giữa form field |
| `space-4` | 16px | Padding card mặc định, gap giữa card trong grid |
| `space-6` | 24px | Padding section, khoảng cách giữa các khối trong page |
| `space-8` | 32px | Khoảng cách giữa page header và nội dung |
| `space-12` | 48px | Khoảng cách lớn giữa các section chính |

---

## 4. Shadow

| Token | Giá trị (light) | Dùng cho |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgba(11,11,11,0.05)` | Input, button mặc định |
| `shadow-sm` | `0 1px 3px rgba(11,11,11,0.08), 0 1px 2px rgba(11,11,11,0.06)` | Card |
| `shadow-md` | `0 4px 8px rgba(11,11,11,0.08)` | Dropdown, Popover |
| `shadow-lg` | `0 12px 24px rgba(11,11,11,0.12)` | Modal/Dialog |
| `shadow-focus` | `0 0 0 3px rgba(42,120,214,0.35)` | Focus ring thay thế/bổ sung `ring` |

Dark mode: giảm alpha bóng (dễ bị "đục" trên nền tối), thay bằng viền `border` 1px kết hợp bóng nhẹ hơn 30-40%.

---

## 5. Radius

| Token | Giá trị | Dùng cho |
|---|---|---|
| `radius-sm` | 6px | Badge, tag, input nhỏ |
| `radius-md` | 8px | Button, Input, Select (mặc định shadcn `--radius`) |
| `radius-lg` | 12px | Card, Modal |
| `radius-full` | 9999px | Avatar, Pill badge, Toggle |

---

## 6. Component Spec

### 6.1 Button
- Variant: `primary` (nền `primary`), `secondary` (nền `secondary`), `outline` (viền `border`, nền trong suốt), `ghost` (không viền/nền, hover `accent`), `destructive` (nền `destructive`).
- Size: `sm` (32px cao), `md` (36px, mặc định), `lg` (40px, dùng cho CTA chính như "Bán hàng" ở Topbar).
- State bắt buộc: default / hover (tối 8%) / active (tối 12%) / disabled (opacity 40%, `cursor-not-allowed`) / loading (spinner thay icon, giữ nguyên độ rộng).

### 6.2 Input
- Chiều cao 36px (đồng bộ Button `md`), padding ngang `space-3`.
- Border `input`, focus → `ring` 2px + `shadow-focus`.
- State lỗi: viền `destructive`, text lỗi `text-small` màu `destructive` bên dưới, kèm icon cảnh báo.
- Biến thể: Text, Number (căn phải, tabular-nums — dùng cho giá/số lượng ở POS), Search (icon trái), Select, Combobox, DatePicker, Textarea.

### 6.3 Table
- Header: nền `muted`, `text-small` weight 600, uppercase tracking nhẹ, sticky khi cuộn dọc.
- Row: hover `accent`, border-bottom `border` (hairline), chiều cao tối thiểu 44px (đủ vùng chạm cho thao tác trên tablet tại quầy POS).
- Cột số liệu: căn phải, `tabular-nums`. Cột trạng thái: dùng Badge (mục 6.7), không tô màu cả ô.
- Empty state: icon + message + CTA (VD: "Chưa có đơn hàng nào — Tạo đơn mới").
- Pagination cố định cuối bảng, đồng bộ convention `?page&limit` ở [001-architecture.md §8](./001-architecture.md).

### 6.4 Modal / Dialog
- Overlay `rgba(11,11,11,0.4)` (dark: `rgba(0,0,0,0.6)`), Modal dùng `shadow-lg` + `radius-lg`.
- Kích thước: `sm` (400px — xác nhận), `md` (560px — form đơn giản), `lg` (720px — form nhiều field như tạo Sản phẩm), `full` (bán màn hình — POS checkout chi tiết).
- Luôn có: tiêu đề, nút đóng (góc phải), footer chứa action (Hủy = `outline`, Xác nhận = `primary`/`destructive` tùy ngữ cảnh).
- Đóng bằng: click overlay, phím `Esc`, nút đóng — trừ dialog xác nhận hành động phá hủy (chỉ đóng qua nút, tránh thao tác nhầm).

### 6.5 Toast
- Vị trí: góc trên-phải, xếp chồng tối đa 3, tự ẩn sau 4s (trừ loại `error` giữ đến khi người dùng đóng).
- Biến thể theo Status Palette (mục 1.2): success/warning/serious/critical, luôn kèm icon tương ứng + message ngắn (≤ 2 dòng).

### 6.6 Chart
- Tuân thủ toàn bộ mục 1.3–1.6. Mark mỏng (bar radius 4px ở đầu, line 2px), luôn có legend khi ≥ 2 series, tooltip hover bắt buộc, có chế độ xem dạng bảng thay thế cho biểu đồ (accessibility).
- Không bao giờ dùng biểu đồ 2 trục y (dual-axis) — tách thành 2 biểu đồ hoặc chuẩn hóa về cùng thang.

### 6.7 Badge / Card
- Badge: `radius-sm`, padding `2px 8px`, `text-tiny` weight 500, nền = status color ở độ mờ 12% + chữ = status color đậm (đảm bảo tương phản, không dùng nền đặc + chữ trắng cho status nhạt như warning).
- Card: `radius-lg`, `shadow-sm`, padding `space-4` hoặc `space-6` tùy mật độ nội dung, luôn có `card-foreground` cho tiêu đề + `muted-foreground` cho mô tả phụ (khớp mẫu "Doanh thu / Trả hàng / Doanh thu thuần" trong ảnh Dashboard KiotViet tham khảo).

---

## 7. Responsive

Breakpoint theo Tailwind mặc định, gán vai trò rõ cho ERP nhiều màn hình (desktop văn phòng, tablet tại quầy POS):

| Breakpoint | Giá trị | Vai trò |
|---|---|---|
| `sm` | 640px | Điện thoại ngang / tablet nhỏ — Sidebar thu gọn thành icon-only |
| `md` | 768px | Tablet — layout 2 cột tối đa, POS chuyển sang bố cục 1 cột (giỏ hàng dưới danh sách SP) |
| `lg` | 1024px | Desktop nhỏ / tablet ngang — layout chuẩn 3 vùng (Sidebar + Content + Panel phụ nếu có) |
| `xl` | 1280px | Desktop chuẩn — mật độ thông tin đầy đủ như thiết kế gốc |
| `2xl` | 1536px | Màn hình lớn — Content có `max-width`, không kéo giãn bảng/form quá rộng |

Nguyên tắc: mọi Table/Chart có `overflow-x: auto` trong container riêng, không để tràn ngang toàn trang. Sidebar mặc định ẩn dưới `md`, mở qua Drawer.

---

## 8. Dark Mode

- Cơ chế: `next-themes` (đã cài ở Prompt 007) với `attribute="class"`, hỗ trợ `light` / `dark` / `system`.
- Toàn bộ token ở mục 1 đều có cặp giá trị light/dark riêng (không suy ra tự động bằng cách đảo độ sáng) — đặc biệt palette Chart đã được kiểm định lại theo nền tối, không dùng chung giá trị light.
- Ảnh/logo có nền trong suốt cần biến thể `dark:invert` hoặc SVG theo `currentColor`.
- Test bắt buộc trước khi merge UI: kiểm tra cả 2 mode cho Table, Chart, Badge (nơi dễ vỡ tương phản nhất).

---

*Tài liệu này là input cho Prompt 010 (UI Dashboard Wireframe) và toàn bộ Prompt hiện thực UI component từ giai đoạn sau.*

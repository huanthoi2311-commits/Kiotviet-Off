# POS ERP Enterprise v1.0 — UI Dashboard Wireframe

**Prompt:** 010 — Thiết kế UI Dashboard
**Input bắt buộc:** [008-routing-sitemap.md](./008-routing-sitemap.md), [009-design-system.md](./009-design-system.md)
**Không chứa code.** Wireframe low-fidelity — hiện thực UI thật thuộc các Prompt Dashboard module (sau giai đoạn nền tảng).
**Tham chiếu:** ảnh chụp màn hình Tổng quan KiotViet do người dùng cung cấp đầu phiên — giữ tinh thần bố cục (card doanh thu, biểu đồ theo ngày, top sản phẩm/khách hàng, hoạt động gần đây) nhưng chuyển từ top-nav sang **Sidebar + Topbar** theo quyết định route layout đã chốt ở Prompt 008.

---

## 1. Layout tổng thể (desktop ≥ `xl`, 1280px)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ TOPBAR                                                                            │
│ [☰] [Chi nhánh: Hà Nội ▾]              [🔍 Tìm kiếm...]   [🌙] [🔔3] [👤 Admin ▾] │
├────────────┬─────────────────────────────────────────────────────────────────────┤
│ SIDEBAR    │ PAGE HEADER                                                         │
│            │ Tổng quan                                    [Hôm nay ▾] [Xuất báo cáo] │
│ ⬛ Tổng quan│                                                                      │
│ 🛒 Bán hàng│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│ 📦 Hàng hóa│ │ REVENUE CARD│ │ ORDER CARD  │ │CUSTOMER CARD│ │INVENTORY CARD│     │
│ 🏬 Kho     │ │ Doanh thu   │ │ Đơn hàng    │ │ Khách hàng  │ │ Tồn kho      │      │
│ 🧾 Đơn hàng│ │ 53,934,500đ │ │ 128 đơn     │ │ +12 mới     │ │ 3 SP sắp hết │      │
│ 🚚 Nhập hàng│ │ ▲ 12.79%    │ │ ▲ 8.2%      │ │ ▲ 4 hôm nay │ │ ⚠ xem chi tiết│    │
│ 👥 Khách hàng│└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘      │
│ 🏭 NCC     │                                                                      │
│ 💰 Sổ quỹ  │ ┌───────────────────────────────────────┐ ┌─────────────────────┐   │
│ 📊 Báo cáo │ │ SALES CHART                            │ │ NOTIFICATION PANEL  │   │
│ ⚙ Cài đặt  │ │ Doanh thu thuần        [Theo ngày|giờ|thứ]│ │ 🔒 Đăng nhập lạ    │   │
│            │ │                                         │ │ 💰 Đơn hàng mới    │   │
│            │ │   ▂▅▂█▃▇▄  (bar chart theo ngày)        │ │ 📦 Nhập hàng       │   │
│            │ │                                         │ │ 👤 2 KH nợ quá hạn │   │
│            │ └───────────────────────────────────────┘ └─────────────────────┘   │
│            │                                                                      │
│            │ ┌─────────────────────────┐ ┌─────────────────────────┐             │
│            │ │ BEST SELLING PRODUCT     │ │ TOP CUSTOMER             │            │
│            │ │ [Theo SL ▾] [Tháng này▾] │ │ [Tháng này ▾]             │            │
│            │ │ 1. Lưới thủy tinh   170  │ │ 1. Anh Tuấn chống thấm 16.9tr│         │
│            │ │ 2. ...                   │ │ 2. ...                    │           │
│            │ └─────────────────────────┘ └─────────────────────────┘             │
│            │                                                                      │
│            │ ┌───────────────────────────────────────────────────────────────┐   │
│            │ │ RECENT ACTIVITY                                                │   │
│            │ │ 🔒 Sika Đức An vừa bán đơn hàng với giá trị 3,837,500  17h trước│  │
│            │ │ 📥 Sika Đức An vừa nhập hàng với giá trị 1,528,800    1 ngày trước│ │
│            │ └───────────────────────────────────────────────────────────────┘   │
└────────────┴─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Đặc tả từng khối

### 2.1 Topbar (cố định, sticky top, `h-14`)
- Trái: nút toggle Sidebar (`☰`, ẩn/hiện trên mobile), **Branch Selector** (dropdown chi nhánh — chỉ hiện nếu user có quyền truy cập nhiều chi nhánh, theo quy tắc §3 mục 3 của Prompt 008).
- Giữa: ô tìm kiếm toàn cục (sản phẩm, khách hàng, đơn hàng — command palette style, phím tắt `Ctrl+K`).
- Phải: **Theme Toggle** (mục 8 Design System), **Notification Bell** (badge số lượng chưa đọc, click mở Notification Panel dạng dropdown), **User Menu** (avatar + tên, dropdown: Hồ sơ `/profile`, Đổi mật khẩu, Đăng xuất).

### 2.2 Sidebar (`w-64` mở / `w-16` thu gọn icon-only, collapsible)
- Danh sách nhóm menu map theo Bounded Context ở [008-routing-sitemap.md](./008-routing-sitemap.md): Tổng quan, Bán hàng (POS), Hàng hóa (Product/Category/Brand/Unit), Kho (Warehouse/Inventory), Đơn hàng (Order/Invoice/Return), Nhập hàng (Purchase/Supplier), Khách hàng (Customer/Debt/Point), Sổ quỹ (CashBook/Payment/Expense), Báo cáo, Cài đặt (Settings/User/Role/Permission).
- Menu item active: nền `accent`, viền trái 2px `primary`. Item cha có submenu: chevron mở rộng, không điều hướng trực tiếp.
- Responsive: `< md` → ẩn hoàn toàn, mở dạng Drawer overlay khi bấm `☰`.

### 2.3 Stat Card (Revenue / Order / Customer / Inventory)
- Bố cục: icon tròn màu nhạt (accent theo ngữ cảnh) + label (`text-small`, `muted-foreground`) + giá trị chính (`text-h1` hoặc `text-display` cho card đầu tiên) + delta so với kỳ trước (mũi tên + % màu `status-good`/`status-critical`).
- Inventory Card dùng `status-warning`/`status-critical` khi có sản phẩm sắp hết/hết hàng, kèm link "xem chi tiết" → `/inventory`.
- Grid: 4 cột ở `xl`, 2 cột ở `md`, 1 cột ở `sm` (mục 7 Design System).

### 2.4 Sales Chart
- Bar chart theo ngày (mặc định), tab chuyển "Theo giờ" / "Theo thứ" (khớp ảnh tham khảo KiotViet).
- Màu: series chính dùng slot 1 (blue) của Chart Palette. Trục Y ẩn bớt gridline (chỉ hairline `muted`), tooltip hover hiển thị giá trị chính xác theo mốc thời gian.
- Filter phạm vi thời gian: dropdown góc phải (Hôm nay/Tháng này/Tùy chỉnh) — theo `interaction.md` của dataviz skill (preset rows).

### 2.5 Notification Panel
- Danh sách 3-5 thông báo gần nhất kèm icon theo loại (`🔒` bảo mật, `💰` giao dịch, `📦` kho, `👤` khách hàng/công nợ).
- Cảnh báo bảo mật (đăng nhập lạ) luôn ưu tiên hiển thị đầu danh sách, dùng `status-warning`.
- Link "Xem tất cả" → trang danh sách thông báo đầy đủ (nếu có, hoặc mở rộng panel).

### 2.6 Best Selling Product / Top Customer
- Bảng xếp hạng dạng list, mỗi dòng: thứ hạng + tên + progress bar tỷ lệ so với hạng 1 + giá trị (số lượng hoặc doanh thu).
- Filter kép: tiêu chí (Theo số lượng/doanh thu) + khoảng thời gian, đặt góc trên-phải mỗi card (khớp ảnh tham khảo).

### 2.7 Recent Activity (Timeline)
- Danh sách hoạt động dạng feed: icon loại hành động + mô tả (tên nhân viên + hành động + đối tượng + giá trị) + thời gian tương đối ("17 giờ trước").
- Click vào một dòng → điều hướng tới chi tiết đối tượng liên quan (đơn hàng, phiếu nhập).

---

## 3. Responsive Wireframe

### 3.1 Tablet (`md`, 768–1023px)
```
┌───────────────────────────────┐
│ TOPBAR (☰ + search rút gọn)   │
├───────────────────────────────┤
│ Stat Card (2 cột x 2 hàng)     │
├───────────────────────────────┤
│ Sales Chart (full width)      │
├───────────────────────────────┤
│ Notification (thu gọn dưới chart)│
├───────────────────────────────┤
│ Best Selling | Top Customer   │
│ (2 cột, hoặc xếp dọc nếu hẹp) │
├───────────────────────────────┤
│ Recent Activity                │
└───────────────────────────────┘
Sidebar: ẩn, mở qua Drawer từ ☰
```

### 3.2 Mobile (`sm`, < 640px)
- Tất cả card/section xếp 1 cột, full width, khoảng cách `space-4`.
- Stat Card rút gọn: chỉ icon + số liệu chính (ẩn phần label dài), vuốt ngang (carousel) thay vì grid.
- Sales Chart: chiều cao giảm còn ~60% desktop, ẩn bớt nhãn trục X (chỉ hiện mốc đầu/cuối/hôm nay).
- Bottom Navigation thay Sidebar (4-5 icon chính: Tổng quan, Bán hàng, Đơn hàng, Kho, Thêm ▾) — tối ưu thao tác một tay tại quầy.

---

## 4. Dark Mode Wireframe (mô tả khác biệt, không lặp layout)

- Topbar/Sidebar chuyển nền `background` dark (`#1a1a19`), viền phân tách dùng `border` dark thay vì bóng đổ (giảm shadow theo mục 4 Design System).
- Stat Card: nền `card` dark (`#212120`), số liệu chính giữ `foreground` trắng, delta tăng/giảm vẫn dùng `status-good`/`status-critical` (đã kiểm định tương phản ≥ 3:1 trên nền tối).
- Sales Chart: dùng bộ giá trị Chart Palette dark riêng (không đảo sáng/tối tự động) — xem [009-design-system.md §1.3](./009-design-system.md).
- Ảnh minh họa/icon trạng thái rỗng (empty state) cần bản `dark:invert` hoặc SVG `currentColor`.

---

## 5. Checklist đối chiếu yêu cầu (Acceptance)

| Thành phần yêu cầu | Có trong wireframe |
|---|---|
| Sidebar | ✔ mục 2.2 |
| Topbar | ✔ mục 2.1 |
| Revenue Card | ✔ mục 2.3 |
| Order Card | ✔ mục 2.3 |
| Customer Card | ✔ mục 2.3 |
| Inventory Card | ✔ mục 2.3 |
| Recent Activity | ✔ mục 2.7 |
| Sales Chart | ✔ mục 2.4 |
| Best Selling Product | ✔ mục 2.6 |
| Top Customer | ✔ mục 2.6 |
| Notification | ✔ mục 2.5 |
| Responsive | ✔ mục 3 |
| Dark Mode | ✔ mục 4 |

---

*Đây là prompt cuối của Giai đoạn nền tảng (001–010). Từ Prompt 011 trở đi (Authentication, JWT, Refresh Token, RBAC…) bắt đầu hiện thực code nghiệp vụ thật, dựa trên toàn bộ 10 tài liệu/nền tảng đã tạo trong `docs/architecture/`, `backend/`, `frontend/`.*

/**
 * Feature flag nội bộ, chỉ dùng trong quá trình phát triển T005 (Decision A12, ARCHITECTURE
 * REVIEW – T005.1). Gate các business rule MỚI được thêm ở Sprint-01 (Optimistic Lock enforcement,
 * Product Type change guard – A06, Archive-blocks-active-variant guard – RFC §8): khi tắt (mặc
 * định), các rule này không chặn request, giữ nguyên hành vi trước refactor; chỉ bật (thủ công,
 * qua biến môi trường) sau khi toàn bộ test đã PASS.
 *
 * Không có UI/API điều khiển (chỉ đọc từ env, dev-only — Decision C03: không tạo dual
 * implementation/Product V1-V2, chỉ gate đúng 3 rule cụ thể này). Có thể xóa hoàn toàn ở cuối
 * Sprint-01 khi refactor đã ổn định.
 */
export function isProductRefactorEnabled(): boolean {
  return process.env.PRODUCT_REFACTOR_ENABLED === 'true';
}

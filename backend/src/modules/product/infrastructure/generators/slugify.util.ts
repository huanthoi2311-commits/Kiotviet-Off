const VIETNAMESE_MAP: Record<string, string> = {
  đ: 'd',
  Đ: 'D',
};

/**
 * Chuyển tên sản phẩm tiếng Việt thành slug ASCII (không thêm dependency ngoài —
 * NFD normalize xử lý được mọi dấu thanh/nguyên âm, riêng "đ" phải map tay vì
 * không decompose qua Unicode NFD).
 */
export function slugify(input: string): string {
  const withoutDStroke = input.replace(/[đĐ]/g, (ch) => VIETNAMESE_MAP[ch]);
  return withoutDStroke
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

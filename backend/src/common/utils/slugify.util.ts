const VIETNAMESE_MAP: Record<string, string> = {
  đ: 'd',
  Đ: 'D',
};

/**
 * Chuyển tên tiếng Việt có dấu thành slug ASCII (không thêm dependency ngoài —
 * NFD normalize xử lý được mọi dấu thanh/nguyên âm, riêng "đ" phải map tay vì
 * không decompose qua Unicode NFD). Dùng chung cho Product/Category/mọi entity
 * cần slug sau này.
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

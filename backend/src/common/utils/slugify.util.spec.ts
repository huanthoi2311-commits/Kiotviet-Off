import { slugify } from './slugify.util';

describe('slugify', () => {
  it('chuyển tên tiếng Việt có dấu thành slug ASCII có gạch ngang', () => {
    expect(slugify('Áo Thun Nam Đẹp Trai 2026!!')).toBe(
      'ao-thun-nam-dep-trai-2026',
    );
  });

  it('xử lý đúng ký tự "đ"/"Đ" (không decompose qua NFD)', () => {
    expect(slugify('Đường Kính 500ml')).toBe('duong-kinh-500ml');
  });

  it('gộp nhiều khoảng trắng/ký tự đặc biệt liên tiếp thành 1 dấu gạch ngang', () => {
    expect(slugify('  Giày   Sneaker  Nữ!!!  ')).toBe('giay-sneaker-nu');
  });

  it('trả về chuỗi rỗng nếu đầu vào chỉ toàn ký tự đặc biệt', () => {
    expect(slugify('!!!###')).toBe('');
  });
});

import {
  DEFAULT_CORS_ORIGIN,
  isOriginAllowed,
  isWellFormedOrigin,
  parseCorsOrigins,
} from './cors.util';

describe('parseCorsOrigins — T030.6 (nguồn parse CORS_ORIGIN duy nhất)', () => {
  it('[1] một origin duy nhất parse đúng', () => {
    expect(parseCorsOrigins('https://pos.example.com')).toEqual([
      'https://pos.example.com',
    ]);
  });

  it('[2] nhiều origin phân tách bởi dấu phẩy parse đúng', () => {
    expect(
      parseCorsOrigins('https://a.example.com,https://b.example.com'),
    ).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('[3] khoảng trắng quanh mỗi origin bị trim', () => {
    expect(
      parseCorsOrigins(' https://a.example.com , https://b.example.com '),
    ).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('[3b] mục rỗng (dấu phẩy liên tiếp / trailing comma) bị loại bỏ', () => {
    expect(
      parseCorsOrigins('https://a.example.com,,https://b.example.com,'),
    ).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('[3c] chuỗi rỗng parse ra danh sách rỗng (không rơi về default — chỉ undefined mới dùng default)', () => {
    expect(parseCorsOrigins('')).toEqual([]);
  });

  it('[12] giá trị mặc định dev vẫn là http://localhost:3001 khi input undefined', () => {
    expect(parseCorsOrigins(undefined)).toEqual([DEFAULT_CORS_ORIGIN]);
    expect(DEFAULT_CORS_ORIGIN).toBe('http://localhost:3001');
  });
});

describe('isOriginAllowed — T030.6 (REST enableCors callback logic, extracted for unit testing)', () => {
  const allowed = ['https://a.example.com', 'https://b.example.com'];

  it('[4] REST chấp nhận từng origin đã cấu hình trong whitelist', () => {
    expect(isOriginAllowed('https://a.example.com', allowed)).toBe(true);
    expect(isOriginAllowed('https://b.example.com', allowed)).toBe(true);
  });

  it('[5] REST từ chối origin KHÔNG nằm trong whitelist', () => {
    expect(isOriginAllowed('https://evil.example.com', allowed)).toBe(false);
  });

  it('request không kèm Origin header (curl, health check...) luôn được cho qua', () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
  });

  it('whitelist rỗng → mọi origin có Origin header đều bị từ chối', () => {
    expect(isOriginAllowed('https://a.example.com', [])).toBe(false);
  });
});

describe('isWellFormedOrigin — T030.6', () => {
  it('origin http hợp lệ → true', () => {
    expect(isWellFormedOrigin('http://localhost:3001')).toBe(true);
  });

  it('origin https hợp lệ, có port → true', () => {
    expect(isWellFormedOrigin('https://pos.example.com:8443')).toBe(true);
  });

  it('[11] wildcard "*" → false (không phải origin hợp lệ)', () => {
    expect(isWellFormedOrigin('*')).toBe(false);
  });

  it('[11b] có path phía sau → false (origin không được kèm path)', () => {
    expect(isWellFormedOrigin('https://pos.example.com/app')).toBe(false);
  });

  it('[11c] trailing slash → false', () => {
    expect(isWellFormedOrigin('https://pos.example.com/')).toBe(false);
  });

  it('[11d] chuỗi không phải URL hợp lệ → false', () => {
    expect(isWellFormedOrigin('not-a-url')).toBe(false);
  });

  it('[11e] scheme không phải http/https (vd ftp) → false', () => {
    expect(isWellFormedOrigin('ftp://files.example.com')).toBe(false);
  });
});

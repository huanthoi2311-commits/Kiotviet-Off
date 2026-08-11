import { buildBackupFilename, parseBackupFilename } from './backup-filename';

describe('buildBackupFilename', () => {
  it('sinh đúng định dạng pos-erp-YYYYMMDD-HHmmss.dump theo giờ UTC', () => {
    const date = new Date(Date.UTC(2026, 7, 11, 7, 5, 9));
    expect(buildBackupFilename(date)).toBe('pos-erp-20260811-070509.dump');
  });

  it('pad đúng 2 chữ số cho tháng/ngày/giờ/phút/giây < 10', () => {
    const date = new Date(Date.UTC(2026, 0, 5, 3, 4, 5));
    expect(buildBackupFilename(date)).toBe('pos-erp-20260105-030405.dump');
  });

  it('mặc định dùng thời điểm hiện tại nếu không truyền date', () => {
    const filename = buildBackupFilename();
    expect(filename).toMatch(/^pos-erp-\d{8}-\d{6}\.dump$/);
  });
});

describe('parseBackupFilename', () => {
  it('parse ngược lại đúng Date từ filename hợp lệ', () => {
    const parsed = parseBackupFilename('pos-erp-20260811-070509.dump');
    expect(parsed).toEqual(new Date(Date.UTC(2026, 7, 11, 7, 5, 9)));
  });

  it('trả về null cho filename không khớp quy ước', () => {
    expect(parseBackupFilename('random-file.txt')).toBeNull();
    expect(parseBackupFilename('pos-erp-2026-08-11.dump')).toBeNull();
    expect(parseBackupFilename('pos-erp-20260811-070509.sql')).toBeNull();
  });

  it('round-trip: buildBackupFilename rồi parseBackupFilename ra đúng thời điểm ban đầu', () => {
    const original = new Date(Date.UTC(2026, 2, 1, 23, 59, 1));
    const filename = buildBackupFilename(original);
    expect(parseBackupFilename(filename)).toEqual(original);
  });
});

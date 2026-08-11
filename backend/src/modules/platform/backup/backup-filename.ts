/**
 * T051.03 — Quy ước tên file backup: `pos-erp-YYYYMMDD-HHmmss.dump` (giờ UTC, tránh nhập nhằng
 * DST/timezone-local khi so sánh/sắp xếp theo tên file trên các máy vận hành khác múi giờ).
 */
const FILENAME_PREFIX = 'pos-erp-';
const FILENAME_EXTENSION = '.dump';
const FILENAME_PATTERN =
  /^pos-erp-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump$/;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function buildBackupFilename(date: Date = new Date()): string {
  const stamp =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `${FILENAME_PREFIX}${stamp}${FILENAME_EXTENSION}`;
}

/** Trả về null nếu filename không khớp quy ước — dùng để loại các file "lạ" trong thư mục backup. */
export function parseBackupFilename(filename: string): Date | null {
  const match = FILENAME_PATTERN.exec(filename);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * T051.03 §7 — V1 default: "daily backup + 7 daily restore points" (operational default, không
 * phải bất biến — có thể override qua env `BACKUP_RETENTION_COUNT`). Hàm THUẦN (pure), không
 * đụng filesystem — caller (backup-runner) chịu trách nhiệm liệt kê file thật và chỉ gọi xoá
 * SAU KHI backup mới đã được verify thành công (§9: "Cleanup must occur only after a new
 * successful backup is verified").
 */
export const DEFAULT_RETENTION_COUNT = 7;

export interface RetentionCandidate {
  filename: string;
  createdAt: Date;
}

/**
 * Trả về danh sách các backup CẦN XOÁ để chỉ còn giữ lại `keepCount` bản gần nhất.
 * Không bao giờ trả về danh sách xoá HẾT toàn bộ — `keepCount < 1` ném lỗi thay vì âm thầm
 * xoá sạch.
 */
export function selectBackupsToDelete(
  candidates: RetentionCandidate[],
  keepCount: number = DEFAULT_RETENTION_COUNT,
): RetentionCandidate[] {
  if (keepCount < 1) {
    throw new Error(
      `keepCount phải >= 1 (nhận ${keepCount}) — không được phép cấu hình xoá toàn bộ backup.`,
    );
  }
  const sortedNewestFirst = [...candidates].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  return sortedNewestFirst.slice(keepCount);
}

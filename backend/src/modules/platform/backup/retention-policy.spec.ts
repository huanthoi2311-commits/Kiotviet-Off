import {
  DEFAULT_RETENTION_COUNT,
  RetentionCandidate,
  selectBackupsToDelete,
} from './retention-policy';

function candidate(name: string, daysAgo: number): RetentionCandidate {
  const createdAt = new Date(Date.UTC(2026, 7, 11, 0, 0, 0));
  createdAt.setUTCDate(createdAt.getUTCDate() - daysAgo);
  return { filename: name, createdAt };
}

describe('selectBackupsToDelete', () => {
  it('DEFAULT_RETENTION_COUNT là 7 (daily + 7 daily restore points)', () => {
    expect(DEFAULT_RETENTION_COUNT).toBe(7);
  });

  it('giữ lại đúng keepCount bản gần nhất, xoá phần còn lại', () => {
    const candidates = [
      candidate('day-0', 0),
      candidate('day-1', 1),
      candidate('day-2', 2),
      candidate('day-3', 3),
    ];
    const toDelete = selectBackupsToDelete(candidates, 2);
    expect(toDelete.map((c) => c.filename)).toEqual(['day-2', 'day-3']);
  });

  it('không xoá gì nếu số lượng backup <= keepCount', () => {
    const candidates = [candidate('day-0', 0), candidate('day-1', 1)];
    expect(selectBackupsToDelete(candidates, 7)).toEqual([]);
  });

  it('thứ tự đầu vào không ảnh hưởng — luôn sắp xếp lại theo thời gian trước khi chọn', () => {
    const candidates = [
      candidate('day-3', 3),
      candidate('day-0', 0),
      candidate('day-2', 2),
      candidate('day-1', 1),
    ];
    const toDelete = selectBackupsToDelete(candidates, 1);
    expect(toDelete.map((c) => c.filename)).toEqual([
      'day-1',
      'day-2',
      'day-3',
    ]);
  });

  it('dùng DEFAULT_RETENTION_COUNT khi không truyền keepCount', () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      candidate(`day-${i}`, i),
    );
    const toDelete = selectBackupsToDelete(candidates);
    expect(toDelete).toHaveLength(3);
    expect(toDelete.map((c) => c.filename)).toEqual([
      'day-7',
      'day-8',
      'day-9',
    ]);
  });

  it('ném lỗi khi keepCount < 1 (không cho phép cấu hình xoá sạch)', () => {
    expect(() => selectBackupsToDelete([candidate('day-0', 0)], 0)).toThrow(
      'không được phép',
    );
    expect(() => selectBackupsToDelete([candidate('day-0', 0)], -1)).toThrow(
      'không được phép',
    );
  });

  it('mảng rỗng trả về mảng rỗng', () => {
    expect(selectBackupsToDelete([], 7)).toEqual([]);
  });
});

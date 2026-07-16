export type CategoryStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface CategoryEntity {
  id: string;
  organizationId: string;
  parentId: string | null;
  code: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  /** Bật/tắt nhanh, không đổi vòng đời — tách biệt `status` (SPEC-CATEGORY-001 Decision Q1). */
  isActive: boolean;
  /** Trạng thái vòng đời, độc lập với `isActive`. */
  status: CategoryStatus;
  /** Optimistic Lock (Decision Q9) — tăng ở mọi UPDATE, không bao giờ reset. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CategoryTreeNode extends CategoryEntity {
  children: CategoryTreeNode[];
}

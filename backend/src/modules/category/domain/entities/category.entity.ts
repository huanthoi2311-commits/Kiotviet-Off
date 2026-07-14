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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CategoryTreeNode extends CategoryEntity {
  children: CategoryTreeNode[];
}

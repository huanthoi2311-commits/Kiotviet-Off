export interface UnitEntity {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  symbol: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

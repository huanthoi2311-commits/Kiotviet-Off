export type UnitStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface UnitEntity {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  symbol: string;
  status: UnitStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

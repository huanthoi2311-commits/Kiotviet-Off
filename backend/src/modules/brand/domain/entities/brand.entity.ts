export type BrandStatus = 'ACTIVE' | 'INACTIVE';

export interface BrandEntity {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  logo: string | null;
  description: string | null;
  website: string | null;
  country: string | null;
  status: BrandStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

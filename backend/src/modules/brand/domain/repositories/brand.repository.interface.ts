import { BrandEntity, BrandStatus } from '../entities/brand.entity';

export interface CreateBrandInput {
  organizationId: string;
  code: string;
  name: string;
  logo?: string | null;
  description?: string | null;
  website?: string | null;
  country?: string | null;
  status?: BrandStatus;
  createdBy: string;
}

export interface UpdateBrandInput {
  code?: string;
  name?: string;
  logo?: string | null;
  description?: string | null;
  website?: string | null;
  country?: string | null;
  status?: BrandStatus;
  updatedBy: string;
}

export interface BrandSearchParams {
  organizationId: string;
  search?: string;
  status?: BrandStatus;
  page: number;
  limit: number;
}

export interface BrandSearchResult {
  items: BrandEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface IBrandRepository {
  create(input: CreateBrandInput): Promise<BrandEntity>;
  findById(id: string, organizationId: string): Promise<BrandEntity | null>;
  update(id: string, input: UpdateBrandInput): Promise<BrandEntity>;
  softDelete(id: string, deletedBy: string): Promise<void>;
  search(params: BrandSearchParams): Promise<BrandSearchResult>;
  existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean>;
}

export const BRAND_REPOSITORY = Symbol('BRAND_REPOSITORY');

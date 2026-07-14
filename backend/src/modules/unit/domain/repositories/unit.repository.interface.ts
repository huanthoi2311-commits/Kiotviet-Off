import { UnitEntity } from '../entities/unit.entity';

export interface CreateUnitInput {
  organizationId: string;
  code: string;
  name: string;
  symbol: string;
  createdBy: string;
}

export interface UpdateUnitInput {
  code?: string;
  name?: string;
  symbol?: string;
  updatedBy: string;
}

export interface UnitSearchParams {
  organizationId: string;
  search?: string;
  page: number;
  limit: number;
}

export interface UnitSearchResult {
  items: UnitEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface IUnitRepository {
  create(input: CreateUnitInput): Promise<UnitEntity>;
  findById(id: string, organizationId: string): Promise<UnitEntity | null>;
  update(id: string, input: UpdateUnitInput): Promise<UnitEntity>;
  softDelete(id: string, deletedBy: string): Promise<void>;
  search(params: UnitSearchParams): Promise<UnitSearchResult>;
  existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean>;
}

export const UNIT_REPOSITORY = Symbol('UNIT_REPOSITORY');

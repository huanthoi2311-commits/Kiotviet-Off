import { PermissionEntity } from '../entities/permission.entity';

export interface IPermissionRepository {
  list(): Promise<PermissionEntity[]>;
  findByCodes(codes: string[]): Promise<PermissionEntity[]>;
}

export const PERMISSION_REPOSITORY = Symbol('PERMISSION_REPOSITORY');

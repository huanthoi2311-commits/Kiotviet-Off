export interface RoleEntity {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  isSystem: boolean;
  description: string | null;
}

export interface RoleWithPermissions extends RoleEntity {
  permissionCodes: string[];
}

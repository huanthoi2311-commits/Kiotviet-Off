import { ApiProperty } from '@nestjs/swagger';

/** T052.03C — response typing for `RoleEntity` (was untyped `void` in the generated client;
 * `RolesController` never had `@ApiResponse` decorators). Fields correspond exactly to
 * `RoleEntity`'s current runtime shape — no field added/removed/renamed. */
export class RoleResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() isSystem: boolean;
  @ApiProperty({ nullable: true }) description: string | null;
}

/** GET /roles/:id and POST /roles/:id/permissions both return `RoleWithPermissions`
 * (`RoleEntity` + `permissionCodes`) — matches `RoleWithPermissions`'s current runtime shape. */
export class RoleWithPermissionsResponseDto extends RoleResponseDto {
  @ApiProperty({ type: [String] }) permissionCodes: string[];
}

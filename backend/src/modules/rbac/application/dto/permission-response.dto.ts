import { ApiProperty } from '@nestjs/swagger';

/** T052.03C — response typing for `PermissionEntity` (was untyped `void` in the generated client;
 * `PermissionsController` never had `@ApiResponse` decorators). Fields correspond exactly to
 * `PermissionEntity`'s current runtime shape. */
export class PermissionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() group: string;
  @ApiProperty({ nullable: true }) description: string | null;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ example: 'b3a1c9e4-6f2a-4e11-9b3a-1e6c2f4a9d21' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'a1b2c3d4-5678-4e11-9b3a-1e6c2f4a9d21' })
  @IsUUID()
  roleId: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class AssignPermissionsDto {
  @ApiProperty({
    example: ['product:create', 'product:update', 'customer:view'],
    description:
      'Danh sách permission code sẽ thay thế toàn bộ quyền hiện có của role',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissionCodes: string[];
}

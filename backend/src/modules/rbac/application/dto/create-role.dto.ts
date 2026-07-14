import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    example: 'sales_staff',
    description: 'Mã vai trò, duy nhất trong tổ chức',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'code chỉ gồm chữ thường, số và dấu gạch dưới',
  })
  code: string;

  @ApiProperty({ example: 'Nhân viên bán hàng' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    required: false,
    example: 'Vai trò cho nhân viên bán hàng tại quầy',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

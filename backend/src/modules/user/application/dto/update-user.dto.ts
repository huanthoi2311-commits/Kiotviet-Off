import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

/** T052.02 — chỉ 4 field được phép sửa qua PATCH chung (Architect Decision, mục UPDATE USER):
 * fullName, phone, avatar, branchId. KHÔNG nhận username/email/password/status/isPlatformAdmin/
 * organizationId/permissionVersion/deletedAt — những field đó có endpoint riêng hoặc không bao
 * giờ client-settable. */
export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 150)
  fullName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

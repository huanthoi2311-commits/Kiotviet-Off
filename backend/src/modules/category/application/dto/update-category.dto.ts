import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import type { CategoryStatus } from '../../domain/entities/category.entity';

/** KHÔNG gồm ARCHIVED — Archive chỉ đạt được qua DELETE (có guard đệ quy), không qua PATCH (Decision S01). */
const CATEGORY_UPDATE_STATUSES: CategoryStatus[] = [
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
];

export class UpdateCategoryDto {
  @ApiProperty({
    description:
      'Optimistic Lock (SPEC-CATEGORY-001 §7.1) — gửi lại đúng version đã đọc trước đó; sai version bị từ chối (409)',
  })
  @IsInt()
  version: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  code?: string;

  @ApiProperty({ required: false, minLength: 2, maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(2, 255)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    required: false,
    enum: CATEGORY_UPDATE_STATUSES,
    description:
      'Không cho set ARCHIVED qua route này — dùng DELETE /categories/:id (có guard đệ quy Archive Rule)',
  })
  @IsOptional()
  @IsIn(CATEGORY_UPDATE_STATUSES)
  status?: CategoryStatus;
}

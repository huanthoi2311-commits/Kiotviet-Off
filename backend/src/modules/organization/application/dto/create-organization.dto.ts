import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateOrganizationOrgDto {
  @ApiProperty({ minLength: 3, maxLength: 150 })
  @IsString()
  @Length(3, 150)
  displayName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiProperty({ example: 'ducan', description: 'Không đổi được sau khi tạo' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug chỉ gồm chữ thường, số và dấu gạch ngang',
  })
  slug: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  taxCode?: string;
}

export class CreateOrganizationOwnerDto {
  @ApiProperty()
  @IsString()
  @Length(1, 150)
  fullName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

/** Chỉ Platform Admin (User.isPlatformAdmin = true) mới được gọi (SPEC-ORG-001 Decision 4). */
export class CreateOrganizationDto {
  @ApiProperty({ type: CreateOrganizationOrgDto })
  @ValidateNested()
  @Type(() => CreateOrganizationOrgDto)
  organization: CreateOrganizationOrgDto;

  @ApiProperty({ type: CreateOrganizationOwnerDto })
  @ValidateNested()
  @Type(() => CreateOrganizationOwnerDto)
  owner: CreateOrganizationOwnerDto;
}

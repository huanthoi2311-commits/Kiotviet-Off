import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** "Archive phải xác nhận hai bước" (SPEC-ORG-001 §15) — client phải gõ lại đúng slug hiện tại. */
export class ArchiveOrganizationDto {
  @ApiProperty({
    description: 'Phải khớp đúng slug hiện tại của tổ chức để xác nhận',
  })
  @IsString()
  confirmSlug: string;
}

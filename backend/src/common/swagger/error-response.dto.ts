import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: false }) success: false;
  @ApiProperty({ example: 'AUTH_001' }) code: string;
  @ApiProperty({ example: 'Email hoặc mật khẩu không đúng' }) message: string;
  @ApiProperty({ type: [String], example: [] }) errors: string[];
  @ApiProperty({ example: 'b3a1c9e4-6f2a-4e11-9b3a-1e6c2f4a9d21' })
  traceId: string;
  @ApiProperty({ example: '2026-07-14T10:00:00.000Z' }) timestamp: string;
}

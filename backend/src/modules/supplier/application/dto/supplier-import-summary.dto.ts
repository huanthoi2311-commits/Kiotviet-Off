import { ApiProperty } from '@nestjs/swagger';

/**
 * T032.03 (RFC-T031 D08) — decorated class so `POST /suppliers/import`'s
 * response has a real OpenAPI schema. Previously a plain interface
 * (`SupplierImportSummary` in supplier-excel.service.ts), invisible to
 * `SwaggerModule.createDocument()` — response type was undocumented.
 */
export class SupplierImportSummaryDto {
  @ApiProperty() createdCount: number;
  @ApiProperty() updatedCount: number;
}

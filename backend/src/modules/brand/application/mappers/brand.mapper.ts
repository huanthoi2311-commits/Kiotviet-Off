import { BrandEntity } from '../../domain/entities/brand.entity';
import { BrandResponseDto } from '../dto/brand-response.dto';

export class BrandMapper {
  static toResponseDto(entity: BrandEntity): BrandResponseDto {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      logo: entity.logo,
      description: entity.description,
      website: entity.website,
      country: entity.country,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

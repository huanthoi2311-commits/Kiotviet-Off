import {
  CategoryEntity,
  CategoryTreeNode,
} from '../../domain/entities/category.entity';
import {
  CategoryResponseDto,
  CategoryTreeResponseDto,
} from '../dto/category-response.dto';

export class CategoryMapper {
  static toResponseDto(entity: CategoryEntity): CategoryResponseDto {
    return {
      id: entity.id,
      parentId: entity.parentId,
      code: entity.code,
      name: entity.name,
      slug: entity.slug,
      description: entity.description,
      imageUrl: entity.imageUrl,
      sortOrder: entity.sortOrder,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }

  static toTreeResponseDto(node: CategoryTreeNode): CategoryTreeResponseDto {
    return {
      ...this.toResponseDto(node),
      children: node.children.map((child) => this.toTreeResponseDto(child)),
    };
  }
}

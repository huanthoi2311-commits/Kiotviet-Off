import { UserEntity } from '../../domain/entities/user.entity';
import {
  UserDetailResponseDto,
  UserResponseDto,
} from '../dto/user-response.dto';

export class UserMapper {
  static toResponseDto(entity: UserEntity): UserResponseDto {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      branchId: entity.branchId,
      username: entity.username,
      fullName: entity.fullName,
      email: entity.email,
      phone: entity.phone,
      avatar: entity.avatar,
      status: entity.status,
      lastLoginAt: entity.lastLoginAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toDetailResponseDto(
    entity: UserEntity,
    roleCodes: string[],
  ): UserDetailResponseDto {
    return {
      ...this.toResponseDto(entity),
      roleCodes,
    };
  }
}

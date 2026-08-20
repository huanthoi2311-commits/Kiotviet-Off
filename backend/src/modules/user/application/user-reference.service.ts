import { Inject, Injectable } from '@nestjs/common';
import { UserEntity } from '../domain/entities/user.entity';
import { USER_REPOSITORY } from '../domain/repositories/user.repository.interface';
import type { IUserRepository } from '../domain/repositories/user.repository.interface';

/**
 * T053.05C-2 — Cửa ngõ ĐỌC duy nhất của `User` cho module khác (ADR-0010 — Repository Boundary,
 * cùng pattern `ProductDomainService`/`UnitDomainService`/`BarcodeDomainService`). Đúng 1 phương
 * thức mà `branch` module thực sự cần (YAGNI) — không có method ghi, không có business logic.
 */
@Injectable()
export class UserReferenceService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  findById(id: string, organizationId: string): Promise<UserEntity | null> {
    return this.userRepository.findById(id, organizationId);
  }
}

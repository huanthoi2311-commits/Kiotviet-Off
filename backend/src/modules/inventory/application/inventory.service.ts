import { Inject, Injectable } from '@nestjs/common';
import { INVENTORY_REPOSITORY } from '../domain/repositories/inventory.repository.interface';
import type {
  IInventoryRepository,
  MovementSearchParams,
} from '../domain/repositories/inventory.repository.interface';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import {
  InventoryResponseDto,
  PaginatedInventoryResponseDto,
} from './dto/inventory-response.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { PaginatedInventoryMovementResponseDto } from './dto/movement-response.dto';
import { InventoryMapper } from './mappers/inventory.mapper';

/**
 * Chỉ đọc — không có create/update/delete. Mọi thay đổi tồn kho đi qua
 * InventoryDomainService, được gọi từ các module nghiệp vụ khác (Purchase, POS,
 * Transfer, Stock Count, Adjustment), không qua service này.
 */
@Injectable()
export class InventoryService {
  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventoryRepository: IInventoryRepository,
  ) {}

  async search(
    query: InventoryQueryDto,
    organizationId: string,
  ): Promise<PaginatedInventoryResponseDto> {
    const result = await this.inventoryRepository.search({
      organizationId,
      warehouseId: query.warehouseId,
      productId: query.productId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map((item) => InventoryMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async getByProduct(
    productId: string,
    organizationId: string,
  ): Promise<InventoryResponseDto[]> {
    const items = await this.inventoryRepository.getByProduct(
      productId,
      organizationId,
    );
    return items.map((item) => InventoryMapper.toResponseDto(item));
  }

  async getHistory(
    query: MovementQueryDto,
    organizationId: string,
  ): Promise<PaginatedInventoryMovementResponseDto> {
    const params: MovementSearchParams = {
      organizationId,
      warehouseId: query.warehouseId,
      productId: query.productId,
      movementType: query.movementType,
      referenceType: query.referenceType,
      createdFrom: query.createdFrom ? new Date(query.createdFrom) : undefined,
      createdTo: query.createdTo ? new Date(query.createdTo) : undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };

    const result = await this.inventoryRepository.getHistory(params);
    return {
      items: result.items.map((item) =>
        InventoryMapper.toMovementResponseDto(item),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }
}

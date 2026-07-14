import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MovementQueryDto } from './movement-query.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(MovementQueryDto, plain);
  return validate(dto);
}

describe('MovementQueryDto validation', () => {
  it('hợp lệ khi rỗng (mọi field đều optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('từ chối movementType không nằm trong enum', async () => {
    const errors = await validateDto({ movementType: 'UNKNOWN' });
    expect(errors.some((e) => e.property === 'movementType')).toBe(true);
  });

  it('từ chối referenceType không nằm trong enum', async () => {
    const errors = await validateDto({ referenceType: 'UNKNOWN' });
    expect(errors.some((e) => e.property === 'referenceType')).toBe(true);
  });

  it('từ chối createdFrom không phải date string hợp lệ', async () => {
    const errors = await validateDto({ createdFrom: 'not-a-date' });
    expect(errors.some((e) => e.property === 'createdFrom')).toBe(true);
  });

  it('từ chối warehouseId không phải UUID', async () => {
    const errors = await validateDto({ warehouseId: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'warehouseId')).toBe(true);
  });

  it('chấp nhận đầy đủ field hợp lệ', async () => {
    const errors = await validateDto({
      warehouseId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      productId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      movementType: 'PURCHASE',
      referenceType: 'PURCHASE',
      createdFrom: '2026-01-01',
      createdTo: '2026-01-31',
      page: 1,
      limit: 20,
    });
    expect(errors).toHaveLength(0);
  });
});

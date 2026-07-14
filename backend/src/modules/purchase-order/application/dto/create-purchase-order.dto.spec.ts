import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePurchaseOrderDto } from './create-purchase-order.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreatePurchaseOrderDto, plain);
  return validate(dto);
}

const BRANCH_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const SUPPLIER_ID = '4fa85f64-5717-4562-b3fc-2c963f66afa6';
const PRODUCT_ID = '5fa85f64-5717-4562-b3fc-2c963f66afa6';
const WAREHOUSE_ID = '6fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('CreatePurchaseOrderDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const errors = await validateDto({
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      items: [
        {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_ID,
          quantity: 100,
          unitCost: 10000,
        },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('hợp lệ kèm discount/taxAmount/expectedAt tùy chọn', async () => {
    const errors = await validateDto({
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      expectedAt: '2026-08-01T00:00:00.000Z',
      items: [
        {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_ID,
          quantity: 100,
          unitCost: 10000,
          discount: 5000,
          taxAmount: 2000,
        },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối khi thiếu supplierId (bắt buộc)', async () => {
    const errors = await validateDto({
      branchId: BRANCH_ID,
      items: [
        {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_ID,
          quantity: 100,
          unitCost: 10000,
        },
      ],
    });
    expect(errors.some((e) => e.property === 'supplierId')).toBe(true);
  });

  it('từ chối items rỗng', async () => {
    const errors = await validateDto({
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      items: [],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('từ chối item thiếu warehouseId', async () => {
    const errors = await validateDto({
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      items: [{ productId: PRODUCT_ID, quantity: 100, unitCost: 10000 }],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('từ chối quantity <= 0', async () => {
    const errors = await validateDto({
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      items: [
        {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_ID,
          quantity: 0,
          unitCost: 10000,
        },
      ],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('từ chối unitCost âm', async () => {
    const errors = await validateDto({
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      items: [
        {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_ID,
          quantity: 10,
          unitCost: -1,
        },
      ],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });
});

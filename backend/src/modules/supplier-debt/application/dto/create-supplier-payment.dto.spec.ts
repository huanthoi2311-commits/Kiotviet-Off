import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSupplierPaymentDto } from './create-supplier-payment.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateSupplierPaymentDto, plain);
  return validate(dto);
}

const BRANCH_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const SUPPLIER_ID = '4fa85f64-5717-4562-b3fc-2c963f66afa6';
const PURCHASE_ORDER_ID = '5fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('CreateSupplierPaymentDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const errors = await validateDto({
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      method: 'CASH',
      amount: 500000,
      paidAt: '2026-01-01T00:00:00.000Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('hợp lệ kèm purchaseOrderId tùy chọn', async () => {
    const errors = await validateDto({
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      purchaseOrderId: PURCHASE_ORDER_ID,
      method: 'BANK_TRANSFER',
      amount: 100000,
      paidAt: '2026-01-01T00:00:00.000Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối method không nằm trong enum', async () => {
    const errors = await validateDto({
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      method: 'CRYPTO',
      amount: 100000,
      paidAt: '2026-01-01T00:00:00.000Z',
    });
    expect(errors.some((e) => e.property === 'method')).toBe(true);
  });

  it('từ chối amount <= 0', async () => {
    const errors = await validateDto({
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      method: 'CASH',
      amount: 0,
      paidAt: '2026-01-01T00:00:00.000Z',
    });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('từ chối khi thiếu paidAt', async () => {
    const errors = await validateDto({
      branchId: BRANCH_ID,
      supplierId: SUPPLIER_ID,
      method: 'CASH',
      amount: 100000,
    });
    expect(errors.some((e) => e.property === 'paidAt')).toBe(true);
  });
});

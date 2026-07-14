import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePurchaseReturnDto } from './create-purchase-return.dto';

async function validateDto(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreatePurchaseReturnDto, plain);
  return validate(dto);
}

const PURCHASE_ORDER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const PURCHASE_ITEM_ID = '4fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('CreatePurchaseReturnDto validation', () => {
  it('hợp lệ với dữ liệu tối thiểu', async () => {
    const errors = await validateDto({
      purchaseOrderId: PURCHASE_ORDER_ID,
      reason: 'DAMAGED',
      items: [{ purchaseItemId: PURCHASE_ITEM_ID, quantity: 5 }],
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối khi thiếu reason (bắt buộc)', async () => {
    const errors = await validateDto({
      purchaseOrderId: PURCHASE_ORDER_ID,
      items: [{ purchaseItemId: PURCHASE_ITEM_ID, quantity: 5 }],
    });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('từ chối reason không nằm trong enum', async () => {
    const errors = await validateDto({
      purchaseOrderId: PURCHASE_ORDER_ID,
      reason: 'UNKNOWN',
      items: [{ purchaseItemId: PURCHASE_ITEM_ID, quantity: 5 }],
    });
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('từ chối items rỗng', async () => {
    const errors = await validateDto({
      purchaseOrderId: PURCHASE_ORDER_ID,
      reason: 'DAMAGED',
      items: [],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('từ chối quantity <= 0', async () => {
    const errors = await validateDto({
      purchaseOrderId: PURCHASE_ORDER_ID,
      reason: 'DAMAGED',
      items: [{ purchaseItemId: PURCHASE_ITEM_ID, quantity: 0 }],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('chấp nhận reason WRONG_PRODUCT/EXPIRED/OTHER kèm note tùy chọn', async () => {
    for (const reason of ['WRONG_PRODUCT', 'EXPIRED', 'OTHER']) {
      const errors = await validateDto({
        purchaseOrderId: PURCHASE_ORDER_ID,
        reason,
        note: 'Ghi chú',
        items: [{ purchaseItemId: PURCHASE_ITEM_ID, quantity: 1 }],
      });
      expect(errors).toHaveLength(0);
    }
  });
});

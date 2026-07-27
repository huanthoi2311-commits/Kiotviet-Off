import { SalesReturnEntity } from '../../domain/entities/sales-return.entity';
import { SalesReturnMapper } from './sales-return.mapper';

describe('SalesReturnMapper', () => {
  const item = {
    id: 'sritem-1',
    invoiceItemId: 'invitem-1',
    productId: 'prod-1',
    warehouseId: 'wh-1',
    quantity: '2.000',
    unitPrice: '100000.00',
    discount: '0.00',
    taxAmount: '20000.00',
    totalAmount: '220000.00',
    productCodeSnapshot: 'SP000001',
    productNameSnapshot: 'Áo thun',
    unitNameSnapshot: 'Cái',
    reason: 'DAMAGED' as const,
    reasonNote: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const refund = {
    id: 'refund-1',
    salesReturnId: 'sr-1',
    amount: '100000.00',
    method: 'CASH' as const,
    status: 'PENDING' as const,
    externalReference: null,
    failureReason: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    version: 1,
  };

  const salesReturn: SalesReturnEntity = {
    id: 'sr-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    invoiceId: 'inv-1',
    customerId: 'cus-1',
    code: 'SR000001',
    status: 'DRAFT',
    totalAmount: '220000.00',
    note: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    version: 1,
    items: [item],
    refunds: [refund],
  };

  it('toItemResponseDto mirror 1:1 field', () => {
    expect(SalesReturnMapper.toItemResponseDto(item)).toEqual(item);
  });

  it('toRefundResponseDto mirror 1:1 field', () => {
    expect(SalesReturnMapper.toRefundResponseDto(refund)).toEqual(refund);
  });

  it('toResponseDto map cả items lẫn refunds lồng bên trong', () => {
    const result = SalesReturnMapper.toResponseDto(salesReturn);
    expect(result.items).toEqual([item]);
    expect(result.refunds).toEqual([refund]);
    expect(result.code).toBe('SR000001');
  });

  it('toPaginatedResponseDto map từng item trong search result', () => {
    const result = SalesReturnMapper.toPaginatedResponseDto({
      items: [salesReturn],
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].code).toBe('SR000001');
    expect(result.total).toBe(1);
  });

  it('toEligibilityResponseDto mirror 1:1 field', () => {
    const eligibility = {
      invoiceItemId: 'invitem-1',
      soldQty: '2.000',
      returnedQty: '0.000',
      eligibleQty: '2.000',
    };
    expect(SalesReturnMapper.toEligibilityResponseDto(eligibility)).toEqual(
      eligibility,
    );
  });
});

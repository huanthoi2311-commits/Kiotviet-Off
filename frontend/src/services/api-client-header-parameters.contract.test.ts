import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { checkoutControllerCheckout } from '@/generated/checkout/checkout';
import { supplierPaymentControllerCreate } from '@/generated/supplier-payment/supplier-payment';

const API_BASE_URL = 'http://localhost:3000/api/v1';

/**
 * T052.05C — generation-contract regression proof. `orval.config.ts`'s `output.headers: true`
 * (added this package) is what turns a required OpenAPI `in: header` parameter into a real,
 * required argument on the generated function AND actually merges it into the outgoing Axios
 * request. Before this flag, both `supplierPaymentControllerCreate` and
 * `checkoutControllerCheckout` compiled fine but silently dropped their required
 * `Idempotency-Key` header — a defect `tsc`/lint could never catch, since the generated function
 * simply had no parameter for it at all. This test proves the fix behaviorally (the header
 * actually reaches the real HTTP request via MSW), not just by reading the generated source —
 * and covers Checkout too, as the required regression proof that the fix is generic (driven by
 * `output.headers`, not a Supplier-Payment-specific patch), even though no Checkout UI consumes
 * it yet (T052.05C §4/§13 — Checkout is proof-only here, not a product change).
 */
describe('Generated client — Idempotency-Key header parameter reaches the HTTP request', () => {
  it('supplierPaymentControllerCreate: sends the required Idempotency-Key header', async () => {
    let receivedHeader: string | null = null;
    let receivedBody: unknown;
    server.use(
      http.post(`${API_BASE_URL}/supplier-payment`, async ({ request }) => {
        receivedHeader = request.headers.get('idempotency-key');
        receivedBody = await request.json();
        return HttpResponse.json(
          {
            success: true,
            data: { id: 'payment-1' },
            meta: null,
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 201 },
        );
      }),
    );

    const dto = {
      branchId: 'branch-1',
      supplierId: 'supplier-1',
      method: 'CASH' as const,
      amount: 100000,
      paidAt: '2026-08-15T00:00:00.000Z',
    };

    await supplierPaymentControllerCreate(dto, { 'Idempotency-Key': 'test-key-123' });

    expect(receivedHeader).toBe('test-key-123');
    expect(receivedBody).toEqual(dto);
  });

  it('checkoutControllerCheckout: sends the required Idempotency-Key header (generic-fix proof, no Checkout UI change)', async () => {
    let receivedHeader: string | null = null;
    server.use(
      http.post(`${API_BASE_URL}/checkout`, async ({ request }) => {
        receivedHeader = request.headers.get('idempotency-key');
        return HttpResponse.json(
          {
            success: true,
            data: { invoice: {}, payment: {} },
            meta: null,
            traceId: 't-1',
            timestamp: new Date().toISOString(),
          },
          { status: 201 },
        );
      }),
    );

    const dto = {
      branchId: 'branch-1',
      warehouseId: 'warehouse-1',
      paymentMethod: 'CASH' as const,
    };

    await checkoutControllerCheckout(dto, { 'Idempotency-Key': 'test-key-456' });

    expect(receivedHeader).toBe('test-key-456');
  });
});

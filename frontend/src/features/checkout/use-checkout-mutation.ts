import { useMutation, type QueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { apiClientMutator, type NormalizedError } from '@/services/api-client';
import type { CheckoutDto, CheckoutResponseDto } from '@/generated/pOSERPEnterpriseAPI.schemas';

/**
 * T046 AD-2 — the ONE approved exception to "always use generated Orval hooks" in this domain.
 * `POST /checkout` requires a mandatory `Idempotency-Key` header (backend 400s without it), but
 * the installed Orval stack (react-query + axios + a single-argument custom mutator) generates
 * zero header parameters for ANY endpoint in this codebase — verified empirically, not assumed
 * (removing the OpenAPI spec's duplicate header declaration and regenerating still produced no
 * header parameter; `@orval/core`'s bundled source has no header-handling code at all). This
 * wrapper calls `apiClientMutator` directly — the same shared mutator every generated hook already
 * routes through — so auth injection, error normalization, and envelope unwrapping are identical.
 * Every other T046 endpoint uses generated hooks unchanged (SPEC-T046 §12).
 */
export interface CheckoutMutationVariables {
  data: CheckoutDto;
  idempotencyKey: string;
}

function checkoutRequest({
  data,
  idempotencyKey,
}: CheckoutMutationVariables): Promise<CheckoutResponseDto> {
  return apiClientMutator<CheckoutResponseDto>({
    url: '/api/v1/checkout',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    data,
  });
}

export function useCheckoutMutation(
  options?: {
    mutation?: UseMutationOptions<CheckoutResponseDto, NormalizedError, CheckoutMutationVariables>;
  },
  queryClient?: QueryClient,
) {
  return useMutation({ mutationFn: checkoutRequest, ...options?.mutation }, queryClient);
}

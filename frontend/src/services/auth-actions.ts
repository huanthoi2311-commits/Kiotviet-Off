import { apiClient, type ApiSuccessEnvelope, type NormalizedApiError } from './api-client';

export interface LoginPayload {
  organizationSlug: string;
  email: string;
  password: string;
}

export interface UserInfo {
  id: string;
  email: string;
  username: string;
  organizationId: string;
  branchId: string | null;
  permissions: string[];
}

export interface LoginResult {
  accessToken: string;
  userInfo: UserInfo;
}

/**
 * POST /auth/login (SPEC-T031 FR1) — a fresh explicit login, not routed through §12's refresh
 * coordination. T051.08A — the backend's `TransformInterceptor` wraps every 2xx body into
 * `ApiSuccessEnvelope<LoginResult>`; `response.data` is that whole envelope, not `LoginResult`
 * directly (confirmed via T051.08's real-browser suite: a real login form crashed against a real
 * backend because this previously typed `response.data` as `LoginResult` without unwrapping
 * `.data`). The invariant check below fails loudly instead of handing `auth-store` an `undefined`
 * token, which used to crash inside `decodeJwt()` with an opaque, unnormalized TypeError.
 */
export async function login(payload: LoginPayload): Promise<LoginResult> {
  const response = await apiClient.post<ApiSuccessEnvelope<LoginResult>>('/auth/login', payload);
  const result = response.data.data;
  if (!result?.accessToken || !result?.userInfo) {
    const malformed: NormalizedApiError = {
      kind: 'api-error',
      code: 'MALFORMED_AUTH_RESPONSE',
      message: 'Phản hồi đăng nhập không hợp lệ từ máy chủ (thiếu accessToken/userInfo).',
    };
    throw malformed;
  }
  return result;
}

/** POST /auth/logout — revokes only the current device's session (SPEC-T031 FR4). */
export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout', {});
}

/** POST /auth/logout-all — revokes every session for the user (SPEC-T031 FR4). */
export async function logoutAll(): Promise<void> {
  await apiClient.post('/auth/logout-all');
}

export interface ForgotPasswordPayload {
  organizationSlug: string;
  email: string;
}

export async function requestPasswordResetOtp(payload: ForgotPasswordPayload): Promise<void> {
  await apiClient.post('/auth/forgot-password', payload);
}

export interface VerifyOtpPayload extends ForgotPasswordPayload {
  otp: string;
}

export async function verifyPasswordResetOtp(payload: VerifyOtpPayload): Promise<void> {
  await apiClient.post('/auth/verify-otp', payload);
}

export interface ResetPasswordPayload extends ForgotPasswordPayload {
  newPassword: string;
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<void> {
  await apiClient.post('/auth/reset-password', payload);
}

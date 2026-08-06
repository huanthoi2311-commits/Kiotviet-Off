import { apiClient } from './api-client';

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

/** POST /auth/login (SPEC-T031 FR1) — a fresh explicit login, not routed through §12's refresh coordination. */
export async function login(payload: LoginPayload): Promise<LoginResult> {
  const response = await apiClient.post<LoginResult>('/auth/login', payload);
  return response.data;
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

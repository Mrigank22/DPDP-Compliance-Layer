import { apiClient } from "@/lib/api-client";
import {
  AuthTokenResponse,
  ChangePasswordInput,
  InviteUserInput,
  LoginInput,
  RegisterInput,
  User,
} from "@/types/api";

export const authAPI = {
  register: (data: RegisterInput) =>
    apiClient.post<AuthTokenResponse>("/auth/register", data),

  login: (data: LoginInput) =>
    apiClient.post<AuthTokenResponse>("/auth/login", data),

  refresh: (refreshToken: string) =>
    apiClient.post<AuthTokenResponse>("/auth/refresh", { refresh_token: refreshToken }),

  logout: () => apiClient.post("/auth/logout"),

  me: () => apiClient.get<User>("/auth/me"),

  changePassword: (data: ChangePasswordInput) =>
    apiClient.put("/auth/change-password", data),

  enableMFA: () =>
    apiClient.post<{ secret: string; qr_code?: string; otpauth_url?: string }>("/auth/mfa/enable"),

  verifyMFA: (data: { totp_code: string }) =>
    apiClient.post("/auth/mfa/verify", data),

  forgotPassword: (email: string) =>
    apiClient.post("/auth/forgot-password", { email }),

  resetPassword: (token: string, password: string) =>
    apiClient.post("/auth/reset-password", { token, password }),

  inviteUser: (data: InviteUserInput) => apiClient.post("/auth/invite", data),

  acceptInvite: (token: string) =>
    apiClient.post("/auth/accept-invite", { token }),
};

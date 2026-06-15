import { apiClient } from "@/lib/api-client";
import {
  AuthTokenResponse,
  LoginInput,
  RegisterInput,
  User,
} from "@/types/api";

export const authAPI = {
  register: (data: RegisterInput) =>
    apiClient.post<AuthTokenResponse>("/auth/register", data),

  login: (data: LoginInput) =>
    apiClient.post<AuthTokenResponse>("/auth/login", data),

  refresh: () =>
    apiClient.post<AuthTokenResponse>("/auth/refresh"),

  logout: () =>
    apiClient.post("/auth/logout"),

  me: () =>
    apiClient.get<User>("/auth/me"),

  changePassword: (data: { old_password: string; new_password: string }) =>
    apiClient.put("/auth/change-password", data),

  enableMFA: () =>
    apiClient.post<{ secret: string; qr_code: string }>("/auth/mfa/enable"),

  verifyMFA: (data: { code: string }) =>
    apiClient.post("/auth/mfa/verify", data),

  forgotPassword: (email: string) =>
    apiClient.post("/auth/forgot-password", { email }),

  resetPassword: (token: string, password: string) =>
    apiClient.post("/auth/reset-password", { token, password }),

  inviteUser: (data: { email: string; full_name: string; role: string }) =>
    apiClient.post("/auth/invite", data),

  acceptInvite: (token: string) =>
    apiClient.post("/auth/accept-invite", { token }),
};

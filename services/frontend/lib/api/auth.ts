import { apiClient } from "@/lib/api-client";
import {
  AuthTokenResponse,
  ChangePasswordInput,
  InviteUserInput,
  LoginInput,
  RegisterInput,
  User,
} from "@/types/api";

export interface SSOConnection {
  enabled: boolean;
  provider: string;
  issuer_url: string;
  client_id: string;
  client_secret_set: boolean;
  email_domains: string[];
  default_role: "admin" | "analyst" | "viewer";
  auto_provision: boolean;
  scim_enabled: boolean;
  scim_token_set: boolean;
}

export interface UpsertSSOInput {
  enabled: boolean;
  issuer_url: string;
  client_id: string;
  /** Omit to keep the stored secret unchanged. */
  client_secret?: string;
  email_domains: string[];
  default_role: "admin" | "analyst" | "viewer";
  auto_provision: boolean;
}

export const authAPI = {
  register: (data: RegisterInput) =>
    apiClient.post<AuthTokenResponse>("/auth/register", data),

  login: (data: LoginInput) =>
    apiClient.post<AuthTokenResponse>("/auth/login", data),

  // ---- Enterprise SSO (OIDC) ----
  ssoStart: (email: string) =>
    apiClient.post<{ authorization_url: string }>("/auth/sso/start", { email }),

  ssoExchange: (code: string) =>
    apiClient.post<AuthTokenResponse>("/auth/sso/exchange", { code }),

  getSSO: () => apiClient.get<SSOConnection>("/sso/connection"),

  updateSSO: (data: UpsertSSOInput) =>
    apiClient.put<SSOConnection>("/sso/connection", data),

  deleteSSO: () => apiClient.delete<{ message: string }>("/sso/connection"),

  // ---- SCIM provisioning token (shown once on generation) ----
  generateScimToken: () =>
    apiClient.post<{ token: string }>("/sso/scim-token"),

  revokeScimToken: () =>
    apiClient.delete<{ message: string }>("/sso/scim-token"),

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

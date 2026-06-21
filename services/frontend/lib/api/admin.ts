import { adminClient } from "./admin-client";

export interface PlatformAdmin {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  mfa_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface PlatformAuth {
  access_token: string;
  expires_in: number;
  admin: PlatformAdmin;
}

export interface PlatformStats {
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  total_users: number;
  total_assets: number;
  total_findings: number;
  total_scans: number;
  total_policies: number;
  platform_admins: number;
}

export interface TenantAdminView {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  data_region: string;
  private_deploy: boolean;
  user_count: number;
  asset_count: number;
  finding_count: number;
  created_at: string;
}

export interface PlatformAudit {
  id: string;
  admin_id: string;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: Record<string, unknown>;
  ip_address: string;
  created_at: string;
}

export interface CreateAdminInput {
  email: string;
  full_name: string;
  password: string;
}

export const adminAPI = {
  login: (email: string, password: string, totp_code?: string) =>
    adminClient.post<PlatformAuth>("/admin/auth/login", { email, password, totp_code }),

  me: () => adminClient.get<PlatformAdmin>("/admin/me"),

  stats: () => adminClient.get<PlatformStats>("/admin/stats"),

  tenants: (page = 1, page_size = 20) =>
    adminClient.get<TenantAdminView[]>("/admin/tenants", { params: { page, page_size } }),
  suspendTenant: (id: string) => adminClient.post(`/admin/tenants/${id}/suspend`),
  activateTenant: (id: string) => adminClient.post(`/admin/tenants/${id}/activate`),
  deleteTenant: (id: string) => adminClient.del(`/admin/tenants/${id}`),

  admins: () => adminClient.get<{ admins: PlatformAdmin[] }>("/admin/admins"),
  createAdmin: (data: CreateAdminInput) => adminClient.post<PlatformAdmin>("/admin/admins", data),
  disableAdmin: (id: string) => adminClient.post(`/admin/admins/${id}/disable`),
  enableAdmin: (id: string) => adminClient.post(`/admin/admins/${id}/enable`),

  audit: (page = 1, page_size = 50) =>
    adminClient.get<PlatformAudit[]>("/admin/audit", { params: { page, page_size } }),

  beginMFA: () => adminClient.post<{ otpauth_url: string; secret: string }>("/admin/mfa/begin"),
  verifyMFA: (code: string) => adminClient.post("/admin/mfa/verify", { code }),
};

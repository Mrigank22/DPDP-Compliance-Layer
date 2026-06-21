import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import Cookie from "js-cookie";
import type { ApiEnvelope } from "@/lib/api-client";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

/** Cookie holding the platform-admin session token (separate from tenant auth). */
export const ADMIN_COOKIE = "dsAdminToken";

/**
 * Dedicated HTTP client for the platform super-admin console. It authenticates
 * with the platform token (never the tenant token) and, on 401, drops the
 * session and returns the operator to /admin/login.
 */
class AdminClient {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: { "Content-Type": "application/json" },
    });

    this.instance.interceptors.request.use((config) => {
      const token = Cookie.get(ADMIN_COOKIE);
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    this.instance.interceptors.response.use(
      (res) => res,
      (error) => {
        const status = error.response?.status;
        const url: string = error.config?.url ?? "";
        if (status === 401 && !url.includes("/admin/auth/login")) {
          Cookie.remove(ADMIN_COOKIE);
          if (
            typeof window !== "undefined" &&
            !window.location.pathname.startsWith("/admin/login")
          ) {
            window.location.href = "/admin/login";
          }
        }
        return Promise.reject(error);
      },
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiEnvelope<T>> {
    return (await this.instance.get<ApiEnvelope<T>>(url, config)).data;
  }
  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiEnvelope<T>> {
    return (await this.instance.post<ApiEnvelope<T>>(url, data, config)).data;
  }
  async del<T>(url: string, config?: AxiosRequestConfig): Promise<ApiEnvelope<T>> {
    return (await this.instance.delete<ApiEnvelope<T>>(url, config)).data;
  }
}

export const adminClient = new AdminClient();

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";
import Cookie from "js-cookie";

/**
 * Standard response envelope used by every control-plane endpoint:
 *   { data, meta?, error?, request_id }
 */
export interface Pagination {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface MetaBlock {
  pagination?: Pagination;
  extra?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiEnvelope<T = unknown> {
  data: T;
  meta?: MetaBlock;
  error?: ApiError | null;
  request_id: string;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";

class APIClient {
  private instance: AxiosInstance;
  private refreshing: Promise<string | null> | null = null;

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE_URL,
      timeout: Number(process.env.NEXT_PUBLIC_API_TIMEOUT) || 30000,
      headers: { "Content-Type": "application/json" },
    });

    this.instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = Cookie.get(ACCESS_COOKIE);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
    );

    this.instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const original = error.config as
          | (InternalAxiosRequestConfig & { _retry?: boolean })
          | undefined;

        const status = error.response?.status;
        const isAuthRoute = original?.url?.includes("/auth/");

        // Attempt a single transparent refresh on 401.
        if (status === 401 && original && !original._retry && !isAuthRoute) {
          original._retry = true;
          const newToken = await this.tryRefresh();
          if (newToken) {
            original.headers.Authorization = `Bearer ${newToken}`;
            return this.instance(original);
          }
          this.forceLogout();
        }

        return Promise.reject(error);
      },
    );
  }

  /** Deduplicated refresh-token exchange. Returns the new access token or null. */
  private async tryRefresh(): Promise<string | null> {
    const refreshToken = Cookie.get(REFRESH_COOKIE);
    if (!refreshToken) return null;

    if (!this.refreshing) {
      this.refreshing = axios
        .post<ApiEnvelope<{ access_token: string; refresh_token: string; expires_in: number }>>(
          `${API_BASE_URL}/auth/refresh`,
          { refresh_token: refreshToken },
          { headers: { "Content-Type": "application/json" } },
        )
        .then((res) => {
          const payload = res.data?.data;
          if (!payload?.access_token) return null;
          Cookie.set(ACCESS_COOKIE, payload.access_token, { expires: 1, sameSite: "lax" });
          Cookie.set(REFRESH_COOKIE, payload.refresh_token, { expires: 7, sameSite: "lax" });
          return payload.access_token;
        })
        .catch(() => null)
        .finally(() => {
          this.refreshing = null;
        });
    }

    return this.refreshing;
  }

  private forceLogout() {
    Cookie.remove(ACCESS_COOKIE);
    Cookie.remove(REFRESH_COOKIE);
    if (typeof window !== "undefined") {
      localStorage.removeItem("user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
  }

  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<ApiEnvelope<T>> {
    const res = await this.instance.get<ApiEnvelope<T>>(url, config);
    return res.data;
  }

  /** Fetch a binary payload (e.g. a file download) as a Blob, with auth + refresh. */
  async getBlob(url: string, config?: AxiosRequestConfig): Promise<Blob> {
    const res = await this.instance.get(url, { ...config, responseType: "blob" });
    return res.data as Blob;
  }

  async post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiEnvelope<T>> {
    const res = await this.instance.post<ApiEnvelope<T>>(url, data, config);
    return res.data;
  }

  async put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiEnvelope<T>> {
    const res = await this.instance.put<ApiEnvelope<T>>(url, data, config);
    return res.data;
  }

  async patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiEnvelope<T>> {
    const res = await this.instance.patch<ApiEnvelope<T>>(url, data, config);
    return res.data;
  }

  async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<ApiEnvelope<T>> {
    const res = await this.instance.delete<ApiEnvelope<T>>(url, config);
    return res.data;
  }
}

export const apiClient = new APIClient();

/** Extract a human-readable message from any thrown API error. */
export function getApiErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (axios.isAxiosError(err)) {
    const envelope = err.response?.data as ApiEnvelope | undefined;
    if (envelope?.error?.message) return envelope.error.message;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/** Extract the structured error code (e.g. "forbidden") if present. */
export function getApiErrorCode(err: unknown): string | null {
  if (axios.isAxiosError(err)) {
    const envelope = err.response?.data as ApiEnvelope | undefined;
    return envelope?.error?.code ?? null;
  }
  return null;
}


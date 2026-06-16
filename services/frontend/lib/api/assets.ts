import { apiClient } from "@/lib/api-client";
import {
  Asset,
  CreateAssetInput,
  UpdateAssetInput,
  AssetListFilter,
  Scan,
  Finding,
  DataFlow,
  TriggerScanInput,
} from "@/types/api";

export const assetsAPI = {
  list: (filters?: AssetListFilter) =>
    apiClient.get<Asset[]>("/assets", { params: filters }),

  get: (id: string) => apiClient.get<Asset>(`/assets/${id}`),

  create: (data: CreateAssetInput) => apiClient.post<Asset>("/assets", data),

  update: (id: string, data: UpdateAssetInput) =>
    apiClient.patch<Asset>(`/assets/${id}`, data),

  delete: (id: string) => apiClient.delete(`/assets/${id}`),

  testConnection: (id: string) =>
    apiClient.post<{ success: boolean; message: string }>(`/assets/${id}/test-connection`),

  listScans: (assetId: string) =>
    apiClient.get<Scan[]>(`/assets/${assetId}/scans`),

  listFindings: (assetId: string) =>
    apiClient.get<Finding[]>(`/assets/${assetId}/findings`),

  triggerScan: (assetId: string, data: TriggerScanInput) =>
    apiClient.post<Scan>(`/assets/${assetId}/scan`, data),

  listDataFlows: (assetId: string) =>
    apiClient.get<DataFlow[]>(`/assets/${assetId}/data-flows`),
};


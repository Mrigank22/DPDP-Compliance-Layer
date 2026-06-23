import { apiClient } from "@/lib/api-client";

export interface CustomPIIType {
  key: string;
  label: string;
  regex: string;
  score: number;
  enabled: boolean;
}

export interface IgnorePattern {
  pattern: string;
  note: string;
}

export interface DetectionSettings {
  id?: string;
  tenant_id?: string;
  confidence_threshold: number;
  custom_pii_types: CustomPIIType[];
  ignore_patterns: IgnorePattern[];
  updated_at?: string;
}

export interface UpsertDetectionSettingsInput {
  confidence_threshold: number;
  custom_pii_types: CustomPIIType[];
  ignore_patterns: IgnorePattern[];
}

export const detectionAPI = {
  get: () => apiClient.get<DetectionSettings>("/detection-settings"),
  update: (data: UpsertDetectionSettingsInput) =>
    apiClient.put<DetectionSettings>("/detection-settings", data),
};

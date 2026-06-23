import { apiClient } from "@/lib/api-client";

export interface LineageAsset {
  id: string;
  name: string;
  asset_type: string;
  provider: string;
  region?: string | null;
  pii_types: string[];
  pii_record_count: number;
  risk_score: number;
  flow_count: number;
}

export interface LineageDestination {
  key: string;
  url: string;
  host: string;
  destination_type: string;
  pii_types: string[];
  event_count: number;
  approved: boolean;
  flow_count: number;
  external: boolean;
}

export interface LineageEdge {
  id: string;
  source_asset_id?: string | null;
  destination_key: string;
  destination_type: string;
  pii_types: string[];
  approved: boolean;
  event_count: number;
  last_seen_at: string;
}

export interface LineageSummary {
  asset_count: number;
  destination_count: number;
  flow_count: number;
  unapproved_flows: number;
  external_destinations: number;
}

export interface LineageGraph {
  assets: LineageAsset[];
  destinations: LineageDestination[];
  edges: LineageEdge[];
  summary: LineageSummary;
}

export const lineageAPI = {
  get: () => apiClient.get<LineageGraph>("/lineage"),
};

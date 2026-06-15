"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Shield,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Trash2,
  Eye,
  RefreshCw,
} from "lucide-react";
import { ASSET_TYPES, PROVIDERS } from "@/types/api";


export default function AssetsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    asset_type: "s3_bucket" as typeof ASSET_TYPES[number],
    provider: "aws" as typeof PROVIDERS[number],
    region: "",
    connection_config: {},
  });

  // Fetch assets
  const { data: assets, isLoading } = useQuery({
    queryKey: ["assets", search, filterType, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (filterType !== "all") params.append("asset_type", filterType);
      if (filterStatus !== "all") params.append("status", filterStatus);
      const response = await apiClient.get(`/assets?${params.toString()}`);
      return response.data.data || [];
    },
  });

  // Create asset mutation
  const createAssetMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiClient.post("/assets", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      setDialogOpen(false);
      setFormData({
        name: "",
        asset_type: "s3_bucket",
        provider: "aws",
        region: "",
        connection_config: {},
      });
    },
  });

  // Delete asset mutation
  const deleteAssetMutation = useMutation({
    mutationFn: async (assetId: string) => {
      await apiClient.delete(`/assets/${assetId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  // Scan asset mutation
  const scanAssetMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const response = await apiClient.post(`/assets/${assetId}/scan`, {
        scan_type: "full",
      });
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const handleCreateAsset = async () => {
    if (!formData.name) {
      alert("Asset name is required");
      return;
    }
    await createAssetMutation.mutateAsync(formData);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "connected":
        return <CheckCircle className="h-4 w-4 text-emerald-400" />;
      case "scanning":
        return (
          <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
        );
      case "error":
        return <AlertTriangle className="h-4 w-4 text-red-400" />;
      default:
        return <Shield className="h-4 w-4 text-slate-400" />;
    }
  };

  const getRiskColor = (score: number) => {
    if (score > 70) return "critical";
    if (score > 40) return "high";
    if (score > 20) return "medium";
    return "low";
  };

  const filteredAssets = (assets || []).filter((asset: any) => {
    if (search && !asset.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Assets</h1>
          <p className="text-slate-400 mt-1">
            Manage and monitor your data assets
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Connect Asset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect New Asset</DialogTitle>
              <DialogDescription>
                Add a new data asset to monitor and scan
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-300">
                  Asset Name
                </label>
                <Input
                  placeholder="e.g., Production S3 Bucket"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">
                  Asset Type
                </label>
                <Select
                  value={formData.asset_type}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, asset_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">
                  Provider
                </label>
                <Select
                  value={formData.provider}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, provider: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {provider.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">
                  Region
                </label>
                <Input
                  placeholder="e.g., ap-south-1"
                  value={formData.region}
                  onChange={(e) =>
                    setFormData({ ...formData, region: e.target.value })
                  }
                />
              </div>

              <Button
                onClick={handleCreateAsset}
                disabled={createAssetMutation.isPending}
              >
                {createAssetMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Asset"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex gap-4"
      >
        <Input
          placeholder="Search assets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ASSET_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="connected">Connected</SelectItem>
            <SelectItem value="scanning">Scanning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Assets Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </CardContent>
        </Card>
      ) : filteredAssets.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Alert>
              <AlertDescription>
                No assets found. Connect your first asset to get started.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      Provider
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      Risk Score
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      PII Records
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      Last Scanned
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((asset: any) => (
                    <motion.tr
                      key={asset.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-slate-700 hover:bg-slate-800 transition"
                    >
                      <td className="px-6 py-3 text-sm text-slate-100">
                        {asset.name}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-300">
                        {asset.asset_type.replace(/_/g, " ")}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-300">
                        {asset.provider.toUpperCase()}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(asset.status)}
                          <span className="capitalize text-slate-300">
                            {asset.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <Badge variant={getRiskColor(asset.risk_score)}>
                          {asset.risk_score}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-300">
                        {asset.pii_record_count.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-400">
                        {asset.last_scanned_at
                          ? new Date(asset.last_scanned_at).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              scanAssetMutation.mutate(asset.id)
                            }
                            disabled={scanAssetMutation.isPending}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteAssetMutation.mutate(asset.id)}
                            disabled={deleteAssetMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}


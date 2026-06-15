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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Loader2,
  Trash2,
  Edit2,
  Eye,
  Copy,
  Settings,
} from "lucide-react";
import { POLICY_TYPES, ENFORCEMENT_MODES } from "@/types/api";

export default function PoliciesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    policy_type: "data_masking" as typeof POLICY_TYPES[number],
    enforcement_mode: "alert" as typeof ENFORCEMENT_MODES[number],
    priority: 100,
    rules: {},
  });

  // Fetch policies
  const { data: policies, isLoading } = useQuery({
    queryKey: ["policies", search, filterType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (filterType !== "all") params.append("policy_type", filterType);
      const response = await apiClient.get(`/policies?${params.toString()}`);
      return response.data.data || [];
    },
  });

  // Create policy mutation
  const createPolicyMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiClient.post("/policies", data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      setDialogOpen(false);
      setFormData({
        name: "",
        description: "",
        policy_type: "data_masking",
        enforcement_mode: "alert",
        priority: 100,
        rules: {},
      });
    },
  });

  // Delete policy mutation
  const deletePolicyMutation = useMutation({
    mutationFn: async (policyId: string) => {
      await apiClient.delete(`/policies/${policyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
    },
  });

  // Activate/Deactivate policy mutation
  const togglePolicyMutation = useMutation({
    mutationFn: async (policyId: string) => {
      const response = await apiClient.post(`/policies/${policyId}/activate`);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
    },
  });

  const handleCreatePolicy = async () => {
    if (!formData.name) {
      alert("Policy name is required");
      return;
    }
    await createPolicyMutation.mutateAsync(formData);
  };

  const filteredPolicies = (policies || []).filter((policy: any) => {
    if (search && !policy.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (filterStatus !== "all" && policy.status !== filterStatus) {
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
          <h1 className="text-3xl font-bold text-slate-100">Policies</h1>
          <p className="text-slate-400 mt-1">
            Define and manage data governance policies
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Policy
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Policy</DialogTitle>
              <DialogDescription>
                Configure a new data governance policy
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-300">
                  Policy Name
                </label>
                <Input
                  placeholder="e.g., Mask Aadhaar in API responses"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">
                  Description
                </label>
                <Textarea
                  placeholder="Describe what this policy does"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-300">
                    Policy Type
                  </label>
                  <Select
                    value={formData.policy_type}
                    onValueChange={(value: any) =>
                      setFormData({ ...formData, policy_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POLICY_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-300">
                    Enforcement Mode
                  </label>
                  <Select
                    value={formData.enforcement_mode}
                    onValueChange={(value: any) =>
                      setFormData({
                        ...formData,
                        enforcement_mode: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENFORCEMENT_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleCreatePolicy}
                disabled={createPolicyMutation.isPending}
              >
                {createPolicyMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Policy"
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
          placeholder="Search policies..."
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
            {POLICY_TYPES.map((type) => (
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
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Policies Grid */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </CardContent>
        </Card>
      ) : filteredPolicies.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-slate-400">
            No policies found. Create your first policy to get started.
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {filteredPolicies.map((policy: any) => (
            <motion.div
              key={policy.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{policy.name}</CardTitle>
                      <p className="text-xs text-slate-400 mt-1">
                        {policy.policy_type.replace(/_/g, " ")}
                      </p>
                    </div>
                    <Badge
                      variant={
                        policy.status === "active"
                          ? "success"
                          : policy.status === "draft"
                          ? "info"
                          : "low"
                      }
                    >
                      {policy.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-slate-300">
                    {policy.description || "No description"}
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Enforcement Mode:</span>
                    <Badge variant="low">{policy.enforcement_mode}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Priority:</span>
                    <span className="font-mono text-slate-200">
                      {policy.priority}
                    </span>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        deletePolicyMutation.mutate(policy.id)
                      }
                      disabled={deletePolicyMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}


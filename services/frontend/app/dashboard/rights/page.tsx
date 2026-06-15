"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rightsAPI } from "@/lib/api/rights";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ClipboardList,
} from "lucide-react";
import { RIGHTS_TYPES, RIGHTS_STATUSES } from "@/types/api";

export default function RightsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [formData, setFormData] = useState({
    request_type: "access" as typeof RIGHTS_TYPES[number],
    data_principal_email: "",
    data_principal_name: "",
    notes: "",
  });

  // Fetch rights requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ["rights-requests", filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.append("status", filterStatus);
      const response = await rightsAPI.list({ status: filterStatus !== "all" ? filterStatus : undefined });
      return response.data.data || [];
    },
  });

  // Create rights request mutation
  const createRequestMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await rightsAPI.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rights-requests"] });
      setDialogOpen(false);
      setFormData({
        request_type: "access",
        data_principal_email: "",
        data_principal_name: "",
        notes: "",
      });
    },
  });

  const handleCreateRequest = async () => {
    if (!formData.data_principal_email) {
      alert("Email is required");
      return;
    }
    await createRequestMutation.mutateAsync(formData);
  };

  const getDaysUntilDue = (dueDate: string) => {
    const days = Math.ceil(
      (new Date(dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return days;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "in_progress":
        return "info";
      case "received":
        return "medium";
      case "rejected":
        return "critical";
      default:
        return "low";
    }
  };

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
          <h1 className="text-3xl font-bold text-slate-100">
            Data Subject Rights
          </h1>
          <p className="text-slate-400 mt-1">Manage DPDP rights requests</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Rights Request</DialogTitle>
              <DialogDescription>
                Create a new data subject rights request
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-300">
                  Request Type
                </label>
                <Select
                  value={formData.request_type}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, request_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RIGHTS_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">
                  Data Principal Email
                </label>
                <Input
                  type="email"
                  placeholder="principal@example.com"
                  value={formData.data_principal_email}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      data_principal_email: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">
                  Data Principal Name
                </label>
                <Input
                  placeholder="John Doe"
                  value={formData.data_principal_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      data_principal_name: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">
                  Notes
                </label>
                <Textarea
                  placeholder="Add any notes about this request..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                />
              </div>

              <Button
                onClick={handleCreateRequest}
                disabled={createRequestMutation.isPending}
              >
                {createRequestMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Request"
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
      >
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {RIGHTS_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Requests List */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </CardContent>
        </Card>
      ) : (requests || []).length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-slate-400">
            No rights requests found.
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="space-y-4"
        >
          {(requests || []).map((request: any) => {
            const daysLeft = getDaysUntilDue(request.due_date);
            const isOverdue = daysLeft < 0;

            return (
              <motion.div
                key={request.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <ClipboardList className="h-5 w-5 text-blue-400" />
                          <h3 className="text-lg font-semibold text-slate-100">
                            {request.data_principal_name || "Unknown"}
                          </h3>
                          <Badge variant={getStatusColor(request.status)}>
                            {request.status}
                          </Badge>
                          {isOverdue && (
                            <Badge variant="critical">Overdue</Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-4 text-sm mt-3">
                          <div>
                            <p className="text-slate-500">Request Type</p>
                            <p className="text-slate-200">
                              {request.request_type.charAt(0).toUpperCase() +
                                request.request_type.slice(1)}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Email</p>
                            <p className="text-slate-200 truncate">
                              {request.data_principal_email}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Created</p>
                            <p className="text-slate-200">
                              {new Date(
                                request.created_at
                              ).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Due</p>
                            <p className={daysLeft < 7 ? "text-red-400" : "text-slate-200"}>
                              {daysLeft} days{isOverdue ? " (overdue)" : ""}
                            </p>
                          </div>
                        </div>
                        {request.notes && (
                          <p className="text-sm text-slate-400 mt-3">
                            {request.notes}
                          </p>
                        )}
                      </div>
                      <Button variant="outline" size="sm" className="ml-4">
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}


"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Bell, CheckCircle, Loader2, Trash2 } from "lucide-react";
import { ALERT_TYPES, SEVERITY_LEVELS } from "@/types/api";

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterRead, setFilterRead] = useState("unread");

  // Fetch alerts
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["alerts", filterType, filterSeverity, filterRead],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterType !== "all") params.append("alert_type", filterType);
      if (filterSeverity !== "all") params.append("severity", filterSeverity);
      if (filterRead === "unread") params.append("is_acknowledged", "false");
      if (filterRead === "read") params.append("is_acknowledged", "true");
      const response = await apiClient.get(`/alerts?${params.toString()}`);
      return response.data.data || [];
    },
  });

  // Acknowledge alert mutation
  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const response = await apiClient.post(`/alerts/${alertId}/acknowledge`);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  // Delete alert mutation
  const deleteAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      await apiClient.delete(`/alerts/${alertId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  // Acknowledge all mutation
  const acknowledgeAllMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post("/alerts/acknowledge-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "critical";
      case "high":
        return "high";
      case "medium":
        return "medium";
      case "low":
        return "low";
      default:
        return "info";
    }
  };

  const getSeverityIcon = (severity: string) => {
    if (severity === "critical" || severity === "high") {
      return <AlertTriangle className="h-5 w-5 text-red-400" />;
    }
    return <Bell className="h-5 w-5 text-yellow-400" />;
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
          <h1 className="text-3xl font-bold text-slate-100">Alerts</h1>
          <p className="text-slate-400 mt-1">
            Monitor security and compliance alerts
          </p>
        </div>
        <Button
          onClick={() => acknowledgeAllMutation.mutate()}
          disabled={acknowledgeAllMutation.isPending}
          variant="outline"
        >
          Acknowledge All
        </Button>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex gap-4"
      >
        <Select value={filterRead} onValueChange={setFilterRead}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ALERT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            {SEVERITY_LEVELS.map((level) => (
              <SelectItem key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Alerts List */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </CardContent>
        </Card>
      ) : (alerts || []).length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-slate-400">
            No alerts found! All quiet on the compliance front.
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="space-y-4"
        >
          {(alerts || []).map((alert: any) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Card
                className={
                  !alert.is_acknowledged ? "border-blue-600" : ""
                }
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4 flex-1">
                      <div className="flex-shrink-0">
                        {getSeverityIcon(alert.severity)}
                     </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-slate-100">
                            {alert.title}
                          </h3>
                          <Badge variant={getSeverityColor(alert.severity)}>
                            {alert.severity}
                          </Badge>
                          {alert.is_acknowledged && (
                            <Badge variant="success">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Acknowledged
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-300 mb-2">
                          {alert.body}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          <span>{alert.alert_type.replace(/_/g, " ")}</span>
                          <span>•</span>
                          <span>
                            {new Date(alert.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      {!alert.is_acknowledged && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            acknowledgeAlertMutation.mutate(alert.id)
                          }
                          disabled={acknowledgeAlertMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteAlertMutation.mutate(alert.id)}
                        disabled={deleteAlertMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
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


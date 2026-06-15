"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  Zap,
  AlertTriangle,
  Loader2,
  Pause,
  Play,
} from "lucide-react";

export default function GatewayPage() {
  const [filterAction, setFilterAction] = useState("all");
  const [filterPiiType, setFilterPiiType] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch gateway stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["gateway-stats"],
    queryFn: async () => {
      const response = await apiClient.get("/gateway/stats");
      return response.data.data;
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });

  // Fetch gateway events - using mock data since /gateway/events endpoint doesn't exist
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["gateway-events", filterAction, filterPiiType],
    queryFn: async () => {
      // Mock data for demo - replace with actual API call when endpoint is available
      return [
        {
          id: "1",
          timestamp: new Date().toISOString(),
          request_id: "req_123",
          source_ip: "192.168.1.1",
          destination_url: "https://api.example.com/users",
          http_method: "POST",
          action_taken: "masked",
          pii_types_detected: ["email", "name"],
          field_names: ["email", "full_name"],
          payload_size_bytes: 1024,
          processing_latency_ms: 15,
        },
      ];
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });

  // Fetch gateway stats trend
  const { data: statsTrend } = useQuery({
    queryKey: ["gateway-stats-trend"],
    queryFn: async () => {
      // Mock data for demo - replace with actual API call
      return [
        { time: "00:00", requests: 340, blocked: 34, masked: 102 },
        { time: "04:00", requests: 420, blocked: 42, masked: 126 },
        { time: "08:00", requests: 350, blocked: 35, masked: 105 },
        { time: "12:00", requests: 480, blocked: 48, masked: 144 },
        { time: "16:00", requests: 520, blocked: 52, masked: 156 },
        { time: "20:00", requests: 450, blocked: 45, masked: 135 },
      ];
    },
  });

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

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
            Enforcement Gateway
          </h1>
          <p className="text-slate-400 mt-1">
            Real-time traffic inspection and policy enforcement
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm flex items-center gap-2"
          >
            {autoRefresh ? (
              <>
                <Pause className="h-4 w-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Resume
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Requests/sec</p>
                  <p className="text-2xl font-bold text-slate-100 mt-2">
                    {stats?.requests_per_second?.toFixed(1) || "0"}
                  </p>
                </div>
                <Activity className="h-8 w-8 text-blue-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Block Rate</p>
                  <p className="text-2xl font-bold text-slate-100 mt-2">
                    {(stats?.block_rate * 100)?.toFixed(1) || "0"}%
                  </p>
                </div>
                <Zap className="h-8 w-8 text-red-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Avg Latency</p>
                  <p className="text-2xl font-bold text-slate-100 mt-2">
                    {stats?.average_latency_ms?.toFixed(1) || "0"}ms
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Top PII Type</p>
                  <p className="text-lg font-bold text-slate-100 mt-2">
                    {stats?.top_pii_type?.toUpperCase() || "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Gateway Activity (24 hours)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={statsTrend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #334155",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="requests"
                  stroke="#3b82f6"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="blocked"
                  stroke="#ef4444"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="masked"
                  stroke="#f59e0b"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Events */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Recent Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {eventsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : (events || []).length === 0 ? (
                <p className="text-center text-slate-400 py-8">
                  No recent events
                </p>
              ) : (
                (events || []).slice(0, 10).map((event: any) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-4 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 text-sm">
                        <div className="text-slate-100 font-medium">
                          {event.destination_url}
                        </div>
                        <div className="text-slate-400 text-xs mt-1">
                          {event.source_ip} • {event.http_method}
                        </div>
                        <div className="flex gap-2 mt-2">
                          {(event.pii_types_detected || []).map(
                            (type: string) => (
                              <Badge key={type} variant="low" className="text-xs">
                                {type}
                              </Badge>
                            )
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge
                          variant={
                            event.action_taken === "blocked"
                              ? "critical"
                              : event.action_taken === "masked"
                              ? "medium"
                              : "success"
                          }
                        >
                          {event.action_taken}
                        </Badge>
                        <span className="text-xs text-slate-400">
                          {event.processing_latency_ms}ms
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}


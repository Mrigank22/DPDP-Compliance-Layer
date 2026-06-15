"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store/auth.store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  Users,
  Shield,
  Plus,
} from "lucide-react";
import gsap from "gsap";

const severityColors: Record<string, string> = {
  critical: "#dc2626",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [animatedRiskScore, setAnimatedRiskScore] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const response = await apiClient.get("/dashboard");
      return response.data.data;
    },
  });

  // Fetch findings trends
  const { data: findingsTrends } = useQuery({
    queryKey: ["findings-trends"],
    queryFn: async () => {
      const response = await apiClient.get("/findings/trends");
      return response.data.data;
    },
  });

  // Fetch PII distribution
  const { data: piiDistribution } = useQuery({
    queryKey: ["pii-distribution"],
    queryFn: async () => {
      const response = await apiClient.get("/findings/summary");
      const summary = response.data.data;
      return Object.entries(summary.by_pii_type || {}).map(
        ([type, count]: any) => ({
          name: type.toUpperCase(),
          value: count,
        })
      );
    },
  });

  // Animate risk score
  useEffect(() => {
    if (stats?.risk_score) {
      const tl = gsap.timeline();
      tl.to(
        { value: 0 },
        {
          value: stats.risk_score,
          duration: 2,
          ease: "power2.out",
          onUpdate: function () {
            setAnimatedRiskScore(Math.round(this.targets()[0].value));
          },
        }
      );
    }
  }, [stats?.risk_score]);

  const StatCard = ({
    title,
    value,
    icon: Icon,
    trend,
  }: {
    title: string;
    value: number;
    icon: any;
    trend?: number;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">{title}</p>
              <p className="text-2xl font-bold text-slate-100 mt-2">{value}</p>
              {trend && (
                <p className="text-xs text-emerald-400 mt-1">
                  <TrendingUp className="inline h-3 w-3 mr-1" />
                  {trend}% growth
                </p>
              )}
            </div>
            <div className="h-12 w-12 rounded-lg bg-blue-600 bg-opacity-20 flex items-center justify-center">
              <Icon className="h-6 w-6 text-blue-400" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-slate-400">Loading dashboard...</div>
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
      >
        <h1 className="text-3xl font-bold text-slope-100">
          Welcome, {user?.full_name || "User"}!
        </h1>
        <p className="text-slate-400 mt-1">
          Monitor your data governance and DPDP compliance posture
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Assets"
          value={stats?.total_assets || 0}
          icon={Shield}
        />
        <StatCard
          title="Active Policies"
          value={stats?.active_policies || 0}
          icon={Activity}
        />
        <StatCard
          title="Critical Findings"
          value={stats?.critical_findings || 0}
          icon={AlertTriangle}
        />
        <StatCard
          title="Unresolved Violations"
          value={stats?.unresolved_violations || 0}
          icon={Users}
        />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-slate-400">Risk Score</p>
              <div className="flex items-center justify-between mt-2">
                <div className="text-3xl font-bold text-slate-100">
                  {animatedRiskScore}
                </div>
                <div
                  className="h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    backgroundColor:
                      animatedRiskScore > 70
                        ? "rgba(220, 38, 38, 0.2)"
                        : animatedRiskScore > 40
                        ? "rgba(249, 115, 22, 0.2)"
                        : "rgba(34, 197, 94, 0.2)",
                    color:
                      animatedRiskScore > 70
                        ? "#dc2626"
                        : animatedRiskScore > 40
                        ? "#f97316"
                        : "#22c55e",
                  }}
                >
                  {animatedRiskScore}%
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Findings Trend */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Findings Trend (30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={findingsTrends || []}>
                  <defs>
                    <linearGradient id="colorFindings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      border: "1px solid #334155",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#2563eb"
                    fillOpacity={1}
                    fill="url(#colorFindings)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* PII Distribution */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>PII Type Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={piiDistribution || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) =>
                      `${name}: ${value}`
                    }
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {(piiDistribution || []).map((_: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={Object.values(severityColors)[
                          index % Object.values(severityColors).length
                        ] as string}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      border: "1px solid #334155",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Button className="flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" />
                Connect Asset
              </Button>
              <Button className="flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" />
                Create Policy
              </Button>
              <Button className="flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" />
                Generate Report
              </Button>
              <Button className="flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" />
                Add Team Member
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}


"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertCircle, TrendingUp, Shield, AlertTriangle, Database } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { DashboardStats, DPDPStatus, GatewayStats } from "@/types/api";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Stats Card Component
const StatsCard = ({
  icon: Icon,
  title,
  value,
  change,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  change?: string;
  color: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <Card className="p-6 border-slate-700 bg-slate-800">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          <p className={`text-3xl font-bold mt-2 ${color}`}>{value}</p>
          {change && (
            <p className="text-xs text-slate-400 mt-2">{change}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color.replace("text-", "bg-").replace("600", "600").replace("500", "500")} bg-opacity-20`}>
          {Icon}
        </div>
      </div>
    </Card>
  </motion.div>
);

// Risk Gauge Component
const RiskGauge = ({ score }: { score: number }) => {
  const percentage = (score / 100) * 100;
  const color = score <= 30 ? "text-green-500" : score <= 70 ? "text-yellow-500" : "text-red-500";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="p-8 border-slate-700 bg-slate-800">
        <h3 className="text-lg font-semibold text-slate-100 mb-6">Risk Score</h3>
        <div className="flex items-center justify-center">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-slate-700"
              />
              <motion.circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeDasharray={`${percentage * 2.83} 283`}
                className={color}
                initial={{ strokeDasharray: "0 283" }}
                animate={{ strokeDasharray: `${percentage * 2.83} 283` }}
                transition={{ duration: 1, ease: "easeOut" }}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <span className={`text-4xl font-bold ${color}`}>{score}</span>
              </motion.div>
            </div>
          </div>
        </div>
        <p className="text-center text-slate-400 text-sm mt-4">
          {score <= 30
            ? "Low Risk - Excellent Compliance"
            : score <= 70
            ? "Medium Risk - Review Required"
            : "High Risk - Immediate Action Needed"}
        </p>
      </Card>
    </motion.div>
  );
};

// PII Distribution Chart
const PIIDistribution = ({ data }: { data: Record<string, number> }) => {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const colors = {
    aadhaar: "bg-blue-600",
    pan: "bg-purple-600",
    phone: "bg-pink-600",
    email: "bg-yellow-600",
    bank_account: "bg-green-600",
    upi: "bg-indigo-600",
    other: "bg-slate-600",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <Card className="p-6 border-slate-700 bg-slate-800">
        <h3 className="text-lg font-semibold text-slate-100 mb-6">PII Distribution</h3>
        <div className="space-y-3">
          {Object.entries(data).map(([type, count]) => (
            <div key={type}>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-slate-300 capitalize">{type}</span>
                <span className="text-sm font-semibold text-slate-200">
                  {type === "total" ? 0 : Math.round((count / total) * 100)}%
                </span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${colors[type as keyof typeof colors] || colors.other}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(count / total) * 100}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
};

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: dashboard } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const response = await apiClient.get("/dashboard");
      return response.data.data;
    },
  });

  const { data: dpdpStatus } = useQuery({
    queryKey: ["dpdp-status"],
    queryFn: async () => {
      const response = await apiClient.get("/dashboard/dpdp-status");
      return response.data.data;
    },
  });

  const { data: trends } = useQuery({
    queryKey: ["trends"],
    queryFn: async () => {
      const response = await apiClient.get("/dashboard/trends");
      return response.data.data;
    },
  });

  if (!mounted) return null;

  const stats: DashboardStats = dashboard || {
    total_assets: 0,
    total_findings: 0,
    critical_findings: 0,
    unresolved_violations: 0,
    risk_score: 0,
    active_policies: 0,
  };

  const dpdp: DPDPStatus = dpdpStatus || {
    compliance_percentage: 0,
    critical_issues: 0,
    deadlines_approaching: 0,
    policies_active: 0,
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-slate-100 mb-2">Dashboard</h1>
        <p className="text-slate-400">Welcome back! Here's your DPDP compliance overview.</p>
      </motion.div>

      {/* Critical Alerts */}
      {dpdp.critical_issues > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <Alert variant="destructive" className="bg-red-950 border-red-800">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You have {dpdp.critical_issues} critical issues that require immediate attention.
            </AlertDescription>
          </Alert>
        </motion.div>
      )}

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          icon={<Database className="h-6 w-6 text-blue-500" />}
          title="Connected Assets"
          value={stats.total_assets}
          color="text-blue-500"
        />
        <StatsCard
          icon={<AlertTriangle className="h-6 w-6 text-red-500" />}
          title="Critical Findings"
          value={stats.critical_findings}
          change={`${Math.round((stats.critical_findings / Math.max(stats.total_findings, 1)) * 100)}% of total`}
          color="text-red-500"
        />
        <StatsCard
          icon={<Shield className="h-6 w-6 text-green-500" />}
          title="Active Policies"
          value={stats.active_policies}
          color="text-green-500"
        />
        <StatsCard
          icon={<TrendingUp className="h-6 w-6 text-yellow-500" />}
          title="Compliance Score"
          value={`${dpdp.compliance_percentage}%`}
          change={dpdp.compliance_percentage >= 80 ? "✓ On Track" : "⚠ Needs Review"}
          color={dpdp.compliance_percentage >= 80 ? "text-green-500" : "text-yellow-500"}
        />
      </div>

      {/* Risk Score & PII Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-1">
          <RiskGauge score={stats.risk_score} />
        </div>
        <div className="lg:col-span-2">
          <PIIDistribution data={dashboard?.pii_distribution || {}} />
        </div>
      </div>

      {/* DPDP Compliance Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card className="p-6 border-slate-700 bg-slate-800">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">DPDP Compliance Status</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-3 border-b border-slate-700">
              <span className="text-slate-300">Compliance Score</span>
              <span className="text-2xl font-bold text-green-500">{dpdp.compliance_percentage}%</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-700">
              <span className="text-slate-300">Critical Issues</span>
              <span className={`font-semibold ${dpdp.critical_issues > 0 ? "text-red-500" : "text-green-500"}`}>
                {dpdp.critical_issues}
              </span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-700">
              <span className="text-slate-300">Deadlines Approaching</span>
              <span className="font-semibold text-yellow-500">{dpdp.deadlines_approaching}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-300">Active Policies</span>
              <span className="font-semibold text-blue-500">{dpdp.policies_active}</span>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Footer Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="mt-8 text-center text-slate-500 text-sm"
      >
        <p>Last updated: {new Date().toLocaleString()}</p>
      </motion.div>
    </div>
  );
}


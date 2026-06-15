"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reportsAPI } from "@/lib/api/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Download,
  FileText,
  Loader2,
  Trash2,
  Calendar,
} from "lucide-react";
import { REPORT_TYPES } from "@/types/api";

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    report_type: "dpdp_compliance" as typeof REPORT_TYPES[number],
    title: "",
    dateRange: "30days",
  });

  // Fetch reports
  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const response = await reportsAPI.list();
      return response.data.data || [];
    },
  });

  // Generate report mutation
  const generateReportMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await reportsAPI.generate(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      setDialogOpen(false);
      setFormData({
        report_type: "dpdp_compliance",
        title: "",
        dateRange: "30days",
      });
    },
  });

  // Delete report mutation
  const deleteReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      await reportsAPI.delete(reportId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  const handleGenerateReport = async () => {
    if (!formData.title) {
      alert("Report title is required");
      return;
    }
    await generateReportMutation.mutateAsync({
      report_type: formData.report_type,
      title: formData.title,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "success";
      case "generating":
        return "info";
      case "failed":
        return "critical";
      default:
        return "info";
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
          <h1 className="text-3xl font-bold text-slate-100">Reports</h1>
          <p className="text-slate-400 mt-1">
            Generate compliance and analysis reports
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Generate Report
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate New Report</DialogTitle>
              <DialogDescription>
                Create a compliance or analysis report
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-300">
                  Report Type
                </label>
                <Select
                  value={formData.report_type}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, report_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">
                  Report Title
                </label>
                <Input
                  placeholder="e.g., March 2024 Compliance Report"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">
                  Date Range
                </label>
                <Select
                  value={formData.dateRange}
                  onValueChange={(value) =>
                    setFormData({ ...formData, dateRange: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7days">Last 7 days</SelectItem>
                    <SelectItem value="30days">Last 30 days</SelectItem>
                    <SelectItem value="90days">Last 90 days</SelectItem>
                    <SelectItem value="1year">Last year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleGenerateReport}
                disabled={generateReportMutation.isPending}
              >
                {generateReportMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Report"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Reports Grid */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </CardContent>
        </Card>
      ) : (reports || []).length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-slate-400">
            No reports generated yet. Create your first report to get started.
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {(reports || []).map((report: any) => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 text-blue-400 mt-1" />
                      <div>
                        <CardTitle className="text-lg">
                          {report.title}
                        </CardTitle>
                        <p className="text-xs text-slate-400 mt-1">
                          {report.report_type.replace(/_/g, " ")}
                        </p>
                      </div>
                    </div>
                    <Badge variant={getStatusColor(report.status)}>
                      {report.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Generated</span>
                    <span className="text-slate-200">
                      {new Date(report.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {report.file_size_bytes && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">File Size</span>
                      <span className="text-slate-200">
                        {(report.file_size_bytes / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4">
                    {report.status === "ready" && (
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          // Download report
                          window.open(report.file_url, "_blank");
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() =>
                        deleteReportMutation.mutate(report.id)
                      }
                      disabled={deleteReportMutation.isPending}
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


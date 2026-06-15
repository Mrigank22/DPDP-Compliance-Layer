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
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  ChevronDown,
  Eye,
} from "lucide-react";
import { SEVERITY_LEVELS, FINDING_TYPES } from "@/types/api";

export default function FindingsPage() {
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [selectedFinding, setSelectedFinding] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const queryClient = useQueryClient();

  // Fetch findings
  const { data: findings, isLoading } = useQuery({
    queryKey: ["findings", search, filterSeverity, filterType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterSeverity !== "all") params.append("severity", filterSeverity);
      if (filterType !== "all") params.append("finding_type", filterType);
      const response = await apiClient.get(`/findings?${params.toString()}`);
      return response.data.data || [];
    },
  });

  // Resolve finding mutation
  const resolveFindingMutation = useMutation({
    mutationFn: async (findingId: string) => {
      const response = await apiClient.patch(
        `/findings/${findingId}/resolve`,
        { resolution_note: resolutionNote }
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["findings"] });
      setDialogOpen(false);
      setSelectedFinding(null);
      setResolutionNote("");
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
      return <AlertTriangle className="h-4 w-4 text-red-400" />;
    }
    return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
  };

  const filteredFindings = (findings || []).filter((finding: any) => {
    if (
      search &&
      !finding.title.toLowerCase().includes(search.toLowerCase())
    ) {
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
      >
        <h1 className="text-3xl font-bold text-slate-100">Findings</h1>
        <p className="text-slate-400 mt-1">
          Review and resolve security and compliance findings
        </p>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex gap-4"
      >
        <Input
          placeholder="Search findings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
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
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {FINDING_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Findings List */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </CardContent>
        </Card>
      ) : filteredFindings.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-slate-400">
            No findings found. Great work keeping your data secure!
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="space-y-4"
        >
          {filteredFindings.map((finding: any) => (
            <motion.div
              key={finding.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getSeverityIcon(finding.severity)}
                        <h3 className="text-lg font-semibold text-slate-100">
                          {finding.title}
                        </h3>
                        <Badge variant={getSeverityColor(finding.severity)}>
                          {finding.severity}
                        </Badge>
                        {finding.is_resolved && (
                          <Badge variant="success">Resolved</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 mb-3">
                        {finding.description}
                      </p>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-500">Type</p>
                          <p className="text-slate-200">
                            {finding.finding_type.replace(/_/g, " ")}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">PII Types</p>
                          <div className="flex gap-1 mt-1">
                            {(finding.pii_types || []).map((type: string) => (
                              <Badge key={type} variant="low" className="text-xs">
                                {type}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-slate-500">Sample Count</p>
                          <p className="text-slate-200">
                            {finding.sample_count.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Found</p>
                          <p className="text-slate-200">
                            {new Date(finding.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    {!finding.is_resolved && (
                      <Dialog open={dialogOpen && selectedFinding?.id === finding.id} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            onClick={() => setSelectedFinding(finding)}
                            className="ml-4"
                          >
                            Resolve
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Resolve Finding</DialogTitle>
                            <DialogDescription>
                              Mark this finding as resolved with a note
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-slate-300">
                                Resolution Note
                              </label>
                              <Textarea
                                placeholder="Describe how this finding was resolved..."
                                value={resolutionNote}
                                onChange={(e) =>
                                  setResolutionNote(e.target.value)
                                }
                              />
                            </div>
                            <Button
                              onClick={() =>
                                resolveFindingMutation.mutate(finding.id)
                              }
                              disabled={resolveFindingMutation.isPending}
                            >
                              {resolveFindingMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Resolving...
                                </>
                              ) : (
                                "Mark as Resolved"
                              )}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
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


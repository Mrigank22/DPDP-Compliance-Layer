import { format, formatDistanceToNow, parseISO } from "date-fns";

export const formatDate = (date: string | Date) => {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM dd, yyyy");
};

export const formatTime = (date: string | Date) => {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "HH:mm:ss");
};

export const formatDateTime = (date: string | Date) => {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM dd, yyyy HH:mm:ss");
};

export const formatRelativeTime = (date: string | Date) => {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
};

export const getRiskScoreColor = (score: number) => {
  if (score >= 80) return "text-critical";
  if (score >= 60) return "text-high";
  if (score >= 40) return "text-medium";
  return "text-accent";
};

export const getRiskScoreHex = (score: number) => {
  if (score >= 80) return "#ff3b5c";
  if (score >= 60) return "#ff7a3d";
  if (score >= 40) return "#ffc23d";
  return "#00e5a0";
};

export const getRiskScoreBgColor = (score: number) => {
  if (score >= 80) return "bg-critical/12";
  if (score >= 60) return "bg-high/12";
  if (score >= 40) return "bg-medium/12";
  return "bg-accent/12";
};

/** Severity → shared Badge variant. */
export const severityVariant = (
  severity: string,
): "critical" | "high" | "medium" | "low" | "info" => {
  const map: Record<string, "critical" | "high" | "medium" | "low" | "info"> = {
    critical: "critical",
    high: "high",
    medium: "medium",
    low: "low",
    info: "info",
  };
  return map[severity] ?? "info";
};

export const getSeverityColor = (severity: string) => {
  const colors: Record<string, string> = {
    critical: "text-critical bg-critical/12 border border-critical/30",
    high: "text-high bg-high/12 border border-high/30",
    medium: "text-medium bg-medium/12 border border-medium/30",
    low: "text-low bg-low/12 border border-low/30",
    info: "text-info bg-info/12 border border-info/30",
  };
  return colors[severity] || colors.info;
};

export const getSeverityTextColor = (severity: string) => {
  const colors: Record<string, string> = {
    critical: "text-critical",
    high: "text-high",
    medium: "text-medium",
    low: "text-low",
    info: "text-info",
  };
  return colors[severity] || colors.info;
};

export const getSeverityHex = (severity: string) => {
  const colors: Record<string, string> = {
    critical: "#ff3b5c",
    high: "#ff7a3d",
    medium: "#ffc23d",
    low: "#3fb6ff",
    info: "#7d8aa3",
  };
  return colors[severity] || colors.info;
};

export const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    connected: "text-success bg-success/12 border border-success/30",
    disconnected: "text-faint bg-surface-3 border border-border",
    scanning: "text-accent-2 bg-accent-2/12 border border-accent-2/30",
    error: "text-critical bg-critical/12 border border-critical/30",
    active: "text-success bg-success/12 border border-success/30",
    inactive: "text-faint bg-surface-3 border border-border",
    draft: "text-violet bg-violet/12 border border-violet/30",
    completed: "text-success bg-success/12 border border-success/30",
    running: "text-accent-2 bg-accent-2/12 border border-accent-2/30",
    queued: "text-medium bg-medium/12 border border-medium/30",
    failed: "text-critical bg-critical/12 border border-critical/30",
    cancelled: "text-faint bg-surface-3 border border-border",
  };
  return colors[status] || "text-faint bg-surface-3 border border-border";
};

export const maskSensitiveData = (value: string, visibleChars: number = 4) => {
  if (value.length <= visibleChars) return "*".repeat(value.length);
  const visible = value.slice(-visibleChars);
  const masked = "*".repeat(value.length - visibleChars);
  return masked + visible;
};

export const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

export const pluralize = (count: number, singular: string, plural?: string) => {
  return count === 1 ? singular : plural || `${singular}s`;
};

export const formatNumber = (num: number) => {
  return new Intl.NumberFormat("en-US").format(num);
};

export const formatPercentage = (num: number, decimals: number = 1) => {
  return `${(num * 100).toFixed(decimals)}%`;
};


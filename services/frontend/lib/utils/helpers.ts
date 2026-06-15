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
  if (score >= 80) return "text-red-600";
  if (score >= 60) return "text-orange-500";
  if (score >= 40) return "text-yellow-500";
  return "text-green-600";
};

export const getRiskScoreBgColor = (score: number) => {
  if (score >= 80) return "bg-red-100 bg-opacity-20";
  if (score >= 60) return "bg-orange-100 bg-opacity-20";
  if (score >= 40) return "bg-yellow-100 bg-opacity-20";
  return "bg-green-100 bg-opacity-20";
};

export const getSeverityColor = (severity: string) => {
  const colors: Record<string, string> = {
    critical: "text-red-600 bg-red-100 bg-opacity-20",
    high: "text-orange-500 bg-orange-100 bg-opacity-20",
    medium: "text-yellow-500 bg-yellow-100 bg-opacity-20",
    low: "text-blue-400 bg-blue-100 bg-opacity-20",
    info: "text-gray-400 bg-gray-100 bg-opacity-20",
  };
  return colors[severity] || colors.info;
};

export const getSeverityTextColor = (severity: string) => {
  const colors: Record<string, string> = {
    critical: "text-red-600",
    high: "text-orange-500",
    medium: "text-yellow-500",
    low: "text-blue-400",
    info: "text-gray-400",
  };
  return colors[severity] || colors.info;
};

export const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    connected: "text-emerald-600 bg-emerald-100 bg-opacity-20",
    disconnected: "text-gray-400 bg-gray-100 bg-opacity-20",
    scanning: "text-blue-500 bg-blue-100 bg-opacity-20",
    error: "text-red-600 bg-red-100 bg-opacity-20",
    active: "text-emerald-600 bg-emerald-100 bg-opacity-20",
    inactive: "text-gray-400 bg-gray-100 bg-opacity-20",
    draft: "text-purple-600 bg-purple-100 bg-opacity-20",
  };
  return colors[status] || "text-gray-400 bg-gray-100 bg-opacity-20";
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


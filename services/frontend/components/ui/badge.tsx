import * as React from "react"
import { cn } from "@/lib/cn"

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "critical" | "high" | "medium" | "low" | "info" | "success"
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants = {
      default: "bg-surface-3 text-foreground border border-border-bright",
      critical: "bg-critical/12 text-critical border border-critical/30",
      high: "bg-high/12 text-high border border-high/30",
      medium: "bg-medium/12 text-medium border border-medium/30",
      low: "bg-low/12 text-low border border-low/30",
      info: "bg-info/12 text-info border border-info/30",
      success: "bg-success/12 text-success border border-success/30",
    }

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider",
          variants[variant],
          className
        )}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge }


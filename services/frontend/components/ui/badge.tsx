import * as React from "react"
import { cn } from "@/lib/cn"

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "critical" | "high" | "medium" | "low" | "info" | "success"
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants = {
      default: "bg-blue-600 text-white",
      critical: "bg-red-600 bg-opacity-20 text-red-400 border border-red-600 border-opacity-30",
      high: "bg-orange-500 bg-opacity-20 text-orange-400 border border-orange-500 border-opacity-30",
      medium: "bg-yellow-500 bg-opacity-20 text-yellow-300 border border-yellow-500 border-opacity-30",
      low: "bg-blue-400 bg-opacity-20 text-blue-300 border border-blue-400 border-opacity-30",
      info: "bg-gray-400 bg-opacity-20 text-gray-300 border border-gray-400 border-opacity-30",
      success: "bg-emerald-500 bg-opacity-20 text-emerald-400 border border-emerald-500 border-opacity-30"
    }

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
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


import * as React from "react"
import { cn } from "@/lib/cn"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const baseClasses =
      "inline-flex items-center justify-center gap-2 rounded-lg font-medium tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap"

    const variants = {
      default:
        "bg-accent text-bg font-semibold hover:bg-accent-dim shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_35%,transparent),0_8px_24px_-10px_color-mix(in_srgb,var(--color-accent)_60%,transparent)] active:translate-y-px",
      destructive:
        "bg-danger text-white font-semibold hover:brightness-110 active:translate-y-px",
      outline:
        "border border-border-bright bg-transparent text-foreground hover:bg-surface-2 hover:border-accent/50",
      secondary:
        "border border-border bg-surface-2 text-foreground hover:bg-surface-3 hover:border-border-bright",
      ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
    }

    const sizes = {
      default: "h-10 px-4 py-2 text-sm",
      sm: "h-8 px-3 text-xs",
      lg: "h-12 px-7 text-base",
      icon: "h-10 w-10",
    }

    return (
      <button
        className={cn(
          baseClasses,
          variants[variant],
          sizes[size],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }


import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/cn"

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, ...props }, ref) => (
    <label className={cn("relative inline-flex cursor-pointer items-center", className)}>
      <input
        type="checkbox"
        ref={ref}
        className="peer sr-only"
        checked={checked}
        {...props}
      />
      <span className="flex h-5 w-5 items-center justify-center rounded border border-border bg-surface-2 transition-colors peer-checked:border-accent peer-checked:bg-accent">
        {checked && <Check className="h-3.5 w-3.5 text-bg" strokeWidth={3} />}
      </span>
    </label>
  )
)
Checkbox.displayName = "Checkbox"

export { Checkbox }


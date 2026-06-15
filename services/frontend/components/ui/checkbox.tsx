import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/cn"

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    const [checked, setChecked] = React.useState(false)

    return (
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          ref={ref}
          className="sr-only"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          {...props}
        />
        <div
          className={cn(
            "h-5 w-5 rounded border border-slate-600 transition-colors",
            checked
              ? "bg-blue-600 border-blue-600"
              : "bg-slate-700 hover:bg-slate-600"
          )}
          onClick={() => setChecked(!checked)}
        >
          {checked && (
            <Check className="h-4 w-4 text-white" strokeWidth={3} />
          )}
        </div>
      </div>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }


import { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Section title block used at the top of each page. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent">
            {icon}
          </div>
        )}
        <div>
          {eyebrow && (
            <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.22em] text-accent/80">
              {eyebrow}
            </div>
          )}
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.7rem]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A bordered surface panel with optional header + actions. */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  glow,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  glow?: boolean;
}) {
  return (
    <section className={cn("panel overflow-hidden", glow && "panel-glow", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate font-display text-sm font-semibold uppercase tracking-wide text-foreground">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

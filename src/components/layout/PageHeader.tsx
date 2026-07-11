import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Standard page header used across the in-app pages: an optional azure
 * eyebrow + brand icon tile, the page title, a subtitle, and a right-aligned
 * actions slot (print buttons, CTAs). The eyebrow and icon tile carry
 * `print:hidden` so pages that print whole-page (Quotation, Cost Breakdown,
 * Materials, Tracking, Help) look unchanged on paper.
 */
export function PageHeader({
  eyebrow,
  icon: Icon,
  title,
  subtitle,
  actions,
  as = "h1",
  className,
}: {
  eyebrow?: string;
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
}) {
  const Title = as;
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="bg-brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm print:hidden">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 print:hidden">
              {eyebrow}
            </p>
          )}
          <Title className="text-2xl font-semibold tracking-tight">
            {title}
          </Title>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
